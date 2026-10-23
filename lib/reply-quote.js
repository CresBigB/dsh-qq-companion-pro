import { sanitizeMessageId } from './chat.js';
/** 标记特殊值：引用本回合的触发消息（正在回应的那条）。 */
export const SELF_QUOTE_TOKEN = '这条';
/** 每个聊天保留的最近消息 id 条数（内存 LRU 上限）。 */
export const SEEN_MESSAGE_LIMIT = 200;
/**
 * 文本**开头**的引用标记：[引用:<id>]，容忍全角括号与全角冒号、标记前后的
 * 空白。文本中间或结尾的同形文字不匹配（原样保留）。id 只取空白之外的 64
 * 个字符，随后按消息 id 白名单清洗。
 */
const LEADING_QUOTE = /^[\s\u3000]*[[［]\s*引用\s*[:：]\s*([^\]］\r\n]{0,64}?)\s*[\]］][\s\u3000]*/;
/**
 * 解析并剥掉回复开头的引用标记。
 * @param text - 模型产出的回复文本。
 * @returns 标记（没有则 null）与剥掉标记后的正文。
 */
export function parseLeadingQuote(text) {
    const match = LEADING_QUOTE.exec(text);
    if (match === null)
        return { marker: null, body: text };
    const raw = match[1] ?? '';
    const body = text.slice(match[0].length);
    if (raw === SELF_QUOTE_TOKEN)
        return { marker: { target: SELF_QUOTE_TOKEN, body }, body };
    return { marker: { target: sanitizeMessageId(raw), body }, body };
}
/**
 * 每个聊天最近见过的消息 id 集合（内存 LRU，上限 SEEN_MESSAGE_LIMIT）。
 * 只活在内存里：重启后为空，模型写出的旧 id 会被当成无效标记丢弃。
 */
export class SeenMessageIds {
    /** chatId → (消息 id → 记录)，Map 的插入顺序就是 LRU 顺序。 */
    byChat = new Map();
    /** 全局单调递增序号。 */
    seq = 0;
    /** 记一条入站消息 id；返回它的序号（-1 = id 不可用，未记录）。 */
    noteInbound(chatId, messageId) {
        return this.note(chatId, messageId, false);
    }
    /** 记一条她自己发出的消息 id；返回它的序号（-1 = id 不可用）。 */
    noteSelf(chatId, messageId) {
        return this.note(chatId, messageId, true);
    }
    note(chatId, messageId, self) {
        const id = sanitizeMessageId(messageId ?? '');
        if (id === '')
            return -1;
        let entries = this.byChat.get(chatId);
        if (entries === undefined) {
            entries = new Map();
            this.byChat.set(chatId, entries);
        }
        // 重复出现（重投）的 id 提到最新位置，序号重新分配。
        entries.delete(id);
        this.seq += 1;
        entries.set(id, { seq: this.seq, self });
        while (entries.size > SEEN_MESSAGE_LIMIT) {
            const oldest = entries.keys().next().value;
            if (oldest === undefined)
                break;
            entries.delete(oldest);
        }
        return this.seq;
    }
    /** 这个 id 是否在这个聊天里见过。 */
    has(chatId, messageId) {
        const id = sanitizeMessageId(messageId);
        if (id === '')
            return false;
        return this.byChat.get(chatId)?.has(id) === true;
    }
    /** 见过的消息 id 的序号（未见过 = undefined）。 */
    seqOf(chatId, messageId) {
        const id = sanitizeMessageId(messageId);
        if (id === '')
            return undefined;
        return this.byChat.get(chatId)?.get(id)?.seq;
    }
    /** 给定序号之后是否又进来过别人的消息（她自己发的不算）。 */
    hasInboundAfter(chatId, seq) {
        const entries = this.byChat.get(chatId);
        if (entries === undefined)
            return false;
        for (const entry of entries.values()) {
            if (!entry.self && entry.seq > seq)
                return true;
        }
        return false;
    }
    /** 这个聊天当前记着多少条 id（诊断/测试用）。 */
    count(chatId) {
        return this.byChat.get(chatId)?.size ?? 0;
    }
    /** 聊天被移除时丢掉它的桶（内存随聊天数有界）。 */
    forget(chatId) {
        this.byChat.delete(chatId);
    }
}
