/**
 * T9 · 输出协议 B 档：正文**最后一行**的单行控制块
 * `【控制】{"reply":true,"why":"…","send":["…"],"quote":"…"}`。
 *
 * 覆盖（方案把「不变式」列为最高优先级回归断言）：
 *   ① 纯函数 parseControlBlock：只认最后一行 / 容忍括号空白 / 写错 JSON 整段原样 /
 *      单字段类型错只丢那个字段 / why·send·quote 清洗 / voice 只忽略；
 *   ② **不变式**：protocolMode=off 时控制块原样发出（不生效），on 但没写控制块时
 *      发出的文本逐字节相同；未启用时解析器一次都不跑（计数、日志都不动）；
 *   ③ JSON 写错 → 整段原文直发（含【控制】那行）+ 计一次 failed + 一条 warn；
 *   ④ reply:false / send 分条 / quote 引用 / why 不上 QQ / voice 被忽略各自有用例；
 *   ⑤ protocolChats 灰度：只对列出的 chatId 生效；
 *   ⑥ 统计口径：SendCounter 按天、/doctor 一行、状态快照字段、客户端概览一行；
 *   ⑦ 平台段：只有启用了协议的聊天才多那两行（未启用一个字都不多），并进指纹。
 * @module dsh-qq-companion-pro/tests/protocol-control
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ChatActivity } from '../src/companion/activity.js'
import { companionStatusLines, protocolSuccessRate } from '../src/companion/doctor.js'
import { SendCounter } from '../src/companion/send-counter.js'
import { chatPromptVersion } from '../src/companion/prompt-version.js'
import {
  CONTROL_SEND_MAX_PARTS,
  CONTROL_SEND_PART_MAX_CHARS,
  CONTROL_VOICE_IGNORED,
  CONTROL_WHY_MAX_CHARS,
  cleanControlQuote,
  cleanControlSend,
  cleanControlWhy,
  parseControlBlock,
} from '../src/output-protocol.js'
import { buildPlatformPrompt } from '../src/prompt.js'
import { buildCompanionStatusSnapshot } from '../src/status.js'
import { TraceSink, type TraceEvent } from '../src/trace.js'
import { makeCmdHarness } from './helpers/bridge-harness.js'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'onebot-protocol-control-'))
const CHAT = 'private:10001'
const GROUP = 'group:888'

// ──────────────────────── ① parseControlBlock（纯函数） ────────────────────────

describe('parseControlBlock — 只认最后一行，写错就整段原样返回', () => {
  it('最后一行是控制块：body = 控制块之前的正文，字段全部取出', () => {
    const parsed = parseControlBlock('他在骂我\n【控制】{"reply":true,"why":"他骂我，先不理","send":["嗯。","……你自己想想"],"quote":"12345"}')
    expect(parsed.body).toBe('他在骂我')
    expect(parsed.error).toBeUndefined()
    expect(parsed.control).toEqual({
      reply: true,
      why: '他骂我，先不理',
      send: ['嗯。', '……你自己想想'],
      quote: '12345',
    })
  })

  it('容忍：全角/半角括号、括号内外空白、行尾空白与多个空行', () => {
    const cases = [
      '正文\n【 控制 】 {"reply":false}',
      '正文\n[控制]{ "reply" : false }',
      '正文\n（控制）{"reply":false}',
      '正文\n(控制){"reply":false}',
      '正文\n   【控制】  {"reply":false}   ',
      '正文\n【控制】{"reply":false}\n\n   \n',
    ]
    for (const text of cases) {
      const parsed = parseControlBlock(text)
      expect(parsed.control?.reply, JSON.stringify(text)).toBe(false)
      expect(parsed.body, JSON.stringify(text)).toBe('正文')
      expect(parsed.error, JSON.stringify(text)).toBeUndefined()
    }
  })

  it('只有一行控制块：body 为空（正文一个字都没有）', () => {
    const parsed = parseControlBlock('【控制】{"reply":true}')
    expect(parsed.body).toBe('')
    expect(parsed.control).toEqual({ reply: true })
  })

  it('最后一行不是控制块 / 控制块在中间行 / 块里有换行：都不认，正文原样返回', () => {
    const cases = [
      '【控制】{"reply":false}\n后面还有正文',
      '前面\n【控制】{"reply":false}\n后面还有正文',
      '正文\n【控制】{"send":["a",\n"b"]}',
      '正文\n【控制】{\n"reply":false}',
      '正文里提到【控制】这个词，但不是最后一行标记',
    ]
    for (const text of cases) {
      const parsed = parseControlBlock(text)
      expect(parsed.control, JSON.stringify(text)).toBeUndefined()
      expect(parsed.error, JSON.stringify(text)).toBeUndefined()
      // 没有控制块 = 正文逐字节原样（绝不吞消息）。
      expect(parsed.body, JSON.stringify(text)).toBe(text)
    }
  })

  it('JSON 语法错 / 不是对象：error 有值、control 缺席、body 原样（整段会发出去）', () => {
    const cases: Array<[string, string]> = [
      ['正文\n【控制】{"reply": false,}', '控制块的 JSON 语法有错'],
      ['正文\n【控制】{"reply":true', '控制块的 JSON 语法有错'],
      ['正文\n【控制】这三个字的正文', '控制块的 JSON 语法有错'],
      ['正文\n【控制】', '【控制】后面没有 JSON'],
      ['正文\n【控制】   ', '【控制】后面没有 JSON'],
      ['正文\n【控制】"字符串"', '控制块不是 JSON 对象'],
      ['正文\n【控制】[1,2]', '控制块不是 JSON 对象'],
      ['正文\n【控制】null', '控制块不是 JSON 对象'],
    ]
    for (const [text, error] of cases) {
      const parsed = parseControlBlock(text)
      expect(parsed.control, JSON.stringify(text)).toBeUndefined()
      expect(parsed.error, JSON.stringify(text)).toBe(error)
      expect(parsed.body, JSON.stringify(text)).toBe(text)
    }
  })

  it('单个字段类型不对：丢那个字段 + 一条 warning，其余字段照常生效', () => {
    const parsed = parseControlBlock('正文\n【控制】{"reply":"yes","why":123,"send":["嗯。"],"quote":"12345"}')
    expect(parsed.control).toEqual({ send: ['嗯。'], quote: '12345' })
    expect(parsed.body).toBe('正文')
    expect(parsed.warnings?.some(w => w.includes('reply'))).toBe(true)
    expect(parsed.warnings?.some(w => w.includes('why'))).toBe(true)
    // send 类型完全不对：整字段丢弃（不是整体失败）。
    const bad = parseControlBlock('正文\n【控制】{"send":"嗯。","reply":true}')
    expect(bad.control).toEqual({ reply: true })
    expect(bad.warnings?.some(w => w.includes('send'))).toBe(true)
    expect(bad.body).toBe('正文')
  })

  it('why 清洗：去空白合并、超长截断到 40 字并补省略号', () => {
    expect(cleanControlWhy('  他骂我\n先不理  ').text).toBe('他骂我 先不理')
    expect(cleanControlWhy('多   空格\t和制表').text).toBe('多 空格 和制表')
    const long = cleanControlWhy('字'.repeat(CONTROL_WHY_MAX_CHARS + 20))
    expect(long.clipped).toBe(true)
    expect(Array.from(long.text)).toHaveLength(CONTROL_WHY_MAX_CHARS)
    expect(long.text.endsWith('…')).toBe(true)
    const parsed = parseControlBlock('正文\n【控制】{"why":"' + '字'.repeat(60) + '"}')
    expect(parsed.control?.why).toHaveLength(CONTROL_WHY_MAX_CHARS)
    expect(parsed.warnings?.some(w => w.includes('why'))).toBe(true)
  })

  it('send 清洗：去首尾空白、丢空项、上限 9 条、单条 ≤500 字', () => {
    expect(cleanControlSend(['  嗯。  ', '', '   ', '第二句']).parts).toEqual(['嗯。', '第二句'])
    const many = Array.from({ length: CONTROL_SEND_MAX_PARTS + 3 }, (_, i) => 'm' + i)
    const capped = cleanControlSend(many)
    expect(capped.parts).toHaveLength(CONTROL_SEND_MAX_PARTS)
    expect(capped.parts[0]).toBe('m0')
    expect(capped.clippedCount).toBe(true)
    const long = cleanControlSend(['字'.repeat(CONTROL_SEND_PART_MAX_CHARS + 50)])
    expect(Array.from(long.parts[0])).toHaveLength(CONTROL_SEND_PART_MAX_CHARS)
    expect(long.parts[0].endsWith('…')).toBe(true)
    expect(long.clippedPart).toBe(true)
    // 非字符串项被丢弃（不整体失败），空数组 → 字段整体丢掉。
    const parsed = parseControlBlock('正文\n【控制】{"send":["嗯。",1,null]}')
    expect(parsed.control?.send).toEqual(['嗯。'])
    expect(parseControlBlock('正文\n【控制】{"send":["","  "]}').control).toEqual({})
  })

  it('quote 清洗：只保留数字/字母/连字符（与 sanitizeMessageId 一致），洗空了就丢字段', () => {
    expect(cleanControlQuote(' 12345 -abc_!@#')).toBe('12345-abc')
    expect(cleanControlQuote('!!!')).toBe('')
    expect(parseControlBlock('正文\n【控制】{"quote":" 12345 -abc_!@#"}').control).toEqual({ quote: '12345-abc' })
    expect(parseControlBlock('正文\n【控制】{"quote":"!!!"}').control).toEqual({})
    expect(parseControlBlock('正文\n【控制】{"quote":12345}').control).toEqual({})
  })

  it('voice：识别出来但不支持——只出一条「v1 不支持」warning，绝不整体失败', () => {
    const parsed = parseControlBlock('正文\n【控制】{"reply":true,"voice":true}')
    expect(parsed.control).toEqual({ reply: true })
    expect(parsed.control && 'voice' in parsed.control).toBe(false)
    expect(parsed.warnings).toEqual([CONTROL_VOICE_IGNORED])
    expect(parsed.body).toBe('正文')
  })

  it('空对象控制块：control = {}（正文照常发），不报错', () => {
    const parsed = parseControlBlock('正文\n【控制】{}')
    expect(parsed.control).toEqual({})
    expect(parsed.error).toBeUndefined()
    expect(parsed.body).toBe('正文')
  })
})

// ──────────────────────── ② bridge 出站闸门（集成） ────────────────────────

/** 已发出的 send_msg 里的纯文本（按发送顺序）。 */
function sentBodies(outbound: Array<Record<string, unknown>>): string[] {
  const out: string[] = []
  for (const frame of outbound) {
    if (frame.action !== 'send_msg') continue
    const params = frame.params as { message?: Array<{ type: string; data?: { text?: unknown } }> }
    const text = (params.message ?? []).filter(seg => seg.type === 'text').map(seg => String(seg.data?.text ?? '')).join('')
    if (text !== '') out.push(text)
  }
  return out
}

