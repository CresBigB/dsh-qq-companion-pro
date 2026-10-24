/**
 * 离线语音合成（T15）：纯函数 + 一个真的会跑子进程的合成器 + 工具层的发送/审计。
 *
 * 引擎统一用一个「写 WAV 的 node 脚本」冒充：测试不依赖任何真的 TTS 程序，
 * 但走的仍是生产路径（spawn → 等退出 → 校验 WAV 头 → 拼 record 段）。
 *
 * 「就绪」不是填了就算：挂载时探一次引擎（{@link Synthesizer.probe}），探不到就
 * 不注册 qq_send_tts。所以工具层的每个用例都要先 probe —— 与生产里 src/index.ts
 * 的顺序一致。
 */
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ChatBridge } from '../src/bridge.js'
import { registerTools } from '../src/tools.js'
import {
  DEFAULT_TTS_MAX_CHARS, MAX_TTS_CHARS, Synthesizer, buildSherpaArgs, fillTtsArgs, findProgram, findVitsModel,
  prepareTtsText, verifyWav,
} from '../src/tts.js'

const dirs: string[] = []
const tempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  dirs.length = 0
  vi.unstubAllEnvs()
})

/** A stand-in TTS CLI: writes `bytes` bytes of (valid) PCM WAV to argv[2], echoes the text… */
function fakeEngine(options: { bytes?: number; code?: number; sleepMs?: number; garbage?: boolean } = {}): {
  command: string
  args: string[]
} {
  const dir = tempDir('tts-cli-')
  const script = join(dir, 'engine.cjs')
  writeFileSync(script, [
    "const fs = require('node:fs')",
    'const [output, text, bytes, code, sleep, garbage] = process.argv.slice(2)',
    'const finish = () => {',
    '  if (Number(code) !== 0) { process.stderr.write("engine said no"); process.exit(Number(code)) }',
    '  const total = Number(bytes)',
    '  const data = Math.max(2, total - 44)',
    '  const buf = Buffer.alloc(44 + data)',
    '  if (String(garbage) !== "1") {',
    '    buf.write("RIFF", 0, "latin1")',
    '    buf.writeUInt32LE(36 + data, 4)',
    '    buf.write("WAVE", 8, "latin1")',
    '    buf.write("fmt ", 12, "latin1")',
    '    buf.writeUInt32LE(16, 16)',
    '    buf.writeUInt16LE(1, 20)',
    '    buf.writeUInt16LE(1, 22)',
    '    buf.writeUInt32LE(16000, 24)',
    '    buf.writeUInt32LE(32000, 28)',
    '    buf.writeUInt16LE(2, 32)',
    '    buf.writeUInt16LE(16, 34)',
    '    buf.write("data", 36, "latin1")',
    '    buf.writeUInt32LE(data, 40)',
    '  }',
    '  fs.writeFileSync(output, buf)',
    '  process.stdout.write(String(text))',
    '  process.exit(0)',
    '}',
    'const wait = Number(sleep)',
    'if (wait > 0) setTimeout(finish, wait); else finish()',
  ].join('\n'), 'utf8')
  const bytes = String(options.bytes ?? 128)
  const code = String(options.code ?? 0)
  const sleep = String(options.sleepMs ?? 0)
  const garbage = options.garbage === true ? '1' : '0'
  return {
    command: process.execPath,
    args: [script, '{output}', '{text}', bytes, code, sleep, garbage],
  }
}

const config = (overrides: Partial<ConstructorParameters<typeof Synthesizer>[0]> = {}) => ({
  enabled: true,
  engine: 'command' as const,
  command: '',
  args: ['{output}', '{text}'],
  model: '',
  voice: '',
  maxChars: DEFAULT_TTS_MAX_CHARS,
  timeoutMs: 10_000,
  maxBytes: 15 * 1024 * 1024,
  ...overrides,
})

/** 一个已经 probe 过的合成器（生产里就是挂载时探完再注册工具）。 */
const probed = async (overrides: Partial<ConstructorParameters<typeof Synthesizer>[0]> = {}, dir?: string) => {
  const synthesizer = new Synthesizer(config(overrides), dir ?? tempDir('tts-media-'))
  synthesizer.probe()
  return synthesizer
}

// ---------------------------------------------------------------- ① 文本准备

