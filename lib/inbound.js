/**
 * Inbound pipeline: the OneBot-11 → agent-turn path. Two pieces:
 * `normalizeOneBot11`, the pure protocol-adaptation seam that reduces one
 * raw message event to a neutral NormalizedInbound (null = not processable),
 * and `InboundPipeline`, which runs the normalized message through the
 * policy gate → mention gate → command router → media resolution →
 * quote/forward expansion → rate limit → turn dispatch.
 * @module dsh-qq-companion/inbound
 */
import { writeFile } from 'node:fs/promises';
import { extForInboundName } from './media.js';
import { transcriptLabel } from './stt.js';
import { cqUnescape, detectMention, mentionsOthers, parseMessage } from './cq.js';
import { buildChatId, buildGroupMessagePrefix, classifyUserRole, dmAllowed, groupAllowed, sanitizeNickname, wrapUserMessage, } from './chat.js';
import { relationBanner } from './relation.js';
import { evaluateGroupTrigger } from './group-trigger-policy.js';
import { isKnownCommand } from './commands.js';
import { describeError } from './errors.js';
import { currentTrace, TRACE_REASONS } from './trace.js';
/**
 * Reduce one raw OneBot 11 event to the neutral inbound shape, or null when
 * the event is not a processable chat message (notice/recall, meta, unknown
 * message_type, or a missing sender id). Pure: no I/O, no state — the
 * connection's self_id learning stays in the transport layer and the
 * ignoreSelf comparison stays in the pipeline (both are runtime state).
 */
export function normalizeOneBot11(event) {
    const messageType = event.message_type;
    if (messageType !== 'private' && messageType !== 'group')
        return null;
    const userId = String(event.user_id ?? '');
    if (userId === '')
        return null;
    const kind = messageType === 'private' ? 'private' : 'group';
    const groupId = kind === 'group' ? String(event.group_id ?? '') : '';
    const chatId = buildChatId(kind, kind === 'private' ? userId : groupId);
    const segments = Array.isArray(event.message) ? event.message : undefined;
    const raw = typeof event.raw_message === 'string' ? event.raw_message : String(event.message ?? '');
    const messageId = event.message_id === undefined || event.message_id === null
        ? undefined
        : String(event.message_id);
    const parsed = parseMessage(segments, raw);
    const sender = event.sender ?? {};
    const nickname = typeof sender.card === 'string' && sender.card !== ''
        ? sender.card
        : typeof sender.nickname === 'string' && sender.nickname !== ''
            ? sender.nickname
            : userId;
    return {
        kind,
        userId,
        groupId,
        chatId,
        segments,
        raw,
        text: parsed.text,
        media: parsed.media,
        replyId: parsed.replyId,
        forwardId: parsed.forwardId,
        messageId,
        nickname,
    };
}
/** Longest a voice message waits for its transcript before it is handed
 * over as a bare [语音]. */
export const VOICE_TRANSCRIPT_WAIT_MS = 30_000;
/** default (chatId, message_id) dedup window, aligned with the MIT
 * dsh-qq-onebot-bridge's dedupWindowSeconds (300s). */
export const DEFAULT_DEDUP_WINDOW_SECONDS = 300;
/** max entries kept in the dedup window map (LRU-evicted beyond this)
 * so a flood of distinct message_ids cannot grow memory unbounded. */
export const DEDUP_MAX_ENTRIES = 4096;
/** hard ceiling on the private quiet window (seconds): the config key is
 * capped at 30 so a mistyped value can never hold a message forever. */
export const QUIET_WINDOW_MAX_SECONDS = 30;
/**
 * The inbound pipeline: one normalized OneBot event → one agent turn.
 * Owns media resolution, quote/forward expansion and the rate limit;
 * turn dispatch stays behind the context callback.
 */
