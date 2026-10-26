/** 配置许可矩阵：只处理权限，不代表运行时依赖或执行守卫已满足。 */
import { type CapabilityId } from './capabilities.js';
export type MatrixScope = 'owner' | 'private' | 'group';
export type MatrixState = 'on' | 'off' | 'mixed';
export declare const MATRIX_KEYS: readonly ["capabilitiesDeny", "ownerDeny", "friendDeny", "memberDeny", "strangerDeny", "ownerGrant", "friendGrant", "memberGrant", "strangerGrant"];
/** 私聊复选框聚合好友与陌生人；运行时依赖不参与配置许可显示。 */
export declare function getMatrixState(config: Readonly<Record<string, unknown>>, id: CapabilityId, scope: MatrixScope): MatrixState;
/** 生成最小权限 patch；解除全局禁止时把未选关系保持为禁止。 */
export declare function setMatrixState(config: Readonly<Record<string, unknown>>, id: CapabilityId, scope: MatrixScope, enabled: boolean): Record<string, string[]>;
