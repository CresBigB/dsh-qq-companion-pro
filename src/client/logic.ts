/** 纯函数工具层：草稿/生效值/patch 之间的换算，以及 Remote 结果解包。
 *  全部模块级可测，不依赖 hooks 或副作用。 */
import { ALL_FIELDS, DEFAULTS, type OnebotField } from './fields.js'
import { MATRIX_KEYS } from '../capability-matrix.js'
import { scheduledPromptEntriesOf } from '../scheduled-prompts.js'

/** computePatch 的附加选项。 */
export interface ComputePatchOptions {
  /** 密码框输入（'' = 不修改 accessToken）。 */
  secretDraft?: string
  /** true = 显式下发 accessToken: ''（host 语义：'' = 清空）。 */
  clearSecret?: boolean
}

/** computePatch 结果。 */
export interface ComputedPatch {
  /** 与生效值有差异的键集合。 */
  patch: Record<string, unknown>
  /** 未通过客户端数字校验的键（host validatePatch 仍会二次校验）。 */
  invalidKeys: string[]
}

/** draftFromSnapshot 的入参形态（只需 config）。 */
export interface SnapshotLike {
  config?: Record<string, unknown> | null
}

/** RemoteResult 形态：{ok:true,value} | {ok:false,error:{code,message}}。 */
export interface RemoteResultLike {
  ok?: unknown
  value?: unknown
  error?: { code?: unknown; message?: unknown } | null
}

/** 占位符替换：`{word}` → params[word]（缺省保留原样）。 */
export function format(template: string, params: Record<string, unknown>): string {
  return String(template).replace(/\{(\w+)\}/g, (match: string, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match)
}

/** 任意抛出物 → 可渲染文案。 */
export function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** RemoteResult 解包：失败时抛出带 code 的 Error（面板直接渲染 message）。 */
export function unwrap(result: RemoteResultLike | null | undefined): unknown {
  if (result != null && result.ok === true) return result.value
  const detail = result != null && result.error != null ? result.error.message : 'unknown remote error'
  const error = new Error(detail as string | undefined)
  if (result != null && result.error != null && result.error.code != null) {
    ;(error as Error & { code?: unknown }).code = result.error.code
  }
  throw error
}

/** 保存冲突判定（expectedRevision ≠ 当前 revision 拒写，
 *  host 抛 RemoteError('onebot-settings/conflict')；message 兜底只匹配该错误
 *  路径本身——不过宽匹配含 revision 的无关错误）。 */
const CONFLICT_RE = /onebot-settings\/conflict/i
export function isConflictError(cause: unknown): boolean {
  if (cause == null) return false
  const error = cause as { code?: unknown; message?: unknown }
  return error.code === 'onebot-settings/conflict' || CONFLICT_RE.test(String(error.message || ''))
}

/** 标签列表的单项拆分（§4.5）：换行 / 英文逗号 / 中文逗号都算分隔符；
 *  逐项去首尾空格、丢弃空串、保序去重。纯函数，供回车 / 逗号 / 粘贴共用。 */
export function parseTagInput(text: unknown): string[] {
  const raw = String(text == null ? '' : text)
  const out: string[] = []
  for (const piece of raw.split(/[\r\n,，]+/)) {
    const item = piece.trim()
    if (item === '') continue
    if (out.indexOf(item) >= 0) continue
    out.push(item)
  }
  return out
}

/** 草稿里的标签数组形态（数组原样清洗；文本按 parseTagInput 拆分）。 */
export function tagsOf(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    const out: string[] = []
    for (const entry of raw) {
      const item = String(entry == null ? '' : entry).trim()
      if (item === '' || out.indexOf(item) >= 0) continue
      out.push(item)
    }
    return out
  }
  return parseTagInput(raw)
}

/** 追加一批标签（去重去空），返回新数组。 */
export function appendTags(list: unknown, text: unknown): string[] {
  const out = tagsOf(list)
  for (const item of parseTagInput(text)) {
    if (out.indexOf(item) < 0) out.push(item)
  }
  return out
}

/** 删除第 index 个标签，返回新数组（越界原样返回副本）。 */
export function removeTagAt(list: unknown, index: number): string[] {
  const out = tagsOf(list)
  if (Number.isInteger(index) && index >= 0 && index < out.length) out.splice(index, 1)
  return out
}

/** 单位的中文显示（§4.3 的 .qqc-unit）。 */
const UNIT_LABELS: Record<string, string> = {
  ms: '毫秒',
  s: '秒',
  min: '分钟',
  h: '小时',
  day: '天',
  byte: '字节',
  px: '像素',
  char: '字',
  count: '条',
  perDay: '次/天',
  perMin: '条/分钟',
}

