/**
 * Pure group-message reply policy.
 *
 * The policy deliberately has no runtime state: callers provide the effective
 * group/user configuration and may inject randomness for deterministic tests.
 */
export type GroupReplyMode = 'all' | 'related' | 'probability' | 'off';
export interface GroupTriggerMessage {
    groupId?: string | number;
    userId?: string | number;
    text?: string;
    /** True when the message contains an @mention of the bot. */
    mentioned?: boolean;
    /** True when the message replies to one of the bot's messages. */
    replyToBot?: boolean;
    /** True when the message addresses her without a protocol @: her name in
     * the text, or the sender of the message she answered going on (the legacy
     * '[叫到我]' / '[接着和我说]' hints). Counts as a direct trigger so the
     * default policy stays byte-for-byte the pre-policy behavior. */
    addressed?: boolean;
}
export interface GroupTriggerRule {
    mentionRequired?: boolean;
    proactiveEnabled?: boolean;
    replyMode?: GroupReplyMode;
    /** Reply probability for replyMode=probability; values are safely clamped. */
    probability?: number;
    botName?: string;
    botNames?: readonly string[];
    aliases?: readonly string[];
    botAliases?: readonly string[];
    keywords?: readonly string[];
}
/**
 * Configuration for group triggering.
 *
 * Direct fields are the defaults. `groups`/`groupDefaults` provide a group
 * layer and `users`/`userOverrides` provide a user layer; the user layer wins.
 * The extra alias names keep this small pure module convenient for callers
 * that already use either vocabulary.
 */
export interface GroupTriggerConfig extends GroupTriggerRule {
    groups?: Readonly<Record<string, GroupTriggerRule>>;
    groupDefaults?: Readonly<Record<string, GroupTriggerRule>>;
    users?: Readonly<Record<string, GroupTriggerRule>>;
    userOverrides?: Readonly<Record<string, GroupTriggerRule>>;
}
export type GroupTriggerReason = 'off' | 'mention-required' | 'proactive-disabled' | 'unrelated' | 'all' | 'related' | 'probability';
export interface GroupTriggerEvaluation {
    shouldReply: boolean;
    reason: GroupTriggerReason;
    related: boolean;
}
interface EvaluationInput {
    config: GroupTriggerConfig;
    message: GroupTriggerMessage;
    random?: () => number;
}
/** Evaluate one message without mutating the supplied config or message. */
export declare function evaluateGroupTrigger(input: EvaluationInput): GroupTriggerEvaluation;
export declare function evaluateGroupTrigger(config: GroupTriggerConfig, message: GroupTriggerMessage, random?: () => number): GroupTriggerEvaluation;
/** Boolean convenience seam for inbound callers. */
export declare function shouldReply(input: EvaluationInput): boolean;
export declare function shouldReply(config: GroupTriggerConfig, message: GroupTriggerMessage, random?: () => number): boolean;
export default evaluateGroupTrigger;