/** 一条 send_msg 的段类型序列（`['reply','text']` / `['image']` …）。 */
function sentSegmentTypes(outbound: Array<Record<string, unknown>>): string[][] {
  return outbound
    .filter(frame => frame.action === 'send_msg')
    .map(frame => ((frame.params as { message?: Array<{ type: string }> }).message ?? []).map(seg => seg.type))
}

/** 一套带留痕探针的协议 harness（活动记录 / trace / 计数 / 日志全接上）。 */
async function protocolHarness(options: Parameters<typeof makeCmdHarness>[0] = {}) {
  const traceDir = tmp()
  const activity = new ChatActivity({ mediaDir: tmp(), log: () => undefined })
  activity.record(CHAT, 'user', '在吗', '小明')
  const sink = new TraceSink({ dir: traceDir, level: 'debug' })
  const counter = new SendCounter()
  const logs: string[] = []
  const h = await makeCmdHarness({
    activity,
    trace: sink,
    sendCounter: counter,
    log: (level, message) => { logs.push(level + ' ' + message) },
    ...options,
  })
  const stop = async (): Promise<void> => {
    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  }
  const traceEvents = async (): Promise<TraceEvent[]> => {
    await sink.flush()
    const text = readFileSync(join(traceDir, 'qq-trace.jsonl'), 'utf8').trim()
    return text === '' ? [] : text.split('\n').map(line => JSON.parse(line) as TraceEvent)
  }
  return { h, activity, counter, logs, sink, traceEvents, stop }
}

