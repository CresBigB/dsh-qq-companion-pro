/**
 * Offline text-to-speech: the voice she speaks with (T15).
 *
 * Two engines, one CLI call per utterance:
 *
 * - `command`   — any program that takes text and writes an audio file, driven
 *                 by an argv template (`{text}` / `{output}` / `{model}` /
 *                 `{voice}` / `{lang}` are substituted before the call). What
 *                 that program does is its own business: one that calls a cloud
 *                 service sends the text off this machine.
 * - `sherpa-onnx` — `sherpa-onnx-offline-tts` plus a VITS model directory
 *                 (`model.onnx` + `tokens.txt`, optional `lexicon.txt` — the
 *                 Chinese models ship one). Fully offline, no API key, no
 *                 vendor account.
 *
 * Everything here is deliberately narrow: synthesize one string into one WAV
 * under `mediaDir`, and describe honestly why it cannot. The QQ send itself is
 * the caller's job (`qq_send_tts` → `bridge.sendSegments`), so the transport,
 * the audit log and the size caps stay in one place.
 *
 * Failures never fall back silently: a missing engine, a missing model, a
 * timeout or an empty output file all reject with a Chinese message naming the
 * problem, which the tool turns into an error the model has to relay.
 * @module dsh-qq-companion/tts
 */
import { spawn } from 'node:child_process'
import type { ChildProcessByStdio } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { accessSync, constants, readdirSync, statSync } from 'node:fs'
import { mkdir, open, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, extname, join } from 'node:path'
import type { Readable } from 'node:stream'

import { cmdCommandLine } from './stt.js'

/** Which engine turns text into audio. */
export type TtsEngine = 'command' | 'sherpa-onnx'

/** Settings of the synthesizer (a slice of the plugin config, resolved once at mount). */
export interface TtsConfig {
  /** Master switch; false = the tool is not even registered. */
  enabled: boolean
  engine: TtsEngine
  /** `command` engine: program the argv template is handed to. */
  command: string
  /** `command` engine: argv template with `{text}` / `{output}` / … placeholders. */
  args: string[]
  /** `sherpa-onnx` engine: VITS model directory (or a direct `.onnx` path). */
  model: string
  /** Voice picker: `{voice}` in the command template, `--sid` for sherpa-onnx. */
  voice: string
  /** Longest text one utterance may carry (characters); see {@link MAX_TTS_CHARS}. */
  maxChars: number
  /** Per-synthesis timeout (ms). */
  timeoutMs: number
  /** Largest audio file the transport will accept (bytes): `maxVoiceBytes`, so
   *  an over-sized WAV is caught here (before a doomed send) instead of by QQ. */
  maxBytes: number
}

/** Default `ttsMaxChars` (characters of spoken text). */
export const DEFAULT_TTS_MAX_CHARS = 200
/** Hard ceiling for `ttsMaxChars`: one QQ voice message is short, and a runaway
 *  value would hold one CLI process for minutes while producing a file the
 *  transport refuses anyway. */
export const MAX_TTS_CHARS = 1000
/** Floor for the per-synthesis timeout: a 0 (or negative) timeout would kill the
 *  engine before it can start, so a mis-set `ttsTimeoutMs` still gets one second. */
const MIN_TIMEOUT_MS = 1_000

/** Was this turn cancelled? A function (not an inline `signal.aborted` check) so
 *  one earlier check cannot narrow the type of a *later* one — the engine runs
 *  for seconds in between, and the second check is the one that matters. */
function cancelled(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
}

/** Windows batch shims (.cmd/.bat) cannot be started directly — Node refuses
 *  without a shell — so those (and only those) go through cmd.exe. Same rule as
 *  src/stt.ts, which keeps the quoting function this file reuses. */
const BATCH_PROGRAM = process.platform === 'win32' ? /\.(bat|cmd)$/i : undefined

/** One utterance's substitution values for a `command`-engine argv template. */
export interface TtsArgValues {
  text: string
  output: string
  model: string
  voice: string
  lang: string
}

/**
 * Substitute the argv template placeholders. Pure, so tests can pin the exact
 * argv a given configuration produces.
 *
 * An empty template falls back to `['{output}', '{text}']` — the argument order
 * most small TTS CLIs use (say "text into output file"). Unknown placeholders
 * are left untouched on purpose: a template that mentions `{speed}` is not an
 * error, it is just handed to the program verbatim.
 * @param template - configured arguments.
 * @param values - substitution values.
 * @returns the argv to pass.
 */
export function fillTtsArgs(template: readonly string[], values: TtsArgValues): string[] {
  const source = template.length > 0 ? template : ['{output}', '{text}']
  const table: Record<string, string> = {
    text: values.text, output: values.output, model: values.model, voice: values.voice, lang: values.lang,
  }
  // 单遍替换：要念的文字本身若带着 `{output}`（模型真会这么写），那是数据不是
  // 模板，不能被后面的占位符再展开一次、把参数里的路径塞进正文。
  return source.map(argument => argument.replace(/\{(text|output|model|voice|lang)\}/g, (_, key: string) => table[key] ?? ''))
}

