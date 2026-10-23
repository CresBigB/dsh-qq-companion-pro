/**
 * The chat↔agent bridge: one Agent per QQ chat, inbound message pipeline
 * (policy → parse → media → STT → quote/forward expansion → followup),
 * outbound delivery driven by session events (assistant/message, turn/end),
 * typing indicator, per-chat send ordering, and chat→session mapping
 * persistence for restart resume.
 * @module dsh-qq-companion/bridge
 */
import { realpath } from 'node:fs/promises';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { resolveCapabilities, summarizeCapabilities } from './capabilities.js';
import { relayHostCards } from './card-relay.js';
import { buildChatId, classifyUserRole, groupAllowed, sanitizeMessageId, splitChatId } from './chat.js';
import { STEER_ACCEPTED_NOTICE, tryHandleCommand as routeCommand } from './commands.js';
import { CompanionHooks, PROACTIVE_PASS } from './companion/index.js';
import { DEFAULT_DEFERRED_TIMEOUT_MS, DeferredDelivery } from './deferred.js';
import { describeError, errorStack } from './errors.js';
import { exportDiagnostics, healthReport } from './health.js';
import { InboundPipeline, normalizeOneBot11 } from './inbound.js';
import { InterimTracker } from './interim.js';
import { OutboundPipeline } from './outbound.js';
import { parseControlBlock, parseReplyPass } from './output-protocol.js';
import { buildPlatformPrompt } from './prompt.js';
import { FailureRefRegistry, failureRefSuffix } from './ref.js';
import { ChatRegistry } from './registry.js';
import { stripRelationPrefix } from './relation.js';
import { parseLeadingQuote, SELF_QUOTE_TOKEN, SeenMessageIds } from './reply-quote.js';
import { registerStickerTools } from './sticker-tools.js';
import { registerMemoryNoteTool, registerTools } from './tools.js';
import { currentTrace, newTraceId, runWithTrace, TRACE_REASONS } from './trace.js';
export * from './bridge-types.js';
/** the queue notice sent to a chat when a message arrives while its
 * task is running under the default 'queue' policy — at most ONE per running
 * turn (the flag resets at turn/end) so a burst of queued messages never
 * spams the chat. Exported for the deterministic text wait in tests. */
export const QUEUE_NOTICE_TEXT = '⏳ 当前任务运行中，新消息已排队，将在当前任务结束后依次处理。';
/**
 * Bridge between OneBot events and dsh agents. Create via the constructor and
 * call start() from the plugin's effect; call stop() on disposal.
 */
