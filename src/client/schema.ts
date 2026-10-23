/**
 * 极简 schema 校验（替代 zod，供 Typert 严格 codec 使用）+ Remote 契约
 * descriptor。
 *
 * descriptor 与 host lib/settings-remote.ts 的服务方法面逐字对齐：
 * getSettings() / updateSettings(patch, expectedRevision) / listWorkspaces()，
 * 全 positional（宿主网关 methodParameterNames 拒绝解构/默认值/rest）。
 * host 侧未导出客户端 descriptor 数组——两侧各自持有一份，本文件为客户端
 * 真相源，变更须同步宿主侧；tests/client-settings.spec.ts 做契约核对。
 */
import { PLUGIN_ID, REMOTE_NS } from './constants.js'

/** 一个可 parse 的校验器（`parse` 失败抛 TypeError，与 zod 用法一致）。 */
export interface Schema<T> {
  parse(value: unknown): T
}

/** 长度区间字符串。 */
export function vString(min: number, max: number): Schema<string> {
  return {
    parse(value) {
      if (typeof value !== 'string' || value.length < min || value.length > max) {
        throw new TypeError('expected string(' + min + '..' + max + ')')
      }
      return value
    },
  }
}

/** ≥ min 的整数。 */
export function vInt(min: number): Schema<number> {
  return {
    parse(value) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
        throw new TypeError('expected int>=' + min)
      }
      return value
    },
  }
}

/** 有限数（可选上下界）。 */
export function vNumber(min?: number, max?: number): Schema<number> {
  return {
    parse(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('expected finite number')
      if (min !== undefined && value < min) throw new TypeError('expected number >= ' + min)
      if (max !== undefined && value > max) throw new TypeError('expected number <= ' + max)
      return value
    },
  }
}

/** 布尔。 */
export function vBoolean(): Schema<boolean> {
  return {
    parse(value) {
      if (typeof value !== 'boolean') throw new TypeError('expected boolean')
      return value
    },
  }
}

/** 数组（逐项 parse）。 */
export function vArray<T>(item: Schema<T>): Schema<T[]> {
  return {
    parse(value) {
      if (!Array.isArray(value)) throw new TypeError('expected array')
      return value.map(entry => item.parse(entry))
    },
  }
}

/** 可选字段：缺席（undefined/null）时保持缺席，不参与 parse。 */
export function vOptional<T>(inner: Schema<T>): Schema<T | undefined> {
  return {
    parse(value) {
      if (value === undefined || value === null) return undefined
      return inner.parse(value)
    },
  }
}

/** 对象校验器：额外公开声明的键集，供契约测试核对「schema 键集 ≡ ALL_KEYS」
 *  （宿主快照里返回了但 schema 没声明的键会被 vObject 静默丢弃，靠这条守住）。 */
export interface ObjectSchema extends Schema<Record<string, unknown>> {
  readonly keys: readonly string[]
}

/** 与 zod object 默认行为一致：声明外字段剥离，声明内字段逐个 parse。 */
export function vObject(shape: Record<string, Schema<unknown>>): ObjectSchema {
  const keys = Object.keys(shape)
  return {
    keys: keys,
    parse(value) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('expected object')
      }
      const source = value as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const key of keys) out[key] = shape[key].parse(source[key])
      return out
    },
  }
}

/** 字符串枚举。 */
export function vEnum(values: string[]): Schema<string> {
  return {
    parse(value) {
      if (typeof value !== 'string' || values.indexOf(value) < 0) {
        throw new TypeError('expected one of ' + values.join('|'))
      }
      return value
    },
  }
}

/** 设置页上页 102 键的「非可选」校验器（顺序同宿主 ALL_KEYS；键名只在这里
 *  出现一次，patchSchema 由同一份 shape 逐键派生，两侧键集天然一致）。
 *  类型与宿主 Config 一致；数字区间与宿主 numberRange 一致：port 1–65535，
 *  其余（时长 / 次数 / 字节数 / 像素）≥ 0。 */
