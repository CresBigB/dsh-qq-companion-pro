/**
 * GIF 解码（T32）：把一张动图拆成若干帧，交给拼图工具摆成一张静态图。
 *
 * 为什么要自己解而不是调 ffmpeg：这台机器上 `ffmpeg` / `ffprobe` 都不在 PATH
 * 里（`Get-Command ffmpeg` 为空），而语音合成那条路已经是「探到程序才启用」，
 * 查看动图这种基础能力不该因为对方没装 ffmpeg 就整个不可用。GIF 的格式又足够小
 * ——文件头 + 全局调色板 + 一串「扩展块 / 图像块」+ LZW 压缩的索引数据——自己解
 * 一遍不到三百行，还没有子进程、没有临时文件、没有平台差异。
 *
 * 这个模块是**纯函数**：只吃 `Uint8Array`、只吐 RGBA 像素，不碰画布、不碰文件
 * 系统，所以单测可以直接用几段手写的最小 GIF 字节覆盖 LZW、隔行、透明与
 * disposal 这些分支。合成 PNG 与排版在 {@link ./gif-sheet.ts}。
 *
 * 解出来的每一帧都是**整幅画面**的 RGBA（不是那一小块矩形）：GIF 的一帧只覆盖
 * 画面的一部分，剩下靠前一帧留在画布上的内容和 disposal 规则补齐，所以这里自己
 * 维护一块画布，按帧序把它走完——这跟「把每一帧贴到正确位置」是一回事。
 *
 * 已知取舍（真机没验的地方写在这里，而不是悄悄假设）：
 * - **不还原 disposal = 2 的背景色**：规范说清回背景色，但背景色索引指向的仍是
 *   调色板里的颜色，而绝大多数动图并不真的想要那块底色。这里按「清成透明」处理，
 *   拼图时再铺白底——结果是白底还是透明底都看得清，不会出现一圈莫名的黑块。
 * - **首帧之前的画布按透明**，不填背景色，理由同上。
 * - **单帧延迟 ≤10ms 按 100ms**：老播放器的「最快帧」约定，只影响
 *   {@link GifFrame.delayMs} 的展示，不影响抽帧。
 * @module dsh-qq-companion/gif
 */

/** 一张动图最多解多少帧（超出的帧直接不看；防止几百帧的大图把内存吃光）。 */
export const GIF_MAX_FRAMES = 240

/** 解出来的画面像素上限（宽 × 高）；再大就当作不是给人看的动图。 */
export const GIF_MAX_PIXELS = 4096 * 4096

/** GIF 一律用这个内部尺寸上限（字节数由调用方另外限）。 */
export const GIF_MAX_BYTES = 32 * 1024 * 1024

/** 解码失败：文件不是 GIF、被截断，或者 LZW 数据自相矛盾。 */
export class GifError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GifError'
  }
}

/** 一帧：整幅画面的 RGBA（`width * height * 4` 字节，行优先，非预乘）。 */
export interface GifFrame {
  readonly rgba: Uint8Array
  /** 这一帧该显示多久（毫秒；已按「≤10ms 视为 100ms」修正）。 */
  readonly delayMs: number
}

/** 解完的动图。 */
export interface DecodedGif {
  readonly width: number
  readonly height: number
  readonly frames: readonly GifFrame[]
  /** 循环次数（`NETSCAPE2.0` 应用扩展里的值；缺席 = undefined，0 = 无限）。 */
  readonly loop: number | undefined
  /** 是否因为 {@link GIF_MAX_FRAMES} 截断了尾巴。 */
  readonly truncated: boolean
}

/** 解码选项。 */
export interface DecodeGifOptions {
  /** 最多解多少帧（默认 {@link GIF_MAX_FRAMES}）。 */
  maxFrames?: number
}

const TRAILER = 0x3b
const EXTENSION = 0x21
const IMAGE_DESCRIPTOR = 0x2c
const GRAPHIC_CONTROL = 0xf9
const APPLICATION = 0xff

/** 读小端 16 位。 */
function readU16(bytes: Uint8Array, at: number): number {
  return bytes[at]! | (bytes[at + 1]! << 8)
}

/** 把一段字节按 latin1 读成字符串（扩展块标识用，ASCII 就够）。 */
function latin1(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) out += String.fromCharCode(byte)
  return out
}

/**
 * LZW 解压一帧的索引数据。
 *
 * GIF 的 LZW 与 TIFF 那套的差别只有两点：码长从 `minCodeSize + 1` 起步，以及
 * 清空码 / 结束码紧跟在调色板项数之后。码是 LSB 优先、跨字节连续的。
 * @param data - 拼接后的子块数据。
 * @param minCodeSize - 图像块里写的 LZW 最小码长（2 … 8）。
 * @param pixelCount - 这一帧矩形里的像素数（解满即停，多余的码不管）。
 * @returns 长度恰好 `pixelCount` 的调色板索引。
 */
