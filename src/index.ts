/**
 * dsh-qq-companion-pro: a QQ (OneBot 11 / NapCat) chat channel for DeepSeek Harness.
 *
 * Mounts inside the dsh host process: a reverse-WebSocket server NapCat dials
 * into, one Agent per QQ chat, inbound images/voice handled for the model
 * (local speech-to-text when enabled), outbound replies split at line breaks,
 * [[qq_forward]] merged forwards, allowlist/mention access control, and a set
 * of qq_* tools for media and NapCat APIs.
 * @module dsh-qq-companion
 */

import { selfCheck } from './selfcheck.js'
import { QqLiveness } from './liveness.js'
import { buildCompanionStatusSnapshot, provideCompanionStatus } from './status.js'
import { ChatActivity, DailyScheduler, GroupChatter, buildCompanionGuide, chatPromptVersion, personaBlocks, NoteCounter, ProactiveScheduler, SendCounter, SessionCleaner, StickerLibrary, TypingPacer, companionStatusLines, setDefaultNoteCounter } from './companion/index.js'
import { GroupAccess, handleGroupEvent } from './groups.js'
import type { Context as CordisContext } from '@deepseek-ai/cordis'
import type SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import type ToolRuntime from '@deepseek-ai/dsh-tools'
import type { AgentRegistry } from '@deepseek-ai/dsh-agent'
import type { SessionStore } from '@deepseek-ai/dsh-session'
import type { ModelSelection } from '@deepseek-ai/dsh-agent'
import type Z from '@deepseek-ai/schemastery'
import type { OneBotEvent } from './connection.js'
import type { BridgeDeps, WorkspaceRegistryLike } from './bridge.js'
import type { SessionTitleLike } from './session-title.js'
import { join } from 'node:path'

// 部署加固：peer 依赖解析失败/关键模块缺失时必须显眼报错并 fail-loud，
// 不能静默不挂载。静态 import 会在本模块任何代码运行之前就以晦涩的
// ERR_MODULE_NOT_FOUND 失败（宿主侧表现为插件被静默跳过），因此运行时
// 值依赖改为入口顶部受控动态加载：失败时先输出含「peer/依赖」的显式
// 错误，再把原错误抛出。
let configModule: typeof import('./config.js')
let OneBotConnection: typeof import('./connection.js').OneBotConnection
let ChatBridge: typeof import('./bridge.js').ChatBridge
let MediaStore: typeof import('./media.js').MediaStore
let Transcriber: typeof import('./stt.js').Transcriber
let Synthesizer: typeof import('./tts.js').Synthesizer
let TraceSink: typeof import('./trace.js').TraceSink
let redactSnapshot: typeof import('./health.js').redactSnapshot
let describeError: typeof import('./errors.js').describeError
let packageVersion: typeof import('./commands/info.js').packageVersion

try {
  configModule = await import('./config.js')
  ;({ OneBotConnection } = await import('./connection.js'))
  ;({ ChatBridge } = await import('./bridge.js'))
  ;({ MediaStore } = await import('./media.js'))
  ;({ Transcriber } = await import('./stt.js'))
  ;({ Synthesizer } = await import('./tts.js'))
  ;({ TraceSink } = await import('./trace.js'))
  ;({ redactSnapshot } = await import('./health.js'))
  ;({ describeError } = await import('./errors.js'))
  ;({ packageVersion } = await import('./commands/info.js'))
} catch (error) {
  console.error('[qq-companion] 挂载失败：peer 依赖解析失败或关键模块缺失 —— 部署副本必须带完整 node_modules 链接集（scripts/link-host.sh 产物），只复制 lib/ 不够。原始错误：' + (error instanceof Error ? error.message : String(error)))
  throw error
}

