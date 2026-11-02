export interface CompanionGuideConfig {
    ownerTitle: string;
    /** The owner's QQ numbers. */
    adminUsers: readonly string[];
    /** The friend list (QQ numbers): closer than a group member, not the owner. */
    friendUsers?: readonly string[];
    /** Relation matrix: obedience of non-owners (group member / stranger). */
    memberObedience?: number;
    /** Relation matrix: obedience of a friend. */
    friendObedience?: number;
    /** Relation matrix: intimacy of a friend. */
    friendIntimacy?: number;
    publicMemoryFile: string;
    publicMemoryMaxBytes: number;
    /** The owner's private-chat workspace (its AGENTS.md is the private memory). */
    adminWorkspacePath: string;
    privateMemoryMaxBytes: number;
    groupMemoryDir: string;
    groupMemoryMaxBytes: number;
    /** T33 per-chat SQLite library directory ('' = no library, no memory tools). */
    memoryStorePath?: string;
    privateResetDays: number;
    groupResetDays: number;
    idleResetHours: number;
    groupContextLines: number;
    groupNameTriggers: readonly string[];
    groupFollowupSeconds: number;
    groupPeekEnabled: boolean;
    privateProactiveEnabled: boolean;
    privateProactiveWindowStart: string;
    privateProactiveWindowEnd: string;
    privateProactiveMaxUnanswered: number;
    groupProactiveEnabled: boolean;
    groupProactiveWindowStart: string;
    groupProactiveWindowEnd: string;
    groupProactiveMaxUnanswered: number;
    stickerDir: string;
    /** HH:MM of the nightly diary prompt ('' = none). */
    diaryTime: string;
}
/** Which chat the guide is for. */
export type GuideAudience = 'owner' | 'group' | 'other';
/** The guide text for one chat. */
export declare function buildCompanionGuide(c: CompanionGuideConfig, audience: GuideAudience): string;