export function lzwDecode(data: Uint8Array, minCodeSize: number, pixelCount: number): Uint8Array {
  const clear = 1 << minCodeSize
  const eoi = clear + 1
  const out = new Uint8Array(pixelCount)
  const prefix = new Int32Array(4096).fill(-1)
  const suffix = new Uint8Array(4096)
  const first = new Uint8Array(4096)
  const stack = new Uint8Array(4097)
  for (let code = 0; code < clear; code += 1) {
    suffix[code] = code
    first[code] = code
  }
  let codeSize = minCodeSize + 1
  let next = eoi + 1
  let previous = -1
  let bitPos = 0
  let outPos = 0

  const readCode = (): number | undefined => {
    let code = 0
    for (let bit = 0; bit < codeSize; bit += 1) {
      const byteAt = bitPos >> 3
      if (byteAt >= data.length) return undefined
      const bitValue = (data[byteAt]! >> (bitPos & 7)) & 1
      code |= bitValue << bit
      bitPos += 1
    }
    return code
  }

  while (outPos < pixelCount) {
    const code = readCode()
    if (code === undefined) break
    if (code === clear) {
      codeSize = minCodeSize + 1
      next = eoi + 1
      previous = -1
      continue
    }
    if (code === eoi) break
    let current = code
    let top = 0
    if (code > next) throw new GifError('GIF 数据损坏（LZW 出现了还不存在的码）')
    if (code === next) {
      // 经典的「 KwKwK 」情形：码刚要用，就是上一段 + 它的首字节。
      if (previous < 0) throw new GifError('GIF 数据损坏（LZW 首个码就没有前驱）')
      stack[top++] = first[previous]!
      current = previous
    }
    while (current > clear) {
      stack[top++] = suffix[current]!
      current = prefix[current]!
      if (top > 4096) throw new GifError('GIF 数据损坏（LZW 字典回环）')
    }
    stack[top++] = current
    const head = stack[top - 1]!
    if (previous >= 0 && next < 4096) {
      prefix[next] = previous
      suffix[next] = head
      first[next] = first[previous]!
      next += 1
      if (next >= 1 << codeSize && codeSize < 12) codeSize += 1
    } else if (previous < 0) {
      // 第一段码：只建立字典之外的东西，没有新词。
    }
    while (top > 0 && outPos < pixelCount) out[outPos++] = stack[--top]!
    previous = code
  }
  return out
}

/** 隔行扫描的四个 pass（起始行，步长）。 */
const INTERLACE_PASSES: ReadonlyArray<readonly [number, number]> = [[0, 8], [4, 8], [2, 4], [1, 2]]

/** 一帧图像块的表头信息。 */
interface ImageBlock {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
  readonly interlaced: boolean
  readonly palette: Uint8Array
  readonly transparentIndex: number
  readonly disposal: number
  readonly delayMs: number
  readonly indices: Uint8Array
}

/**
 * 把一帧画到画布上（就地修改）。
 * @param canvas - 整幅画面的 RGBA 缓冲。
 * @param canvasWidth - 画面宽（像素）。
 * @param canvasHeight - 画面高（像素）。
 * @param frame - 这一帧的图像块。
 */
function paint(canvas: Uint8Array, canvasWidth: number, canvasHeight: number, frame: ImageBlock): void {
  let stream = 0
  const emitRow = (row: number): void => {
    if (row < 0 || row >= canvasHeight) {
      stream += frame.width
      return
    }
    for (let x = 0; x < frame.width; x += 1) {
      const index = frame.indices[stream++]!
      const px = frame.left + x
      if (px < 0 || px >= canvasWidth) continue
      if (frame.transparentIndex >= 0 && index === frame.transparentIndex) continue
      const at = (row * canvasWidth + px) * 4
      const color = index * 3
      canvas[at] = frame.palette[color] ?? 0
      canvas[at + 1] = frame.palette[color + 1] ?? 0
      canvas[at + 2] = frame.palette[color + 2] ?? 0
      canvas[at + 3] = 255
    }
  }
  if (frame.interlaced) {
    for (const [start, step] of INTERLACE_PASSES) {
      for (let row = start; row < frame.height; row += step) emitRow(frame.top + row)
    }
  } else {
    for (let row = 0; row < frame.height; row += 1) emitRow(frame.top + row)
  }
}

