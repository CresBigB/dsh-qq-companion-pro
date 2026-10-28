/**
 * Pure group-message reply policy.
 *
 * The policy deliberately has no runtime state: callers provide the effective
 * group/user configuration and may inject randomness for deterministic tests.
 */

export type GroupReplyMode = 'all' | 'related' | 'probability' | 'off'

export interface GroupTriggerMessage {
  groupId?: string | number
  userId?: string | number
  text?: string
  /** True when the message contains an @mention of the bot. */
  mentioned?: boolean
  /** True when the message replies to one of the bot's messages. */
  replyToBot?: boolean
  /** True when the message addresses her without a protocol @: her name in
   * the text, or the sender of the message she answered going on (the legacy
   * '[叫到我]' / '[接着和我说]' hints). Counts as a direct trigger so the
   * default policy stays byte-for-byte the pre-policy behavior. */
  addressed?: boolean
}

export interface GroupTriggerRule {
  mentionRequired?: boolean
  /** Allow replying to a group message that neither mentions her nor relates to
   * her. Replaces the old `proactiveEnabled` name inside the JSON policy, which
   * collided with the proactive-chat master switch. */
  replyWithoutMention?: boolean
  /** @deprecated legacy name of `replyWithoutMention`; still honored. */
  proactiveEnabled?: boolean
  replyMode?: GroupReplyMode
  /** Reply probability for replyMode=probability; values are safely clamped. */
  probability?: number
  botName?: string
  botNames?: readonly string[]
  aliases?: readonly string[]
  botAliases?: readonly string[]
  keywords?: readonly string[]
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
  groups?: Readonly<Record<string, GroupTriggerRule>>
  groupDefaults?: Readonly<Record<string, GroupTriggerRule>>
  users?: Readonly<Record<string, GroupTriggerRule>>
  userOverrides?: Readonly<Record<string, GroupTriggerRule>>
}

export type GroupTriggerReason =
  | 'off'
  | 'mention-required'
  | 'unprompted-disabled'
  | 'unrelated'
  | 'all'
  | 'related'
  | 'probability'

export interface GroupTriggerEvaluation {
  shouldReply: boolean
  reason: GroupTriggerReason
  related: boolean
}

interface EvaluationInput {
  config: GroupTriggerConfig
  message: GroupTriggerMessage
  random?: () => number
}

type EvaluateArgs = EvaluationInput | GroupTriggerConfig

const DEFAULTS: Required<Pick<GroupTriggerRule, 'mentionRequired' | 'replyWithoutMention' | 'replyMode' | 'probability'>> = {
  mentionRequired: true,
  replyWithoutMention: false,
  replyMode: 'all',
  probability: 1,
}

const asKey = (value: string | number | undefined): string => value === undefined ? '' : String(value)

const ownRule = (value: unknown): GroupTriggerRule | undefined =>
  value !== null && typeof value === 'object' ? value as GroupTriggerRule : undefined

const mergeRule = (...rules: readonly (GroupTriggerRule | undefined)[]): GroupTriggerRule => {
  const result: GroupTriggerRule = {}
  for (const rule of rules) {
    if (rule === undefined) continue
    Object.assign(result, rule)
  }
  return result
}

const finiteProbability = (value: number | undefined): number => {
  if (value === undefined || !Number.isFinite(value)) return DEFAULTS.probability
  return Math.max(0, Math.min(1, value))
}

const nonEmptyStrings = (values: readonly (string | undefined)[]): string[] =>
  values.filter((value): value is string => typeof value === 'string' && value.length > 0)

const directlyTriggered = (message: GroupTriggerMessage): boolean =>
  message.mentioned === true || message.replyToBot === true || message.addressed === true

const relatedToBot = (message: GroupTriggerMessage, rule: GroupTriggerRule): boolean => {
  if (directlyTriggered(message)) return true
  const text = typeof message.text === 'string' ? message.text.toLocaleLowerCase() : ''
  if (text === '') return false
  const names = nonEmptyStrings([
    rule.botName,
    ...(rule.botNames ?? []),
    ...(rule.aliases ?? []),
    ...(rule.botAliases ?? []),
  ]).map(value => value.toLocaleLowerCase())
  const keywords = nonEmptyStrings([...(rule.keywords ?? [])]).map(value => value.toLocaleLowerCase())
  return [...names, ...keywords].some(value => text.includes(value))
}

const resolve = (config: GroupTriggerConfig, message: GroupTriggerMessage): GroupTriggerRule => {
  const groupId = asKey(message.groupId)
  const userId = asKey(message.userId)
  const groupRule = ownRule(config.groups?.[groupId]) ?? ownRule(config.groupDefaults?.[groupId])
  const userRule = ownRule(config.users?.[userId]) ?? ownRule(config.userOverrides?.[userId])
  // A user override nested in a group is useful for a per-group exception and
  // does not mutate either source object.
  const nestedUserRule = groupRule !== undefined
    ? ownRule((groupRule as GroupTriggerRule & { users?: Readonly<Record<string, GroupTriggerRule>> }).users?.[userId])
    : undefined
  return mergeRule(config, groupRule, userRule, nestedUserRule)
}

const unpack = (first: EvaluateArgs, second?: GroupTriggerMessage, third?: () => number): EvaluationInput => {
  if ('config' in first && 'message' in first) return first
  return { config: first, message: second ?? {}, random: third }
}

/** Evaluate one message without mutating the supplied config or message. */
export function evaluateGroupTrigger(input: EvaluationInput): GroupTriggerEvaluation
export function evaluateGroupTrigger(config: GroupTriggerConfig, message: GroupTriggerMessage, random?: () => number): GroupTriggerEvaluation
export function evaluateGroupTrigger(first: EvaluateArgs, second?: GroupTriggerMessage, third?: () => number): GroupTriggerEvaluation {
  const { config, message, random } = unpack(first, second, third)
  const rule = resolve(config, message)
  const mentionRequired = rule.mentionRequired ?? DEFAULTS.mentionRequired
  const allowUnprompted = rule.replyWithoutMention ?? rule.proactiveEnabled ?? DEFAULTS.replyWithoutMention
  // An explicit probability with no explicit mode means probability mode: a bare
  // `probability` would otherwise be silently ignored by the 'all' default.
  const mode = rule.replyMode ?? (rule.probability !== undefined ? 'probability' : DEFAULTS.replyMode)
  const related = relatedToBot(message, rule)

  if (mode === 'off') return { shouldReply: false, reason: 'off', related }
  if (mentionRequired && !directlyTriggered(message)) {
    return { shouldReply: false, reason: 'mention-required', related }
  }
  if (!allowUnprompted && !related) return { shouldReply: false, reason: 'unprompted-disabled', related }
  if (mode === 'all') return { shouldReply: true, reason: 'all', related }
  if (mode === 'related') return related
    ? { shouldReply: true, reason: 'related', related }
    : { shouldReply: false, reason: 'unrelated', related }

  const probability = finiteProbability(rule.probability)
  if (probability <= 0) return { shouldReply: false, reason: 'probability', related }
  if (probability >= 1) return { shouldReply: true, reason: 'probability', related }
  return { shouldReply: (random ?? Math.random)() < probability, reason: 'probability', related }
}

/** Boolean convenience seam for inbound callers. */
export function shouldReply(input: EvaluationInput): boolean
export function shouldReply(config: GroupTriggerConfig, message: GroupTriggerMessage, random?: () => number): boolean
export function shouldReply(first: EvaluateArgs, second?: GroupTriggerMessage, third?: () => number): boolean {
  return evaluateGroupTrigger(unpack(first, second, third)).shouldReply
}

export default evaluateGroupTrigger
