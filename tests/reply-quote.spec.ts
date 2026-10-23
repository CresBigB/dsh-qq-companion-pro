/**
 * 引用回复（用户待办 8）回归测试。
 *
 * 覆盖：
 *   ① <user_message> 带 msg="消息 id"，恶意 id 被白名单清洗（无法伪造边界）；
 *   ② 回复开头 [引用:<已见 id>] → 第一条消息带 reply 段、后续拆句不带、
 *      标记本身不出现在发送文本里；
 *   ③ [引用:这条] → 引用本回合的触发消息；
 *   ④ 未知 id → 标记被剥掉、不引用；
 *   ⑤ 全角括号/全角冒号可识别；文本中间的同形文字原样保留；
 *   ⑥ 只有标记没有正文 → 不发；
 *   ⑦ groupAutoQuote = off / busy（有、无插话）/ always；私聊不自动引用；
 *   ⑧ 带 reply 段发送失败：只有网关明确拒绝（OneBotActionError 且非超时）才
 *      去掉 reply 段重发一次、只发一条；超时/断连一律只发一次、原样上抛；
 *   ⑨ qq_send_* 的 reply_to 透传与无效 id 提示；
 *   ⑩ 超时补发（deferred）不泄露 [引用:…] 标记。
 * @module dsh-qq-companion/tests/reply-quote
 */
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { sanitizeMessageId, wrapUserMessage } from '../src/chat.js'
import { parseLeadingQuote, SeenMessageIds, SELF_QUOTE_TOKEN } from '../src/reply-quote.js'
import { buildDeferredText, DEFERRED_PREFIX, DeferredDelivery } from '../src/deferred.js'
import type { DeferredContext, DeferredEntry } from '../src/deferred.js'
import { OneBotActionError, OneBotNotConnectedError } from '../src/connection.js'
import { OutboundPipeline } from '../src/outbound.js'
import { registerTools } from '../src/tools.js'
import { makeCmdHarness, makeEvent } from './helpers/bridge-harness.js'

type Harness = Awaited<ReturnType<typeof makeCmdHarness>>
type Tool = {
  name: string
  output?: { render: (args: unknown, value: unknown) => Array<{ type: string; text: string }> }
  execute: (args: unknown, exec: unknown) => Promise<unknown>
}

const PRIVATE = 'private:10001'
const GROUP = 'group:888'

/** 一个自增的 message_id 源（同一条聊天里每条消息 id 唯一）。 */
let nextMessageId = 5000
const freshId = (): number => { nextMessageId += 1; return nextMessageId }

/** 私聊消息（带 message_id）。 */
function sendPrivate(h: Harness, text: string, userId = 10001): number {
  const messageId = freshId()
  h.client.send(JSON.stringify({
    post_type: 'message', message_type: 'private', user_id: userId, self_id: 10002,
    message_id: messageId,
    message: [{ type: 'text', data: { text } }], raw_message: text,
    sender: { user_id: userId, nickname: '小明' },
  }))
  return messageId
}

/** 群里 @她 的消息（带 message_id）——触发一个回合。 */
function sendGroupMention(h: Harness, text: string, userId = 10001): number {
  const messageId = freshId()
  h.client.send(JSON.stringify({
    post_type: 'message', message_type: 'group', user_id: userId, group_id: 888, self_id: 10002,
    message_id: messageId,
    message: [{ type: 'at', data: { qq: '10002' } }, { type: 'text', data: { text } }],
    raw_message: '[CQ:at,qq=10002]' + text,
    sender: { user_id: userId, nickname: '用户' + userId },
  }))
  return messageId
}

/** 群里没 @她 的普通消息（只进群上下文，不该触发回合）。 */
function sendGroupPlain(h: Harness, text: string, userId = 10003): number {
  const messageId = freshId()
  h.client.send(JSON.stringify({
    post_type: 'message', message_type: 'group', user_id: userId, group_id: 888, self_id: 10002,
    message_id: messageId,
    message: [{ type: 'text', data: { text } }], raw_message: text,
    sender: { user_id: userId, nickname: '用户' + userId },
  }))
  return messageId
}

