/**
 * The private quiet window: quick consecutive private lines are held and then
 * handed over as ONE turn, after the sender has been quiet for the configured
 * number of seconds. Every original line keeps its own rate-limit slot, each
 * line keeps its own <user_message> boundary, the relation banner is added once,
 * and the merged turn answers the FIRST message. Anything that is not a plain
 * text line (a command, or a message carrying media / a quote / a forward)
 * flushes what was held first. Groups are never affected.
 * @module dsh-qq-companion/tests/private-quiet
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { InboundPipeline } from '../src/inbound.js'
import type { InboundContext, NormalizedInbound } from '../src/inbound.js'

interface CtxOptions {
  quiet?: number
  rateLimit?: number
  restricted?: boolean
  adminUsers?: string[]
  allowAllUsers?: boolean
  chat?: { dispatchTimes: number[]; rateLimitNoticeAt?: number }
}

interface CtxBundle {
  ctx: InboundContext
  dispatched: { chatId: string; text: string; role: string; messageId: string | undefined }[]
  seen: string[]
  commands: string[]
  notices: string[]
}

function makeCtx(options: CtxOptions = {}): CtxBundle {
  const dispatched: CtxBundle['dispatched'] = []
  const seen: string[] = []
  const commands: string[] = []
  const notices: string[] = []
  const ctx = {
    call: async () => undefined,
    selfId: () => '10002',
    policy: {
      dmPolicy: 'open',
      groupPolicy: 'open',
      allowFrom: [],
      groupAllowFrom: [],
      adminUsers: options.adminUsers ?? ['10001'],
      allowAllUsers: options.allowAllUsers === true,
      requireMention: false,
    },
    getChat: () => options.chat,
    getSettings: () => ({}),
    sweepIdleChats: async () => undefined,
    media: { cleanupExpired: async () => undefined } as never,
    transcriber: { enabled: false } as never,
    tryHandleCommand: async (_chatId: string, text: string) => {
      commands.push(text)
      return text.startsWith('/')
    },
    buildBody: async (text: string) => text,
    expandQuote: async () => '',
    dispatchFollowup: async (chatId: string, text: string, role: string, _nickname: string | undefined, messageId: string | undefined) => {
      dispatched.push({ chatId, text, role, messageId })
    },
    noteSeenMessage: (_chatId: string, messageId: string) => { seen.push(messageId) },
    sendToChat: async (_chatId: string, text: string) => { notices.push(text); return [] },
    log: () => undefined,
    config: {
      botQQ: '10002',
      ignoreSelf: false,
      requireMention: false,
      rateLimitPerMinute: options.rateLimit ?? 0,
      restrictedMemberPrefix: options.restricted === true,
      maxInboundFileBytes: 0,
      privateQuietSeconds: options.quiet ?? 0,
    },
  }
  return { ctx: ctx as unknown as InboundContext, dispatched, seen, commands, notices }
}

function privateText(text: string, messageId: string, extra: Partial<NormalizedInbound> = {}): NormalizedInbound {
  return {
    kind: 'private',
    userId: '10001',
    groupId: '',
    chatId: 'private:10001',
    segments: [],
    raw: text,
    text,
    media: [],
    replyId: undefined,
    forwardId: undefined,
    messageId,
    nickname: '小明',
    ...extra,
  } as NormalizedInbound
}

/** the <user_message> ids carried by a merged body, in order. */
function carriedIds(text: string): string[] {
  return [...text.matchAll(/<user_message [^>]*msg="([^"]+)"/g)].map(match => match[1] ?? '')
}

