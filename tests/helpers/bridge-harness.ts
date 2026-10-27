/**
 * Shared bridge test harnesses: the fake agent
 * registry, the full reverse-WS harness, the compact command harness, and
 * the disconnect/reconnect helpers. Extracted from bridge.spec.ts so
 * the five-split target specs (commands/inbound/outbound/interim/registry)
 * can reuse the same stubs.
 * @module dsh-qq-companion/tests/helpers/bridge-harness
 */
import { expect, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import WebSocket from 'ws'

import { OneBotConnection } from '../../src/connection.js'
import { ChatBridge } from '../../src/bridge.js'
import { MediaStore } from '../../src/media.js'
import { Transcriber } from '../../src/stt.js'
import { Synthesizer } from '../../src/tts.js'
import { TraceSink } from '../../src/trace.js'

/** A fake agent handle for the bridge. */
export function makeFakeAgents(
  sessionIds: string[],
  captured: { followups: Array<{ text: string; sessionId: string; id?: string; source?: unknown }>; steers?: Array<{ text: string; sessionId: string }>; createdMeta?: Array<{ cwd?: string; agentPreset?: string }>; channelTools?: string[]; channelSections?: string[] },
  opts?: { failCreateFor?: string; resumeOk?: boolean; createDelayMs?: number },
) {
  const disposed: string[] = []
  const agents = {
    create: vi.fn(async (options: { sessionId: string; meta?: { cwd?: string; agentPreset?: string }; setup?: (agentCtx: unknown) => unknown }) => {
      if (opts?.createDelayMs !== undefined) await new Promise(resolve => setTimeout(resolve, opts.createDelayMs))
      const sessionId = String(options.sessionId)
      sessionIds.push(sessionId)
      captured.createdMeta?.push({ ...options.meta })
      if (opts?.failCreateFor !== undefined && sessionId === opts.failCreateFor) {
        throw new Error('session "' + sessionId + '" already has a persisted log on disk that does not match this live session (id collision)')
      }
      const agent = {
        session: { id: sessionId, seq: 0, header: { cwd: options.meta?.cwd ?? process.cwd() } },
        status: 'idle',
        cancel: () => { agent.status = 'idle' },
        followup: (message: { content: Array<{ type: string; text?: string }>; id?: string; source?: unknown }) => {
          const text = message.content.map(b => b.text ?? '').join('')
          // id/source 是插件创建那条 user message 的原样字段：宿主的
          // `user/message` 接纳事件带的就是它，测试靠它精确对账回合身份。
          captured.followups.push({ text, sessionId, id: message.id, source: message.source })
        },
        // the transcript steer path (raw text capture).
        steer: (message: { content: Array<{ type: string; text?: string }> }) => {
          captured.steers?.push({ text: message.content.map(b => b.text ?? '').join(''), sessionId })
        },
        whenIdle: async () => undefined,
      }
      if (typeof options.setup === 'function') {
        // Agent setup receives the agent's own scope: platform prompt section
        // + qq_* tools must register here (installChannelScope), never on the
        // plugin context.
        const agentCtx = {
          on: () => () => undefined,
          systemPrompt: { section: (s: { name: string }) => { captured.channelSections?.push(s.name); return () => undefined } },
          tools: { register: (t: { name: string }) => { captured.channelTools?.push(t.name); return () => undefined } },
        }
        await options.setup(agentCtx)
      }
      return { agent, dispose: vi.fn(async () => { disposed.push(sessionId) }) }
    }),
    disposed,
    resume: vi.fn(async (options: { resumeSessionId: string; setup?: (agentCtx: unknown) => unknown }) => {
      if (opts?.resumeOk !== true) throw new Error('not persisted')
      const sessionId = String(options.resumeSessionId)
      sessionIds.push(sessionId)
      const agent = {
        session: { id: sessionId, seq: 1, header: { cwd: process.cwd() } },
        status: 'idle',
        cancel: () => { agent.status = 'idle' },
        followup: (message: { content: Array<{ type: string; text?: string }>; id?: string; source?: unknown }) => {
          const text = message.content.map(b => b.text ?? '').join('')
          captured.followups.push({ text, sessionId, id: message.id, source: message.source })
        },
        steer: (message: { content: Array<{ type: string; text?: string }> }) => {
          captured.steers?.push({ text: message.content.map(b => b.text ?? '').join(''), sessionId })
        },
        whenIdle: async () => undefined,
      }
      if (typeof options.setup === 'function') {
        await options.setup({ on: () => () => undefined, systemPrompt: { section: () => () => undefined }, tools: { register: () => () => undefined } })
      }
      return { agent, dispose: async () => undefined }
    }),
  }
  return agents
}

/** Full bridge + WS harness: inbound via real WebSocket, outbound captured. */
export async function makeHarness(opts?: { failCreateFor?: string; mediaDir?: string; interimMessages?: boolean; textImageThreshold?: number; maxImageBytes?: number; resumeOk?: boolean; createDelayMs?: number; transcriber?: Transcriber; trace?: TraceSink; ignoreSelf?: boolean; requireMention?: boolean; newMessagePolicy?: 'queue' | 'steer'; deferredTimeoutMs?: number; groupTriggerPolicy?: import('../../src/group-trigger-policy.js').GroupTriggerConfig; log?: (level: string, message: string) => void }) {
  const ctx = new Context()
  const sessionIds: string[] = []
  const captured = { followups: [] as Array<{ text: string; sessionId: string; id?: string; source?: unknown }>, steers: [] as Array<{ text: string; sessionId: string }>, channelTools: [] as string[], channelSections: [] as string[] }
  const agents = makeFakeAgents(sessionIds, captured, opts)
  const sessions = { flush: vi.fn(async () => undefined) }
  const mediaDir = opts?.mediaDir ?? mkdtempSync(join(tmpdir(), 'onebot-test-'))
  const connection = new OneBotConnection({
    host: '127.0.0.1', port: 0, accessToken: 'test-token', callTimeoutMs: 3_000,
  })
  const bridge = new ChatBridge({
    ctx,
    connection,
    media: new MediaStore(join(mediaDir, 'media'), 6),
    transcriber: opts?.transcriber ?? new Transcriber({ enabled: false, engine: 'auto', command: '', args: [], model: 'small', timeoutMs: 10_000 }),
    agents: agents as never,
    sessions: sessions as never,
    agentPresets: undefined as never,
    workspaceRegistry: undefined as never,
    defaultModel: undefined,
    config: {
      botQQ: '10002', ignoreSelf: opts?.ignoreSelf ?? false, requireMention: opts?.requireMention ?? true,
      ...(opts?.groupTriggerPolicy !== undefined ? { groupTriggerPolicy: opts.groupTriggerPolicy } : {}),
      interimMessages: opts?.interimMessages ?? true, sendErrorNotice: true, restrictedMemberPrefix: false,
      sensitivePatterns: [], mediaDir, maxImageBytes: opts?.maxImageBytes ?? 8 * 1024 * 1024,
      maxVoiceBytes: 15 * 1024 * 1024, maxFileBytes: 20 * 1024 * 1024,
      textImageThreshold: opts?.textImageThreshold ?? 0, cardFooter: 'dsh', fontFiles: [], fontFamilies: [],
      agentPreset: 'standard', workspacePath: mediaDir,
      // busy-turn policy override (absent = the 'queue' default).
      ...(opts?.newMessagePolicy !== undefined ? { newMessagePolicy: opts.newMessagePolicy } : {}),
      // deferred-delivery timeout override (absent = the 10min default).
      ...(opts?.deferredTimeoutMs !== undefined ? { deferredTimeoutMs: opts.deferredTimeoutMs } : {}),
      // optional decision-trace sink (absent = tracing off).
      trace: opts?.trace,
    },
    policy: {
      dmPolicy: 'open', groupPolicy: 'open', allowFrom: [], groupAllowFrom: [],
      adminUsers: ['10001'], allowAllUsers: false, requireMention: true,
    },
    log: (level: string, message: string) => opts?.log?.(level, message),
  })
  connection.onMessage = event => {
    void bridge.handleInbound(event)
  }
  bridge.start()
  connection.start()
  await vi.waitFor(() => expect(connection.address()).toBeDefined())
  const address = connection.address()!
  const client = new WebSocket('ws://127.0.0.1:' + address.port + '/ws', { headers: { Authorization: 'Bearer test-token' } })
  await vi.waitFor(() => expect(client.readyState).toBe(WebSocket.OPEN))
  const outbound: Array<Record<string, unknown>> = []
  client.on('message', data => {
    const frame = JSON.parse(data.toString()) as Record<string, unknown>
    outbound.push(frame)
    if (typeof frame.echo === 'string') {
      client.send(JSON.stringify({ status: 'ok', retcode: 0, data: { message_id: 7 }, echo: frame.echo }))
    }
  })
  const sendText = (text: string): void => {
    client.send(JSON.stringify({
      post_type: 'message', message_type: 'private', user_id: 10001, self_id: 10002,
      message: [{ type: 'text', data: { text } }], raw_message: text,
      sender: { user_id: 10001, nickname: '小明' },
    }))
  }
  const sendPlainGroupTextAs = (text: string, userId: number): void => {
    client.send(JSON.stringify({
      post_type: 'message', message_type: 'group', user_id: userId, group_id: 888, self_id: 10002,
      message: [{ type: 'text', data: { text } }], raw_message: text,
      sender: { user_id: userId, nickname: '用户' + userId },
    }))
  }
  return { ctx, sessionIds, captured, sessions, mediaDir, connection, bridge, client, outbound, sendText, sendPlainGroupTextAs }
}

export function makeEvent(type: string, data: unknown): SessionEvent {
  return { seq: 0, time: Date.now(), type: type as never, data: data as never } as SessionEvent
}

/**
 * 宿主真实接纳：agent-loop 把插件 dispatch 的那条 user message append 进
 * transcript 时发 `user/message`（data 就是那条 message 本身，含 id/source）。
 * 回合身份（谁在说话、引用谁）只从这里来——排队 FIFO 只负责“发过什么”。
 * 顺序与宿主一致：turn/start 之后、assistant/message 之前。
 */
export function admitUserMessage(
  h: {
    ctx: { emit: (type: string, session: unknown, event: SessionEvent) => unknown }
    captured: { followups: Array<{ text: string; sessionId: string; id?: string; source?: unknown }> }
  },
  sessionId: string,
  opts?: { index?: number; chain?: Array<{ type: string; text?: string }> },
): void {
  const mine = h.captured.followups.filter(f => f.sessionId === sessionId)
  const found = opts?.index === undefined ? mine.at(-1) : mine[opts.index]
  if (found === undefined) throw new Error('没有可接纳的 dispatch（session ' + sessionId + '）')
  h.ctx.emit('session/event', { id: sessionId }, makeEvent('user/message', {
    role: 'user',
    id: found.id,
    source: found.source,
    content: opts?.chain ?? [{ type: 'text', text: found.text }],
  }))
}

/** 只给 goal 轮的接纳用：带宿主 goal-round 来源的 user message。 */
export function admitGoalRound(
  h: {
    ctx: { emit: (type: string, session: unknown, event: SessionEvent) => unknown }
    captured: { followups: Array<{ text: string; sessionId: string }> }
  },
  sessionId: string,
  source: { goalId: string; revision: number; round: number },
): void {
  h.ctx.emit('session/event', { id: sessionId }, makeEvent('user/message', {
    role: 'user',
    id: 'goal-round-' + String(source.round),
    source: { kind: 'goal', goalId: source.goalId, revision: source.revision, round: source.round },
    content: [{ type: 'text', text: '<goal_round>' }],
  }))
}

/** Compact harness for the slash-command tests (options inject stubs). */
export async function makeCmdHarness(opts?: {
  agentPresets?: unknown
  dshHome?: string
  interimMessages?: boolean
  unknownCommand?: 'intercept' | 'passthrough'
  interimRecallMs?: number
  interimRecall?: boolean
  rateLimitPerMinute?: number
  requireMention?: boolean
  groupTriggerPolicy?: import('../../src/group-trigger-policy.js').GroupTriggerConfig
  restrictedMemberPrefix?: boolean
  newMessagePolicy?: 'queue' | 'steer'
  /** auto-steer eligibility knob; absent = the bridge default 'admin'. */
  autoSteerPolicy?: 'admin' | 'all'
  /** deferred-delivery timeout override (absent = the 10min default). */
  deferredTimeoutMs?: number
  /** media dir override（重启恢复测试复用同一目录的注册表/映射文件）。 */
  mediaDir?: string
  /** 重启恢复测试：让 agents.resume 成功（缺省 = resume 失败，走新建）。 */
  resumeOk?: boolean
  commands?: unknown
  /** Admin private-chat defaults. */
  adminPreset?: string
  adminPermission?: string
  /** 非管理员私聊与所有群聊的新会话自动切换的宿主权限预设。 */
  memberPermission?: string
  adminWorkspacePath?: string
  idleResetHours?: number
  groupMemoryDir?: string
  privateResetDays?: number
  groupResetDays?: number
  activity?: unknown
  allowAllUsers?: boolean
  agentDefaultModel?: unknown
  workspaceRegistry?: unknown
  /** /session list previews: a SessionPersistenceLike stub (stat probe +
   * open read handles). Absent = the bridge sees no persistence service and
   * the list renders preview-less items. */
  sessionPersistence?: unknown
  /** optional trace sink (absent = tracing off). */
  trace?: TraceSink
  /** optional log capture for reference-number assertions. */
  log?: (level: string, message: string) => void
  /** Group access (absent = open). The array is used as-is, so a test can
   * mutate it like GroupAccess does. */
  groupPolicy?: 'open' | 'allowlist' | 'disabled'
  groupAllowFrom?: string[]
  /** Risk control wiring (a typingPacer also turns humanTypingPace on). */
  typingPacer?: { wait(text: string): Promise<void> }
  sendCounter?: { record(): void }
  splitLines?: boolean
  groupSplitLines?: boolean
  groupReasoningEffort?: '' | 'off' | 'low' | 'high' | 'max'
  groupChatter?: unknown
  /** 群聊自动引用（reply-quote）：absent = 'off'（现状）。 */
  groupAutoQuote?: 'off' | 'busy' | 'always'
  /** 输出协议 B 档总开关（absent = 关闭，完全不解析）。 */
  protocolMode?: 'off' | 'on'
  /** 输出协议只在哪些聊天启用（absent = 对所有聊天生效）。 */
  protocolChats?: string[]
  /** 长回复转图片卡片的字数阈值（absent = 0，永不转卡片）。 */
  textImageThreshold?: number
  /** 表情包库（absent = 未开启，入站表情包不带收藏标注）。 */
  stickers?: unknown
  /** 公开记忆文件（absent = 不注册 qq_memory_note；能力矩阵测试用）。 */
  publicMemoryFile?: string
  /** 全局关闭的能力 id（absent = 全部开启；能力矩阵测试用）。 */
  capabilitiesDeny?: string[]
  /** 只对好友 / 群聊 / 陌生人关掉的能力 id（T11 r1；absent = 不额外关）。 */
  ownerDeny?: string[]
  friendDeny?: string[]
  memberDeny?: string[]
  strangerDeny?: string[]
  /** 额外给好友 / 群聊 / 陌生人开放的能力 id（T11；absent = 不加开）。 */
  friendGrant?: string[]
  memberGrant?: string[]
  strangerGrant?: string[]
  /** 额外给主人私聊开放的能力 id（T14 r2；只对 ownerDefault 为 false 的能力有意义）。 */
  ownerGrant?: string[]
  /** 好友名单（关系矩阵测试用；absent = 空）。 */
  friendUsers?: string[]
  /** 关系矩阵的三个比例（absent = 配置默认值）。 */
  memberObedience?: number
  friendObedience?: number
  friendIntimacy?: number
  /** 离线语音合成（T15；absent = 没配引擎，qq_send_tts 不注册）。 */
  tts?: { command: string; args?: string[]; model?: string; voice?: string; maxChars?: number }
  /** 长任务的宿主 goals 端口（T16；absent = 部署里没有 goals 服务）。 */
  goals?: () => unknown
  /** 长任务回传节奏（T16；absent = 配置默认值 1 = 逐轮回传）。 */
  taskEveryRounds?: number
  /** 自动旁问（BTW 式侧道）：给 fork 就等于开启功能并接线（T18 自动模式）。 */
  sideAsk?: {
    enabled?: boolean
    concurrency?: number
    maxChars?: number
    fork?: (parent: unknown, prompt: string, signal: AbortSignal) => Promise<string>
  }
}) {
  const ctx = new Context()
  const sessionIds: string[] = []
  const capturedMeta: Array<{ cwd?: string; agentPreset?: string }> = []
  // steers are captured alongside followups so the /steer and
  // 'steer'-policy tests can assert the exact steered text.
  const captured = {
    followups: [] as Array<{ text: string; sessionId: string; id?: string; source?: unknown }>,
    steers: [] as Array<{ text: string; sessionId: string }>,
    /** 自动旁问收到的 prompt（fork 侧只看得到这段文字）。 */
    sideAsks: [] as string[],
    createdMeta: capturedMeta,
    /** names of the tools registered on an agent's own scope (installChannelScope). */
    channelTools: [] as string[],
    /** names of the system-prompt sections registered on that scope. */
    channelSections: [] as string[],
  }
  const agents = makeFakeAgents(sessionIds, captured, opts?.resumeOk !== undefined ? { resumeOk: opts.resumeOk } : undefined)
  const sessions = { flush: vi.fn(async () => undefined) }
  const mediaDir = opts?.mediaDir ?? mkdtempSync(join(tmpdir(), 'onebot-test-'))
  const connection = new OneBotConnection({
    host: '127.0.0.1', port: 0, accessToken: 'test-token', callTimeoutMs: 3_000,
  })
  const bridge = new ChatBridge({
    ctx,
    connection,
    dshHome: opts?.dshHome,
    media: new MediaStore(join(mediaDir, 'media'), 6),
    transcriber: new Transcriber({ enabled: false, engine: 'auto', command: '', args: [], model: 'small', timeoutMs: 10_000 }),
    agents: agents as never,
    sessions: sessions as never,
    agentPresets: opts?.agentPresets as never,
    ...(opts?.activity !== undefined ? { activity: opts.activity as never } : {}),
    ...(opts?.groupChatter !== undefined ? { groupChatter: opts.groupChatter as never } : {}),
    ...(opts?.stickers !== undefined ? { stickers: opts.stickers as never } : {}),
    // T16：和立即生产接线同构——宿主没有 goals 服务时 deps 里也不放它。
    ...(opts?.goals !== undefined ? { goals: opts.goals as never } : {}),
    // T18：只有真的拿到 fork 适配器才接线，和 src/index.ts 的降级路径同构。
    ...(opts?.sideAsk?.fork !== undefined ? {
      sideAskFork: {
        ask: (parent: unknown, prompt: string, signal: AbortSignal) => {
          captured.sideAsks.push(prompt)
          return opts.sideAsk!.fork!(parent, prompt, signal)
        },
      },
    } : {}),
    // T15：和立即生产接线同构——引擎没配好（ready 为 false）时 deps 里也不放合成器。
    ...(() => {
      if (opts?.tts === undefined) return {}
      const synthesizer = new Synthesizer({
        enabled: true,
        engine: 'command',
        command: opts.tts.command,
        args: opts.tts.args ?? ['{text}', '{output}'],
        model: opts.tts.model ?? '',
        voice: opts.tts.voice ?? '',
        maxChars: opts.tts.maxChars ?? 200,
        timeoutMs: 10_000,
      }, mediaDir)
      // 生产里挂载时会先探一次（src/index.ts）；这一步必须同步，否则 ready 永远是 false。
      synthesizer.probe()
      return synthesizer.ready ? { tts: synthesizer } : {}
    })(),
    commands: (opts?.commands ?? {
      execute: vi.fn(async (_agent: unknown, _line: string, attachments: readonly unknown[], signal: AbortSignal | undefined) => {
        // Mirror the host: execute() reads submittedAttachments.length and
        // signal.aborted unconditionally.
        if (!Array.isArray(attachments)) throw new Error("Cannot read properties of undefined (reading 'length')")
        if (signal === undefined) throw new Error("Cannot read properties of undefined (reading 'aborted')")
        return { commandId: 'cmd-test', result: { kind: 'success', text: 'Plan mode on. Use /plan off to leave.' } }
      }),
    }) as never,
    sessionPersistence: (opts?.sessionPersistence ?? undefined) as never,
    workspaceRegistry: (opts?.workspaceRegistry ?? undefined) as never,
    agentDefaultModel: (opts?.agentDefaultModel ?? undefined) as never,
    defaultModel: () => ({ provider: 'deepseek', model: 'deepseek-chat' }),
    config: {
      botQQ: '10002', ignoreSelf: false, requireMention: opts?.requireMention ?? true,
      ...(opts?.groupTriggerPolicy !== undefined ? { groupTriggerPolicy: opts.groupTriggerPolicy } : {}),
      interimMessages: opts?.interimMessages ?? true,
      ...(opts?.unknownCommand !== undefined ? { unknownCommand: opts.unknownCommand } : {}),
      ...(opts?.interimRecallMs !== undefined ? { interimRecallMs: opts.interimRecallMs } : {}),
      ...(opts?.interimRecall !== undefined ? { interimRecall: opts.interimRecall } : {}),
      ...(opts?.rateLimitPerMinute !== undefined ? { rateLimitPerMinute: opts.rateLimitPerMinute } : {}),
      sendErrorNotice: true,
      ...(opts?.restrictedMemberPrefix !== undefined ? { restrictedMemberPrefix: opts.restrictedMemberPrefix } : {}),
      ...(opts?.newMessagePolicy !== undefined ? { newMessagePolicy: opts.newMessagePolicy } : {}),
      ...(opts?.autoSteerPolicy !== undefined ? { autoSteerPolicy: opts.autoSteerPolicy } : {}),
      // deferred-delivery timeout override (absent = the 10min default).
      ...(opts?.deferredTimeoutMs !== undefined ? { deferredTimeoutMs: opts.deferredTimeoutMs } : {}),
      ...(opts?.taskEveryRounds !== undefined ? { taskEveryRounds: opts.taskEveryRounds } : {}),
      ...(opts?.sideAsk !== undefined ? {
        sideAskEnabled: opts.sideAsk.enabled ?? true,
        ...(opts.sideAsk.concurrency !== undefined ? { sideAskConcurrency: opts.sideAsk.concurrency } : {}),
        ...(opts.sideAsk.maxChars !== undefined ? { sideAskMaxChars: opts.sideAsk.maxChars } : {}),
      } : {}),
      sensitivePatterns: [], mediaDir, maxImageBytes: 8 * 1024 * 1024,
      maxVoiceBytes: 15 * 1024 * 1024, maxFileBytes: 20 * 1024 * 1024,
      textImageThreshold: opts?.textImageThreshold ?? 0, cardFooter: 'dsh', fontFiles: [], fontFamilies: [],
      agentPreset: 'standard', workspacePath: mediaDir,
      ...(opts?.protocolMode !== undefined ? { protocolMode: opts.protocolMode } : {}),
      ...(opts?.protocolChats !== undefined ? { protocolChats: opts.protocolChats } : {}),
      ...(opts?.publicMemoryFile !== undefined ? { publicMemoryFile: opts.publicMemoryFile } : {}),
      ...(opts?.capabilitiesDeny !== undefined ? { capabilitiesDeny: opts.capabilitiesDeny } : {}),
      ...(opts?.ownerDeny !== undefined ? { ownerDeny: opts.ownerDeny } : {}),
      ...(opts?.friendDeny !== undefined ? { friendDeny: opts.friendDeny } : {}),
      ...(opts?.memberDeny !== undefined ? { memberDeny: opts.memberDeny } : {}),
      ...(opts?.strangerDeny !== undefined ? { strangerDeny: opts.strangerDeny } : {}),
      ...(opts?.friendGrant !== undefined ? { friendGrant: opts.friendGrant } : {}),
      ...(opts?.memberGrant !== undefined ? { memberGrant: opts.memberGrant } : {}),
      ...(opts?.strangerGrant !== undefined ? { strangerGrant: opts.strangerGrant } : {}),
      ...(opts?.ownerGrant !== undefined ? { ownerGrant: opts.ownerGrant } : {}),
      ...(opts?.adminPreset !== undefined ? { adminPreset: opts.adminPreset } : {}),
      ...(opts?.adminPermission !== undefined ? { adminPermission: opts.adminPermission } : {}),
      ...(opts?.memberPermission !== undefined ? { memberPermission: opts.memberPermission } : {}),
      ...(opts?.adminWorkspacePath !== undefined ? { adminWorkspacePath: opts.adminWorkspacePath } : {}),
      ...(opts?.idleResetHours !== undefined ? { idleResetHours: opts.idleResetHours } : {}),
      ...(opts?.groupMemoryDir !== undefined ? { groupMemoryDir: opts.groupMemoryDir } : {}),
      ...(opts?.privateResetDays !== undefined ? { privateResetDays: opts.privateResetDays } : {}),
      ...(opts?.groupResetDays !== undefined ? { groupResetDays: opts.groupResetDays } : {}),
      ...(opts?.trace !== undefined ? { trace: opts.trace } : {}),
      ...(opts?.splitLines !== undefined ? { splitLines: opts.splitLines, typingDelayMinMs: 0, typingDelayMaxMs: 0, typingDelayPerCharMs: 0 } : {}),
      ...(opts?.groupSplitLines !== undefined ? { groupSplitLines: opts.groupSplitLines } : {}),
      ...(opts?.typingPacer !== undefined ? { humanTypingPace: true } : {}),
      ...(opts?.groupReasoningEffort !== undefined ? { groupReasoningEffort: opts.groupReasoningEffort } : {}),
      ...(opts?.groupAutoQuote !== undefined ? { groupAutoQuote: opts.groupAutoQuote } : {}),
      ...(opts?.friendUsers !== undefined ? { friendUsers: opts.friendUsers } : {}),
      ...(opts?.memberObedience !== undefined ? { memberObedience: opts.memberObedience } : {}),
      ...(opts?.friendObedience !== undefined ? { friendObedience: opts.friendObedience } : {}),
      ...(opts?.friendIntimacy !== undefined ? { friendIntimacy: opts.friendIntimacy } : {}),
    },
    ...(opts?.typingPacer !== undefined ? { typingPacer: opts.typingPacer } : {}),
    ...(opts?.sendCounter !== undefined ? { sendCounter: opts.sendCounter } : {}),
    policy: {
      dmPolicy: 'open', groupPolicy: opts?.groupPolicy ?? 'open', allowFrom: [], groupAllowFrom: opts?.groupAllowFrom ?? [],
      adminUsers: ['10001'], allowAllUsers: opts?.allowAllUsers ?? false, requireMention: true,
    },
    log: (level: string, message: string) => opts?.log?.(level, message),
  })
  connection.onMessage = event => { void bridge.handleInbound(event) }
  bridge.start()
  connection.start()
  await vi.waitFor(() => expect(connection.address()).toBeDefined())
  const address = connection.address()!
  const client = new WebSocket('ws://127.0.0.1:' + address.port + '/ws', { headers: { Authorization: 'Bearer test-token' } })
  await vi.waitFor(() => expect(client.readyState).toBe(WebSocket.OPEN))
  const outbound: Array<Record<string, unknown>> = []
  client.on('message', data => {
    const frame = JSON.parse(data.toString()) as Record<string, unknown>
    outbound.push(frame)
    if (typeof frame.echo === 'string') {
      client.send(JSON.stringify({ status: 'ok', retcode: 0, data: { message_id: 7 }, echo: frame.echo }))
    }
  })
  const sendText = (text: string): void => {
    client.send(JSON.stringify({
      post_type: 'message', message_type: 'private', user_id: 10001, self_id: 10002,
      message: [{ type: 'text', data: { text } }], raw_message: text,
      sender: { user_id: 10001, nickname: '小明' },
    }))
  }
  // Variant senders for the turn-role tests (non-default users / group).
  const sendTextAs = (text: string, userId: number): void => {
    client.send(JSON.stringify({
      post_type: 'message', message_type: 'private', user_id: userId, self_id: 10002,
      message: [{ type: 'text', data: { text } }], raw_message: text,
      sender: { user_id: userId, nickname: '用户' + userId },
    }))
  }
  const sendGroupTextAs = (text: string, userId: number): void => {
    client.send(JSON.stringify({
      post_type: 'message', message_type: 'group', user_id: userId, group_id: 888, self_id: 10002,
      message: [
        { type: 'at', data: { qq: '10002' } },
        { type: 'text', data: { text } },
      ],
      raw_message: '[CQ:at,qq=10002]' + text,
      sender: { user_id: userId, nickname: '用户' + userId },
    }))
  }
  const sendPlainGroupTextAs = (text: string, userId: number): void => {
    client.send(JSON.stringify({
      post_type: 'message', message_type: 'group', user_id: userId, group_id: 888, self_id: 10002,
      message: [{ type: 'text', data: { text } }], raw_message: text,
      sender: { user_id: userId, nickname: '用户' + userId },
    }))
  }
  const chats = () => (bridge as unknown as {
    chats: Map<string, { agent: { session: { id: string } }, lastFollowup: string | undefined, busy: boolean }>
  }).chats
  return { ctx, sessionIds, capturedMeta, captured, sessions, mediaDir, connection, bridge, client, outbound, sendText, sendTextAs, sendGroupTextAs, sendPlainGroupTextAs, chats }
}

/** Close the harness client and wait until the bridge sees the disconnect. */
export async function disconnect(h: Awaited<ReturnType<typeof makeHarness>>): Promise<void> {
  h.client.close()
  await vi.waitFor(() => expect(h.connection.connected).toBe(false))
}

/** Reconnect a fresh WS client with the echo responder; returns its own captured outbound. */
export async function reconnect(h: Awaited<ReturnType<typeof makeHarness>>): Promise<{ client: WebSocket; outbound: Array<Record<string, unknown>> }> {
  const client = new WebSocket('ws://127.0.0.1:' + h.connection.address()!.port + '/ws', { headers: { Authorization: 'Bearer test-token' } })
  const outbound: Array<Record<string, unknown>> = []
  client.on('message', data => {
    const frame = JSON.parse(data.toString()) as Record<string, unknown>
    outbound.push(frame)
    if (typeof frame.echo === 'string') {
      client.send(JSON.stringify({ status: 'ok', retcode: 0, data: { message_id: 7 }, echo: frame.echo }))
    }
  })
  await vi.waitFor(() => expect(client.readyState).toBe(WebSocket.OPEN))
  return { client, outbound }
}

export const inboundAndDisconnect = async (h: Awaited<ReturnType<typeof makeHarness>>): Promise<{ id: string }> => {
  h.sendText('hi')
  await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
  const session = { id: h.sessionIds[0] }
  await disconnect(h)
  return session
}

export const sentTexts = (outbound: Array<Record<string, unknown>>): string[] =>
  outbound.filter(f => f.action === 'send_msg').map(f => JSON.stringify(f.params))

/** The bridge's internal ChatRegistry (tests reach into it directly). */
export function registryOf(h: { bridge: unknown }): ChatRegistry {
  return (h.bridge as unknown as { registry: ChatRegistry }).registry
}