describe('sendToChat — 不变式：没启用协议的聊天，行为与改造前逐字节相同', () => {
  it('protocolMode=off：模型写了控制块也原样发出（reply:false 不生效、不解析、不计数）', async () => {
    const g = await protocolHarness({ protocolMode: 'off' })
    const text = '我在\n【控制】{"reply":false,"why":"他骂我","send":["嗯。"]}'
    const ids = await g.h.bridge.sendToChat(CHAT, text, { humanize: true })
    expect(ids).toHaveLength(1)
    // 整段（含【控制】那行）逐字节发出——这就是改造前的行为。
    expect(sentBodies(g.h.outbound)).toEqual([text])
    expect(sentSegmentTypes(g.h.outbound)).toEqual([['text']])
    expect(g.counter.snapshot()).toMatchObject({ protocolReplies: 0, protocolParsed: 0, protocolFailed: 0, passToday: 0 })
    expect(g.logs.join('\n')).not.toContain('输出协议')
    expect(g.logs.join('\n')).not.toContain('她选择不回')
    await g.stop()
  })

  it('protocolMode 缺省（没配这个键）= off：同样原样发出', async () => {
    const g = await protocolHarness()
    const text = '我在\n【控制】{"reply":false}'
    await g.h.bridge.sendToChat(CHAT, text, { humanize: true })
    expect(sentBodies(g.h.outbound)).toEqual([text])
    expect(g.counter.snapshot().protocolReplies).toBe(0)
    await g.stop()
  })

  it('protocolMode=on 但模型没写控制块：发出的文本逐字节相同（只多计一次回复）', async () => {
    const text = '第一行\n第二行 **不是** 控制块'
    const off = await protocolHarness({ protocolMode: 'off' })
    await off.h.bridge.sendToChat(CHAT, text, { humanize: true })
    const offBodies = sentBodies(off.h.outbound)
    await off.stop()

    const on = await protocolHarness({ protocolMode: 'on' })
    await on.h.bridge.sendToChat(CHAT, text, { humanize: true })
    expect(sentBodies(on.h.outbound)).toEqual(offBodies)
    // 解析器跑了（协议聊天里的回复 +1），但没有控制块 → parsed / failed 都是 0。
    expect(on.counter.snapshot()).toMatchObject({ protocolReplies: 1, protocolParsed: 0, protocolFailed: 0 })
    await on.stop()
  })
})