describe('prepareTtsText — 屏幕上好看的不适合念出来', () => {
  it('去掉代码块、链接目标与 markdown 标记，保留可念的字', () => {
    const raw = [
      '## 今天',
      '',
      '给你写了段代码：',
      '```js',
      'const a = 1',
      '```',
      '详见 [文档](https://example.com/doc) 和 https://example.com/raw ，**记得**看。',
      '- 第一点',
      '- 第二点',
    ].join('\n')
    const spoken = prepareTtsText(raw, 200)
    expect(spoken).not.toContain('```')
    expect(spoken).not.toContain('const a = 1')
    expect(spoken).not.toContain('https://example.com')
    expect(spoken).not.toContain('**')
    expect(spoken).not.toContain('##')
    expect(spoken).toContain('文档')
    expect(spoken).toContain('链接')
    expect(spoken).toContain('第一点')
    expect(spoken).toContain('第二点')
    // 换行变成停顿用的逗号，行首列表符号已去掉。
    expect(spoken).toContain('，')
    expect(spoken.split('\n')).toHaveLength(1)
  })

  it('超长直接报错（不硬念），错误里带上实际字数与上限', () => {
    const text = '字'.repeat(30)
    expect(() => prepareTtsText(text, 20)).toThrow(/30 字，上限 20 字/)
    expect(() => prepareTtsText(text, 30)).not.toThrow()
  })

  it('上限被硬顶住：配置再大也不会超过 MAX_TTS_CHARS', () => {
    const text = '字'.repeat(MAX_TTS_CHARS + 1)
    expect(() => prepareTtsText(text, 99_999)).toThrow(new RegExp('上限 ' + String(MAX_TTS_CHARS) + ' 字'))
  })

  it('去掉标记后什么都没剩下时报错（不把空串交给引擎）', () => {
    expect(() => prepareTtsText('```\ncode only\n```', 200)).toThrow(/没有可以念的内容/)
    expect(() => prepareTtsText('   \n\t ', 200)).toThrow(/没有可以念的内容/)
  })

  it('首尾的标点与空白被清掉（引擎读出来不会有奇怪停顿）', () => {
    expect(prepareTtsText('\n\n，你好呀。。  \n', 200)).toBe('你好呀。。')
  })
})

// ---------------------------------------------------------------- ② argv 模板

describe('fillTtsArgs — 模板占位符', () => {
  const values = { text: '你好', output: '/tmp/a.wav', model: '/m', voice: '3', lang: 'zh' }

  it('按配置顺序替换全部占位符', () => {
    expect(fillTtsArgs(['-m', '{model}', '--sid', '{voice}', '--lang', '{lang}', '-o', '{output}', '{text}'], values))
      .toEqual(['-m', '/m', '--sid', '3', '--lang', 'zh', '-o', '/tmp/a.wav', '你好'])
  })

  it('空模板回落到最通用的 {output} {text} 顺序', () => {
    expect(fillTtsArgs([], values)).toEqual(['/tmp/a.wav', '你好'])
  })

  it('不认识的占位符原样交给程序（不是错误）', () => {
    expect(fillTtsArgs(['{speed}', '{text}'], values)).toEqual(['{speed}', '你好'])
  })

  it('文字原样替换一次，不二次展开占位符', () => {
    expect(fillTtsArgs(['{text}'], { ...values, text: '{output}' })).toEqual(['{output}'])
  })
})

// ---------------------------------------------------------------- ③ 模型发现

describe('findVitsModel — sherpa-onnx 的模型目录', () => {
  const layout = (files: string[]): string => {
    const dir = tempDir('vits-')
    for (const name of files) {
      if (name.endsWith('/')) mkdirSync(join(dir, name), { recursive: true })
      else writeFileSync(join(dir, name), '')
    }
    return dir
  }

  it('目录里有 tokens.txt + model.onnx 才算找到，lexicon.txt 有就带上', () => {
    const dir = layout(['tokens.txt', 'model.onnx', 'lexicon.txt', 'dict/'])
    // dict/ 不进屋：sherpa（≥1.12.15）自己会说 dict_dir 不用给，多传只是 stderr 一条警告。
    expect(findVitsModel(dir)).toEqual({
      model: join(dir, 'model.onnx'),
      tokens: join(dir, 'tokens.txt'),
      lexicon: join(dir, 'lexicon.txt'),
    })
  })

  it('piper 模型的 espeak-ng-data/ 不再当作模型的一部分（对应参数已废弃）', () => {
    const dir = layout(['tokens.txt', 'model.onnx', 'espeak-ng-data/'])
    const found = findVitsModel(dir)
    expect(found).toEqual({ model: join(dir, 'model.onnx'), tokens: join(dir, 'tokens.txt') })
    expect(found).not.toHaveProperty('dataDir')
  })

  it('缺 tokens.txt 时找不到', () => {
    expect(findVitsModel(layout(['model.onnx']))).toBeUndefined()
  })

  it('直接给 .onnx 路径也行（tokens.txt 取同目录）', () => {
    const dir = layout(['tokens.txt', 'model.onnx'])
    expect(findVitsModel(join(dir, 'model.onnx'))).toMatchObject({ model: join(dir, 'model.onnx') })
  })

  it('路径不存在时找不到（不抛）', () => {
    expect(findVitsModel(join(tempDir('vits-missing-'), 'nope'))).toBeUndefined()
  })

  it('tokens.txt 是目录不算模型（要普通文件）', () => {
    expect(findVitsModel(layout(['model.onnx', 'tokens.txt/']))).toBeUndefined()
  })

  it('model.onnx 是目录不算模型（名字像也不算）', () => {
    expect(findVitsModel(layout(['tokens.txt', 'model.onnx/']))).toBeUndefined()
  })

  it('lexicon.txt 是目录时不带上（--vits-lexicon 只认普通文件）', () => {
    const dir = layout(['tokens.txt', 'model.onnx', 'lexicon.txt/'])
    const found = findVitsModel(dir)
    expect(found).toEqual({ model: join(dir, 'model.onnx'), tokens: join(dir, 'tokens.txt') })
    expect(found).not.toHaveProperty('lexicon')
  })

  it('直接给非 .onnx 的普通文件：不算模型（不抛）', () => {
    const dir = layout(['tokens.txt', 'model.onnx'])
    expect(findVitsModel(join(dir, 'tokens.txt'))).toBeUndefined()
    const text = join(dir, 'notes.txt')
    writeFileSync(text, 'not a model')
    expect(findVitsModel(text)).toBeUndefined()
  })

  it('直接路径是目录冒充的 .onnx：undefined', () => {
    const dir = layout(['tokens.txt', 'model.onnx/'])
    expect(findVitsModel(join(dir, 'model.onnx'))).toBeUndefined()
  })

  it('直接给 .onnx 但同目录 tokens.txt 是目录：undefined', () => {
    const dir = layout(['model.onnx', 'tokens.txt/'])
    expect(findVitsModel(join(dir, 'model.onnx'))).toBeUndefined()
  })
})

