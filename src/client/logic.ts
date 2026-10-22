/** 纯函数工具层：草稿/生效值/patch 之间的换算，以及 Remote 结果解包。
 *  全部模块级可测，不依赖 hooks 或副作用。 */
import { ALL_FIELDS, DEFAULTS, type OnebotField } from './fields.js'

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

/** 快照生效值 → 表单草稿（展示形态：number/stringArray/secret 均为可编辑文本；
 *  accessToken 恒 ''，明文绝不进入草稿——host 快照已脱敏）。 */
export function snapshotValueToDraft(field: OnebotField, value: unknown): unknown {
  if (field.type === 'secret') return '' // 脱敏回显：密码框恒空
  if (field.type === 'stringArray') return Array.isArray(value) ? value.join('\n') : ''
  if (field.type === 'number') return value === undefined || value === null ? '' : String(value)
  if (field.type === 'boolean') return value === true
  return value === undefined || value === null ? '' : String(value)
}

/** 快照 → 草稿（29 键全覆盖）。 */
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
  if (field.type === 'stringArray') {
    return String(raw == null ? '' : raw).split(/\r?\n/).map(line => line.trim()).filter(line => line !== '')
  }
  return String(raw == null ? '' : raw)
}

/** 深比较（undefined 归一为 null，与 JSON 形态一致）。 */
export function valueEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b)
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