/**
 * The chat↔agent bridge: one Agent per QQ chat, inbound message pipeline
 * (policy → parse → media → STT → quote/forward expansion → followup),
 * outbound delivery driven by session events (assistant/message, turn/end),
 * typing indicator, per-chat send ordering, and chat→session mapping
 * persistence for restart resume.
 * @module dsh-qq-companion/bridge
 */
import { realpath } from 'node:fs/promises'

import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'

import type { BridgeDeps, SideAskAgentPort } from './bridge-types.js'
import { resolveCapabilities, summarizeCapabilities, groupWriteWarningLine, interactionWarningLine, type CapabilityConfig, type CapabilityDependency, type CapabilitySummary, type ResolveCapabilitiesResult } from './capabilities.js'
import { relayHostCards } from './card-relay.js'
import type { ChatId, UserRole } from './chat.js'
import { buildChatId, classifyUserRole, groupAllowed, sanitizeMessageId, splitChatId } from './chat.js'
import { STEER_ACCEPTED_NOTICE, tryHandleCommand as routeCommand, type CommandContext } from './commands.js'
import type { ScheduledPrompt } from './companion/index.js'
import { CompanionHooks, PROACTIVE_PASS } from './companion/index.js'
import type { OneBotEvent } from './connection.js'
import type { MediaRef } from './cq.js'
import { DEFAULT_DEFERRED_TIMEOUT_MS, DeferredDelivery } from './deferred.js'
import { describeError, errorStack } from './errors.js'
import { exportDiagnostics, healthReport, type HealthDeps } from './health.js'
import { InboundPipeline, normalizeOneBot11 } from './inbound.js'
import { InterimTracker } from './interim.js'
import { OutboundPipeline, type OutboundSegment, type SendOptions } from './outbound.js'
import { SideAskScheduler } from './side-ask.js'
import { parseControlBlock, parseReplyPass, type ControlBlock, type ParseControlBlockResult } from './output-protocol.js'
import { buildPlatformPrompt } from './prompt.js'
import { FailureRefRegistry, failureRefSuffix, type FailureRefKind } from './ref.js'
import { ChatRegistry, type ChatAgent } from './registry.js'
import { sessionRelation, stripRelationPrefix, type Relation } from './relation.js'
import { parseLeadingQuote, SELF_QUOTE_TOKEN, SeenMessageIds, type QuoteMarker } from './reply-quote.js'
import { registerStickerTools } from './sticker-tools.js'
import { registerGroupTools } from './group-tools.js'
import { registerInteractionTools } from './interaction-tools.js'
import {
  applyGoalView,
  bindingFrom,
  classifyAdmittedSource,
  describePhase,
  readGoalRoundSource,
  renderGoalChangeNotice,
  renderGoalRoundHeader,
  reportDueFor,
  revokeGoalGrant,
  type GoalChangedPayloadLike,
  type GoalsPortLike,
  type GoalViewLike,
  type TaskGoalBinding,
  type TaskGoalPort,
  type TaskGoalTurn,
} from './task-goal.js'
import { registerMemoryNoteTool, registerTools } from './tools.js'
import { currentTrace, newTraceId, runWithTrace, TRACE_REASONS, type TraceScope, type TraceStage } from './trace.js'

export * from './bridge-types.js'

/** the queue notice sent to a chat when a message arrives while its
 * task is running under the default 'queue' policy — at most ONE per running
 * turn (the flag resets at turn/end) so a burst of queued messages never
 * spams the chat. Exported for the deterministic text wait in tests. */
export const QUEUE_NOTICE_TEXT = '⏳ 当前任务运行中，新消息已排队，将在当前任务结束后依次处理。'

/** 排队回合身份的队列上限（T16 D1）：被 pre-step 拒绝/被丢弃的提案永远等不到
 * `user/message` 接纳事件，超限时丢最早的——身份对账失败只会退回 member
 * （失败闭合），不会误升权限。 */
const PENDING_TURNS_MAX = 16

/** assistant/message 的纯文字（与 interim 同口径：只取 text 块并拼接）。 */
function messageText(message: { content: ReadonlyArray<{ type: string; text?: string }> }): string {
  let out = ''
  for (const block of message.content) {
    if (block.type === 'text') out += block.text ?? ''
  }
  return out
}

/**
 * Bridge between OneBot events and dsh agents. Create via the constructor and
 * call start() from the plugin's effect; call stop() on disposal.
 */
export class ChatBridge {
  private readonly deps: BridgeDeps
  /** Outbound pipeline: the same-name bridge methods below delegate here. */
  private readonly outbound: OutboundPipeline
  /** The chat↔session registry: chats/bySession dual index, the
   * persistence pair, per-chat settings and the create/resume assembly. */
  private readonly registry: ChatRegistry
  /** Inbound pipeline: normalizeOneBot11 + the policy→media→quote→
   * dispatch path; the same-name bridge methods below delegate here. */
  private readonly inbound: InboundPipeline
  /** Interim domain: the assistant/message interim routing, the
   * per-message recall timers and the turn/end settlement. */
  private readonly interim: InterimTracker
  /** the deferred-delivery tracker (超时补发) — timeout timers, the
   * JSONL registry, bounded send retries and restart recovery. */
  private readonly deferred: DeferredDelivery
  /** the bounded registry of recent fault references — every minted
   * QQ-CONN-/MF- number is recorded here for the /doctor report and the
   * diagnostics archive file name. */
  private readonly failureRefs = new FailureRefRegistry()
  /** Live registry indexes — the inbound/outbound/interim/turn links keep
   * reading them through these same-name views. */
  private get chats(): Map<ChatId, ChatAgent> { return this.registry.chats }
  private get bySession(): Map<string, ChatId> { return this.registry.bySession }
  private sessionEventOff: (() => void) | undefined
  private sessionFlushOff: (() => void) | undefined
  /** chat-level traceId association table — session events arrive on a
   * different async chain than the inbound pipeline, so dispatchFollowup
   * records the initiating traceId per chat here and onSessionEvent reads it
   * back (agent 回复事件归属发起 traceId). Last dispatch wins; entries are
   * dropped when the chat is removed. Not cleared at turn/end: the interim
   * settle loop sends the final reply AFTER turn/end, and clearing there
   * would orphan exactly that reply's outbound events. One entry per chat
   * id (bounded by the chat population), so growth is not a concern. */
  private readonly traceByChat = new Map<ChatId, string>()
  /** chats that already got the QUEUE_NOTICE_TEXT for their current
   * running turn (one notice per turn; cleared at turn/end and on chat
   * removal — bounded by the chat population). */
  private readonly queueNoticeChats = new Set<ChatId>()
  /** chats that already sent their one sticker in the running turn
   * (cleared at turn/start and on chat removal). */
  private readonly stickerSentChats = new Set<string>()
  /** 最近见过的消息 id（每 chat 一个内存 LRU，见 reply-quote.ts）：
   * 入站消息（含只进群上下文、没 @ 她的）与她自己的发送 id 都在里面；
   * 引用标记与 qq_send_* 的 reply_to 只能引用集合里的 id。 */
  private readonly seenMessageIds = new SeenMessageIds()
  private stopping = false
  /** 长任务：`goal/changed` 的退订句柄（start/stop 维护）。目标轮身份改为在
   * 真实 `user/message` 接纳事件上绑定（D1/D2），不再监听 `agent/pre-step`。 */
  private goalChangeOff: (() => void) | undefined
  /** 本插件刚发出的目标操作（operation+goalId+时间戳）：对应的
   * `goal/changed` 只更新绑定、不重复对外播报。10 秒内的同操作视为自己
   * 发出的那次；更久则视为别处的改动，照常播报。 */
  private readonly selfGoalOps: Array<{ operation: string; goalId: string; at: number }> = []

  /** companion behavior (session renewal, pass marker, wake-up texts). */
  private readonly companion: CompanionHooks
  /** Optional BTW-style side-question scheduler. It is constructed only when
   * explicitly enabled and backed by a host subagent adapter. */
  private readonly sideAsk: SideAskScheduler | undefined
  private readonly sideAskAgent: SideAskAgentPort | undefined

  constructor(deps: BridgeDeps) {
    this.deps = deps
    this.registry = new ChatRegistry({
      agents: deps.agents,
      sessions: deps.sessions,
      sessionPersistence: deps.sessionPersistence,
      workspaceRegistry: deps.workspaceRegistry,
      agentPresets: deps.agentPresets,
      // optional host sessionTitle service (absent = no automatic titles).
      ...(deps.sessionTitle !== undefined ? { sessionTitle: deps.sessionTitle } : {}),
      defaultModel: deps.defaultModel,
      config: deps.config,
      log: (level, message) => deps.log(level, message),
      isStopping: () => this.stopping,
      onChatRemoved: chat => {
        this.stopTyping(chat)
        this.traceByChat.delete(chat.chatId)
        this.queueNoticeChats.delete(chat.chatId)
        this.stickerSentChats.delete(chat.chatId)
        this.seenMessageIds.forget(chat.chatId)
        // 长任务授权随聊天一起消失（只在内存）：宿主目标本身仍在会话日志里，
        // 需要时显式 /task resume 重新授权。
        chat.taskGoal = undefined
        chat.taskGoalTurn = undefined
        chat.taskGoalText = ''
        this.selfGoalOps.length = 0
      },
      installChannelScope: (agentCtx, chatId) => this.installChannelScope(agentCtx, chatId),
      isAdminPrivate: chatId => this.isAdminPrivate(chatId),
      onSessionCreated: chat => this.applyDefaultPermission(chat),
    })
    this.sideAskAgent = deps.sideAskAgent
    this.sideAsk = deps.config.sideAskEnabled && deps.sideAskAgent !== undefined
      ? new SideAskScheduler({
        concurrency: Math.max(1, Math.min(8, Math.floor(deps.config.sideAskConcurrency ?? 2))),
        // 旁问是自动触发的旁路：并发满时不能占用当前回合该走的路，
        // 一律立刻退回既有的排队/插话策略，因此固定 reject 而不是排队。
        overflow: 'reject',
      })
      : undefined
    this.companion = new CompanionHooks({
      config: deps.config,
      ...(deps.activity !== undefined ? { activity: deps.activity } : {}),
      log: (level, message) => deps.log(level, message),
      resetChat: chatId => this.registry.resetChat(chatId as ChatId),
      adminUsers: () => this.deps.policy.adminUsers,
    })
    this.outbound = new OutboundPipeline({
      getChat: chatId => this.chats.get(chatId),
      connected: () => this.deps.connection.connected,
      selfId: () => this.deps.connection.selfId,
      call: (action, params) => this.call(action, params),
      isStopping: () => this.stopping,
      log: (level, message) => this.deps.log(level, message),
      config: deps.config,
      ...(deps.sendCounter !== undefined ? { onSent: () => deps.sendCounter?.record() } : {}),
      // her own sends join the reply-quote seen set (never "someone else talking").
      noteSentId: (chatId, messageId) => { this.seenMessageIds.noteSelf(chatId, messageId) },
      ...(deps.typingPacer !== undefined ? { typingPacer: deps.typingPacer } : {}),
      // outbound decision events ride the chat's initiating traceId; a
      // write with no mapped trace (proactive tool sends) starts a fresh one.
      trace: (chatId, event) => this.traceChat(chatId, event),
    })
    this.inbound = new InboundPipeline({
      call: (action, params) => this.call(action, params),
      selfId: () => this.deps.connection.selfId,
      policy: deps.policy,
      getChat: chatId => this.chats.get(chatId),
      sweepIdleChats: () => this.registry.sweepIdleChats(),
      media: deps.media,
      transcriber: deps.transcriber,
      tryHandleCommand: (chatId, text, userId, nickname) => this.tryHandleCommand(chatId, text, userId, nickname),
      buildBody: (text, media, chatId) => this.buildBody(text, media, chatId),
      expandQuote: (messageId, chatId) => this.expandQuote(messageId, chatId),
      noteSeenMessage: (chatId, messageId) => { this.seenMessageIds.noteInbound(chatId, messageId) },
      dispatchFollowup: (chatId, text, role, nickname, messageId) => this.dispatchFollowup(chatId, text, role, nickname, { messageId }),
      interceptBusyTurn: (chatId, text, role, nickname, plain, messageId) => this.interceptBusyTurn(chatId, text, role, nickname, plain, messageId),
      ...(deps.groupChatter !== undefined ? { groupChatter: deps.groupChatter } : {}),
      ...(deps.stickers !== undefined ? { stickers: deps.stickers } : {}),
      sendToChat: (chatId, text) => this.sendToChat(chatId, text),
      log: (level, message) => this.deps.log(level, message),
      config: deps.config,
    })
    this.interim = new InterimTracker({
      sendToChat: (chatId, text, options) => this.sendToChat(chatId, text, options),
      sendMsg: (chatId, segments, options) => this.outbound.sendMsg(chatId, segments, options),
      call: (action, params) => this.call(action, params),
      chainTail: chatId => this.outbound.chainTail(chatId),
      relayHostCards: (chatId, content) => relayHostCards({
        sendToChat: (target, text) => this.sendToChat(target, text),
        log: (level, message) => this.deps.log(level, message),
      }, chatId, content),
      effectiveInterim: () => this.deps.config.interimMessages,
      log: (level, message) => this.deps.log(level, message),
      config: deps.config,
    })
    this.deferred = new DeferredDelivery({
      sendToChat: (chatId, text, options) => this.sendToChat(chatId, text, options),
      isTurnRunning: chatId => this.chats.get(chatId)?.agent.status === 'running',
      takePendingText: chatId => {
        const chat = this.chats.get(chatId)
        if (chat === undefined || chat.loopPending === null) return null
        const text = chat.loopPending
        chat.loopPending = null
        return text
      },
      traceIdFor: chatId => this.traceByChat.get(chatId),
      log: (level, message) => this.deps.log(level, message),
      trace: (chatId, event) => this.traceChat(chatId, event),
      mediaDir: deps.config.mediaDir,
      timeoutMs: deps.config.deferredTimeoutMs ?? DEFAULT_DEFERRED_TIMEOUT_MS,
      isStopping: () => this.stopping,
    })
  }