describe('sendToChat — 控制块生效（reply / send / quote / why）', () => {
  it('JSON 语法错：整段原文直发（含【控制】那行），计一次 failed 并 warn', async () => {
    const g = await protocolHarness({ protocolMode: 'on' })
    const text = '我没事\n【控制】{"reply": false,}'
    const ids = await g.h.bridge.sendToChat(CHAT, text, { humanize: true })
    expect(ids).toHaveLength(1)
    expect(sentBodies(g.h.outbound)).toEqual([text])
    expect(g.counter.snapshot()).toMatchObject({ protocolReplies: 1, protocolParsed: 0, protocolFailed: 1 })
    expect(g.logs.join('\n')).toContain('输出协议控制块解析失败，已整段原样发送')
    expect(g.logs.join('\n')).toContain('控制块的 JSON 语法有错')
    await g.stop()
  })

  it('单字段类型错：其余字段照常生效（send 分条生效、坏字段只记 debug）', async () => {
    const g = await protocolHarness({ protocolMode: 'on' })
    const text = '好的\n【控制】{"reply":"no","send":["嗯。","……你自己想想"]}'
    const ids = await g.h.bridge.sendToChat(CHAT, text, { humanize: true })
    expect(ids).toHaveLength(3)
    // 正文（控制块之前的内容）作为第一条，然后按 send 逐条发。
    expect(sentBodies(g.h.outbound)).toEqual(['好的', '嗯。', '……你自己想想'])
    expect(g.counter.snapshot()).toMatchObject({ protocolReplies: 1, protocolParsed: 1, protocolFailed: 0 })
    expect(g.logs.join('\n')).toContain('控制块的 reply 字段类型不对')
    await g.stop()
  })

  it('reply:false：一条都不发，why 落日志 / trace / 活动记录，绝不上 QQ', async () => {
    const g = await protocolHarness({ protocolMode: 'on' })
    const why = '他骂我，先不理'
    const text = '我才不\n【控制】{"reply":false,"why":"' + why + '"}'
    expect(await g.h.bridge.sendToChat(CHAT, text, { humanize: true })).toEqual([])
    expect(sentBodies(g.h.outbound)).toEqual([])
    // 日志：带「控制块」与原因。
    expect(g.logs.join('\n')).toContain('她选择不回（控制块 · ' + why + '）：' + CHAT)
    // trace：stage='reply'，reason 里带「控制块」。
    const reply = (await g.traceEvents()).filter(event => event.stage === 'reply')
    expect(reply).toHaveLength(1)
    expect(reply[0].reason).toBe('她选择不回（控制块）：' + why)
    // 计数：不回 +1，发送量不变。
    expect(g.counter.snapshot()).toMatchObject({ today: 0, passToday: 1 })
    // 活动记录：一条 system 行，交接里看得到（QQ 端零痕迹）。
    const today = g.activity.takeToday(CHAT, false)
    expect(today.at(-1)).toMatchObject({ who: 'system' })
    expect(today.at(-1)?.text).toContain(why)
    expect(g.activity.handoff(CHAT)).toContain('（这次选择不回：' + why + '）')
    // why 只在日志 / 记忆里，绝不进 QQ 的任何一段。
    expect(JSON.stringify(g.h.outbound)).not.toContain(why)
    await g.stop()
  })

  it('send 分条：按数组逐条发、第一条带引用、不走 t2i 长文本卡片', async () => {
    // 阈值 20 字：如果走了卡片路径，那条 200 字的会变成图片段。
    const g = await protocolHarness({ protocolMode: 'on', textImageThreshold: 20 })
    // 先发一条：它的 message_id（harness 回声恒为 7）进入「见过的消息」集合。
    await g.h.bridge.sendToChat(CHAT, '早', {})
    const long = '很'.repeat(200)
    const text = '【控制】{"send":["' + long + '","第二句"],"quote":"7"}'
    const ids = await g.h.bridge.sendToChat(CHAT, text, { humanize: true })
    expect(ids).toHaveLength(2)
    const types = sentSegmentTypes(g.h.outbound)
    // 三条 send_msg：'早'、第一条分条（引用 + 文本）、第二条分条（纯文本）。
    expect(types).toHaveLength(3)
    expect(types[1]).toEqual(['reply', 'text'])
    expect(types[2]).toEqual(['text'])
    const first = (g.h.outbound.filter(frame => frame.action === 'send_msg')[1].params as { message: Array<{ type: string; data: Record<string, unknown> }> }).message
    expect(first[0]).toEqual({ type: 'reply', data: { id: '7' } })
    expect(first[1]).toEqual({ type: 'text', data: { text: long } })
    expect(sentBodies(g.h.outbound)).toEqual(['早', long, '第二句'])
    // trace 记了一条控制块事件：reason 带「控制块」，data 带 send 条数与 quote 有无。
    const controlEvents = (await g.traceEvents()).filter(event => event.reason === '输出协议控制块生效')
    expect(controlEvents).toHaveLength(1)
    expect(controlEvents[0].stage).toBe('outbound')
    expect(controlEvents[0].data).toEqual({ reply: true, sends: 2, quote: true })
    await g.stop()
  })

  it('quote：控制块的 quote 优先于行首 [引用:id]；没见过的 id 照旧不引用', async () => {
    const g = await protocolHarness({ protocolMode: 'on' })
    await g.h.bridge.sendToChat(CHAT, '早', {}) // 见过 '7'
    const text = '[引用:999]在的\n【控制】{"quote":"7"}'
    expect(await g.h.bridge.sendToChat(CHAT, text, { humanize: true })).toHaveLength(1)
    const last = (g.h.outbound.filter(frame => frame.action === 'send_msg')[1].params as { message: Array<{ type: string; data: Record<string, unknown> }> }).message
    expect(last[0]).toEqual({ type: 'reply', data: { id: '7' } })
    expect(last[1]).toEqual({ type: 'text', data: { text: '在的' } })
    // 控制块里的 id 没见过 → 不引用，正文照发。
    expect(await g.h.bridge.sendToChat(CHAT, '在的\n【控制】{"quote":"999999"}', { humanize: true })).toHaveLength(1)
    expect(sentSegmentTypes(g.h.outbound).at(-1)).toEqual(['text'])
    await g.stop()
  })

  it('voice：v1 不支持——只记一条 debug，其余字段照常生效', async () => {
    const g = await protocolHarness({ protocolMode: 'on' })
    await g.h.bridge.sendToChat(CHAT, '好的\n【控制】{"voice":true,"send":["嗯。"]}', { humanize: true })
    expect(sentBodies(g.h.outbound)).toEqual(['好的', '嗯。'])
    expect(g.logs.join('\n')).toContain('debug 输出协议：' + CONTROL_VOICE_IGNORED)
    // 只记一条（同一字段不重复刷屏）。
    expect(g.logs.filter(line => line.includes(CONTROL_VOICE_IGNORED))).toHaveLength(1)
    await g.stop()
  })

  it('只有控制块、没有正文也没有 send：什么都不发（也不当「不回」计数）', async () => {
    const g = await protocolHarness({ protocolMode: 'on' })
    expect(await g.h.bridge.sendToChat(CHAT, '【控制】{"reply":true}', { humanize: true })).toEqual([])
    expect(sentBodies(g.h.outbound)).toEqual([])
    expect(g.counter.snapshot()).toMatchObject({ passToday: 0, protocolReplies: 1, protocolParsed: 1 })
    await g.stop()
  })

  it('A 档标记优先：整条 [不回:原因] 仍然走不回路径（控制块不改变它）', async () => {
    const g = await protocolHarness({ protocolMode: 'on' })
    expect(await g.h.bridge.sendToChat(CHAT, '[不回:不想说]\n【控制】{"send":["嗯。"]}', { humanize: true })).toEqual([])
    expect(sentBodies(g.h.outbound)).toEqual([])
    expect(g.counter.snapshot().passToday).toBe(1)
    expect(g.logs.join('\n')).toContain('她选择不回（不想说）：' + CHAT)
    await g.stop()
  })

  it('protocolChats 灰度：只对列出的 chatId 生效，其他聊天完全不受影响', async () => {
    const g = await protocolHarness({ protocolMode: 'on', protocolChats: [GROUP] })
    // 不在灰度名单里的私聊：控制块原样发出（不解析、不计数）。
    const raw = '我在\n【控制】{"reply":false}'
    await g.h.bridge.sendToChat(CHAT, raw, { humanize: true })
    expect(sentBodies(g.h.outbound)).toEqual([raw])
    expect(g.counter.snapshot().protocolReplies).toBe(0)
    // 灰度名单里的群：reply:false 生效，一条都不发。
    expect(await g.h.bridge.sendToChat(GROUP, '我在\n【控制】{"reply":false,"why":"群里在吵架"}', { humanize: true })).toEqual([])
    expect(sentBodies(g.h.outbound)).toEqual([raw])
    expect(g.counter.snapshot()).toMatchObject({ protocolReplies: 1, protocolParsed: 1 })
    expect(g.h.bridge.protocolEnabledFor(GROUP)).toBe(true)
    expect(g.h.bridge.protocolEnabledFor(CHAT)).toBe(false)
    await g.stop()
  })
})

