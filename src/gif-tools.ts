/**
 * `qq_gif_frames`（T32）：看一眼动图到底动了什么。
 *
 * 模型一次只能看一张**静态**图。群里发来一张 60 帧的表情动图，直接把它当图片读
 * 只会看到第一帧（`[图片: …gif]` 那条路径读的就是封面），剩下的全丢了。这个工具
 * 把动图等距抽帧、摆成一张网格图，一遍就能看完整个动作过程。
 *
 * 三件事的分工：
 * 1. 解码在 {@link ./gif.ts}（纯字节进、像素出，自己写的 LZW，不依赖 ffmpeg）；
 * 2. 排版与 PNG 在 {@link ./gif-sheet.ts}（canvas 合成，白底 + 格线与序号标注）；
 * 3. 本文件只负责**取文件、走门禁、把结果交给模型或群里**。
 *
 * 门禁沿用发图那条线：路径必须落在 `bridge.mediaSendRoots` 给的范围里（插件媒体
 * 目录永远在，管理员回合再外加会话工作区），所以模型只能看它本来就能发出去的文件，
 * 不是任意路径。看动图本身不改任何 QQ 状态，因此没有回合级门禁，也没有审计。
 *
 * 两个出口，按当前模型路由的能力自动选：
 * - 路由声明了图片输入 → 走宿主附件库（`attachments.saveImage`），拼图作为 image
 *   块随工具结果一起回到模型眼前；
 * - 路由不吃图 / 没有附件服务 → 拼图落到媒体目录，返回路径与说明。**不假装成功**：
 *   模型会看到「当前模型看不了图」，人也能自己打开那个文件。
 *
 * `send` 打开时还会把拼图发进当前聊天（走 `bridge.sendSegments` + `base64://`），
 * 这条路径与 `qq_send_image` 同一个出口，不额外写临时文件。
 * @module dsh-qq-companion/gif-tools
 */
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'

import type { ChatBridge } from './bridge.js'
import { describeError } from './errors.js'
import { decodeGif, GIF_MAX_BYTES, GifError } from './gif.js'
import type { DecodedGif } from './gif.js'
import type { ImageRefPort } from './bridge-types.js'
import { resolveContainedPath } from './media.js'
import {
  renderGifSheet, SHEET_CELL_WIDTH, SHEET_CELL_WIDTH_MAX, SHEET_CELL_WIDTH_MIN, SHEET_COLUMNS, SHEET_MAX_FRAMES,
} from './gif-sheet.js'

/** 一次拼图最多摆几帧（默认值；参数上限见 {@link SHEET_MAX_FRAMES}）。 */
export const GIF_FRAMES_DEFAULT = 12

/** 拼好的图在媒体目录里的文件名前缀（模型看不了图时落盘用）。 */
const SHEET_FILE_PREFIX = 'gif-frames-'

/**
 * 工具结果里附带的图片引用（宿主附件库给的）。
 * 必须整体满足宿主的 `JsonValue`（带索引签名、没有 undefined），否则工具返回值
 * 通不过类型；`name` 缺省时给空串，`render` 里再还原成 image 块。
 */
interface SheetImage {
  [key: string]: string | number
  attachmentId: string
  mediaType: string
  bytes: number
  width: number
  height: number
  name: string
}

/**
 * 工具返回值的形状（也必须是宿主的 `JsonValue`：没有 undefined 字段，两个出口
 * 用同一套键，缺的那个给空值）。
 */
interface SheetResult {
  [key: string]: string | number | SheetImage | null
  text: string
  path: string
  image: SheetImage | null
  frameCount: number
  sourceFrames: number
  messageId: string
}

/**
 * 把端口给的附件引用拍平成纯 JSON（工具返回值必须是 JsonValue，附件引用对象本身
 * 带品牌类型，不能直接塞进返回值；render 里再还原成 image 块）。
 */