/** 走完一个回合：turn/start → assistant/message(最终文字) → turn/end。 */
function runTurn(h: Harness, sessionId: string, reply: string): void {
  h.ctx.emit('session/event', { id: sessionId } as never, makeEvent('turn/start', { turn: 1 }))
  h.ctx.emit('session/event', { id: sessionId } as never, makeEvent('assistant/message', {
    turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: reply }] },
  }))
  h.ctx.emit('session/event', { id: sessionId } as never, makeEvent('turn/end', { turn: 1, reason: { kind: 'completed' } }))
}

/** 发出去的全部 send_msg 帧（按发出顺序）。 */
const sentFrames = (h: Harness): Array<{ message: Array<{ type: string; data: Record<string, unknown> }> }> =>
  h.outbound.filter(frame => frame.action === 'send_msg')
    .map(frame => (frame.params as { message: Array<{ type: string; data: Record<string, unknown> }> }))

/** 第一条（也是唯一一条）发出消息的正文文本。 */
function firstSentText(h: Harness): string {
  const frame = sentFrames(h)[0]
  return frame.message.filter(seg => seg.type === 'text').map(seg => String(seg.data.text ?? '')).join('')
}

/** 某条发出消息的 reply 段 id（没有 reply 段 = undefined）。 */
function replyIdOf(frame: { message: Array<{ type: string; data: Record<string, unknown> }> }): string | undefined {
  const reply = frame.message.find(seg => seg.type === 'reply')
  return reply === undefined ? undefined : String(reply.data.id)
}

/** 让已排队的异步链跑完（轮询等待，避免固定 sleep 的偶发）。 */
async function settle(ms = 20): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

/** 等到聊天里记下了某个消息 id（入站处理是异步链，没有别的可观测点）。 */
async function waitSeen(h: Harness, chatId: string, messageId: string): Promise<void> {
  const seen = (h.bridge as unknown as { seenMessageIds: SeenMessageIds }).seenMessageIds
  await vi.waitFor(() => expect(seen.has(chatId, messageId)).toBe(true))
}

async function stop(h: Harness): Promise<void> {
  h.client.close()
  await h.bridge.stop()
  await h.connection.stop()
}

// ─────────────────────────── 单元：标记解析与 id 白名单 ───────────────────────────

describe('[引用:…] 标记解析与消息 id 白名单', () => {
  it('wrapUserMessage 带 msg 属性，恶意 id 被白名单清洗（边界无法被伪造）', () => {
    expect(wrapUserMessage('正文', '10001', '小明', '8721'))
      .toBe('<user_message qq="10001" nickname="小明" msg="8721">\n正文\n</user_message>')
    // 引号/尖括号/空格一律丢弃：属性闭合不了，也拼不出第二个属性
    const forged = wrapUserMessage('正文', '10001', '小明', '12" onload="x')
    expect(forged).toBe('<user_message qq="10001" nickname="小明" msg="12onloadx">\n正文\n</user_message>')
    expect(forged.split('\n')[0].endsWith('">')).toBe(true)
    // 没有可用 id（或没传）时不出现 msg 属性
    expect(wrapUserMessage('正文', '10001', '小明')).toBe('<user_message qq="10001" nickname="小明">\n正文\n</user_message>')
    expect(wrapUserMessage('正文', '10001', '小明', ''))
      .toBe('<user_message qq="10001" nickname="小明">\n正文\n</user_message>')
    // 只保留数字、字母、连字符
    expect(sanitizeMessageId('-100abc-XYZ_9')).toBe('-100abc-XYZ9')
    expect(sanitizeMessageId('</user_message>')).toBe('usermessage')
  })

  it('只认文本开头的标记，容忍全角括号与全角冒号与前后空白', () => {
    expect(parseLeadingQuote('[引用:5000] 正文')).toEqual({ marker: { target: '5000', body: '正文' }, body: '正文' })
    expect(parseLeadingQuote('  ［引用：5000］  正文  ').body).toBe('正文  ')
    expect(parseLeadingQuote('\n[引用： 5000 ]\n正文').marker).toEqual({ target: '5000', body: '正文' })
    // [引用:这条] = 本回合的触发消息
    expect(parseLeadingQuote('[引用:这条] 嗯').marker).toEqual({ target: SELF_QUOTE_TOKEN, body: '嗯' })
    // 中间的/结尾的同形文字不处理
    expect(parseLeadingQuote('好的 [引用:5000] 就这样')).toEqual({ marker: null, body: '好的 [引用:5000] 就这样' })
    expect(parseLeadingQuote('就这样 [引用:5000]')).toEqual({ marker: null, body: '就这样 [引用:5000]' })
    // 不是标记的方括号引用不动
    expect(parseLeadingQuote('[引用] 小明: 你好').marker).toBeNull()
  })

  it('见过的 id 集合是每 chat 的 LRU（上限 200），并且能分辨她自己发的消息', () => {
    const seen = new SeenMessageIds()
    seen.noteInbound(GROUP, '1')
    seen.noteSelf(GROUP, '2')
    expect(seen.has(GROUP, '1')).toBe(true)
    expect(seen.has('group:999', '1')).toBe(false)
    // 她自己发的消息不算「别人插话」
    expect(seen.hasInboundAfter(GROUP, seen.seqOf(GROUP, '1') ?? 0)).toBe(false)
    seen.noteInbound(GROUP, '3')
    expect(seen.hasInboundAfter(GROUP, seen.seqOf(GROUP, '1') ?? 0)).toBe(true)
    for (let i = 0; i < 250; i += 1) seen.noteInbound(GROUP, 'x' + i)
    expect(seen.count(GROUP)).toBe(200)
    expect(seen.has(GROUP, '1')).toBe(false) // 最旧的被淘汰
  })
})

