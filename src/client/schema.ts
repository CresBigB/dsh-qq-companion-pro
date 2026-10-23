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

/** 与 zod object 默认行为一致：声明外字段剥离，声明内字段逐个 parse。 */
export function vObject(shape: Record<string, Schema<unknown>>): Schema<Record<string, unknown>> {
  return {
    parse(value) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('expected object')
      }
      const source = value as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const key of Object.keys(shape)) out[key] = shape[key].parse(source[key])
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

/** 29 键生效值（host buildSnapshot 的 effectiveConfig 全键返回；accessToken 恒 ''）。 */
export const configSchema: Schema<Record<string, unknown>> = vObject({
  host: vString(0, 256),
  port: vNumber(),
  accessToken: vString(0, 256),
  botQQ: vString(0, 64),
  workspacePath: vString(0, 1024),
  requireMention: vBoolean(),
  adminUsers: vArray(vString(0, 64)),
  dmPolicy: vEnum(['open', 'allowlist', 'disabled']),
  groupPolicy: vEnum(['open', 'allowlist', 'disabled']),
  allowAllUsers: vBoolean(),
  allowFrom: vArray(vString(0, 64)),
  groupAllowFrom: vArray(vString(0, 64)),
  interimMessages: vBoolean(),
  interimRecall: vBoolean(),
  interimRecallMs: vNumber(),
  sendErrorNotice: vBoolean(),
  unknownCommand: vEnum(['intercept', 'passthrough']),
  rateLimitPerMinute: vNumber(),
  newMessagePolicy: vEnum(['queue', 'steer']),
  autoSteerPolicy: vEnum(['admin', 'all']),
  deferredTimeoutMs: vNumber(),
  actionAuditEnabled: vBoolean(),
  traceEnabled: vBoolean(),
  humanTypingPace: vBoolean(),
  typingDelayPerCharMs: vNumber(),
  typingDelayMinMs: vNumber(),
  typingDelayMaxMs: vNumber(),
  groupSplitLines: vBoolean(),
  ownerTitle: vString(0, 1024),
  agentPreset: vString(0, 1024),
  adminPreset: vString(0, 1024),
  adminPermission: vString(0, 1024),
  adminWorkspacePath: vString(0, 1024),
  splitLines: vBoolean(),
  splitMaxMessages: vNumber(),
  textImageThreshold: vNumber(),
  inboundImageMaxPx: vNumber(),
  autoAcceptAdminRequests: vBoolean(),
  autoAllowInvitedGroups: vBoolean(),
  idleResetHours: vNumber(),
  privateResetDays: vNumber(),
  groupResetDays: vNumber(),
  publicMemoryFile: vString(0, 1024),
  publicMemoryMaxBytes: vNumber(),
  groupMemoryDir: vString(0, 1024),
  groupMemoryMaxBytes: vNumber(),
  sessionTitleTemplate: vString(0, 1024),
  proactiveEnabled: vBoolean(),
  proactiveChatId: vString(0, 1024),
  proactiveWindowStart: vString(0, 1024),
  proactiveWindowEnd: vString(0, 1024),
  proactiveMinPerDay: vNumber(),
  proactiveMaxPerDay: vNumber(),
  proactiveMinGapMinutes: vNumber(),
  proactiveSkipIfActiveMinutes: vNumber(),
  proactiveMaxUnanswered: vNumber(),
})

/** getSettings / updateSettings 返回值（OnebotSettingsSnapshot）。 */
export const snapshotSchema: Schema<Record<string, unknown>> = vObject({
  revision: vInt(0),
  entryActive: vBoolean(),
  config: configSchema,
  secrets: vArray(vObject({ path: vArray(vString(1, 64)), set: vBoolean() })),
  groups: vObject({
    connection: vArray(vString(1, 64)),
    permissions: vArray(vString(1, 64)),
    behavior: vArray(vString(1, 64)),
    diagnostics: vArray(vString(1, 64)),
    companion: vArray(vString(1, 64)),
    memory: vArray(vString(1, 64)),
    proactive: vArray(vString(1, 64)),
  }),
  effect: vEnum(['restart']), // 19 键统一插件级热重启
})