describe('buildSherpaArgs — 官方 CLI 的参数名', () => {
  const vits = { model: '/m/model.onnx', tokens: '/m/tokens.txt' }

  it('最简模型：只有 --vits-model / --vits-tokens / --output-filename，文字是位置参数', () => {
    expect(buildSherpaArgs(vits, '/o.wav', '', '你好')).toEqual([
      '--vits-model=/m/model.onnx',
      '--vits-tokens=/m/tokens.txt',
      '--output-filename=/o.wav',
      '你好',
    ])
  })

  it('lexicon 与说话人按需带上', () => {
    const args = buildSherpaArgs({ ...vits, lexicon: '/m/lexicon.txt' }, '/o.wav', '2', '你好')
    expect(args).toEqual([
      '--vits-model=/m/model.onnx',
      '--vits-tokens=/m/tokens.txt',
      '--vits-lexicon=/m/lexicon.txt',
      '--output-filename=/o.wav',
      '--sid=2',
      '你好',
    ])
  })

  it('不传上游已废弃 / 无用的 --vits-data-dir 与 --vits-dict-dir（只会招来警告）', () => {
    const args = buildSherpaArgs({ ...vits, lexicon: '/m/lexicon.txt' }, '/o.wav', '', '你好')
    expect(args.some(arg => arg.startsWith('--vits-data-dir'))).toBe(false)
    expect(args.some(arg => arg.startsWith('--vits-dict-dir'))).toBe(false)
    // 每个 flag 都是 --k=v 一个 argv 元素，不做 shell 拼接。
    expect(args.filter(arg => arg.startsWith('--'))).toHaveLength(4)
  })

  it('文字永远是最后一个位置参数（哪怕里面带 -- 也不行）', () => {
    const args = buildSherpaArgs(vits, '/o.wav', '', '--help 你好')
    expect(args.at(-1)).toBe('--help 你好')
  })
})

describe('findProgram — 只认真的可执行文件', () => {
  const WINDOWS = process.platform === 'win32'
  const PATH_SEP = WINDOWS ? ';' : ':'
  beforeEach(() => {
    // Windows 查找是 PATHEXT 驱动的；钉住它，测试才与宿主装了什么都无关。
    if (WINDOWS) vi.stubEnv('PATHEXT', '.COM;.EXE;.BAT;.CMD')
  })

  /** 在 `dir` 里装一个真的能跑的程序；返回应当被找到的路径。 */
  const install = (dir: string, name: string): string => {
    if (WINDOWS) {
      const file = join(dir, name + '.EXE')
      writeFileSync(file, 'MZ')
      return file
    }
    const file = join(dir, name)
    writeFileSync(file, '#!/bin/sh\nexit 0\n')
    chmodSync(file, 0o755)
    return file
  }

  it('给绝对路径：真的可执行才是它，不存在的路径是 undefined（不抛）', () => {
    const file = install(tempDir('prog-'), 'dsh-tts')
    expect(findProgram(file)).toBe(file)
    expect(findProgram(join(tempDir('prog-'), 'nope'))).toBeUndefined()
  })

  it('目录 / 普通文本冒充程序 → undefined（「存在」不等于「能跑」）', () => {
    const dir = tempDir('prog-fake-')
    const fakeDir = join(dir, WINDOWS ? 'faketts.exe' : 'faketts')
    mkdirSync(fakeDir) // 名字像程序，其实是个目录
    expect(findProgram(fakeDir)).toBeUndefined()
    const plain = join(dir, WINDOWS ? 'faketts.txt' : 'plaintext')
    writeFileSync(plain, 'not a program')
    if (!WINDOWS) chmodSync(plain, 0o644)
    expect(findProgram(plain)).toBeUndefined()
  })

  it('PATH 查找：目录 / 非可执行文件不命中，继续扫描后面的目录', () => {
    const decoy = tempDir('prog-decoy-')
    mkdirSync(join(decoy, WINDOWS ? 'dsh-tts.exe' : 'dsh-tts'))
    const plain = tempDir('prog-plain-')
    writeFileSync(join(plain, WINDOWS ? 'dsh-tts.txt' : 'dsh-tts'), 'not a program')
    const good = tempDir('prog-good-')
    const hit = install(good, 'dsh-tts')
    vi.stubEnv('PATH', decoy)
    expect(findProgram('dsh-tts')).toBeUndefined()
    vi.stubEnv('PATH', plain + PATH_SEP + good)
    expect(findProgram('dsh-tts')).toBe(hit)
  })

  it.runIf(WINDOWS)('直接路径没有扩展名时按 PATHEXT 补齐；不在 PATHEXT 的就不算程序', () => {
    const dir = tempDir('prog-pathext-')
    const exe = join(dir, 'runme.EXE')
    writeFileSync(exe, 'MZ')
    expect(findProgram(join(dir, 'runme'))).toBe(exe)
    const text = join(dir, 'runme.txt')
    writeFileSync(text, 'x')
    expect(findProgram(text)).toBeUndefined()
  })

  it('故意不存在的裸命令名 → undefined（不猜）', () => {
    expect(findProgram('dsh-tts-does-not-exist-xyz')).toBeUndefined()
  })
})