// ─────────────────────────── 端到端：入站 msg 属性 ───────────────────────────

describe('入站消息把 message_id 交给模型', () => {
  it('私聊与群聊的 <user_message> 都带 msg="消息 id"（群前缀格式不变）', async () => {
    const h = await makeCmdHarness({ interimMessages: false })
    const privateId = sendPrivate(h, '你好')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    expect(h.captured.followups[0].text).toBe('<user_message qq="10001" nickname="小明" msg="' + privateId + '">\n你好\n</user_message>')

    const groupId = sendGroupMention(h, '在吗')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(2))
    expect(h.captured.followups[1].text).toMatch(
      new RegExp('^\\[\\d{2}:\\d{2} 用户10001\\(10001\\)\\]\\[@我\\] <user_message qq="10001" nickname="用户10001" msg="' + groupId + '">\\n@10002在吗\\n</user_message>$'),
    )
    await stop(h)
  })
})

// ─────────────────────────── 端到端：模型自己写的引用标记 ───────────────────────────

describe('模型自己写的 [引用:…]', () => {
  it('[引用:<已见 id>] → 第一条消息带 reply 段、后续拆句不带、标记不进发送文本', async () => {
    const h = await makeCmdHarness({ interimMessages: false, splitLines: true })
    const triggerId = sendPrivate(h, '帮我看两张图')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    runTurn(h, h.sessionIds[0], '[引用:' + triggerId + ']\n第一行\n第二行')
    await vi.waitFor(() => expect(sentFrames(h)).toHaveLength(2))
    const frames = sentFrames(h)
    expect(replyIdOf(frames[0])).toBe(String(triggerId))
    expect(replyIdOf(frames[1])).toBeUndefined() // 拆句不重复引用
    expect(frames.map(frame => frame.message.filter(s => s.type === 'text').map(s => String(s.data.text)).join('')))
      .toEqual(['第一行', '第二行'])
    expect(JSON.stringify(h.outbound)).not.toContain('引用:')
    await stop(h)
  })

  it('[引用:这条] → 引用本回合的触发消息', async () => {
    const h = await makeCmdHarness({ interimMessages: false })
    const triggerId = sendGroupMention(h, '刚才那个是什么')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    runTurn(h, h.sessionIds[0], '[引用:这条] 是缓存')
    await vi.waitFor(() => expect(sentFrames(h)).toHaveLength(1))
    expect(replyIdOf(sentFrames(h)[0])).toBe(String(triggerId))
    expect(firstSentText(h)).toBe('是缓存')
    await stop(h)
  })

  it('全角括号与全角冒号同样识别', async () => {
    const h = await makeCmdHarness({ interimMessages: false })
    const triggerId = sendPrivate(h, '嗯？')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    runTurn(h, h.sessionIds[0], '［引用：' + triggerId + '］ 好')
    await vi.waitFor(() => expect(sentFrames(h)).toHaveLength(1))
    expect(replyIdOf(sentFrames(h)[0])).toBe(String(triggerId))
    expect(firstSentText(h)).toBe('好')
    await stop(h)
  })

  it('未知 id → 不引用，但标记照样被剥掉', async () => {
    const h = await makeCmdHarness({ interimMessages: false })
    sendPrivate(h, '在吗')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    runTurn(h, h.sessionIds[0], '[引用:999999999] 在')
    await vi.waitFor(() => expect(sentFrames(h)).toHaveLength(1))
    expect(replyIdOf(sentFrames(h)[0])).toBeUndefined()
    expect(firstSentText(h)).toBe('在')
    await stop(h)
  })

  it('文本中间的同形文字原样保留（不当标记处理）', async () => {
    const h = await makeCmdHarness({ interimMessages: false })
    sendPrivate(h, '在吗')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    runTurn(h, h.sessionIds[0], '想引用的话就这样写 [引用:123] 明白吗')
    await vi.waitFor(() => expect(sentFrames(h)).toHaveLength(1))
    expect(replyIdOf(sentFrames(h)[0])).toBeUndefined()
    expect(firstSentText(h)).toBe('想引用的话就这样写 [引用:123] 明白吗')
    await stop(h)
  })

  it('只有标记没有正文 → 什么也不发', async () => {
    const h = await makeCmdHarness({ interimMessages: false })
    const triggerId = sendPrivate(h, '在吗')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    runTurn(h, h.sessionIds[0], '[引用:' + triggerId + ']\n   ')
    await settle(60)
    expect(sentFrames(h)).toHaveLength(0)
    await stop(h)
  })
})