function toSheetImage(ref: ImageRefPort): SheetImage {
  return {
    attachmentId: ref.attachmentId,
    mediaType: ref.mediaType,
    bytes: ref.bytes,
    width: ref.width,
    height: ref.height,
    name: ref.name ?? '',
  }
}

/**
 * 目标会话：只认这个会话绑定的 QQ 聊天。参数里给 `chat_id` 也没用——一条聊天里
 * 的回合不该能把图发到别的聊天去。
 * @throws 当前会话没有绑定 QQ 聊天时。
 */
function boundChat(bridge: ChatBridge, exec: ToolRunContext): string {
  const sessionId = exec.agent?.session.id
  const chatId = sessionId === undefined ? undefined : bridge.chatForSession(String(sessionId))
  if (chatId === undefined) {
    throw new Error('qq_gif_frames: 当前会话没有绑定 QQ 聊天，这张拼图没有发出去')
  }
  return chatId
}

/**
 * 把请求里的路径解析成能读的真实路径。
 * @param roots - 允许的根目录。
 * @param path - 模型给的原样路径。
 * @returns 真实路径。
 * @throws 不在允许范围内或文件不存在时（消息直接给模型看，不吞）。
 */
async function fenceInput(roots: readonly string[], path: string): Promise<string> {
  const resolved = await resolveContainedPath([...roots], path)
  if (resolved === null) {
    throw new Error('qq_gif_frames: 这个路径不在允许的媒体目录里，或者文件不存在：' + path
      + '（消息里 `[图片: 路径]` 给出的就是允许的路径；管理员回合还能读会话工作区里的文件）')
  }
  return resolved
}