export class InboundPipeline {
    ctx;
    /** dedup knobs (see InboundPipelineOptions). */
    dedupMaxEntries;
    now;
    voiceWaitMs;
    /** dedup window state: "chatId#messageId" → first-seen epoch ms, in
     * insertion order (Map) so the oldest entry is the LRU victim. */
    seenMessages = new Map();
    /** private quiet window: held messages per chat (see QuietBuffer). */
    quietBuffers = new Map();
    /** Messages are prepared one at a time, across all chats, in arrival
     * order: a voice message waiting for its transcript (or an image still
     * downloading) is never overtaken by a later message. */
    queue = Promise.resolve();
    constructor(ctx, options = {}) {
        this.ctx = ctx;
        this.dedupMaxEntries = options.dedupMaxEntries ?? DEDUP_MAX_ENTRIES;
        this.now = options.now ?? Date.now;
        this.voiceWaitMs = options.voiceWaitMs ?? VOICE_TRANSCRIPT_WAIT_MS;
    }
    /** health snapshot: how many message_ids are currently held in the
     * dedup window (LRU-capped; see DEDUP_MAX_ENTRIES). */
    get dedupWindowEntries() {
        return this.seenMessages.size;
    }
    /** Prepare one message and hand it to the model — after every message
     * that arrived before it (see `queue`). */
    processInbound(inbound) {
        const run = this.queue.then(() => this.processNow(inbound));
        this.queue = run.catch(() => undefined);
        return run;
    }
    async processNow(inbound) {
        if (this.duplicated(inbound))
            return;
        const { kind, userId, groupId, chatId } = inbound;
        if (this.ctx.config.ignoreSelf && this.ctx.selfId() !== '' && userId === this.ctx.selfId()) {
            // this drop used to be fully silent.
            this.ctx.log('debug', '机器人自己的消息已忽略: ' + chatId);
            currentTrace()?.emit('self', { ok: false, reason: TRACE_REASONS.inboundSelf });
            return;
        }
        const policy = this.ctx.policy;
        if (kind === 'private') {
            if (!dmAllowed(userId, policy)) {
                this.ctx.log('debug', 'ignoring DM from non-allowed user ' + userId);
                currentTrace()?.emit('whitelist', { ok: false, reason: TRACE_REASONS.inboundDmBlocked });
                return;
            }
        }
        else {
            if (!groupAllowed(groupId, policy)) {
                this.ctx.log('debug', 'ignoring group message from non-allowed group ' + groupId);
                currentTrace()?.emit('whitelist', { ok: false, reason: TRACE_REASONS.inboundGroupBlocked });
                return;
            }
        }
        // reply-quote bookkeeping: every allowed message id is remembered — the
        // ones only feeding the group context below and never triggering a turn
        // included, so she can quote them later (reply-quote.ts).
        const messageId = inbound.messageId !== undefined && inbound.messageId !== '' ? inbound.messageId : undefined;
        if (messageId !== undefined)
            this.ctx.noteSeenMessage?.(chatId, messageId);
        const chatter = kind === 'group' ? this.ctx.groupChatter : undefined;
        // Every allowed group message is kept (in memory only) so a later call
        // can show her what the group was talking about.
        chatter?.observe(groupId, userId, sanitizeNickname(inbound.nickname), cqUnescape(inbound.text));
        // Keep protocol-level triggers separate from conversational hints: only a
        // real OneBot @ is `mentioned`, while a reply to the bot is its own policy
        // input. Chatter name/follow-up markers are display/context signals only.
        // A poke is the exception: it has no @ segment yet means "I am talking to
        // you", so it is folded into `mentioned` here and nowhere else.
        const poked = inbound.poked === true;
        const mentioned = poked
            || detectMention(inbound.segments, inbound.raw, this.ctx.selfId(), this.ctx.config.botQQ);
        let replyToBot = false;
        let displayTrigger = poked ? '[拍了拍你]' : mentioned;
        // Her name in the text, or the person she just answered going on — unless
        // that message @-s someone else or replies to someone else's message (a
        // reply to her own message is `replyToBot` above). This is a conversational
        // hint, not a protocol trigger, so it stays a separate input: the policy
        // counts it as a direct trigger to preserve the pre-policy behavior.
        let addressed = false;
        if (!mentioned && chatter !== undefined) {
            if (chatter.callsByName(inbound.text))
                addressed = true;
            else if (chatter.isFollowup(groupId, userId) && inbound.replyId === undefined
                && !mentionsOthers(inbound.segments, inbound.raw, this.ctx.selfId(), this.ctx.config.botQQ)) {
                addressed = true;
            }
        }
        const command = kind === 'group' ? isKnownCommand(inbound.text) : false;
        // Decide whether the group policy could possibly need replyToBot before
        // asking NapCat for the quoted message. The probe uses a fixed random value
        // only to detect whether a reply can change the outcome; the real policy is
        // evaluated once below with the actual random source.
        let groupTriggerConfig;
        let replyLookupNeeded = false;
        if (kind === 'group' && !command) {
            const configured = this.ctx.config.groupTriggerPolicy ?? {};
            groupTriggerConfig = {
                ...configured,
                mentionRequired: configured.mentionRequired ?? this.ctx.config.requireMention,
                replyWithoutMention: configured.replyWithoutMention ?? configured.proactiveEnabled ?? !this.ctx.config.requireMention,
            };
            const withoutReply = evaluateGroupTrigger({
                config: groupTriggerConfig,
                message: { groupId, userId, text: inbound.text, mentioned: mentioned === true, replyToBot: false, addressed },
                random: () => 0,
            });
            if (inbound.replyId !== undefined && !mentioned && !addressed && !withoutReply.shouldReply) {
                const withReply = evaluateGroupTrigger({
                    config: groupTriggerConfig,
                    message: { groupId, userId, text: inbound.text, mentioned: false, replyToBot: true, addressed: false },
                    random: () => 0,
                });
                replyLookupNeeded = withReply.shouldReply;
            }
        }
        // identity whitelist: the sanitized nickname feeds the single-line
        // prefix, the <user_message> attribute and lastNickname — one value,
        // provably line-safe and markup-free for all three surfaces.
        const nickname = sanitizeNickname(inbound.nickname);
        // lazy idle eviction before processing each inbound message (flush →
        // dispose → remove; the mapping is kept so the chat can resume).
        await this.ctx.sweepIdleChats();
        // A new user message starts a fresh reply cycle: drop any unmerged loop
        // residue from the previous cycle so interims never merge across turns.
        const priorChat = this.ctx.getChat(chatId);
        if (priorChat !== undefined) {
            priorChat.loopBuffer = [];
            priorChat.loopPending = null;
        }
        // Fire-and-forget temp cleanup on each inbound.
        void this.ctx.media.cleanupExpired();
        // group trigger gate — before the command router, exactly like the old
        // hard-coded requireMention check: an unmentioned message is dropped before
        // any command/media/quote I/O. Commands keep their own path (an operator
        // action is not chat) but stay subject to requireMention, so a group that
        // filters ordinary messages can still be operated from inside it.
        if (kind === 'group') {
            if (command) {
                if (this.ctx.config.requireMention && !mentioned && !addressed) {
                    this.ctx.log('debug', 'ignoring unmentioned group command in ' + groupId);
                    currentTrace()?.emit('mention', { ok: false, reason: TRACE_REASONS.inboundUnmentioned });
                    return;
                }
            }
            else {
                // Only now, when the planned policy says a reply lookup can change the
                // outcome, ask NapCat for the quoted sender.
                if (replyLookupNeeded && inbound.replyId !== undefined)
                    replyToBot = await this.quotesBot(inbound.replyId);
                const evaluation = evaluateGroupTrigger({
                    config: groupTriggerConfig,
                    message: {
                        groupId,
                        userId,
                        text: inbound.text,
                        mentioned: mentioned === true,
                        replyToBot,
                        addressed,
                    },
                });
                // 「没人 @ 她、也不是接着她的话」这一类回复，先让她自己判断要不要接：
                // 群聊里全接会刷屏，所以这里过一次极短的模型自判，判不接就安静。
                // 被点名、被回复、被拍一拍的消息不经过这一层。
                if (evaluation.shouldReply && !mentioned && !replyToBot && !addressed && !poked) {
                    const verdict = await this.ctx.shouldJumpIn?.(chatId, inbound.text) ?? true;
                    if (!verdict) {
                        this.ctx.log('debug', '群聊自判：这条不接 group:' + groupId + ' user:' + userId);
                        currentTrace()?.emit('mention', { ok: false, reason: TRACE_REASONS.inboundJumpInOff });
                        return;
                    }
                }
                else if (mentioned || replyToBot || addressed) {
                    this.ctx.noteJumpInAnswered?.(chatId);
                }
                if (!evaluation.shouldReply) {
                    const reason = evaluation.reason === 'mention-required'
                        ? TRACE_REASONS.inboundUnmentioned
                        : '群触发策略已过滤（' + evaluation.reason + '）';
                    this.ctx.log('debug', reason + ': group:' + groupId + ' user:' + userId);
                    currentTrace()?.emit('mention', { ok: false, reason });
                    return;
                }
            }
            if (!mentioned && !replyToBot) {
                displayTrigger = addressed
                    ? (chatter?.callsByName(inbound.text) === true ? '[叫到我]' : '[接着和我说]')
                    : false;
            }
            else {
                displayTrigger = mentioned || replyToBot;
            }
        }
        const isAdmin = classifyUserRole(userId, policy.adminUsers) === 'admin';
        // The private quiet window: a plain text private message is held until the
        // sender has been quiet for N seconds, then every held line is dispatched
        // as ONE turn (see holdQuiet/flushQuiet). Any other shape — a command, or
        // a message carrying media / a quote / a forward — flushes the held lines
        // first, so the buffered text always leaves before the message that ended
        // the window. Every original message keeps its own rate-limit slot (the
        // hold path charges one below, the normal path keeps charging at its own
        // gate), so five short lines still count as five against the per-minute
        // limit even though they dispatch once.
        const quietMs = this.quietWindowMs();
        const plainMessage = inbound.media.length === 0 && inbound.replyId === undefined && inbound.forwardId === undefined;
        if (kind === 'private' && quietMs > 0) {
            if (!plainMessage || isKnownCommand(inbound.text)) {
                await this.flushQuiet(chatId);
            }
            else {
                if (this.rateLimited(chatId))
                    return;
                this.holdQuiet(chatId, wrapUserMessage(inbound.text, userId, nickname, messageId), isAdmin ? 'admin' : 'member', nickname, messageId, quietMs);
                currentTrace()?.emit('inbound', { ok: true, reason: TRACE_REASONS.inboundQuietHeld });
                this.ctx.log('debug', '私聊静默窗口：消息已缓存，等待停止输入: ' + chatId);
                return;
            }
        }
        // route slash commands BEFORE any media/quote I/O — a message that
        // happens to carry media must not pay for downloads or get_msg calls just
        // to be consumed as a command (admin-only; unknown /-words still fall
        // through to the model).
        if (await this.ctx.tryHandleCommand(chatId, inbound.text, userId, nickname)) {
            currentTrace()?.emit('command', { ok: true, reason: TRACE_REASONS.inboundCommand });
            return;
        }
        const body = await this.ctx.buildBody(inbound.text, inbound.media, chatId);
        let quote = '';
        if (inbound.replyId !== undefined) {
            quote = await this.ctx.expandQuote(inbound.replyId, chatId);
        }
        let forward = '';
        if (inbound.forwardId !== undefined) {
            const expansion = await this.expandForward(inbound.forwardId);
            forward = expansion.text;
            if (expansion.media.length > 0) {
                // Forward-embedded images ride the same buildBody pipeline (their
                // '[图片]' placeholders are inline in the expansion text).
                forward = await this.ctx.buildBody(expansion.text, expansion.media, chatId);
            }
        }
        if (this.rateLimited(chatId))
            return;
        // the whole sender-controlled payload (body + quote/forward
        // expansions) enters the prompt inside the <user_message> boundary, so
        // forged prefix lines, relation banners and system-prompt-like text stay
        // pure data. The framework-generated group prefix and the relation banner
        // remain outside — the only trusted metadata.
        // With the quote spelled out above, the body's own [引用] placeholder would
        // make the sender's words look quoted too.
        const own = quote !== '' ? body.replace('[引用]', '').trim() : body;
        const content = [forward, quote, own].filter(part => part !== '').join('\n');
        if (content.trim() === '') {
            // this drop used to be fully silent.
            this.ctx.log('debug', '消息展开后无有效文本内容，已丢弃: ' + chatId);
            currentTrace()?.emit('dispatch', { ok: false, reason: TRACE_REASONS.inboundEmptyContent });
            return;
        }
        let final = wrapUserMessage(content, userId, nickname, messageId);
        if (kind === 'group') {
            final = buildGroupMessagePrefix(nickname, userId, displayTrigger) + final;
            if (chatter !== undefined) {
                chatter.noteCalled(groupId, userId);
                const context = chatter.takeContext(groupId);
                if (context !== '')
                    final += '\n' + context;
            }
        }
        // The relation banner (关系 / 语气 / 服从度 / 亲密 / 能否指挥) covers every
        // non-admin sender: group members AND non-admin private chats (the same
        // preset that memberPermission narrows). Still outside the <user_message>
        // boundary — framework metadata, never sender text. The relation is a
        // per-turn label (audience only knows the chatId), so it must ride the
        // message.
        if (!isAdmin && this.ctx.config.restrictedMemberPrefix) {
            final = relationBanner({
                userId,
                chatKind: kind,
                policy: { adminUsers: policy.adminUsers, friendUsers: this.ctx.config.friendUsers ?? [] },
            }, this.ctx.config) + ' ' + final;
        }
        const role = isAdmin ? 'admin' : 'member';
        await this.dispatchFinal(chatId, final, role, nickname, messageId, plainMessage);
    }
    /** The busy-turn policy seam runs AFTER every gate above (dedup / self /
     * policy / mention / command / rate-limit) and only around the final
     * dispatch — a queued or steered message has already paid for its rate-limit
     * slot and passed the whole pipeline. `plain` = no media, no quote, no
     * forward: the only shape eligible for steer (media-bearing messages always
     * queue so the full media pipeline runs for their own turn). Seam absent =
     * straight dispatch. Shared by the normal path and the quiet-window flush so
     * a merged batch meets exactly the same seam. */
    async dispatchFinal(chatId, final, role, nickname, messageId, plain) {
        if (this.ctx.interceptBusyTurn !== undefined
            && await this.ctx.interceptBusyTurn(chatId, final, role, nickname, plain, messageId)) {
            return;
        }
        await this.ctx.dispatchFollowup(chatId, final, role, nickname, messageId);
    }
    /** Milliseconds of the private quiet window (0 = disabled). The config value
     * is clamped to [0, QUIET_WINDOW_MAX_SECONDS] and non-finite values fall back
     * to 0, so a broken config can never hold messages. */
    quietWindowMs() {
        const raw = this.ctx.config.privateQuietSeconds;
        if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0)
            return 0;
        return Math.min(QUIET_WINDOW_MAX_SECONDS, raw) * 1000;
    }
    /** Append one wrapped segment to the chat's quiet buffer and (re)arm its
     * debounce timer; the timer fires the merge. */
    holdQuiet(chatId, segment, role, nickname, messageId, quietMs) {
        const existing = this.quietBuffers.get(chatId);
        if (existing === undefined) {
            // the relation banner is computed once, from the first held message, and
            // stays outside the <user_message> boundary (framework metadata).
            const banner = role !== 'admin' && this.ctx.config.restrictedMemberPrefix
                ? relationBanner({
                    userId: chatId.split(':').pop() ?? '',
                    chatKind: 'private',
                    policy: { adminUsers: this.ctx.policy.adminUsers, friendUsers: this.ctx.config.friendUsers ?? [] },
                }, this.ctx.config)
                : '';
            this.quietBuffers.set(chatId, {
                segments: [segment],
                role,
                nickname,
                messageId,
                banner,
                timer: undefined,
            });
        }
        else {
            existing.segments.push(segment);
        }
        const buffer = this.quietBuffers.get(chatId);
        if (buffer === undefined)
            return;
        if (buffer.timer !== undefined)
            clearTimeout(buffer.timer);
        const timer = setTimeout(() => {
            // the flush is serialized behind whatever the pipeline is doing so a
            // merged batch can never overtake an earlier message.
            const run = this.queue.then(() => this.flushQuiet(chatId));
            this.queue = run.catch(() => undefined);
            void run.catch((error) => {
                this.ctx.log('warn', '私聊静默窗口冲刷失败: ' + describeError(error));
            });
        }, quietMs);
        timer.unref?.();
        buffer.timer = timer;
    }
    /** Dispatch everything held for this chat as ONE turn (no-op when empty).
     * Called by the debounce timer and by any message that is not eligible for
     * buffering (command / media / quote / forward). */
    async flushQuiet(chatId) {
        const buffer = this.quietBuffers.get(chatId);
        if (buffer === undefined)
            return;
        this.quietBuffers.delete(chatId);
        if (buffer.timer !== undefined) {
            clearTimeout(buffer.timer);
            buffer.timer = undefined;
        }
        const body = buffer.segments.join('\n');
        const final = buffer.banner === '' ? body : buffer.banner + ' ' + body;
        if (buffer.segments.length > 1) {
            currentTrace()?.emit('inbound', { ok: true, reason: TRACE_REASONS.inboundQuietFlushed });
        }
        this.ctx.log('debug', '私聊静默窗口到期：合并派发 ' + String(buffer.segments.length) + ' 条: ' + chatId);
        await this.dispatchFinal(chatId, final, buffer.role, buffer.nickname, buffer.messageId, true);
    }
    /** (chatId, message_id) sliding-window dedup against OneBot
     * re-delivery (reconnect replay / ws retry). Runs before every other gate
     * so a redelivered message can neither re-trigger a command nor reset the
     * loop residue; only events that normalize to processable chat messages
     * reach this — notice/meta/request events never enter the pipeline.
     * Events without a
     * message_id are not deduped (nothing to key on). Window entries live in
     * an LRU-capped map: hits refresh recency (keeping the first-seen time, so
     * the window opens at first delivery), the oldest entry is evicted beyond
     * the cap. Returns true when the delivery must be silently skipped. */
    duplicated(inbound) {
        const windowSeconds = this.ctx.config.dedupWindowSeconds ?? DEFAULT_DEDUP_WINDOW_SECONDS;
        if (windowSeconds <= 0)
            return false;
        if (inbound.messageId === undefined || inbound.messageId === '')
            return false;
        const now = this.now();
        const key = inbound.chatId + '#' + inbound.messageId;
        const seenAt = this.seenMessages.get(key);
        if (seenAt !== undefined && now - seenAt < windowSeconds * 1000) {
            this.seenMessages.delete(key);
            this.seenMessages.set(key, seenAt);
            this.ctx.log('debug', 'dedup hit in ' + inbound.chatId + ': message_id ' + inbound.messageId
                + ' redelivered within ' + windowSeconds + 's window, message skipped');
            currentTrace()?.emit('dedup', { ok: false, reason: TRACE_REASONS.inboundDedup });
            return true;
        }
        this.seenMessages.delete(key);
        while (this.seenMessages.size >= this.dedupMaxEntries) {
            const oldest = this.seenMessages.keys().next().value;
            if (oldest === undefined)
                break;
            this.seenMessages.delete(oldest);
        }
        this.seenMessages.set(key, now);
        return false;
    }
    /** sliding-window inbound rate limit for normal (non-command) messages.
     * Commands consumed by tryHandleCommand never reach this. Returns true when
     * the message must be dropped; at most one notice is sent per window. */
    rateLimited(chatId) {
        const limit = this.ctx.config.rateLimitPerMinute ?? 30;
        if (limit <= 0)
            return false;
        const chat = this.ctx.getChat(chatId);
        if (chat === undefined)
            return false;
        const now = Date.now();
        chat.dispatchTimes = chat.dispatchTimes.filter(t => now - t < 60_000);
        if (chat.dispatchTimes.length < limit) {
            chat.dispatchTimes.push(now);
            return false;
        }
        // the drop decision itself used to be silent (only
        // the user-facing notice text existed).
        currentTrace()?.emit('ratelimit', { ok: false, reason: TRACE_REASONS.inboundRateLimited });
        if (chat.rateLimitNoticeAt === undefined || now - chat.rateLimitNoticeAt >= 60_000) {
            chat.rateLimitNoticeAt = now;
            void this.ctx.sendToChat(chatId, '⏳ 消息太频繁，请稍后再试。').catch((error) => {
                this.ctx.log('debug', '限流提示发送失败: ' + describeError(error));
                currentTrace()?.emit('ratelimit', { ok: false, reason: TRACE_REASONS.inboundRateNoticeFailed });
            });
        }
        return true;
    }
    /**
     * Build the message body text: placeholders become annotated local paths
     * (images/voices/videos) and voice files are transcribed when enabled.
     */
    async buildBody(text, media, _chatId) {
        if (media.length === 0)
            return text;
        let out = text;
        for (const ref of media) {
            const placeholder = placeholderFor(ref);
            const idx = out.indexOf(placeholder);
            const annotation = await this.resolveMediaRef(ref);
            if (idx >= 0 && annotation !== '') {
                out = out.slice(0, idx) + annotation + out.slice(idx + placeholder.length);
            }
            else if (idx >= 0) {
                // a failed resolution used to leave the
                // placeholder silently unresolved.
                this.ctx.log('debug', '媒体解析失败，占位符保留原文: ' + placeholder);
                currentTrace()?.emit('media', { ok: false, reason: TRACE_REASONS.mediaResolveFailed });
            }
        }
        return out;
    }
    /** Resolve one media ref to a text annotation with a local path. */
    async resolveMediaRef(ref) {
        if (ref.kind === 'file') {
            return await this.resolveNasFile(ref);
        }
        // The model only ever sees "[语音]" for a voice message; the audio file
        // matters only to the transcriber. With transcription off, nothing is
        // fetched or converted.
        if (ref.kind === 'voice' && !this.ctx.transcriber.enabled)
            return '[语音]';
        // A voice segment's own URL usually serves QQ's raw SILK audio, which
        // nothing downstream can decode: ask NapCat for an mp3 first and keep the
        // URL as the fallback.
        if (ref.kind === 'voice' && ref.file !== undefined && ref.file !== '' && ref.url !== undefined && ref.url !== '') {
            try {
                const mp3 = recordResult(await this.ctx.call('get_record', { file: ref.file, out_format: 'mp3' }));
                if (mp3 !== undefined)
                    ref = { ...ref, ...mp3 };
            }
            catch (error) {
                this.ctx.log('debug', 'get_record 转 mp3 失败，改用语音原链接: ' + describeError(error));
            }
        }
        const resolved = await this.ctx.media.resolve(ref, async (kind, file) => {
            if (kind === 'image') {
                const data = await this.ctx.call('get_image', { file });
                return { url: data.url, file: data.file };
            }
            if (kind === 'voice')
                return recordResult(await this.ctx.call('get_record', { file, out_format: 'mp3' }));
            return undefined;
        });
        if (resolved === undefined)
            return '';
        if (resolved.tooLarge === true)
            return placeholderFor(ref) + '（超过 ' + this.ctx.media.capLabel() + '，没有接收）';
        switch (resolved.kind) {
            case 'image': {
                const annotation = (ref.sticker === true ? '[表情包:' : '[图片:') + resolved.path + ']';
                // A sticker gets a word on whether she already has it — the bracket
                // itself stays a bare path so [表情包:…] keeps parsing.
                return ref.sticker === true ? annotation + await this.stickerShelfNote(resolved.path) : annotation;
            }
            case 'voice':
                // The message waits for its transcript (a couple of seconds), so
                // she answers what was said instead of replying to a bare [语音]
                // first and to the transcript afterwards.
                return '[语音]' + await this.transcribe(resolved.path);
            case 'video':
                return '[视频:' + resolved.path + ']';
            default:
                return '[文件:' + resolved.path + ']';
        }
    }
    /**
     * What her sticker library says about a received sticker: the kept id with
     * its first tags, 「还没收藏」, or 「太大了存不下」 when it is over the
     * per-image cap (qq_sticker_save would refuse it, so she must not be told to
     * try). '' when the library is off, and a lookup failure never costs the
     * message — it only loses the note.
     */
    async stickerShelfNote(path) {
        const library = this.ctx.stickers;
        if (library === undefined)
            return '';
        try {
            const shelf = await library.classifyFile(path);
            if (shelf === undefined)
                return '';
            if (shelf.kind === 'new')
                return '（还没收藏）';
            if (shelf.kind === 'too-large')
                return '（太大了存不下）';
            const tags = shelf.sticker.tags.slice(0, 3).join('、');
            return '（库里已有 ' + shelf.sticker.id + (tags !== '' ? '：' + tags : '') + '）';
        }
        catch (error) {
            this.ctx.log('debug', '表情包库查询失败，跳过收藏标注: ' + describeError(error));
            return '';
        }
    }
    /** The transcript label for one voice file ('' when nothing was said,
     * transcription failed or it took longer than VOICE_TRANSCRIPT_WAIT_MS —
     * the message then goes on as a bare [语音]). */
    async transcribe(path) {
        let timer;
        try {
            const timeout = new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('等了 ' + this.voiceWaitMs / 1000 + ' 秒还没转写完')), this.voiceWaitMs);
            });
            const started = this.now();
            const text = await Promise.race([this.ctx.transcriber.transcribe(path), timeout]);
            const label = transcriptLabel(text);
            if (label === '') {
                this.ctx.log('debug', '语音转写结果为空: ' + path);
                currentTrace()?.emit('transcribe', { ok: false, reason: TRACE_REASONS.sttEmpty });
            }
            else {
                this.ctx.log('info', '语音转写完成（' + Array.from(text).length + ' 字，' + (this.now() - started) + 'ms）');
            }
            return label;
        }
        catch (error) {
            this.ctx.log('warn', 'STT failed: ' + describeError(error));
            currentTrace()?.emit('transcribe', { ok: false, reason: '语音转写失败: ' + describeError(error) });
            return '';
        }
        finally {
            if (timer !== undefined)
                clearTimeout(timer);
        }
    }
    /** Whether a quoted message was sent by the bot itself (get_msg; a lookup
     * failure counts as no). */
    async quotesBot(messageId) {
        const bot = this.ctx.selfId() !== '' ? this.ctx.selfId() : this.ctx.config.botQQ;
        if (bot === '')
            return false;
        try {
            const data = await this.ctx.call('get_msg', { message_id: Number(messageId) });
            const sender = data?.sender?.user_id ?? data?.user_id;
            return sender !== undefined && String(sender) === bot;
        }
        catch (error) {
            this.ctx.log('debug', '查被引用消息的发送者失败: ' + describeError(error));
            return false;
        }
    }
    /**
     * Expand a quoted (reply) message into [引用] text via get_msg. The quoted
     * message goes through the same media path as a direct one: images are
     * fetched (she can look at them), voice is transcribed, videos and files
     * are fetched, and a quoted merged forward (聊天记录) is expanded. A quote
     * gets the same treatment.
     */
    async expandQuote(messageId, chatId) {
        let data;
        try {
            data = await this.ctx.call('get_msg', { message_id: Number(messageId) });
        }
        catch (error) {
            this.ctx.log('debug', 'quote expansion failed: ' + describeError(error));
            currentTrace()?.emit('quote', { ok: false, reason: '引用消息展开失败，已降级为空引用: ' + describeError(error) });
            return '';
        }
        const segments = Array.isArray(data?.message) ? data.message : undefined;
        const raw = typeof data?.raw_message === 'string' ? data.raw_message : '';
        const parsed = parseMessage(segments, raw);
        let text = cqUnescape(parsed.text);
        let forward = '';
        if (chatId !== undefined) {
            if (parsed.media.length > 0)
                text = await this.ctx.buildBody(text, parsed.media, chatId);
            if (parsed.forwardId !== undefined) {
                const expansion = await this.expandForward(parsed.forwardId);
                forward = expansion.media.length > 0 ? await this.ctx.buildBody(expansion.text, expansion.media, chatId) : expansion.text;
                // the expansion carries its own [合并转发] heading
                text = text.replace('[合并转发]', '').trim();
            }
        }
        const body = [text, forward].filter(part => part.trim() !== '').join('\n');
        if (body === '')
            return '';
        const name = data?.sender?.nickname ?? '';
        return '[引用]' + (name !== '' ? name + ': ' : '') + body;
    }
    /**
     * Fetch an inbound QQ file to a local path. NapCat's get_file may return
     * container-internal paths unreachable from this host, so:
     *   1. prefer the private-file direct link (get_private_file_url → HTTP
     *      CDN download, works for private chats);
     *   2. fall back to get_file base64 / http-url payloads.
     * Returns the [文件:path] annotation, or '' when disabled/failed.
     */
    async resolveNasFile(ref) {
        const name = ref.name !== undefined && ref.name !== '' ? ref.name : 'file';
        // The sender-controlled name never becomes the on-disk path (it could
        // otherwise overwrite chat-sessions.json etc.); only a whitelisted
        // extension survives into the fresh media_* name.
        const ext = extForInboundName(name);
        // Streaming size cap for both URL branches below (0 = uncapped).
        const maxBytes = this.ctx.config.maxInboundFileBytes > 0 ? this.ctx.config.maxInboundFileBytes : undefined;
        const fid = ref.fileId ?? ref.file ?? '';
        if (fid === '')
            return '';
        try {
            // 1. Private-chat direct link (works without any container access).
            const direct = await this.ctx.call('get_private_file_url', { file_id: fid });
            if (direct.url !== undefined && direct.url !== '') {
                try {
                    const localPath = await this.ctx.media.downloadUrl(direct.url, ext, maxBytes);
                    this.ctx.log('info', 'qq file fetched via direct link: ' + localPath);
                    return '[文件:' + localPath + ']';
                }
                catch (error) {
                    this.ctx.log('warn', 'qq file direct download failed: ' + describeError(error));
                }
            }
        }
        catch (error) {
            this.ctx.log('debug', 'get_private_file_url failed (falling back to get_file): ' + describeError(error));
        }
        // 2. get_file: with NapCat's file server enabled it returns a `base64`
        //    payload or an http(s) `url`; otherwise a container path we cannot reach.
        try {
            const data = await this.ctx.call('get_file', { file: fid });
            const size = Number(data.file_size ?? 0);
            if (this.ctx.config.maxInboundFileBytes > 0 && size > this.ctx.config.maxInboundFileBytes) {
                this.ctx.log('warn', 'qq file too large (' + size + 'B), skipping fetch');
                currentTrace()?.emit('media', { ok: false, reason: TRACE_REASONS.nasFileTooLarge });
                return '[文件:' + name + ']（超过 ' + Math.round(this.ctx.config.maxInboundFileBytes / 1024 / 1024) + 'MB，没有接收）';
            }
            if (data.base64 !== undefined && data.base64 !== '') {
                const localPath = await this.writeMediaFile(Buffer.from(data.base64, 'base64'), ext);
                if (localPath !== '') {
                    this.ctx.log('info', 'qq file fetched via get_file base64: ' + localPath);
                    return '[文件:' + localPath + ']';
                }
            }
            if (data.url !== undefined && /^https?:\/\//.test(data.url)) {
                try {
                    const localPath = await this.ctx.media.downloadUrl(data.url, ext, maxBytes);
                    this.ctx.log('info', 'qq file fetched via get_file url: ' + localPath);
                    return '[文件:' + localPath + ']';
                }
                catch (error) {
                    this.ctx.log('warn', 'qq file direct download failed: ' + describeError(error));
                }
            }
        }
        catch (error) {
            this.ctx.log('debug', 'get_file base64/url path failed: ' + describeError(error));
        }
        this.ctx.log('warn', 'qq file fetch failed: no direct link / base64 / http url available for ' + fid);
        currentTrace()?.emit('media', { ok: false, reason: TRACE_REASONS.nasFileFailed });
        return '';
    }
    /** Write bytes into the media dir under a fresh unpredictable name; returns the path or ''. */
    async writeMediaFile(buffer, ext) {
        try {
            // freshPath mints media_<ts>_<uuid><ext>: inbound data can never land
            // on a known name (chat-sessions.json etc.) no matter what the sender
            // chose as the file name.
            await this.ctx.media.ensure();
            const localPath = this.ctx.media.freshPath(ext);
            await writeFile(localPath, buffer);
            return localPath;
        }
        catch (error) {
            this.ctx.log('warn', 'media write failed: ' + describeError(error));
            return '';
        }
    }
    /**
     * Expand a combined-forward id into "name: content" lines, collecting
     * embedded image segments into the media list (they flow through the same
     * buildBody pipeline as inbound media). Failure or an empty expansion no
     * longer returns a silent placeholder: the resId plus a short reason
     * (api-error / empty-response / no-text-nodes) stays in the model context
     * so it can self-serve via the whitelisted get_forward_msg tool.
     */
    async expandForward(forwardId, depth = 0) {
        try {
            // NapCat's get_forward_msg accepts `message_id` or `id`; sending both
            // also covers go-cqhttp-style implementations. Its response nodes are
            // OneBot node segments: { type: 'node', data: { nickname, user_id,
            // message: [...] } } — current NapCat versions return plain message
            // objects instead ({ sender, message: [...], raw_message }); the flat
            // `sender`/`content` shape is kept as a fallback for other implementations.
            const data = await this.ctx.call('get_forward_msg', { id: forwardId, message_id: forwardId });
            const nodes = data.messages ?? [];
            const { lines, media } = await this.expandNodes(nodes, depth);
            if (lines.length === 0) {
                const reason = nodes.length === 0 ? 'empty-response' : 'no-text-nodes';
                currentTrace()?.emit('forward', { ok: false, reason: '合并转发未展开: ' + reason });
                return { text: '[合并转发 id=' + forwardId + ' 未展开: ' + reason + ']', media };
            }
            return { text: '[合并转发]\n' + lines.join('\n'), media };
        }
        catch (error) {
            this.ctx.log('info', 'forward expansion failed: resId=' + forwardId + ': ' + describeError(error));
            currentTrace()?.emit('forward', { ok: false, reason: '合并转发展开失败: ' + describeError(error) });
            return { text: '[合并转发 id=' + forwardId + ' 未展开: api-error]', media: [] };
        }
    }
    /** The lines and media of a forward's nodes (a few levels of nesting). */
    async expandNodes(nodes, depth) {
        const lines = [];
        const media = [];
        for (const node of nodes) {
            const nodeData = node.data;
            const card = node.sender?.card;
            const name = nodeData?.nickname ?? (card !== undefined && card !== '' ? card : undefined) ?? node.sender?.nickname
                ?? String(nodeData?.user_id ?? node.sender?.user_id ?? '未知');
            const content = nodeData?.message ?? nodeData?.content ?? node.message ?? node.content;
            const segments = Array.isArray(content) ? content : undefined;
            if (segments?.some(seg => seg?.type === 'node') === true) {
                // the older nested-node shape
                const text = nodeContentText(segments, name, media, lines);
                if (text !== '')
                    lines.push(name + ': ' + text);
                continue;
            }
            // Each node is a message like any other: images, voice, video and
            // files go through the same media path (capped per forward), and a
            // forward inside the forward is expanded too (a few levels deep).
            const raw = typeof content === 'string' ? content : typeof node.raw_message === 'string' ? node.raw_message : '';
            const parsed = parseMessage(segments, raw);
            const text = cqUnescape(parsed.text).replace('[引用]', '').trim();
            for (const ref of parsed.media)
                if (media.length < FORWARD_MEDIA_MAX)
                    media.push(ref);
            if (text !== '')
                lines.push(name + ': ' + text);
            if (parsed.forwardId !== undefined && depth < FORWARD_MAX_DEPTH) {
                // NapCat ships an inner forward's messages inline (data.content) and
                // refuses to fetch it by id ("内层消息"); fetch only when not inline.
                const inline = segments?.find(seg => seg?.type === 'forward' && Array.isArray(seg.data?.content));
                const nested = inline !== undefined
                    ? await this.expandNodes(inline.data.content, depth + 1)
                    : await this.expandForward(parsed.forwardId, depth + 1).then(r => ({ lines: r.text.split('\n'), media: r.media }));
                lines.push(...nested.lines.map(line => '  ' + line));
                for (const ref of nested.media)
                    if (media.length < FORWARD_MEDIA_MAX)
                        media.push(ref);
            }
        }
        return { lines, media };
    }
}
/** Media files fetched for one merged forward at most (the rest keep their placeholders). */
export const FORWARD_MEDIA_MAX = 20;
/** How many forwards-inside-forwards are expanded. */
export const FORWARD_MAX_DEPTH = 3;
/** The placeholder a media ref contributes to the parsed text. */
function placeholderFor(ref) {
    switch (ref.kind) {
        case 'image': return ref.sticker === true ? '[表情包]' : '[图片]';
        case 'voice': return '[语音]';
        case 'video': return '[视频]';
        default: return ref.name !== undefined ? '[文件:' + ref.name + ']' : '[文件]';
    }
}
/**
 * Extract text from a forward-node content (segment array or CQ string).
 * Image segments are collected into `media` and contribute a '[图片]'
 * placeholder (annotated by buildBody like inbound media, `name` carries the
 * owning node's nickname). Nested node segments recurse: their text joins
 * `lines` as their own "name: text" entry instead of being swallowed as
 * '[非文本]'.
 */
