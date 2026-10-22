/**
 * Voice transcription with fake ffmpeg / engine programs on PATH (no real
 * models needed): engine selection, output parsing and cleanup, limits,
 * SILK detection, timeouts, the queue cap and temp-dir cleanup. Every stub is
 * written twice — a sh script on POSIX, a .cmd shim that runs the same logic
 * through node on Windows, where PATH look-up is PATHEXT-driven and a .sh file
 * cannot be executed — so both platforms exercise the same behaviour.
 * @module dsh-qq-companion/tests/stt
 */
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { recordResult } from '../src/inbound.js'
import { MAX_QUEUE, Transcriber, applyReplacements, cleanTranscript, cmdCommandLine, parseSherpaOutput, runProcess, transcriptLabel, type SttConfig } from '../src/stt.js'

const WINDOWS = process.platform === 'win32'

afterEach(() => { vi.unstubAllEnvs() })

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))

/** Write one fake program: `sh` runs on POSIX, `js` (same stdout / exit code /
 * hang) through node on Windows. */
async function program(dir: string, name: string, sh: string, js: string): Promise<void> {
  if (!WINDOWS) {
    await writeFile(join(dir, name), '#!/bin/sh\n' + sh + '\n')
    await chmod(join(dir, name), 0o755)
    return
  }
  await writeFile(join(dir, name + '.cmd'), '@echo off\r\n"' + process.execPath + '" "%~dp0' + name + '.mjs" %*\r\n')
  await writeFile(join(dir, name + '.mjs'), js + '\n')
}

const FFMPEG_SH = 'in=""; prev=""; for a in "$@"; do [ "$prev" = "-i" ] && in="$a"; prev="$a"; last="$a"; done; cp "$in" "$last"'
const FFMPEG_JS = [
  "import { copyFileSync } from 'node:fs'",
  'const args = process.argv.slice(2)',
  "const at = args.indexOf('-i')",
  'const input = at >= 0 ? args[at + 1] : args[args.length - 1]',
  'copyFileSync(input, args[args.length - 1])',
].join('\n')

/** A PATH with a fake ffmpeg (copies input → the last argument). */
async function fakeTools(extra: Record<string, readonly [string, string]> = {}): Promise<string> {
  const bin = tmp('stt-bin-')
  await program(bin, 'ffmpeg', FFMPEG_SH, FFMPEG_JS)
  for (const [name, body] of Object.entries(extra)) await program(bin, name, body[0], body[1])
  vi.stubEnv('PATH', WINDOWS ? bin : bin + ':/usr/bin:/bin')
  vi.stubEnv('HOME', tmp('stt-home-'))
  return bin
}

function voice(content = 'ID3 fake mp3 bytes'): string {
  const dir = tmp('stt-media-')
  const file = join(dir, 'media_1.mp3')
  writeFileSync(file, content)
  return file
}

const base: SttConfig = { enabled: true, engine: 'auto', command: '', args: [], model: '', language: 'zh', timeoutMs: 5_000, maxSeconds: 60 }