// ---------------------------------------------------------------- ④ WAV 校验

describe('verifyWav — 退出码 0 不等于有声音', () => {
  const write = (buffer: Buffer): string => {
    const file = join(tempDir('wav-'), 'a.wav')
    writeFileSync(file, buffer)
    return file
  }
  const wav = (dataBytes: number): Buffer => {
    const buffer = Buffer.alloc(44 + dataBytes)
    buffer.write('RIFF', 0, 'latin1')
    buffer.writeUInt32LE(36 + dataBytes, 4)
    buffer.write('WAVE', 8, 'latin1')
    buffer.write('fmt ', 12, 'latin1')
    buffer.writeUInt32LE(16, 16)
    buffer.writeUInt16LE(1, 20)
    buffer.writeUInt16LE(1, 22)
    buffer.writeUInt32LE(16_000, 24)
    buffer.writeUInt32LE(32_000, 28)
    buffer.writeUInt16LE(2, 32)
    buffer.writeUInt16LE(16, 34)
    buffer.write('data', 36, 'latin1')
    buffer.writeUInt32LE(dataBytes, 40)
    return buffer
  }

  it('正常的 PCM WAV：报出字节数与采样参数', async () => {
    await expect(verifyWav(write(wav(320)), 1_000_000))
      .resolves.toEqual({ bytes: 364, sampleRate: 16_000, channels: 1, bitsPerSample: 16, dataBytes: 320 })
  })

  it('超过发送上限：直接报错（不把注定失败的请求交给 QQ）', async () => {
    await expect(verifyWav(write(wav(320)), 100)).rejects.toThrow(/超过发送上限 100 字节/)
  })

  it('不是 WAV：报文件头不对（多半是参数顺序填反了）', async () => {
    const file = join(tempDir('wav-'), 'b.wav')
    writeFileSync(file, Buffer.alloc(64, 0))
    await expect(verifyWav(file, 1_000_000)).rejects.toThrow(/不是 WAV/)
  })

  it('文件不存在 / 空文件：各自有话说', async () => {
    const missing = join(tempDir('wav-'), 'nope.wav')
    await expect(verifyWav(missing, 1_000_000)).rejects.toThrow(/没有写出音频文件/)
    const empty = join(tempDir('wav-'), 'c.wav')
    writeFileSync(empty, '')
    await expect(verifyWav(empty, 1_000_000)).rejects.toThrow(/空文件/)
  })
})