  /** Start listening: wire connection handlers and the session event feed. */
  start(): void {
    const { connection, ctx: sessionEvents } = this.deps
    connection.selfId = this.deps.config.botQQ
    this.sessionEventOff = sessionEvents.on('session/event', (session: Session, event: SessionEvent) => {
      this.onSessionEvent(session, event)
    })
    this.sessionFlushOff = sessionEvents.on('session/flush', (session: Session) => {
      void this.onSessionFlush(session)
    })
    // 长任务（T16）：目标轮身份与角色提升都挂在真实 `user/message` 接纳
    // 事件上（见 onUserMessageAdmitted）——pre-step 的决定（reject/replace/
    // abort）不会走到接纳事件，因此被拒提案永远污染不了后续步（D2）。
    this.goalChangeOff = sessionEvents.on('goal/changed', (payload: GoalChangedPayloadLike) => {
      this.onGoalChanged(payload)
    })
    connection.onStatus = (connected: boolean) => {
      this.deps.log(connected ? 'info' : 'warn', 'OneBot ' + (connected ? 'connected' : 'disconnected'))
      if (connected) this.outbound.drainPendingSends()
    }
    // Wait for the loader's complete application (model selection, settings,
    // persistence) before anything reads the default model.
    this.registry.mappingLoaded = Promise.resolve(this.deps.hostReady?.()).then(async () => {
      await this.outbound.loadPending()
      await this.registry.loadPresetOverrides()
      await this.registry.loadRetired()
      await this.registry.loadSwitchable()
      await this.registry.loadMapping()
      // restore deferred-delivery tracking（未完结条目在该会话的
      // 下一次 turn/end 兑现；损坏行降级跳过）。
      await this.deferred.loadPersisted()
    }).then(() => {
      if (this.stopping) return
      this.deps.log('info', 'bridge ready (' + this.registry.chats.size + ' resumed chat(s))')
    })
  }

  /** Stop everything: dispose agents, save mapping, cancel timers. */
  async stop(): Promise<void> {
    this.stopping = true
    if (this.sessionEventOff !== undefined) {
      this.sessionEventOff()
      this.sessionEventOff = undefined
    }
    if (this.sessionFlushOff !== undefined) {
      this.sessionFlushOff()
      this.sessionFlushOff = undefined
    }
    if (this.goalChangeOff !== undefined) {
      this.goalChangeOff()
      this.goalChangeOff = undefined
    }
    await this.registry.stop()
    // disarm the deferred silent-wait timers（pending 条目已落盘，
    // 重启后 loadPersisted 恢复跟踪续投）。
    this.deferred.stopAll()
  }

  /** One sticker per reply: claim the running turn's slot for a chat. */
  takeStickerSlot(chatId: string): boolean {
    if (this.stickerSentChats.has(chatId)) return false
    this.stickerSentChats.add(chatId)
    return true
  }

  /** Map an agent session id back to its chat (for model tools). */
  chatForSession(sessionId: string): ChatId | undefined {
    return this.bySession.get(sessionId)
  }

  /** Whether a caller backing an agent session may perform file edits. QQ chats
   * require the currently running turn's initiator to be an admin (role frozen
   * from the dispatch queue at turn/start); non-QQ sessions (Web and other
   * channels) are trusted by default. Unknown states fail closed
   * as member. */
  canEditFiles(sessionId: string): boolean {
    const chatId = this.bySession.get(sessionId)
    if (chatId === undefined) return true
    return this.chats.get(chatId)?.activeTurnRole === 'admin'
  }

  /**
   * 写操作审计入口（T13）：往 `mediaDir/qq-actions.log` 追加一行 jsonl
   * （ts / chatId / action / ok / reason），**内部转调 outbound 既有的
   * `auditWrite`**——同一个文件、同一套格式与串行写入，不另起一套日志。
   *
   * 目前用它的只有群管理写操作工具（`src/group-tools.ts`）的四个工具：每次调用
   * 无论成功、失败、被回合门禁拒掉还是参数不合法都记一行。审计开关与
   * `actionAuditEnabled`、目录与 `mediaDir` 同源；关闭审计时这里是 no-op。
   * @param chatId - 目标会话（`group:<群号>`；目标不明时为 `unknown`）。
   * @param action - 工具名（例如 `qq_group_ban`）。
   * @param ok - 这一次是否真的做成了。
   * @param reason - 目标 + 参数摘要 + 结果（给人事后复盘用的一行中文）。
   */
  auditAction(chatId: ChatId, action: string, ok: boolean, reason: string): void {
    this.outbound.auditWrite(chatId, action, ok, reason)
  }

  /**
   * Outbound media fence roots for one agent session's current turn:
   * the plugin media dir always, plus the chat's workspace directory when the
   * running turn's initiator is an admin. The role reuses the turn-level
   * semantics (canEditFiles: frozen at turn/start, fail-closed member); a
   * session with no known chat stays mediaDir-only even though canEditFiles
   * would trust it — the media gate itself fails closed. Roots are
   * realpath-normalized here; the MediaStore fence re-checks containment
   * (the double check is harmless).
   */
  async mediaSendRoots(sessionId: string | undefined): Promise<{ roots: string[]; isTurnAdmin: boolean }> {
    const isTurnAdmin = sessionId !== undefined && this.canEditFiles(sessionId)
    const chatId = sessionId !== undefined ? this.bySession.get(sessionId) : undefined
    const candidates = [this.deps.config.mediaDir]
    if (chatId !== undefined && isTurnAdmin) candidates.push(this.registry.effectiveCwd(chatId))
    const roots: string[] = []
    for (const root of candidates) {
      try {
        roots.push(await realpath(root))
      } catch {
        roots.push(root) // missing root: kept as-is; the fence skips it (cannot contain anything)
      }
    }
    return { roots, isTurnAdmin }
  }

  /** Whether the connection is usable for sends. */
  get connected(): boolean {
    return this.deps.connection.connected
  }

  /**
   * Send plain text to a chat with the full outbound pipeline (forward
   * blocks, Markdown strip, sentence splitting).
   *
   * 统一出站闸门，顺序确定：
   * 1. cleanOutgoing —— 剪掉模仿聊天记录的编造内容；
   * 2. parseLeadingQuote —— [引用:<id>] 永远不发给 QQ（它可能变成一个 reply 段）；
   * 3. 输出协议 B 档（**只在该聊天启用协议时**才调用解析器，未启用时一行代码
   *    都不走）：解析正文最后一行的【控制】{json}，body 换成控制块之前的内容；
   *    JSON 写错则整段原样发送（绝不吞消息）并记一次 failed；
   * 4. parseReplyPass —— 整条只有一个 [不回] / [不回:原因] / [不发] 标记时什么都
   *    不发，但留痕（日志 / trace / 今日计数 / 活动记录）。这道判定对**所有**
   *    出站文本生效（最终回复、中间消息、超时补发），不只 humanize；
   * 5. 控制块的 reply:false —— 走同一条「不回」路径（why 作原因），一条也不发；
   * 6. 空正文不发（除非控制块给了 send 分条）；
   * 7. 引用：控制块的 quote 优先于行首标记，都没有才由 groupAutoQuote 决定；
   * 8. 发送：控制块的 send 覆盖自动拆句（逐条发、不走 t2i 卡片），否则走原路径。
   *
   * For a FINAL reply (humanize) the quote marker becomes the reply segment of
   * the first split message. '[引用:这条]' means the turn's own trigger
   * message. An unknown id drops the marker and sends without a quote. When she
   * wrote no marker, the group auto-quote config decides (groupAutoQuote: off /
   * busy / always).
   * @param chatId - target chat.
   * @param text - model-produced text.
   * @param options - optional reply target.
   * @returns the sent message ids.
   */
  sendToChat(chatId: ChatId, text: string, options: SendOptions = {}): Promise<string[]> {
    // ① a fabricated transcript continuation never reaches QQ.
    const clean = this.companion.cleanOutgoing(chatId, text)
    // ② the quote directive never reaches QQ; it may become a reply segment.
    const quoted = parseLeadingQuote(clean)
    // ③ 输出协议 B 档：只有该聊天启用协议时才解析（未启用 = 完全不调用解析器）。
    const parsed = this.protocolEnabledFor(chatId) ? this.readControlBlock(chatId, quoted.body, options.humanize === true) : undefined
    const body = parsed === undefined ? quoted.body : parsed.body
    // ④ 输出协议 A 档：整条就是不回应标记 → 不发，但留下痕迹。
    const replyPass = parseReplyPass(body)
    if (replyPass.pass) {
      this.recordReplyPass(chatId, replyPass.reason)
      return Promise.resolve([])
    }
    const control = parsed === undefined ? undefined : parsed.control
    // ⑤ 控制块 reply:false —— 与 A 档同一条「不回」路径（why 作原因），什么都不发。
    if (control?.reply === false) {
      this.recordReplyPass(chatId, control.why ?? '', true)
      return Promise.resolve([])
    }
    // ⑥ empty text: nothing to send（控制块给了 send 分条时正文可以为空）。
    const parts = control?.send
    if (parts === undefined && body.trim() === '') return Promise.resolve([])
    // ⑦ 引用：控制块的 quote 优先于行首标记；都没有时才走 groupAutoQuote 自动引用。
    const marker: QuoteMarker | null = control?.quote !== undefined ? { target: control.quote, body } : quoted.marker
    const replyTo = options.replyTo ?? this.resolveReplyTarget(chatId, marker, options.humanize === true)
    const next: SendOptions = replyTo === undefined ? options : { ...options, replyTo }
    // ⑧ 控制块生效留痕（reply / send 条数 / quote 有无；why 只进日志与记忆）。
    if (control !== undefined) this.recordControlBlock(chatId, control)
    // ⑨ a final reply is recorded for the handoff/diary (non-final texts,
    //    e.g. interim or a deferred 补发, are not chat lines).
    const head = body.trim()
    const queued = parts === undefined ? undefined : (head === '' ? [...parts] : [head, ...parts])
    if (options.humanize === true) this.companion.recordFinalReply(chatId, queued !== undefined ? queued.join('\n') : body)
    if (options.humanize === true && chatId.startsWith('group:')) this.deps.groupChatter?.noteSpoke(chatId.slice('group:'.length))
    // ⑨.5 header（长任务轮次前缀）：②③④ 的协议解析**全部走完之后**才拼上，
    // 所以 [引用:id] / [不回] / 控制块的语义完全不受影响；正文被判定为不回时
    // 整条（含前缀）也不发。只拼第一条。
    const header = options.header
    const withHeader = (segment: string): string => (header === undefined || segment.trim() === '' ? segment : header + '\n' + segment)
    // ⑩ 控制块给了 send：覆盖自动拆句（第一条 = 控制块之前的正文，如果写了的话），
    //    逐条发送、不走 t2i 长文本卡片。
    if (queued !== undefined) {
      const withHeaderParts = queued.length === 0 ? queued : [withHeader(queued[0] ?? ''), ...queued.slice(1)]
      return this.outbound.sendToChat(chatId, withHeaderParts.join('\n'), { ...next, parts: withHeaderParts })
    }
    return this.outbound.sendToChat(chatId, withHeader(body), next)
  }

  /**
   * 该聊天是否启用输出协议（B 档）：`protocolMode === 'on'` 且
   * （`protocolChats` 为空 或 包含该 chatId）。**未启用时 `sendToChat` 完全不调用
   * 解析器**——这是「零行为变化」的硬保证，也是提示词只给启用的聊天加说明的依据。
   * @param chatId - the chat to test.
   */
  protocolEnabledFor(chatId: string): boolean {
    if ((this.deps.config.protocolMode ?? 'off') !== 'on') return false
    const chats = this.deps.config.protocolChats ?? []
    return chats.length === 0 || chats.includes(chatId)
  }

