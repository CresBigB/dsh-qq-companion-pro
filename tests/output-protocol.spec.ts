/**
 * 输出协议 A 档：她可以决定不回，而且留下痕迹（待办 1）。
 *
 * 覆盖：
 *   ① parseReplyPass 的识别形式与**不触发**情形（整条只有标记才算，正文里提到
 *      「不回」二字或把 [不发] 当例子提一句都不算）；
 *   ② 原因清洗（单行、多空格合并、80 字上限）；
 *   ③ sendToChat 统一出站闸门的确定顺序与四处留痕（日志 / trace / 今日计数 /
 *      活动记录），且对非最终回复（中间消息、超时补发）同样生效；
 *   ④ 超时补发过闸：带 [不回:原因] 的回合超时后一条也不补发（但留日志与终态）；
 *   ⑤ 状态快照 today.passCount 与 /doctor 的「今天 N 条不回」。
 * @module dsh-qq-companion/tests/output-protocol
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { ChatActivity } from '../src/companion/activity.js'
import { companionStatusLines } from '../src/companion/doctor.js'
import { SendCounter } from '../src/companion/send-counter.js'
import { DEFERRED_PREFIX, DeferredDelivery, buildDeferredText, decideDeferredText } from '../src/deferred.js'
import type { DeferredContext, DeferredEntry } from '../src/deferred.js'
import { PASS_MARKER, PASS_REASON_MAX_CHARS, cleanPassReason, parseReplyPass } from '../src/output-protocol.js'
import { buildCompanionStatusSnapshot } from '../src/status.js'
import { TraceSink, type TraceEvent } from '../src/trace.js'
import { makeCmdHarness, sentTexts } from './helpers/bridge-harness.js'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'onebot-output-protocol-'))
const flush = async (): Promise<void> => { await new Promise(resolve => setTimeout(resolve, 0)) }

// ────────────────────────────── ① 标记识别 ──────────────────────────────

describe('parseReplyPass — 整条只有一个标记才算', () => {
  it('认出各种写法（括号 / 冒号 / 句末标点 / 旧标记）', () => {
    const cases: Array<[string, string]> = [
      ['[不回]', ''],
      ['  【不回】  ', ''],
      ['（不回）', ''],
      ['(不回)。', ''],
      ['不回', ''],
      ['不回。', ''],
      ['不回！', ''],
      [PASS_MARKER, ''],
      ['不发', ''],
      ['【不发】', ''],
      ['[不回:他们只是在互相打屁]', '他们只是在互相打屁'],
      ['[不回：他们只是在互相打屁]', '他们只是在互相打屁'],
      ['不回:太晚了', '太晚了'],
      ['（不回：不想说话）', '不想说话'],
      ['[不发:没什么可说的]', '没什么可说的'],
      ['[不回 ： 冒号前面有空格 ]', '冒号前面有空格'],
    ]
    for (const [text, reason] of cases) {
      const parsed = parseReplyPass(text)
      expect(parsed.pass, text).toBe(true)
      expect(parsed.reason, text).toBe(reason)
      expect(parsed.body, text).toBe('')
    }
  })

  it('不触发：正文里提到「不回」二字、把 [不发] 当例子、标记后面还有正文', () => {
    const negatives = [
      '他问我回不回，我没答',
      '好的，不回',
      '不回就不回吧',
      '不回你消息了',
      '今天不回消息了',
      '我想你了',
      '只写 [不发] 就什么都不发',
      '主动聊天时只回 [不发] 就行',
      '[不发] 其实想说',
      '[不回] 其实是这个意思',
      '[不回:原因] 后面还有正文',
      '[不发工资]',
      '',
      '   ',
    ]
    for (const text of negatives) {
      const parsed = parseReplyPass(text)
      expect(parsed.pass, text).toBe(false)
      expect(parsed.reason, text).toBe('')
      // 非标记：正文原样返回（不 trim、不动内容）。
      expect(parsed.body, text).toBe(text)
    }
  })

  it('原因清洗：去首尾空白、换行折叠、多空格合并、80 字上限', () => {
    expect(cleanPassReason('  他们只是在互相打屁  ')).toBe('他们只是在互相打屁')
    expect(cleanPassReason('先说\n再说')).toBe('先说 再说')
    expect(cleanPassReason('多   空格\t和制表')).toBe('多 空格 和制表')
    expect(parseReplyPass('[不回:先说\n再说]').reason).toBe('先说 再说')
    expect(parseReplyPass('[不回:先说\n再说]').reason).not.toContain('\n')
    const long = '字'.repeat(PASS_REASON_MAX_CHARS + 20)
    const clipped = parseReplyPass('[不回:' + long + ']').reason
    expect(Array.from(clipped)).toHaveLength(PASS_REASON_MAX_CHARS)
    expect(clipped.endsWith('…')).toBe(true)
  })
})

// ────────────────────────────── ② 出站闸门 ──────────────────────────────

/** 一套带留痕探针的 harness：活动记录 / trace / 计数 / 日志都接上。 */
async function gateHarness() {
  const traceDir = tmp()
  const activity = new ChatActivity({ mediaDir: tmp(), log: () => undefined })
  activity.record('private:10001', 'user', '在吗', '小明')
  const sink = new TraceSink({ dir: traceDir, level: 'debug' })
  const counter = new SendCounter()
  const logs: string[] = []
  const h = await makeCmdHarness({
    activity,
    trace: sink,
    sendCounter: counter,
    log: (level, message) => { logs.push(level + ' ' + message) },
  })
  const stop = async (): Promise<void> => {
    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  }
  return { h, activity, sink, traceDir, counter, logs, stop }
}