// ──────────────────────── ③ 统计：计数器 / /doctor / 快照 ────────────────────────

describe('成功率统计口径', () => {
  it('SendCounter 按天记录协议计数，跨天归零（不影响发送量）', () => {
    let now = new Date(2026, 9, 23, 10, 0).getTime()
    const counter = new SendCounter({ now: () => now })
    counter.recordProtocolReply()
    counter.recordProtocolReply()
    counter.recordProtocolParsed()
    counter.recordProtocolFailed()
    expect(counter.snapshot()).toMatchObject({ protocolReplies: 2, protocolParsed: 1, protocolFailed: 1, today: 0 })
    now = new Date(2026, 9, 24, 0, 30).getTime() // 跨过本地日期
    expect(counter.snapshot()).toMatchObject({ protocolReplies: 0, protocolParsed: 0, protocolFailed: 0 })
  })

  it('分母口径：只有最终回复（humanize）与真的写了控制块的出站文本计入「协议聊天里的回复」', async () => {
    const g = await protocolHarness({ protocolMode: 'on' })
    // 插件自己的提示（非 humanize、也没有控制块）不进分母，否则成功率会被提示语拖低。
    await g.h.bridge.sendToChat(CHAT, '⏳ 当前任务运行中，新消息已排队。', {})
    expect(g.counter.snapshot().protocolReplies).toBe(0)
    // 最终回复进分母。
    await g.h.bridge.sendToChat(CHAT, '好的', { humanize: true })
    expect(g.counter.snapshot()).toMatchObject({ protocolReplies: 1, protocolParsed: 0 })
    // 非最终文本里写了控制块：分子分母同时 +1（不会出现「解析次数 > 回复次数」的倒挂）。
    await g.h.bridge.sendToChat(CHAT, '看这个\n【控制】{"reply":true}', {})
    const snapshot = g.counter.snapshot()
    expect(snapshot).toMatchObject({ protocolReplies: 2, protocolParsed: 1 })
    expect(protocolSuccessRate({ repliesToday: snapshot.protocolReplies, parsedToday: snapshot.protocolParsed })).toBe(50)
    await g.stop()
  })

  it('protocolSuccessRate：成功率 = 解析成功 / 协议聊天里的回复数（分母 0 不编造数字）', () => {
    expect(protocolSuccessRate({ repliesToday: 0, parsedToday: 0 })).toBe(0)
    expect(protocolSuccessRate({ repliesToday: 10, parsedToday: 8 })).toBe(80)
    expect(protocolSuccessRate({ repliesToday: 3, parsedToday: 3 })).toBe(100)
    // 防御：parsed 大于 replies 也不报 >100%。
    expect(protocolSuccessRate({ repliesToday: 2, parsedToday: 5 })).toBe(100)
  })

  it('/doctor 一行：关闭 / 开启（含灰度聊天与成功率、JSON 写错次数）', async () => {
    const off = await companionStatusLines({ protocol: () => ({ enabled: false, chats: [], repliesToday: 0, parsedToday: 0, failedToday: 0 }) })
    expect(off.join('\n')).toContain('输出协议：关闭')

    const on = await companionStatusLines({
      protocol: () => ({ enabled: true, chats: [GROUP], repliesToday: 10, parsedToday: 8, failedToday: 2 }),
    })
    const line = on.find(item => item.startsWith('输出协议'))
    expect(line).toBe('输出协议：开启（仅 ' + GROUP + '）；今天 10 次回复里 8 次带控制块（成功率 80%）；JSON 写错 2 次（那几段原样发出去了）')

    const all = await companionStatusLines({
      protocol: () => ({ enabled: true, chats: [], repliesToday: 4, parsedToday: 4, failedToday: 0 }),
    })
    expect(all.join('\n')).toContain('输出协议：开启；今天 4 次回复里 4 次带控制块（成功率 100%）')
    expect(all.join('\n')).not.toContain('JSON 写错')

    // 缺席 = 不渲染这一行（旧装配不受影响）。
    const none = await companionStatusLines({})
    expect(none.join('\n')).not.toContain('输出协议')
  })

  it('状态快照 protocol 字段：enabled / chats / 三个计数（缺席 = null）', async () => {
    const snapshot = await buildCompanionStatusSnapshot({
      protocol: () => ({ enabled: true, chats: [GROUP, ''], repliesToday: 10, parsedToday: 8, failedToday: 1 }),
    })
    expect(snapshot.protocol).toEqual({ enabled: true, chats: [GROUP], repliesToday: 10, parsedToday: 8, failedToday: 1 })
    const missing = await buildCompanionStatusSnapshot({})
    expect(missing.protocol).toBeNull()
    // 取数抛错只让这个字段为 null，整份快照照常返回。
    const broken = await buildCompanionStatusSnapshot({ protocol: () => { throw new Error('boom') } })
    expect(broken.protocol).toBeNull()
  })
})