  /**
   * 记一条「她选择不回」：日志（带原因）、决策 trace（stage='reply'）、今日计数、
   * 活动记录。四处都尽力而为，任何一处缺席都不影响「不发」这个结果。
   * @param chatId - the chat she chose not to answer in.
   * @param reason - 她写的原因（'' = 没说原因）。
   * @param viaControl - true = 来自输出协议 B 档的控制块（reply:false），
   *   日志与 trace 的措辞里带上「控制块」，便于和 A 档标记区分。
   */
  private recordReplyPass(chatId: ChatId, reason: string, viaControl = false): void {
    const described = reason === '' ? '未说明原因' : reason
    this.deps.log('info', '她选择不回（' + (viaControl ? '控制块 · ' + described : described) + '）：' + chatId)
    // trace 未开启时 traceChat 直接返回，零开销。
    this.traceChat(chatId, { stage: 'reply', ok: true, reason: TRACE_REASONS.replyPass + (viaControl ? '（控制块）' : '') + '：' + described })
    this.deps.sendCounter?.recordPass?.()
    this.companion.recordReplyPass(chatId, reason)
  }

  /**
   * 解析控制块并留下解析侧的痕迹（B 档）：解析成功计一次 parsed，JSON 写错计一次
   * failed（并 warn 一条——那段会原样发出，得让人知道），字段级警告一律 debug；
   * 「协议聊天里的回复」这个分母**只算最终回复（humanize）**或真的写了控制块的出站
   * 文本——插件自己的提示（排队提醒、错误提示、命令回执）不进分母，否则成功率会被
   * 提示语拖低。
   * @param chatId - 目标聊天（日志里用）。
   * @param text - 已剥掉行首引用标记的正文。
   * @param isFinalReply - 这次是不是模型的最终回复（options.humanize）。
   * @returns parseControlBlock 的结果（调用方据 control / body 继续走）。
   */
  private readControlBlock(chatId: ChatId, text: string, isFinalReply: boolean): ParseControlBlockResult {
    const parsed = parseControlBlock(text)
    const attempted = parsed.control !== undefined || parsed.error !== undefined
    if (isFinalReply || attempted) this.deps.sendCounter?.recordProtocolReply?.()
    if (parsed.control !== undefined) {
      this.deps.sendCounter?.recordProtocolParsed?.()
    } else if (parsed.error !== undefined) {
      this.deps.sendCounter?.recordProtocolFailed?.()
      this.deps.log('warn', '输出协议控制块解析失败，已整段原样发送: ' + chatId + '（' + parsed.error + '）')
    }
    for (const warning of parsed.warnings ?? []) this.deps.log('debug', '输出协议：' + warning + '（' + chatId + '）')
    return parsed
  }

  /**
   * 控制块生效的决策 trace（stage='outbound'，reason 里带「控制块」字样）。
   * data 只放 reply / send 条数 / quote 有无——why 只进日志与记忆，不塞进 trace。
   * @param chatId - 目标聊天。
   * @param control - 已解析成功的控制块。
   */
  private recordControlBlock(chatId: ChatId, control: ControlBlock): void {
    this.traceChat(chatId, {
      stage: 'outbound',
      ok: true,
      reason: TRACE_REASONS.controlBlock,
      data: {
        reply: control.reply !== false,
        sends: control.send === undefined ? 0 : control.send.length,
        quote: control.quote !== undefined,
      },
    })
  }

  /**
   * Resolve the message id this send should quote, or undefined for no quote.
   * An explicit marker wins (and only counts for a final reply); otherwise the
   * group auto-quote setting may quote the turn's trigger message. An id the
   * chat has never seen is dropped (the marker is stripped, nothing quoted).
   * @param chatId - target chat.
   * @param marker - the parsed leading marker (null = the model wrote none).
   * @param humanize - whether this is a model final reply.
   */
  private resolveReplyTarget(chatId: ChatId, marker: QuoteMarker | null, humanize: boolean): string | undefined {
    const chat = this.chats.get(chatId)
    if (marker !== null) {
      if (!humanize) return undefined
      const wanted = marker.target === SELF_QUOTE_TOKEN ? (chat?.finalTurnMessageId ?? chat?.activeTurnMessageId) : marker.target
      if (wanted === undefined || wanted === '' || !this.seenMessageIds.has(chatId, wanted)) {
        this.deps.log('debug', '引用标记里的消息 id 无效，已按不引用发送: ' + chatId + ' id=' + marker.target)
        return undefined
      }
      return wanted
    }
    if (!humanize || !chatId.startsWith('group:')) return undefined
    const mode = this.deps.config.groupAutoQuote ?? 'off'
    if (mode === 'off') return undefined
    const trigger = chat?.finalTurnMessageId ?? chat?.activeTurnMessageId
    if (trigger === undefined || trigger === '') return undefined
    const seq = this.seenMessageIds.seqOf(chatId, trigger)
    if (seq === undefined) return undefined
    // busy: 从触发消息到她回复之间群里又有别人说了话才引用（像真人在热闹群里）。
    if (mode === 'busy' && !this.seenMessageIds.hasInboundAfter(chatId, seq)) return undefined
    return trigger
  }

  /** Whether this chat has actually seen a message id (the reply-quote gate
   * for the qq_send_* reply_to argument). */
  hasSeenMessage(chatId: string, messageId: string): boolean {
    return this.seenMessageIds.has(chatId as ChatId, messageId)
  }

  /** A group left the allowlist: retire its session so that, if it is ever
   * allowed again, it starts fresh under the current preset. */
  async retireGroup(groupId: string): Promise<void> {
    await this.registry.mappingLoaded
    if (await this.registry.retireChat(('group:' + groupId) as ChatId)) {
      this.deps.log('info', '群 ' + groupId + ' 已不在白名单，旧会话已退休')
    }
  }

  /** Session ids some chat still uses (old-session cleanup never deletes these). */
  sessionIdsInUse(): Set<string> {
    return this.registry.sessionIdsInUse()
  }

  /** 设置页概览用：live 会话 + 映射里已知的聊天（只读，不触发 IO）。 */
  chatSnapshot(): Array<{ chatId: string; sessionId: string; live: boolean }> {
    return this.registry.chatSnapshot()
  }

  /** 设置页概览用：宿主 sessionTitle 里该聊天的当前标题（聊天不 live / 服务缺席 /
   *  取数失败一律 undefined；绝不抛错）。 */
  sessionTitleOf(chatId: string): string | undefined {
    try {
      const chat = this.chats.get(chatId as ChatId)
      if (chat === undefined) return undefined
      const service = this.deps.sessionTitle?.()
      if (service === undefined || service === null || typeof service.get !== 'function') return undefined
      const title = service.get(chat.agent.session)?.title
      return typeof title === 'string' && title !== '' ? title : undefined
    } catch {
      return undefined
    }
  }

  /** A session's logs were deleted by the old-session cleanup. */
  forgetSession(sessionId: string): void {
    this.registry.forgetSession(sessionId)
  }

  /** On startup: retire sessions of groups that are no longer allowed (the
   * allowlist may have changed in the config while dsh was down). */
  async retireDisallowedGroups(): Promise<void> {
    await this.registry.mappingLoaded
    const policy = this.deps.policy
    if (policy.groupPolicy === 'open') return
    for (const chatId of this.registry.knownChatIds()) {
      if (!chatId.startsWith('group:')) continue
      const groupId = chatId.slice('group:'.length)
      if (policy.groupPolicy === 'allowlist' && policy.groupAllowFrom.includes(groupId)) continue
      await this.retireGroup(groupId)
    }
  }

  /** one proactive wake-up in the owner's chat. She decides
   * whether to write; replying exactly PROACTIVE_PASS sends nothing. */
  async fireCheckin(chatId: ChatId, context: { time: string; unanswered: number; lastUserAt: number | undefined }): Promise<void> {
    await this.dispatchFollowup(chatId, this.companion.checkinText(context), 'admin', undefined, { scheduled: true })
  }

  /** One proactive wake-up in a group she is allowed to speak in. She decides
   * whether to write; replying exactly PROACTIVE_PASS sends nothing.
   * Runs as `member` on purpose: a group turn must never become an admin turn
   * (canEditFiles() keys off the turn role), and a group that left the
   * allowlist — or whose turn is busy — is skipped instead of typed into. */
  async fireGroupCheckin(groupId: string, context: { time: string; unanswered: number; lastUserAt: number | undefined }): Promise<void> {
    if (!groupAllowed(groupId, this.deps.policy)) return
    const chatId = ('group:' + groupId) as ChatId
    if (this.chats.get(chatId)?.busy === true) return
    await this.dispatchFollowup(chatId, this.companion.groupCheckinText(context), 'member', undefined, { scheduled: true })
  }

  /** One periodic look at a group (she decides herself whether to chip in;
   * the pass marker sends nothing). Skipped while the group's turn is busy. */
  async firePeek(groupId: string): Promise<void> {
    const chatter = this.deps.groupChatter
    const chatId = ('group:' + groupId) as ChatId
    if (chatter === undefined || this.chats.get(chatId)?.busy === true) return
    if (!groupAllowed(groupId, this.deps.policy)) return
    const text = chatter.takePeek(groupId, PROACTIVE_PASS)
    if (text === '') return
    this.deps.log('info', '看一眼群聊: ' + chatId)
    await this.dispatchFollowup(chatId, text, 'member', undefined, { scheduled: true })
  }

  /** run one scheduled prompt (diary, proactive check-ins) as
   * an admin turn in its chat. Never idle-resets: the diary must see the
   * day's session. */
  async fireScheduled(prompt: ScheduledPrompt): Promise<void> {
    await this.dispatchFollowup(prompt.chatId as ChatId, this.companion.scheduledText(prompt), 'admin', undefined, { scheduled: true })
  }

  /**
   * Send raw OneBot segments (used by the media tools).
   * @param chatId - target chat.
   * @param segments - outbound segments.
   * @param options - optional reply target (the tool's reply_to argument).
   * @returns the sent message id.
   */
  sendSegments(chatId: ChatId, segments: OutboundSegment[], options: SendOptions = {}): Promise<string | undefined> {
    return this.outbound.sendSegments(chatId, segments, options)
  }

  // ------------------------------------------------------------ inbound

  /**
   * Inbound OneBot message event → agent turn. All policy and media work is
   * contained: a failure here logs and drops the message, never the host.
   * the whole inbound chain runs inside one trace scope (ALS), so every
   * pipeline decision point can attribute its event to this message's
   * traceId; tracing off = no scope.
   */
  async handleInbound(event: OneBotEvent): Promise<void> {
    const scope = this.beginInboundTrace(event)
    try {
      await runWithTrace(scope, async () => {
        if (this.stopping) {
          this.deps.log('debug', '插件停止中，入站消息丢弃')
          scope?.emit('inbound', { ok: false, reason: TRACE_REASONS.inboundStopping })
          return
        }
        const inbound = normalizeOneBot11(event)
        if (inbound === null) {
          this.deps.log('debug', '非聊天消息事件，不处理（post_type=' + String(event.post_type) + '）')
          scope?.emit('normalize', { ok: false, reason: TRACE_REASONS.inboundNotChat })
          return
        }
        await this.inbound.processInbound(inbound)
      })
    } catch (error) {
      scope?.emit('dispatch', { ok: false, reason: '入站处理失败: ' + describeError(error) })
      this.deps.log('error', 'inbound handling failed: ' + describeError(error) + errorStack(error))
    }
  }

  /** mint the inbound traceId + scope and record the first (收到消息)
   * event; undefined when tracing is off. */
  private beginInboundTrace(event: OneBotEvent): TraceScope | undefined {
    const sink = this.deps.config.trace
    if (sink === undefined || !sink.enabled) return undefined
    const kind = event.message_type === 'group' ? 'group' : event.message_type === 'private' ? 'private' : undefined
    const chatId = kind !== undefined
      ? buildChatId(kind, String(kind === 'group' ? event.group_id ?? '' : event.user_id ?? ''))
      : ''
    const messageId = event.message_id === undefined || event.message_id === null ? undefined : String(event.message_id)
    const traceId = newTraceId(sink.now())
    const scope = sink.scope(traceId, chatId, messageId)
    sink.emit({ traceId: scope.traceId, stage: 'inbound', ok: true, chatId, messageId, data: { messageType: String(event.message_type ?? '') } })
    return scope
  }