export class ChatBridge {
    deps;
    /** Outbound pipeline: the same-name bridge methods below delegate here. */
    outbound;
    /** The chat↔session registry: chats/bySession dual index, the
     * persistence pair, per-chat settings and the create/resume assembly. */
    registry;
    /** Inbound pipeline: normalizeOneBot11 + the policy→media→quote→
     * dispatch path; the same-name bridge methods below delegate here. */
    inbound;
    /** Interim domain: the assistant/message interim routing, the
     * per-message recall timers and the turn/end settlement. */
    interim;
    /** the deferred-delivery tracker (超时补发) — timeout timers, the
     * JSONL registry, bounded send retries and restart recovery. */
    deferred;
    /** the bounded registry of recent fault references — every minted
     * QQ-CONN-/MF- number is recorded here for the /doctor report and the
     * diagnostics archive file name. */
    failureRefs = new FailureRefRegistry();
    /** Live registry indexes — the inbound/outbound/interim/turn links keep
     * reading them through these same-name views. */
    get chats() { return this.registry.chats; }
    get bySession() { return this.registry.bySession; }
    sessionEventOff;
    sessionFlushOff;
    /** chat-level traceId association table — session events arrive on a
     * different async chain than the inbound pipeline, so dispatchFollowup
     * records the initiating traceId per chat here and onSessionEvent reads it
     * back (agent 回复事件归属发起 traceId). Last dispatch wins; entries are
     * dropped when the chat is removed. Not cleared at turn/end: the interim
     * settle loop sends the final reply AFTER turn/end, and clearing there
     * would orphan exactly that reply's outbound events. One entry per chat
     * id (bounded by the chat population), so growth is not a concern. */
    traceByChat = new Map();
    /** chats that already got the QUEUE_NOTICE_TEXT for their current
     * running turn (one notice per turn; cleared at turn/end and on chat
     * removal — bounded by the chat population). */
    queueNoticeChats = new Set();
    /** chats that already sent their one sticker in the running turn
     * (cleared at turn/start and on chat removal). */
    stickerSentChats = new Set();
    /** 最近见过的消息 id（每 chat 一个内存 LRU，见 reply-quote.ts）：
     * 入站消息（含只进群上下文、没 @ 她的）与她自己的发送 id 都在里面；
     * 引用标记与 qq_send_* 的 reply_to 只能引用集合里的 id。 */
    seenMessageIds = new SeenMessageIds();
    stopping = false;
    /** companion behavior (session renewal, pass marker, wake-up texts). */
    companion;
    constructor(deps) {
        this.deps = deps;
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
                this.stopTyping(chat);
                this.traceByChat.delete(chat.chatId);
                this.queueNoticeChats.delete(chat.chatId);
                this.stickerSentChats.delete(chat.chatId);
                this.seenMessageIds.forget(chat.chatId);
            },
            installChannelScope: (agentCtx, chatId) => this.installChannelScope(agentCtx, chatId),
            isAdminPrivate: chatId => this.isAdminPrivate(chatId),
            onSessionCreated: chat => this.applyDefaultPermission(chat),
        });
        this.companion = new CompanionHooks({
            config: deps.config,
            ...(deps.activity !== undefined ? { activity: deps.activity } : {}),
            log: (level, message) => deps.log(level, message),
            resetChat: chatId => this.registry.resetChat(chatId),
            adminUsers: () => this.deps.policy.adminUsers,
        });
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
            noteSentId: (chatId, messageId) => { this.seenMessageIds.noteSelf(chatId, messageId); },
            ...(deps.typingPacer !== undefined ? { typingPacer: deps.typingPacer } : {}),
            // outbound decision events ride the chat's initiating traceId; a
            // write with no mapped trace (proactive tool sends) starts a fresh one.
            trace: (chatId, event) => this.traceChat(chatId, event),
        });
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
            noteSeenMessage: (chatId, messageId) => { this.seenMessageIds.noteInbound(chatId, messageId); },
            dispatchFollowup: (chatId, text, role, nickname, messageId) => this.dispatchFollowup(chatId, text, role, nickname, { messageId }),
            interceptBusyTurn: (chatId, text, role, nickname, plain, messageId) => this.interceptBusyTurn(chatId, text, role, nickname, plain, messageId),
            ...(deps.groupChatter !== undefined ? { groupChatter: deps.groupChatter } : {}),
            ...(deps.stickers !== undefined ? { stickers: deps.stickers } : {}),
            sendToChat: (chatId, text) => this.sendToChat(chatId, text),
            log: (level, message) => this.deps.log(level, message),
            config: deps.config,
        });
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
        });
        this.deferred = new DeferredDelivery({
            sendToChat: (chatId, text, options) => this.sendToChat(chatId, text, options),
            isTurnRunning: chatId => this.chats.get(chatId)?.agent.status === 'running',
            takePendingText: chatId => {
                const chat = this.chats.get(chatId);
                if (chat === undefined || chat.loopPending === null)
                    return null;
                const text = chat.loopPending;
                chat.loopPending = null;
                return text;
            },
            traceIdFor: chatId => this.traceByChat.get(chatId),
            log: (level, message) => this.deps.log(level, message),
            trace: (chatId, event) => this.traceChat(chatId, event),
            mediaDir: deps.config.mediaDir,
            timeoutMs: deps.config.deferredTimeoutMs ?? DEFAULT_DEFERRED_TIMEOUT_MS,
            isStopping: () => this.stopping,
        });
    }
    /** Start listening: wire connection handlers and the session event feed. */
    start() {
        const { connection, ctx: sessionEvents } = this.deps;
        connection.selfId = this.deps.config.botQQ;
        this.sessionEventOff = sessionEvents.on('session/event', (session, event) => {
            this.onSessionEvent(session, event);
        });
        this.sessionFlushOff = sessionEvents.on('session/flush', (session) => {
            void this.onSessionFlush(session);
        });
        connection.onStatus = (connected) => {
            this.deps.log(connected ? 'info' : 'warn', 'OneBot ' + (connected ? 'connected' : 'disconnected'));
            if (connected)
                this.outbound.drainPendingSends();
        };
        // Wait for the loader's complete application (model selection, settings,
        // persistence) before anything reads the default model.
        this.registry.mappingLoaded = Promise.resolve(this.deps.hostReady?.()).then(async () => {
            await this.outbound.loadPending();
            await this.registry.loadPresetOverrides();
            await this.registry.loadRetired();
            await this.registry.loadSwitchable();
            await this.registry.loadMapping();
            // restore deferred-delivery tracking（未完结条目在该会话的
            // 下一次 turn/end 兑现；损坏行降级跳过）。
            await this.deferred.loadPersisted();
        }).then(() => {
            if (this.stopping)
                return;
            this.deps.log('info', 'bridge ready (' + this.registry.chats.size + ' resumed chat(s))');
        });
    }
    /** Stop everything: dispose agents, save mapping, cancel timers. */
    async stop() {
        this.stopping = true;
        if (this.sessionEventOff !== undefined) {
            this.sessionEventOff();
            this.sessionEventOff = undefined;
        }
        if (this.sessionFlushOff !== undefined) {
            this.sessionFlushOff();
            this.sessionFlushOff = undefined;
        }
        await this.registry.stop();
        // disarm the deferred silent-wait timers（pending 条目已落盘，
        // 重启后 loadPersisted 恢复跟踪续投）。
        this.deferred.stopAll();
    }
    /** One sticker per reply: claim the running turn's slot for a chat. */
    takeStickerSlot(chatId) {
        if (this.stickerSentChats.has(chatId))
            return false;
        this.stickerSentChats.add(chatId);
        return true;
    }
    /** Map an agent session id back to its chat (for model tools). */
    chatForSession(sessionId) {
        return this.bySession.get(sessionId);
    }
    /** Whether a caller backing an agent session may perform file edits. QQ chats
     * require the currently running turn's initiator to be an admin (role frozen
     * from the dispatch queue at turn/start); non-QQ sessions (Web and other
     * channels) are trusted by default. Unknown states fail closed
     * as member. */
    canEditFiles(sessionId) {
        const chatId = this.bySession.get(sessionId);
        if (chatId === undefined)
            return true;
        return this.chats.get(chatId)?.activeTurnRole === 'admin';
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
    async mediaSendRoots(sessionId) {
        const isTurnAdmin = sessionId !== undefined && this.canEditFiles(sessionId);
        const chatId = sessionId !== undefined ? this.bySession.get(sessionId) : undefined;
        const candidates = [this.deps.config.mediaDir];
        if (chatId !== undefined && isTurnAdmin)
            candidates.push(this.registry.effectiveCwd(chatId));
        const roots = [];
        for (const root of candidates) {
            try {
                roots.push(await realpath(root));
            }
            catch {
                roots.push(root); // missing root: kept as-is; the fence skips it (cannot contain anything)
            }
        }
        return { roots, isTurnAdmin };
    }
    /** Whether the connection is usable for sends. */
    get connected() {
        return this.deps.connection.connected;
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
    sendToChat(chatId, text, options = {}) {
        // ① a fabricated transcript continuation never reaches QQ.
        const clean = this.companion.cleanOutgoing(chatId, text);
        // ② the quote directive never reaches QQ; it may become a reply segment.
        const quoted = parseLeadingQuote(clean);
        // ③ 输出协议 B 档：只有该聊天启用协议时才解析（未启用 = 完全不调用解析器）。
        const parsed = this.protocolEnabledFor(chatId) ? this.readControlBlock(chatId, quoted.body, options.humanize === true) : undefined;
        const body = parsed === undefined ? quoted.body : parsed.body;
        // ④ 输出协议 A 档：整条就是不回应标记 → 不发，但留下痕迹。
        const replyPass = parseReplyPass(body);
        if (replyPass.pass) {
            this.recordReplyPass(chatId, replyPass.reason);
            return Promise.resolve([]);
        }
        const control = parsed === undefined ? undefined : parsed.control;
        // ⑤ 控制块 reply:false —— 与 A 档同一条「不回」路径（why 作原因），什么都不发。
        if (control?.reply === false) {
            this.recordReplyPass(chatId, control.why ?? '', true);
            return Promise.resolve([]);
        }
        // ⑥ empty text: nothing to send（控制块给了 send 分条时正文可以为空）。
        const parts = control?.send;
        if (parts === undefined && body.trim() === '')
            return Promise.resolve([]);
        // ⑦ 引用：控制块的 quote 优先于行首标记；都没有时才走 groupAutoQuote 自动引用。
        const marker = control?.quote !== undefined ? { target: control.quote, body } : quoted.marker;
        const replyTo = options.replyTo ?? this.resolveReplyTarget(chatId, marker, options.humanize === true);
        const next = replyTo === undefined ? options : { ...options, replyTo };
        // ⑧ 控制块生效留痕（reply / send 条数 / quote 有无；why 只进日志与记忆）。
        if (control !== undefined)
            this.recordControlBlock(chatId, control);
        // ⑨ a final reply is recorded for the handoff/diary (non-final texts,
        //    e.g. interim or a deferred 补发, are not chat lines).
        const head = body.trim();
        const queued = parts === undefined ? undefined : (head === '' ? [...parts] : [head, ...parts]);
        if (options.humanize === true)
            this.companion.recordFinalReply(chatId, queued !== undefined ? queued.join('\n') : body);
        if (options.humanize === true && chatId.startsWith('group:'))
            this.deps.groupChatter?.noteSpoke(chatId.slice('group:'.length));
        // ⑩ 控制块给了 send：覆盖自动拆句（第一条 = 控制块之前的正文，如果写了的话），
        //    逐条发送、不走 t2i 长文本卡片。
        if (queued !== undefined)
            return this.outbound.sendToChat(chatId, queued.join('\n'), { ...next, parts: queued });
        return this.outbound.sendToChat(chatId, body, next);
    }
    /**
     * 该聊天是否启用输出协议（B 档）：`protocolMode === 'on'` 且
     * （`protocolChats` 为空 或 包含该 chatId）。**未启用时 `sendToChat` 完全不调用
     * 解析器**——这是「零行为变化」的硬保证，也是提示词只给启用的聊天加说明的依据。
     * @param chatId - the chat to test.
     */
    protocolEnabledFor(chatId) {
        if ((this.deps.config.protocolMode ?? 'off') !== 'on')
            return false;
        const chats = this.deps.config.protocolChats ?? [];
        return chats.length === 0 || chats.includes(chatId);
    }
    /**
     * 记一条「她选择不回」：日志（带原因）、决策 trace（stage='reply'）、今日计数、
     * 活动记录。四处都尽力而为，任何一处缺席都不影响「不发」这个结果。
     * @param chatId - the chat she chose not to answer in.
     * @param reason - 她写的原因（'' = 没说原因）。
     * @param viaControl - true = 来自输出协议 B 档的控制块（reply:false），
     *   日志与 trace 的措辞里带上「控制块」，便于和 A 档标记区分。
     */
    recordReplyPass(chatId, reason, viaControl = false) {
        const described = reason === '' ? '未说明原因' : reason;
        this.deps.log('info', '她选择不回（' + (viaControl ? '控制块 · ' + described : described) + '）：' + chatId);
        // trace 未开启时 traceChat 直接返回，零开销。
        this.traceChat(chatId, { stage: 'reply', ok: true, reason: TRACE_REASONS.replyPass + (viaControl ? '（控制块）' : '') + '：' + described });
        this.deps.sendCounter?.recordPass?.();
        this.companion.recordReplyPass(chatId, reason);
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
    readControlBlock(chatId, text, isFinalReply) {
        const parsed = parseControlBlock(text);
        const attempted = parsed.control !== undefined || parsed.error !== undefined;
        if (isFinalReply || attempted)
            this.deps.sendCounter?.recordProtocolReply?.();
        if (parsed.control !== undefined) {
            this.deps.sendCounter?.recordProtocolParsed?.();
        }
        else if (parsed.error !== undefined) {
            this.deps.sendCounter?.recordProtocolFailed?.();
            this.deps.log('warn', '输出协议控制块解析失败，已整段原样发送: ' + chatId + '（' + parsed.error + '）');
        }
        for (const warning of parsed.warnings ?? [])
            this.deps.log('debug', '输出协议：' + warning + '（' + chatId + '）');
        return parsed;
    }
    /**
     * 控制块生效的决策 trace（stage='outbound'，reason 里带「控制块」字样）。
     * data 只放 reply / send 条数 / quote 有无——why 只进日志与记忆，不塞进 trace。
     * @param chatId - 目标聊天。
     * @param control - 已解析成功的控制块。
     */
    recordControlBlock(chatId, control) {
        this.traceChat(chatId, {
            stage: 'outbound',
            ok: true,
            reason: TRACE_REASONS.controlBlock,
            data: {
                reply: control.reply !== false,
                sends: control.send === undefined ? 0 : control.send.length,
                quote: control.quote !== undefined,
            },
        });
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
    resolveReplyTarget(chatId, marker, humanize) {
        const chat = this.chats.get(chatId);
        if (marker !== null) {
            if (!humanize)
                return undefined;
            const wanted = marker.target === SELF_QUOTE_TOKEN ? (chat?.finalTurnMessageId ?? chat?.activeTurnMessageId) : marker.target;
            if (wanted === undefined || wanted === '' || !this.seenMessageIds.has(chatId, wanted)) {
                this.deps.log('debug', '引用标记里的消息 id 无效，已按不引用发送: ' + chatId + ' id=' + marker.target);
                return undefined;
            }
            return wanted;
        }
        if (!humanize || !chatId.startsWith('group:'))
            return undefined;
        const mode = this.deps.config.groupAutoQuote ?? 'off';
        if (mode === 'off')
            return undefined;
        const trigger = chat?.finalTurnMessageId ?? chat?.activeTurnMessageId;
        if (trigger === undefined || trigger === '')
            return undefined;
        const seq = this.seenMessageIds.seqOf(chatId, trigger);
        if (seq === undefined)
            return undefined;
        // busy: 从触发消息到她回复之间群里又有别人说了话才引用（像真人在热闹群里）。
        if (mode === 'busy' && !this.seenMessageIds.hasInboundAfter(chatId, seq))
            return undefined;
        return trigger;
    }
    /** Whether this chat has actually seen a message id (the reply-quote gate
     * for the qq_send_* reply_to argument). */
    hasSeenMessage(chatId, messageId) {
        return this.seenMessageIds.has(chatId, messageId);
    }
    /** A group left the allowlist: retire its session so that, if it is ever
     * allowed again, it starts fresh under the current preset. */
    async retireGroup(groupId) {
        await this.registry.mappingLoaded;
        if (await this.registry.retireChat(('group:' + groupId))) {
            this.deps.log('info', '群 ' + groupId + ' 已不在白名单，旧会话已退休');
        }
    }
    /** Session ids some chat still uses (old-session cleanup never deletes these). */
    sessionIdsInUse() {
        return this.registry.sessionIdsInUse();
    }
    /** 设置页概览用：live 会话 + 映射里已知的聊天（只读，不触发 IO）。 */
    chatSnapshot() {
        return this.registry.chatSnapshot();
    }
    /** 设置页概览用：宿主 sessionTitle 里该聊天的当前标题（聊天不 live / 服务缺席 /
     *  取数失败一律 undefined；绝不抛错）。 */
    sessionTitleOf(chatId) {
        try {
            const chat = this.chats.get(chatId);
            if (chat === undefined)
                return undefined;
            const service = this.deps.sessionTitle?.();
            if (service === undefined || service === null || typeof service.get !== 'function')
                return undefined;
            const title = service.get(chat.agent.session)?.title;
            return typeof title === 'string' && title !== '' ? title : undefined;
        }
        catch {
            return undefined;
        }
    }
    /** A session's logs were deleted by the old-session cleanup. */
    forgetSession(sessionId) {
        this.registry.forgetSession(sessionId);
    }
    /** On startup: retire sessions of groups that are no longer allowed (the
     * allowlist may have changed in the config while dsh was down). */
    async retireDisallowedGroups() {
        await this.registry.mappingLoaded;
        const policy = this.deps.policy;
        if (policy.groupPolicy === 'open')
            return;
        for (const chatId of this.registry.knownChatIds()) {
            if (!chatId.startsWith('group:'))
                continue;
            const groupId = chatId.slice('group:'.length);
            if (policy.groupPolicy === 'allowlist' && policy.groupAllowFrom.includes(groupId))
                continue;
            await this.retireGroup(groupId);
        }
    }
    /** one proactive wake-up in the owner's chat. She decides
     * whether to write; replying exactly PROACTIVE_PASS sends nothing. */
    async fireCheckin(chatId, context) {
        await this.dispatchFollowup(chatId, this.companion.checkinText(context), 'admin', undefined, { scheduled: true });
    }
    /** One periodic look at a group (she decides herself whether to chip in;
     * the pass marker sends nothing). Skipped while the group's turn is busy. */
    async firePeek(groupId) {
        const chatter = this.deps.groupChatter;
        const chatId = ('group:' + groupId);
        if (chatter === undefined || this.chats.get(chatId)?.busy === true)
            return;
        if (!groupAllowed(groupId, this.deps.policy))
            return;
        const text = chatter.takePeek(groupId, PROACTIVE_PASS);
        if (text === '')
            return;
        this.deps.log('info', '看一眼群聊: ' + chatId);
        await this.dispatchFollowup(chatId, text, 'member', undefined, { scheduled: true });
    }
    /** run one scheduled prompt (diary, proactive check-ins) as
     * an admin turn in its chat. Never idle-resets: the diary must see the
     * day's session. */
    async fireScheduled(prompt) {
        await this.dispatchFollowup(prompt.chatId, this.companion.scheduledText(prompt), 'admin', undefined, { scheduled: true });
    }
    /**
     * Send raw OneBot segments (used by the media tools).
     * @param chatId - target chat.
     * @param segments - outbound segments.
     * @param options - optional reply target (the tool's reply_to argument).
     * @returns the sent message id.
     */
    sendSegments(chatId, segments, options = {}) {
        return this.outbound.sendSegments(chatId, segments, options);
    }
    // ------------------------------------------------------------ inbound
    /**
     * Inbound OneBot message event → agent turn. All policy and media work is
     * contained: a failure here logs and drops the message, never the host.
     * the whole inbound chain runs inside one trace scope (ALS), so every
     * pipeline decision point can attribute its event to this message's
     * traceId; tracing off = no scope.
     */
    async handleInbound(event) {
        const scope = this.beginInboundTrace(event);
        try {
            await runWithTrace(scope, async () => {
                if (this.stopping) {
                    this.deps.log('debug', '插件停止中，入站消息丢弃');
                    scope?.emit('inbound', { ok: false, reason: TRACE_REASONS.inboundStopping });
                    return;
                }
                const inbound = normalizeOneBot11(event);
                if (inbound === null) {
                    this.deps.log('debug', '非聊天消息事件，不处理（post_type=' + String(event.post_type) + '）');
                    scope?.emit('normalize', { ok: false, reason: TRACE_REASONS.inboundNotChat });
                    return;
                }
                await this.inbound.processInbound(inbound);
            });
        }
        catch (error) {
            scope?.emit('dispatch', { ok: false, reason: '入站处理失败: ' + describeError(error) });
            this.deps.log('error', 'inbound handling failed: ' + describeError(error) + errorStack(error));
        }
    }
    /** mint the inbound traceId + scope and record the first (收到消息)
     * event; undefined when tracing is off. */
    beginInboundTrace(event) {
        const sink = this.deps.config.trace;
        if (sink === undefined || !sink.enabled)
            return undefined;
        const kind = event.message_type === 'group' ? 'group' : event.message_type === 'private' ? 'private' : undefined;
        const chatId = kind !== undefined
            ? buildChatId(kind, String(kind === 'group' ? event.group_id ?? '' : event.user_id ?? ''))
            : '';
        const messageId = event.message_id === undefined || event.message_id === null ? undefined : String(event.message_id);
        const traceId = newTraceId(sink.now());
        const scope = sink.scope(traceId, chatId, messageId);
        sink.emit({ traceId: scope.traceId, stage: 'inbound', ok: true, chatId, messageId, data: { messageType: String(event.message_type ?? '') } });
        return scope;
    }
    /** Feed one user message into a chat's agent (create on demand). Records
     * the base text for /retry, queues the initiator's turn role and the
     * message that triggered it, and applies per-chat /goal + /plan prefixes. */
    async dispatchFollowup(chatId, text, role, nickname, internal) {
        // companion: idle / periodic session renewal + handoff, activity record.
        text = await this.companion.beforeUserTurn(chatId, text, plainUserText(text), nickname ?? '', internal?.scheduled === true);
        const final = this.prefixTurn(chatId, text);
        const fallback = this.chats.get(chatId)?.lastNickname ?? '';
        const chat = await this.ensureChat(chatId, nickname ?? fallback);
        if (nickname !== undefined && nickname !== '')
            chat.lastNickname = nickname;
        chat.lastFollowup = text;
        chat.lastActivityAt = Date.now();
        // a dispatched user turn starts a fresh interim cycle (the
        // inbound residue reset already cleared the loop fields directly).
        this.interim.onNewUserTurn(chat);
        // Queue this turn's initiator role; the host's turn/start freezes it as
        // the running turn's role. Push and followup happen synchronously,
        // so the role cannot interleave with another dispatch.
        chat.pendingTurnRoles.push(role);
        // The triggering inbound message id rides the same FIFO: turn/start
        // freezes it as this turn's quote target (see reply-quote.ts).
        const triggerId = internal?.messageId !== undefined ? sanitizeMessageId(internal.messageId) : '';
        chat.pendingTurnMessageIds.push(triggerId === '' ? undefined : triggerId);
        // no message text in the host log (it is the system journal).
        this.deps.log('info', 'followup from ' + chatId + ' (' + final.length + ' chars)');
        // Plugin-originated user message: the session log attributes QQ inbound
        // messages to this plugin's own producer-owned source kind, keeping them
        // distinguishable from host/web UI inputs.
        chat.agent.followup(createUserMessage({
            content: [{ type: 'text', text: final }],
            source: { kind: 'plugin:qq-companion' },
        }));
        // cross-stream join: the turn's session events arrive on a different
        // async chain, so record this dispatch's traceId per chat for
        // onSessionEvent to pick up (runs inside the inbound ALS scope — command
        // dispatches reach here through the same await chain).
        const trace = currentTrace();
        if (trace !== undefined) {
            this.traceByChat.set(chatId, trace.traceId);
            trace.emit('dispatch', { ok: true, reason: '消息已投递给模型' });
        }
        this.startTyping(chat);
    }
    /** Prepend per-chat context directives (/goal reminder) to a turn's user
     * text. Plan mode is host-owned now (/plan forwards to the host command),
     * so the agent's own plan-mode instruction section governs planning. */
    prefixTurn(chatId, text) {
        let out = text;
        const goal = this.registry.getSettings(chatId).goal;
        if (goal !== undefined && goal.trim() !== '') {
            out = '【当前目标】' + goal + '\n' + out;
        }
        return out.trim();
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
    tryHandleCommand(chatId, text, userId, nickname) {
        return routeCommand(this.commandCtx, chatId, text, userId, nickname);
    }
    /**
     * The CommandContext handed to the command table: exposes exactly
     * the bridge capabilities the routed commands use, resolved live per
     * invocation (the llm catalog especially must stay a live service lookup).
     */
    get commandCtx() {
        const bridge = this;
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
                bridge.registry.getSettings(chatId).workspacePath = path;
                bridge.registry.noteWorkspaceOverride(chatId);
                bridge.registry.saveMappingDebounced();
            },
            presetOverride: chatId => bridge.registry.getSettings(chatId).presetOverride,
            setPresetOverride: (chatId, id) => { bridge.registry.setPresetOverride(chatId, id); },
            hasPresetOverride: chatId => bridge.registry.getSettings(chatId).presetOverride !== undefined,
            // /goal persists with the chat mapping (debounced).
            goal: chatId => bridge.registry.getSettings(chatId).goal,
            setGoal: (chatId, value) => { bridge.registry.getSettings(chatId).goal = value; bridge.registry.saveMappingDebounced(); },
            deleteGoal: chatId => { bridge.registry.getSettings(chatId).goal = undefined; bridge.registry.saveMappingDebounced(); },
            // pending serial-number selection snapshot (lazy TTL lives in commands).
            pendingSelection: chatId => bridge.registry.getSettings(chatId).pendingSelection,
            setPendingSelection: (chatId, value) => { bridge.registry.getSettings(chatId).pendingSelection = value; },
            // /session: the per-chat switchable history and the switch itself.
            switchableSessions: chatId => bridge.registry.switchableSessions(chatId),
            switchSession: (chatId, targetSessionId) => bridge.registry.switchSession(chatId, targetSessionId),
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
            config: { interimMessages: bridge.deps.config.interimMessages, maxImageBytes: bridge.deps.config.maxImageBytes, unknownCommand: bridge.deps.config.unknownCommand },
        };
    }
    /**
     * Build the message body text: placeholders become annotated local paths
     * (images/voices/videos) and voice files are transcribed when enabled.
     */
    buildBody(text, media, chatId) {
        return this.inbound.buildBody(text, media, chatId);
    }
    /** the single agent.steer write point — one createUserMessage with
     * the producer-owned source kind (the session-v4 guard counts the source
     * write points; this and dispatchFollowup are the only two). Shared by the
     * 'steer' policy and /steer.
     * Returns false when the chat has no live agent (nothing was steered). */
    steerMessage(chatId, text) {
        const chat = this.chats.get(chatId);
        if (chat === undefined)
            return false;
        chat.agent.steer(createUserMessage({
            content: [{ type: 'text', text }],
            source: { kind: 'plugin:qq-companion' },
        }));
        return true;
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
    async interceptBusyTurn(chatId, text, role, nickname, plain, messageId) {
        const chat = this.chats.get(chatId);
        if (chat === undefined || chat.agent.status !== 'running')
            return false;
        // The non-admin relation-banner soft limit ([关系:…], see
        // src/relation.ts) is never widened by the steer policy: restricted
        // senders' messages queue like everyone else's media. The condition
        // mirrors the relation-banner application in the inbound pipeline
        // (non-admin + restrictedMemberPrefix — group members and non-admin
        // private chats alike).
        const restricted = role !== 'admin' && this.deps.config.restrictedMemberPrefix;
        // auto-steer eligibility — 'admin' (default) = admins only; 'all' =
        // anyone. Restricted members stay excluded under both; /steer remains
        // admin-only regardless of this knob; queue mode is untouched.
        const autoSteerAllowed = (this.deps.config.autoSteerPolicy ?? 'admin') === 'all' || role === 'admin';
        if ((this.deps.config.newMessagePolicy ?? 'queue') === 'steer' && plain && !restricted && autoSteerAllowed) {
            this.steerMessage(chatId, text);
            currentTrace()?.emit('dispatch', { ok: true, reason: TRACE_REASONS.busyTurnSteered });
            this.sendToChat(chatId, STEER_ACCEPTED_NOTICE).catch((error) => {
                this.deps.log('debug', '插话提交提示发送失败: ' + describeError(error));
                currentTrace()?.emit('notice', { ok: false, reason: '插话提交提示发送失败: ' + describeError(error) });
            });
            return true;
        }
        await this.dispatchFollowup(chatId, text, role, nickname, { messageId });
        currentTrace()?.emit('dispatch', { ok: true, reason: TRACE_REASONS.busyTurnQueued });
        if (!this.queueNoticeChats.has(chatId)) {
            this.queueNoticeChats.add(chatId);
            this.sendToChat(chatId, QUEUE_NOTICE_TEXT).catch((error) => {
                this.deps.log('debug', '排队提示发送失败: ' + describeError(error));
                currentTrace()?.emit('notice', { ok: false, reason: '排队提示发送失败: ' + describeError(error) });
            });
        }
        return true;
    }
    /** Expand a quoted (reply) message into [引用] text via get_msg. */
    expandQuote(messageId, chatId) {
        return this.inbound.expandQuote(messageId, chatId);
    }
    /**
     * Open one message of this chat by id (qq_open_message): images fetched,
     * voice transcribed, forwards expanded — like a quote. Only a message that
     * belongs to this chat opens (a group never reads another group's).
     */
    async openMessage(messageId, chatId) {
        const data = await this.call('get_msg', { message_id: Number(messageId) });
        const { kind, target } = splitChatId(chatId);
        const sameChat = kind === 'group' ? String(data?.group_id ?? '') === target : data?.message_type !== 'group';
        if (!sameChat)
            throw new Error('这条消息不在当前会话里，打不开');
        const text = await this.inbound.expandQuote(messageId, chatId);
        if (text === '')
            throw new Error('这条消息取不到了（可能太久远或已撤回）');
        return text.replace(/^\[引用\]/, '');
    }
    // ------------------------------------------------------------ outbound
    /** Send [[qq_forward]] nodes as a merged-forward message. */
    async sendForward(chatId, nodes) {
        return this.outbound.sendForward(chatId, nodes);
    }
    /** One OneBot action. */
    call(action, params) {
        return this.deps.connection.call(action, params);
    }
    /** emit one outbound/deferred decision event for a chat: it rides the
     * chat's initiating traceId; a write with no mapped trace (proactive tool
     * sends) starts a fresh one. No-op with tracing off. */
    traceChat(chatId, event) {
        const sink = this.deps.config.trace;
        if (sink === undefined || !sink.enabled)
            return;
        sink.emit({ traceId: this.traceByChat.get(chatId) ?? newTraceId(sink.now()), chatId, ...event });
    }
    // ------------------------------------------------------------ health
    /** The health deps the /doctor command renders from (resolved live). */
    healthDeps() {
        const conn = this.deps.connection;
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
            configSnapshot: this.deps.configSnapshot?.() ?? {},
            // the recent fault references for the report section.
            failureRefs: () => this.failureRefs.recent(),
            ...(this.deps.companionStatus !== undefined ? { companion: this.deps.companionStatus } : {}),
            log: (level, message) => this.deps.log(level, message),
        };
    }
    /** /doctor: render the health summary. */
    async buildHealthReport() {
        return healthReport(this.healthDeps());
    }
    /** /doctor export: pack the redacted diagnostics archive. the
     * file name carries the trigger reference — the explicit command argument,
     * or the most recent recorded fault reference when omitted. */
    async exportDiagnosticsPackage(triggerRef) {
        const deps = this.healthDeps();
        return exportDiagnostics({ ...deps, triggerRef: triggerRef ?? this.failureRefs.recent(1)[0]?.ref });
    }
    // ------------------------------------------------------------ session events
    onSessionEvent(session, event) {
        if (this.stopping)
            return;
        const chatId = this.bySession.get(session.id);
        if (chatId === undefined) {
            // non-QQ sessions (web/host) ride this same bus;
            // keep the early exit visible at debug without emitting any trace.
            this.deps.log('debug', 'session 事件早退：无 chat 映射（session=' + session.id + ' type=' + String(event.type) + '）');
            return;
        }
        const chat = this.chats.get(chatId);
        if (chat === undefined || chat.sessionId !== session.id)
            return;
        const trace = this.traceForChat(chatId);
        if (event.type === 'turn/start') {
            trace?.emit('agent', { ok: true, reason: '模型回合开始' });
            // a new turn begins — prune the previous turn's recalled-id
            // residue (see InterimTracker.onTurnStart for the safety analysis).
            this.interim.onTurnStart(chat);
            // Freeze the running turn's initiator role from the dispatch FIFO
            //: turns the plugin did not dispatch (host/web input) find an
            // empty queue and fail closed as member.
            chat.activeTurnRole = chat.pendingTurnRoles.shift() ?? 'member';
            // the message this turn answers becomes its quote target for the final
            // reply (auto-quote / [引用:这条]); turns with no plugin dispatch leave
            // it undefined and never auto-quote.
            chat.activeTurnMessageId = chat.pendingTurnMessageIds.shift();
            chat.lastActivityAt = Date.now();
            chat.busy = true;
            this.stickerSentChats.delete(chatId);
            // arm the deferred silent-wait window for this turn（每次模型
            // 输出重置；turn/end 解除；deferredTimeoutMs<=0 时为 no-op）。
            this.deferred.onTurnStart(chatId, session.id);
            return;
        }
        if (event.type === 'assistant/message') {
            // a deferred-registered (timed-out) turn is muted — its text
            // messages are captured for the final补发 only（不插播 interim、不转
            // 审批/提问卡：超时后只补最终文字与终态通知）。
            if (this.deferred.onAssistantMessage(chatId, session.id, event.data.message))
                return;
            this.interim.onAssistantMessage(chatId, chat, event.data.message);
            return;
        }
        if (event.type === 'turn/end') {
            const reason = event.data.reason;
            // the final reply of this turn goes out AFTER turn/end (and possibly
            // after the next turn already started): freeze this turn's quote target
            // now so a queued next turn cannot steal it.
            chat.finalTurnMessageId = chat.activeTurnMessageId;
            // a message-turn fault mints ONE MF- reference before any
            // consumer runs — the trace event (data.ref), the structured log line,
            // the ⚠️ notice tail and the deferred terminal text all carry the same
            // number. Normal (completed/cancelled) turns mint nothing.
            const errorRef = reason.kind === 'error'
                ? this.mintFailureRef('msg', 'agent', '模型回合出错: ' + reason.error.message, { chatId })
                : undefined;
            // complete a deferred entry（补发异步进行）；true = the turn was
            // under deferred tracking — the terminal-state notice rides the补发
            // path, so the normal error notice below is suppressed（同一故障不双发）.
            const deferredTracked = this.deferred.onTurnEnd(chatId, session.id, reason, errorRef);
            this.interim.onTurnEnd(chatId, chat);
            // An error's ok:false agent event was emitted by mintFailureRef above.
            if (reason.kind !== 'error')
                trace?.emit('agent', { ok: true, reason: '模型回合结束（' + reason.kind + '）' });
            if (reason.kind === 'error') {
                const message = reason.error.message;
                // A session-log collision heals itself (a deferred turn's terminal
                // notice rides the 补发 path, so it heals too).
                if ((this.deps.config.sendErrorNotice || deferredTracked)
                    && /persisted log on disk that does not match this live session|id collision/i.test(message)) {
                    void this.registry.healSessionCollision(chatId);
                }
                if (!deferredTracked && this.deps.config.sendErrorNotice) {
                    this.sendErrorNotice(chatId, message + failureRefSuffix(errorRef), trace);
                }
            }
            this.stopTyping(chat);
            chat.lastActivityAt = Date.now();
            chat.busy = false;
            // the turn that armed the queue notice is over — a later
            // running turn notifies again.
            this.queueNoticeChats.delete(chatId);
            this.deps.log('info', 'turn/end for ' + chatId + ': ' + event.data.reason.kind);
            // Durable: flush the session so a later restart can resume it.
            void this.deps.sessions.flush(chat.agent.session).catch((error) => {
                this.deps.log('warn', 'session flush failed: ' + String(error));
                trace?.emit('notice', { ok: false, reason: '会话落盘失败: ' + String(error) });
            });
            this.registry.saveMappingDebounced();
        }
    }
    /** A failed turn's notice goes to the owner only: in their own private
     * chat it is shown there; a failure in a group or someone else's private
     * chat is reported to the owner privately, never shown to other people. */
    sendErrorNotice(chatId, detail, trace) {
        const ref = splitChatId(chatId);
        const targets = this.isAdminPrivate(chatId)
            ? [{ chat: chatId, text: '⚠️ 运行出错：' + detail }]
            : this.deps.policy.adminUsers.map(admin => ({
                chat: buildChatId('private', admin),
                text: '⚠️ ' + (ref.kind === 'group' ? '群 ' + ref.target : '和 ' + ref.target + ' 的私聊') + ' 里运行出错：' + detail,
            }));
        for (const target of targets) {
            this.sendToChat(target.chat, target.text, { queuable: true }).catch((error) => {
                this.deps.log('debug', '错误通知发送失败: ' + describeError(error));
                trace?.emit('notice', { ok: false, reason: TRACE_REASONS.noticeErrorSendFailed });
            });
        }
    }
    /** the trace scope for one chat's session events, resolved through the
     * chat-level association table; undefined when tracing is off or the chat
     * has no recorded dispatch (host-initiated turns stay untraced). */
    traceForChat(chatId) {
        const sink = this.deps.config.trace;
        if (sink === undefined || !sink.enabled)
            return undefined;
        const traceId = this.traceByChat.get(chatId);
        return traceId !== undefined ? sink.scope(traceId, chatId) : undefined;
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
    mintFailureRef(kind, stage, detail, opts = {}) {
        const ref = this.failureRefs.mint(kind);
        const traceId = opts.chatId !== undefined ? this.traceByChat.get(opts.chatId) : undefined;
        this.failureRefs.record({ ref, kind, ts: Date.now(), stage, detail, traceId });
        const sink = this.deps.config.trace;
        if (sink !== undefined && sink.enabled) {
            sink.emit({
                traceId: traceId ?? newTraceId(sink.now()),
                chatId: opts.chatId,
                stage,
                ok: false,
                reason: detail,
                data: { ref, refKind: kind },
            });
        }
        this.deps.log('error', '故障参考号 ' + ref + ' [' + stage + ']: ' + detail);
        return ref;
    }
    /** connection-fault reference entry (wired from index.ts via
     * `connection.onFailure`); the returned reference is appended to the
     * transport's own log line. */
    registerConnectionFailure(stage, detail) {
        return this.mintFailureRef('conn', 'connection', stage !== '' ? '[' + stage + '] ' + detail : detail);
    }
    /** message-fault reference entry for command-plane failures (e.g. the
     * /retry dispatch throw); the caller appends the returned reference to the
     * user-visible ⚠️ notice. */
    registerMessageFailure(chatId, stage, detail) {
        return this.mintFailureRef('msg', stage, detail, { chatId });
    }
    async onSessionFlush(session) {
        if (this.stopping)
            return;
        const chatId = this.bySession.get(session.id);
        if (chatId === undefined)
            return;
        // arbitrary session flushes debounce like turn/end — stop() still
        // forces the final saveMapping directly.
        this.registry.saveMappingDebounced();
    }
    // ------------------------------------------------------------ registry
    /** Get (or create) the agent for a chat. */
    ensureChat(chatId, nickname) {
        return this.registry.ensureChat(chatId, nickname);
    }
    /**
     * /new: the registry disposes the agent and retires its session id so the
     * next inbound message creates a brand-new session (fresh history; the old
     * conversation stays on disk). The confirmation is sent directly through
     * the outbound pipeline since no agent is left to reply.
     */
    async resetChat(chatId) {
        await this.registry.resetChat(chatId);
        this.deps.activity?.markSessionStart(chatId);
        this.sendToChat(chatId, '✅ 已开启新会话，下一条消息将进入全新会话，旧对话历史保留在之前的会话中。').catch((error) => {
            this.deps.log('warn', 'reset notice send failed: ' + String(error));
        });
    }
    /** an admin's own private chat (admin defaults apply). */
    isAdminPrivate(chatId) {
        const ref = splitChatId(chatId);
        return ref.kind === 'private' && classifyUserRole(ref.target, this.deps.policy.adminUsers) === 'admin';
    }
    /** switch a NEW session to its configured host permission preset —
     * an admin's private chat uses config.adminPermission, every other session
     * (non-admin private chats and all group chats) uses config.memberPermission
     * — through the same host /permission command the user would type, so the
     * host stays the only authority. An empty preset leaves the host default
     * untouched (a group has ONE session, so the admin's own words in a group
     * ride that group session's preset too). A failed switch only logs. */
    async applyDefaultPermission(chat) {
        const admin = this.isAdminPrivate(chat.chatId);
        const preset = admin ? this.deps.config.adminPermission : this.deps.config.memberPermission;
        if (preset === undefined || preset === '')
            return;
        const commands = this.deps.commands;
        if (commands?.execute === undefined)
            return;
        try {
            await commands.execute(chat.agent, '/permission ' + preset, [], new AbortController().signal);
        }
        catch (error) {
            this.deps.log('warn', (admin ? 'admin' : 'member') + ' permission default apply failed for ' + chat.chatId + ': ' + describeError(error));
            return;
        }
        this.deps.log('info', (admin ? 'admin' : 'member') + ' permission default applied for ' + chat.chatId + ': ' + preset);
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
    installChannelScope(agentCtx, chatId) {
        const resolved = this.resolveChatCapabilities(chatId);
        agentCtx.systemPrompt.section({
            name: 'channel:qq-companion',
            order: 90,
            text: this.composePlatformPrompt(chatId, resolved),
        });
        // How her companion features work in this chat, from the live config.
        const guide = this.deps.companionGuide?.(chatId) ?? '';
        if (guide !== '')
            agentCtx.systemPrompt.section({ name: 'channel:qq-companion-guide', order: 91, text: guide });
        const writeNote = this.companion.memoryNoteWriter();
        const allowedTools = new Set(resolved.tools);
        const allow = (toolName) => allowedTools.has(toolName);
        registerTools(agentCtx, this, this.deps.connection, {
            maxImageBytes: this.deps.config.maxImageBytes,
            maxVoiceBytes: this.deps.config.maxVoiceBytes,
            maxFileBytes: this.deps.config.maxFileBytes,
        }, allow);
        if (writeNote !== undefined)
            registerMemoryNoteTool(agentCtx, this, writeNote, allow);
        if (this.deps.stickers !== undefined)
            registerStickerTools(agentCtx, this, this.deps.stickers, allow);
    }
    /**
     * 平台段文本的**唯一实现**：提示词注册（installChannelScope）与指纹
     * （{@link platformPromptText}）共用，不两处各算一遍。
     *
     * 纯函数式：同样的配置 + 同样的运行时依赖 → 同样的文本（指纹的稳定性依赖这一点）。
     * 输出协议说明**只给启用了协议的那个聊天加**（{@link protocolEnabledFor}）：
     * 未启用时平台段一个字都不多。
     */
    composePlatformPrompt(chatId, resolved) {
        return buildPlatformPrompt({
            restrictedMembers: this.deps.config.restrictedMemberPrefix,
            enabledCapabilityIds: [...resolved.enabled],
            protocol: this.protocolEnabledFor(chatId),
        });
    }
    /**
     * 这个聊天的平台段文本（order 90 那段），供人设指纹用：平台段变了 → 指纹变 →
     * 下一回合换新会话。与真实注册进 agent 的文本是同一次计算，不会漂移。
     *
     * 同一状态重复调用结果恒定（调用方按稳定性做指纹）。
     */
    platformPromptText(chatId) {
        return this.composePlatformPrompt(chatId, this.resolveChatCapabilities(chatId));
    }
    /** 按一个聊天算能力（会话类型 + 管理员私聊 + 当前进程的运行时依赖）。 */
    resolveChatCapabilities(chatId) {
        return resolveCapabilities({
            config: { capabilitiesDeny: this.deps.config.capabilitiesDeny ?? [] },
            deps: this.availableCapabilityDeps(),
            chat: { kind: splitChatId(chatId).kind, adminPrivate: this.isAdminPrivate(chatId) },
        });
    }
    /** 当前进程里实际具备的能力运行时依赖（表情包库 / 记忆文件）。 */
    availableCapabilityDeps() {
        const deps = [];
        if (this.deps.stickers !== undefined)
            deps.push('stickerLib');
        if (this.companion.memoryNoteWriter() !== undefined)
            deps.push('memoryNote');
        return deps;
    }
    /**
     * 能力摘要（/doctor 与设置页概览共用）：按**管理员私聊**视角计算——主人自己
     * 的私聊已经是权限最高的一类会话，缺什么就是配置层真的关了什么。
     */
    capabilitySummary() {
        return summarizeCapabilities(resolveCapabilities({
            config: { capabilitiesDeny: this.deps.config.capabilitiesDeny ?? [] },
            deps: this.availableCapabilityDeps(),
            chat: { kind: 'private', adminPrivate: true },
        }));
    }
    // ------------------------------------------------------------ typing
    /** Start the NapCat typing indicator (private chats only). */
    startTyping(chat) {
        const ref = splitChatId(chat.chatId);
        if (ref.kind !== 'private')
            return;
        this.stopTyping(chat);
        const pulse = () => {
            if (this.stopping)
                return;
            void this.call('set_input_status', {
                user_id: Number(ref.target),
                event_type: 1,
            }).catch(() => undefined);
        };
        pulse();
        chat.typingTimer = setInterval(pulse, 5_000).unref();
    }
    /** Stop the typing indicator. */
    stopTyping(chat) {
        if (chat.typingTimer !== undefined) {
            clearInterval(chat.typingTimer);
            chat.typingTimer = undefined;
        }
        const ref = splitChatId(chat.chatId);
        if (ref.kind !== 'private')
            return;
        void this.call('set_input_status', {
            user_id: Number(ref.target),
            event_type: 0,
        }).catch(() => undefined);
    }
}
export { OneBotNotConnectedError, OneBotActionError } from './connection.js';
/** the readable text of a dispatched user turn (drops the
 * plugin's <user_message> wrapper and the [HH:MM 昵称(QQ)] / relation-banner
 * prefixes) for the activity record. */
function plainUserText(text) {
    return stripRelationPrefix(text)
        .replace(/<\/?user_message[^>]*>/g, ' ')
        .replace(/<group_context>[\s\S]*?<\/group_context>/g, ' ')
        .replace(/\[\d{2}:\d{2} [^\]]*\(\d+\)\](\[(@我|叫到我|接着和我说)\])?/g, '')
        .trim();
}
