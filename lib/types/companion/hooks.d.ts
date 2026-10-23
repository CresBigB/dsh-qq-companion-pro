/**
 * The companion behavior hooked into the chat bridge, kept out of the
 * upstream bridge code so upstream merges stay clean:
 *  - before a user turn: idle / periodic session renewal with a handoff
 *    recap, and the activity record (idleness, handoff, diary input);
 *  - before a final reply goes out: her reply is recorded (the「这次不回」
 *    output-protocol gate itself lives in bridge.sendToChat / output-protocol.ts
 *    so it covers every outbound text, not only final replies);
 *  - the wake-up texts of scheduled prompts and proactive check-ins;
 *  - where qq_memory_note writes (a group's own file, or the public file).
 * @module dsh-qq-companion/companion/hooks
 */
import type { ChatActivity } from './activity.js';
import type { NoteResult } from './memory.js';
import type { ScheduledPrompt } from './scheduler.js';
import type { Log } from './time.js';
export interface CompanionHooksConfig {
    ownerTitle?: string;
    idleResetHours?: number;
    privateResetDays?: number;
    groupResetDays?: number;
    publicMemoryFile?: string;
    publicMemoryMaxBytes?: number;
    groupMemoryDir?: string;
    groupMemoryMaxBytes?: number;
    /** The owner's private details group notes must not contain (besides the admin QQ numbers). */
    memoryNoteDenyWords?: string[];
}
export declare class CompanionHooks {
    private readonly config;
    private readonly activity;
    private readonly log;
    private readonly resetChat;
    private readonly now;
    private readonly adminUsers;
    constructor(options: {
        config: CompanionHooksConfig;
        activity?: ChatActivity;
        log: Log;
        resetChat: (chatId: string) => Promise<void>;
        now?: () => number;
        adminUsers?: () => readonly string[];
    });
    private get owner();
    /**
     * Before a user turn: renew the session when idle too long or past its
     * day budget (prefixing the handoff recap), then record the user line.
     * Scheduled turns (diary, check-ins) never renew and are not recorded.
     * @returns the turn text (possibly prefixed).
     */
    beforeUserTurn(chatId: string, text: string, plain: string, nickname: string, scheduled: boolean): Promise<string>;
    /** How a user line is labeled in the handoff and the diary excerpt: the
     * nickname plus the QQ number, and the owner marked as such — a nickname
     * alone let a fresh session mistake who said what. */
    private speakerLabel;
    /**
     * Before a final (humanized) reply goes out: record her line for the handoff
     * recap and the nightly diary. 不回应标记（[不回] / [不发]）在出站闸门里
     * 就已经拦掉了（见 output-protocol.ts），走不到这里。
     */
    recordFinalReply(chatId: string, text: string): void;
    /**
     * 她这次选择不回：把这条决定记进活动记录（交接与日记能看到她刚没回）。
     * 不塑造成她说了一句话，也不计入 bot 台词统计。
     */
    recordReplyPass(chatId: string, reason: string): void;
    /**
     * Before any model text goes out: cut a fabricated transcript continuation
     * (see sanitize.ts).
     * @returns the text to send ('' = nothing left to send).
     */
    cleanOutgoing(chatId: string, text: string): string;
    /** The wake-up text of one proactive check-in. */
    checkinText(context: {
        time: string;
        unanswered: number;
        lastUserAt: number | undefined;
    }): string;
    /** The text of one scheduled prompt, with today's transcript when asked
     * (taking it clears it). */
    scheduledText(prompt: ScheduledPrompt): string;
    /** The qq_memory_note writer, or undefined when no memory file is set. */
    memoryNoteWriter(): ((chatId: string, text: string, byAdmin: boolean) => Promise<NoteResult>) | undefined;
}
