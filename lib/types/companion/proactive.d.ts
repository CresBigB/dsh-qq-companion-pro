import type { ChatActivity } from './activity.js';
import type { Log } from './time.js';
export interface ProactiveConfig {
    /** Every chat she may reach out to: `private:<QQ>` / `group:<id>`. */
    targets?: readonly string[];
    /** Local window, HH:MM–HH:MM. */
    windowStart: string;
    windowEnd: string;
    /** Wake-ups per chat per day, picked at random in [min, max]. */
    minPerDay: number;
    maxPerDay: number;
    /** Minimum minutes between two wake-ups. */
    minGapMinutes: number;
    /** Skip a wake-up when that chat had activity within this many minutes. */
    skipIfActiveMinutes: number;
    /** Stop for the day after this many unanswered proactive messages. */
    maxUnanswered: number;
}
/**
 * The chats a config names, in order, blanks dropped and duplicates removed.
 */
export declare function proactiveTargetsOf(config: Pick<ProactiveConfig, 'targets'>): string[];
/** The reply that means "nothing to say this time" — never sent to QQ.
 * The literal lives in output-protocol.ts ({@link PASS_MARKER}) so the outbound
 * gate and this marker can never drift apart. */
export declare const PROACTIVE_PASS = "[\u4E0D\u53D1]";
/**
 * True when a final reply is the pass marker (whitespace / brackets tolerant).
 *
 * ⚠ 判定已统一到 `output-protocol.ts` 的 `parseReplyPass`（它同时认 `[不回:原因]`，
 * 且在 `bridge.sendToChat` 的出站闸门里对所有出站文本生效）。这个函数只为兼容
 * 保留：新代码请用 parseReplyPass，别再在这里加第三种判定。
 */
export declare function isProactivePass(text: string): boolean;
/**
 * Pick `count` minutes-of-day in [start, end) at least `gap` apart, at
 * random. Returns fewer when the window cannot fit them.
 */
export declare function pickCheckinTimes(start: number, end: number, count: number, gap: number, random?: () => number): number[];
/** Wakes her a few random times a day inside the window (see ProactiveConfig).
 * Every chat gets its own plan, its own daily count and its own
 * stop-after-unanswered bookkeeping, so adding a group never shifts the
 * private chat's schedule. */
export declare class ProactiveScheduler {
    private readonly config;
    private readonly fire;
    private readonly activity;
    private readonly log;
    private readonly now;
    private readonly random;
    private readonly targets;
    /** Per-chat state; a missing or stale entry means "not planned yet today". */
    private readonly plans;
    private timer;
    private readonly state;
    constructor(options: {
        config: ProactiveConfig;
        activity: ChatActivity;
        fire: (chatId: string, context: {
            time: string;
            unanswered: number;
            lastUserAt: number | undefined;
        }) => Promise<void>;
        log: Log;
        now?: () => number;
        random?: () => number;
        /** Persist today's plans and fired counts (a restart keeps them). */
        stateFile?: string;
    });
    /** Restore today's plans from the state file (a restart mid-day keeps the
     * remaining slots and the counts instead of drawing a fresh day). */
    load(): Promise<void>;
    /** Snapshot for /doctor (summed over every chat). */
    snapshot(): {
        day: string;
        remaining: string[];
        firedToday: number;
    };
    /** Read one stored plan, tolerating an older or corrupt shape. */
    private readPlan;
    private persist;
    start(intervalMs?: number): void;
    stop(): void;
    /** Today's remaining wake-up times as HH:MM (chat-prefixed when several
     * chats are configured, so /task never shows two indistinguishable slots). */
    remaining(): string[];
    /** Wake her right now in every configured chat (the /task checkin test hook):
     * the hard rules still apply except the time plan. */
    fireNow(): Promise<void>;
    /** One check over every chat (exported for tests). */
    tick(): Promise<void>;
    private ensurePlan;
}