  /** Feed one user message into a chat's agent (create on demand). Records
   * the base text for /retry, queues the initiator's turn role and the
   * message that triggered it, and applies per-chat /goal + /plan prefixes. */
  private async dispatchFollowup(chatId: ChatId, text: string, role: UserRole, nickname?: string, internal?: { scheduled?: boolean; messageId?: string }): Promise<void> {
    // companion: idle / periodic session renewal + handoff, activity record.
    text = await this.companion.beforeUserTurn(chatId, text, plainUserText(text), nickname ?? '', internal?.scheduled === true)
    const final = this.prefixTurn(chatId, text)
    const fallback = this.chats.get(chatId)?.lastNickname ?? ''
    const chat = await this.ensureChat(chatId, nickname ?? fallback)
    if (nickname !== undefined && nickname !== '') chat.lastNickname = nickname
    chat.lastFollowup = text
    chat.lastActivityAt = Date.now()
    // a dispatched user turn starts a fresh interim cycle (the
    // inbound residue reset already cleared the loop fields directly).
    this.interim.onNewUserTurn(chat)
    // no message text in the host log (it is the system journal).
    this.deps.log('info', 'followup from ' + chatId + ' (' + final.length + ' chars)')
    // Plugin-originated user message: the session log attributes QQ inbound
    // messages to this plugin's own producer-owned source kind, keeping them
    // distinguishable from host/web UI inputs.
    const userMessage = createUserMessage({
      content: [{ type: 'text', text: final }],
      source: { kind: 'plugin:qq-companion' },
    })
    // Queue this turn's identity (role + quote target) keyed by the message id
    // the host will log: **only** the matching `user/message` admission event
    // consumes it, so goal rounds, Web/host input and rejected proposals can
    // never steal a queued QQ turn's role (D1).
    const triggerId = internal?.messageId !== undefined ? sanitizeMessageId(internal.messageId) : ''
    this.queuePendingTurn(chat, role, triggerId === '' ? undefined : triggerId, userMessage.id)
    chat.agent.followup(userMessage)
    // cross-stream join: the turn's session events arrive on a different
    // async chain, so record this dispatch's traceId per chat for
    // onSessionEvent to pick up (runs inside the inbound ALS scope — command
    // dispatches reach here through the same await chain).
    const trace = currentTrace()
    if (trace !== undefined) {
      this.traceByChat.set(chatId, trace.traceId)
      trace.emit('dispatch', { ok: true, reason: '消息已投递给模型' })
    }
    this.startTyping(chat)
  }

  /** Prepend per-chat context directives (/goal reminder) to a turn's user
   * text. Plan mode is host-owned now (/plan forwards to the host command),
   * so the agent's own plan-mode instruction section governs planning. */
  private prefixTurn(chatId: ChatId, text: string): string {
    let out = text
    const goal = this.registry.getSettings(chatId).goal
    if (goal !== undefined && goal.trim() !== '') {
      out = '【当前目标】' + goal + '\n' + out
    }
    return out.trim()
  }

  /** Hand a message that arrived while the chat's turn is still running to the
   * host subagent adapter (BTW-style side lane: the main task keeps running and
   * the answer arrives as its own QQ message). The question text only travels to
   * the adapter; it is not logged, persisted, or injected into the main session.
   * @returns 'taken' when the message became a side ask; 'full' when the lane is
   * enabled but its concurrency is exhausted (or the message is too long); and
   * 'off' when the lane is not configured at all. Anything but 'taken' makes the
   * caller fall back to the normal queue/steer policy.
   */
  private trySideAsk(chat: ChatAgent, chatId: ChatId, text: string): 'taken' | 'full' | 'off' {
    const scheduler = this.sideAsk
    const agent = this.sideAskAgent
    if (scheduler === undefined || agent === undefined) return 'off'
    const maxChars = Math.max(1, Math.min(8000, Math.floor(this.deps.config.sideAskMaxChars ?? 8000)))
    if (text.length > maxChars) return 'full'
    const handle = scheduler.submit(signal => agent.ask(chat.agent, text, signal))
    if (handle.status === 'rejected') {
      // 满了就直接让位给排队/插话，不额外提示，避免把正常消息变成报错。
      void handle.promise.catch(() => undefined)
      return 'full'
    }
    void handle.promise.then(answer => {
      const reply = answer.trim()
      if (reply !== '') return this.sendToChat(chatId, reply)
      return this.sendToChat(chatId, '（旁问跑完了，但没有拿到文字回答。）')
    }).catch((error: unknown) => {
      // 宿主错误与问题正文都不回显；只有「容量满」这一种给可操作提示，
      // 因为它是唯一用户自己能改的失败原因。
      const code = (error as { code?: unknown } | undefined)?.code
      if (code === 'ACTIVATION_LIMIT_REACHED') {
        return this.sendToChat(chatId, '（宿主的子代理名额已满，这条消息没能进入旁问；可以把设置里的「旁问同时运行上限」调小，或稍后重发。）')
      }
      return this.sendToChat(chatId, '（旁问没能回答这条消息，主任务不受影响。）')
    }).catch(() => undefined)
    return 'taken'
  }

  /**
   * Slash-command router. Commands are admin-only and are matched on the
   * first word; a leading @mention glued to the command (QQ group at + text)
   * is stripped first. A path like /tmp/x is never a command (command words
   * are /[A-Za-z][A-Za-z0-9_-]* only). Unknown commands return false so the
   * message reaches the model.
   * @param chatId - the chat the command arrived in.
   * @param text - parsed inbound text.
   * @param userId - sender QQ number.
   * @param nickname - sender display name (pre-sanitized at the /steer boundary).
   * @returns true when the message was consumed by a command.
   */
  private tryHandleCommand(chatId: ChatId, text: string, userId: string, nickname?: string): Promise<boolean> {
    return routeCommand(this.commandCtx, chatId, text, userId, nickname)
  }

  /**
   * The CommandContext handed to the command table: exposes exactly
   * the bridge capabilities the routed commands use, resolved live per
   * invocation (the llm catalog especially must stay a live service lookup).
   */
  private get commandCtx(): CommandContext {
    const bridge = this
    const goals = this.deps.goals?.()
    return {
      sendToChat: (chatId, text) => bridge.sendToChat(chatId, text),
      log: (level, message) => bridge.deps.log(level, message),
      isAdmin: userId => classifyUserRole(userId, bridge.deps.policy.adminUsers) === 'admin',
      groupAccess: bridge.deps.groupAccess,
      scheduledPrompts: () => bridge.deps.config.scheduledPrompts ?? [],
      fireScheduled: prompt => bridge.fireScheduled(prompt),
      proactive: bridge.deps.proactive,
      getChat: chatId => bridge.chats.get(chatId),
      hasChat: chatId => bridge.chats.has(chatId),
      resetChat: chatId => bridge.resetChat(chatId),
      dispatchFollowup: (chatId, text, role, nickname) => bridge.dispatchFollowup(chatId, text, role, nickname),
      // /stop 也显式终止该聊天的超时补发跟踪（其他聊天不受影响）。
      stopDeferredTracking: chatId => bridge.deferred.cancelChat(chatId),
      // /steer — the bridge-owned steer core keeps the createUserMessage
      // source write point in bridge.ts (producer-owned kind, session-v4 guard).
      steerRunningTurn: (chatId, text) => bridge.steerMessage(chatId, text),
      effectiveCwd: chatId => bridge.registry.effectiveCwd(chatId),
      // /workspace attach — the registry re-runs the attach for this chat's
      // live session (manual escape hatch when a workspace was added later).
      attachChatToWorkspace: (chatId, options) => bridge.registry.attachChatToWorkspace(chatId, options),
      sessionIdFromMapping: chatId => bridge.registry.sessionIdFromMapping(chatId),
      resolvePresetId: chatId => bridge.registry.resolvePresetId(chatId),
      // /workspace persists with the chat mapping (debounced). When the
      // chat is not live, noteWorkspaceOverride snapshots it into the registry
      // so the flush actually reaches the mapping file instead of being
      // dropped by the chats/evictedChats-only rewrite.
      setChatWorkspacePath: (chatId, path) => {
        // 换工作目录 = 换会话的去处：旧会话上的长任务授权不能跟着搬过去
        // （否则「换个目录接着做同一件事」会被静默当成同一个任务）。
        if (bridge.registry.getSettings(chatId).workspacePath !== path) bridge.revokeTaskGoal(chatId, '工作目录变了')
        bridge.registry.getSettings(chatId).workspacePath = path
        bridge.registry.noteWorkspaceOverride(chatId)
        bridge.registry.saveMappingDebounced()
      },
      presetOverride: chatId => bridge.registry.getSettings(chatId).presetOverride,
      setPresetOverride: (chatId, id) => { bridge.registry.setPresetOverride(chatId, id) },
      hasPresetOverride: chatId => bridge.registry.getSettings(chatId).presetOverride !== undefined,
      // /goal persists with the chat mapping (debounced).
      goal: chatId => bridge.registry.getSettings(chatId).goal,
      setGoal: (chatId, value) => { bridge.registry.getSettings(chatId).goal = value; bridge.registry.saveMappingDebounced() },
      deleteGoal: chatId => { bridge.registry.getSettings(chatId).goal = undefined; bridge.registry.saveMappingDebounced() },
      // pending serial-number selection snapshot (lazy TTL lives in commands).
      pendingSelection: chatId => bridge.registry.getSettings(chatId).pendingSelection,
      setPendingSelection: (chatId, value) => { bridge.registry.getSettings(chatId).pendingSelection = value },
      // /session: the per-chat switchable history and the switch itself.
      switchableSessions: chatId => bridge.registry.switchableSessions(chatId),
      switchSession: (chatId, targetSessionId) => {
        // 切到另一段历史 = 换 agent：旧授权只对旧会话有效，切换即撤销。
        const current = bridge.chats.get(chatId)?.sessionId
        if (current !== undefined && current !== targetSessionId) bridge.revokeTaskGoal(chatId, '切换了会话')
        return bridge.registry.switchSession(chatId, targetSessionId)
      },
      // /session list previews: cold-read each retired session's first user
      // input through the persistence port (read handle, small prefix).
      sessionPersistence: bridge.deps.sessionPersistence,
      llmCatalog: bridge.deps.llmCatalog,
      workspaceRegistry: bridge.deps.workspaceRegistry,
      agentDefaultModel: bridge.deps.agentDefaultModel,
      agentPresets: bridge.deps.agentPresets,
      commands: bridge.deps.commands,
      connection: bridge.deps.connection,
      dshHome: bridge.deps.dshHome,
      // the /doctor command renders/packs through the bridge.
      healthReport: () => bridge.buildHealthReport(),
      // export takes an optional trigger reference (file-name stamp).
      exportDiagnostics: triggerRef => bridge.exportDiagnosticsPackage(triggerRef),
      // command-plane failures (/retry) mint an MF- reference through
      // the bridge's single entry point (registry + trace + structured log).
      reportFailure: (chatId, stage, detail) => bridge.registerMessageFailure(chatId, stage, detail),
      // 长任务（T16）：宿主 goals 服务 live 查找 + 进程内授权端口。
      ...(goals !== undefined ? { goals } : {}),
      taskGoal: bridge.taskGoalPort,
      pauseTaskGoal: chatId => bridge.pauseTaskGoalForStop(chatId),
      config: { interimMessages: bridge.deps.config.interimMessages, maxImageBytes: bridge.deps.config.maxImageBytes, unknownCommand: bridge.deps.config.unknownCommand, taskEveryRounds: bridge.deps.config.taskEveryRounds ?? 1 },
    }
  }

  /**
   * Build the message body text: placeholders become annotated local paths
   * (images/voices/videos) and voice files are transcribed when enabled.
   */
  private buildBody(text: string, media: MediaRef[], chatId: ChatId): Promise<string> {
    return this.inbound.buildBody(text, media, chatId)
  }