/** 读 trace jsonl 里的全部事件（sink 已 flush）。 */
function traceEvents(dir: string): TraceEvent[] {
  const text = readFileSync(join(dir, 'qq-trace.jsonl'), 'utf8').trim()
  return text === '' ? [] : text.split('\n').map(line => JSON.parse(line) as TraceEvent)
}

describe('sendToChat — 不回应标记不发，但留痕', () => {
  it('整条 [不回:原因]：不发，日志 / trace / 计数 / 活动记录各留一条', async () => {
    const g = await gateHarness()
    const before = sentTexts(g.h.outbound).length
    expect(await g.h.bridge.sendToChat('private:10001', '[不回:他们只是在互相打屁]', { humanize: true })).toEqual([])
    expect(sentTexts(g.h.outbound)).toHaveLength(before)
    // 日志：一条，带原因与 chatId。
    const passLogs = g.logs.filter(line => line.includes('她选择不回'))
    expect(passLogs).toHaveLength(1)
    expect(passLogs[0]).toContain('她选择不回（他们只是在互相打屁）：private:10001')
    // trace：一条 stage='reply'，reason 带原因。
    await g.sink.flush()
    const reply = traceEvents(g.traceDir).filter(event => event.stage === 'reply')
    expect(reply).toHaveLength(1)
    expect(reply[0].ok).toBe(true)
    expect(reply[0].reason).toBe('她选择不回：他们只是在互相打屁')
    expect(reply[0].chatId).toBe('private:10001')
    // 计数：今天不回 +1，发送量不变。
    expect(g.counter.snapshot()).toMatchObject({ today: 0, passToday: 1 })
    // 活动记录：一条 system 行（不是 bot 台词），交接/日记看得到。
    const today = g.activity.takeToday('private:10001', false)
    expect(today.at(-1)).toMatchObject({ who: 'system' })
    expect(today.at(-1)?.text).toContain('他们只是在互相打屁')
    expect(g.activity.botLinesSinceUser('private:10001')).toBe(0)
    expect(g.activity.handoff('private:10001')).toContain('（这次选择不回：他们只是在互相打屁）')
    await g.stop()
  })

  it('没写原因：日志与 trace 用「未说明原因」', async () => {
    const g = await gateHarness()
    expect(await g.h.bridge.sendToChat('private:10001', '[不回]', { humanize: true })).toEqual([])
    expect(g.logs.join('\n')).toContain('她选择不回（未说明原因）：private:10001')
    await g.sink.flush()
    expect(traceEvents(g.traceDir).filter(event => event.stage === 'reply')[0].reason).toBe('她选择不回：未说明原因')
    await g.stop()
  })

  it('引用标记 + 不回：先剥引用再判定，什么都不发', async () => {
    const g = await gateHarness()
    const before = sentTexts(g.h.outbound).length
    expect(await g.h.bridge.sendToChat('private:10001', '[引用:这条][不回:不想说]', { humanize: true })).toEqual([])
    expect(sentTexts(g.h.outbound)).toHaveLength(before)
    expect(g.counter.snapshot().passToday).toBe(1)
    expect(g.activity.takeToday('private:10001', false).at(-1)?.text).toContain('不想说')
    await g.stop()
  })

  it('空文本仍然不发、也不记为不回', async () => {
    const g = await gateHarness()
    const before = sentTexts(g.h.outbound).length
    expect(await g.h.bridge.sendToChat('private:10001', '', { humanize: true })).toEqual([])
    expect(await g.h.bridge.sendToChat('private:10001', '   ', {})).toEqual([])
    expect(await g.h.bridge.sendToChat('private:10001', '[引用:这条]', { humanize: true })).toEqual([])
    expect(sentTexts(g.h.outbound)).toHaveLength(before)
    expect(g.counter.snapshot().passToday).toBe(0)
    expect(g.logs.filter(line => line.includes('她选择不回'))).toHaveLength(0)
    await g.stop()
  })

  it('正文里提到「不回」二字照常发出', async () => {
    const g = await gateHarness()
    const before = sentTexts(g.h.outbound).length
    const ids = await g.h.bridge.sendToChat('private:10001', '他问我回不回，我没答', { humanize: true })
    expect(ids).toHaveLength(1)
    await vi.waitFor(() => expect(sentTexts(g.h.outbound)).toHaveLength(before + 1))
    expect(sentTexts(g.h.outbound).at(-1)).toContain('他问我回不回')
    expect(g.counter.snapshot().passToday).toBe(0)
    // 最终回复照常记账成一句台词。
    expect(g.activity.botLinesSinceUser('private:10001')).toBe(1)
    await g.stop()
  })

  it('不只最终回复：非 humanize 的出站文本（中间消息/补发）同样过闸，且不记台词', async () => {
    const g = await gateHarness()
    const before = sentTexts(g.h.outbound).length
    expect(await g.h.bridge.sendToChat('private:10001', '[不发]', {})).toEqual([])
    expect(sentTexts(g.h.outbound)).toHaveLength(before)
    expect(g.counter.snapshot().passToday).toBe(1)
    expect(g.activity.botLinesSinceUser('private:10001')).toBe(0)
    await g.stop()
  })
})