// ──────────────────────── ④ 平台段（只给启用的聊天加） ────────────────────────

describe('平台段 — 只有启用了协议的聊天才多那两行', () => {
  const platformOf = async (options: Parameters<typeof makeCmdHarness>[0]): Promise<string> => {
    const h = await makeCmdHarness(options)
    const text = h.bridge.platformPromptText(CHAT)
    h.client.close()
    return text
  }

  it('未启用（off / 缺省）：平台段与不带协议时逐字相同，一个字都不多', async () => {
    const absent = await platformOf({})
    const off = await platformOf({ protocolMode: 'off' })
    expect(off).toBe(absent)
    expect(off).not.toContain('【控制】')
    expect(off).not.toContain('输出协议')
    // 纯函数层：protocol 缺席与 false 都是同一段文本。
    expect(buildPlatformPrompt({ restrictedMembers: false, enabledCapabilityIds: [] }))
      .toBe(buildPlatformPrompt({ restrictedMembers: false, enabledCapabilityIds: [], protocol: false }))
  })

  it('启用：恰好多两行，含示例、字段含义与「写错会原样发给对方」的提醒', async () => {
    const off = await platformOf({})
    const on = await platformOf({ protocolMode: 'on' })
    const offLines = new Set(off.split('\n'))
    const added = on.split('\n').filter(line => !offLines.has(line))
    expect(added).toHaveLength(2)
    expect(added[0]).toContain('【控制】')
    expect(added[0]).toContain('"send"')
    expect(added[0]).toContain('voice')
    expect(added[1]).toContain('最后一行')
    expect(added[1]).toContain('原样发给对方')
  })

  it('灰度：只有名单里的聊天加说明（并因此改变它的平台段指纹）', async () => {
    const h = await makeCmdHarness({ protocolMode: 'on', protocolChats: [GROUP] })
    const privateText = h.bridge.platformPromptText(CHAT)
    const groupText = h.bridge.platformPromptText(GROUP)
    h.client.close()
    expect(privateText).not.toContain('【控制】')
    expect(groupText).toContain('【控制】')
    const base = { version: '1.12.1', persona: '人设', guide: '引导' }
    expect(chatPromptVersion({ ...base, platform: groupText })).not.toBe(chatPromptVersion({ ...base, platform: privateText }))
  })
})