/** 单位的显示文案（无单位 → ''）。 */
export function unitLabel(unit: string | undefined): string {
  if (unit == null) return ''
  return UNIT_LABELS[unit] != null ? UNIT_LABELS[unit] : unit
}

/** 一位小数、去掉尾部 .0。 */
function oneDecimal(value: number): string {
  const text = value.toFixed(1)
  return text.endsWith('.0') ? text.slice(0, -2) : text
}

/**
 * 数字字段的单位换算展示（§4.3）。返回 '= 4 MB' / '= 1.5 分钟' / '= 关闭' 这类
 * 文案；无换算（值非法、单位不支持、未到换算门槛）返回 ''。
 * 规则：0 且字段带 zeroMeans → 「= 关闭」/「= 不限」；ms 超 1000 → 秒、超 60000 → 分钟；
 * s 超 60 → 分钟；min 超 60 → 小时；h 超 24 → 天；byte 按 1024 进制 → KB / MB。
 */
export function unitConversion(field: OnebotField, raw: unknown): string {
  const text = typeof raw === 'number' ? String(raw) : String(raw == null ? '' : raw).trim()
  if (text === '') return ''
  const value = Number(text)
  if (!Number.isFinite(value)) return ''
  if (value === 0 && field.zeroMeans != null) return '= ' + field.zeroMeans
  switch (field.unit) {
    case 'ms':
      if (value >= 60000) return '= ' + oneDecimal(value / 60000) + ' 分钟'
      if (value >= 1000) return '= ' + oneDecimal(value / 1000) + ' 秒'
      return ''
    case 's':
      if (value >= 60) return '= ' + oneDecimal(value / 60) + ' 分钟'
      return ''
    case 'min':
      if (value >= 60) return '= ' + oneDecimal(value / 60) + ' 小时'
      return ''
    case 'h':
      if (value >= 24) return '= ' + oneDecimal(value / 24) + ' 天'
      return ''
    case 'byte':
      if (value >= 1024 * 1024) return '= ' + oneDecimal(value / (1024 * 1024)) + ' MB'
      if (value >= 1024) return '= ' + oneDecimal(value / 1024) + ' KB'
      return ''
    default:
      return ''
  }
}

/** 控件右侧的完整单位文案：单位 + （可选）换算结果；0 值语义优先只显示换算。 */
export function unitText(field: OnebotField, raw: unknown): string {
  const conversion = unitConversion(field, raw)
  const label = unitLabel(field.unit)
  if (conversion !== '') {
    // 0 且语义为关闭/不限：单位无意义，只显示换算。
    if (String(raw == null ? '' : raw).trim() === '0') return conversion
    return label === '' ? conversion : label + ' ' + conversion
  }
  return label
}

/** 默认值的人类可读形态（「恢复默认值」按钮的 aria-label / title）。 */
export function formatDefaultValue(field: OnebotField, value: unknown): string {
  if (field.type === 'boolean') return value === true ? '开' : '关'
  if (field.type === 'scheduleList') {
    const list = scheduledPromptEntriesOf(value)
    return list.length === 0 ? '空' : list.map(entry => entry.id + ' ' + entry.time).join('、')
  }
  if (field.type === 'stringArray') {
    const list = tagsOf(value)
    return list.length === 0 ? '空' : list.join('、')
  }
  if (value === undefined || value === null || value === '') return '空'
  return String(value)
}

/** 快照生效值 → 表单草稿（展示形态：number/stringArray/secret 均为可编辑文本；
 *  accessToken 恒 ''，明文绝不进入草稿——host 快照已脱敏）。 */
