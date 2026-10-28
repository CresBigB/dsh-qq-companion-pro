/**
 * Pure group-message reply policy.
 *
 * The policy deliberately has no runtime state: callers provide the effective
 * group/user configuration and may inject randomness for deterministic tests.
 */
const DEFAULTS = {
    mentionRequired: true,
    replyWithoutMention: false,
    replyMode: 'all',
    probability: 1,
};
const asKey = (value) => value === undefined ? '' : String(value);
const ownRule = (value) => value !== null && typeof value === 'object' ? value : undefined;
const mergeRule = (...rules) => {
    const result = {};
    for (const rule of rules) {
        if (rule === undefined)
            continue;
        Object.assign(result, rule);
    }
    return result;
};
const finiteProbability = (value) => {
    if (value === undefined || !Number.isFinite(value))
        return DEFAULTS.probability;
    return Math.max(0, Math.min(1, value));
};
const nonEmptyStrings = (values) => values.filter((value) => typeof value === 'string' && value.length > 0);
const directlyTriggered = (message) => message.mentioned === true || message.replyToBot === true || message.addressed === true;
const relatedToBot = (message, rule) => {
    if (directlyTriggered(message))
        return true;
    const text = typeof message.text === 'string' ? message.text.toLocaleLowerCase() : '';
    if (text === '')
        return false;
    const names = nonEmptyStrings([
        rule.botName,
        ...(rule.botNames ?? []),
        ...(rule.aliases ?? []),
        ...(rule.botAliases ?? []),
    ]).map(value => value.toLocaleLowerCase());
    const keywords = nonEmptyStrings([...(rule.keywords ?? [])]).map(value => value.toLocaleLowerCase());
    return [...names, ...keywords].some(value => text.includes(value));
};
const resolve = (config, message) => {
    const groupId = asKey(message.groupId);
    const userId = asKey(message.userId);
    const groupRule = ownRule(config.groups?.[groupId]) ?? ownRule(config.groupDefaults?.[groupId]);
    const userRule = ownRule(config.users?.[userId]) ?? ownRule(config.userOverrides?.[userId]);
    // A user override nested in a group is useful for a per-group exception and
    // does not mutate either source object.
    const nestedUserRule = groupRule !== undefined
        ? ownRule(groupRule.users?.[userId])
        : undefined;
    return mergeRule(config, groupRule, userRule, nestedUserRule);
};
const unpack = (first, second, third) => {
    if ('config' in first && 'message' in first)
        return first;
    return { config: first, message: second ?? {}, random: third };
};
export function evaluateGroupTrigger(first, second, third) {
    const { config, message, random } = unpack(first, second, third);
    const rule = resolve(config, message);
    const mentionRequired = rule.mentionRequired ?? DEFAULTS.mentionRequired;
    const allowUnprompted = rule.replyWithoutMention ?? rule.proactiveEnabled ?? DEFAULTS.replyWithoutMention;
    // An explicit probability with no explicit mode means probability mode: a bare
    // `probability` would otherwise be silently ignored by the 'all' default.
    const mode = rule.replyMode ?? (rule.probability !== undefined ? 'probability' : DEFAULTS.replyMode);
    const related = relatedToBot(message, rule);
    if (mode === 'off')
        return { shouldReply: false, reason: 'off', related };
    if (mentionRequired && !directlyTriggered(message)) {
        return { shouldReply: false, reason: 'mention-required', related };
    }
    if (!allowUnprompted && !related)
        return { shouldReply: false, reason: 'unprompted-disabled', related };
    if (mode === 'all')
        return { shouldReply: true, reason: 'all', related };
    if (mode === 'related')
        return related
            ? { shouldReply: true, reason: 'related', related }
            : { shouldReply: false, reason: 'unrelated', related };
    const probability = finiteProbability(rule.probability);
    if (probability <= 0)
        return { shouldReply: false, reason: 'probability', related };
    if (probability >= 1)
        return { shouldReply: true, reason: 'probability', related };
    return { shouldReply: (random ?? Math.random)() < probability, reason: 'probability', related };
}
export function shouldReply(first, second, third) {
    return evaluateGroupTrigger(unpack(first, second, third)).shouldReply;
}
export default evaluateGroupTrigger;