type Context = CordisContext & {
  tools: ToolRuntime
  systemPrompt: SystemPrompt
  agents: AgentRegistry
  sessions: SessionStore
  agentDefaultModel: { currentSelection(): ModelSelection | undefined; saveSelection(next: ModelSelection): Promise<void> }
  agentPresets: {
    readonly defaultId: string
    resolve(id?: string): Promise<{ id: string }>
    mount(agentCtx: unknown, id?: string): Promise<{ id: string }>
  }
  sessionPersistence: {
    /** dsh-session-persistence 0.1.6 `stat`: the stored snapshot, or
     * undefined when the id owns no durable log (the retired `inspect`
     * convenience no longer exists on the host service). */
    stat(id: string): Promise<object | undefined>
    /** /session list previews: open a stored session read-only (never takes
     * write ownership), read the header + a small event prefix, then close. */
    open(id: string, access: 'read'): Promise<{
      header: { createdAt?: number; agentPreset?: string }
      read(offset?: number, length?: number): Promise<{ events: readonly { type?: string; data?: { agentPreset?: string; source?: { kind?: string }; content?: readonly { type?: string; text?: string }[] } }[] }>
      close(): Promise<void>
    }>
  }
  workspaceRegistry: {
    resolveByPath(path: string): Promise<{ id: string; path: string; sessionIds: readonly string[]; attachSession(sessionId: string): Promise<void> } | undefined>
    create(path: string, title?: string): Promise<{ id: string; path: string; sessionIds: readonly string[]; attachSession(sessionId: string): Promise<void> }>
    list(): Array<{ id: string; path: string; sessionIds: readonly string[] }>
  }
  commands: {
    execute(agent: unknown, line: string, submittedAttachments: readonly unknown[], signal: AbortSignal): Promise<{ kind?: string; text?: string; result?: { kind?: string; text?: string } }>
  }
}

export const name = 'dsh-qq-companion-pro'
export const inject = ['tools', 'systemPrompt', 'agents', 'sessions', 'agentDefaultModel', 'agentPresets', 'sessionPersistence', 'workspaceRegistry', 'commands', 'llm']

/** Plugin configuration (validated by schemastery); see config.ts. */
export type Config = import('./config.js').Config
export const Config: Z<Config> = configModule.Config
export const { defaultMediaDir, dshHome, resolveDeprecatedConfig } = configModule
const { resolvePolicy } = configModule

/** Severity rank for the logLevel gate (debug < info < warn < error). */
const LOG_LEVEL_RANK: Record<Config['logLevel'], number> = { debug: 0, info: 1, warn: 2, error: 3 }

/** Log a meta event; periodic heartbeat events are silenced to keep the log readable. */
export function logMetaEvent(selfId: string, event: OneBotEvent, minLevel: Config['logLevel'] = 'info'): void {
  const metaType = typeof event.meta_event_type === 'string' ? event.meta_event_type : ''
  if (metaType === 'heartbeat') return
  if (LOG_LEVEL_RANK.info < LOG_LEVEL_RANK[minLevel]) return
  console.log('[qq-companion] meta event; bot QQ: ' + selfId + '; ' + metaType)
}

/** 「accessToken 还没配」判定：schema 默认就是空串（config.ts 的
 *  `accessToken: z.string().role('secret').default('')`），纯空白同样视为没配
 *  ——连接层只拒绝 `=== ''`，一份只由空格组成的 token 能通过它的检查但连不上
 *  任何东西。非字符串（旧配置/手写 YAML 的 null）一并按未配置处理。 */
export function isAccessTokenUnconfigured(token: unknown): boolean {
  return typeof token !== 'string' || token.trim() === ''
}

/** 「等待配置」态的挂载：accessToken 缺失/纯空白时的**正常**状态，不是错误。
 *
 *  为什么不能照常启动：OneBotConnection.start() 对空 token 直接抛
 *  `reverse mode requires a non-empty accessToken`（安全校验，保留不动），
 *  抛在 apply 里会让本插件 fiber 变成 failed；而宿主 configEditor.edit 只对
 *  `fiber.state === 2`（active）的条目写配置 —— fiber 一 failed，设置页就再也
 *  存不进 token，用户只能手改 profile YAML 救场（部署后「设置不能保存」的死锁）。
 *
 *  所以这里停在等待配置：fiber 保持 active，**不建 OneBotConnection**（不监听
 *  端口、不连 NapCat），不初始化 bridge / 调度器 / 媒体 IO / 会话，也不伪造
 *  online；只挂只读状态服务让设置页概览显示「未连接」。填好 token 保存后宿主
 *  按新配置重启本条目，走下面的正常启动路径。 */