/** 清空一块矩形（就地）。 */
function clearRect(canvas: Uint8Array, canvasWidth: number, canvasHeight: number, frame: ImageBlock): void {
  for (let row = 0; row < frame.height; row += 1) {
    const y = frame.top + row
    if (y < 0 || y >= canvasHeight) continue
    for (let x = 0; x < frame.width; x += 1) {
      const px = frame.left + x
      if (px < 0 || px >= canvasWidth) continue
      const at = (y * canvasWidth + px) * 4
      canvas[at] = 0
      canvas[at + 1] = 0
      canvas[at + 2] = 0
      canvas[at + 3] = 0
    }
  }
}

/**
 * 解一张 GIF。
 * @param bytes - 完整文件字节。
 * @param options - 解码选项。
 * @returns 画面尺寸、逐帧 RGBA 与循环信息。
 * @throws GifError 文件不是 GIF、被截断、尺寸超限或 LZW 数据矛盾。
 */
export function decodeGif(bytes: Uint8Array, options: DecodeGifOptions = {}): DecodedGif {
  const maxFrames = Math.max(1, Math.trunc(options.maxFrames ?? GIF_MAX_FRAMES))
  if (bytes.length < 13) throw new GifError('不是 GIF 文件（长度不够放一个文件头）')
  const signature = latin1(bytes.subarray(0, 3))
  if (signature !== 'GIF') throw new GifError('不是 GIF 文件（文件头不是 GIF87a / GIF89a）')
  const version = latin1(bytes.subarray(3, 6))
  if (version !== '87a' && version !== '89a') throw new GifError('不是已知的 GIF 版本：GIF' + version)

  const width = readU16(bytes, 6)
  const height = readU16(bytes, 8)
  if (width === 0 || height === 0) throw new GifError('GIF 画面尺寸为 0')
  if (width * height > GIF_MAX_PIXELS) {
    throw new GifError('GIF 画面 ' + width + '×' + height + ' 像素，超过上限 ' + GIF_MAX_PIXELS + ' 像素')
  }

  const packed = bytes[10]!
  const paletteOffset = 13
  let pos = paletteOffset
  const need = (count: number, what: string): void => {
    if (pos + count > bytes.length) throw new GifError('GIF 数据在' + what + '处提前结束（文件可能被截断）')
  }
  let globalPalette: Uint8Array | undefined
  if ((packed & 0x80) !== 0) {
    const size = 3 << ((packed & 0x07) + 1)
    need(size, '全局调色板')
    globalPalette = bytes.subarray(pos, pos + size)
    pos += size
  }

  const canvas = new Uint8Array(width * height * 4)
  const frames: GifFrame[] = []
  let loop: number | undefined
  let truncated = false
  // 待生效的图形控制扩展（它总是紧挨在图像块之前）。
  let disposal = 0
  let transparentIndex = -1
  let delayMs = 0

  while (pos < bytes.length) {
    const marker = bytes[pos++]!
    if (marker === TRAILER) break
    if (marker === EXTENSION) {
      need(1, '扩展块')
      const label = bytes[pos++]!
      if (label === GRAPHIC_CONTROL) {
        need(1, '图形控制扩展')
        const size = bytes[pos++]!
        need(size, '图形控制扩展')
        if (size >= 4) {
          const control = bytes[pos]!
          disposal = (control >> 2) & 0x07
          const centis = readU16(bytes, pos + 1)
          delayMs = centis <= 1 ? 100 : centis * 10
          transparentIndex = (control & 0x01) !== 0 ? bytes[pos + 3]! : -1
        }
        pos += size
        // 子块结束符
        need(1, '图形控制扩展结束符')
        pos += 1
        continue
      }
      if (label === APPLICATION) {
        need(1, '应用扩展')
        const size = bytes[pos++]!
        need(size, '应用扩展')
        const identifier = latin1(bytes.subarray(pos, pos + size))
        pos += size
        while (true) {
          need(1, '应用扩展子块')
          const blockSize = bytes[pos++]!
          if (blockSize === 0) break
          need(blockSize, '应用扩展子块')
          if (identifier.startsWith('NETSCAPE') && blockSize >= 3 && bytes[pos] === 0x01) {
            loop = readU16(bytes, pos + 1)
          }
          pos += blockSize
        }
        continue
      }
      // 其余扩展（注释 / 纯文本）：跳过所有子块。
      while (true) {
        need(1, '扩展块子块')
        const blockSize = bytes[pos++]!
        if (blockSize === 0) break
        need(blockSize, '扩展块子块')
        pos += blockSize
      }
      continue
    }
    if (marker !== IMAGE_DESCRIPTOR) {
      throw new GifError('GIF 数据损坏（未知的块标记 0x' + marker.toString(16) + '）')
    }
    need(9, '图像描述块')
    const left = readU16(bytes, pos)
    const top = readU16(bytes, pos + 2)
    const frameWidth = readU16(bytes, pos + 4)
    const frameHeight = readU16(bytes, pos + 6)
    const descriptor = bytes[pos + 8]!
    pos += 9
    let palette = globalPalette
    if ((descriptor & 0x80) !== 0) {
      const size = 3 << ((descriptor & 0x07) + 1)
      need(size, '局部调色板')
      palette = bytes.subarray(pos, pos + size)
      pos += size
    }
    if (palette === undefined) throw new GifError('GIF 数据损坏（这一帧既没有局部调色板也没有全局调色板）')
    need(1, '图像块')
    const minCodeSize = bytes[pos++]!
    if (minCodeSize < 2 || minCodeSize > 8) {
      throw new GifError('GIF 数据损坏（LZW 最小码长 ' + minCodeSize + ' 不合法）')
    }
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      need(1, '图像数据子块')
      const blockSize = bytes[pos++]!
      if (blockSize === 0) break
      need(blockSize, '图像数据子块')
      chunks.push(bytes.subarray(pos, pos + blockSize))
      total += blockSize
      pos += blockSize
    }
    const compressed = new Uint8Array(total)
    let chunkPos = 0
    for (const chunk of chunks) {
      compressed.set(chunk, chunkPos)
      chunkPos += chunk.length
    }
    if (frameWidth === 0 || frameHeight === 0) continue
    const indices = lzwDecode(compressed, minCodeSize, frameWidth * frameHeight)
    const block: ImageBlock = {
      left, top, width: frameWidth, height: frameHeight,
      interlaced: (descriptor & 0x40) !== 0,
      palette, transparentIndex, disposal, delayMs, indices,
    }
    const restore = disposal === 3 ? canvas.slice() : undefined
    paint(canvas, width, height, block)
    frames.push({ rgba: canvas.slice(), delayMs: block.delayMs })
    if (disposal === 2) clearRect(canvas, width, height, block)
    else if (restore !== undefined) canvas.set(restore)
    // 图形控制扩展只作用于紧跟的那一帧。
    disposal = 0
    transparentIndex = -1
    delayMs = 0
    if (frames.length >= maxFrames) {
      truncated = pos < bytes.length && bytes[pos] !== TRAILER
      break
    }
  }
  if (frames.length === 0) throw new GifError('这张 GIF 里一帧都没有')
  return { width, height, frames, loop, truncated }
}