describe('verifyWav — 畸形的头也要拒绝（声明与内容不符 = 坏文件）', () => {
  /** KSDATAFORMAT_SUBTYPE_PCM / IEEE float，用来做真伪 EXTENSIBLE 对照。 */
  const PCM_GUID = Buffer.from('0100000000001000800000aa00389b71', 'hex')
  const FLOAT_GUID = Buffer.from('0300000000001000800000aa00389b71', 'hex')
  const write = (buffer: Buffer): string => {
    const file = join(tempDir('wav-'), 'a.wav')
    writeFileSync(file, buffer)
    return file
  }
  /** 按参数拼一个 WAV：`fmt` 的长度 / 格式码 / cbSize / 子格式、data 声明长度都能造假。 */
  const wav = (options: {
    data?: number
    dataDeclared?: number
    fmtSize?: number
    format?: number
    cbSize?: number
    subFormat?: Buffer
    riffSize?: number
  } = {}): Buffer => {
    const data = options.data ?? 320
    const fmtSize = options.fmtSize ?? 16
    const fmtBody = Buffer.alloc(Math.max(fmtSize, 16))
    fmtBody.writeUInt16LE(options.format ?? 1, 0)
    fmtBody.writeUInt16LE(1, 2)
    fmtBody.writeUInt32LE(16_000, 4)
    fmtBody.writeUInt32LE(32_000, 8)
    fmtBody.writeUInt16LE(2, 12)
    fmtBody.writeUInt16LE(16, 14)
    if (fmtSize >= 18) fmtBody.writeUInt16LE(options.cbSize ?? 22, 16)
    if (fmtSize >= 40) (options.subFormat ?? PCM_GUID).copy(fmtBody, 24)
    const fmtChunk = Buffer.alloc(8 + fmtSize)
    fmtChunk.write('fmt ', 0, 'latin1')
    fmtChunk.writeUInt32LE(fmtSize, 4)
    fmtBody.copy(fmtChunk, 8, 0, Math.min(fmtBody.length, fmtSize))
    const dataChunk = Buffer.alloc(8 + data)
    dataChunk.write('data', 0, 'latin1')
    dataChunk.writeUInt32LE(options.dataDeclared ?? data, 4)
    const buffer = Buffer.alloc(12 + fmtChunk.length + dataChunk.length)
    buffer.write('RIFF', 0, 'latin1')
    buffer.writeUInt32LE(options.riffSize ?? buffer.length - 8, 4)
    buffer.write('WAVE', 8, 'latin1')
    fmtChunk.copy(buffer, 12)
    dataChunk.copy(buffer, 12 + fmtChunk.length)
    return buffer
  }

  it('合法的小 PCM 与合法的 EXTENSIBLE(PCM) 都照旧通过', async () => {
    await expect(verifyWav(write(wav()), 1_000_000))
      .resolves.toEqual({ bytes: 364, sampleRate: 16_000, channels: 1, bitsPerSample: 16, dataBytes: 320 })
    // piper 这类模型写的是 format=0xFFFE + 40 字节 fmt：真的 PCM 子格式仍然收。
    await expect(verifyWav(write(wav({ format: 0xFFFE, fmtSize: 40 })), 1_000_000))
      .resolves.toMatchObject({ sampleRate: 16_000, channels: 1, bitsPerSample: 16, dataBytes: 320 })
  })

  it('RIFF 头声明的长度比文件大：就是截断', async () => {
    await expect(verifyWav(write(wav({ riffSize: 9_999 })), 1_000_000)).rejects.toThrow(/截断了（RIFF 头声明/)
  })

  it('RIFF 声明长度连文件头都装不下：坏文件', async () => {
    await expect(verifyWav(write(wav({ riffSize: 2 })), 1_000_000)).rejects.toThrow(/连文件头都装不下/)
  })

  it('data 块声明的长度超出 RIFF 范围：拒绝（不读到 RIFF 之外）', async () => {
    await expect(verifyWav(write(wav({ dataDeclared: 9_999 })), 1_000_000)).rejects.toThrow(/超出 RIFF 声明的范围/)
  })

  it('format=0xFFFE 但 fmt 只有 16 字节（扩展头不存在）：拒绝', async () => {
    await expect(verifyWav(write(wav({ format: 0xFFFE })), 1_000_000))
      .rejects.toThrow(/EXTENSIBLE 的 fmt 块只有 16 字节/)
  })

  it('EXTENSIBLE 的 cbSize 太小（扩展头说不清多长）：拒绝', async () => {
    await expect(verifyWav(write(wav({ format: 0xFFFE, fmtSize: 40, cbSize: 4 })), 1_000_000))
      .rejects.toThrow(/cbSize 只声明 4 字节/)
  })

  it('EXTENSIBLE 子格式不是 PCM（IEEE float）：拒绝', async () => {
    await expect(verifyWav(write(wav({ format: 0xFFFE, fmtSize: 40, subFormat: FLOAT_GUID })), 1_000_000))
      .rejects.toThrow(/子格式不是 PCM/)
  })

  it('格式码 3（IEEE float）直接拒绝', async () => {
    await expect(verifyWav(write(wav({ format: 3 })), 1_000_000)).rejects.toThrow(/不是 PCM WAV（格式码 3）/)
  })

  it('fmt 块不足 16 字节：拒绝', async () => {
    await expect(verifyWav(write(wav({ fmtSize: 12 })), 1_000_000)).rejects.toThrow(/fmt 块只有 12 字节/)
  })

  it('blockAlign 与声道 / 位深对不上：拒绝', async () => {
    const buffer = wav()
    buffer.writeUInt16LE(4, 32) // fmt 体偏移 12 的块对齐
    await expect(verifyWav(write(buffer), 1_000_000)).rejects.toThrow(/块对齐 4/)
  })

  it('byteRate 与采样率 × 块对齐对不上：拒绝', async () => {
    const buffer = wav()
    buffer.writeUInt32LE(12_345, 28) // fmt 体偏移 8 的字节率
    await expect(verifyWav(write(buffer), 1_000_000)).rejects.toThrow(/字节率 12345/)
  })

  it('data 长度不是整帧（截断在半帧上）：拒绝', async () => {
    await expect(verifyWav(write(wav({ data: 3 })), 1_000_000)).rejects.toThrow(/不是整帧 2 字节的倍数/)
  })

  it('大量零长 chunk：走满上限就拒绝（不让恶意文件空转事件循环）', async () => {
    const buffer = Buffer.alloc(12 + 8 * 70)
    buffer.write('RIFF', 0, 'latin1')
    buffer.writeUInt32LE(buffer.length - 8, 4)
    buffer.write('WAVE', 8, 'latin1')
    for (let index = 0; index < 70; index++) buffer.write('junk', 12 + index * 8, 'latin1')
    await expect(verifyWav(write(buffer), 1_000_000)).rejects.toThrow(/chunk 数量超过 64/)
  })
})

