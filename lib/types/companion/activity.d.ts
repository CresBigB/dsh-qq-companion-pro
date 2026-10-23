import type { Log } from './time.js';
/** Activity file name, under mediaDir. */
export declare const CHAT_ACTIVITY_FILE = "chat-activity.json";
/** Lines kept for the idle-reset handoff recap. */
export declare const HANDOFF_LINES = 8;
/** Characters kept per handoff / today line. */
export declare const LINE_MAX_CHARS = 200;
/** Today's lines handed to a fresh session at most (so a session renewed
 * mid-day still knows what was said earlier that day). */
export declare const HANDOFF_TODAY_LINES = 40;
/** Lines kept in today's excerpt per chat (the diary input). */
export declare const TODAY_MAX_LINES = 200;
/** Lines per group in the nightly group excerpt (keeps the diary turn cheap). */
export declare const GROUP_TODAY_MAX_LINES = 80;
export interface ActivityLine {
    /** Epoch ms. */
    t: number;
    /** user = 对方说的；bot = 她说的（算台词）；system = 记录她自己的决定
     * （例如「这次选择不回」），不是一句台词，不进 bot 统计。 */
    who: 'user' | 'bot' | 'system';
    /** Sender label for user lines (nickname), empty for the bot. */
    name?: string;
    text: string;
}
export declare class ChatActivity {
    private readonly file;
    private readonly log;
    private readonly now;
    private chats;
    private saveTimer;
    private saveChain;
    private readonly writer;
    private readonly promptVersion;
    constructor(options: {
        mediaDir: string;
        log: Log;
        now?: () => number;
        promptVersion?: (chatId: string) => string;
    });
    load(): Promise<void>;
    /** Last user activity time for a chat (undefined = never seen). */
    lastAt(chatId: string): number | undefined;
    /** Whether the chat has been idle longer than `hours` (never-seen = no). */
    isIdle(chatId: string, hours: number): boolean;
    /** Record one line. User lines also move the idle clock. */
    record(chatId: string, who: 'user' | 'bot', text: string, name?: string): void;
    /**
     * 记一条「她这次选择不回」（输出协议 A 档）：进 recent 与 today，让下次交接
     * 与当天的日记知道她刚没回；**不塑造成她说了一句话**（who='system'），因此
     * 不计入 bot 台词统计（{@link botLinesSinceUser}），也不移动空闲时钟。
     * 从没见过的聊天没有可交接的上下文，直接不记（日志/计数/trace 仍在）。
     */
    recordPass(chatId: string, reason?: string): void;
    /** Append one line to recent + today, trimming both to their caps. */
    private pushLine;
    /** Mark that the chat's session starts now (/new, idle or age reset). */
    markSessionStart(chatId: string): void;
    /** The current prompt version as a record field (none without a version source). */
    private promptOf;
    /** Whether the chat's session started under a different prompt version
     * than the current one (a session from before versions were recorded
     * counts as different). Never-seen chats are not stale. */
    promptStale(chatId: string): boolean;
    /** How many 04:00 day boundaries the current session has crossed
     * (0 = started today; never-seen chats = 0). */
    sessionDaysCrossed(chatId: string): number;
    /** How many of her replies came after the chat's last user line (an
     * unanswered proactive message makes this ≥ 2). 只有 who='bot' 算台词：
     * 「这次选择不回」的 system 行不占这个计数。 */
    botLinesSinceUser(chatId: string): number;
    /** The handoff recap text for a fresh session ('' = nothing to hand off). */
    handoff(chatId: string): string;
    /** The handoff for a fresh session: today's lines (at most
     * HANDOFF_TODAY_LINES, with times) when there are any — not yet taken by
     * the diary — else the last few lines. '' = nothing to hand off. */
    handoffRecap(chatId: string): {
        text: string;
        today: boolean;
    };
    /** Today's excerpt for a chat (diary input), then optionally cleared. */
    takeToday(chatId: string, clear: boolean): ActivityLine[];
    /** Today's excerpt of every group chat that has one (diary input), each
     * trimmed to its last `maxLines`, then optionally cleared. */
    takeTodayGroups(maxLines: number, clear: boolean): Array<{
        chatId: string;
        lines: ActivityLine[];
    }>;
    /** Flush pending writes (stop / tests). */
    flush(): Promise<void>;
    private scheduleSave;
    private writeNow;
}
/** Format today's excerpt for the diary prompt. */
export declare function formatTranscript(lines: readonly ActivityLine[]): string;
