/**
 * T32 · `qq_gif_frames` 的对外契约：能看什么、不能看什么、结果怎么回到模型眼前。
 *
 * 四组断言：
 *   ① 注册层：能力层闸关掉 `qq.send.image` 时不注册；
 *   ② 门禁层：路径必须落在 `mediaSendRoots` 给的媒体目录里，越界的路径一个字节都不读；
 *   ③ 出口层：模型能吃图 → 走附件库，结果里有 image 块与 `attachmentId`；吃不了图 /
 *      没有附件服务 → 拼图落盘并在文案里说清「看不了图」，**不假装成功**；
 *   ④ 发送层：`send: true` 才发到聊天，且只发当前会话绑定的聊天。
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GifEncoder } from '@napi-rs/canvas'

import type { ChatBridge } from '../src/bridge.js'
import type { ImagesPort } from '../src/bridge-types.js'
import { registerGifTool } from '../src/gif-tools.js'

interface GifTool {
  name: string
  description: string
  output: { render: (args: unknown, value: unknown) => Array<{ type: string; text?: string }> }
  execute: (args: unknown, exec: unknown) => Promise<Record<string, unknown>>
}

/** 造一张两帧的 GIF 文件。 */
function writeGif(path: string, colors: readonly [number, number, number][]): void {
  const size = 4
  const encoder = new GifEncoder(size, size)
  try {
    for (const rgb of colors) {
      const data = new Uint8Array(size * size * 4)
      for (let i = 0; i < size * size; i += 1) {
        data[i * 4] = rgb[0]
        data[i * 4 + 1] = rgb[1]
        data[i * 4 + 2] = rgb[2]
        data[i * 4 + 3] = 255
      }
      encoder.addFrame(data, size, size, { delay: 90 })
    }
    writeFileSync(path, new Uint8Array(encoder.finish()))
  } finally {
    encoder.dispose()
  }
}

interface HarnessOptions {
  allow?: (toolName: string) => boolean
  images?: ImagesPort
  canReceive?: boolean
  boundChat?: string | undefined
}

function makeHarness(options?: HarnessOptions) {
  const root = mkdtempSync(join(tmpdir(), 'gif-tools-'))
  const mediaDir = join(root, 'media')
  mkdirSync(mediaDir, { recursive: true })
  const sent: Array<{ chatId: string; segments: readonly unknown[] }> = []
  const saved: Array<{ name: string; bytes: number }> = []
  const images = options?.images ?? (options?.canReceive === false
    ? {
      canReceive: async () => false,
      save: async () => undefined,
    }
    : undefined)
  const bridge = {
    mediaSendRoots: async () => ({ roots: [mediaDir], mediaDir }),
    chatForSession: () => options?.boundChat,
    images: () => images,
    sendSegments: async (chatId: string, segments: readonly unknown[]) => {
      sent.push({ chatId, segments })
      return 'mid-1'
    },
  } as unknown as ChatBridge
  const tools: GifTool[] = []
  const ctx = {
    tools: {
      register: (tool: GifTool) => {
        tools.push(tool)
        return () => undefined
      },
    },
  }
  registerGifTool(ctx as never, bridge, options?.allow)
  const tool = (): GifTool => {
    const found = tools[0]
    if (found === undefined) throw new Error('qq_gif_frames 没有注册')
    return found
  }
  const saveImage = async (data: Uint8Array, name: string) => {
    saved.push({ name, bytes: data.length })
    return {
      attachmentId: 'att-' + saved.length,
      mediaType: 'image/png',
      bytes: data.length,
      width: 96,
      height: 24,
      name,
    }
  }
  return { root, mediaDir, sent, saved, tools, tool, saveImage }
}

const exec = (sessionId = 's-1') => ({ agent: { session: { id: sessionId } }, signal: undefined })

describe('qq_gif_frames 注册与门禁', () => {
  it('能力层闸关掉时不注册', () => {
    const harness = makeHarness({ allow: () => false })
    expect(harness.tools).toHaveLength(0)
  })

  it('参数里说明清楚默认值与上限', () => {
    const harness = makeHarness()
    expect(harness.tool().name).toBe('qq_gif_frames')
    expect(harness.tool().description).toContain('动图')
  })

  it('媒体目录以外的路径直接拒绝，不读文件', async () => {
    const harness = makeHarness()
    await expect(harness.tool().execute({ path: 'C:\\Windows\\win.ini' }, exec())).rejects.toThrow(/不在允许的媒体目录/)
  })

  it('不存在的文件给可操作的提示', async () => {
    const harness = makeHarness()
    await expect(harness.tool().execute({ path: join(harness.mediaDir, 'nope.gif') }, exec()))
      .rejects.toThrow(/不在允许的媒体目录/)
  })

  it('不是 GIF 的文件报错，不瞎猜', async () => {
    const harness = makeHarness()
    const path = join(harness.mediaDir, 'fake.gif')
    writeFileSync(path, 'not a gif at all')
    await expect(harness.tool().execute({ path }, exec())).rejects.toThrow(/qq_gif_frames: 不是 GIF/)
  })
})