function nodeContentText(content, ownerName, media, lines) {
    if (Array.isArray(content)) {
        return content
            .map(seg => {
            const s = seg;
            if (s?.type === 'text')
                return String(s.data?.text ?? '');
            if (s?.type === 'face')
                return '😀';
            // a reply inside a forwarded message only points at another message
            if (s?.type === 'reply')
                return '';
            if (s?.type === 'at')
                return s.data?.qq === 'all' ? '@全体成员 ' : '@' + String(s.data?.qq ?? '') + ' ';
            if (s?.type === 'mface')
                return '[表情包]';
            if (s?.type === 'forward')
                return '[合并转发]';
            if (s?.type === 'record')
                return '[语音]';
            if (s?.type === 'video')
                return '[视频]';
            if (s?.type === 'file')
                return '[文件]';
            if (s?.type === 'json' || s?.type === 'xml')
                return '[卡片]';
            if (s?.type === 'image') {
                media.push({
                    kind: 'image',
                    url: typeof s.data?.url === 'string' && s.data.url !== '' ? s.data.url : undefined,
                    file: typeof s.data?.file === 'string' && s.data.file !== '' ? s.data.file : undefined,
                    name: ownerName,
                });
                return '[图片]';
            }
            if (s?.type === 'node' && typeof s.data === 'object' && s.data !== null) {
                const nested = s.data;
                const nestedName = nested.nickname ?? String(nested.user_id ?? ownerName);
                const nestedText = nodeContentText(nested.message ?? nested.content, nestedName, media, lines);
                if (nestedText !== '')
                    lines.push(nestedName + ': ' + nestedText);
                return '';
            }
            return '[非文本]';
        })
            .join('')
            .trim();
    }
    if (typeof content === 'string')
        return content.trim();
    return '';
}
/**
 * NapCat's get_record answer as a media ref: inline base64 when present, a
 * download URL, or a local path (made a file:// ref). undefined = nothing usable.
 */
export function recordResult(data) {
    const d = (data ?? {});
    if (typeof d.base64 === 'string' && d.base64 !== '')
        return { url: undefined, file: 'base64://' + d.base64.replace(/^base64:\/\//, '') };
    if (typeof d.url === 'string' && /^https?:\/\//.test(d.url))
        return { url: d.url };
    if (typeof d.file === 'string' && d.file !== '') {
        if (d.file.startsWith('/'))
            return { url: undefined, file: 'file://' + d.file };
        if (/^(file|base64):\/\//.test(d.file))
            return { url: undefined, file: d.file };
    }
    return undefined;
}