// ---------------------------------------------------------------- ⑤ 合成器

describe('Synthesizer — 先探测，再合成', () => {
  it('探测成功：ready + 能念出人话的说明；产物落在 mediaDir 下且带 tts_ 前缀', async () => {
    const mediaDir = tempDir('tts-media-')
    const synthesizer = await probed(fakeEngine({ bytes: 256 }), mediaDir)
    expect(synthesizer.ready).toBe(true)
    expect(synthesizer.status().detail).toContain(process.execPath)
    const result = await synthesizer.synthesize('你好呀', {})
    expect(result.engine).toBe('command')
    expect(result.bytes).toBe(256)
    expect(result.chars).toBe(3)
    expect(result.path.startsWith(join(mediaDir, 'tts_'))).toBe(true)
    expect(readdirSync(mediaDir).filter(name => name.startsWith('tts_'))).toHaveLength(1)
    expect(existsSync(result.path)).toBe(true)
  })

  it('没探测过就不算就绪（ready 是探测结论，不是「填了配置」）', () => {
    expect(new Synthesizer(config(fakeEngine()), tempDir('tts-media-')).ready).toBe(false)
  })

  it('关闭 / 命令没填 / 命令不存在：探测失败，并把原因留在 status 里', async () => {
    const off = await probed({ enabled: false })
    expect(off.ready).toBe(false)
    expect(off.status()).toMatchObject({ enabled: false, ready: false, detail: '关闭' })
    await expect(off.synthesize('你好', {})).rejects.toThrow(/ttsEnabled = false/)

    const blank = await probed({ command: '' })
    expect(blank.ready).toBe(false)
    await expect(blank.synthesize('你好', {})).rejects.toThrow(/ttsCommand 没填/)

    const missing = await probed({ command: 'dsh-tts-does-not-exist-xyz' })
    expect(missing.ready).toBe(false)
    expect(missing.status().detail).toMatch(/找不到/)
    await expect(missing.synthesize('你好', {})).rejects.toThrow(/找不到 ttsCommand 指定的程序/)
  })

  it('引擎失败：错误里带退出码与 stderr，半成品文件被删掉', async () => {
    const mediaDir = tempDir('tts-media-')
    const synthesizer = await probed(fakeEngine({ code: 3 }), mediaDir)
    await expect(synthesizer.synthesize('你好', {})).rejects.toThrow(/退出码 3.*engine said no/s)
    expect(readdirSync(mediaDir).filter(name => name.startsWith('tts_'))).toHaveLength(0)
  })

  it('写出来的不是 WAV：报文件头不对并删掉文件', async () => {
    const mediaDir = tempDir('tts-media-')
    const synthesizer = await probed(fakeEngine({ garbage: true }), mediaDir)
    await expect(synthesizer.synthesize('你好', {})).rejects.toThrow(/不是 WAV/)
    expect(readdirSync(mediaDir).filter(name => name.startsWith('tts_'))).toHaveLength(0)
  })

  it('音频超过 maxVoiceBytes：合成之后就报错（不去撞 QQ 的拒绝）', async () => {
    const mediaDir = tempDir('tts-media-')
    const synthesizer = await probed({ ...fakeEngine({ bytes: 4_096 }), maxBytes: 100 }, mediaDir)
    await expect(synthesizer.synthesize('你好', {})).rejects.toThrow(/超过发送上限/)
    expect(readdirSync(mediaDir).filter(name => name.startsWith('tts_'))).toHaveLength(0)
  })

  it('回合被取消：立刻放弃，不启动进程', async () => {
    const controller = new AbortController()
    controller.abort()
    const synthesizer = await probed(fakeEngine())
    await expect(synthesizer.synthesize('你好', { signal: controller.signal })).rejects.toThrow(/已取消/)
  })

  it('超时：按配置杀掉子进程（下限 1 秒，避免 0 秒配置）', async () => {
    const mediaDir = tempDir('tts-media-')
    const synthesizer = await probed({ ...fakeEngine({ sleepMs: 5_000 }), timeoutMs: 1 }, mediaDir)
    await expect(synthesizer.synthesize('你好', {})).rejects.toThrow(/超时（1 秒）/)
    expect(readdirSync(mediaDir).filter(name => name.startsWith('tts_'))).toHaveLength(0)
  })

  it('sherpa-onnx 缺程序或缺模型：探测失败，合成时给出可照着修的提示', async () => {
    const synthesizer = await probed({
      engine: 'sherpa-onnx',
      model: join(tempDir('vits-missing-'), 'nope'),
    })
    expect(synthesizer.ready).toBe(false)
    expect(synthesizer.status().detail).not.toBe('')
    await expect(synthesizer.synthesize('你好', {})).rejects.toThrow(/sherpa-onnx-offline-tts|VITS 语音模型/)
  })
})

// ---------------------------------------------------------------- ⑥ 工具层

type SendTool = {
  name: string
  parameters: Record<string, unknown>
  execute: (args: Record<string, unknown>, exec: unknown) => Promise<unknown>
}