// ─────────────────────────── 端到端：自动引用 config ───────────────────────────

describe('groupAutoQuote 自动引用', () => {
  /** 触发一个群回合并等它结束，返回发出的帧。 */
  async function groupTurn(autoQuote: 'off' | 'busy' | 'always', interrupt: boolean): Promise<{ h: Harness; frames: ReturnType<typeof sentFrames>; triggerId: number }> {
    const h = await makeCmdHarness({ interimMessages: false, groupAutoQuote: autoQuote })
    const triggerId = sendGroupMention(h, '出来一下')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    if (interrupt) {
      const otherId = sendGroupPlain(h, '我也说一句')
      await waitSeen(h, GROUP, String(otherId))
    }
    runTurn(h, h.sessionIds[0], '来了')
    await vi.waitFor(() => expect(sentFrames(h)).toHaveLength(1))
    return { h, frames: sentFrames(h), triggerId }
  }

  it("off（默认）= 现状：不自动引用", async () => {
    const { h, frames } = await groupTurn('off', false)
    expect(replyIdOf(frames[0])).toBeUndefined()
    await stop(h)
  })

  it('always = 每次都引用叫她的那条消息', async () => {
    const { h, frames, triggerId } = await groupTurn('always', false)
    expect(replyIdOf(frames[0])).toBe(String(triggerId))
    expect(firstSentText(h)).toBe('来了')
    await stop(h)
  })

  it('busy：中间没人插话 → 不引用', async () => {
    const { h, frames } = await groupTurn('busy', false)
    expect(replyIdOf(frames[0])).toBeUndefined()
    await stop(h)
  })

  it('busy：中间有别人说话 → 引用叫她的那条消息', async () => {
    const { h, frames, triggerId } = await groupTurn('busy', true)
    expect(replyIdOf(frames[0])).toBe(String(triggerId))
    await stop(h)
  })

  it('私聊不自动引用（即使配置为 always）', async () => {
    const h = await makeCmdHarness({ interimMessages: false, groupAutoQuote: 'always' })
    sendPrivate(h, '在吗')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    runTurn(h, h.sessionIds[0], '在')
    await vi.waitFor(() => expect(sentFrames(h)).toHaveLength(1))
    expect(replyIdOf(sentFrames(h)[0])).toBeUndefined()
    await stop(h)
  })
})

// ─────────────────────────── 容错：reply 段被拒 ───────────────────────────