describe('engines', () => {
  it('the fix-up table corrects the transcript before she sees it', async () => {
    await fakeTools({
      'sherpa-onnx-offline': [
        'echo "{\\"text\\": \\"<|zh|>大飞鱼你在做什么\\"}"',
        "console.log('{\"text\": \"<|zh|>大飞鱼你在做什么\"}')",
      ],
    })
    const dir = tmp('stt-sv-')
    writeFileSync(join(dir, 'tokens.txt'), 'x')
    writeFileSync(join(dir, 'model.int8.onnx'), 'x')
    const t = new Transcriber({ ...base, engine: 'sherpa-onnx', model: dir, replacements: { 大飞鱼: '大肥鱼' } })
    expect(await t.transcribe(voice())).toBe('大肥鱼你在做什么')
  })

  it('whisper-cpp: runs whisper-cli with the model and language, and cleans the output', async () => {
    await fakeTools({
      'whisper-cli': [
        'echo "  今天吃什么 [BLANK_AUDIO] "; echo "$@" > "$(dirname "$0")/args"',
        [
          "import { writeFileSync } from 'node:fs'",
          "import { dirname, join } from 'node:path'",
          "import { fileURLToPath } from 'node:url'",
          "console.log('  今天吃什么 [BLANK_AUDIO] ')",
          "writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'args'), process.argv.slice(2).join(' ') + '\\n')",
        ].join('\n'),
      ],
    })
    const model = join(tmp('stt-model-'), 'ggml-small.bin')
    writeFileSync(model, 'x')
    const t = new Transcriber({ ...base, engine: 'whisper-cpp', model })
    expect(await t.transcribe(voice())).toBe('今天吃什么')
    expect(await t.engineDescription()).toContain('whisper-cpp')
  })

  it('sherpa-onnx: finds the SenseVoice model dir and parses the JSON result line', async () => {
    await fakeTools({
      'sherpa-onnx-offline': [
        'echo "loading model" >&2; echo "{\\"lang\\": \\"<|zh|>\\", \\"text\\": \\"<|zh|><|NEUTRAL|><|Speech|>主人早上好\\"}" >&2',
        [
          "console.error('loading model')",
          "console.error('{\"lang\": \"<|zh|>\", \"text\": \"<|zh|><|NEUTRAL|><|Speech|>主人早上好\"}')",
        ].join('\n'),
      ],
    })
    const dir = tmp('stt-sv-')
    writeFileSync(join(dir, 'tokens.txt'), 'x')
    writeFileSync(join(dir, 'model.int8.onnx'), 'x')
    const t = new Transcriber({ ...base, engine: 'sherpa-onnx', model: dir })
    expect(await t.transcribe(voice())).toBe('主人早上好')
  })

  it('auto prefers sherpa-onnx with a model in the default place, else whisper-cpp', async () => {
    const bin = await fakeTools({
      'whisper-cli': ['echo whisper', "console.log('whisper')"],
      'sherpa-onnx-offline': ['echo "{\\"text\\": \\"sense\\"}"', "console.log('{\"text\": \"sense\"}')"],
    })
    const home = process.env.HOME!
    expect(await new Transcriber({ ...base, model: '' }).transcribe(voice()).catch(e => String(e))).toMatch(/没有可用的语音识别引擎/)
    await mkdir(join(home, '.cache', 'whisper.cpp'), { recursive: true })
    writeFileSync(join(home, '.cache', 'whisper.cpp', 'ggml-small.bin'), 'x')
    expect(await new Transcriber({ ...base }).transcribe(voice())).toBe('whisper')
    const sv = join(home, '.cache', 'sherpa-onnx', 'sense-voice')
    await mkdir(sv, { recursive: true })
    writeFileSync(join(sv, 'tokens.txt'), 'x')
    writeFileSync(join(sv, 'model.onnx'), 'x')
    expect(await new Transcriber({ ...base }).transcribe(voice())).toBe('sense')
    expect(bin).toBeTruthy()
  })

  it('command: substitutes the template and reads stdout; the old name "custom" still works', async () => {
    await fakeTools({
      'my-asr': [
        'echo "lang=$1 wav=$(basename "$2")"',
        [
          "import { basename } from 'node:path'",
          'const args = process.argv.slice(2)',
          "console.log('lang=' + args[0] + ' wav=' + basename(args[1] ?? ''))",
        ].join('\n'),
      ],
    })
    const t = new Transcriber({ ...base, engine: 'custom', command: 'my-asr', args: ['{lang}', '{wav}'] })
    expect(await t.transcribe(voice())).toBe('lang=zh wav=audio.wav')
  })
})