export function snapshotValueToDraft(field: OnebotField, value: unknown): unknown {
  if (field.type === 'secret') return '' // 脱敏回显：密码框恒空
  if (field.type === 'scheduleList') return scheduledPromptEntriesOf(value)
  if (field.type === 'stringArray') {
    // 权限旧规则含未来id、重复项或空白时，未触碰的配置必须原样往返。
    if (MATRIX_KEYS.some(key => key === field.key) && Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string')
    return tagsOf(value)
  }
  if (field.type === 'number') return value === undefined || value === null ? '' : String(value)
  if (field.type === 'boolean') return value === true
  return value === undefined || value === null ? '' : String(value)
}

/** 快照 → 草稿（上页的 131 键全覆盖）。 */
export function draftFromSnapshot(snapshot: SnapshotLike | null | undefined): Record<string, unknown> {
  const config = snapshot != null && snapshot.config != null ? snapshot.config : {}
  const draft: Record<string, unknown> = {}
  for (const field of ALL_FIELDS) draft[field.key] = snapshotValueToDraft(field, config[field.key])
  return draft
}

/** schema 默认值 → 草稿（「恢复默认值」按钮的唯一来源）。 */
export function draftFromDefaults(): Record<string, unknown> {
  return draftFromSnapshot({ config: DEFAULTS })
}

/** 草稿展示值 → patch 值（stringArray 文本 → 行数组；number 文本 → 数字）。 */
export function coerceValue(field: OnebotField, raw: unknown): unknown {
  if (field.type === 'number') {
    const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
    return Number.isFinite(n) ? n : NaN
  }
  if (field.type === 'boolean') return raw === true
  // 结构型列表：草稿可能含「刚添加还没填完」的行，必须原样进 patch，
  // 由 validateDraft 拦住保存；这里用宽松规范化会把用户的半成品行悄悄丢掉。
  if (field.type === 'scheduleList') {
    if (!Array.isArray(raw)) return []
    return raw.map((item) => {
      const record = typeof item === 'object' && item !== null ? item as Record<string, unknown> : {}
      return {
        id: String(record.id == null ? '' : record.id).trim(),
        time: String(record.time == null ? '' : record.time).trim(),
        chatId: String(record.chatId == null ? '' : record.chatId).trim(),
        prompt: String(record.prompt == null ? '' : record.prompt).trim(),
        includeTodayLog: record.includeTodayLog === true,
        includeGroupLogs: record.includeGroupLogs === true,
      }
    })
  }
  if (field.type === 'stringArray') {
    if (MATRIX_KEYS.some(key => key === field.key) && Array.isArray(raw)) return raw.filter((entry): entry is string => typeof entry === 'string')
    return tagsOf(raw)
  }
  return String(raw == null ? '' : raw)
}

/** 深比较（undefined 归一为 null，与 JSON 形态一致）。 */
export function valueEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b)
}

/** 旧宿主快照可能没有新配置键；缺席键既不可编辑也不可写回。 */
export function configHasKey(config: Record<string, unknown> | null | undefined, key: string): boolean {
  return config != null && Object.prototype.hasOwnProperty.call(config, key) && config[key] !== undefined
}

/**
 * 计算保存 patch（只含与生效值有差异的键）。
 * @param draft 表单草稿（snapshotValueToDraft 形态）
 * @param config 快照生效值（snapshot.config）
 * @param opts.secretDraft 密码框输入（'' = 不修改 accessToken）
 * @param opts.clearSecret true = 显式下发 accessToken: ''（host 语义：'' = 清空）
 */
export function computePatch(
  draft: Record<string, unknown>,
  config: Record<string, unknown> | null | undefined,
  opts?: ComputePatchOptions,
): ComputedPatch {
  const options: ComputePatchOptions = opts == null ? {} : opts
  const config_ = config == null ? {} : config
  const patch: Record<string, unknown> = {}
  const invalidKeys: string[] = []
  for (const field of ALL_FIELDS) {
    if (field.type === 'secret') continue // accessToken 走 secretDraft/clearSecret 专用通道
    // 新 UI 可能遇到尚未重启的旧 Remote；绝不把不支持的新增键夹带进其它设置保存。
    if (!configHasKey(config_, field.key)) continue
    const next = coerceValue(field, draft[field.key])
    if (field.type === 'number' && Number.isNaN(next)) {
      invalidKeys.push(field.key)
      continue
    }
    if (!valueEquals(next, config_[field.key])) patch[field.key] = next
  }
  const secretDraft = options.secretDraft
  if (options.clearSecret === true) patch.accessToken = '' // host 语义：'' = 清空
  else if (typeof secretDraft === 'string' && secretDraft !== '') patch.accessToken = secretDraft
  // secretDraft 为空且未勾选清除 → 不含 accessToken 键 = 不修改（host 缺省语义）
  return { patch: patch, invalidKeys: invalidKeys }
}

/**
 * 把选中的 workspace path 填入草稿（「快速填入」的唯一写入口）。
 * 纯函数、只返回新草稿对象——绝不触达 remote.updateSettings；保存仍走
 * 「保存设置」显式通道（computePatch → updateSettings）。
 */
export function fillWorkspacePath(draft: Record<string, unknown> | null | undefined, path: unknown): Record<string, unknown> {
  const next: Record<string, unknown> = Object.assign({}, draft == null ? {} : draft)
  next.workspacePath = String(path == null ? '' : path)
  return next
}