describe('qq_gif_frames 两个出口', () => {
  it('模型能吃图：结果带 image 块与附件 id', async () => {
    const holder: { save?: (data: Uint8Array, name: string) => Promise<never> } = {}
    const port: ImagesPort = {
      canReceive: async () => true,
      save: async (data, name) => await holder.save!(data, name),
    }
    const withImages = makeHarness({ images: port })
    holder.save = (data, name) => withImages.saveImage(data, name) as never
    const path = join(withImages.mediaDir, 'anim.gif')
    writeGif(path, [[255, 0, 0], [0, 0, 255], [0, 255, 0]])
    const value = await withImages.tool().execute({ path, max_frames: 3 }, exec())
    expect(typeof value.image).toBe('object')
    expect((value.image as { attachmentId: string }).attachmentId).toBe('att-1')
    expect(value.path).toBe('')
    expect(value.frameCount).toBe(3)
    expect(value.sourceFrames).toBe(3)
    expect(withImages.saved).toHaveLength(1)
    const blocks = withImages.tool().output.render({}, value)
    expect(blocks[0]?.type).toBe('text')
    expect(blocks[1]?.type).toBe('image')
  })

  it('模型吃不了图：拼图落盘，文案说实话', async () => {
    const harness = makeHarness({ canReceive: false })
    const path = join(harness.mediaDir, 'anim.gif')
    writeGif(path, [[1, 2, 3], [4, 5, 6]])
    const value = await harness.tool().execute({ path }, exec())
    expect(value.image).toBeNull()
    expect(typeof value.path).toBe('string')
    expect(value.text).toContain('看不了图片')
    const png = await readFile(String(value.path))
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    const blocks = harness.tool().output.render({}, value)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.type).toBe('text')
  })

  it('没有附件服务：同样落盘，并说明没有附件服务', async () => {
    const harness = makeHarness()
    const path = join(harness.mediaDir, 'anim.gif')
    writeGif(path, [[9, 9, 9], [8, 8, 8]])
    const value = await harness.tool().execute({ path }, exec())
    expect(value.image).toBeNull()
    expect(value.text).toContain('没有附件服务')
  })

  it('参数越界会被夹进合法范围', async () => {
    const harness = makeHarness({ canReceive: false })
    const path = join(harness.mediaDir, 'anim.gif')
    writeGif(path, [[1, 1, 1], [2, 2, 2], [3, 3, 3], [4, 4, 4]])
    const value = await harness.tool().execute({ path, max_frames: 999, columns: -5, cell_width: 99999 }, exec())
    expect(value.frameCount).toBe(4)
  })
})

describe('qq_gif_frames 发送', () => {
  it('默认不发', async () => {
    const harness = makeHarness({ canReceive: false })
    const path = join(harness.mediaDir, 'anim.gif')
    writeGif(path, [[5, 5, 5], [6, 6, 6]])
    const value = await harness.tool().execute({ path }, exec())
    expect(harness.sent).toHaveLength(0)
    expect(value.messageId).toBe('')
  })

  it('send 为真时发到会话绑定的那个聊天', async () => {
    const harness = makeHarness({ canReceive: false, boundChat: 'group:60001' })
    const path = join(harness.mediaDir, 'anim.gif')
    writeGif(path, [[7, 7, 7], [8, 8, 8]])
    const value = await harness.tool().execute({ path, send: true }, exec())
    expect(harness.sent).toHaveLength(1)
    expect(harness.sent[0]?.chatId).toBe('group:60001')
    expect(value.messageId).toBe('mid-1')
    expect(value.text).toContain('发到聊天里')
  })

  it('会话没绑定 QQ 聊天时不发，并说清原因', async () => {
    const harness = makeHarness({ canReceive: false })
    const path = join(harness.mediaDir, 'anim.gif')
    writeGif(path, [[3, 3, 3], [4, 4, 4]])
    await expect(harness.tool().execute({ path, send: true }, exec())).rejects.toThrow(/没有绑定 QQ 聊天/)
    expect(harness.sent).toHaveLength(0)
  })
})