describe('qq_send_tts — 只发当前会话，成功失败都留痕', () => {
  /** `make` 拿到的就是桥的 mediaDir：合成产物必须落在围栏根里才发得出去。 */
  const setup = async (
    make?: (mediaDir: string) => Synthesizer,
    options: { bind?: boolean } = {},
  ) => {
    const mediaDir = tempDir('tts-tool-')
    const workspace = tempDir('tts-ws-')
    const calls: Array<{ action: string; params: Record<string, unknown> }> = []
    const bridge = new ChatBridge({
      ctx: new Context(),
      connection: {
        call: async (action: string, params: Record<string, unknown>) => {
          calls.push({ action, params })
          return { message_id: 42 }
        },
      } as never,
      media: {} as never,
      transcriber: {} as never,
      agents: {} as never,
      sessions: {} as never,
      agentPresets: undefined as never,
      sessionPersistence: undefined,
      workspaceRegistry: undefined as never,
      agentDefaultModel: undefined,
      defaultModel: undefined,
      config: {
        botQQ: '10002', ignoreSelf: false, requireMention: true,
        interimMessages: true, sendErrorNotice: true, restrictedMemberPrefix: false,
        sensitivePatterns: [], mediaDir, maxImageBytes: 8 * 1024 * 1024,
        maxVoiceBytes: 15 * 1024 * 1024, maxFileBytes: 20 * 1024 * 1024,
        textImageThreshold: 0, cardFooter: 'dsh', fontFiles: [], fontFamilies: [],
        agentPreset: 'standard', workspacePath: workspace, maxInboundFileBytes: 0,
      },
      policy: {
        dmPolicy: 'open', groupPolicy: 'open', allowFrom: [], groupAllowFrom: [],
        adminUsers: ['10001'], allowAllUsers: false, requireMention: true,
      },
      log: () => undefined,
    })
    const sessionId = 'session-tts'
    const chatId = 'private:10001'
    if (options.bind !== false) {
      ;(bridge as unknown as { chats: Map<string, Record<string, unknown>> }).chats.set(chatId, {
        queue: Promise.resolve(),
        activeTurnRole: 'admin',
        sessionId,
      })
      ;(bridge as unknown as { bySession: Map<string, string> }).bySession.set(sessionId, chatId)
    }
    const ctx = new Context()
    const registered: SendTool[] = []
    ctx.provide('tools' as never, {
      register: (tool: SendTool) => {
        registered.push(tool)
        return () => undefined
      },
    } as never)
    const tts = make?.(mediaDir)
    // 生产顺序：挂载时先探一次引擎，探不到就不注册（src/index.ts）。
    if (tts !== undefined) tts.probe()
    registerTools(ctx, bridge, {} as never, {
      maxImageBytes: 1_000_000,
      maxVoiceBytes: 1_000_000,
      maxFileBytes: 1_000_000,
      ...(tts === undefined ? {} : { tts }),
    })
    const tool = (name: string): SendTool => {
      const found = registered.find(candidate => candidate.name === name)
      if (found === undefined) throw new Error('tool not registered: ' + name)
      return found
    }
    const exec = { agent: { session: { id: sessionId } } }
    /** 审计是串行异步链写的——等它落盘，别抢跑。 */
    const auditLines = async (): Promise<Array<Record<string, unknown>>> => {
      const file = join(mediaDir, 'qq-actions.log')
      for (let attempt = 0; attempt < 100; attempt++) {
        if (existsSync(file)) {
          const lines = readFileSync(file, 'utf8').split('\n').filter(line => line !== '')
          if (lines.length > 0) return lines.map(line => JSON.parse(line) as Record<string, unknown>)
        }
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      return []
    }
    const ttsFiles = (): string[] => readdirSync(mediaDir).filter(name => name.startsWith('tts_'))
    return { tool, exec, calls, auditLines, names: registered.map(item => item.name), mediaDir, chatId, bridge, ttsFiles }
  }

  it('没有合成器就不注册这个工具（模型完全看不到）', async () => {
    const h = await setup()
    expect(h.names).not.toContain('qq_send_tts')
    expect(h.names).toContain('qq_send_voice')
  })

  it('引擎探不到（命令不存在）也不注册：不是每次调用都失败一次', async () => {
    const h = await setup(mediaDir => new Synthesizer(config({ command: 'dsh-tts-does-not-exist-xyz' }), mediaDir))
    expect(h.names).not.toContain('qq_send_tts')
  })

  it('工具参数里没有 chat_id：目标会话由会话绑定决定，模型选不了', async () => {
    const h = await setup(mediaDir => new Synthesizer(config(fakeEngine({ bytes: 64 })), mediaDir))
    expect(Object.keys((h.tool('qq_send_tts').parameters as { properties: Record<string, unknown> }).properties).sort())
      .toEqual(['reply_to', 'text'])
  })

  it('配好引擎：合成 → 以 record 段发出 → 审计行记下引擎/字数/耗时', async () => {
    const h = await setup(mediaDir => new Synthesizer(config(fakeEngine({ bytes: 64 })), mediaDir))
    expect(h.names).toContain('qq_send_tts')
    const result = await h.tool('qq_send_tts').execute({ text: '晚安啦' }, h.exec) as {
      sent: boolean
      messageId: string | null
    }
    expect(result).toMatchObject({ sent: true, messageId: '42' })
    const send = h.calls.find(call => call.action === 'send_msg')
    expect(send).toBeDefined()
    const segment = (send!.params.message as Array<Record<string, unknown>>)[0]
    expect(segment.type).toBe('record')
    // 小文件走 base64://（大文件才是 file://），这里只确认真的带上了音频。
    expect(String((segment.data as Record<string, unknown>).file)).toMatch(/^(base64:\/\/|file:\/\/)/)
    expect(h.ttsFiles()).toHaveLength(1)
    const line = (await h.auditLines()).find(item => item.action === 'qq_send_tts')
    expect(line).toMatchObject({ action: 'qq_send_tts', ok: true })
    expect(String(line!.reason)).toContain('合成')
  })

  it('就算调用方塞了 chat_id 也发不出去别的会话（只认会话绑定）', async () => {
    const h = await setup(mediaDir => new Synthesizer(config(fakeEngine({ bytes: 64 })), mediaDir))
    await h.tool('qq_send_tts').execute({ text: '晚安啦', chat_id: 'group:777' }, h.exec)
    expect(h.calls.some(call => call.action === 'send_msg')).toBe(true)
    const line = (await h.auditLines()).find(item => item.action === 'qq_send_tts')
    expect(line).toMatchObject({ chatId: 'private:10001', ok: true })
    expect(JSON.stringify(h.calls)).not.toContain('group:777')
  })

  it('不是 QQ 会话（Web 等）：拒绝，0 合成 0 发送', async () => {
    const h = await setup(mediaDir => new Synthesizer(config(fakeEngine({ bytes: 64 })), mediaDir), { bind: false })
    await expect(h.tool('qq_send_tts').execute({ text: '晚安啦' }, h.exec))
      .rejects.toThrow(/只能在 QQ 会话里用/)
    expect(h.calls).toHaveLength(0)
    expect(h.ttsFiles()).toHaveLength(0)
    expect((await h.auditLines()).some(item => item.action === 'qq_send_tts')).toBe(false)
  })

  it('reply_to 引不到的消息：忽略引用，但语音照发（不因为引错就白合成）', async () => {
    const h = await setup(mediaDir => new Synthesizer(config(fakeEngine({ bytes: 64 })), mediaDir))
    const result = await h.tool('qq_send_tts').execute({ text: '晚安啦', reply_to: '999' }, h.exec) as {
      quoteIgnored: boolean
    }
    expect(result.quoteIgnored).toBe(true)
    const send = h.calls.find(call => call.action === 'send_msg')
    expect(send!.params.replyTo).toBeUndefined()
  })

  it('回合已取消：不合成、不发送', async () => {
    const h = await setup(mediaDir => new Synthesizer(config(fakeEngine({ bytes: 64 })), mediaDir))
    const controller = new AbortController()
    controller.abort()
    await expect(h.tool('qq_send_tts').execute({ text: '晚安啦' }, { ...h.exec, signal: controller.signal }))
      .rejects.toThrow(/已取消/)
    expect(h.calls).toHaveLength(0)
    expect(h.ttsFiles()).toHaveLength(0)
  })

  it('读文件期间被取消：最后一个 await 之后不再发送，临时音频删掉', async () => {
    const h = await setup(mediaDir => new Synthesizer(config(fakeEngine({ bytes: 64 })), mediaDir))
    const controller = new AbortController()
    const realRoots = h.bridge.mediaSendRoots.bind(h.bridge)
    // 媒体围栏是合成之后、sendSegments 之前的最后一个 await：在这里 abort，
    // 只有「最后一个 await 之后再查一次」的实现才会 0 发送。
    ;(h.bridge as unknown as { mediaSendRoots: typeof realRoots }).mediaSendRoots = async (sessionId: string | undefined) => {
      const gate = await realRoots(sessionId)
      controller.abort()
      return gate
    }
    await expect(h.tool('qq_send_tts').execute({ text: '晚安啦' }, { ...h.exec, signal: controller.signal }))
      .rejects.toThrow(/已取消/)
    expect(h.calls).toHaveLength(0)
    expect(h.ttsFiles()).toHaveLength(0)
    const line = (await h.auditLines()).find(item => item.action === 'qq_send_tts')
    expect(line).toMatchObject({ action: 'qq_send_tts', ok: false })
  })

  it('文字太长：报错、什么都发不出去、审计记失败', async () => {
    const h = await setup(mediaDir => new Synthesizer(config({ ...fakeEngine(), maxChars: 5 }), mediaDir))
    await expect(h.tool('qq_send_tts').execute({ text: '这一句话明显超过五个字' }, h.exec))
      .rejects.toThrow(/太长/)
    expect(h.calls).toHaveLength(0)
    const line = (await h.auditLines()).find(item => item.action === 'qq_send_tts')
    expect(line).toMatchObject({ action: 'qq_send_tts', ok: false })
  })

  it('text 为空：参数层直接拒掉', async () => {
    const h = await setup(mediaDir => new Synthesizer(config(fakeEngine()), mediaDir))
    await expect(h.tool('qq_send_tts').execute({ text: '   ' }, h.exec)).rejects.toThrow(/text 必填/)
  })
})