describe('带 reply 段发送失败', () => {
  it('网关拒绝（OneBotActionError，非超时）→ 去掉 reply 段重发一次，只发出一条消息', async () => {
    const h = await makeCmdHarness({ interimMessages: false })
    const triggerId = sendPrivate(h, '在吗')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    const realCall = h.connection.call.bind(h.connection)
    let quotedAttempts = 0
    h.connection.call = (async (action: string, params: Record<string, unknown>) => {
      const message = params.message as Array<{ type?: string }> | undefined
      if (action === 'send_msg' && Array.isArray(message) && message.some(seg => seg.type === 'reply')) {
        quotedAttempts += 1
        // 网关明确拒绝（retcode）：消息确定没发出去，去掉 reply 段重发是安全的
        throw new OneBotActionError('OneBot action failed (retcode 1200): 引用消息不存在')
      }
      return await realCall(action, params)
    }) as never
    runTurn(h, h.sessionIds[0], '[引用:' + triggerId + '] 在')
    await vi.waitFor(() => expect(sentFrames(h)).toHaveLength(1))
    expect(quotedAttempts).toBe(1)
    expect(replyIdOf(sentFrames(h)[0])).toBeUndefined()
    expect(firstSentText(h)).toBe('在')
    await stop(h)
  })
})

// ─────────────────────────── 容错：只有「确定没发出去」才重发 ───────────────────────────

describe('带 reply 段发送失败的其它错误一律不重发', () => {
  /** 最简 OutboundPipeline：连接正常、逐次记录 send_msg，call 按用例注入失败。 */
  function makePipeline(fail: (params: Record<string, unknown>) => Error | undefined): {
    pipeline: OutboundPipeline
    calls: Array<{ action: string; params: Record<string, unknown> }>
  } {
    const calls: Array<{ action: string; params: Record<string, unknown> }> = []
    const pipeline = new OutboundPipeline({
      getChat: () => undefined,
      connected: () => true,
      selfId: () => '10002',
      call: async (action, params) => {
        calls.push({ action, params })
        const error = fail(params)
        if (error !== undefined) throw error
        return { message_id: 9000 + calls.length }
      },
      isStopping: () => false,
      log: () => undefined,
      config: {
        botQQ: '10002', sensitivePatterns: [], textImageThreshold: 0, maxImageBytes: 8 * 1024 * 1024,
        cardFooter: '', fontFiles: [], fontFamilies: [],
      },
    })
    return { pipeline, calls }
  }

  const segments = [{ type: 'text', data: { text: '在' } }]

  it('超时（消息可能已送达）→ 只调用一次 send_msg，原始错误上抛', async () => {
    const timeout = new OneBotActionError('OneBot action send_msg timed out after 10000ms')
    const { pipeline, calls } = makePipeline(() => timeout)
    const caught = await pipeline.sendMsg(PRIVATE, segments, { replyTo: '5000' }).then(() => undefined, (error: unknown) => error)
    expect(caught).toBe(timeout)
    expect(calls).toHaveLength(1) // 没有第二次「去掉 reply」的重发
    const message = calls[0].params.message as Array<{ type: string }>
    expect(message.some(seg => seg.type === 'reply')).toBe(true) // 唯一一次就是带引用的那次
  })

  it('断连 → 只调用一次 send_msg，上抛的仍是 OneBotNotConnectedError', async () => {
    const notConnected = new OneBotNotConnectedError()
    const { pipeline, calls } = makePipeline(() => notConnected)
    const caught = await pipeline.sendMsg(PRIVATE, segments, { replyTo: '5000' }).then(() => undefined, (error: unknown) => error)
    expect(caught).toBe(notConnected) // 错误类型不被重发掩盖（deferred 补发据此分类）
    expect(caught).toBeInstanceOf(OneBotNotConnectedError)
    expect(calls).toHaveLength(1)
  })
})

// ─────────────────────────── 工具：reply_to ───────────────────────────