  /** the single agent.steer write point — one createUserMessage with
   * the producer-owned source kind (the session-v4 guard counts the source
   * write points; this and dispatchFollowup are the only two). Shared by the
   * 'steer' policy and /steer.
   * Returns false when the chat has no live agent (nothing was steered). */
  private steerMessage(chatId: ChatId, text: string): boolean {
    const chat = this.chats.get(chatId)
    if (chat === undefined) return false
    chat.agent.steer(createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'plugin:qq-companion' },
    }))
    return true
  }

  /**
   * the busy-turn policy seam (inbound ctx.interceptBusyTurn).
   * Called for every non-command message AFTER all gates, only when deciding
   * what to do with it while the chat's task is running:
   * - no running turn → false (caller dispatches normally);
   * - 'steer' policy + plain text + non-restricted sender + autoSteerPolicy
   *   eligibility ('admin' = admins only, the default; 'all' = anyone) → the
   *   message is submitted into the running turn via steerMessage (consumed
   *   at the nearest step boundary, NO new turn) and a submit notice goes out;
   * - otherwise (queue policy / media-quote-forward message / restricted
   *   group member / not eligible for auto-steer) → the normal dispatch
   *   (agent.followup queues it as the next turn: consumed after the current
   *   turn ends, in arrival order) plus the queue notice at most once per
   *   running turn.
   * The running check reads the agent's own lifecycle state — the same
   * authoritative signal /stop uses; chat.busy (turn/start..turn/end view)
   * can lag the host driver and is deliberately NOT consulted.
   */
  private async interceptBusyTurn(chatId: ChatId, text: string, role: UserRole, nickname: string | undefined, plain: boolean, messageId?: string): Promise<boolean> {
    const chat = this.chats.get(chatId)
    if (chat === undefined || chat.agent.status !== 'running') return false
    // The non-admin relation-banner soft limit ([关系:…], see
    // src/relation.ts) is never widened by the steer policy: restricted
    // senders' messages queue like everyone else's media. The condition
    // mirrors the relation-banner application in the inbound pipeline
    // (non-admin + restrictedMemberPrefix — group members and non-admin
    // private chats alike).
    const restricted = role !== 'admin' && this.deps.config.restrictedMemberPrefix
    // auto-steer eligibility — 'admin' (default) = admins only; 'all' =
    // anyone. Restricted members stay excluded under both; /steer remains
    // admin-only regardless of this knob; queue mode is untouched.
    const autoSteerAllowed = (this.deps.config.autoSteerPolicy ?? 'admin') === 'all' || role === 'admin'
    // 自动旁问（BTW 式侧道）：任务还在跑时，纯文本消息直接交给一个独立的
    // subagent activation 回答，当前回合完全不受影响；回答稍后作为一条独立
    // 消息发回同一聊天。只接受与主流水线等价的纯文本：带媒体/引用/转发、
    // 或超过字数上限的消息仍走排队，因为旁问子级拿不到那些附件。
    // 并发满（reject）时同样退回排队/插话。
    const sideAsk = plain && !restricted && autoSteerAllowed ? this.trySideAsk(chat, chatId, text) : 'off'
    if (sideAsk === 'taken') {
      currentTrace()?.emit('dispatch', { ok: true, reason: TRACE_REASONS.busyTurnSideAsk })
      return true
    }
    if (sideAsk === 'full') {
      currentTrace()?.emit('dispatch', { ok: false, reason: TRACE_REASONS.busyTurnSideAskFull })
    }
    if ((this.deps.config.newMessagePolicy ?? 'queue') === 'steer' && plain && !restricted && autoSteerAllowed) {
      this.steerMessage(chatId, text)
      currentTrace()?.emit('dispatch', { ok: true, reason: TRACE_REASONS.busyTurnSteered })
      this.sendToChat(chatId, STEER_ACCEPTED_NOTICE).catch((error: unknown) => {
        this.deps.log('debug', '插话提交提示发送失败: ' + describeError(error))
        currentTrace()?.emit('notice', { ok: false, reason: '插话提交提示发送失败: ' + describeError(error) })
      })
      return true
    }
    await this.dispatchFollowup(chatId, text, role, nickname, { messageId })
    currentTrace()?.emit('dispatch', { ok: true, reason: TRACE_REASONS.busyTurnQueued })
    if (!this.queueNoticeChats.has(chatId)) {
      this.queueNoticeChats.add(chatId)
      this.sendToChat(chatId, QUEUE_NOTICE_TEXT).catch((error: unknown) => {
        this.deps.log('debug', '排队提示发送失败: ' + describeError(error))
        currentTrace()?.emit('notice', { ok: false, reason: '排队提示发送失败: ' + describeError(error) })
      })
    }
    return true
  }

  /** Expand a quoted (reply) message into [引用] text via get_msg. */
  private expandQuote(messageId: string, chatId: ChatId): Promise<string> {
    return this.inbound.expandQuote(messageId, chatId)
  }

  /**
   * Open one message of this chat by id (qq_open_message): images fetched,
   * voice transcribed, forwards expanded — like a quote. Only a message that
   * belongs to this chat opens (a group never reads another group's).
   */
  async openMessage(messageId: string, chatId: ChatId): Promise<string> {
    const data = await this.call('get_msg', { message_id: Number(messageId) }) as { group_id?: number | string; message_type?: string } | undefined
    const { kind, target } = splitChatId(chatId)
    const sameChat = kind === 'group' ? String(data?.group_id ?? '') === target : data?.message_type !== 'group'
    if (!sameChat) throw new Error('这条消息不在当前会话里，打不开')
    const text = await this.inbound.expandQuote(messageId, chatId)
    if (text === '') throw new Error('这条消息取不到了（可能太久远或已撤回）')
    return text.replace(/^\[引用\]/, '')
  }

  // ------------------------------------------------------------ outbound

  /** Send [[qq_forward]] nodes as a merged-forward message. */
  async sendForward(chatId: ChatId, nodes: Array<{ name: string; content: string }>): Promise<void> {
    return this.outbound.sendForward(chatId, nodes)
  }

  /** One OneBot action. */
  private call(action: string, params: Record<string, unknown>): Promise<unknown> {
    return this.deps.connection.call(action, params)
  }

  /** emit one outbound/deferred decision event for a chat: it rides the
   * chat's initiating traceId; a write with no mapped trace (proactive tool
   * sends) starts a fresh one. No-op with tracing off. */
  private traceChat(chatId: ChatId, event: { stage: TraceStage; ok?: boolean; reason?: string; data?: Record<string, unknown> }): void {
    const sink = this.deps.config.trace
    if (sink === undefined || !sink.enabled) return
    sink.emit({ traceId: this.traceByChat.get(chatId) ?? newTraceId(sink.now()), chatId, ...event })
  }

  // ------------------------------------------------------------ health

  /** The health deps the /doctor command renders from (resolved live). */
  private healthDeps(): HealthDeps {
    const conn = this.deps.connection
    return {
      mediaDir: this.deps.config.mediaDir,
      connection: { connected: conn.connected, selfId: conn.selfId },
      transport: { host: conn.listenHost, port: conn.listenPort },
      retryState: { reverseRetryAttempts: conn.portRetryAttempts },
      dedup: {
        entries: this.inbound.dedupWindowEntries,
        windowSeconds: this.deps.config.dedupWindowSeconds ?? 300,
      },
      // /doctor 权限行：两类会话各自自动切换的宿主权限预设（'' = 宿主默认）。
      permissions: {
        admin: this.deps.config.adminPermission ?? '',
        member: this.deps.config.memberPermission ?? '',
      },
      // /doctor 能力行：哪几项功能被关掉了（按管理员私聊视角算）。
      capabilities: () => this.capabilitySummary(),
      // /doctor 群管理提示行（T13）：四个群管理写操作工具里有任何一个对
      // 好友 / 群友 / 陌生人档开着才出现；全关时这一行不出。
      groupWriteWarning: () => groupWriteWarningLine({ config: this.capabilityConfig(), deps: this.availableCapabilityDeps() }),
      // /doctor 轻互动提示行（T14）：戳一戳 / 点赞里有任何一个对非主人档开着才出现
      // （这两项即使开了，也只有主人回合会真的执行，但会在别人的账号上留痕）。
      interactionWarning: () => interactionWarningLine({ config: this.capabilityConfig(), deps: this.availableCapabilityDeps() }),
      configSnapshot: this.deps.configSnapshot?.() ?? {},
      // the recent fault references for the report section.
      failureRefs: () => this.failureRefs.recent(),
      ...(this.deps.companionStatus !== undefined ? { companion: this.deps.companionStatus } : {}),
      log: (level, message) => this.deps.log(level, message),
    }
  }

  /** /doctor: render the health summary. */
  private async buildHealthReport(): Promise<string> {
    return healthReport(this.healthDeps())
  }

  /** /doctor export: pack the redacted diagnostics archive. the
   * file name carries the trigger reference — the explicit command argument,
   * or the most recent recorded fault reference when omitted. */
  private async exportDiagnosticsPackage(triggerRef?: string): Promise<string> {
    const deps = this.healthDeps()
    return exportDiagnostics({ ...deps, triggerRef: triggerRef ?? this.failureRefs.recent(1)[0]?.ref })
  }

  // ------------------------------------------------------------ session events

  private onSessionEvent(session: Session, event: SessionEvent): void {
    if (this.stopping) return
    const chatId = this.bySession.get(session.id)
    if (chatId === undefined) {
      // non-QQ sessions (web/host) ride this same bus;
      // keep the early exit visible at debug without emitting any trace.
      this.deps.log('debug', 'session 事件早退：无 chat 映射（session=' + session.id + ' type=' + String(event.type) + '）')
      return
    }
    const chat = this.chats.get(chatId)
    if (chat === undefined || chat.sessionId !== session.id) return
    const trace = this.traceForChat(chatId)
    if (event.type === 'user/message') {
      // 真实接纳事件是身份与自动目标轮的唯一入口（T16 D1/D2）：pre-step 的
      // reject/replace 提案走不到这里，因此污染不了排队 QQ 回合的角色。
      this.onUserMessageAdmitted(chat, event.data.id, event.data.source)
      return
    }
    if (event.type === 'turn/start') {
      trace?.emit('agent', { ok: true, reason: '模型回合开始' })
      // a new turn begins — prune the previous turn's recalled-id
      // residue (see InterimTracker.onTurnStart for the safety analysis).
      this.interim.onTurnStart(chat)
      // 本回合身份先归零（失败闭合）：turn/start 不做任何猜测，只有真实的
      // `user/message` 接纳事件能把发起角色/引用目标抬上来（T16 D1）。
      chat.activeTurnRole = 'member'
      chat.activeTurnMessageId = undefined
      chat.activeTurnNumber = event.data.turn
      // 本回合已接纳的真实输入 id（重投递去重）：turn/start 清零。
      chat.lastAdmittedMessageId = undefined
      // 新回合默认不是自动目标轮；`user/message` 认出「明确对应绑定目标」的
      // 来源后才会把它标成目标轮（并冻结当轮身份与该轮的回传节奏）。
      chat.taskGoalTurn = undefined
      chat.taskGoalText = ''
      chat.taskGoalLastMessageId = undefined
      chat.lastActivityAt = Date.now()
      chat.busy = true
      this.stickerSentChats.delete(chatId)
      // arm the deferred silent-wait window for this turn（每次模型
      // 输出重置；turn/end 解除；deferredTimeoutMs<=0 时为 no-op）。
      this.deferred.onTurnStart(chatId, session.id)
      return
    }
    if (event.type === 'assistant/message') {
      // a deferred-registered (timed-out) turn is muted — its text
      // messages are captured for the final补发 only（不插播 interim、不转
      // 审批/提问卡：超时后只补最终文字与终态通知）。
      if (this.deferred.onAssistantMessage(chatId, session.id, event.data.message)) return
      // 自动目标轮：宿主卡片照发（D5：不能因为文字按节奏静默就吞掉提问卡），
      // 文字只保留**最终候选**——只记最后一条不含工具调用的 assistant 文字，
      // 不再累加过程碎片（D3：同一 message 按 id 去重，重投递不重复记账）。
      if (chat.taskGoalTurn !== undefined) {
        const goalTurn = chat.taskGoalTurn
        const messageId = event.data.message.id
        if (messageId !== undefined) {
          if (goalTurn.seen.includes(messageId)) return
          goalTurn.seen.push(messageId)
        }
        this.relayGoalRoundCards(chatId, event.data.message.content)
        const hasToolCall = event.data.message.content.some(block => block.type === 'tool-call')
        const text = messageText(event.data.message)
        if (text !== '' && !hasToolCall) chat.taskGoalText = text
        return
      }
      this.interim.onAssistantMessage(chatId, chat, event.data.message)
      return
    }
    if (event.type === 'turn/end') {
      const reason = event.data.reason
      // the final reply of this turn goes out AFTER turn/end (and possibly
      // after the next turn already started): freeze this turn's quote target
      // now so a queued next turn cannot steal it.
      chat.finalTurnMessageId = chat.activeTurnMessageId
      // a message-turn fault mints ONE MF- reference before any
      // consumer runs — the trace event (data.ref), the structured log line,
      // the ⚠️ notice tail and the deferred terminal text all carry the same
      // number. Normal (completed/cancelled) turns mint nothing.
      const errorRef = reason.kind === 'error'
        ? this.mintFailureRef('msg', 'agent', '模型回合出错: ' + reason.error.message, { chatId })
        : undefined
      // complete a deferred entry（补发异步进行）；true = the turn was
      // under deferred tracking — the terminal-state notice rides the补发
      // path, so the normal error notice below is suppressed（同一故障不双发）.
      const deferredTracked = this.deferred.onTurnEnd(chatId, session.id, reason, errorRef)
      // 自动目标轮：按 `user/message` 接纳时冻结的身份收尾——不跑 interim 结算，
      // 按 taskEveryRounds 节奏回传当轮真实文字（不汇总、不编造）。
      const goalTurn = chat.taskGoalTurn
      if (goalTurn !== undefined) {
        chat.taskGoalTurn = undefined
        chat.loopPending = null
        const text = chat.taskGoalText
        chat.taskGoalText = ''
        chat.taskGoalLastMessageId = undefined
        this.syncTaskGoal(chat)
        // 目标已经结束（做完 / 暂停 / 被清掉）的那一轮一定要把当轮文字交回：
        // 否则 taskEveryRounds>1 时管理员可能永远看不到收尾那一轮写了什么。
        const settled = chat.taskGoal === undefined || chat.taskGoal.phase !== 'active'
        if (reason.kind === 'error') {
          this.deps.log('debug', '长任务第 ' + goalTurn.round + ' 轮出错（错误通知由回合错误路径发送）')
        } else if (!goalTurn.reportDue && !(reason.kind === 'completed' && settled)) {
          this.deps.log('debug', '长任务第 ' + goalTurn.round + ' 轮完成（按 taskEveryRounds 节奏不回传文字）')
        } else if (text === '') {
          this.deps.log('debug', '长任务第 ' + goalTurn.round + ' 轮完成（本轮没有最终文字）')
        } else {
          this.sendGoalRound(chat, goalTurn, text)
        }
      } else {
        this.interim.onTurnEnd(chatId, chat)
      }
      // An error's ok:false agent event was emitted by mintFailureRef above.
      if (reason.kind !== 'error') trace?.emit('agent', { ok: true, reason: '模型回合结束（' + reason.kind + '）' })
      if (reason.kind === 'error') {
        const message = reason.error.message
        // A session-log collision heals itself (a deferred turn's terminal
        // notice rides the 补发 path, so it heals too).
        if ((this.deps.config.sendErrorNotice || deferredTracked)
          && /persisted log on disk that does not match this live session|id collision/i.test(message)) {
          void this.registry.healSessionCollision(chatId)
        }
        if (!deferredTracked && this.deps.config.sendErrorNotice) {
          this.sendErrorNotice(chatId, message + failureRefSuffix(errorRef), trace)
        }
      }
      this.stopTyping(chat)
      chat.lastActivityAt = Date.now()
      chat.busy = false
      // the turn that armed the queue notice is over — a later
      // running turn notifies again.
      this.queueNoticeChats.delete(chatId)
      this.deps.log('info', 'turn/end for ' + chatId + ': ' + event.data.reason.kind)
      // Durable: flush the session so a later restart can resume it.
      void this.deps.sessions.flush(chat.agent.session).catch((error: unknown) => {
        this.deps.log('warn', 'session flush failed: ' + String(error))
        trace?.emit('notice', { ok: false, reason: '会话落盘失败: ' + String(error) })
      })
      this.registry.saveMappingDebounced()
    }
  }

  /** A failed turn's notice goes to the owner only: in their own private
   * chat it is shown there; a failure in a group or someone else's private
   * chat is reported to the owner privately, never shown to other people. */
  private sendErrorNotice(chatId: ChatId, detail: string, trace: TraceScope | undefined): void {
    const ref = splitChatId(chatId)
    const targets: Array<{ chat: ChatId; text: string }> = this.isAdminPrivate(chatId)
      ? [{ chat: chatId, text: '⚠️ 运行出错：' + detail }]
      : this.deps.policy.adminUsers.map(admin => ({
        chat: buildChatId('private', admin),
        text: '⚠️ ' + (ref.kind === 'group' ? '群 ' + ref.target : '和 ' + ref.target + ' 的私聊') + ' 里运行出错：' + detail,
      }))
    for (const target of targets) {
      this.sendToChat(target.chat, target.text, { queuable: true }).catch((error: unknown) => {
        this.deps.log('debug', '错误通知发送失败: ' + describeError(error))
        trace?.emit('notice', { ok: false, reason: TRACE_REASONS.noticeErrorSendFailed })
      })
    }
  }

  /** the trace scope for one chat's session events, resolved through the
   * chat-level association table; undefined when tracing is off or the chat
   * has no recorded dispatch (host-initiated turns stay untraced). */
  private traceForChat(chatId: ChatId): TraceScope | undefined {
    const sink = this.deps.config.trace
    if (sink === undefined || !sink.enabled) return undefined
    const traceId = this.traceByChat.get(chatId)
    return traceId !== undefined ? sink.scope(traceId, chatId) : undefined
  }

  // ------------------------------------------------------ failure references

  /**
   * the single fault-reference entry point. Mints one QQ-CONN-/MF-
   * number, records it in the bounded registry, emits the ok:false trace
   * event carrying `data.ref` (traceId = the chat's mapped id, or a fresh id
   * for chat-less connection faults), and writes the structured error log
   * line — every surface of the fault shares this one number. Called only on
   * fault events: normal traffic mints nothing (zero overhead).
   */
  private mintFailureRef(kind: FailureRefKind, stage: TraceStage, detail: string, opts: { chatId?: ChatId } = {}): string {
    const ref = this.failureRefs.mint(kind)
    const traceId = opts.chatId !== undefined ? this.traceByChat.get(opts.chatId) : undefined
    this.failureRefs.record({ ref, kind, ts: Date.now(), stage, detail, traceId })
    const sink = this.deps.config.trace
    if (sink !== undefined && sink.enabled) {
      sink.emit({
        traceId: traceId ?? newTraceId(sink.now()),
        chatId: opts.chatId,
        stage,
        ok: false,
        reason: detail,
        data: { ref, refKind: kind },
      })
    }
    this.deps.log('error', '故障参考号 ' + ref + ' [' + stage + ']: ' + detail)
    return ref
  }

  /** connection-fault reference entry (wired from index.ts via
   * `connection.onFailure`); the returned reference is appended to the
   * transport's own log line. */
  registerConnectionFailure(stage: string, detail: string): string {
    return this.mintFailureRef('conn', 'connection', stage !== '' ? '[' + stage + '] ' + detail : detail)
  }

  /** message-fault reference entry for command-plane failures (e.g. the
   * /retry dispatch throw); the caller appends the returned reference to the
   * user-visible ⚠️ notice. */
  registerMessageFailure(chatId: ChatId, stage: TraceStage, detail: string): string {
    return this.mintFailureRef('msg', stage, detail, { chatId })
  }

  // ------------------------------------------------------------ 长任务（T16）

  /** 命令层操作长任务授权的窄端口（只在内存，见 task-goal.ts）。 */
  private get taskGoalPort(): TaskGoalPort {
    const bridge = this
    return {
      binding: chatId => bridge.chats.get(chatId)?.taskGoal,
      bind: (chatId, binding) => {
        const chat = bridge.chats.get(chatId)
        if (chat !== undefined) chat.taskGoal = binding
      },
      unbind: chatId => {
        const chat = bridge.chats.get(chatId)
        if (chat === undefined) return
        // 只撤授权与记账：`taskGoalTurn` / `taskGoalText` 是**本轮已发生的冻结
        // 事实**，同轮收尾还要用它（T16 D3）——清掉会让这一轮退回普通插播。
        chat.taskGoal = undefined
      },
      noteOperation: (operation, goalId) => { bridge.noteSelfGoalOp(operation, goalId) },
    }
  }

  /** 记住「这个目标操作是本插件刚发出的」，供 goal/changed 去重（10 秒窗口）。 */
  private noteSelfGoalOp(operation: string, goalId: string): void {
    const now = Date.now()
    while (this.selfGoalOps.length > 0 && now - (this.selfGoalOps[0]?.at ?? now) > 10_000) this.selfGoalOps.shift()
    this.selfGoalOps.push({ operation, goalId, at: now })
    if (this.selfGoalOps.length > 8) this.selfGoalOps.shift()
  }

  /** 该操作是不是本插件 10 秒内刚发出的（是则消费掉：只更新绑定、不重复播报）。 */
  private consumeSelfGoalOp(operation: string, goalId: string): boolean {
    const now = Date.now()
    const index = this.selfGoalOps.findIndex(entry => entry.operation === operation && entry.goalId === goalId && now - entry.at <= 10_000)
    if (index < 0) return false
    this.selfGoalOps.splice(index, 1)
    return true
  }

  /**
   * 排队一个刚派发的 QQ 回合身份（T16 D1）。
   *
   * 队列里的每一条都带着「插件自己创建的那条 user message 的 id」——这是与
   * 宿主真实 `user/message` 接纳事件对账的**唯一凭据**。自动目标轮、Web/宿主
   * 输入、被 pre-step 拒绝或替换掉的提案都不会命中任何 id，因此永远不会顺走
   * 排队 QQ 回合的管理员角色与引用目标。
   *
   * 队列长度有上限：被 reject / 被丢弃的提案可能永远等不到接纳事件，不能让
   * 队列无限增长（超限丢最早的，失败闭合）。
   */
  private queuePendingTurn(chat: ChatAgent, role: UserRole, triggerId: string | undefined, messageId: string): void {
    chat.pendingTurns.push({ role, triggerId, messageId })
    while (chat.pendingTurns.length > PENDING_TURNS_MAX) {
      const dropped = chat.pendingTurns.shift()
      if (dropped !== undefined) {
        this.deps.log('debug', '排队回合身份过多，丢弃最早的一条（' + dropped.messageId + '）——它始终没被宿主接纳')
      }
    }
  }

  /**
   * 真实 `user/message` 接纳事件：回合身份与自动目标轮的**唯一**入口（T16 D2）。
   *
   * 宿主的 pre-step 提议（`enter` / `replace` / `reject` / `abort`）不是事实：
   * agent-loop 在采纳之前就返回的提案根本不会走到这里，也消费不了
   * `pendingTurns`，所以被拒提案污染不了任何后续步。
   *
   * 判定规则（T16 第二轮审查缺陷 1）：**按接纳顺序，最后一个真实输入决定本回合
   * 身份**；上下文来源不是输入，既不能抬身份也不能撤身份。
   * 1. `context`（runtime-context / 系统提示 / 工具结果等）→ 什么都不改：宿主的
   *    运行时快照排在回合末尾，若当成输入就会把刚抬起来的角色与目标轮重置；
   * 2. `qq` → 只按插件自己创建的那条 message id 精确对账 `pendingTurns`：命中
   *    才冻结发起角色与引用目标，否则失败闭合；
   * 3. `goal` → 来源 `{kind:'goal', goalId, revision, round}` 与进程内绑定完全
   *    一致且目标仍 active+armed → 把本轮标成自动目标轮；
   * 4. 其它来源（Web/宿主/他人输入、字段造假的 goal、未知来源）→ 失败闭合：
   *    降回 member、清掉引用与自动目标轮冻结（该轮的过期文字不再回传）。
   */
  private onUserMessageAdmitted(chat: ChatAgent, messageId: string | undefined, source: unknown): void {
    try {
      // 同一条 message 被重复接纳（宿主重放/重投递）：身份已由它定过，不再判定
      // 第二次——否则会「对账不上」而把刚抬起来的角色又打回 member。
      if (messageId !== undefined && chat.lastAdmittedMessageId === messageId) return
      const kind = classifyAdmittedSource(source)
      if (kind === 'context') {
        this.deps.log('debug', 'user/message 是上下文来源（' + describeSourceKind(source) + '）：不改变本回合身份')
        return
      }
      if (messageId !== undefined) chat.lastAdmittedMessageId = messageId
      if (kind === 'qq') {
        this.admitDispatchedTurn(chat, messageId)
        return
      }
      if (kind === 'goal') {
        this.admitGoalRound(chat, source)
        return
      }
      this.failClosedTurn(chat, '未授权/未知的输入来源（' + describeSourceKind(source) + '）')
    } catch (error) {
      // 记账失败绝不影响宿主回合。
      this.deps.log('warn', '长任务 user/message 记账失败: ' + describeError(error))
    }
  }

  /** QQ 派发回合：只有命中排队凭据才抬身份，否则失败闭合（且不乱动别人的凭据）。 */
  private admitDispatchedTurn(chat: ChatAgent, messageId: string | undefined): void {
    if (messageId !== undefined) {
      const index = chat.pendingTurns.findIndex(entry => entry.messageId === messageId)
      const entry = index < 0 ? undefined : chat.pendingTurns.splice(index, 1)[0]
      if (entry !== undefined) {
        // 真实 QQ 输入接管本回合：**先**退出旧的自动目标轮冻结，再落这位用户
        // 的身份与引用（T16 第三轮审查缺陷 1）。冻结不撤的话，turn/end 仍会走
        // 长任务分支——非 reportDue 轮就把这条 QQ 的最终答复静默吞掉，甚至把
        // 攒下来的目标轮过程文字当成回传内容。只撤冻结事实，`chat.taskGoal`
        // 绑定与这位用户自己挣来的角色都不动。
        const hadGoalTurn = this.dropGoalRoundFreeze(chat)
        chat.activeTurnRole = entry.role
        chat.activeTurnMessageId = entry.triggerId
        if (hadGoalTurn) {
          this.deps.log('debug', '真实 QQ 输入接管本回合：自动目标轮冻结已停用，本轮按普通 QQ 回合回传')
        }
        return
      }
    }
    this.failClosedTurn(chat, 'QQ 来源没有对应的排队凭据（被拒/被替换的提案或伪造 id）')
  }

  /**
   * 失败闭合：本回合身份降回 member、清掉引用，并停用自动目标轮冻结。
   *
   * 冻结一并停用是安全的做法（T16 第二轮审查缺陷 1）：这个回合已经被一份
   * **非授权输入**接管，`taskGoalText` 里攒的是目标轮的过程文字，绝不能在
   * turn/end 按长任务回传出去（那就是把过期目标文本发给用户）。
   */
  private failClosedTurn(chat: ChatAgent, why: string): void {
    chat.activeTurnRole = 'member'
    chat.activeTurnMessageId = undefined
    const hadGoalTurn = this.dropGoalRoundFreeze(chat)
    this.deps.log('debug', '本回合身份失败闭合（member）：' + why
      + (hadGoalTurn ? '；自动目标轮冻结已停用，本轮文字不再按长任务回传' : ''))
  }

  /**
   * 停用本回合的自动目标轮冻结：`taskGoalTurn` / `taskGoalText` /
   * `taskGoalLastMessageId` 一起清掉（过程文字绝不能按长任务回传出去）。
   * 只动回合级冻结事实，`chat.taskGoal` 绑定与授权不动。返回是否真的撤了冻结。
   */
  private dropGoalRoundFreeze(chat: ChatAgent): boolean {
    const hadGoalTurn = chat.taskGoalTurn !== undefined
    chat.taskGoalTurn = undefined
    chat.taskGoalText = ''
    chat.taskGoalLastMessageId = undefined
    return hadGoalTurn
  }

  /** 自动目标轮识别：来源必须与进程内绑定**完全一致**且目标仍 active+armed。 */
  private admitGoalRound(chat: ChatAgent, source: unknown): void {
    const round = readGoalRoundSource(source)
    if (round === undefined) {
      this.failClosedTurn(chat, '目标轮来源字段不完整（疑似伪造）')
      return
    }
    const binding = chat.taskGoal
    if (binding === undefined) {
      this.failClosedTurn(chat, '宿主里的目标未在本进程授权（重新接管需 /task resume）')
      return
    }
    // 换会话后绑定失效：目标属于旧会话的 agent，不能把旧授权带进新会话。
    if (binding.sessionId !== chat.sessionId) {
      chat.taskGoal = undefined
      this.deps.log('info', '长任务授权随会话切换失效（' + chat.chatId + '）：需要 /task resume 重新授权')
      this.failClosedTurn(chat, '长任务授权随会话切换失效')
      return
    }
    if (round.goalId !== binding.goalId || round.revision !== binding.revision) {
      this.failClosedTurn(chat, '目标轮来源与进程内授权不一致（' + round.goalId + '@' + round.revision + '）')
      return
    }
    // 同一个 round 只认一次（重放/重投递不重复标记，也不撤掉已冻结的身份）。
    if (chat.taskGoalTurn !== undefined && chat.taskGoalTurn.round === round.round) return
    // 只有「进行中且仍授权自动接力」的目标才有资格提升本轮角色：暂停/阻塞
    // （或被宿主 disarm）后即使还有目标轮灌进来，也只按 member 跑。
    if (binding.phase !== 'active' || binding.activation !== 'armed') {
      this.failClosedTurn(chat, '目标已不在接续状态（' + binding.phase + '/' + binding.activation + '）')
      return
    }
    chat.taskGoalTurn = {
      goalId: round.goalId,
      revision: round.revision,
      round: round.round,
      reportDue: reportDueFor(round.round, this.deps.config.taskEveryRounds ?? 1, binding.maxGoalRounds),
      maxRounds: binding.maxGoalRounds,
      seen: [],
    }
    // 权限只来自「本进程内管理员 /task 明确授权」，绝不随消息文本带入。
    // **无条件按绑定赋值（含降权）**：同一回合里可能先接纳过一条真正的 QQ
    // 管理员输入，这条 goal 来源是该回合最后一个真实输入——只抬不降就会让
    // 已被 `revokeGoalGrant` 撤权（grantedRole='member'，外部 resume 回
    // active+armed 但没 /task resume 重新授权）的目标轮继承那条 QQ 的 admin。
    // 「最后一个真实输入决定本回合身份」要求这里既能把 admin 抬起来，也能
    // 把 admin 降下去。
    chat.activeTurnRole = binding.grantedRole
    // 目标轮没有 QQ 触发消息：不自动引用（同回合里早先那条 QQ 的引用目标
    // 也不能继承到目标轮上）。
    chat.activeTurnMessageId = undefined
    chat.taskGoalText = ''
    chat.lastActivityAt = Date.now()
    this.deps.log('info', '长任务自动轮 ' + round.round + '/' + binding.maxGoalRounds + '（' + chat.chatId + '，角色 ' + binding.grantedRole + '）')
  }

  /** `goal/changed`：只播报本进程授权过的目标；自己刚发出的操作不重复播报。 */
  private onGoalChanged(payload: GoalChangedPayloadLike): void {
    try {
      const chatId = this.bySession.get(payload.agent.id)
      if (chatId === undefined) return
      const chat = this.chats.get(chatId)
      if (chat === undefined) return
      const change = payload.change
      const selfIssued = this.consumeSelfGoalOp(change.operation, change.ref.id)
      const binding = chat.taskGoal
      if (binding === undefined) {
        this.deps.log('debug', 'goal/changed 无人认领（目标未在本进程授权）：' + change.operation + ' ' + change.ref.id)
        return
      }
      if (binding.goalId !== change.ref.id) {
        this.deps.log('debug', 'goal/changed 属于其它目标（忽略）：' + change.ref.id)
        return
      }
      if (change.operation === 'clear') {
        // 只撤授权：本轮冻结下来的 `taskGoalTurn` / `taskGoalText` 保留到
        // turn/end 收尾，别让 clear 事件把同轮改道成普通插播（T16 D3）。
        chat.taskGoal = undefined
      } else if (change.goal !== undefined) {
        applyGoalView(binding, change.goal)
        // 暂停 / 被宿主 disarm / 阻塞 / 完成 → 自动接力授权立即作废：之后就算
        // 外部把目标 resume 成 active，也不会复活旧的管理员授权（T16 D3）。
        if (binding.phase !== 'active' || binding.activation !== 'armed') {
          revokeGoalGrant(binding)
          this.deps.log('info', '长任务不再处于接续状态（' + binding.phase + '/' + binding.activation + '）：已撤销进程内授权，需 /task resume 重新授权')
        }
      }
      if (selfIssued) return
      const notice = renderGoalChangeNotice(change.operation, change.goal)
      if (notice === undefined) return
      this.sendToChat(chatId, notice, { queuable: true }).catch((error: unknown) => {
        this.deps.log('warn', '长任务通知发送失败: ' + describeError(error))
      })
    } catch (error) {
      this.deps.log('warn', 'goal/changed 处理失败: ' + describeError(error))
    }
  }

  /** 用宿主实时投影同步绑定（轮次/相位/激活）；目标已不存在则撤绑。 */
  private syncTaskGoal(chat: ChatAgent): void {
    const binding = chat.taskGoal
    const goals = this.deps.goals?.()
    if (binding === undefined || goals === undefined) return
    try {
      const view = goals.get(chat.agent)
      if (view === undefined) {
        chat.taskGoal = undefined
        this.deps.log('info', '长任务目标已不在宿主里（' + chat.chatId + '）：撤销进程内授权')
        return
      }
      // 绑定必须与实时目标**同一个**：宿主里换了另一个目标（目标 B）时，绝不
      // 把 B 的相位/轮次套到 A 的授权上（T16 D3）——旧授权作废、等管理员重新
      // /task resume。
      if (view.id !== binding.goalId) {
        chat.taskGoal = undefined
        this.deps.log('info', '宿主的当前目标是 ' + view.id + '，与进程内授权 ' + binding.goalId + ' 不一致（' + chat.chatId + '）：撤销旧授权')
        return
      }
      applyGoalView(binding, view)
      if (binding.phase !== 'active' || binding.activation !== 'armed') revokeGoalGrant(binding)
    } catch (error) {
      this.deps.log('debug', '长任务进度同步失败: ' + describeError(error))
    }
  }

  /** 自动目标轮里的宿主卡片（计划书 / 提问卡）照发（T16 D5）：这些内容住在
   * tool-call 参数里、不进模型文字流，按节奏静默文字时绝不能把它们一起吞掉，
   * 否则用户只能干等。 */
  private relayGoalRoundCards(chatId: ChatId, content: readonly unknown[]): void {
    try {
      relayHostCards({
        sendToChat: (target, text) => this.sendToChat(target, text),
        log: (level, message) => this.deps.log(level, message),
      }, chatId, content)
    } catch (error) {
      this.deps.log('warn', '长任务轮卡片转发失败: ' + describeError(error))
    }
  }

  /** 按节奏回传当轮真实文字（前缀是独立的一行 header，不拼进模型文字里）。 */
  private sendGoalRound(chat: ChatAgent, turn: TaskGoalTurn, text: string): void {
    this.sendToChat(chat.chatId, text, { queuable: true, header: renderGoalRoundHeader(turn.round, turn.maxRounds) })
      .then(() => {
        this.deps.log('info', '长任务第 ' + turn.round + ' 轮回传已送出（' + chat.chatId + '）')
      })
      .catch((error: unknown) => {
        this.deps.log('warn', '长任务回传失败: ' + describeError(error))
      })
  }

  /**
   * /stop 的配套：该聊天有已授权且在跑的长任务时把它**暂停**（宿主目标保留、
   * 进度保留，但自动接力不再空转）。返回附在 /stop 回执后的说明；没有可暂停
   * 的目标返回 undefined。
   *
   * T16 D4：一律读宿主**实时**目标再 pause（缓存 revision 可能已过期）；暂停
   * 失败必须如实告知「不能保证停下」，并尽量用公开的 disarm 撤掉自动接力、
   * 同时撤销进程内授权 —— 绝不谎称已停止。
   */
  private pauseTaskGoalForStop(chatId: ChatId): string | undefined {
    const chat = this.chats.get(chatId)
    const binding = chat?.taskGoal
    const goals = this.deps.goals?.()
    if (chat === undefined || binding === undefined || goals === undefined) return undefined
    let current: GoalViewLike | undefined
    try {
      current = goals.get(chat.agent)
    } catch (error) {
      chat.taskGoal = undefined
      revokeGoalGrant(binding)
      return '⚠️ 读不到长任务的实时状态（' + describeError(error) + '），**已撤销本进程的自动接力授权**，但不能保证宿主里的目标已停，请到宿主里确认。'
    }
    if (current === undefined) {
      chat.taskGoal = undefined
      return '⏸ 长任务目标已不在宿主里，顺手撤销了本进程的授权。'
    }
    if (current.id !== binding.goalId) {
      chat.taskGoal = undefined
      revokeGoalGrant(binding)
      return '⏸ 宿主的当前目标已换（' + current.id + '），顺手撤销了本进程的旧授权；需要的话请 /task status 重新查看。'
    }
    if (binding.phase !== 'active' || binding.activation !== 'armed') {
      applyGoalView(binding, current)
      revokeGoalGrant(binding)
      return '⏸ 长任务本来就不在自动接力（' + describePhase(binding.phase) + '），已撤销本进程的授权。'
    }
    try {
      // 先把「这是我发的」记下来，再同步 pause：goal/changed 可能同步重入，
      // 晚记会漏掉去重（T16 D4）。
      this.noteSelfGoalOp('pause', current.id)
      const paused = goals.pause(chat.agent, { id: current.id, revision: current.revision })
      applyGoalView(binding, paused)
      revokeGoalGrant(binding)
      return '⏸ 顺手暂停了长任务（自动接力已停，进度保留）；/task resume 可继续。'
    } catch (error) {
      let disarmed: GoalViewLike | undefined
      try {
        disarmed = goals.disarm?.(chat.agent)
      } catch (inner) {
        this.deps.log('warn', '长任务 disarm 兜底也失败: ' + describeError(inner))
      }
      if (disarmed !== undefined) applyGoalView(binding, disarmed)
      // 停不下来就不能再留着「这个聊天已授权自动接力」的记账：进程内授权整个撤掉，
      // 后续目标轮一律按 member 跑（要恢复只能管理员重新 /task resume）。
      chat.taskGoal = undefined
      revokeGoalGrant(binding)
      this.deps.log('warn', '长任务暂停失败: ' + describeError(error))
      return disarmed !== undefined
        ? '⚠️ 暂停长任务失败（' + describeError(error) + '）；已撤销自动接力授权，宿主里的目标仍在，请用 /task status 复核。'
        : '⚠️ 暂停长任务失败（' + describeError(error) + '）；**无法保证自动接力已停**，已撤销本进程授权，请到宿主里手动停掉目标。'
    }
  }

  private async onSessionFlush(session: Session): Promise<void> {
    if (this.stopping) return
    const chatId = this.bySession.get(session.id)
    if (chatId === undefined) return
    // arbitrary session flushes debounce like turn/end — stop() still
    // forces the final saveMapping directly.
    this.registry.saveMappingDebounced()
  }

  // ------------------------------------------------------------ registry

  /** Get (or create) the agent for a chat. */
  private ensureChat(chatId: ChatId, nickname: string): Promise<ChatAgent> {
    return this.registry.ensureChat(chatId, nickname)
  }

  /**
   * /new: the registry disposes the agent and retires its session id so the
   * next inbound message creates a brand-new session (fresh history; the old
   * conversation stays on disk). The confirmation is sent directly through
   * the outbound pipeline since no agent is left to reply.
   */
  /**
   * 撤销该聊天的长任务授权（只清内存；宿主那边的目标与进度原样保留）。
   * 换会话 / 换工作目录 / 切换历史 / 卸载都走这里：授权绝不跨会话搬运，
   * 重新接管只能由管理员再发一次 `/task resume`（见 T16 的失败闭合）。
   */
  private revokeTaskGoal(chatId: ChatId, why: string): void {
    const chat = this.chats.get(chatId)
    if (chat === undefined || chat.taskGoal === undefined) return
    chat.taskGoal = undefined
    chat.taskGoalTurn = undefined
    chat.taskGoalText = ''
    this.deps.log('info', '长任务授权已撤销（' + chatId + '）：' + why + '，重新接管需 /task resume')
  }

  private async resetChat(chatId: ChatId): Promise<void> {
    // /new 之后是全新会话：旧会话的长任务授权不能跟着新会话继续跑。
    this.revokeTaskGoal(chatId, '/new 换了新会话')
    await this.registry.resetChat(chatId)
    this.deps.activity?.markSessionStart(chatId)
    this.sendToChat(chatId, '✅ 已开启新会话，下一条消息将进入全新会话，旧对话历史保留在之前的会话中。').catch((error: unknown) => {
      this.deps.log('warn', 'reset notice send failed: ' + String(error))
    })
  }

  /** an admin's own private chat (admin defaults apply). */
  private isAdminPrivate(chatId: ChatId): boolean {
    const ref = splitChatId(chatId)
    return ref.kind === 'private' && classifyUserRole(ref.target, this.deps.policy.adminUsers) === 'admin'
  }

  /**
   * 是否是管理员本人的私聊——**对模型工具公开的那一面**（T12）。
   *
   * 隐私类工具（私聊历史等）用它做入口闸门：群聊、好友私聊、陌生人私聊都不算，
   * 于是「群友让列一下主人的好友 / 拉一段私聊」在没有显式授权时根本走不通。
   * @param chatId - 对话 id（`private:<qq>` / `group:<群号>`）。
   * @returns 管理员私聊为 true。
   */
  isAdminPrivateChat(chatId: string): boolean {
    return this.isAdminPrivate(chatId)
  }

  /** switch a NEW session to its configured host permission preset —
   * an admin's private chat uses config.adminPermission, every other session
   * (non-admin private chats and all group chats) uses config.memberPermission
   * — through the same host /permission command the user would type, so the
   * host stays the only authority. An empty preset leaves the host default
   * untouched (a group has ONE session, so the admin's own words in a group
   * ride that group session's preset too). A failed switch only logs. */
  private async applyDefaultPermission(chat: ChatAgent): Promise<void> {
    const admin = this.isAdminPrivate(chat.chatId)
    const preset = admin ? this.deps.config.adminPermission : this.deps.config.memberPermission
    if (preset === undefined || preset === '') return
    const commands = this.deps.commands as unknown as {
      execute?(agent: unknown, line: string, attachments: readonly unknown[], signal: AbortSignal): Promise<unknown>
    } | undefined
    if (commands?.execute === undefined) return
    try {
      await commands.execute(chat.agent, '/permission ' + preset, [], new AbortController().signal)
    } catch (error) {
      this.deps.log('warn', (admin ? 'admin' : 'member') + ' permission default apply failed for ' + chat.chatId + ': ' + describeError(error))
      return
    }
    this.deps.log('info', (admin ? 'admin' : 'member') + ' permission default applied for ' + chat.chatId + ': ' + preset)
  }

  /**
   * Compose the QQ channel's scoped world for one agent: the QQ platform
   * prompt section and the qq_* tools. Registered on `agentCtx` (the agent's
   * own scope) instead of the plugin context, so Web/local sessions never see
   * the channel instructions or the media tools — they cannot (and should
   * not) push messages to QQ.
   *
   * 工具注册由能力注册表驱动（src/capabilities.ts）：先按配置 / 运行时依赖 /
   * 会话类型算出这个聊天能有哪些能力，再只注册这些能力对应的工具。工具 execute
   * 里既有的回合级判定（例如表情包改删的 canEditFiles）保持不变。
   *
   * 能力**先算**（在注册提示词段之前）：平台段里「能用哪些工具」的句子也由这份
   * 解析结果生成，于是「提示词里提到的工具」与「实际注册的工具」同源——关掉的
   * 能力既不会注册，也不会被提示词叫用。
   */
  private installChannelScope(agentCtx: Context, chatId: ChatId): void {
    const resolved = this.resolveChatCapabilities(chatId)
    agentCtx.systemPrompt.section({
      name: 'channel:qq-companion',
      order: 90,
      text: this.composePlatformPrompt(chatId, resolved),
    })
    // How her companion features work in this chat, from the live config.
    const guide = this.deps.companionGuide?.(chatId) ?? ''
    if (guide !== '') agentCtx.systemPrompt.section({ name: 'channel:qq-companion-guide', order: 91, text: guide })
    const writeNote = this.companion.memoryNoteWriter()
    const allowedTools = new Set(resolved.tools)
    const allow = (toolName: string): boolean => allowedTools.has(toolName)
    registerTools(agentCtx, this, this.deps.connection, {
      maxImageBytes: this.deps.config.maxImageBytes,
      maxVoiceBytes: this.deps.config.maxVoiceBytes,
      maxFileBytes: this.deps.config.maxFileBytes,
      ...(this.deps.tts === undefined || !this.deps.tts.ready ? {} : { tts: this.deps.tts }),
    }, allow)
    if (writeNote !== undefined) registerMemoryNoteTool(agentCtx, this, writeNote, allow)
    if (this.deps.stickers !== undefined) registerStickerTools(agentCtx, this, this.deps.stickers, allow)
    // 群管理写操作（T13）：能力层默认关，且每个执行体还有一道回合门禁
    // （群里谁在说话只有回合级知道），见 src/group-tools.ts。
    registerGroupTools(agentCtx, this, this.deps.connection, allow)
    // 轻互动：表情回应默认开；戳 / 点赞非主人默认关，管理员默认授权。
    // 每个执行体仍有会话绑定与回合门禁
    // （谁在说话只有回合级知道），见 src/interaction-tools.ts。
    registerInteractionTools(agentCtx, this, this.deps.connection, allow)
  }

  /**
   * 平台段文本的**唯一实现**：提示词注册（installChannelScope）与指纹
   * （{@link platformPromptText}）共用，不两处各算一遍。
   *
   * 纯函数式：同样的配置 + 同样的运行时依赖 → 同样的文本（指纹的稳定性依赖这一点）。
   * 输出协议说明**只给启用了协议的那个聊天加**（{@link protocolEnabledFor}）：
   * 未启用时平台段一个字都不多。
   */
  private composePlatformPrompt(chatId: ChatId, resolved: ResolveCapabilitiesResult): string {
    return buildPlatformPrompt({
      restrictedMembers: this.deps.config.restrictedMemberPrefix,
      enabledCapabilityIds: [...resolved.enabled],
      protocol: this.protocolEnabledFor(chatId),
    })
  }

  /**
   * 这个聊天的平台段文本（order 90 那段），供人设指纹用：平台段变了 → 指纹变 →
   * 下一回合换新会话。与真实注册进 agent 的文本是同一次计算，不会漂移。
   *
   * 同一状态重复调用结果恒定（调用方按稳定性做指纹）。
   */
  platformPromptText(chatId: ChatId): string {
    return this.composePlatformPrompt(chatId, this.resolveChatCapabilities(chatId))
  }

  /** 按一个聊天算能力（会话类型 + 关系档 + 当前进程的运行时依赖）。 */
  private resolveChatCapabilities(chatId: ChatId): ResolveCapabilitiesResult {
    const ref = splitChatId(chatId)
    return resolveCapabilities({
      config: this.capabilityConfig(),
      deps: this.availableCapabilityDeps(),
      chat: { kind: ref.kind, relation: this.chatRelation(chatId) },
    })
  }

  /** 能力相关的配置（全局 deny + 四个按关系 deny + 四个 grant；缺省一律空 = 现状）。 */
  private capabilityConfig(): CapabilityConfig {
    const config = this.deps.config
    return {
      capabilitiesDeny: config.capabilitiesDeny ?? [],
      ownerDeny: config.ownerDeny ?? [],
      friendDeny: config.friendDeny ?? [],
      memberDeny: config.memberDeny ?? [],
      strangerDeny: config.strangerDeny ?? [],
      ownerGrant: config.ownerGrant ?? [],
      friendGrant: config.friendGrant ?? [],
      memberGrant: config.memberGrant ?? [],
      strangerGrant: config.strangerGrant ?? [],
    }
  }

  /**
   * 这个**会话**的关系档（T11 的能力视角，与逐条消息的关系绸标不是一回事）：
   * 群聊恒 'groupMember'（一个群只有一个会话，看不到具体发言人，所以群里主人
   * 发言也按群友档），私聊按名单分 owner / friend / stranger。
   */
  private chatRelation(chatId: ChatId): Relation {
    const ref = splitChatId(chatId)
    return sessionRelation({
      userId: ref.target,
      chatKind: ref.kind,
      policy: { adminUsers: this.deps.policy.adminUsers, friendUsers: this.deps.config.friendUsers ?? [] },
    })
  }

  /** 当前进程里实际具备的能力运行时依赖（表情包库 / 记忆文件 / 语音合成）。 */
  private availableCapabilityDeps(): CapabilityDependency[] {
    const deps: CapabilityDependency[] = []
    if (this.deps.stickers !== undefined) deps.push('stickerLib')
    if (this.companion.memoryNoteWriter() !== undefined) deps.push('memoryNote')
    if (this.deps.tts?.ready === true) deps.push('tts')
    return deps
  }

  /**
   * 能力摘要（/doctor 与设置页概览共用）：`enabled` / `disabled` 按**主人私聊**
   * 视角（权限最高的一类会话，缺什么就是配置层真关了什么），`byRelation` 给出
   * 主人 / 好友 / 群友 / 陌生人四个档各自的已开数。
   */
  capabilitySummary(): CapabilitySummary {
    return summarizeCapabilities({
      config: this.capabilityConfig(),
      deps: this.availableCapabilityDeps(),
    })
  }

  // ------------------------------------------------------------ typing

  /** Start the NapCat typing indicator (private chats only). */
  private startTyping(chat: ChatAgent): void {
    const ref = splitChatId(chat.chatId)
    if (ref.kind !== 'private') return
    this.stopTyping(chat)
    const pulse = (): void => {
      if (this.stopping) return
      void this.call('set_input_status', {
        user_id: Number(ref.target),
        event_type: 1,
      }).catch(() => undefined)
    }
    pulse()
    chat.typingTimer = setInterval(pulse, 5_000).unref()
  }

  /** Stop the typing indicator. */
  private stopTyping(chat: ChatAgent): void {
    if (chat.typingTimer !== undefined) {
      clearInterval(chat.typingTimer)
      chat.typingTimer = undefined
    }
    const ref = splitChatId(chat.chatId)
    if (ref.kind !== 'private') return
    void this.call('set_input_status', {
      user_id: Number(ref.target),
      event_type: 0,
    }).catch(() => undefined)
  }
}

export { OneBotNotConnectedError, OneBotActionError } from './connection.js'

/** the readable text of a dispatched user turn (drops the
 * plugin's <user_message> wrapper and the [HH:MM 昵称(QQ)] / relation-banner
 * prefixes) for the activity record. */
function plainUserText(text: string): string {
  return stripRelationPrefix(text)
    .replace(/<\/?user_message[^>]*>/g, ' ')
    .replace(/<group_context>[\s\S]*?<\/group_context>/g, ' ')
    .replace(/\[\d{2}:\d{2} [^\]]*\(\d+\)\](\[(@我|叫到我|接着和我说)\])?/g, '')
    .trim()
}

/** 日志用的来源描述：只打印 kind（绝不打印消息正文或其它字段）。 */
function describeSourceKind(source: unknown): string {
  if (typeof source !== 'object' || source === null) return typeof source
  const kind = (source as { kind?: unknown }).kind
  return typeof kind === 'string' && kind !== '' ? kind : '无 kind'
}