export function mountWaitingForAccessToken(ctx: Context, config: Config): void {
  // 不含任何秘密：只说「没配置」，绝不回显 token（空串/空白也不打印）。
  console.warn('[qq-companion] 未配置 accessToken：插件停在「等待配置」状态 —— 不监听 '
    + config.host + ':' + config.port + '、不连接 NapCat、不启动会话/定时任务/媒体 IO。'
    + '请在设置页「NapCat 连接」填写 OneBot access_token 并保存；保存后插件会按新配置重启并自动连接。')
  // 概览可见（available: true），连接如实报「未连接」：没有 connection 对象，
  // online 未知（null），transport 仍显示配置里的地址（NapCat 该拨的地方）。
  provideCompanionStatus(ctx, {
    snapshot: () => buildCompanionStatusSnapshot({
      connection: () => ({ connected: false, selfId: '' }),
      transport: { host: config.host, port: config.port },
      botQQ: config.botQQ,
      permissions: { admin: config.adminPermission ?? '', member: config.memberPermission ?? '' },
    }),
  })
}

/** Mount the plugin. */
export function apply(ctx: Context, config: Config): void {
  // honor the deprecated config names before any consumer reads them.
  config = resolveDeprecatedConfig(config)
  // 部署后首次启动的常见情形：accessToken 还是 schema 默认的空串。必须在这里
  // 早退（理由见 mountWaitingForAccessToken），否则 connection.start() 抛出会把
  // fiber 打成 failed，设置页从此写不进 token。
  if (isAccessTokenUnconfigured(config.accessToken)) {
    mountWaitingForAccessToken(ctx, config)
    return
  }
  const mediaDir = config.mediaDir !== '' ? config.mediaDir : defaultMediaDir()
  const policy = resolvePolicy(config)
  /** Console log line callback (level, message) — shared by the bridge deps,
   * the connection log port and the host-ready boot gate below. */
  const log = (level: 'info' | 'warn' | 'error' | 'debug', message: string): void => {
    if (LOG_LEVEL_RANK[level] < LOG_LEVEL_RANK[config.logLevel]) return
    const prefix = '[qq-companion] '
    if (level === 'error') console.error(prefix + message)
    else if (level === 'warn') console.warn(prefix + message)
    else console.log(prefix + message)
  }
  // The host exposes no queryable default workspace —
  // WorkspaceRegistry has no default getter and the session controller's
  // defaultCwd is assembly-internal — so the unconfigured fallback stays the
  // host process cwd. Say so once at mount so a /root surprise is explainable.
  if (config.workspacePath === '') {
    log('warn', '未配置 workspacePath：QQ 会话默认目录将使用宿主进程工作目录 ' + process.cwd() + '，建议在配置中设置 workspacePath，避免会话工作区落在宿主启动目录')
  }
  // runtime group allowlist (configured ∪ added − removed),
  // persisted under mediaDir; loads before the bridge sees any message.
  const groupAccess = new GroupAccess({ policy, mediaDir, log })
  const groupAccessLoaded = groupAccess.load()
  // chat activity (idle reset / handoff / diary input).
  // The prompt version of a chat (plugin version + persona text + its guide +
  // its platform section): a session started under another version is renewed
  // at the next message, since dsh would keep sending the old system prompt
  // beside the new one.
  const persona = personaBlocks(join(dshHome(), 'profiles', 'web', 'cordis.patch.yml'))
  // 平台段（order 90）也算进指纹（T7）：能力开关一变，提示词里「能用哪些工具」
  // 就变了，旧会话必须换新，否则 dsh 会把新提示追加在旧的后面、两套规则同时生效。
  // 后绑定：bridge 在 activity 之后创建，这里先用 let 占位，建好再接线。
  // ⚠ 平台段必须逐字稳定（同一状态 100 次调用结果相同），否则每回合都换会话。
  let platformPromptOf: ((chatId: string) => string) | undefined
  const promptVersion = (chatId: string): string => chatPromptVersion({
    version: packageVersion() ?? '',
    persona,
    guide: companionGuide(chatId),
    platform: platformPromptOf?.(chatId) ?? '',
  })
  const activity = new ChatActivity({ mediaDir, log, promptVersion })
  const activityLoaded = activity.load()
  // how she takes part in group chats beyond an @ (context, names, follow-ups, looks).
  const groupChatter = new GroupChatter({
    config: {
      contextLines: config.groupContextLines ?? 0,
      names: config.groupNameTriggers ?? [],
      followupSeconds: config.groupFollowupSeconds ?? 0,
      peekEnabled: config.groupPeekEnabled ?? false,
      peekGapMinutes: config.groupPeekGapMinutes ?? 30,
      peekMinMessages: config.groupPeekMinMessages ?? 10,
      peekQuietMinutes: config.groupPeekQuietMinutes ?? 10,
      peekWindowStart: config.groupPeekWindowStart ?? '09:00',
      peekWindowEnd: config.groupPeekWindowEnd ?? '24:00',
    },
  })
  let peekTimer: ReturnType<typeof setInterval> | undefined
  // how her companion features work, written from this config for each chat
  const diary = (config.scheduledPrompts ?? []).find(p => p.includeTodayLog === true)
  const companionGuide = (chatId: string): string => buildCompanionGuide({
    ownerTitle: config.ownerTitle,
    adminUsers: policy.adminUsers,
    friendUsers: config.friendUsers ?? [],
    memberObedience: config.memberObedience,
    friendObedience: config.friendObedience,
    friendIntimacy: config.friendIntimacy,
    publicMemoryFile: config.publicMemoryFile ?? '',
    publicMemoryMaxBytes: config.publicMemoryMaxBytes,
    adminWorkspacePath: config.adminWorkspacePath ?? '',
    privateMemoryMaxBytes: config.privateMemoryMaxBytes ?? 24 * 1024,
    groupMemoryDir: config.groupMemoryDir ?? '',
    groupMemoryMaxBytes: config.groupMemoryMaxBytes,
    privateResetDays: config.privateResetDays ?? 0,
    groupResetDays: config.groupResetDays ?? 0,
    idleResetHours: config.idleResetHours ?? 0,
    groupContextLines: config.groupContextLines ?? 0,
    groupNameTriggers: config.groupNameTriggers ?? [],
    groupFollowupSeconds: config.groupFollowupSeconds ?? 0,
    groupPeekEnabled: config.groupPeekEnabled ?? false,
    proactiveEnabled: config.proactiveEnabled && config.proactiveChatId === chatId,
    proactiveWindowStart: config.proactiveWindowStart,
    proactiveWindowEnd: config.proactiveWindowEnd,
    proactiveMaxUnanswered: config.proactiveMaxUnanswered,
    stickerDir: config.stickerDir ?? '',
    diaryTime: diary !== undefined && diary.chatId === chatId ? diary.time : '',
  }, chatId.startsWith('group:') ? 'group' : policy.adminUsers.includes(chatId.slice('private:'.length)) ? 'owner' : 'other')
  // Counts what the account sends (shown by /doctor).
  const sendCounter = new SendCounter()
  // 输出协议（B 档）状态：开关与灰度聊天来自配置，计数来自同一个 SendCounter
  // ——/doctor 的「输出协议」行与设置页概览的「功能」卡片同源，不两处各算一遍。
  const protocolStatus = (): import('./companion/index.js').ProtocolStatusView => {
    const snapshot = sendCounter.snapshot()
    return {
      enabled: config.protocolMode === 'on',
      chats: [...(config.protocolChats ?? [])],
      repliesToday: snapshot.protocolReplies,
      parsedToday: snapshot.protocolParsed,
      failedToday: snapshot.protocolFailed,
    }
  }
  const typingPacer = new TypingPacer({ config: { perCharMs: config.typingDelayPerCharMs, minMs: config.typingDelayMinMs, maxMs: config.typingDelayMaxMs } })
  // Her sticker library (off when no directory is configured).
  const stickers = config.stickerDir !== ''
    ? new StickerLibrary({ dir: config.stickerDir, maxCount: config.stickerMaxCount, maxBytes: config.stickerMaxBytes, dailyMax: config.stickerDailyMax, log })
    : undefined
  // Per-day memory-note counts survive restarts.
  const noteCounter = new NoteCounter(join(mediaDir, 'note-counts.json'), log)
  setDefaultNoteCounter(noteCounter)
  // Late-bound: the proactive scheduler needs the bridge, the bridge's /task
  // needs the scheduler.
  let proactiveRef: ProactiveScheduler | undefined
  const proactiveHandle = {
    remaining: (): string[] => proactiveRef?.remaining() ?? [],
    fireNow: async (): Promise<void> => { await proactiveRef?.fireNow() },
  }
  const connection = new OneBotConnection(
    {
      host: config.host,
      port: config.port,
      accessToken: config.accessToken,
      callTimeoutMs: 30_000,
      log,
    },
  )
  const media = new MediaStore(mediaDir, config.tempTtlHours, config.inboundImageMaxPx, { maxBytes: config.inboundFileMaxBytes, allowPrivateHosts: config.allowPrivateHosts, log })
  // the trace sink exists only when explicitly enabled — default off
  // means no sink, no traceIds, no jsonl, zero behavior difference.
  const traceSink = config.traceEnabled
    ? new TraceSink({ dir: mediaDir, level: config.traceLevel, log: (level, message) => log(level, message) })
    : undefined
  const transcriber = new Transcriber({
    enabled: config.sttEnabled,
    engine: config.sttEngine,
    command: config.sttCommand,
    args: config.sttArgs,
    model: config.sttModel,
    language: config.sttLanguage,
    maxSeconds: config.sttMaxSeconds,
    replacements: config.sttReplacements,
    timeoutMs: config.sttTimeoutMs,
  })
  // Her voice (T15): local TTS into mediaDir; disabled = no tool at all.
  const tts = new Synthesizer({
    enabled: config.ttsEnabled,
    engine: config.ttsEngine,
    command: config.ttsCommand,
    args: config.ttsArgs,
    model: config.ttsModel,
    voice: config.ttsVoice,
    maxChars: config.ttsMaxChars,
    timeoutMs: config.ttsTimeoutMs,
    // 与发送端同一个上限：超限的音频在合成后就报错，不去撞 NapCat 的拒绝。
    maxBytes: config.maxVoiceBytes,
  }, mediaDir)
  // 就绪 = 真的找到了程序 / 模型，不是「填了就算」。这一步必须在桥建起来之前
  // 做完：能力解析和工具注册都读这个结果，探不出来的引擎干脆不注册
  // qq_send_tts（模型看不到，也就不会每次调用都失败）。
  tts.probe()
  if (tts.enabled && !tts.ready) {
    log('warn', '语音合成已开启，但引擎用不了：' + tts.status().detail + '；qq_send_tts 这次不会被注册（修好后重启生效）')
  }
  connection.onMessage = (event: OneBotEvent) => {
    void bridge.handleInbound(event)
  }
  connection.onNoticeOrRequest = (event: OneBotEvent) => {
    liveness.onNotice(event)
    void groupAccessLoaded.then(() => handleGroupEvent(event, {
      adminUsers: () => policy.adminUsers,
      selfId: () => connection.selfId,
      access: groupAccess,
      call: (action, params) => connection.call(action, params),
      notifyAdmins: async text => {
        for (const admin of policy.adminUsers) {
          await bridge.sendToChat(('private:' + admin) as never, text).catch((error: unknown) => {
            log('warn', '通知管理员失败: ' + String(error))
          })
        }
      },
      config: { autoAcceptAdminRequests: config.autoAcceptAdminRequests, autoAllowInvitedGroups: config.autoAllowInvitedGroups, ownerTitle: config.ownerTitle },
      log,
    })).catch((error: unknown) => log('warn', '群/好友事件处理失败: ' + String(error)))
  }
  // QQ account liveness beyond the open WebSocket (see liveness.ts).
  const liveness = new QqLiveness({ log, connected: () => connection.connected, drop: reason => connection.dropSocket(reason) })
  connection.onMeta = (event: OneBotEvent) => {
    liveness.onMeta(event)
    logMetaEvent(connection.selfId, event, config.logLevel)
  }
  const bridge: import('./bridge.js').ChatBridge = new ChatBridge({
    ctx,
    // the bridge sees only explicit ports — the session-event feed
    // (this context's own `on`) and the two injectables below; the 'loader'
    // service lookup lives here, not in the bridge.
    hostReady: async () => {
      try {
        const loader = ctx.get('loader') as { await(): Promise<void> } | undefined
        await loader?.await()
      } catch (error) {
        log('debug', 'loader.await failed: ' + describeError(error))
      }
    },
    // Live llm lookup per call — same semantics as the pre-port live getter.
    llmCatalog: {
      listProviders: () => ctx.llm.listProviders(),
      listModels: provider => ctx.llm.listModels(provider),
    },
    connection,
    dshHome: dshHome(),
    media,
    transcriber,
    tts,
    agents: ctx.agents,
    sessions: ctx.sessions,
    agentPresets: ctx.agentPresets,
    commands: ctx.commands as BridgeDeps['commands'],
    sessionPersistence: ctx.sessionPersistence,
    workspaceRegistry: ctx.workspaceRegistry as unknown as WorkspaceRegistryLike,
    // the host `sessionTitle` service is optional and NOT in the static inject
    // list, so it is resolved lazily per create/resume (absent = the session
    // keeps its raw id as the display name). Same posture as workspaceRegistry
    // in the settings remote.
    sessionTitle: () => {
      try {
        return ctx.get('sessionTitle') as SessionTitleLike | undefined
      } catch {
        return undefined
      }
    },
    agentDefaultModel: ctx.agentDefaultModel,
    // 长任务（T16）的宿主 goals 服务：可选依赖，绝不能进静态 inject 列表
    // （goal-round-driver 可能不存在）；每次 live 查找，缺失即空（命令层会
    // 给出诚实的「宿主未提供」回执）。
    goals: () => {
      try {
        return ctx.get('goals') as import('./task-goal.js').GoalsPortLike | undefined
      } catch {
        return undefined
      }
    },
    defaultModel: () => {
      try {
        return ctx.agentDefaultModel.currentSelection()
      } catch {
        return undefined
      }
    },
    // The bridge reads the plugin config directly; only the resolved media
    // dir and the keys it knows under another name are set here.
    config: {
      ...config,
      mediaDir,
      maxImageBytes: config.outboundImageMaxBytes,
      maxInboundFileBytes: config.inboundFileMaxBytes,
      trace: traceSink,
    },
    policy,
    groupAccess,
    activity,
    groupChatter,
    companionGuide,
    ...(stickers !== undefined ? { stickers } : {}),
    ...(config.proactiveEnabled ? { proactive: proactiveHandle } : {}),
    sendCounter,
    typingPacer,
    companionStatus: () => companionStatusLines({
      sendCounter: () => sendCounter.snapshot(),
      protocol: protocolStatus,
      liveness: () => liveness.snapshot(),
      scheduler: () => scheduler.snapshot(),
      ...(proactiveRef !== undefined ? { proactive: () => proactiveRef!.snapshot() } : {}),
      ...(stickers !== undefined ? { stickers: () => stickers.snapshot() } : {}),
      tts: () => tts.status(),
      memoryFiles: [
        { label: '公开', path: config.publicMemoryFile, max: config.publicMemoryMaxBytes },
        ...(config.adminWorkspacePath !== '' ? [{ label: '私密', path: join(config.adminWorkspacePath, 'AGENTS.md') }] : []),
      ],
      groupMemoryDir: config.groupMemoryDir,
      groupMemoryMaxBytes: config.groupMemoryMaxBytes,
    }),
    // health: the config snapshot is redacted at the source — secrets
    // (token/password/apikey…) never leave this closure in the clear.
    configSnapshot: () => redactSnapshot(config as unknown as Record<string, unknown>),
    log,
  })

  // connection faults mint QQ-CONN-… references through the
  // bridge (registry + trace + structured log); the transport appends the
  // returned reference to its own log line, so host logs and qq-trace.jsonl
  // share the same number for one fault.
  connection.onFailure = (stage: string, detail: string): string => bridge.registerConnectionFailure(stage, detail)

  // 平台段指纹的后绑定接线：从这一刻起 promptVersion 才能算上平台段。
  // 在 bridge 创建之前（activity 构造、启动自检）调用 promptVersion 会拿到
  // 空串——那时还没有任何会话按新指纹记录过，不影响正确性。
  platformPromptOf = (chatId: string): string => bridge.platformPromptText(chatId)

  // A group that leaves the allowlist (/group remove, kicked, or dropped from
  // the config while dsh was down) has its session retired.
  groupAccess.onRemoved = groupId => bridge.retireGroup(groupId)

  // Lifecycle: start the bridge and transport; unwind everything on unload.
  // daily scheduled prompts (diary …), fired into their chats.
  const scheduler = new DailyScheduler({ prompts: config.scheduledPrompts, fire: prompt => bridge.fireScheduled(prompt), log, stateFile: join(mediaDir, 'scheduler-state.json') })
  // proactive wake-ups in the owner's chat.
  const proactive = config.proactiveEnabled && config.proactiveChatId !== ''
    ? new ProactiveScheduler({
      config: {
        chatId: config.proactiveChatId,
        windowStart: config.proactiveWindowStart,
        windowEnd: config.proactiveWindowEnd,
        minPerDay: config.proactiveMinPerDay,
        maxPerDay: config.proactiveMaxPerDay,
        minGapMinutes: config.proactiveMinGapMinutes,
        skipIfActiveMinutes: config.proactiveSkipIfActiveMinutes,
        maxUnanswered: config.proactiveMaxUnanswered,
      },
      activity,
      fire: context => bridge.fireCheckin(config.proactiveChatId as never, context),
      log,
      stateFile: join(mediaDir, 'proactive-state.json'),
    })
    : undefined
  proactiveRef = proactive
  // old QQ chat sessions nobody writes to any more: deleted after their age limit.
  const sessionCleaner = new SessionCleaner({
    sessionsRoot: join(dshHome(), 'sessions'),
    projectionCacheDir: join(dshHome(), 'storages', 'session_projcache', 'sessions'),
    privateKeepDays: config.privateSessionKeepDays ?? 0,
    groupKeepDays: config.groupSessionKeepDays ?? 0,
    inUse: () => bridge.sessionIdsInUse(),
    onRemoved: id => bridge.forgetSession(id),
    log,
  })
  ctx.effect(() => {
    bridge.start()
    // after start(): the mapping load it kicks off is what this waits for.
    void groupAccessLoaded.then(() => bridge.retireDisallowedGroups()).catch(error => log('warn', '清理不在白名单的群会话失败: ' + String(error)))
    void Promise.all([activityLoaded, scheduler.load(), proactive?.load(), noteCounter.load(), stickers?.load()]).then(() => { scheduler.start(); proactive?.start() })
    liveness.start()
    connection.start()
    sessionCleaner.start()
    if (config.groupPeekEnabled) {
      // once a minute: groups that are lively and quiet for her get a look
      peekTimer = setInterval(() => {
        for (const groupId of groupChatter.peekDue(groupChatter.knownGroups())) {
          void bridge.firePeek(groupId).catch(error => log('warn', '看一眼群聊失败: ' + String(error)))
        }
      }, 60_000)
      peekTimer.unref?.()
    }
    // QQ 平台说明与 qq_* 工具现按会话 agent 注入（见 ChatBridge.installChannelScope）
    return async () => {
      scheduler.stop()
      proactive?.stop()
      if (peekTimer !== undefined) clearInterval(peekTimer)
      await sessionCleaner.stop()
      liveness.stop()
      await bridge.stop()
      // After the bridge: its last replies are recorded too.
      await activity.flush()
      await connection.stop()
    }
  }, 'qq-companion.lifecycle')

  // 设置页概览（前端设计规范 §4.14）：把**只读**状态服务挂到 cordis 上，设置页的
  // 独立插件条目（onebot-settings-remote）惰性 ctx.get('qqCompanionStatus') 取用
  // ——它拿不到本插件的 bridge，只能走服务。ctx.provide 注册在插件自己的 fiber
  // 上，fiber 卸载即自动注销（reflect.ts 的 provide 语义），设置页随后显示
  // 「QQ 主插件未运行」。快照取数全是现读，任一部分失败只让该字段为 null。
  provideCompanionStatus(ctx, {
    snapshot: () => buildCompanionStatusSnapshot({
      connection: () => ({ connected: connection.connected, selfId: connection.selfId }),
      transport: { host: connection.listenHost, port: connection.listenPort },
      botQQ: config.botQQ,
      liveness: () => liveness.snapshot(),
      chats: () => {
        const chats = bridge.chatSnapshot()
        return {
          live: chats.filter(chat => chat.live),
          mapped: chats.filter(chat => !chat.live),
        }
      },
      workspaceSessionIds: () => {
        try {
          const ids = new Set<string>()
          for (const workspace of ctx.workspaceRegistry.list()) {
            for (const id of workspace.sessionIds) ids.add(id)
          }
          return ids
        } catch {
          // 宿主 workspace 注册表读不到：会话卡片把「已归入工作区」显示成未知（null）。
          return undefined
        }
      },
      titleOf: chatId => bridge.sessionTitleOf(chatId),
      sendCounter: () => sendCounter.snapshot(),
      protocol: protocolStatus,
      scheduler: () => scheduler.snapshot(),
      scheduledPrompts: config.scheduledPrompts,
      ...(proactive !== undefined
        ? { proactive: () => ({ enabled: true, firedToday: proactive.snapshot().firedToday, remaining: proactive.remaining() }) }
        : {}),
      ...(stickers !== undefined ? { stickers: () => stickers.snapshot() } : {}),
      memoryFiles: [
        { label: '公开', path: config.publicMemoryFile, max: config.publicMemoryMaxBytes },
        ...(config.adminWorkspacePath !== '' ? [{ label: '私密', path: join(config.adminWorkspacePath, 'AGENTS.md') }] : []),
      ],
      groupMemoryDir: config.groupMemoryDir,
      groupMemoryMaxBytes: config.groupMemoryMaxBytes,
      permissions: { admin: config.adminPermission ?? '', member: config.memberPermission ?? '' },
      // 能力开关摘要（与 /doctor 的能力行同源，按管理员私聊视角）。
      capabilities: () => bridge.capabilitySummary(),
    }),
  })

  // Configuration self-check: plain-language warnings, once at mount.
  const problems = selfCheck({ ...config, adminUsers: policy.adminUsers, allowAllUsers: policy.allowAllUsers })
  if (problems.length === 0) log('info', '配置自检通过')
  else for (const problem of problems) log('warn', '配置自检：' + problem)
  console.log('[qq-companion] mounted (listen=' + config.host + ':' + config.port + ', media=' + mediaDir + ', admins=' + policy.adminUsers.length + ')')
}