/**
 * 从 `count` 帧里等距挑出至多 `max` 帧（含首帧与末帧）。
 * @param count - 总帧数。
 * @param max - 最多要几个。
 * @returns 递增的下标数组（无重复）。
 */
export function pickFrames(count: number, max: number): number[] {
  const total = Math.max(0, Math.trunc(count))
  const want = Math.max(1, Math.trunc(max))
  if (total === 0) return []
  if (total <= want) return Array.from({ length: total }, (_value, index) => index)
  if (want === 1) return [0]
  const picked: number[] = []
  for (let i = 0; i < want; i += 1) {
    const index = Math.round((i * (total - 1)) / (want - 1))
    if (picked[picked.length - 1] !== index) picked.push(index)
  }
  return picked
}

/** 拼图的网格尺寸（不含标签）。 */
export interface SheetGeometry {
  readonly columns: number
  readonly rows: number
  readonly cellWidth: number
  readonly cellHeight: number
  readonly width: number
  readonly height: number
}

/**
 * 算一格多大、一共几行几列。
 * @param frameCount - 要摆几格。
 * @param columns - 想要的列数（会夹到 1 … frameCount）。
 * @param sourceWidth - 原图宽（用来按比例算格高）。
 * @param sourceHeight - 原图高。
 * @param cellWidth - 每格宽（像素，调用方已经夹过范围）。
 * @returns 网格几何。
 */
export function sheetGeometry(
  frameCount: number,
  columns: number,
  sourceWidth: number,
  sourceHeight: number,
  cellWidth: number,
): SheetGeometry {
  const count = Math.max(1, Math.trunc(frameCount))
  const cols = Math.min(count, Math.max(1, Math.trunc(columns)))
  const rows = Math.ceil(count / cols)
  const ratio = sourceWidth > 0 ? sourceHeight / sourceWidth : 1
  const cw = Math.max(1, Math.trunc(cellWidth))
  const ch = Math.max(1, Math.round(cw * ratio))
  return { columns: cols, rows, cellWidth: cw, cellHeight: ch, width: cols * cw, height: rows * ch }
}
