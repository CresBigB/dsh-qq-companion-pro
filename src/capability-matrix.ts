/** 配置许可矩阵：只处理权限，不代表运行时依赖或执行守卫已满足。 */
import { CAPABILITIES, chatViewOf, findCapability, resolveCapabilities, type CapabilityConfig, type CapabilityDependency, type CapabilityDenyKey, type CapabilityGrantKey, type CapabilityId } from './capabilities.js'
import type { Relation } from './relation.js'

export type MatrixScope = 'owner' | 'private' | 'group'
export type MatrixState = 'on' | 'off' | 'mixed'
export const MATRIX_KEYS = ['capabilitiesDeny', 'ownerDeny', 'friendDeny', 'memberDeny', 'strangerDeny', 'ownerGrant', 'friendGrant', 'memberGrant', 'strangerGrant'] as const

type MatrixKey = typeof MATRIX_KEYS[number]
const SCOPE_RELATIONS: Readonly<Record<MatrixScope, readonly Relation[]>> = {
  owner: ['owner'], private: ['friend', 'stranger'], group: ['groupMember'],
}
const RELATION_KEYS: Readonly<Record<Relation, { deny: CapabilityDenyKey; grant: CapabilityGrantKey }>> = {
  owner: { deny: 'ownerDeny', grant: 'ownerGrant' },
  friend: { deny: 'friendDeny', grant: 'friendGrant' },
  groupMember: { deny: 'memberDeny', grant: 'memberGrant' },
  stranger: { deny: 'strangerDeny', grant: 'strangerGrant' },
}
const ALL_DEPS: readonly CapabilityDependency[] = [...new Set(CAPABILITIES.flatMap(capability => capability.deps ?? []))]
function list(config: Readonly<Record<string, unknown>>, key: MatrixKey): string[] {
  const value = config[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/** 私聊复选框聚合好友与陌生人；运行时依赖不参与配置许可显示。 */
export function getMatrixState(config: Readonly<Record<string, unknown>>, id: CapabilityId, scope: MatrixScope): MatrixState {
  if (findCapability(id) === undefined || !Object.hasOwn(SCOPE_RELATIONS, scope)) return 'off'
  const permissionConfig: CapabilityConfig = Object.fromEntries(MATRIX_KEYS.map(key => [key, list(config, key)]))
  const states = SCOPE_RELATIONS[scope].map(relation => resolveCapabilities({ config: permissionConfig, deps: ALL_DEPS, chat: chatViewOf(relation) }).enabled.has(id))
  return states.every(Boolean) ? 'on' : states.some(Boolean) ? 'mixed' : 'off'
}

/** 生成最小权限 patch；解除全局禁止时把未选关系保持为禁止。 */
export function setMatrixState(config: Readonly<Record<string, unknown>>, id: CapabilityId, scope: MatrixScope, enabled: boolean): Record<string, string[]> {
  const capability = findCapability(id)
  if (capability === undefined || !Object.hasOwn(SCOPE_RELATIONS, scope)) return {}
  const patch: Record<string, string[]> = {}
  const current = (key: MatrixKey): string[] => patch[key] ?? list(config, key)
  const contains = (values: readonly string[]): boolean => values.some(value => value.trim() === id)
  const update = (key: MatrixKey, add: boolean): void => {
    const values = current(key)
    const next = add ? (contains(values) ? values : [...values, id]) : values.filter(value => value.trim() !== id)
    const original = list(config, key)
    if (next.length === original.length && next.every((value, index) => value === original[index])) delete patch[key]
    else patch[key] = next
  }
  const selected = SCOPE_RELATIONS[scope]
  if (enabled && contains(current('capabilitiesDeny'))) {
    update('capabilitiesDeny', false)
    for (const relation of Object.keys(RELATION_KEYS) as Relation[]) {
      if (!selected.includes(relation)) update(RELATION_KEYS[relation].deny, true)
    }
  }
  for (const relation of selected) {
    const keys = RELATION_KEYS[relation]
    update(keys.deny, !enabled)
    const defaultOpen = relation === 'owner' ? (capability.ownerDefault ?? true) : relation === 'groupMember' ? capability.groupDefault : capability.memberDefault
    if (!enabled) update(keys.grant, false)
    else if (!defaultOpen) update(keys.grant, true)
  }
  return patch
}