// ──────────────────────── ⑤ 客户端概览（真实 client bundle） ────────────────────────

const CLIENT_SOURCE = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

type StubElement = { type: unknown; props: Record<string, unknown>; children: unknown[] }
function createElementStub(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): StubElement {
  return { type, props: props ?? {}, children: children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false && child !== true) }
}
function walk(node: unknown): StubElement[] {
  if (Array.isArray(node)) return node.flatMap(child => walk(child))
  if (node === null || typeof node !== 'object') return []
  const out: StubElement[] = []
  const element = node as StubElement
  if (element.type !== undefined && typeof element.props === 'object' && element.props !== null) out.push(element)
  for (const child of element.children ?? []) out.push(...walk(child))
  return out
}
function textOf(node: unknown): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node === null || typeof node !== 'object') return ''
  return ((node as StubElement).children ?? []).map(textOf).join('')
}
function byRole(node: unknown, role: string): StubElement[] {
  return walk(node).filter(element => element.props['data-role'] === role)
}
function loadClient(reactImpl: unknown): Record<string, unknown> {
  const factories: Record<string, (request: (spec: string) => unknown) => unknown> = {}
  ;(globalThis as unknown as { window: unknown }).window = {
    __ModuleLoader__: {
      load(entry: { id: string; factory: (request: (spec: string) => unknown) => unknown }) {
        factories[entry.id] = entry.factory
      },
    },
  }
  new Function(CLIENT_SOURCE)()
  const factory = factories['dsh-qq-companion-pro']
  if (factory === undefined) throw new Error('lib/client.js 未注册 dsh-qq-companion-pro 模块')
  return factory((spec: string) => {
    if (spec !== 'react') throw new Error(`unexpected external require: ${spec}`)
    return reactImpl
  }) as Record<string, unknown>
}

