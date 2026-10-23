/**
 * 引用回复（reply quote）域：模型侧的引用标记解析 + 每个聊天「最近见过的
 * 消息 id」集合。
 *
 * 模型看到的每条用户消息带 <user_message … msg="消息 id">，想引用某条消息
 * 时在回复最开头写 [引用:消息 id]（引用正在回应的这条写 [引用:这条]）。
 * 标记本身永远不发给 QQ：网关在发出前剥掉它，能解析成一个见过的 id 时把它
 * 变成 OneBot 的 reply 段（bridge.sendToChat 的最终闸门）。
 *
 * 见过的 id 集合（SeenMessageIds）是按 chat 分桶的内存 LRU：入站消息（含
 * 群里没 @ 她、只进群上下文的消息）与她自己的发送 id 都记进去，上限
 * SEEN_MESSAGE_LIMIT 条/chat。它同时是自动引用（groupAutoQuote=busy）判定
 * 「触发消息之后有没有别人插话」的依据——她自己发的消息带 self 标记，不算
 * 别人说话。
 * @module dsh-qq-companion/reply-quote
 */
import type { ChatId } from './chat.js';
/** 标记特殊值：引用本回合的触发消息（正在回应的那条）。 */
export declare const SELF_QUOTE_TOKEN = "\u8FD9\u6761";
/** 每个聊天保留的最近消息 id 条数（内存 LRU 上限）。 */
export declare const SEEN_MESSAGE_LIMIT = 200;
/** 一条回复开头的引用标记。 */
export interface QuoteMarker {
    /** 要引用的消息 id；SELF_QUOTE_TOKEN = 本回合的触发消息；'' = 标记里的 id 不可用。 */
    target: string;
    /** 剥掉标记之后的正文（原样，未再 trim）。 */
    body: string;
}
/** parseLeadingQuote 的结果。 */
export interface ParsedQuote {
    marker: QuoteMarker | null;
    body: string;
}
/**
 * 解析并剥掉回复开头的引用标记。
 * @param text - 模型产出的回复文本。
 * @returns 标记（没有则 null）与剥掉标记后的正文。
 */
export declare function parseLeadingQuote(text: string): ParsedQuote;
/**
 * 每个聊天最近见过的消息 id 集合（内存 LRU，上限 SEEN_MESSAGE_LIMIT）。
 * 只活在内存里：重启后为空，模型写出的旧 id 会被当成无效标记丢弃。
 */
export declare class SeenMessageIds {
    /** chatId → (消息 id → 记录)，Map 的插入顺序就是 LRU 顺序。 */
    private readonly byChat;
    /** 全局单调递增序号。 */
    private seq;
    /** 记一条入站消息 id；返回它的序号（-1 = id 不可用，未记录）。 */
    noteInbound(chatId: ChatId, messageId: string | undefined): number;
    /** 记一条她自己发出的消息 id；返回它的序号（-1 = id 不可用）。 */
    noteSelf(chatId: ChatId, messageId: string | undefined): number;
    private note;
    /** 这个 id 是否在这个聊天里见过。 */
    has(chatId: ChatId, messageId: string): boolean;
    /** 见过的消息 id 的序号（未见过 = undefined）。 */
    seqOf(chatId: ChatId, messageId: string): number | undefined;
    /** 给定序号之后是否又进来过别人的消息（她自己发的不算）。 */
    hasInboundAfter(chatId: ChatId, seq: number): boolean;
    /** 这个聊天当前记着多少条 id（诊断/测试用）。 */
    count(chatId: ChatId): number;
    /** 聊天被移除时丢掉它的桶（内存随聊天数有界）。 */
    forget(chatId: ChatId): void;
}