describe('limits and failures', () => {
  it('refuses SILK files with a clear reason, and an empty file transcribes to nothing', async () => {
    await fakeTools({ 'whisper-cli': ['echo x', "console.log('x')"] })
    const t = new Transcriber({ ...base, engine: 'command', command: 'whisper-cli' })
    await expect(t.transcribe(voice('\u0002#!SILK_V3 raw'))).rejects.toThrow(/SILK/)
    expect(await t.transcribe(voice(''))).toBe('')
  })

  it('times out a hanging engine and always removes its temp dir', async () => {
    await fakeTools({ 'slow-asr': ['sleep 5', 'setTimeout(() => {}, 5000)'] })
    const file = voice()
    const t = new Transcriber({ ...base, engine: 'command', command: 'slow-asr', timeoutMs: 300 })
    await expect(t.transcribe(file)).rejects.toThrow(/超时/)
    expect(readdirSync(join(file, '..')).filter(n => n.startsWith('stt_'))).toEqual([])
  })

  it('runs one at a time and refuses beyond the queue cap', async () => {
    await fakeTools({ 'asr': ['sleep 0.2; echo ok', "setTimeout(() => { console.log('ok') }, 200)"] })
    const t = new Transcriber({ ...base, engine: 'command', command: 'asr' })
    const runs = Array.from({ length: MAX_QUEUE + 2 }, () => t.transcribe(voice()).catch(e => String(e)))
    const results = await Promise.all(runs)
    expect(results.filter(r => r === 'ok')).toHaveLength(MAX_QUEUE)
    expect(results.filter(r => /排队已满/.test(r))).toHaveLength(2)
  })

  it('a missing ffmpeg or program is a clear error', async () => {
    vi.stubEnv('PATH', tmp('stt-empty-'))
    await expect(new Transcriber({ ...base, engine: 'command', command: 'nope' }).transcribe(voice())).rejects.toThrow(/ffmpeg/)
  })
})

describe('output handling', () => {
  it('cleanTranscript drops engine tags, noise markers and invented subtitle credits; caps length', () => {
    expect(cleanTranscript('<|zh|><|HAPPY|>你好呀')).toBe('你好呀')
    expect(cleanTranscript('[BLANK_AUDIO]')).toBe('')
    expect(cleanTranscript('请不吝点赞 订阅 转发 打赏支持明镜与点点栏目')).toBe('')
    expect(cleanTranscript('明天见 字幕由 Amara.org 社区提供')).toBe('明天见')
    expect(cleanTranscript('谢谢。')).toBe('')
    expect(Array.from(cleanTranscript('字'.repeat(600)))).toHaveLength(501)
    expect(transcriptLabel('')).toBe('')
    expect(transcriptLabel('好')).toBe('（语音转写：好）')
  })

  it('parseSherpaOutput takes the last JSON line with text', () => {
    expect(parseSherpaOutput('noise\n/tmp/a.wav\n{"lang":"<|zh|>","text":"测试"}\n')).toBe('测试')
    expect(parseSherpaOutput('no json here')).toBe('')
  })

  it('recordResult understands NapCat answers: base64, URL, absolute path', () => {
    expect(recordResult({ base64: 'QUJD' })).toEqual({ url: undefined, file: 'base64://QUJD' })
    expect(recordResult({ url: 'https://x.y/a.mp3' })).toEqual({ url: 'https://x.y/a.mp3' })
    expect(recordResult({ file: '/home/napcat/cache/a.mp3' })).toEqual({ url: undefined, file: 'file:///home/napcat/cache/a.mp3' })
    expect(recordResult({ file: 'hash-only' })).toBeUndefined()
    expect(recordResult(undefined)).toBeUndefined()
  })
})

describe('applyReplacements', () => {
  it('replaces every occurrence, longer keys first, in a single pass', () => {
    expect(applyReplacements('大飞鱼大飞鱼', { 大飞鱼: '大肥鱼' })).toBe('大肥鱼大肥鱼')
    expect(applyReplacements('小大飞鱼呀', { 大飞鱼: '大肥鱼', 小大飞鱼: '小肥鱼' })).toBe('小肥鱼呀')
    // a replacement is never fed back in (飞→肥, 肥→胖 does not chain)
    expect(applyReplacements('飞', { 飞: '肥', 肥: '胖' })).toBe('肥')
  })

  it('treats keys literally and ignores empty keys or a missing table', () => {
    expect(applyReplacements('a.b a*b', { 'a.b': 'x' })).toBe('x a*b')
    expect(applyReplacements('abc', { '': 'x' })).toBe('abc')
    expect(applyReplacements('abc', undefined)).toBe('abc')
    expect(applyReplacements('abc', {})).toBe('abc')
  })
})

