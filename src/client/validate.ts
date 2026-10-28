/**
 * 实时校验与危险改动检测（《前端设计规范》§5.4 / §5.5）——纯函数，模块级可测。
 *
 * - `validateDraft(draft)`：草稿 → `{ 键: 错误文案 }`。文案走词条（`validate.*`），
 *   缺省用 zh 词条兜底，面板传入宿主的 `t` 后自动跟随语言。
 * - `collectRisks(draft, config)`：草稿 + 生效值 → 风险清单（`risk.*` 词条 key +
 *   涉及字段）。「没改动就不算风险」由这里统一把关：只有草稿 ≠ 生效值的字段才
 *   会走到字段元数据的 `danger()`，所以已经是 open+allowAllUsers 的生效配置不会
 *   弹窗。
 *
 * 两者都不持有状态、不碰 DOM，可以在 Node 里直接跑。
 */
import { ALL_FIELDS, draftNumber, type FieldMeta } from './fields.js'
import { MATRIX_KEYS } from '../capability-matrix.js'
import { zh } from './i18n.js'
import { coerceValue, format, tagsOf, valueEquals } from './logic.js'

/** 翻译函数签名（与 render.ts 同形；缺省读 zh 词条）。 */
export type Translate = (key: string) => string

/** 缺省翻译：直接读 zh 词条。 */
function fallbackTranslate(key: string): string {
  return zh[key] != null ? zh[key] : key
}

/** HH:MM（00:00–23:59）。 */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
/** HH:MM，额外允许 24:00（§4.4 的 time24）。 */
const TIME24_RE = /^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/

/** 文本里的值（nullish → ''）。 */
function textOf(values: Record<string, unknown>, key: string): string {
  const raw = values[key]
  return String(raw == null ? '' : raw).trim()
}

/** HH:MM → 当天第几分钟（24:00 = 1440）。 */
function minutesOf(text: string): number {
  const parts = text.split(':')
  return Number(parts[0]) * 60 + Number(parts[1])
}

/** 单个字段的校验（数字 / 端口 / 时间）。不涉及跨字段规则。 */
function validateField(field: FieldMeta, values: Record<string, unknown>, t: Translate): string | null {
  if (field.type === 'number') {
    const text = textOf(values, field.key)
    if (text === '') return t('validate.number')
    const value = Number(text)
    if (!Number.isFinite(value)) return t('validate.number')
    // §5.4：port 单列一条文案（1–65535），不走通用的 min/max 文案。
    if (field.key === 'port') return value < 1 || value > 65535 ? t('validate.port') : null
    const min = field.min == null ? 0 : field.min
    if (value < min) return format(t('validate.min'), { min: min })
    if (field.max != null && value > field.max) return format(t('validate.max'), { max: field.max })
    return null
  }
  if (field.control === 'time' || field.control === 'time24') {
    const text = textOf(values, field.key)
    const pattern = field.control === 'time24' ? TIME24_RE : TIME_RE
    if (pattern.test(text)) return null
    return t(field.control === 'time24' ? 'validate.time24' : 'validate.time')
  }
  return null
}

/** 时间窗规则：结束必须晚于开始（错误标在结束字段上）。 */
function applyWindowRule(
  values: Record<string, unknown>,
  startKey: string,
  endKey: string,
  errors: Record<string, string>,
  t: Translate,
): void {
  if (errors[startKey] != null || errors[endKey] != null) return
  const start = textOf(values, startKey)
  const end = textOf(values, endKey)
  if (!TIME24_RE.test(start) || !TIME24_RE.test(end)) return
  if (minutesOf(end) <= minutesOf(start)) errors[endKey] = t('validate.window')
}

/** 有序对规则：low 不得超过 high（错误标在 high 字段上）。 */
function applyOrderRule(
  values: Record<string, unknown>,
  lowKey: string,
  highKey: string,
  errors: Record<string, string>,
  t: Translate,
  messageKey: string,
): void {
  if (errors[lowKey] != null || errors[highKey] != null) return
  const low = draftNumber(values, lowKey)
  const high = draftNumber(values, highKey)
  if (!Number.isFinite(low) || !Number.isFinite(high)) return
  if (low > high) errors[highKey] = t(messageKey)
}

/**
 * 校验整份草稿（§5.4 全部规则，含三条跨字段规则）。
 * @param draft 表单草稿（snapshotValueToDraft 形态）
 * @param t 翻译函数（缺省 zh 词条）
 * @returns 键 → 错误文案（空对象 = 全部合法）
 */
