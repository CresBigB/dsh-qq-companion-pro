/** 配置许可矩阵：只处理权限，不代表运行时依赖或执行守卫已满足。 */
import { CAPABILITIES, chatViewOf, findCapability, resolveCapabilities } from './capabilities.js';
export const MATRIX_KEYS = ['capabilitiesDeny', 'ownerDeny', 'friendDeny', 'memberDeny', 'strangerDeny', 'ownerGrant', 'friendGrant', 'memberGrant', 'strangerGrant'];
const SCOPE_RELATIONS = {
    owner: ['owner'], private: ['friend', 'stranger'], group: ['groupMember'],
};
const RELATION_KEYS = {
    owner: { deny: 'ownerDeny', grant: 'ownerGrant' },
    friend: { deny: 'friendDeny', grant: 'friendGrant' },
    groupMember: { deny: 'memberDeny', grant: 'memberGrant' },
    stranger: { deny: 'strangerDeny', grant: 'strangerGrant' },
};
const ALL_DEPS = [...new Set(CAPABILITIES.flatMap(capability => capability.deps ?? []))];
function list(config, key) {
    const value = config[key];
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}
/** 私聊复选框聚合好友与陌生人；运行时依赖不参与配置许可显示。 */
export function getMatrixState(config, id, scope) {
    if (findCapability(id) === undefined || !Object.hasOwn(SCOPE_RELATIONS, scope))
        return 'off';
    const permissionConfig = Object.fromEntries(MATRIX_KEYS.map(key => [key, list(config, key)]));
    const states = SCOPE_RELATIONS[scope].map(relation => resolveCapabilities({ config: permissionConfig, deps: ALL_DEPS, chat: chatViewOf(relation) }).enabled.has(id));
    return states.every(Boolean) ? 'on' : states.some(Boolean) ? 'mixed' : 'off';
}
/** 生成最小权限 patch；解除全局禁止时把未选关系保持为禁止。 */
export function setMatrixState(config, id, scope, enabled) {
    const capability = findCapability(id);
    if (capability === undefined || !Object.hasOwn(SCOPE_RELATIONS, scope))
        return {};
    const patch = {};
    const current = (key) => patch[key] ?? list(config, key);
    const contains = (values) => values.some(value => value.trim() === id);
    const update = (key, add) => {
        const values = current(key);
        const next = add ? (contains(values) ? values : [...values, id]) : values.filter(value => value.trim() !== id);
        const original = list(config, key);
        if (next.length === original.length && next.every((value, index) => value === original[index]))
            delete patch[key];
        else
            patch[key] = next;
    };
    const selected = SCOPE_RELATIONS[scope];
    if (enabled && contains(current('capabilitiesDeny'))) {
        update('capabilitiesDeny', false);
        for (const relation of Object.keys(RELATION_KEYS)) {
            if (!selected.includes(relation))
                update(RELATION_KEYS[relation].deny, true);
        }
    }
    for (const relation of selected) {
        const keys = RELATION_KEYS[relation];
        update(keys.deny, !enabled);
        const defaultOpen = relation === 'owner' ? (capability.ownerDefault ?? true) : relation === 'groupMember' ? capability.groupDefault : capability.memberDefault;
        if (!enabled)
            update(keys.grant, false);
        else if (!defaultOpen)
            update(keys.grant, true);
    }
    return patch;
}