/** 参数里取一个整数并夹到范围内（非数字 = 用默认值）。 */
function intArg(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

/**
 * 注册 `qq_gif_frames`。
 * @param ctx - 注册作用域（工具随它销毁）。
 * @param bridge - 聊天桥（取媒体目录、发消息）。
 * @param allow - 能力层闸（`qq.send.image` 关掉时这个工具不注册）。
 * @returns 注销函数。
 */
export function registerGifTool(
  ctx: Context,
  bridge: ChatBridge,
  allow?: (toolName: string) => boolean,
): () => void {
  if (allow !== undefined && !allow('qq_gif_frames')) return () => undefined
  return ctx.tools.register(defineTool({
    name: 'qq_gif_frames',
    description: '把一张动图（GIF）等距抽帧、拼成一张静态网格图看清楚它到底怎么动的。'
      + '适合群里发来的表情包动图、教程动图。路径直接用在消息里看到的 `[图片: 路径]`；'
      + '结果是图片本身（当前模型能看图时）或一个可以打开的 PNG 路径。'
      + '不是动图或读不了的文件会直接报错，不会瞎猜。',
    parameters: {
      path: { type: 'string', required: true, description: '动图文件路径（消息里的 `[图片: 路径]` 原样填，必须是本地绝对路径）' },
      max_frames: { type: 'number', description: '最多抽几帧（默认 ' + GIF_FRAMES_DEFAULT + '，1–' + SHEET_MAX_FRAMES + '）；帧多时等距抽，首帧与末帧一定在内' },
      columns: { type: 'number', description: '一行摆几格（默认 ' + SHEET_COLUMNS + '，1–8）' },
      cell_width: { type: 'number', description: '每格宽多少像素（默认 ' + SHEET_CELL_WIDTH + '，' + SHEET_CELL_WIDTH_MIN + '–' + SHEET_CELL_WIDTH_MAX + '）' },
      send: { type: 'boolean', description: 'true = 顺便把这张拼图发在当前聊天里（默认 false，只给你自己看）' },
    },
    output: {
      schema: { type: 'json' as const },
      render: (_args: unknown, value: unknown) => {
        const v = value as { text?: unknown; image?: SheetImage | null }
        const text = typeof v.text === 'string' ? v.text : ''
        // ContentBlock 的联合类型来自 dsh-attachment（插件没链这个包），
        // 这里按运行期形状拼块，再交给定义处的类型收口。
        const image = v.image
        if (image === null || image === undefined) return [{ type: 'text', text }] as never
        const attachment = image.name === '' ? { ...image, name: undefined } : image
        return [{ type: 'text', text }, { type: 'image', attachment }] as never
      },
    },
    // 解码 + 合成就是几毫秒的 CPU 活，互不干扰。
    isConcurrencySafe: () => true,
    execute: async (args, exec): Promise<SheetResult> => {
      const a = args as { path?: unknown; max_frames?: unknown; columns?: unknown; cell_width?: unknown; send?: unknown }
      if (typeof a.path !== 'string' || a.path.trim() === '') throw new Error('qq_gif_frames: path 必填')
      const maxFrames = intArg(a.max_frames, GIF_FRAMES_DEFAULT, 1, SHEET_MAX_FRAMES)
      const columns = intArg(a.columns, SHEET_COLUMNS, 1, 8)
      const cellWidth = intArg(a.cell_width, SHEET_CELL_WIDTH, SHEET_CELL_WIDTH_MIN, SHEET_CELL_WIDTH_MAX)
      const gate = await bridge.mediaSendRoots(exec.agent?.session.id)
      const file = await fenceInput(gate.roots, a.path)
      let size: number
      try {
        size = (await stat(file)).size
      } catch (error) {
        throw new Error('qq_gif_frames: 读不了这个文件（' + describeError(error) + '）：' + file)
      }
      if (size > GIF_MAX_BYTES) {
        throw new Error('qq_gif_frames: 这个文件 ' + Math.round(size / 1024) + ' KB，超过上限 ' + Math.round(GIF_MAX_BYTES / 1024) + ' KB')
      }
      const bytes = await readFile(file)
      let gif: DecodedGif
      try {
        gif = decodeGif(bytes)
      } catch (error) {
        if (error instanceof GifError) throw new Error('qq_gif_frames: ' + error.message)
        throw error
      }
      const sheet = await renderGifSheet(gif, { maxFrames, columns, cellWidth })
      const sent = a.send === true
      let messageId: string | null = null
      if (sent) {
        const chatId = boundChat(bridge, exec)
        messageId = await bridge.sendSegments(chatId, [
          { type: 'image', data: { file: 'base64://' + sheet.png.toString('base64') } },
        ]) ?? null
      }
      const summary = '这张动图 ' + gif.width + '×' + gif.height + ' 像素、共 ' + gif.frames.length + ' 帧'
        + (gif.truncated ? '（只解了前 ' + gif.frames.length + ' 帧）' : '')
        + '；拼图摆了第 ' + sheet.frameIndexes.map((index) => index + 1).join('、') + ' 帧，'
        + '每格左下角标着 `序号/总帧数 · 这一帧停多久`。'
        + (sent ? '拼图也发到聊天里了。' : '')
      const images = bridge.images()
      let image: SheetImage | undefined
      if (images !== undefined && await images.canReceive(exec.agent, exec.signal)) {
        const ref = await images.save(sheet.png, SHEET_FILE_PREFIX + Date.now() + '.png')
        if (ref !== undefined) image = toSheetImage(ref)
      }
      const frames = sheet.frameIndexes.length
      const sourceFrames = gif.frames.length
      const base = { text: summary, path: '', image: null, frameCount: frames, sourceFrames, messageId: messageId ?? '' }
      if (image !== undefined) return { ...base, image }
      // 模型看不了图：落到媒体目录，把路径交出去（人能自己打开）。
      const dir = gate.roots[0] ?? ''
      const target = join(dir, SHEET_FILE_PREFIX + Date.now() + '.png')
      try {
        await writeFile(target, sheet.png)
      } catch (error) {
        throw new Error('qq_gif_frames: 拼图存不下来（' + describeError(error) + '）：' + target)
      }
      const note = images === undefined
        ? '当前没有附件服务，拼图存成了文件。'
        : '当前这条模型路由看不了图片，拼图存成了文件。'
      return { ...base, text: summary + note + '文件在：' + target, path: target }
    },
  }))
}