// ────────────────────────────── ③ 超时补发过闸 ──────────────────────────────

/** 注入式调度器（假时钟）：超时计时器与重试退避共用一条任务列。 */
class FakeScheduler {
  tasks: Array<{ fn: () => void; cancelled: boolean }> = []
  schedule = (fn: () => void, _ms: number): unknown => {
    const task = { fn, cancelled: false }
    this.tasks.push(task)
    return task
  }

  cancel = (handle: unknown): void => { (handle as { cancelled: boolean }).cancelled = true }

  runNext(): void {
    const at = this.tasks.findIndex(task => !task.cancelled)
    expect(at, '没有可运行的定时任务').toBeGreaterThanOrEqual(0)
    const [task] = this.tasks.splice(at, 1)
    task.fn()
  }
}

function baseEntry(resultText: string): DeferredEntry {
  return { chatId: 'private:10001', sessionId: 's-1', registeredAt: 1_000, updatedAt: 1_000, attempts: 0, state: 'pending', resultText }
}

describe('超时补发 — 她选择不回时一条也不发', () => {
  it('buildDeferredText / decideDeferredText 在剥掉引用标记之后认出标记', () => {
    const pass = decideDeferredText(baseEntry('[不回:他们只是在互相打屁]'), { kind: 'completed' })
    expect(pass.pass).toBe(true)
    expect(pass.passReason).toBe('他们只是在互相打屁')
    expect(pass.text).toBe('')
    expect(buildDeferredText(baseEntry('[不回:他们只是在互相打屁]'), { kind: 'completed' })).toBe('')
    expect(buildDeferredText(baseEntry('[不发]'), { kind: 'completed' })).toBe('')
    // 引用标记先剥、再判定不回。
    expect(buildDeferredText(baseEntry('[引用:5001][不回:不想说]'), { kind: 'completed' })).toBe('')
    // 正常文字照常补发；正文提到「不回」二字不算标记。
    expect(buildDeferredText(baseEntry('好的，我在'), { kind: 'completed' })).toBe(DEFERRED_PREFIX + '好的，我在')
    expect(buildDeferredText(baseEntry('他问我回不回'), { kind: 'completed' })).toBe(DEFERRED_PREFIX + '他问我回不回')
  })

  it('带 [不回:原因] 的回合超时后自动补发：一条也不发，但记日志与终态', async () => {
    const scheduler = new FakeScheduler()
    const sends: Array<{ chatId: string; text: string }> = []
    const logs: string[] = []
    const traces: string[] = []
    const ctx: DeferredContext = {
      sendToChat: async (chatId, text) => { sends.push({ chatId, text }); return ['1'] },
      isTurnRunning: () => true,
      takePendingText: () => null,
      log: (_level, message) => { logs.push(message) },
      trace: (_chatId, event) => { traces.push(String(event.stage) + '|' + String(event.reason ?? '')) },
      mediaDir: tmp(),
      timeoutMs: 1_000,
      isStopping: () => false,
    }
    const delivery = new DeferredDelivery(ctx, { now: () => 1_000, schedule: scheduler.schedule, cancel: scheduler.cancel })
    delivery.onTurnStart('private:10001', 's-1')
    scheduler.runNext() // 静默等待超时：登记跟踪 + 给聊天发超时提醒
    expect(sends).toHaveLength(1)
    expect(sends[0].text).toContain('等待模型回复超时')
    // 超时之后模型才写出最终文字：整条就是不回应标记。
    expect(delivery.onAssistantMessage('private:10001', 's-1', { content: [{ type: 'text', text: '[不回:他们只是在互相打屁]' }] })).toBe(true)
    expect(delivery.snapshot()[0].resultText).toBe('[不回:他们只是在互相打屁]')
    expect(delivery.onTurnEnd('private:10001', 's-1', { kind: 'completed' })).toBe(true)
    await flush()
    // 除那条超时提醒外，一条补发都没发。
    expect(sends).toHaveLength(1)
    const entry = delivery.snapshot()[0]
    expect(entry.state).toBe('cancelled')
    expect(entry.reason).toContain('她选择不回（他们只是在互相打屁）')
    // 不静默吞掉：日志 + trace 都留了痕迹。
    expect(logs.join('\n')).toContain('她选择不回，超时补发不发送')
    expect(logs.join('\n')).toContain('他们只是在互相打屁')
    expect(traces.join('\n')).toContain('reply|她选择不回：他们只是在互相打屁')
    delivery.stopAll()
  })
})