describe('private quiet window', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('with the window off every private line dispatches on its own', async () => {
    const { ctx, dispatched } = makeCtx({ quiet: 0 })
    const pipeline = new InboundPipeline(ctx)
    await pipeline.processInbound(privateText('一', 'a'))
    await pipeline.processInbound(privateText('二', 'b'))
    expect(dispatched).toHaveLength(2)
    expect(dispatched.map(item => item.messageId)).toEqual(['a', 'b'])
  })

  it('holds quick lines and dispatches them once, in order', async () => {
    vi.useFakeTimers()
    const { ctx, dispatched } = makeCtx({ quiet: 3 })
    const pipeline = new InboundPipeline(ctx)
    await pipeline.processInbound(privateText('一', 'a'))
    await pipeline.processInbound(privateText('二', 'b'))
    await pipeline.processInbound(privateText('三', 'c'))
    expect(dispatched).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(3000)
    expect(dispatched).toHaveLength(1)
    const batch = dispatched[0]!
    expect(carriedIds(batch.text)).toEqual(['a', 'b', 'c'])
    // one line per held message, joined by a single newline
    expect(batch.text.split('\n').filter(line => line.startsWith('<user_message'))).toHaveLength(3)
    // the merged turn answers the first message
    expect(batch.messageId).toBe('a')
    expect(batch.role).toBe('admin')
  })

  it('every new line restarts the window', async () => {
    vi.useFakeTimers()
    const { ctx, dispatched } = makeCtx({ quiet: 3 })
    const pipeline = new InboundPipeline(ctx)
    await pipeline.processInbound(privateText('一', 'a'))
    await vi.advanceTimersByTimeAsync(2000)
    await pipeline.processInbound(privateText('二', 'b'))
    await vi.advanceTimersByTimeAsync(2000)
    expect(dispatched).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(dispatched).toHaveLength(1)
    expect(carriedIds(dispatched[0]!.text)).toEqual(['a', 'b'])
  })

  it('a command flushes the held lines first, then runs itself', async () => {
    vi.useFakeTimers()
    const { ctx, dispatched, commands } = makeCtx({ quiet: 3 })
    const pipeline = new InboundPipeline(ctx)
    await pipeline.processInbound(privateText('一', 'a'))
    await pipeline.processInbound(privateText('/stop', 'b'))
    expect(commands).toContain('/stop')
    expect(dispatched).toHaveLength(1)
    expect(carriedIds(dispatched[0]!.text)).toEqual(['a'])
    await vi.advanceTimersByTimeAsync(5000)
    expect(dispatched).toHaveLength(1)
  })

  it('a quoted message flushes the held lines and then dispatches on its own', async () => {
    vi.useFakeTimers()
    const { ctx, dispatched } = makeCtx({ quiet: 3 })
    const pipeline = new InboundPipeline(ctx)
    await pipeline.processInbound(privateText('一', 'a'))
    await pipeline.processInbound(privateText('引用一下', 'b', { replyId: 'quoted-1' }))
    expect(dispatched).toHaveLength(2)
    expect(carriedIds(dispatched[0]!.text)).toEqual(['a'])
    expect(carriedIds(dispatched[1]!.text)).toEqual(['b'])
    await vi.advanceTimersByTimeAsync(5000)
    expect(dispatched).toHaveLength(2)
  })

  it('group messages are never held', async () => {
    vi.useFakeTimers()
    const { ctx, dispatched } = makeCtx({ quiet: 3 })
    const pipeline = new InboundPipeline(ctx)
    await pipeline.processInbound(privateText('群里说话', 'g1', { kind: 'group', groupId: '888', chatId: 'group:888' }))
    expect(dispatched).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(dispatched).toHaveLength(1)
  })

  it('the per-minute limit counts every original line, not the merged batch', async () => {
    vi.useFakeTimers()
    const { ctx, dispatched, notices } = makeCtx({ quiet: 3, rateLimit: 3, chat: { dispatchTimes: [] } })
    const pipeline = new InboundPipeline(ctx)
    await pipeline.processInbound(privateText('一', 'a'))
    await pipeline.processInbound(privateText('二', 'b'))
    await pipeline.processInbound(privateText('三', 'c'))
    // the fourth line within the window is dropped and says so
    await pipeline.processInbound(privateText('四', 'd'))
    expect(notices.join('')).toContain('太频繁')
    await vi.advanceTimersByTimeAsync(3000)
    expect(dispatched).toHaveLength(1)
    expect(carriedIds(dispatched[0]!.text)).toEqual(['a', 'b', 'c'])
  })

  it('marks every held line as seen so the quote tools can address them', async () => {
    vi.useFakeTimers()
    const { ctx, seen } = makeCtx({ quiet: 3 })
    const pipeline = new InboundPipeline(ctx)
    await pipeline.processInbound(privateText('一', 'a'))
    await pipeline.processInbound(privateText('二', 'b'))
    expect(seen).toEqual(['a', 'b'])
    await vi.advanceTimersByTimeAsync(3000)
  })

  it('adds the relation banner once, in front of the whole batch', async () => {
    vi.useFakeTimers()
    const { ctx, dispatched } = makeCtx({ quiet: 3, restricted: true, adminUsers: [], allowAllUsers: true })
    const pipeline = new InboundPipeline(ctx)
    await pipeline.processInbound(privateText('一', 'a'))
    await pipeline.processInbound(privateText('二', 'b'))
    await vi.advanceTimersByTimeAsync(3000)
    const batch = dispatched[0]!
    expect(batch.role).toBe('member')
    expect(batch.text.startsWith('[')).toBe(true)
    // two <user_message> blocks, one banner: the first block is preceded by it
    expect(batch.text.split('<user_message')).toHaveLength(3)
    expect(batch.text.indexOf('<user_message')).toBeGreaterThan(0)
  })

  it('clamps the window to its 30 second ceiling', async () => {
    vi.useFakeTimers()
    const { ctx, dispatched } = makeCtx({ quiet: 90 })
    const pipeline = new InboundPipeline(ctx)
    await pipeline.processInbound(privateText('一', 'a'))
    await vi.advanceTimersByTimeAsync(29_000)
    expect(dispatched).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(dispatched).toHaveLength(1)
  })
})