const CONFIG_SHAPE: Record<string, Schema<unknown>> = {
  // connection（6）
  host: vString(0, 256),
  port: vNumber(1, 65535),
  accessToken: vString(0, 256),
  botQQ: vString(0, 64),
  workspacePath: vString(0, 1024),
  attachWorkspaceMode: vEnum(['existing', 'auto', 'off']),
  // access（10）
  adminUsers: vArray(vString(0, 64)),
  dmPolicy: vEnum(['open', 'allowlist', 'disabled']),
  allowFrom: vArray(vString(0, 64)),
  allowAllUsers: vBoolean(),
  groupPolicy: vEnum(['open', 'allowlist', 'disabled']),
  groupAllowFrom: vArray(vString(0, 64)),
  requireMention: vBoolean(),
  restrictedMemberPrefix: vBoolean(),
  autoAcceptAdminRequests: vBoolean(),
  autoAllowInvitedGroups: vBoolean(),
  // persona（7）
  ownerTitle: vString(0, 1024),
  agentPreset: vString(0, 1024),
  adminPreset: vString(0, 1024),
  adminPermission: vString(0, 1024),
  memberPermission: vString(0, 1024),
  adminWorkspacePath: vString(0, 1024),
  groupReasoningEffort: vEnum(['', 'off', 'low', 'high', 'max']),
  // messaging（15）
  splitLines: vBoolean(),
  splitMaxMessages: vNumber(0),
  groupSplitLines: vBoolean(),
  humanTypingPace: vBoolean(),
  typingDelayPerCharMs: vNumber(0),
  typingDelayMinMs: vNumber(0),
  typingDelayMaxMs: vNumber(0),
  textImageThreshold: vNumber(0),
  cardFooter: vString(0, 1024),
  fontFiles: vArray(vString(0, 1024)),
  fontFamilies: vArray(vString(0, 1024)),
  interimMessages: vBoolean(),
  interimRecall: vBoolean(),
  interimRecallMs: vNumber(0),
  sendErrorNotice: vBoolean(),
  // conversation（12）
  newMessagePolicy: vEnum(['queue', 'steer']),
  autoSteerPolicy: vEnum(['admin', 'all']),
  deferredTimeoutMs: vNumber(0),
  unknownCommand: vEnum(['intercept', 'passthrough']),
  rateLimitPerMinute: vNumber(0),
  idleResetHours: vNumber(0),
  privateResetDays: vNumber(0),
  groupResetDays: vNumber(0),
  sessionTitleTemplate: vString(0, 1024),
  privateSessionKeepDays: vNumber(0),
  groupSessionKeepDays: vNumber(0),
  chatIdleEvictDays: vNumber(0),
  // group（10）
  groupNameTriggers: vArray(vString(0, 1024)),
  groupFollowupSeconds: vNumber(0),
  groupContextLines: vNumber(0),
  groupAutoQuote: vEnum(['off', 'busy', 'always']),
  groupPeekEnabled: vBoolean(),
  groupPeekGapMinutes: vNumber(0),
  groupPeekMinMessages: vNumber(0),
  groupPeekQuietMinutes: vNumber(0),
  groupPeekWindowStart: vString(0, 1024),
  groupPeekWindowEnd: vString(0, 1024),
  // memory（6）
  publicMemoryFile: vString(0, 1024),
  publicMemoryMaxBytes: vNumber(0),
  groupMemoryDir: vString(0, 1024),
  groupMemoryMaxBytes: vNumber(0),
  privateMemoryMaxBytes: vNumber(0),
  memoryNoteDenyWords: vArray(vString(0, 1024)),
  // proactive（9）
  proactiveEnabled: vBoolean(),
  proactiveChatId: vString(0, 1024),
  proactiveWindowStart: vString(0, 1024),
  proactiveWindowEnd: vString(0, 1024),
  proactiveMinPerDay: vNumber(0),
  proactiveMaxPerDay: vNumber(0),
  proactiveMinGapMinutes: vNumber(0),
  proactiveSkipIfActiveMinutes: vNumber(0),
  proactiveMaxUnanswered: vNumber(0),
  // media（20）
  stickerDir: vString(0, 1024),
  stickerMaxCount: vNumber(0),
  stickerMaxBytes: vNumber(0),
  stickerDailyMax: vNumber(0),
  sttEnabled: vBoolean(),
  sttEngine: vEnum(['auto', 'sherpa-onnx', 'whisper-cpp', 'command', 'openai', 'custom']),
  sttModel: vString(0, 1024),
  sttCommand: vString(0, 1024),
  sttArgs: vArray(vString(0, 1024)),
  sttLanguage: vString(0, 1024),
  sttMaxSeconds: vNumber(0),
  sttTimeoutMs: vNumber(0),
  inboundImageMaxPx: vNumber(0),
  outboundImageMaxBytes: vNumber(0),
  maxVoiceBytes: vNumber(0),
  maxFileBytes: vNumber(0),
  inboundFileMaxBytes: vNumber(0),
  mediaDir: vString(0, 1024),
  tempTtlHours: vNumber(0),
  allowPrivateHosts: vBoolean(),
  // diagnostics（7）
  logLevel: vEnum(['debug', 'info', 'warn', 'error']),
  actionAuditEnabled: vBoolean(),
  traceEnabled: vBoolean(),
  traceLevel: vEnum(['debug', 'warn']),
  dedupWindowSeconds: vNumber(0),
  ignoreSelf: vBoolean(),
  sensitivePatterns: vArray(vString(0, 1024)),
}

