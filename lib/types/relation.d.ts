/**
 * 关系矩阵：发送者跟她的关系（主人 / 好友 / 群友 / 陌生人）与随之注入的
 * **per-turn 关系绸标**。纯函数，不碰 I/O。
 *
 * 为什么是绸标而不是人设一节：audience 只按 chatId 算，群里多人无法区分；
 * 所以关系必须跟着消息走——照 `[HH:MM 昵称(QQ)]` / RESTRICTED_PREFIX 的位置
 * 放在 `<user_message>` 边界之外（框架元数据，不是用户可以伪造的文本）。
 *
 * 语义写死：`obedience` 只管「要求照不照做、拒绝时怎么解释」，不管听不听话；
 * `tone` 只管措辞软硬。任何关系下都不许骂人、人身攻击或阴阳怪气。
 * @module dsh-qq-companion/relation
 */
import type { ChatKind } from './chat.js';
/** 发送者跟她的关系。 */
export type Relation = 'owner' | 'friend' | 'groupMember' | 'stranger';
/** 四个关系（固定顺序：主人 → 好友 → 群友 → 陌生人；/doctor 行与概览按这个顺序念）。 */
export declare const RELATIONS: readonly Relation[];
/** 语气：措辞的软硬（soft=亲切 / teasing=打趣 / neutral=中性）。 */
export type RelationTone = 'soft' | 'teasing' | 'neutral';
/** 一条关系的调参：语气、服从度、亲密度、能否用斜杠命令。 */
export interface RelationProfile {
    tone: RelationTone;
    /** 0 = 完全不听（仍要好好解释），1 = 基本都听。只管照不照做，不管态度。 */
    obedience: number;
    /** 0 = 生分，1 = 最亲近（影响称呼与语气亲近程度）。 */
    intimacy: number;
    /** 能不能用斜杠命令（只给主人）。 */
    canCommand: boolean;
}
/** {@link classifyRelation} 的入参。 */
export interface RelationInput {
    /** 发送者 QQ 号。 */
    userId: string;
    /** 这个聊天是私聊还是群聊。 */
    chatKind: ChatKind;
    /** 判定名单（adminUsers 已含环境变量兜底）。 */
    policy: {
        adminUsers: readonly string[];
        friendUsers: readonly string[];
    };
}
/** 关系矩阵里可配置的部分（缺省值见 {@link RELATION_DEFAULTS}）。 */
export interface RelationConfig {
    /** 非主人（群友 / 陌生人）的服从度。 */
    memberObedience?: number;
    /** 好友的服从度。 */
    friendObedience?: number;
    /** 好友的亲密度。 */
    friendIntimacy?: number;
}
/** 三个可配置参数的默认值（与 src/config.ts 的 schema 默认值一致）。 */
export declare const RELATION_DEFAULTS: {
    readonly memberObedience: 0.2;
    readonly friendObedience: 0.5;
    readonly friendIntimacy: 0.6;
};
/** 关系的中文名（绸标第一段；/doctor 的能力行与设置页概览也用它）。 */
export declare const RELATION_NAMES: Readonly<Record<Relation, string>>;
/**
 * 判定一个人跟她的关系。**单一判定来源**：主人 > 好友 > 群友 / 陌生人。
 * 群聊里既不是主人也不是好友的是群友；非管理员私聊的是陌生人。
 * @param input - 发送者 QQ 号、聊天类型、判定名单。
 * @returns 关系。
 */
export declare function classifyRelation(input: RelationInput): Relation;
/**
 * **会话级**的关系视角（T11 的能力判定用它，不是绸标用的那一套）。
 *
 * 与 {@link classifyRelation} 的唯一区别：**群聊一律 'groupMember'**——模型工具
 * 是按会话注册的，一个群只有一个会话，会话级注册根本看不到具体发言人，所以群里
 * 主人自己发言也走群友档（能力默认位 / memberGrant / 群会话的宿主权限预设同一
 * 口径）。这是故意的，不是 bug。
 * @param input - 发送者 QQ 号、聊天类型、判定名单。
 * @returns 这个会话的关系档。
 */
export declare function sessionRelation(input: RelationInput): Relation;
/**
 * 一条关系的调参。主人写死（soft / 0.9 / 0.9 / 可指挥）；好友取
 * friendObedience 与 friendIntimacy；群友与陌生人共用 memberObedience，
 * 亲密度分别 0.2 / 0.1（比群友更生分），只有主人能用斜杠命令。
 * @param id - 关系。
 * @param config - 关系矩阵配置（缺席字段取 {@link RELATION_DEFAULTS}）。
 * @returns 该关系的调参。
 */
export declare function relationProfile(id: Relation, config?: RelationConfig): RelationProfile;
/**
 * 一行关系绸标，格式固定（全角｜分隔，数值一位小数）：
 * `[关系:主人｜语气亲切｜服从0.9｜亲密0.9｜可指挥]`。
 * @param profile - 该关系的调参。
 * @param id - 关系。
 * @returns 绸标文本（不含尾随空格）。
 */
export declare function describeRelation(profile: RelationProfile, id: Relation): string;
/**
 * 判定 + 调参 + 绸标一步到位（inbound 的注入点用它）。
 * @param input - 判定入参。
 * @param config - 关系矩阵配置。
 * @returns 绸标文本（不含尾随空格）。
 */
export declare function relationBanner(input: RelationInput, config?: RelationConfig): string;
/** 消息开头的关系绸标：新格式 `[关系:…]` 与历史会话里的 `[受限用户:仅问答]`。 */
export declare const RELATION_PREFIX: RegExp;
/**
 * 剥掉消息开头的关系绸标（新格式 + 历史格式）。只剥前缀：正文里自己贴的
 * 仿冒绸标留在边界内，一个字都不动。
 * @param text - 一条入站消息的完整文本。
 * @returns 剥掉开头绸标后的文本。
 */
export declare function stripRelationPrefix(text: string): string;