const stubReact = { createElement: createElementStub }
const client = loadClient(stubReact)
const renderOverview = client.renderOverview as (react: unknown, opts?: Record<string, unknown>) => StubElement[]

describe('设置页概览「功能」卡片 — 输出协议状态与成功率', () => {
  const protocolRow = (status: Record<string, unknown>): string => {
    const rows = byRole(renderOverview(stubReact, { status }), 'overview-protocol')
    expect(rows).toHaveLength(1)
    return textOf(rows[0])
  }

  it('开启：显示今天的回复数、带控制块数与成功率', () => {
    const text = protocolRow({ protocol: { enabled: true, chats: [GROUP], repliesToday: 10, parsedToday: 8, failedToday: 1 } })
    expect(text).toContain('输出协议：开启')
    expect(text).toContain('今天 10 次回复里 8 次带控制块（成功率 80%）')
  })

  it('关闭显示「输出协议：关闭」，没有回复时成功率显示「—」（不编造 0%）', () => {
    expect(protocolRow({ protocol: { enabled: false } })).toBe('输出协议：关闭')
    const zero = protocolRow({ protocol: { enabled: true, repliesToday: 0, parsedToday: 0 } })
    expect(zero).toContain('成功率 —')
  })

  it('快照缺 protocol（旧插件 / 取数失败）显示「—」', () => {
    expect(protocolRow({})).toBe('—')
  })

  it('客户端严格 codec 接受带 protocol 的快照（字段缺失/宽严一致）', () => {
    const schema = client.statusResultSchema as { parse(value: unknown): unknown }
    expect(() => schema.parse({ available: true, status: { protocol: { enabled: true, chats: [GROUP], repliesToday: 3, parsedToday: 2, failedToday: 1 } } })).not.toThrow()
    expect(() => schema.parse({ available: true, status: {} })).not.toThrow()
  })
})