export function validateDraft(draft: Record<string, unknown> | null | undefined, t?: Translate): Record<string, string> {
  const translate: Translate = typeof t === 'function' ? t : fallbackTranslate
  const values = draft == null ? {} : draft
  const errors: Record<string, string> = {}
  for (const field of ALL_FIELDS) {
    const message = validateField(field, values, translate)
    if (message != null) errors[field.key] = message
  }
  // 跨字段 1/2：各时间窗（私聊主动、群聊主动、groupPeek）。
  applyWindowRule(values, 'privateProactiveWindowStart', 'privateProactiveWindowEnd', errors, translate)
  applyWindowRule(values, 'groupProactiveWindowStart', 'groupProactiveWindowEnd', errors, translate)
  applyWindowRule(values, 'groupPeekWindowStart', 'groupPeekWindowEnd', errors, translate)
  // 跨字段 3/4：次数区间与打字节奏区间（最少 / 最短 ≤ 最多 / 最长）。
  applyOrderRule(values, 'privateProactiveMinPerDay', 'privateProactiveMaxPerDay', errors, translate, 'validate.proactiveMinMax')
  applyOrderRule(values, 'groupProactiveMinPerDay', 'groupProactiveMaxPerDay', errors, translate, 'validate.proactiveMinMax')
  applyOrderRule(values, 'typingDelayMinMs', 'typingDelayMaxMs', errors, translate, 'validate.typingDelay')
  return errors
}

/** 一条风险：涉及的字段（跨字段规则会有多个）+ 说明词条 key。 */
export interface RiskEntry {
  /** 触发这条风险的字段 key（跨字段规则会有多个，按字段表顺序）。 */
  keys: string[]
  /** 对话框里的字段名（多个字段用「 / 」连起来）。 */
  label: string
  /** 说明的词条 key（`risk.*`），由视图用 t() 解析。 */
  messageKey: string
}

/** collectRisks 的附加选项。 */
export interface CollectRisksOptions {
  /** true = 用户点了「清空」密钥（accessToken 走这条专用通道，不进草稿）。 */
  clearSecret?: boolean
}

/**
 * 收集草稿里的危险改动（§5.5 全部触发条件 + §3.3 的 memberPermission 两档）。
 * @param draft 表单草稿
 * @param config 快照生效值（判断「有没有改动」）
 * @param opts.clearSecret 密钥的「清空」意图
 * @returns 风险清单（空数组 = 无风险，可直接保存）
 */
export function collectRisks(
  draft: Record<string, unknown> | null | undefined,
  config: Record<string, unknown> | null | undefined,
  opts?: CollectRisksOptions,
): RiskEntry[] {
  const values = draft == null ? {} : draft
  const effective = config == null ? {} : config
  const clearSecret = opts != null && opts.clearSecret === true
  const risks: RiskEntry[] = []
  const byMessage: Record<string, RiskEntry> = {}

  const push = (field: FieldMeta, message: string): void => {
    const existing = byMessage[message]
    if (existing == null) {
      const entry: RiskEntry = { keys: [field.key], label: field.label, messageKey: message }
      byMessage[message] = entry
      risks.push(entry)
      return
    }
    // 同一条规则被多个字段触发（如 dmPolicy + allowAllUsers）：合并成一条。
    if (existing.keys.indexOf(field.key) >= 0) return
    existing.keys.push(field.key)
    existing.label = existing.label + ' / ' + field.label
  }

  for (const field of ALL_FIELDS) {
    if (MATRIX_KEYS.some(key => key === field.key)) {
      const before = tagsOf(effective[field.key])
      const after = tagsOf(values[field.key])
      const expands = field.key.endsWith('Deny')
        ? before.some(id => !after.includes(id))
        : after.some(id => !before.includes(id))
      if (expands) push(field, 'risk.capabilityGrant')
    }
    if (typeof field.danger !== 'function') continue
    if (field.type === 'secret') {
      // 密钥永远不回显明文：草稿恒为 ''，改动的唯一形态是「清空」标记。
      if (!clearSecret) continue
      const message = field.danger(textOf(values, field.key), effective[field.key], values)
      if (message != null && message !== '') push(field, message)
      continue
    }
    const next = coerceValue(field, values[field.key])
    if (field.type === 'number' && Number.isNaN(next)) continue // 非法数字交给 validateDraft
    if (valueEquals(next, effective[field.key])) continue // 没改动就不算风险
    const message = field.danger(next, effective[field.key], values)
    if (message != null && message !== '') push(field, message)
  }
  return risks
}

/** 便捷：草稿触发危险的字段 key 集合（行徽标用）。 */
export function riskFieldKeys(risks: RiskEntry[]): string[] {
  const out: string[] = []
  for (const risk of risks == null ? [] : risks) {
    for (const key of risk.keys) if (out.indexOf(key) < 0) out.push(key)
  }
  return out
}