/** updateSettings 入参（任意 29 键子集）。 */
export const patchSchema: Schema<Record<string, unknown>> = vObject({
  host: vOptional(vString(0, 256)),
  port: vOptional(vNumber(1, 65535)),
  accessToken: vOptional(vString(0, 256)),
  botQQ: vOptional(vString(0, 64)),
  workspacePath: vOptional(vString(0, 1024)),
  requireMention: vOptional(vBoolean()),
  adminUsers: vOptional(vArray(vString(0, 64))),
  dmPolicy: vOptional(vEnum(['open', 'allowlist', 'disabled'])),
  groupPolicy: vOptional(vEnum(['open', 'allowlist', 'disabled'])),
  allowAllUsers: vOptional(vBoolean()),
  allowFrom: vOptional(vArray(vString(0, 64))),
  groupAllowFrom: vOptional(vArray(vString(0, 64))),
  interimMessages: vOptional(vBoolean()),
  interimRecall: vOptional(vBoolean()),
  interimRecallMs: vOptional(vNumber(0)),
  sendErrorNotice: vOptional(vBoolean()),
  unknownCommand: vOptional(vEnum(['intercept', 'passthrough'])),
  rateLimitPerMinute: vOptional(vNumber(0)),
  newMessagePolicy: vOptional(vEnum(['queue', 'steer'])),
  autoSteerPolicy: vOptional(vEnum(['admin', 'all'])),
  deferredTimeoutMs: vOptional(vNumber(0)),
  actionAuditEnabled: vOptional(vBoolean()),
  traceEnabled: vOptional(vBoolean()),
  humanTypingPace: vOptional(vBoolean()),
  typingDelayPerCharMs: vOptional(vNumber(0)),
  typingDelayMinMs: vOptional(vNumber(0)),
  typingDelayMaxMs: vOptional(vNumber(0)),
  groupSplitLines: vOptional(vBoolean()),
  ownerTitle: vOptional(vString(0, 1024)),
  agentPreset: vOptional(vString(0, 1024)),
  adminPreset: vOptional(vString(0, 1024)),
  adminPermission: vOptional(vString(0, 1024)),
  adminWorkspacePath: vOptional(vString(0, 1024)),
  splitLines: vOptional(vBoolean()),
  splitMaxMessages: vOptional(vNumber(0)),
  textImageThreshold: vOptional(vNumber(0)),
  inboundImageMaxPx: vOptional(vNumber(0)),
  autoAcceptAdminRequests: vOptional(vBoolean()),
  autoAllowInvitedGroups: vOptional(vBoolean()),
  idleResetHours: vOptional(vNumber(0)),
  privateResetDays: vOptional(vNumber(0)),
  groupResetDays: vOptional(vNumber(0)),
  publicMemoryFile: vOptional(vString(0, 1024)),
  publicMemoryMaxBytes: vOptional(vNumber(0)),
  groupMemoryDir: vOptional(vString(0, 1024)),
  groupMemoryMaxBytes: vOptional(vNumber(0)),
  sessionTitleTemplate: vOptional(vString(0, 1024)),
  proactiveEnabled: vOptional(vBoolean()),
  proactiveChatId: vOptional(vString(0, 1024)),
  proactiveWindowStart: vOptional(vString(0, 1024)),
  proactiveWindowEnd: vOptional(vString(0, 1024)),
  proactiveMinPerDay: vOptional(vNumber(0)),
  proactiveMaxPerDay: vOptional(vNumber(0)),
  proactiveMinGapMinutes: vOptional(vNumber(0)),
  proactiveSkipIfActiveMinutes: vOptional(vNumber(0)),
  proactiveMaxUnanswered: vOptional(vNumber(0)),
})

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