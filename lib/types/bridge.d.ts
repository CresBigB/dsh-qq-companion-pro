import type { BridgeDeps } from './bridge-types.js';
import { type CapabilitySummary } from './capabilities.js';
import type { ChatId } from './chat.js';
import type { ScheduledPrompt } from './companion/index.js';
import type { OneBotEvent } from './connection.js';
import { type OutboundSegment, type SendOptions } from './outbound.js';
import { type TraceStage } from './trace.js';
export * from './bridge-types.js';
/**
 * Bridge between OneBot events and dsh agents. Create via the constructor and
 * call start() from the plugin's effect; call stop() on disposal.
 */
export declare class ChatBridge {
    private readonly deps;
    /** Outbound pipeline: the same-name bridge methods below delegate here. */
    private readonly outbound;
    /** The chat↔session registry: chats/bySession dual index, the
     * persistence pair, per-chat settings and the create/resume assembly. */
    private readonly registry;
    /** Inbound pipeline: normalizeOneBot11 + the policy→media→quote→
     * dispatch path; the same-name bridge methods below delegate here. */
    private readonly inbound;
    /** Interim domain: the assistant/message interim routing, the
     * per-message recall timers and the turn/end settlement. */
    private readonly interim;
    /** the deferred-delivery tracker (超时补发) — timeout timers, the
     * JSONL registry, bounded send retries and restart recovery. */
    private readonly deferred;
    /** the bounded registry of recent fault references — every minted
     * QQ-CONN-/MF- number is recorded here for the /doctor report and the
     * diagnostics archive file name. */
    private readonly failureRefs;
    /** Live registry indexes — the inbound/outbound/interim/turn links keep
     * reading them through these same-name views. */
    private get chats();
    private get bySession();
    private sessionEventOff;
    private sessionFlushOff;
    /** chat-level traceId association table — session events arrive on a
     * different async chain than the inbound pipeline, so dispatchFollowup
     * records the initiating traceId per chat here and onSessionEvent reads it
     * back (agent 回复事件归属发起 traceId). Last dispatch wins; entries are
     * dropped when the chat is removed. Not cleared at turn/end: the interim
     * settle loop sends the final reply AFTER turn/end, and clearing there
     * would orphan exactly that reply's outbound events. One entry per chat
     * id (bounded by the chat population), so growth is not a concern. */
    private readonly traceByChat;
    /** chats that already sent their one sticker in the running turn
     * (cleared at turn/start and on chat removal). */
    private readonly stickerSentChats;
    /** 最近见过的消息 id（每 chat 一个内存 LRU，见 reply-quote.ts）：
     * 入站消息（含只进群上下文、没 @ 她的）与她自己的发送 id 都在里面；
     * 引用标记与 qq_send_* 的 reply_to 只能引用集合里的 id。 */
    private readonly seenMessageIds;
    private stopping;
    /** 长任务：`goal/changed` 的退订句柄（start/stop 维护）。目标轮身份改为在
     * 真实 `user/message` 接纳事件上绑定（D1/D2），不再监听 `agent/pre-step`。 */
    private goalChangeOff;
    /** 本插件刚发出的目标操作（operation+goalId+时间戳）：对应的
     * `goal/changed` 只更新绑定、不重复对外播报。10 秒内的同操作视为自己
     * 发出的那次；更久则视为别处的改动，照常播报。 */
    private readonly selfGoalOps;
    /** companion behavior (session renewal, pass marker, wake-up texts). */
    private readonly companion;
    /**
     * Optional BTW-style side-question lanes, **one per chat**.
     *
     * The limit is per chat on purpose: a busy group must not eat the side-lane
     * slots of the admin's private chat. Lanes are created lazily so an idle
     * deployment keeps none; idle lanes are pruned when another chat opens one.
     * Only constructed when explicitly enabled and backed by a host adapter.
     */
    private readonly sideAsks;
    /** 每个群自己的「没人理就安静一会儿」状态（只存在内存里，重启就重新开始）。 */
    private readonly jumpIns;
    private readonly sideAskAgent;
    constructor(deps: BridgeDeps);
    /** Start listening: wire connection handlers and the session event feed. */
    start(): void;
    /** Stop everything: dispose agents, save mapping, cancel timers. */
    stop(): Promise<void>;
    /** One sticker per reply: claim the running turn's slot for a chat. */
    takeStickerSlot(chatId: string): boolean;
    /** Map an agent session id back to its chat (for model tools). */
    chatForSession(sessionId: string): ChatId | undefined;
    /** Whether a caller backing an agent session may perform file edits. QQ chats
     * require the currently running turn's initiator to be an admin (role frozen
     * from the dispatch queue at turn/start); non-QQ sessions (Web and other
     * channels) are trusted by default. Unknown states fail closed
     * as member. */
    canEditFiles(sessionId: string): boolean;
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
    auditAction(chatId: ChatId, action: string, ok: boolean, reason: string): void;
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
    mediaSendRoots(sessionId: string | undefined): Promise<{
        roots: string[];
        isTurnAdmin: boolean;
    }>;
    /** Whether the connection is usable for sends. */
    get connected(): boolean;
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
    sendToChat(chatId: ChatId, text: string, options?: SendOptions): Promise<string[]>;
    /**
     * 该聊天是否启用输出协议（B 档）：`protocolMode === 'on'` 且
     * （`protocolChats` 为空 或 包含该 chatId）。**未启用时 `sendToChat` 完全不调用
     * 解析器**——这是「零行为变化」的硬保证，也是提示词只给启用的聊天加说明的依据。
     * @param chatId - the chat to test.
     */
    protocolEnabledFor(chatId: string): boolean;
    /**
     * 记一条「她选择不回」：日志（带原因）、决策 trace（stage='reply'）、今日计数、
     * 活动记录。四处都尽力而为，任何一处缺席都不影响「不发」这个结果。
     * @param chatId - the chat she chose not to answer in.
     * @param reason - 她写的原因（'' = 没说原因）。
     * @param viaControl - true = 来自输出协议 B 档的控制块（reply:false），
     *   日志与 trace 的措辞里带上「控制块」，便于和 A 档标记区分。
     */
    private recordReplyPass;
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
    private readControlBlock;
    /**
     * 控制块生效的决策 trace（stage='outbound'，reason 里带「控制块」字样）。
     * data 只放 reply / send 条数 / quote 有无——why 只进日志与记忆，不塞进 trace。
     * @param chatId - 目标聊天。
     * @param control - 已解析成功的控制块。
     */
    private recordControlBlock;
    /**
     * Resolve the message id this send should quote, or undefined for no quote.
     * An explicit marker wins (and only counts for a final reply); otherwise the
     * group auto-quote setting may quote the turn's trigger message. An id the
     * chat has never seen is dropped (the marker is stripped, nothing quoted).
     * @param chatId - target chat.
     * @param marker - the parsed leading marker (null = the model wrote none).
     * @param humanize - whether this is a model final reply.
     */
    private resolveReplyTarget;
    /** Whether this chat has actually seen a message id (the reply-quote gate
     * for the qq_send_* reply_to argument). */
    hasSeenMessage(chatId: string, messageId: string): boolean;
    /** A group left the allowlist: retire its session so that, if it is ever
     * allowed again, it starts fresh under the current preset. */
    retireGroup(groupId: string): Promise<void>;
    /** Session ids some chat still uses (old-session cleanup never deletes these). */
    sessionIdsInUse(): Set<string>;
    /** 设置页概览用：live 会话 + 映射里已知的聊天（只读，不触发 IO）。 */
    chatSnapshot(): Array<{
        chatId: string;
        sessionId: string;
        live: boolean;
    }>;
    /** 设置页概览用：宿主 sessionTitle 里该聊天的当前标题（聊天不 live / 服务缺席 /
     *  取数失败一律 undefined；绝不抛错）。 */
    sessionTitleOf(chatId: string): string | undefined;
    /** A session's logs were deleted by the old-session cleanup. */
    forgetSession(sessionId: string): void;
    /** On startup: retire sessions of groups that are no longer allowed (the
     * allowlist may have changed in the config while dsh was down). */
    retireDisallowedGroups(): Promise<void>;
    /** one proactive wake-up in the owner's chat. She decides
     * whether to write; replying exactly PROACTIVE_PASS sends nothing. */
    fireCheckin(chatId: ChatId, context: {
        time: string;
        unanswered: number;
        lastUserAt: number | undefined;
    }): Promise<void>;
    /** One proactive wake-up in a group she is allowed to speak in. She decides
     * whether to write; replying exactly PROACTIVE_PASS sends nothing.
     * Runs as `member` on purpose: a group turn must never become an admin turn
     * (canEditFiles() keys off the turn role), and a group that left the
     * allowlist — or whose turn is busy — is skipped instead of typed into. */
    fireGroupCheckin(groupId: string, context: {
        time: string;
        unanswered: number;
        lastUserAt: number | undefined;
    }): Promise<void>;
    /** One periodic look at a group (she decides herself whether to chip in;
     * the pass marker sends nothing). Skipped while the group's turn is busy. */
    firePeek(groupId: string): Promise<void>;
    /** run one scheduled prompt (diary, proactive check-ins) as
     * an admin turn in its chat. Never idle-resets: the diary must see the
     * day's session. */
    fireScheduled(prompt: ScheduledPrompt): Promise<void>;
    /**
     * Send raw OneBot segments (used by the media tools).
     * @param chatId - target chat.
     * @param segments - outbound segments.
     * @param options - optional reply target (the tool's reply_to argument).
     * @returns the sent message id.
     */
    sendSegments(chatId: ChatId, segments: OutboundSegment[], options?: SendOptions): Promise<string | undefined>;
    /**
     * Inbound OneBot message event → agent turn. All policy and media work is
     * contained: a failure here logs and drops the message, never the host.
     * the whole inbound chain runs inside one trace scope (ALS), so every
     * pipeline decision point can attribute its event to this message's
     * traceId; tracing off = no scope.
     */
    handleInbound(event: OneBotEvent, options?: {
        poked?: boolean;
    }): Promise<void>;
    /**
     * A QQ poke (拍一拍) aimed at her becomes one ordinary inbound message —
     * same gates, same busy handling, same permissions as a typed line. In a
     * group it counts as an @ (see `poked` in inbound.ts). Pokes aimed at
     * somebody else, or poked when the feature is off, are ignored silently:
     * a notice is not a place to send apologies into a group.
     */
    handlePoke(event: OneBotEvent): Promise<void>;
    /** mint the inbound traceId + scope and record the first (收到消息)
     * event; undefined when tracing is off. */
    private beginInboundTrace;
    /** Feed one user message into a chat's agent (create on demand). Records
     * the base text for /retry, queues the initiator's turn role and the
     * message that triggered it, and applies per-chat /goal + /plan prefixes. */
    private dispatchFollowup;
    /** Prepend per-chat context directives (/goal reminder) to a turn's user
     * text. Plan mode is host-owned now (/plan forwards to the host command),
     * so the agent's own plan-mode instruction section governs planning. */
    private prefixTurn;
    /** 每个聊天各自的上限（1–8，默认 2）。 */
    private sideAskCapacity;
    /**
     * 取该聊天的旁问车道，不存在就建一条。
     *
     * 车道是**每聊天一份**：一个热闹的群不该吃掉管理员私聊的旁问名额。旁问是
     * 自动触发的旁路，占满时不能占用当前回合该走的路，因此固定 reject 而不是
     * 排队——调用方会退回既有的排队/插话策略。
     */
    private jumpInStateOf;
    /**
     * 群聊「没人 @ 她、也不是接着她的话」这一类回复要不要接。
     *
     * 关掉自判、或者宿主没给判断端口时一律返回 true——那是改动前的行为，不能
     * 因为一个缺失的能力把她的嘴缝上。只有在明确判为「不接」时才返回 false。
     */
    private shouldJumpIn;
    /** 她在群里说了一句：进入下一档退避。 */
    private noteJumpInSpoke;
    /** 有人在群里接着她说话：退避清零。 */
    private noteJumpInAnswered;
    private sideAskOf;
    /** Hand a message that arrived while the chat's turn is still running to the
     * host subagent adapter (BTW-style side lane: the main task keeps running and
     * the answer arrives as its own QQ message). The question text only travels to
     * the adapter; it is not logged, persisted, or injected into the main session.
     * @returns 'taken' when the message became a side ask; 'full' when the lane is
     * enabled but its concurrency is exhausted (or the message is too long); and
     * 'off' when the lane is not configured at all. Anything but 'taken' makes the
     * caller fall back to the normal queue/steer policy.
     */
    private trySideAsk;
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
    private tryHandleCommand;
    /**
     * The CommandContext handed to the command table: exposes exactly
     * the bridge capabilities the routed commands use, resolved live per
     * invocation (the llm catalog especially must stay a live service lookup).
     */
    private get commandCtx();
    /**
     * Build the message body text: placeholders become annotated local paths
     * (images/voices/videos) and voice files are transcribed when enabled.
     */
    private buildBody;
    /** the single agent.steer write point — one createUserMessage with
     * the producer-owned source kind (the session-v4 guard counts the source
     * write points; this and dispatchFollowup are the only two). Shared by the
     * 'steer' policy and /steer.
     * Returns false when the chat has no live agent (nothing was steered). */
    private steerMessage;
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
    private interceptBusyTurn;
    /** Expand a quoted (reply) message into [引用] text via get_msg. */
    private expandQuote;
    /**
     * Open one message of this chat by id (qq_open_message): images fetched,
     * voice transcribed, forwards expanded — like a quote. Only a message that
     * belongs to this chat opens (a group never reads another group's).
     */
    openMessage(messageId: string, chatId: ChatId): Promise<string>;
    /** Send [[qq_forward]] nodes as a merged-forward message. */
    sendForward(chatId: ChatId, nodes: Array<{
        name: string;
        content: string;
    }>): Promise<void>;
    /** One OneBot action. */
    private call;
    /** emit one outbound/deferred decision event for a chat: it rides the
     * chat's initiating traceId; a write with no mapped trace (proactive tool
     * sends) starts a fresh one. No-op with tracing off. */
    private traceChat;
    /** The health deps the /doctor command renders from (resolved live). */
    private healthDeps;
    /** /doctor: render the health summary. */
    private buildHealthReport;
    /** /doctor export: pack the redacted diagnostics archive. the
     * file name carries the trigger reference — the explicit command argument,
     * or the most recent recorded fault reference when omitted. */
    private exportDiagnosticsPackage;
    private onSessionEvent;
    /** A failed turn's notice goes to the owner only: in their own private
     * chat it is shown there; a failure in a group or someone else's private
     * chat is reported to the owner privately, never shown to other people. */
    private sendErrorNotice;
    /** the trace scope for one chat's session events, resolved through the
     * chat-level association table; undefined when tracing is off or the chat
     * has no recorded dispatch (host-initiated turns stay untraced). */
    private traceForChat;
    /**
     * the single fault-reference entry point. Mints one QQ-CONN-/MF-
     * number, records it in the bounded registry, emits the ok:false trace
     * event carrying `data.ref` (traceId = the chat's mapped id, or a fresh id
     * for chat-less connection faults), and writes the structured error log
     * line — every surface of the fault shares this one number. Called only on
     * fault events: normal traffic mints nothing (zero overhead).
     */
    private mintFailureRef;
    /** connection-fault reference entry (wired from index.ts via
     * `connection.onFailure`); the returned reference is appended to the
     * transport's own log line. */
    registerConnectionFailure(stage: string, detail: string): string;
    /** message-fault reference entry for command-plane failures (e.g. the
     * /retry dispatch throw); the caller appends the returned reference to the
     * user-visible ⚠️ notice. */
    registerMessageFailure(chatId: ChatId, stage: TraceStage, detail: string): string;
    /** 命令层操作长任务授权的窄端口（只在内存，见 task-goal.ts）。 */
    private get taskGoalPort();
    /** 记住「这个目标操作是本插件刚发出的」，供 goal/changed 去重（10 秒窗口）。 */
    private noteSelfGoalOp;
    /** 该操作是不是本插件 10 秒内刚发出的（是则消费掉：只更新绑定、不重复播报）。 */
    private consumeSelfGoalOp;
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
    private queuePendingTurn;
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
    private onUserMessageAdmitted;
    /** QQ 派发回合：只有命中排队凭据才抬身份，否则失败闭合（且不乱动别人的凭据）。 */
    private admitDispatchedTurn;
    /**
     * 失败闭合：本回合身份降回 member、清掉引用，并停用自动目标轮冻结。
     *
     * 冻结一并停用是安全的做法（T16 第二轮审查缺陷 1）：这个回合已经被一份
     * **非授权输入**接管，`taskGoalText` 里攒的是目标轮的过程文字，绝不能在
     * turn/end 按长任务回传出去（那就是把过期目标文本发给用户）。
     */
    private failClosedTurn;
    /**
     * 停用本回合的自动目标轮冻结：`taskGoalTurn` / `taskGoalText` /
     * `taskGoalLastMessageId` 一起清掉（过程文字绝不能按长任务回传出去）。
     * 只动回合级冻结事实，`chat.taskGoal` 绑定与授权不动。返回是否真的撤了冻结。
     */
    private dropGoalRoundFreeze;
    /** 自动目标轮识别：来源必须与进程内绑定**完全一致**且目标仍 active+armed。 */
    private admitGoalRound;
    /** `goal/changed`：只播报本进程授权过的目标；自己刚发出的操作不重复播报。 */
    private onGoalChanged;
    /** 用宿主实时投影同步绑定（轮次/相位/激活）；目标已不存在则撤绑。 */
    private syncTaskGoal;
    /** 自动目标轮里的宿主卡片（计划书 / 提问卡）照发（T16 D5）：这些内容住在
     * tool-call 参数里、不进模型文字流，按节奏静默文字时绝不能把它们一起吞掉，
     * 否则用户只能干等。 */
    private relayGoalRoundCards;
    /** 按节奏回传当轮真实文字（前缀是独立的一行 header，不拼进模型文字里）。 */
    private sendGoalRound;
    /**
     * /stop 的配套：该聊天有已授权且在跑的长任务时把它**暂停**（宿主目标保留、
     * 进度保留，但自动接力不再空转）。返回附在 /stop 回执后的说明；没有可暂停
     * 的目标返回 undefined。
     *
     * T16 D4：一律读宿主**实时**目标再 pause（缓存 revision 可能已过期）；暂停
     * 失败必须如实告知「不能保证停下」，并尽量用公开的 disarm 撤掉自动接力、
     * 同时撤销进程内授权 —— 绝不谎称已停止。
     */
    private pauseTaskGoalForStop;
    private onSessionFlush;
    /** Get (or create) the agent for a chat. */
    private ensureChat;
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
    private revokeTaskGoal;
    private resetChat;
    /** an admin's own private chat (admin defaults apply). */
    private isAdminPrivate;
    /**
     * 是否是管理员本人的私聊——**对模型工具公开的那一面**（T12）。
     *
     * 隐私类工具（私聊历史等）用它做入口闸门：群聊、好友私聊、陌生人私聊都不算，
     * 于是「群友让列一下主人的好友 / 拉一段私聊」在没有显式授权时根本走不通。
     * @param chatId - 对话 id（`private:<qq>` / `group:<群号>`）。
     * @returns 管理员私聊为 true。
     */
    isAdminPrivateChat(chatId: string): boolean;
    /** switch a NEW session to its configured host permission preset —
     * an admin's private chat uses config.adminPermission, every other session
     * (non-admin private chats and all group chats) uses config.memberPermission
     * — through the same host /permission command the user would type, so the
     * host stays the only authority. An empty preset leaves the host default
     * untouched (a group has ONE session, so the admin's own words in a group
     * ride that group session's preset too). A failed switch only logs. */
    private applyDefaultPermission;
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
    private installChannelScope;
    /**
     * 平台段文本的**唯一实现**：提示词注册（installChannelScope）与指纹
     * （{@link platformPromptText}）共用，不两处各算一遍。
     *
     * 纯函数式：同样的配置 + 同样的运行时依赖 → 同样的文本（指纹的稳定性依赖这一点）。
     * 输出协议说明**只给启用了协议的那个聊天加**（{@link protocolEnabledFor}）：
     * 未启用时平台段一个字都不多。
     */
    private composePlatformPrompt;
    /**
     * 这个聊天的平台段文本（order 90 那段），供人设指纹用：平台段变了 → 指纹变 →
     * 下一回合换新会话。与真实注册进 agent 的文本是同一次计算，不会漂移。
     *
     * 同一状态重复调用结果恒定（调用方按稳定性做指纹）。
     */
    platformPromptText(chatId: ChatId): string;
    /** 按一个聊天算能力（会话类型 + 关系档 + 当前进程的运行时依赖）。 */
    private resolveChatCapabilities;
    /** 能力相关的配置（全局 deny + 四个按关系 deny + 四个 grant；缺省一律空 = 现状）。 */
    private capabilityConfig;
    /**
     * 这个**会话**的关系档（T11 的能力视角，与逐条消息的关系绸标不是一回事）：
     * 群聊恒 'groupMember'（一个群只有一个会话，看不到具体发言人，所以群里主人
     * 发言也按群友档），私聊按名单分 owner / friend / stranger。
     */
    private chatRelation;
    /** 当前进程里实际具备的能力运行时依赖（表情包库 / 记忆文件 / 语音合成）。 */
    private availableCapabilityDeps;
    /**
     * 能力摘要（/doctor 与设置页概览共用）：`enabled` / `disabled` 按**主人私聊**
     * 视角（权限最高的一类会话，缺什么就是配置层真关了什么），`byRelation` 给出
     * 主人 / 好友 / 群友 / 陌生人四个档各自的已开数。
     */
    capabilitySummary(): CapabilitySummary;
    /** Start the NapCat typing indicator (private chats only). */
    private startTyping;
    /** Stop the typing indicator. */
    private stopTyping;
}
export { OneBotNotConnectedError, OneBotActionError } from './connection.js';
