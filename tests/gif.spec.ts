/**
 * T32 GIF 解码与拼图几何的单元测试。
 *
 * 用 `@napi-rs/canvas` 的 GifEncoder 造真实的 GIF 字节（编码器是宿主现成的东西），
 * 再喂给我们自己写的解码器——这样测的是「真格式」而不是「我以为的格式」。
 */
import { GifEncoder } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'

import {
  decodeGif, GIF_MAX_FRAMES, GifError, pickFrames, sheetGeometry,
} from '../src/gif.js'

/** 造一帧纯色 RGBA 像素。 */
function solidRgba(width: number, height: number, rgb: [number, number, number]): Uint8Array {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = rgb[0]
    data[i * 4 + 1] = rgb[1]
    data[i * 4 + 2] = rgb[2]
    data[i * 4 + 3] = 255
  }
  return data
}

/** 用宿主编码器造 GIF。 */
function makeGif(
  size: { width: number; height: number },
  colors: readonly [number, number, number][],
): Uint8Array {
  const encoder = new GifEncoder(size.width, size.height)
  try {
    for (const rgb of colors) {
      encoder.addFrame(solidRgba(size.width, size.height, rgb), size.width, size.height, { delay: 80 })
    }
    return new Uint8Array(encoder.finish())
  } finally {
    encoder.dispose()
  }
}

describe('decodeGif', () => {
  it('解出尺寸、帧数与每帧像素', () => {
    const bytes = makeGif({ width: 4, height: 3 }, [[255, 0, 0], [0, 255, 0]])
    const gif = decodeGif(bytes)
    expect(gif.width).toBe(4)
    expect(gif.height).toBe(3)
    expect(gif.frames).toHaveLength(2)
    expect(gif.frames[0]?.rgba).toHaveLength(4 * 3 * 4)
    // 第一帧红、第二帧绿（NeuQuant 有量化误差，只要求通道关系成立）。
    const first = gif.frames[0]!.rgba
    expect(first[0]).toBeGreaterThan(200)
    expect(first[1]).toBeLessThan(60)
    const second = gif.frames[1]!.rgba
    expect(second[1]).toBeGreaterThan(200)
    expect(second[0]).toBeLessThan(60)
    expect(gif.truncated).toBe(false)
  })

  it('delay 读得出来', () => {
    const gif = decodeGif(makeGif({ width: 2, height: 2 }, [[10, 20, 30], [40, 50, 60]]))
    for (const frame of gif.frames) expect(frame.delayMs).toBeGreaterThan(0)
  })

  it('maxFrames 到顶就算截断', () => {
    const bytes = makeGif({ width: 2, height: 2 }, [[1, 2, 3], [4, 5, 6], [7, 8, 9]])
    const gif = decodeGif(bytes, { maxFrames: 2 })
    expect(gif.frames).toHaveLength(2)
    expect(gif.truncated).toBe(true)
  })

  it('不是 GIF 就报 GifError', () => {
    expect(() => decodeGif(new Uint8Array([1, 2, 3]))).toThrow(GifError)
    expect(() => decodeGif(new Uint8Array(0))).toThrow(/不是 GIF 文件/)
    const notGif = new Uint8Array(32)
    notGif[0] = 0x89
    notGif[1] = 0x50
    notGif[2] = 0x4e
    notGif[3] = 0x47
    notGif[4] = 0x0d
    notGif[5] = 0x0a
    expect(() => decodeGif(notGif)).toThrow(/GIF87a \/ GIF89a/)
  })

  it('半截文件报截断', () => {
    const bytes = makeGif({ width: 4, height: 4 }, [[9, 9, 9], [99, 99, 99]])
    const cut = bytes.slice(0, Math.floor(bytes.length / 2))
    expect(() => decodeGif(cut)).toThrow(/GifError|提前结束|损坏/)
  })

  it('帧数上限是个正的常数', () => {
    expect(GIF_MAX_FRAMES).toBeGreaterThan(1)
  })
})

describe('pickFrames', () => {
  it('要的比有的多就全给', () => {
    expect(pickFrames(3, 10)).toEqual([0, 1, 2])
  })

  it('等距抽样，首末都在，且不重复', () => {
    const picked = pickFrames(10, 4)
    expect(picked).toHaveLength(4)
    expect(picked[0]).toBe(0)
    expect(picked[picked.length - 1]).toBe(9)
    expect(new Set(picked).size).toBe(4)
    for (let i = 1; i < picked.length; i += 1) expect(picked[i]!).toBeGreaterThan(picked[i - 1]!)
  })

  it('只要一帧时拿首帧', () => {
    expect(pickFrames(10, 1)).toEqual([0])
  })
})

describe('sheetGeometry', () => {
  it('按列数与格宽算总尺寸', () => {
    const geometry = sheetGeometry(8, 4, 100, 50, 120)
    expect(geometry.columns).toBe(4)
    expect(geometry.rows).toBe(2)
    expect(geometry.cellWidth).toBe(120)
    expect(geometry.cellHeight).toBe(60)
    expect(geometry.width).toBe(480)
    expect(geometry.height).toBe(120)
  })

  it('列数会被夹到帧数以内', () => {
    const geometry = sheetGeometry(3, 8, 10, 10, 100)
    expect(geometry.columns).toBe(3)
    expect(geometry.rows).toBe(1)
  })
})
