/** Lines kept per group. */
export declare const GROUP_BUFFER_LINES = 40;
/** Lines attached to a look or a self-started turn when the count is 0. */
export declare const PEEK_CONTEXT_LINES = 20;
export interface GroupChatterConfig {
    /** Unseen lines attached when she is called (0 = off). */
    contextLines: number;
    /** Names that call her without an @ (empty = off). */
    names: readonly string[];
    /** Seconds after her reply during which the person she answered may go on without an @ (0 = off). */
    followupSeconds: number;
    /** Periodic looks at lively groups. */
    peekEnabled: boolean;
    /** Minutes between two looks at the same group. */
    peekGapMinutes: number;
    /** New lines (since her last look or reply) a group needs before a look. */
    peekMinMessages: number;
    /** No look while she talked in the group within this many minutes. */
    peekQuietMinutes: number;
    /** Local HH:MM window for looks (end may be 24:00). */
    peekWindowStart: string;
    peekWindowEnd: string;
}
export interface GroupLine {
    t: number;
    userId: string;
    nickname: string;
    text: string;
}
export declare class GroupChatter {
    private readonly config;
    private readonly now;
    private readonly groups;
    constructor(options: {
        config: GroupChatterConfig;
        now?: () => number;
    });
    private state;
    /** Groups that have sent anything since startup. */
    knownGroups(): string[];
    /** Keep one group message (every allowed one, called or not). */
    observe(groupId: string, userId: string, nickname: string, text: string): void;
    /** Whether the text calls her by one of her names. */
    callsByName(text: string): boolean;
    /** Whether this person is still talking with her (she answered them moments ago). */
    isFollowup(groupId: string, userId: string): boolean;
    /** She is about to answer `userId` in this group. */
    noteCalled(groupId: string, userId: string): void;
    /** She sent a message in this group: the window of the person she is
     * answering restarts (the others keep their own clocks). */
    noteSpoke(groupId: string): void;
    /** The newest `count` buffered lines (`dropNewest` removes the message she is
     * answering right now), formatted as the context block. '' = nothing to add. */
    private contextBlock;
    /**
     * The context block of a call: the newest `contextLines` lines the group has
     * seen, the calling message itself excluded (it rides the message she
     * answers). The same lines come back on the next call too — the block always
     * describes the tail of the conversation, not "what is new since last time".
     * '' = the count is 0 or nothing is buffered.
     */
    takeContext(groupId: string): string;
    /**
     * The context block of a turn she starts herself (a look, a self-started
     * group message): the newest `contextLines` lines, or PEEK_CONTEXT_LINES when
     * the count is 0. Nothing is consumed: the next turn sees the same tail.
     */
    recentContext(groupId: string): string;
    /** Groups due for a look now, among `groupIds`. */
    peekDue(groupIds: readonly string[]): string[];
    /** The wake-up text of one look (marks the lines seen); '' = nothing new. */
    takePeek(groupId: string, pass: string): string;
}