/** A .cmd shim that hands its arguments to node untouched, so the argv node
 * sees is exactly what cmd.exe made of the command line. */
async function echoArgsCmd(dir: string): Promise<string> {
  const file = join(dir, 'echo-args.cmd')
  await writeFile(file, '@echo off\r\n"' + process.execPath + '" "%~dp0echo-args.mjs" %*\r\n')
  await writeFile(join(dir, 'echo-args.mjs'), 'console.log(JSON.stringify(process.argv.slice(2)))\n')
  return file
}

describe('cmd.exe command line', () => {
  /** The refusal message (fails when nothing was thrown). */
  const refusal = (run: () => string): string => {
    let message = ''
    try { run() } catch (error) { message = error instanceof Error ? error.message : String(error) }
    expect(message).not.toBe('')
    return message
  }

  it('wraps the program and every argument in double quotes, separators and all', () => {
    // Nothing is ever left bare — not a harmless word, not an empty string.
    expect(cmdCommandLine('C:\\Tools\\asr.exe', [])).toBe('"C:\\Tools\\asr.exe"')
    expect(cmdCommandLine('asr.cmd', ['plain'])).toBe('"asr.cmd" "plain"')
    expect(cmdCommandLine('asr.cmd', [''])).toBe('"asr.cmd" ""')
    expect(cmdCommandLine('asr.cmd', ['a b'])).toBe('"asr.cmd" "a b"')
    // Inside quotes cmd reads these as text, so they are passed through as-is
    // (backslash escaping them for the C runtime would put & back outside).
    expect(cmdCommandLine('asr.cmd', ['&', '|', '<', '>', '^', '(', ')'])).toBe('"asr.cmd" "&" "|" "<" ">" "^" "(" ")"')
    expect(cmdCommandLine('asr.cmd', ['a&b|c<d>e^f(g)h'])).toBe('"asr.cmd" "a&b|c<d>e^f(g)h"')
    expect(cmdCommandLine('C:\\a b\\asr.cmd', ['C:\\a b\\x&y (1).wav', '{lang}']))
      .toBe('"C:\\a b\\asr.cmd" "C:\\a b\\x&y (1).wav" "{lang}"')
  })

  it('refuses what quoting cannot tame: " % ! and line breaks', () => {
    for (const bad of ['"', 'a"b', '50%', 'a!b', 'a\nb', 'a\rb']) {
      const message = refusal(() => cmdCommandLine('asr.cmd', [bad]))
      expect(message).toContain(bad)
      expect(message).toMatch(/不能含有 " % ! 或换行/)
    }
    // The program is quoted the same way and refused the same way.
    expect(refusal(() => cmdCommandLine('C:\\tools\\a%b.cmd', []))).toContain('C:\\tools\\a%b.cmd')
    expect(refusal(() => cmdCommandLine('C:\\my"tools\\asr.cmd', []))).toContain('C:\\my"tools\\asr.cmd')
  })

  it.runIf(WINDOWS)('a .cmd shim gets such an argument back verbatim, nothing outside the quotes runs', async () => {
    const dir = join(tmp('stt-cmd-'), 'a b')
    await mkdir(dir, { recursive: true })
    const args = ['C:\\a b\\x&y (1).wav', '-t 2', 'plain', '']
    const { stdout, stderr } = await runProcess(await echoArgsCmd(dir), args, 20_000)
    expect(JSON.parse(stdout.trim())).toEqual(args)
    expect(stderr.trim()).toBe('')
  })

  it.runIf(WINDOWS)('runProcess rejects instead of letting cmd run the rest of a quote', async () => {
    const dir = join(tmp('stt-cmd-'), 'a b')
    await mkdir(dir, { recursive: true })
    await expect(runProcess(await echoArgsCmd(dir), ['C:\\a b\\x"y & calc'], 20_000)).rejects.toThrow(/不能含有 " % ! 或换行/)
  })
})
