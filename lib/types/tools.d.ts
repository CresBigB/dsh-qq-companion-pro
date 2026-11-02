/**
 * Model-facing tools for the OneBot channel: media sends, merged forwards,
 * the whitelisted NapCat API proxy, group/private history, and the read-only
 * query tools (group list, friend list, group info, private history). Tools
 * infer the target chat from the calling agent's session; an explicit chat_id
 * overrides——**只有 `qq_send_tts` 例外**：它念的是「她此刻在这个会话里说的
 * 话」，只认当前会话，见 {@link currentChat}。
 *
 * NapCat 白名单从 T12 起是表驱动的（`src/napcat-actions.ts`）：`qq_napcat_api`
 * 只是一个查表执行器，表外 action 照旧拒绝，表内 action 的行为与改造前逐字一致。
 * T13 追加的群管理写操作也在那张表里，但**不归 `qq.napcat.api` 能力**，所以
 * `qq_napcat_api` 依旧调不到它们（`NAPCAT_PROXY_ACTION_NAMES` 就是那 15 条）——
 * 那两个能力只能走各自的专用工具（`src/group-tools.ts`，带回合门禁与审计）。
 * @module dsh-qq-companion/tools
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ChatBridge } from './bridge.js';
import type { OneBotConnection } from './connection.js';
import type { Synthesizer } from './tts.js';
/** 一页的取数窗口。 */
export interface ListPage {
    /** 第几页（≥1）。 */
    page: number;
    /** 每页条数（1 … {@link LIST_PAGE_LIMIT_MAX}）。 */
    limit: number;
    /** 这条记录在原始列表里的下标。 */
    offset: number;
}
/**
 * 读分页参数（page / limit），越界一律夹到合法区间而不是报错：
 * 模型给 0 或 999 时拿到的是第一页 / 上限页大小，不是一次失败的调用。
 * @param args - 工具参数（只读 page 与 limit）。
 * @returns 规整后的一页窗口。
 */
export declare function parseListPage(args: {
    page?: unknown;
    limit?: unknown;
}): ListPage;
/**
 * 切出一页。
 * @param list - 完整列表。
 * @param page - {@link parseListPage} 的结果。
 * @returns 本页条目、总数、是否还有下一页。
 */
export declare function paginateList<T>(list: readonly T[], page: ListPage): {
    items: T[];
    total: number;
    hasMore: boolean;
};
/**
 * 把一个名字类字段压成一行并截断（超长 → 前 40 字 + 省略号）。
 * @param value - 原始值（可能缺失）。
 * @returns 可直接进文本的短串。
 */
export declare function truncateForList(value: unknown, max?: number): string;
/** QQ 号 → 纯数字字符串；不像 QQ 号就返回空串（调用方据此拒绝）。 */
export declare function toQQ(value: unknown): string;
/**
 * OneBot 历史消息数组 → 行对象（qq_group_history 与 qq_private_history 共用）。
 *
 * 只取文本与发送者：图片 / 语音 / 文件等非文本段落在 parseMessage 里变成占位符，
 * 它们的二进制与 URL 一概不进结果。
 * @param messages - OneBot 的 message 数组。
 * @returns 每条一行的扁平对象。
 */
export declare function historyRows(messages: readonly unknown[]): Array<{
    message_id: string | null;
    time: string | null;
    user_id: string | null;
    nickname: string;
    text: string;
}>;
/** qq_list_groups 的模型可见文本：一行一个群 + 翻页提示。 */
export declare function renderGroupList(value: unknown): string;
/** qq_list_friends 的模型可见文本：一行一个好友 + 翻页提示。 */
export declare function renderFriendList(value: unknown): string;
/** qq_group_info 的模型可见文本：拿不到的字段如实写「拿不到」。 */
export declare function renderGroupInfo(value: unknown): string;
/**
 * Register all qq_* tools on the context. Registration is effect-based: the
 * returned disposer unregisters them.
 * @param ctx - plugin context.
 * @param bridge - the chat bridge.
 * @param connection - the OneBot connection.
 * @param limits - media size caps（`tts` 缺席 = 语音合成没开，qq_send_tts 不注册）。
 * @param allow - optional per-tool gate (能力注册表用)：返回 false 的工具不注册。
 * @returns the disposer.
 */
export declare function registerTools(ctx: Context, bridge: ChatBridge, connection: OneBotConnection, limits: {
    maxImageBytes: number;
    maxVoiceBytes: number;
    maxFileBytes: number;
    tts?: Synthesizer;
}, allow?: (toolName: string) => boolean): () => void;
/** What the model reads from qq_group_history: one line per message
 * ("[HH:MM] 昵称（QQ）：内容"); the count alone left her with nothing. */
export declare function renderGroupHistory(list: readonly unknown[]): string;
/**
 * OneBot 历史消息数组 → 一行一条的文本（``[HH:MM] 昵称（QQ）：内容  〔id …〕``）。
 *
 * qq_group_history 与 qq_private_history **共用同一个行格式**（T12 要求），
 * 两条通路只有表头和「能不能打开」的说法不同。
 * @param list - 历史消息行对象。
 * @returns 每行一条的可读文本。
 */
export declare function historyLines(list: readonly unknown[]): string[];
/**
 * What the model reads from qq_private_history: **the same line format** as
 * qq_group_history, with a header that says whose conversation it is.
 * @param list - history rows.
 * @param args - the tool arguments (only friend_qq is read, for the header).
 * @returns the model-facing text.
 */
export declare function renderPrivateHistory(list: readonly unknown[], args?: unknown): string;
/**
 * qq_memory_note — the one memory write a chat-only (group)
 * session gets: append a short hearsay line to the PUBLIC memory file. The
 * file and section are fixed by config; caps and the keyword fence live in
 * appendMemoryNote.
 */
export declare function registerMemoryNoteTool(ctx: Context, bridge: ChatBridge, append: (chatId: string, text: string, byAdmin: boolean) => Promise<{
    ok: true;
    line: string;
} | {
    ok: false;
    reason: string;
}>, allow?: (toolName: string) => boolean): () => void;
/**
 * qq_memory_search / qq_memory_remember — T33：让模型自己在聊天里搜和记。
 *
 * T31 只给了人用的 `/memory 关键词`（管理员命令）和「群友让记 → 顺手进一个检索
 * 索引」。模型手里一件记忆工具都没有，所以被问「我上次说过什么」时只能干瞪眼
 * （用户反馈：机器人在工具列表里只看到 engram 那套，看不到本插件的）。
 * 这两个工具补的就是这一环：
 *
 * - **搜**只读，走 {@link ChatBridge.searchMemory}（`LIKE` 模糊，1–2 字中文也
 *   能匹配；按出现次数、再按时间排序）；
 * - **记**走 {@link ChatBridge.rememberMemory}，只写这个聊天自己的 SQLite 库，
 *   **不写** markdown 记忆文件——文件是「下个会话开头自动读进上下文」的正文，
 *   由 `qq_memory_note`（群共享）和文件工具（私聊）负责，两者分工写进提示词。
 *
 * 两本库天然按聊天隔离（库名就是号码），所以群里搜不到私聊、别的群也搜不到；
 * 这里不需要额外的回合门禁，也没有 QQ 状态变更。
 */
export declare function registerMemoryStoreTools(ctx: Context, bridge: ChatBridge, allow?: (toolName: string) => boolean): () => void;