/** 102 键生效值（host buildSnapshot 的 effectiveConfig 全键返回；accessToken 恒 ''）。 */
export const configSchema: ObjectSchema = vObject(CONFIG_SHAPE)

/** getSettings / updateSettings 返回值（OnebotSettingsSnapshot）。 */
export const snapshotSchema: Schema<Record<string, unknown>> = vObject({
  revision: vInt(0),
  entryActive: vBoolean(),
  config: configSchema,
  secrets: vArray(vObject({ path: vArray(vString(1, 64)), set: vBoolean() })),
  groups: vObject({
    connection: vArray(vString(1, 64)),
    access: vArray(vString(1, 64)),
    persona: vArray(vString(1, 64)),
    messaging: vArray(vString(1, 64)),
    conversation: vArray(vString(1, 64)),
    group: vArray(vString(1, 64)),
    memory: vArray(vString(1, 64)),
    proactive: vArray(vString(1, 64)),
    media: vArray(vString(1, 64)),
    diagnostics: vArray(vString(1, 64)),
  }),
  effect: vEnum(['restart']), // 102 键统一插件级热重启
})

/** updateSettings 入参（任意 102 键子集；未出现的键 = 不修改）。 */
export const patchSchema: Schema<Record<string, unknown>> = vObject(
  Object.fromEntries(Object.entries(CONFIG_SHAPE).map(([key, schema]) => [key, vOptional(schema)])),
)

/** listWorkspaces 返回值（host WorkspaceListResult 同构）。 */
export const workspaceListSchema: Schema<Record<string, unknown>> = vObject({
  available: vBoolean(),
  workspaces: vArray(vObject({ id: vString(1, 256), path: vString(0, 1024), sessionCount: vInt(0) })),
})

/** Typert 严格 codec（模式固定 strict）。 */
export interface TypertCodec {
  mode: 'strict'
  typeSymbol: string
  create: () => Schema<unknown>
  schema: Schema<unknown>
}

/** 一个 positional 参数（json 线上形态）。 */
export interface TypertParameter {
  name: string
  wire: string
  source: 'json'
  codec: TypertCodec
}

/** 一个 Remote 方法 descriptor。 */
export interface TypertMethodDescriptor {
  id: string
  service: string
  namespace: string
  method: string
  invocation: { kind: 'direct' }
  parameters: TypertParameter[]
  result: TypertCodec
}

/** Remote 挂载清单。 */
export interface TypertRemoteDescriptor {
  package: string
  descriptors: TypertMethodDescriptor[]
}

export function strictCodec(typeSymbol: string, schema: Schema<unknown>): TypertCodec {
  return { mode: 'strict', typeSymbol: typeSymbol, create: () => schema, schema: schema }
}

export function jsonParameter(name: string, typeSymbol: string, schema: Schema<unknown>): TypertParameter {
  return { name: name, wire: name, source: 'json', codec: strictCodec(typeSymbol, schema) }
}

export function onebotMethod(
  method: string,
  parameters: TypertParameter[],
  resultSchema?: Schema<unknown>,
  typeSymbol?: string,
): TypertMethodDescriptor {
  return {
    id: PLUGIN_ID + '#' + REMOTE_NS + '/' + method,
    service: REMOTE_NS,
    namespace: REMOTE_NS,
    method: method,
    invocation: { kind: 'direct' },
    parameters: parameters,
    result: strictCodec(typeSymbol != null ? typeSymbol : 'OnebotSettingsSnapshot', resultSchema || snapshotSchema),
  }
}

/** 客户端 truth source：三个方法的 descriptor 清单。 */
export const ONEBOT_SETTINGS_DESCRIPTORS: TypertMethodDescriptor[] = [
  onebotMethod('getSettings', []),
  onebotMethod('updateSettings', [
    jsonParameter('patch', 'OnebotSettingsPatch', patchSchema),
    jsonParameter('expectedRevision', 'number', vOptional(vInt(0))),
  ]),
  onebotMethod('listWorkspaces', [], workspaceListSchema, 'WorkspaceListResult'),
]

/** `ctx.remote.$mount()` 的入参。 */
export const ONEBOT_SETTINGS_REMOTE: TypertRemoteDescriptor = { package: PLUGIN_ID, descriptors: ONEBOT_SETTINGS_DESCRIPTORS }