/**
 * Turn a chat reply into something worth listening to.
 *
 * Markdown that reads fine on screen reads badly out loud: code fences, link
 * targets, list bullets, emphasis markers and URLs are dropped rather than
 * spelled out. Line breaks become `，` because a TTS engine given no punctuation
 * runs one sentence straight into the next.
 * @param raw - the text the model wants to speak.
 * @param maxChars - character budget for one utterance.
 * @returns the cleaned text (guaranteed non-empty and within `maxChars`).
 * @throws when nothing speakable is left, or the text is over budget (the
 *   message is meant to be shown to the caller — it says how much to cut).
 */
export function prepareTtsText(raw: string, maxChars: number): string {
  let text = raw
    .replace(/```[\s\S]*?```/g, ' ') // code blocks are not spoken
    .replace(/`([^`]*)`/g, '$1') // inline code: keep the words
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // [label](url) → label
    .replace(/https?:\/\/\S+/g, '链接') // bare URLs would be read out letter by letter
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, '') // headings
    .replace(/^[ \t]*(?:[-*+]|\d+\.)[ \t]+/gm, '') // list bullets / numbers
    .replace(/^[ \t]*>[ \t]?/gm, '') // quotes
    .replace(/(\*\*|__|\*|~~)/g, '') // emphasis markers
    .replace(/[ \t]*\n[ \t]*/g, '，') // one spoken sentence per line
    .replace(/[ \t]+/g, ' ')
    .replace(/，{2,}/g, '，')
    .replace(/^[，。！？、；：\s]+/, '')
    .replace(/[，\s]+$/, '')
    .trim()
  const budget = Math.max(1, Math.min(Math.trunc(maxChars), MAX_TTS_CHARS))
  if (text === '') throw new Error('没有可以念的内容（去掉表情、代码和链接之后是空的）')
  if ([...text].length > budget) {
    throw new Error('要念的文字太长（' + [...text].length + ' 字，上限 ' + budget + ' 字）：请精简或拆成几条短句')
  }
  return text
}

/** Windows appends PATHEXT entries to a bare command name. */
function windowsExtensions(): string[] {
  const list = (process.env.PATHEXT ?? '').split(';').map(ext => ext.trim()).filter(ext => ext !== '')
  return list.length > 0 ? list : ['.COM', '.EXE', '.BAT', '.CMD']
}

/** The file names Windows tries for `name`; an explicit extension is kept as-is. */
function windowsCandidates(name: string): string[] {
  return extname(name) !== '' ? [name] : windowsExtensions().map(ext => name + ext)
}

/** `statSync` that answers `undefined` instead of throwing (missing path, EACCES). */
function statOr(path: string) {
  try { return statSync(path) } catch { return undefined }
}

/** A regular file — not a directory, not a device, not a symlink to one of those. */
function isFile(path: string): boolean {
  return statOr(path)?.isFile() === true
}

/** A directory (`''` / missing / unreadable = false, never throws). */
function isDirectory(path: string): boolean {
  return statOr(path)?.isDirectory() === true
}

/** Windows has no x bit: a program is a regular file with a PATHEXT extension. */
function isWindowsProgram(path: string): boolean {
  const ext = extname(path).toLowerCase()
  if (ext === '' || !windowsExtensions().some(candidate => candidate.toLowerCase() === ext)) return false
  return isFile(path)
}

/** POSIX: the x bit *and* a regular file — a directory can carry x too. */
function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * Find an executable on PATH (no shell involved; same rules as src/stt.ts).
 *
 * "It exists" is not enough: the answer decides whether `qq_send_tts` is
 * registered at all, so a directory named like a program, a plain text file or
 * a non-executable file must all answer `undefined` rather than hand the tool a
 * program that can never run. On Windows that means a regular file with a
 * PATHEXT extension (an explicit path is checked by the same rule, not trusted
 * because `stat` found something); on POSIX a regular file with the x bit.
 *
 * Deliberately synchronous: the mount-time {@link Synthesizer.probe} has to know
 * the answer *before* the bridge decides which tools exist, and plugin apply is
 * synchronous. These are a handful of `stat` calls, not real I/O.
 * @param name - bare command name (looked up on PATH) or an explicit path.
 * @returns the path to spawn, or `undefined` when nothing usable is there.
 */
export function findProgram(name: string): string | undefined {
  if (process.platform === 'win32') return findProgramWin32(name)
  if (name.includes('/')) return isExecutable(name) ? name : undefined
  for (const dir of (process.env.PATH ?? '').split(':')) {
    if (dir === '') continue
    const candidate = join(dir, name)
    if (isExecutable(candidate)) return candidate
  }
  return undefined
}

/** Windows look-up: PATH is ';'-separated and a bare name gets PATHEXT
 *  extensions; an explicit path is probed exactly like a PATH hit. */
function findProgramWin32(name: string): string | undefined {
  const inPath = !name.includes('/') && !name.includes('\\')
  for (const dir of inPath ? (process.env.PATH ?? '').split(';') : ['']) {
    if (dir === '' && inPath) continue
    for (const candidate of windowsCandidates(name)) {
      const path = inPath ? join(dir, candidate) : candidate
      if (isWindowsProgram(path)) return path
    }
  }
  return undefined
}

/** `$HOME`, or `%USERPROFILE%` on Windows where HOME is usually unset. */
const homeDir = (): string => process.env.HOME ?? homedir()

/** A VITS model located on disk. */
export interface VitsModel {
  /** The `.onnx` file. */
  model: string
  /** `tokens.txt` next to it. */
  tokens: string
  /** Optional `lexicon.txt` (needed by the Chinese models). */
  lexicon?: string
}

/**
 * Locate a VITS model: `model` may be a directory (the model file and
 * `tokens.txt` inside it, or in one of its subdirectories), or the `.onnx` file
 * itself (tokens looked up beside it). Empty = the usual cache locations.
 *
 * Only a real model counts: the `.onnx` must be a regular `.onnx` file (a
 * directory, a text file or anything else that merely exists is not a model),
 * and `tokens.txt` / `lexicon.txt` must be regular files rather than
 * directories with those names. An explicit path that is unusable answers
 * `undefined` — never an exception — so {@link Synthesizer.probe} can report
 * "not ready" honestly instead of failing the mount.
 *
 * Only what sherpa actually reads is looked for. `dict/` and `espeak-ng-data/`
 * used to be passed as `--vits-dict-dir` / `--vits-data-dir`, but upstream says
 * both are ignored now (`dict_dir`: "you don't need to provide it" since
 * v1.12.15; `data_dir`: deprecated since v2.0.0, espeak-ng dropped) — passing
 * them only earns a warning on stderr, so they are not part of the model.
 */
export function findVitsModel(location: string): VitsModel | undefined {
  const roots = location !== ''
    ? [location]
    : [join(homeDir(), '.cache', 'sherpa-onnx', 'tts'), '/opt/sherpa-onnx/tts', join(homeDir(), 'sherpa-onnx', 'tts')]
  for (const root of roots) {
    const info = statOr(root)
    if (info === undefined) continue
    // 显式路径可以指目录，也可以直接指 .onnx；别的文件（比如 texts 或别的目录内容）
    // 与设备、管道一律当没找到——都交给 modelAt 自己验是不是 .onnx 普通文件。
    const found = info.isDirectory() ? modelIn(root, 1) : modelAt(root)
    if (found !== undefined) return found
  }
  return undefined
}

/** Read a model whose `.onnx` file is `onnxPath`; anything else is not a model. */
function modelAt(onnxPath: string): VitsModel | undefined {
  // sherpa 读的是这个 onnx 文件：直接路径必须是 .onnx 普通文件，同名目录 / 文本不算。
  if (extname(onnxPath).toLowerCase() !== '.onnx' || !isFile(onnxPath)) return undefined
  const dir = dirname(onnxPath)
  const tokens = join(dir, 'tokens.txt')
  if (!isFile(tokens)) return undefined
  const lexicon = join(dir, 'lexicon.txt')
  return {
    model: onnxPath,
    tokens,
    ...(isFile(lexicon) ? { lexicon } : {}),
  }
}

/** Find a model directory at `depth` levels below `dir`. */
function modelIn(dir: string, depth: number): VitsModel | undefined {
  const direct = modelAtOrTokens(dir)
  if (direct !== undefined) return direct
  if (depth <= 0) return undefined
  let entries: string[]
  try {
    entries = readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
  } catch {
    return undefined
  }
  for (const entry of entries) {
    const hit = modelIn(join(dir, entry), depth - 1)
    if (hit !== undefined) return hit
  }
  return undefined
}

/** A model directory: a `tokens.txt` file plus one of the onnx spellings sherpa ships. */
function modelAtOrTokens(dir: string): VitsModel | undefined {
  if (!isFile(join(dir, 'tokens.txt'))) return undefined
  for (const name of ['model.onnx', 'model.int8.onnx', 'model.fp16.onnx']) {
    const model = join(dir, name)
    if (isFile(model)) return modelAt(model)
  }
  return undefined
}

/**
 * The argv `sherpa-onnx-offline-tts` needs to synthesize `text` into `output`.
 *
 * Flags follow the upstream registration in
 * `sherpa-onnx/csrc/offline-tts-vits-model-config.cc` (https://github.com/k2-fsa/sherpa-onnx)
 * and the documented examples
 * (https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/vits.html): only
 * `--vits-model`, `--vits-tokens` and (when the model ships one)
 * `--vits-lexicon` are read; `--vits-data-dir` (deprecated since v2.0.0) and
 * `--vits-dict-dir` (unused since v1.12.15) are deliberately *not* passed — they
 * would only produce a warning. `--lexicon` is omitted when the directory has
 * no `lexicon.txt`, because sherpa rejects a path that does not exist.
 * Everything is one `--k=v` form (fine on every platform, no shell), and the
 * text is the one positional argument, last.
 *
 * Pure and exported so tests can pin the exact argv without a real model or a
 * real binary.
 * @param vits - the located model.
 * @param output - WAV path to write.
 * @param speaker - `--sid` value (`''` = single-speaker model, flag omitted).
 * @param text - the cleaned text to speak.
 * @returns the argv (without the program name).
 */
export function buildSherpaArgs(vits: VitsModel, output: string, speaker: string, text: string): string[] {
  return [
    '--vits-model=' + vits.model,
    '--vits-tokens=' + vits.tokens,
    ...(vits.lexicon === undefined ? [] : ['--vits-lexicon=' + vits.lexicon]),
    '--output-filename=' + output,
    ...(speaker === '' ? [] : ['--sid=' + speaker]),
    text,
  ]
}

/** What {@link verifyWav} confirmed about a produced file. */
export interface WavInfo {
  /** File size on disk (bytes). */
  bytes: number
  /** Samples per second. */
  sampleRate: number
  channels: number
  bitsPerSample: number
  /** Bytes declared by the `data` chunk. */
  dataBytes: number
}

/** Read exactly `length` bytes at `position`; short reads are the caller's problem. */
async function readAt(handle: Awaited<ReturnType<typeof open>>, length: number, position: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length)
  const { bytesRead } = await handle.read(buffer, 0, length, position)
  return buffer.subarray(0, bytesRead)
}

/** `'RIFF'` + 声明长度 + `'WAVE'`. */
const RIFF_HEADER_BYTES = 12
/** 纯 PCM 的 `fmt ` 体：格式码 / 声道 / 采样率 / 字节率 / 块对齐 / 位深。 */
const FMT_PCM_BYTES = 16
/** WAVE_FORMAT_EXTENSIBLE 的 `fmt ` 体：16 + cbSize + 有效位 + 声道掩码 + 子格式 GUID。 */
const FMT_EXTENSIBLE_BYTES = 40
/** EXTENSIBLE 在 cbSize 里声明的最小扩展长度（22 = 上面那 40 字节里除头 18 字节外的部分）。 */
const EXTENSIBLE_CB_SIZE = 22
/** KSDATAFORMAT_SUBTYPE_PCM：EXTENSIBLE 里唯一能当 PCM 用的子格式。 */
const PCM_SUBFORMAT = Buffer.from('0100000000001000800000aa00389b71', 'hex')
/** 一次校验最多走多少个 chunk：一堆零长 chunk 的恶意文件不能把事件循环占住。 */
const MAX_WAV_CHUNKS = 64

/**
 * Check that a file really is a non-empty PCM WAV of an acceptable size.
 *
 * "The program exited 0" is not evidence of usable audio: a stand-in script, a
 * confused argument order or a truncated write all leave a file behind. So the
 * header is parsed (RIFF/WAVE, a PCM `fmt ` that is complete enough for its own
 * format tag, a `data` chunk that is neither empty nor cut short) and the size
 * is checked against the transport's cap *before* the file is handed to QQ.
 *
 * Two things are treated as lies rather than details: the RIFF-declared length
 * (every chunk — and every byte accessed — has to fall inside it, so a file
 * that claims more than it holds is truncation, not a quirk) and the fmt
 * numbers (`blockAlign` / `byteRate` must agree with channels / rate / depth,
 * and `data` must be a whole number of frames). An `EXTENSIBLE` fmt is only
 * accepted when its header is actually there (`size` and `cbSize` large enough)
 * and its SubFormat GUID is PCM.
 *
 * Only the chunk headers are read — a few dozen bytes — so this stays cheap
 * even for a long utterance, and the chunk walk is bounded so a hostile file
 * full of empty chunks cannot spin the event loop.
 * @param path - the produced file.
 * @param maxBytes - the transport's voice-size cap (bytes).
 * @returns what the header says.
 * @throws with a Chinese message naming what is wrong with the file.
 */
export async function verifyWav(path: string, maxBytes: number): Promise<WavInfo> {
  const info = await stat(path).catch(() => undefined)
  if (info === undefined || !info.isFile()) throw new Error('合成引擎没有写出音频文件：' + path)
  if (info.size === 0) throw new Error('合成的音频是空文件（引擎没写出声音）：' + path)
  const cap = Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : Number.POSITIVE_INFINITY
  if (info.size > cap) {
    throw new Error('合成的音频有 ' + info.size + ' 字节，超过发送上限 ' + cap + ' 字节：这条语音发不出去（缩短文字或换更小的模型）')
  }
  const handle = await open(path, 'r')
  try {
    const riff = await readAt(handle, RIFF_HEADER_BYTES, 0)
    if (riff.length < RIFF_HEADER_BYTES || riff.toString('latin1', 0, 4) !== 'RIFF' || riff.toString('latin1', 8, 12) !== 'WAVE') {
      throw new Error('合成的音频不是 WAV（文件头不对）：引擎的参数可能填错了，检查 ttsArgs 里的 {output} / {text} 顺序')
    }
    // RIFF 头声明的边界就是可信范围的终点：声明比文件大 = 截断，一个字节都不再往外读。
    const riffEnd = 8 + riff.readUInt32LE(4)
    if (riffEnd < RIFF_HEADER_BYTES) throw new Error('合成的音频是坏的：RIFF 头声明的长度 ' + Math.max(0, riffEnd - 8) + ' 字节连文件头都装不下')
    if (riffEnd > info.size) {
      throw new Error('合成的音频被截断了（RIFF 头声明 ' + riffEnd + ' 字节，文件只有 ' + info.size + ' 字节）')
    }
    let position = RIFF_HEADER_BYTES
    let fmt: { channels: number; sampleRate: number; bitsPerSample: number; blockAlign: number; byteRate: number } | undefined
    let dataBytes: number | undefined
    let chunks = 0
    // Chunk headers only; chunk *bodies* are skipped by their declared length.
    while (position + 8 <= riffEnd) {
      chunks += 1
      if (chunks > MAX_WAV_CHUNKS) {
        throw new Error('合成的音频是坏的：chunk 数量超过 ' + MAX_WAV_CHUNKS + ' 个（正常 WAV 不会有这么多）')
      }
      const header = await readAt(handle, 8, position)
      if (header.length < 8) break
      const id = header.toString('latin1', 0, 4)
      const size = header.readUInt32LE(4)
      const body = position + 8
      // 任何要访问的块都必须落在 RIFF 声明的范围内：越界 = 坏文件 / 被截断。
      if (body + size > riffEnd) {
        throw new Error('合成的音频是坏的：' + id.trim() + ' 块声明 ' + size + ' 字节，超出 RIFF 声明的范围（那里只剩 ' + Math.max(0, riffEnd - body) + ' 字节）')
      }
      if (id === 'fmt ') {
        if (size < FMT_PCM_BYTES) {
          throw new Error('合成的音频是坏的：fmt 块只有 ' + size + ' 字节，PCM 头至少要 ' + FMT_PCM_BYTES + ' 字节')
        }
        const raw = await readAt(handle, Math.min(size, FMT_EXTENSIBLE_BYTES), body)
        if (raw.length < FMT_PCM_BYTES) throw new Error('合成的音频是坏的：fmt 块不完整')
        const format = raw.readUInt16LE(0)
        // 1 = PCM, 0xFFFE = WAVE_FORMAT_EXTENSIBLE (piper 等模型会这么写)。
        if (format !== 1 && format !== 0xFFFE) throw new Error('合成的音频不是 PCM WAV（格式码 ' + format + '）：QQ 语音只认 PCM')
        if (format === 0xFFFE) {
          if (size < FMT_EXTENSIBLE_BYTES || raw.length < FMT_EXTENSIBLE_BYTES) {
            throw new Error('合成的音频是坏的：EXTENSIBLE 的 fmt 块只有 ' + size + ' 字节，读不满 ' + FMT_EXTENSIBLE_BYTES + ' 字节的扩展头')
          }
          const cbSize = raw.readUInt16LE(16)
          if (cbSize < EXTENSIBLE_CB_SIZE) {
            throw new Error('合成的音频是坏的：EXTENSIBLE 的 cbSize 只声明 ' + cbSize + ' 字节，扩展头至少要 ' + EXTENSIBLE_CB_SIZE + ' 字节')
          }
          if (!raw.subarray(24, 40).equals(PCM_SUBFORMAT)) {
            throw new Error('合成的音频不是 PCM WAV（EXTENSIBLE 的子格式不是 PCM）：QQ 语音只认 PCM')
          }
        }
        fmt = {
          channels: raw.readUInt16LE(2),
          sampleRate: raw.readUInt32LE(4),
          byteRate: raw.readUInt32LE(8),
          blockAlign: raw.readUInt16LE(12),
          bitsPerSample: raw.readUInt16LE(14),
        }
      } else if (id === 'data') {
        if (size === 0) throw new Error('合成的音频没有声音数据（data 块是空的）：引擎提前退出了')
        dataBytes = size
      }
      position = body + size + (size % 2)
    }
    if (fmt === undefined) throw new Error('合成的音频是坏的：没有 fmt 块')
    if (dataBytes === undefined) throw new Error('合成的音频是坏的：没有 data 块')
    if (fmt.channels < 1 || fmt.sampleRate < 1 || fmt.bitsPerSample < 1) {
      throw new Error('合成的音频参数不对（声道 / 采样率 / 位深为 0）：引擎没配好')
    }
    if (fmt.bitsPerSample % 8 !== 0) {
      throw new Error('合成的音频参数不对（位深 ' + fmt.bitsPerSample + ' 位不是整字节）：QQ 语音只认 PCM')
    }
    // blockAlign = 一帧的字节数（声道 × 位深 / 8），byteRate = 每秒字节数：
    // 这几个数互相对不上就是坏头，或者引擎写了个 QQ 不认的格式。
    const frameBytes = (fmt.bitsPerSample / 8) * fmt.channels
    if (fmt.blockAlign < 1 || fmt.blockAlign !== frameBytes) {
      throw new Error('合成的音频参数不对（块对齐 ' + fmt.blockAlign + ' 与 ' + fmt.channels + ' 声道 / ' + fmt.bitsPerSample + ' 位不符）：引擎没配好')
    }
    if (fmt.byteRate < 1 || fmt.byteRate !== fmt.sampleRate * fmt.blockAlign) {
      throw new Error('合成的音频参数不对（字节率 ' + fmt.byteRate + ' 与采样率 × 块对齐不符）：引擎没配好')
    }
    if (dataBytes % fmt.blockAlign !== 0) {
      throw new Error('合成的音频被截断了（data 块 ' + dataBytes + ' 字节不是整帧 ' + fmt.blockAlign + ' 字节的倍数）')
    }
    return { bytes: info.size, sampleRate: fmt.sampleRate, channels: fmt.channels, bitsPerSample: fmt.bitsPerSample, dataBytes }
  } finally {
    await handle.close().catch(() => {})
  }
}

type Resolved =
  | { engine: 'command'; program: string }
  | { engine: 'sherpa-onnx'; program: string; vits: VitsModel }

/** What the tool gets back after a successful synthesis. */
export interface SynthesizeResult {
  /** Absolute path of the WAV under `mediaDir`. */
  path: string
  /** Engine that produced it. */
  engine: TtsEngine
  /** File size (bytes). */
  bytes: number
  /** Wall-clock duration of the CLI call (ms). */
  ms: number
  /** Spoken characters (after cleaning). */
  chars: number
}

/**
 * The synthesizer: one CLI process per utterance, one WAV per utterance.
 *
 * Output files are named `tts_<id>.wav` directly under `mediaDir` so the
 * existing temporary-media cleanup (`MediaStore.cleanupExpired`, which sweeps
 * the `media_*` / `stt_*` / `tts_*` prefixes) reaps them on the usual TTL —
 * nothing here has to remember to delete anything.
 */
export class Synthesizer {
  private readonly config: TtsConfig
  private readonly dir: string
  private resolved: Resolved | undefined
  private lastDetail: string | undefined
  /** Result of the most recent {@link probe}; `undefined` = never probed. */
  private probeState: { ready: boolean; detail: string } | undefined

  constructor(config: TtsConfig, mediaDir: string) {
    this.config = config
    this.dir = mediaDir
  }

  /** Master switch (the tool is registered only when this is true). */
  get enabled(): boolean {
    return this.config.enabled
  }

  /**
   * Enabled *and* actually usable: the engine plus — for `command` — the
   * program, and — for `sherpa-onnx` — the binary *and* a VITS model were all
   * found by the last {@link probe}.
   *
   * This is deliberately a fact, not a guess. Knowing whether a program is on
   * PATH or a model directory holds `tokens.txt` means touching the disk, and a
   * getter cannot wait for that, so {@link probe} is run once at mount (see
   * `src/index.ts`) and this getter reports what it found. Capability
   * resolution and tool registration key off it, so a half-filled or
   * unsatisfiable configuration leaves the model with no `qq_send_tts` at all
   * instead of a tool that fails on every call. Not yet probed = not ready.
   */
  get ready(): boolean {
    return this.probeState?.ready === true
  }

  /**
   * Look for the engine once and remember the answer; also why it is *not*
   * usable, which `/doctor` shows instead of a cheerful "sherpa-onnx".
   *
   * Never throws: a failed probe is an answer, not an error. A failure is not
   * cached by {@link resolve}, so a probe after installing the missing piece
   * succeeds without a restart.
   *
   * Synchronous on purpose: plugin apply is sync, and the answer has to be in
   * hand before the bridge works out which tools a chat gets. The work is a
   * handful of `stat` calls — cheap enough to do inline.
   * @returns whether the synthesizer can synthesize.
   */
  probe(): boolean {
    if (!this.config.enabled) {
      this.probeState = { ready: false, detail: '关闭' }
      return false
    }
    try {
      const engine = this.resolve()
      const detail = engine.engine === 'command'
        ? '命令可用：' + engine.program
        : '模型可用：' + engine.vits.model
      this.probeState = { ready: true, detail }
      this.lastDetail = engine.engine + ' 可用（' + engine.program + '）'
      return true
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      this.probeState = { ready: false, detail }
      this.lastDetail = undefined
      return false
    }
  }

  /** Configured text budget for one utterance. */
  get maxChars(): number {
    return Math.min(Math.max(1, Math.trunc(this.config.maxChars)), MAX_TTS_CHARS)
  }

  /** Transport cap on the produced file (bytes); non-positive = no cap. */
  get maxBytes(): number {
    return Number.isFinite(this.config.maxBytes) && this.config.maxBytes > 0
      ? this.config.maxBytes
      : Number.POSITIVE_INFINITY
  }

  /**
   * One `/doctor` line, synchronously: what the engine is, whether the last
   * {@link probe} found it, and — when it did not — why not. Never throws,
   * never starts a process (a status line must stay cheap).
   */
  status(): { enabled: boolean; engine: TtsEngine; ready: boolean; detail: string } {
    if (!this.config.enabled) return { enabled: false, engine: this.config.engine, ready: false, detail: '关闭' }
    const detail = this.probeState?.detail ?? this.lastDetail ?? (this.config.engine === 'command'
      ? (this.config.command !== '' ? '命令：' + this.config.command : '还没配置 ttsCommand')
      : (this.config.model !== '' ? '模型：' + this.config.model : '模型用默认位置'))
    return { enabled: true, engine: this.config.engine, ready: this.ready, detail }
  }

  /**
   * Synthesize one utterance.
   * @param raw - the text to speak (cleaned by {@link prepareTtsText}).
   * @param options - `signal` aborts the CLI call (the tool passes the turn's).
   * @returns the produced file.
   * @throws with a Chinese message naming the problem; no file is left behind.
   */
  async synthesize(raw: string, options?: { signal?: AbortSignal }): Promise<SynthesizeResult> {
    if (!this.config.enabled) throw new Error('语音合成没有开启（ttsEnabled = false），这条语音没发出去')
    // 抓住 signal 本身：后面用函数问「取消了吗」，别让类型收窄把第二次检查当成废话。
    const signal = options?.signal
    if (cancelled(signal)) throw new Error('语音合成已取消（这一回合结束了）')
    const text = prepareTtsText(raw, this.maxChars)
    const engine = this.resolve()
    await mkdir(this.dir, { recursive: true })
    // A full UUID: two utterances started in the same millisecond must never
    // share a path (an 8-character slice could collide, and a collision means
    // one voice message sends the other's audio).
    const output = join(this.dir, 'tts_' + randomUUID() + '.wav')
    const started = Date.now()
    try {
      await this.runEngine(engine, text, output, signal)
      // The turn may have been cancelled while the engine ran: sending now
      // would answer into a conversation nobody is waiting in.
      if (cancelled(signal)) throw new Error('语音合成已取消（这一回合结束了）')
      const info = await verifyWav(output, this.maxBytes)
      this.probeState = { ready: true, detail: engine.engine === 'command'
        ? '命令可用：' + engine.program
        : '模型可用：' + engine.vits.model }
      this.lastDetail = engine.engine + ' 可用（' + engine.program + '）'
      return { path: output, engine: engine.engine, bytes: info.bytes, ms: Date.now() - started, chars: [...text].length }
    } catch (error) {
      // A half-written file is useless and would linger until the TTL sweep.
      await rm(output, { force: true }).catch(() => {})
      throw error
    }
  }

  /** Resolve the engine once; failures are not cached, so a missing program
   *  installed later is picked up without a restart. */
  private resolve(): Resolved {
    this.resolved ??= this.resolveNow()
    return this.resolved
  }

  private resolveNow(): Resolved {
    if (this.config.engine === 'command') {
      if (this.config.command.trim() === '') {
        throw new Error('语音合成引擎是「自定义命令」，但 ttsCommand 没填：这条语音发不出去')
      }
      const program = findProgram(this.config.command)
      if (program === undefined) throw new Error('找不到 ttsCommand 指定的程序：' + this.config.command)
      return { engine: 'command', program }
    }
    const program = findProgram('sherpa-onnx-offline-tts')
    if (program === undefined) {
      throw new Error('找不到 sherpa-onnx-offline-tts（装上 sherpa-onnx 并把它放进 PATH，或改用 ttsEngine = command）')
    }
    const vits = findVitsModel(this.config.model.trim())
    if (vits === undefined) {
      throw new Error('找不到 VITS 语音模型（目录里需要 tokens.txt 和 model.onnx）：' + (this.config.model !== '' ? this.config.model : '默认位置'))
    }
    return { engine: 'sherpa-onnx', program, vits }
  }

  private async runEngine(engine: Resolved, text: string, output: string, signal?: AbortSignal): Promise<void> {
    const timeoutMs = Math.max(MIN_TIMEOUT_MS, Math.trunc(this.config.timeoutMs))
    const voice = this.config.voice.trim()
    if (engine.engine === 'command') {
      const argv = fillTtsArgs(this.config.args, {
        text,
        output,
        model: this.config.model,
        voice,
        lang: 'zh',
      })
      await runProcess(engine.program, argv, timeoutMs, signal)
      return
    }
    const { vits } = engine
    const speaker = /^\d+$/.test(voice) ? voice : ''
    await runProcess(engine.program, buildSherpaArgs(vits, output, speaker, text), timeoutMs, signal)
  }
}

/** spawn() with Windows batch files routed through cmd.exe /d /s /c. */
function spawnProgram(program: string, args: readonly string[]): ChildProcessByStdio<null, Readable, Readable> {
  const stdio: ['ignore', 'pipe', 'pipe'] = ['ignore', 'pipe', 'pipe']
  if (BATCH_PROGRAM !== undefined && BATCH_PROGRAM.test(program)) {
    const comspec = process.env.ComSpec ?? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe')
    return spawn(comspec, ['/d', '/s', '/c', '"' + cmdCommandLine(program, args) + '"'], {
      stdio,
      windowsVerbatimArguments: true,
    })
  }
  return spawn(program, [...args], { stdio })
}

/** How long a stopped engine gets to actually exit before the caller is
 *  released anyway: a wedged process must not hang the turn forever. */
const KILL_GRACE_MS = 5_000

/**
 * Stop a synthesizer process *and everything it started*.
 *
 * On Windows a bare `child.kill()` only reaches the direct child, so a batch
 * shim (cmd.exe) would die while the real engine keeps writing into the very
 * WAV we are about to delete — `taskkill /T /F` takes the whole tree. Elsewhere
 * the child we spawned is the process itself.
 */
function terminateTree(child: ChildProcessByStdio<null, Readable, Readable>): void {
  const pid = child.pid
  if (process.platform !== 'win32' || pid === undefined) {
    child.kill('SIGKILL')
    return
  }
  try {
    // argv array, not a shell string: a taskkill path with spaces stays intact.
    const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    killer.on('error', () => child.kill('SIGKILL'))
  } catch {
    child.kill('SIGKILL')
  }
}

/**
 * Run one TTS program to completion.
 *
 * Unlike `stt.ts`'s runner this one also honours an abort signal — the tool
 * hands over the turn's `signal`, and a cancelled turn must not keep a CLI
 * process (or a half-written WAV) alive.
 *
 * Cancellation, timeout and a non-zero exit all converge on the same path:
 * stop the process tree, then wait for its `close` before settling. Settling
 * early would let the caller delete the output file while the engine is still
 * writing it (leaving a stray WAV that the TTL sweep never sees), or report
 * "cancelled" for a process that is in fact still running. `signal` is
 * optional so tests and callers without a turn context can run it directly.
 * @throws a Chinese message on timeout, abort, or a non-zero exit.
 */
export function runProcess(program: string, args: readonly string[], timeoutMs: number, signal?: AbortSignal): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new Error('语音合成已取消（这一回合结束了）'))
      return
    }
    let child: ChildProcessByStdio<null, Readable, Readable>
    try {
      child = spawnProgram(program, args)
    } catch (error) {
      // cmdCommandLine refused an argument it cannot quote safely.
      reject(error)
      return
    }
    let stdout = ''
    let stderr = ''
    let done = false
    /** Set once, right before the kill: why we are stopping the process. */
    let stopping: Error | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let grace: ReturnType<typeof setTimeout> | undefined
    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer)
      if (grace !== undefined) clearTimeout(grace)
      signal?.removeEventListener('abort', onAbort)
    }
    const finish = (error?: Error): void => {
      if (done) return
      done = true
      cleanup()
      if (error !== undefined) reject(error)
      else resolve({ stdout, stderr })
    }
    /** Stop the tree; the `close` handler (or the grace timer) settles. */
    const stop = (reason: Error): void => {
      if (done || stopping !== undefined) return
      stopping = reason
      if (timer !== undefined) clearTimeout(timer)
      terminateTree(child)
      grace = setTimeout(() => finish(reason), KILL_GRACE_MS)
    }
    const onAbort = (): void => stop(new Error('语音合成已取消（这一回合结束了）'))
    timer = setTimeout(() => stop(new Error('语音合成超时（' + Math.round(timeoutMs / 1000) + ' 秒）：' + program)), timeoutMs)
    signal?.addEventListener('abort', onAbort, { once: true })
    child.stdout.on('data', chunk => { if (stdout.length < 1_000_000) stdout += String(chunk) })
    child.stderr.on('data', chunk => { if (stderr.length < 1_000_000) stderr += String(chunk) })
    // A spawn failure still emits `close`, so the stop path stays uniform.
    child.on('error', error => { if (stopping === undefined) finish(error) })
    child.on('close', code => {
      if (stopping !== undefined) {
        finish(stopping)
        return
      }
      finish(code === 0
        ? undefined
        : new Error(program + ' 退出码 ' + code + '：' + stderr.trim().slice(-500)))
    })
  })
}