// ────────────────────────────── ④ 状态快照 / /doctor ──────────────────────────────

describe('今日不回次数进入状态快照与 /doctor', () => {
  it('SendCounter 按天计不回次数（不影响发送量）', () => {
    let now = new Date(2026, 9, 20, 10, 0).getTime()
    const counter = new SendCounter({ now: () => now })
    counter.recordPass()
    counter.recordPass()
    expect(counter.snapshot()).toMatchObject({ today: 0, passToday: 2 })
    now = new Date(2026, 9, 21, 0, 30).getTime() // 跨过本地日期
    expect(counter.snapshot()).toMatchObject({ today: 0, passToday: 0 })
  })

  it('快照 today.passCount 与 /doctor 的「今天 N 条不回」', async () => {
    const counter = () => ({ lastMinute: 1, lastHour: 2, today: 12, passToday: 3 })
    const snapshot = await buildCompanionStatusSnapshot({ sendCounter: counter })
    expect(snapshot.today).toEqual({ sent: 12, passCount: 3 })
    const lines = await companionStatusLines({ sendCounter: counter })
    expect(lines.join('\n')).toContain('今天 12 条 · 今天 3 条不回')
  })

  it('计数器缺席 passToday 时快照归一为 0（旧快照不炸）', async () => {
    const snapshot = await buildCompanionStatusSnapshot({ sendCounter: () => ({ lastMinute: 0, lastHour: 0, today: 5 }) as never })
    expect(snapshot.today).toEqual({ sent: 5, passCount: 0 })
  })
})