/**
 * Sticker library and tools: keep a picture from the chat (tags required,
 * images only, dedupe by content, caps), find by mood, send at most one per
 * reply, owner-only edit/delete; and stickers marked as such when parsed.
 * @module dsh-qq-companion/tests/stickers
 */
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { StickerLibrary, normalizeTags, sniffImage } from '../src/companion/stickers.js'
import { parseMessage } from '../src/cq.js'
import { registerStickerTools, type StickerToolHost } from '../src/sticker-tools.js'

import { makeCmdHarness } from './helpers/bridge-harness.js'

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
const GIF = Buffer.from('GIF89a' + 'x'.repeat(20), 'latin1')

function image(dir: string, name: string, bytes: Buffer = PNG, salt = ''): string {
  const file = join(dir, name)
  writeFileSync(file, Buffer.concat([bytes, Buffer.from(salt)]))
  return file
}

describe('sniffImage / normalizeTags', () => {
  it('recognizes png, jpg, gif, webp by content and nothing else', () => {
    expect(sniffImage(PNG)).toBe('png')
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg')
    expect(sniffImage(GIF)).toBe('gif')
    expect(sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'))).toBe('webp')
    expect(sniffImage(Buffer.from('<svg xmlns='))).toBeUndefined()
  })

  it('cleans, shortens and dedupes tags, at most 8', () => {
    expect(normalizeTags([' 摸头 ', '#可爱', '摸头', 1, '', '一二三四五六七八九十一二三'])).toEqual(['摸头', '可爱', '一二三四五六七八九十一二'])
    expect(normalizeTags(Array.from({ length: 12 }, (_, i) => 't' + i))).toHaveLength(8)
  })
})

describe('StickerLibrary', () => {
  it('saves a copy with tags, persists the index and reloads it', async () => {
    const dir = tmp('stk-'), media = tmp('stk-media-')
    const lib = new StickerLibrary({ dir })
    await lib.load()
    const r = await lib.save(image(media, 'a.png'), ['摸头', '安慰'], '一只猫在摸头', 'group:888')
    expect(r).toMatchObject({ ok: true, merged: false, sticker: { id: 's0001', file: 's0001.png', tags: ['摸头', '安慰'], from: 'group:888' } })
    expect(existsSync(join(dir, 's0001.png'))).toBe(true)
    const again = new StickerLibrary({ dir })
    await again.load()
    expect(again.count).toBe(1)
    expect(again.get('s0001')?.description).toBe('一只猫在摸头')
    const next = await again.save(image(media, 'b.gif', GIF), ['无语'], '', 'private:1')
    expect(next.ok && next.sticker.id).toBe('s0002')
  })

  it('the same picture is kept once; saving it again merges the tags', async () => {
    const dir = tmp('stk-'), media = tmp('stk-media-')
    const lib = new StickerLibrary({ dir })
    await lib.load()
    await lib.save(image(media, 'a.png'), ['摸头'], '', 'group:888')
    const r = await lib.save(image(media, 'copy.png'), ['安慰'], '摸头猫', 'private:1')
    expect(r).toMatchObject({ ok: true, merged: true, sticker: { id: 's0001', tags: ['摸头', '安慰'], description: '摸头猫' } })
    expect(lib.count).toBe(1)
  })

  it('concurrent saves of the same picture still keep one copy', async () => {
    const dir = tmp('stk-'), media = tmp('stk-media-')
    const lib = new StickerLibrary({ dir })
    await lib.load()
    const results = await Promise.all([1, 2, 3].map(i => lib.save(image(media, i + '.png'), ['t' + i], '', 'g')))
    expect(lib.count).toBe(1)
    expect(results.filter(r => r.ok && !r.merged)).toHaveLength(1)
  })

  it('refuses: no tags, not an image, too big, library full, daily cap', async () => {
    const dir = tmp('stk-'), media = tmp('stk-media-')
    const lib = new StickerLibrary({ dir, maxCount: 2, maxBytes: 64, dailyMax: 5 })
    await lib.load()
    expect(await lib.save(image(media, 'a.png'), [], '', 'g')).toMatchObject({ ok: false, reason: expect.stringContaining('标签') })
    expect(await lib.save(image(media, 'x.txt', Buffer.from('hello')), ['t'], '', 'g')).toMatchObject({ ok: false, reason: expect.stringContaining('不是') })
    expect(await lib.save(image(media, 'big.png', PNG, 'x'.repeat(100)), ['t'], '', 'g')).toMatchObject({ ok: false, reason: expect.stringContaining('太大') })
    expect(await lib.save(join(media, 'missing.png'), ['t'], '', 'g')).toMatchObject({ ok: false, reason: expect.stringContaining('找不到') })
    await lib.save(image(media, '1.png', PNG, '1'), ['t'], '', 'g')
    await lib.save(image(media, '2.png', PNG, '2'), ['t'], '', 'g')
    expect(await lib.save(image(media, '3.png', PNG, '3'), ['t'], '', 'g')).toMatchObject({ ok: false, reason: expect.stringContaining('满了') })

    const daily = new StickerLibrary({ dir: tmp('stk-'), dailyMax: 2 })
    await daily.load()
    await daily.save(image(media, 'd1.png', PNG, 'd1'), ['t'], '', 'g')
    await daily.save(image(media, 'd2.png', PNG, 'd2'), ['t'], '', 'g')
    expect(await daily.save(image(media, 'd3.png', PNG, 'd3'), ['t'], '', 'g')).toMatchObject({ ok: false, reason: expect.stringContaining('明天') })
    // merging tags into a kept picture does not count against the daily cap
    expect(await daily.save(image(media, 'd1-again.png', PNG, 'd1'), ['新'], '', 'g')).toMatchObject({ ok: true, merged: true })
  })

  it('searches tags and descriptions, least used first; today lists new ones', async () => {
    let now = new Date(2026, 9, 19, 12).getTime()
    const dir = tmp('stk-'), media = tmp('stk-media-')
    const lib = new StickerLibrary({ dir, now: () => now })
    await lib.load()
    await lib.save(image(media, '1.png', PNG, '1'), ['摸头', '安慰'], '猫猫', 'g')
    now = new Date(2026, 9, 20, 12).getTime()
    await lib.save(image(media, '2.png', PNG, '2'), ['摸头'], '狗狗', 'g')
    await lib.save(image(media, '3.png', PNG, '3'), ['无语'], '黑人问号', 'g')
    await lib.markUsed('s0002')
    expect(lib.search('摸头').map(s => s.id)).toEqual(['s0001', 's0002'])
    expect(lib.search('安慰 摸头')[0].id).toBe('s0001')
    expect(lib.search('问号').map(s => s.id)).toEqual(['s0003'])
    // 空查询不再是空：先给最常用的，再按新到旧补齐。
    expect(lib.search('')).toEqual([lib.get('s0002'), lib.get('s0003'), lib.get('s0001')])
    expect(lib.search('   ')).toEqual(lib.search(''))
    expect(lib.search('', { today: true }).map(s => s.id)).toEqual(['s0002', 's0003'])
    expect(lib.snapshot()).toEqual({ count: 3, maxCount: 300, today: 2, dailyMax: 20 })
  })

  it('an empty query gives the shelf: most used first, newest filling the rest, no repeats, capped by limit', async () => {
    let now = new Date(2026, 9, 19, 11).getTime()
    const dir = tmp('stk-'), media = tmp('stk-media-')
    const lib = new StickerLibrary({ dir, now: () => now })
    await lib.load()
    for (let i = 1; i <= 6; i += 1) {
      now = new Date(2026, 9, 19, 11 + i).getTime()
      await lib.save(image(media, i + '.png', PNG, String(i)), ['t' + i], '', 'g')
    }
    await lib.markUsed('s0005')
    await lib.markUsed('s0005')
    await lib.markUsed('s0002')
    // 前一半（3 张）按 uses 降序：s0005(2)、s0002(1)、然后是没发过里最新的 s0006；
    // 后用「最新」补齐：s0006 已在清单里，跳过，补 s0004、s0003。
    expect(lib.search('').map(s => s.id)).toEqual(['s0005', 's0002', 's0006', 's0004', 's0003'])
    expect(lib.search('', { limit: 2 }).map(s => s.id)).toEqual(['s0005', 's0006'])
    expect(lib.search('', { limit: 1 }).map(s => s.id)).toEqual(['s0005'])
    // 上限不会被「补齐」突破，重复也不会出现
    expect(new Set(lib.search('').map(s => s.id)).size).toBe(lib.search('').length)
  })

  it('findByFile: the same content is recognized however it is named; missing, different and oversized files are not', async () => {
    const dir = tmp('stk-'), media = tmp('stk-media-')
    const lib = new StickerLibrary({ dir, maxBytes: 64 })
    await lib.load()
    const kept = image(media, 'a.png', PNG, 'kept')
    expect(await lib.save(kept, ['摸头', '安慰', '开心', '可爱'], '摸头猫', 'g')).toMatchObject({ ok: true, sticker: { id: 's0001' } })
    // 同一张图又发了一次（换了文件名），认得出
    expect((await lib.findByFile(image(media, 'copy.png', PNG, 'kept')))?.id).toBe('s0001')
    expect((await lib.findByFile(kept))?.id).toBe('s0001')
    // 库里那张文件本身也是同一个哈希
    expect((await lib.findByFile(join(dir, 's0001.png')))?.id).toBe('s0001')
    // 内容不同 / 文件不存在 / 比单张上限大 → 都没有匹配
    expect(await lib.findByFile(image(media, 'other.png', PNG, 'other'))).toBeUndefined()
    expect(await lib.findByFile(join(media, 'missing.png'))).toBeUndefined()
    expect(await lib.findByFile(image(media, 'big.png', PNG, 'x'.repeat(100)))).toBeUndefined()
  })

  it('edits and deletes (file removed); a corrupt index loads as empty', async () => {
    const dir = tmp('stk-'), media = tmp('stk-media-')
    const lib = new StickerLibrary({ dir })
    await lib.load()
    await lib.save(image(media, '1.png'), ['旧'], '', 'g')
    expect((await lib.edit('s0001', { tags: ['新', '标签'], description: '改过' }))?.tags).toEqual(['新', '标签'])
    expect(await lib.delete('s0001')).toBe(true)
    expect(existsSync(join(dir, 's0001.png'))).toBe(false)
    expect(await lib.delete('s0001')).toBe(false)
    writeFileSync(join(dir, 'index.json'), '{ broken')
    const logs: string[] = []
    const reloaded = new StickerLibrary({ dir, log: (_l, m) => logs.push(m) })
    await reloaded.load()
    expect(reloaded.count).toBe(0)
    expect(logs.join()).toContain('表情包索引读取失败')
  })
})

describe('sticker tools', () => {
  type Tool = { name: string; execute: (args: unknown, exec: unknown) => Promise<unknown> }
  async function setup(opts: { admin?: boolean } = {}) {
    const dir = tmp('stk-'), media = tmp('stk-media-')
    const lib = new StickerLibrary({ dir })
    await lib.load()
    const tools = new Map<string, Tool>()
    const ctx = { tools: { register: (t: Tool) => { tools.set(t.name, t); return () => undefined } } }
    const sent: unknown[] = []
    const slots = new Set<string>()
    const host: StickerToolHost = {
      chatForSession: () => 'group:888',
      canEditFiles: () => opts.admin === true,
      mediaSendRoots: async () => ({ roots: [media] }),
      takeStickerSlot: chatId => { if (slots.has(chatId)) return false; slots.add(chatId); return true },
      sendSegments: vi.fn(async (_chat, segments) => { sent.push(segments); return '42' }),
    }
    registerStickerTools(ctx as never, host, lib)
    const exec = { agent: { session: { id: 'sess-1' } } }
    const run = (name: string, args: unknown) => tools.get(name)!.execute(args, exec)
    return { lib, media, run, sent, slots, tools }
  }

  it('registers the five tools', async () => {
    const { tools } = await setup()
    expect([...tools.keys()].sort()).toEqual(['qq_sticker_delete', 'qq_sticker_edit', 'qq_sticker_save', 'qq_sticker_search', 'qq_sticker_send'])
  })

  it('save only takes pictures from the chat media dir', async () => {
    const { run, media } = await setup()
    expect(await run('qq_sticker_save', { path: image(media, 'a.png'), tags: ['开心'], description: '笑脸' })).toMatchObject({ ok: true, id: 's0001' })
    const outside = image(tmp('elsewhere-'), 'b.png', PNG, 'b')
    expect(await run('qq_sticker_save', { path: outside, tags: ['开心'] })).toMatchObject({ ok: false, reason: expect.stringContaining('只能存聊天里收到的图片') })
  })

  it('send: one sticker per reply, as a QQ sticker segment, and counts the use', async () => {
    const { run, media, sent, slots, lib } = await setup()
    await run('qq_sticker_save', { path: image(media, 'a.png'), tags: ['开心'] })
    expect(await run('qq_sticker_send', { id: 's0001' })).toMatchObject({ sent: true, messageId: '42' })
    expect(sent[0]).toEqual([{ type: 'image', data: { file: expect.stringMatching(/^base64:\/\//), sub_type: 1, summary: '[动画表情]' } }])
    expect(await run('qq_sticker_send', { id: 's0001' })).toMatchObject({ sent: false, reason: expect.stringContaining('已经发过') })
    expect(lib.get('s0001')?.uses).toBe(1)
    slots.clear() // next turn
    expect(await run('qq_sticker_send', { id: 'nope' })).toMatchObject({ sent: false, reason: expect.stringContaining('没有这个编号') })
  })

  it('edit and delete need the owner (or the nightly task)', async () => {
    const member = await setup()
    await member.run('qq_sticker_save', { path: image(member.media, 'a.png'), tags: ['开心'] })
    expect(await member.run('qq_sticker_delete', { id: 's0001' })).toMatchObject({ ok: false, reason: expect.stringContaining('主人') })
    expect(await member.run('qq_sticker_edit', { id: 's0001', tags: ['x'] })).toMatchObject({ ok: false })
    expect(member.lib.count).toBe(1)

    const owner = await setup({ admin: true })
    await owner.run('qq_sticker_save', { path: image(owner.media, 'a.png'), tags: ['开心'] })
    expect(await owner.run('qq_sticker_edit', { id: 's0001', tags: ['大笑'] })).toMatchObject({ ok: true, tags: ['大笑'] })
    expect(await owner.run('qq_sticker_delete', { id: 's0001' })).toEqual({ ok: true })
    expect(owner.lib.count).toBe(0)
  })

  it('search returns brief entries', async () => {
    const { run, media } = await setup()
    await run('qq_sticker_save', { path: image(media, 'a.png'), tags: ['摸头'], description: '摸摸' })
    expect(await run('qq_sticker_search', { query: '摸头' })).toEqual([{ id: 's0001', tags: ['摸头'], description: '摸摸', uses: 0 }])
  })
})

describe('stickers are marked when parsed', () => {
  it('NapCat sticker (sub_type as a number) → sticker media and [表情包]', () => {
    const parsed = parseMessage([{ type: 'image', data: { file: 'a.gif', url: 'https://x/a.gif', sub_type: 1 as unknown as string, summary: '[动画表情]' } }], '')
    expect(parsed.text).toBe('[表情包]')
    expect(parsed.media).toEqual([expect.objectContaining({ kind: 'image', sticker: true, subType: '1' })])
  })

  it('a photo stays an image; a CQ string sticker is a sticker too', () => {
    expect(parseMessage([{ type: 'image', data: { file: 'p.jpg', sub_type: 0 as unknown as string } }], '').text).toBe('[图片]')
    const cq = parseMessage(undefined, '[CQ:image,file=a.gif,sub_type=1]')
    expect(cq.text).toBe('[表情包]')
    expect(cq.media[0].sticker).toBe(true)
  })

  it('商城表情 (mface): fetched as a sticker with a URL, otherwise its name', () => {
    expect(parseMessage([{ type: 'mface', data: { url: 'https://x/m.gif', summary: '[狗头]' } }], '').media[0]).toMatchObject({ kind: 'image', sticker: true })
    expect(parseMessage([{ type: 'mface', data: { summary: '[狗头]' } }], '')).toMatchObject({ text: '[狗头]', media: [] })
  })
})

describe('a sticker reaches her as [表情包:path]', () => {
  it('a received QQ sticker is fetched and annotated as a sticker, a photo as an image', async () => {
    const h = await makeCmdHarness()
    const b64 = 'base64://' + PNG.toString('base64')
    h.client.send(JSON.stringify({
      post_type: 'message', message_type: 'private', user_id: 10001, self_id: 10002,
      message: [{ type: 'image', data: { file: b64, sub_type: 1, summary: '[动画表情]' } }, { type: 'image', data: { file: 'base64://' + Buffer.concat([PNG, Buffer.from('p')]).toString('base64'), sub_type: 0 } }],
      raw_message: '[CQ:image][CQ:image]', sender: { user_id: 10001, nickname: '主人' },
    }))
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    // 表情包库没开启：两个占位符都原样替换成路径，谁也不带收藏标注。
    expect(h.captured.followups[0].text).toMatch(/\[表情包:[^\]]+\]\[图片:[^\]]+\]/)
    expect(h.captured.followups[0].text).not.toContain('还没收藏')
    expect(h.captured.followups[0].text).not.toContain('库里已有')
    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  })
})

describe('an incoming sticker says whether she already kept it', () => {
  /** Send one message carrying a sticker (sub_type 1) and a photo (sub_type 0). */
  async function inbound(opts: { stickers?: unknown } = {}): Promise<string> {
    const h = await makeCmdHarness(opts)
    const sticker = 'base64://' + PNG.toString('base64')
    const photo = 'base64://' + Buffer.concat([PNG, Buffer.from('photo')]).toString('base64')
    h.client.send(JSON.stringify({
      post_type: 'message', message_type: 'private', user_id: 10001, self_id: 10002,
      message: [
        { type: 'image', data: { file: sticker, sub_type: 1, summary: '[动画表情]' } },
        { type: 'image', data: { file: photo, sub_type: 0 } },
      ],
      raw_message: '[CQ:image][CQ:image]', sender: { user_id: 10001, nickname: '主人' },
    }))
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    const text = h.captured.followups[0].text
    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
    return text
  }

  it('not kept yet: 「（还没收藏）」 right after the sticker bracket, and never after a photo', async () => {
    const lib = new StickerLibrary({ dir: tmp('stk-') })
    await lib.load()
    const text = await inbound({ stickers: lib })
    expect(text).toMatch(/\[表情包:[^\]]+\]（还没收藏）/)
    // 括号里仍然是纯路径，标注在括号外
    expect(text).not.toMatch(/\[表情包:[^\]]*（/)
    // 普通图片 [图片:…] 不标注
    expect(text).toMatch(/\[图片:[^\]]+\](?!（)/)
    expect(text.match(/（还没收藏）/g)).toHaveLength(1)
  })

  it('over the per-image cap: 「（太大了存不下）」, not a nudge to save something save() would refuse', async () => {
    // 库的单张上限只有 16 字节，这张表情包 100 字节，qq_sticker_save 一定被拒。
    const lib = new StickerLibrary({ dir: tmp('stk-'), maxBytes: 16 })
    await lib.load()
    const tooBig = Buffer.concat([PNG, Buffer.alloc(84)])
    const h = await makeCmdHarness({ stickers: lib })
    h.client.send(JSON.stringify({
      post_type: 'message', message_type: 'private', user_id: 10001, self_id: 10002,
      message: [{ type: 'image', data: { file: 'base64://' + tooBig.toString('base64'), sub_type: 1, summary: '[动画表情]' } }],
      raw_message: '[CQ:image]', sender: { user_id: 10001, nickname: '主人' },
    }))
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    const text = h.captured.followups[0].text
    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
    expect(text).toMatch(/\[表情包:[^\]]+\]（太大了存不下）/)
    expect(text).not.toContain('还没收藏')
    expect(text).not.toContain('库里已有')
    // 标注说的就是真话：同一张图交给 qq_sticker_save 确实存不进来。
    const path = /\[表情包:([^\]]+)\]/.exec(text)?.[1] ?? ''
    expect(await lib.save(path, ['摸头'], '', 'private:10001')).toMatchObject({ ok: false })
  })

  it('already kept: 「（库里已有 <id>：<前 3 个标签>）」', async () => {
    const dir = tmp('stk-'), media = tmp('stk-media-')
    const lib = new StickerLibrary({ dir })
    await lib.load()
    await lib.save(image(media, 'saved.png', PNG), ['摸头', '安慰', '开心', '可爱'], '摸头猫', 'group:888')
    const text = await inbound({ stickers: lib })
    expect(text).toMatch(/\[表情包:[^\]]+\]（库里已有 s0001：摸头、安慰、开心）/)
    expect(text).not.toContain('还没收藏')
  })

  it('a lookup failure only drops the label, the message still goes through', async () => {
    const broken = { classifyFile: async () => { throw new Error('index.json 读坏了') } }
    const text = await inbound({ stickers: broken })
    expect(text).toMatch(/\[表情包:[^\]]+\]/)
    expect(text).not.toContain('还没收藏')
    expect(text).not.toContain('库里已有')
  })
})