describe('qq_send_* 的 reply_to', () => {
  async function toolHarness(): Promise<{ h: Harness; tool: (name: string) => Tool; sessionId: string }> {
    const h = await makeCmdHarness({ interimMessages: false })
    const sessionId = 'sess-tool'
    ;(h.bridge as unknown as { bySession: Map<string, string> }).bySession.set(sessionId, GROUP)
    const tools = new Map<string, Tool>()
    h.ctx.provide('tools' as never, {
      register: (tool: Tool) => { tools.set(tool.name, tool); return () => undefined },
    } as never)
    registerTools(h.ctx, h.bridge, h.connection, { maxImageBytes: 1_000_000, maxVoiceBytes: 1_000_000, maxFileBytes: 1_000_000 })
    ;(h.bridge as unknown as { seenMessageIds: SeenMessageIds }).seenMessageIds.noteInbound(GROUP, '555')
    return {
      h,
      sessionId,
      tool: name => {
        const found = tools.get(name)
        if (found === undefined) throw new Error('tool not registered: ' + name)
        return found
      },
    }
  }

  it('reply_to 透传成 reply 段（已见 id）', async () => {
    const { h, tool, sessionId } = await toolHarness()
    const exec = { agent: { session: { id: sessionId } } }
    const result = await tool('qq_send_image').execute({ sources: ['https://example.com/a.png'], reply_to: '555' }, exec) as { sent: boolean; quoteIgnored?: boolean }
    expect(result.sent).toBe(true)
    expect(result.quoteIgnored).toBe(false)
    await vi.waitFor(() => expect(sentFrames(h)).toHaveLength(1))
    expect(replyIdOf(sentFrames(h)[0])).toBe('555')
    await stop(h)
  })

  it('不认识的 reply_to 丢弃，并在工具结果里提示', async () => {
    const { h, tool, sessionId } = await toolHarness()
    const exec = { agent: { session: { id: sessionId } } }
    const result = await tool('qq_send_image').execute({ sources: ['https://example.com/a.png'], reply_to: '999999' }, exec) as { sent: boolean; quoteIgnored?: boolean }
    expect(result.sent).toBe(true)
    expect(result.quoteIgnored).toBe(true)
    const rendered = tool('qq_send_image').output?.render({}, result) ?? []
    expect(rendered.map(part => part.text).join('')).toContain('引用的消息 id 无效，已按不引用发送')
    await vi.waitFor(() => expect(sentFrames(h)).toHaveLength(1))
    expect(replyIdOf(sentFrames(h)[0])).toBeUndefined()
    await stop(h)
  })
})

// ─────────────────────────── 超时补发不泄露标记 ───────────────────────────

describe('超时补发（deferred）不泄露引用标记', () => {
  it('buildDeferredText 剥掉正文开头的标记（含历史记录里带标记的条目）', () => {
    const entry: DeferredEntry = {
      chatId: PRIVATE, sessionId: 's-1', registeredAt: 1_000, updatedAt: 1_000,
      attempts: 0, state: 'pending',
    }
    expect(buildDeferredText({ ...entry, resultText: '[引用:777] 补发正文' }, { kind: 'completed' }))
      .toBe(DEFERRED_PREFIX + '补发正文')
    expect(buildDeferredText({ ...entry, resultText: '[引用:777]\n   ' }, { kind: 'completed' }))
      .toBe(DEFERRED_PREFIX + '任务已完成，但没有产生文字结果。')
  })

  it('捕获的最终文字已剥掉标记，补发文本不含 [引用:', async () => {
    const mediaDir = mkdtempSync(join(tmpdir(), 'reply-quote-deferred-'))
    const sends: Array<{ chatId: string; text: string }> = []
    const tasks: Array<{ fn: () => void }> = []
    const ctx: DeferredContext = {
      sendToChat: async (chatId, text) => { sends.push({ chatId, text }); return ['1'] },
      isTurnRunning: () => true,
      takePendingText: () => null,
      log: () => undefined,
      mediaDir,
      timeoutMs: 1_000,
      isStopping: () => false,
    }
    const delivery = new DeferredDelivery(ctx, {
      now: () => 1_000,
      schedule: (fn: () => void) => { const task = { fn }; tasks.push(task); return task },
      cancel: () => undefined,
    })
    delivery.onTurnStart(PRIVATE, 's-1')
    const pending = tasks.shift()
    expect(pending).toBeDefined()
    pending!.fn() // 触发超时 → 登记补发跟踪
    delivery.onAssistantMessage(PRIVATE, 's-1', { content: [{ type: 'text', text: '[引用:777] 补发正文' }] })
    delivery.onTurnEnd(PRIVATE, 's-1', { kind: 'completed' })
    await settle(30)
    const delivered = sends[sends.length - 1]
    expect(delivered.text).toBe(DEFERRED_PREFIX + '补发正文')
    expect(sends.map(item => item.text).join('\n')).not.toContain('[引用:')
  })
})