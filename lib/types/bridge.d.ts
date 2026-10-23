import type { BridgeDeps } from './bridge-types.js';
import { type CapabilitySummary } from './capabilities.js';
import type { ChatId } from './chat.js';
import type { ScheduledPrompt } from './companion/index.js';
import type { OneBotEvent } from './connection.js';
import { type OutboundSegment, type SendOptions } from './outbound.js';
import { type TraceStage } from './trace.js';
export * from './bridge-types.js';
/** the queue notice sent to a chat when a message arrives while its
 * task is running under the default 'queue' policy — at most ONE per running
 * turn (the flag resets at turn/end) so a burst of queued messages never
 * spams the chat. Exported for the deterministic text wait in tests. */
export declare const QUEUE_NOTICE_TEXT = "\u23F3 \u5F53\u524D\u4EFB\u52A1\u8FD0\u884C\u4E2D\uFF0C\u65B0\u6D88\u606F\u5DF2\u6392\u961F\uFF0C\u5C06\u5728\u5F53\u524D\u4EFB\u52A1\u7ED3\u675F\u540E\u4F9D\u6B21\u5904\u7406\u3002";
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
    /** chats that already got the QUEUE_NOTICE_TEXT for their current
     * running turn (one notice per turn; cleared at turn/end and on chat
     * removal — bounded by the chat population). */
    private readonly queueNoticeChats;
    /** chats that already sent their one sticker in the running turn
     * (cleared at turn/start and on chat removal). */
    private readonly stickerSentChats;
    /** 最近见过的消息 id（每 chat 一个内存 LRU，见 reply-quote.ts）：
     * 入站消息（含只进群上下文、没 @ 她的）与她自己的发送 id 都在里面；
     * 引用标记与 qq_send_* 的 reply_to 只能引用集合里的 id。 */
    private readonly seenMessageIds;
    private stopping;
    /** companion behavior (session renewal, pass marker, wake-up texts). */
    private readonly companion;
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
    handleInbound(event: OneBotEvent): Promise<void>;
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
    private onSessionFlush;
    /** Get (or create) the agent for a chat. */
    private ensureChat;
    /**
     * /new: the registry disposes the agent and retires its session id so the
     * next inbound message creates a brand-new session (fresh history; the old
     * conversation stays on disk). The confirmation is sent directly through
     * the outbound pipeline since no agent is left to reply.
     */
    private resetChat;
    /** an admin's own private chat (admin defaults apply). */
    private isAdminPrivate;
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
    /** 按一个聊天算能力（会话类型 + 管理员私聊 + 当前进程的运行时依赖）。 */
    private resolveChatCapabilities;
    /** 当前进程里实际具备的能力运行时依赖（表情包库 / 记忆文件）。 */
    private availableCapabilityDeps;
    /**
     * 能力摘要（/doctor 与设置页概览共用）：按**管理员私聊**视角计算——主人自己
     * 的私聊已经是权限最高的一类会话，缺什么就是配置层真的关了什么。
     */
    capabilitySummary(): CapabilitySummary;
    /** Start the NapCat typing indicator (private chats only). */
    private startTyping;
    /** Stop the typing indicator. */
    private stopTyping;
}
export { OneBotNotConnectedError, OneBotActionError } from './connection.js';
