/**
 * 设置页概览用的**只读状态快照**（《前端设计规范》§1.2 overview / §4.14）。
 *
 * 为什么单独一个模块：设置页的数据接口 `src/settings-remote.ts` 是独立的插件
 * 条目（`cordis.patch.yml` 的 `onebot-settings-remote` 行），只注入
 * configEditor / profileContext，拿不到主插件 `apply()` 里的 bridge 运行态。
 * 主插件在 apply 里把一个只读服务挂到 cordis（服务名 {@link STATUS_SERVICE}），
 * settings-remote 惰性 `ctx.get()` 取到就调 {@link CompanionStatusSnapshot.snapshot}
 * ——与 settings-remote 惰性解析 `workspaceRegistry` 同一套可选依赖姿态。
 *
 * 纪律：
 * - 快照是**纯 JSON**，可以直接过 Typert codec / Remote；
 * - **不含任何密钥**（accessToken 等一律不读）与**聊天正文**（只报会话 id /
 *   宿主标题 / 大小 / 计数）；
 * - 任何一部分取数失败只让该字段为 null，整个快照仍然返回——概览页把 null
 *   渲染成「—」，绝不因为一处读不到就整页报错；
 * - 字段取数尽量复用 health.ts / companion/doctor.ts 的既有读取函数
 *   （记忆文件清单与 /doctor 同源）。
 * @module dsh-qq-companion/status
 */
import type { CapabilitySummary } from './capabilities.js';
import type { LivenessSnapshot } from './liveness.js';
import type { SendCounterSnapshot } from './companion/send-counter.js';
/** 主插件挂到 cordis 上的只读状态服务名。 */
export declare const STATUS_SERVICE = "qqCompanionStatus";
/** 快照里最多列出多少个聊天（会话计数仍按全量算）。 */
export declare const STATUS_SESSION_LIMIT = 50;
/** 一个 chat ↔ session 对（概览的会话卡片用）。 */
export interface CompanionStatusChat {
    chatId: string;
    sessionId: string;
}
/** 概览页「连接」格。 */
export interface CompanionStatusConnection {
    connected: boolean;
    /** QQ 账号是否在线（liveness 心跳报告；未知 = null）。 */
    online: boolean | null;
    /** OneBot 学习到的 selfId（'' = 还没学到）。 */
    selfId: string;
    /** 配置里的机器人 QQ（空 = 用 selfId）。 */
    botQQ: string;
    host: string;
    port: number;
}
/** 概览页「会话」格与「会话」卡片。 */
export interface CompanionStatusSessions {
    private: number;
    group: number;
    list: Array<{
        chatId: string;
        sessionId: string;
        /** 宿主 sessionTitle 的当前标题（没有标题 / 服务缺席 = 省略）。 */
        title?: string;
        /** 是否已归入宿主工作区（注册表缺席 = null）。 */
        workspaceAttached: boolean | null;
    }>;
}
/** 概览页「主动聊天」格。 */
export interface CompanionStatusProactive {
    enabled: boolean;
    doneToday: number;
    plannedToday: number;
    /** 下一次计划中的叫醒时刻 HH:MM。 */
    nextAt?: string;
}
/** 概览页「表情包」格。 */
export interface CompanionStatusStickers {
    enabled: boolean;
    count: number;
    maxCount: number;
    today: number;
    dailyMax: number;
}
/** 概览页「记忆用量」卡片的一行（与 /doctor 的记忆文件同源）。 */
export interface CompanionStatusMemory {
    label: string;
    path: string;
    /** 文件字节数（不存在 / 读不到 = null）。 */
    bytes: number | null;
    /** 上限字节数（未配置 = null）。 */
    maxBytes: number | null;
}
/** 概览页「定时任务」卡片的一行。 */
export interface CompanionStatusScheduled {
    id: string;
    /** 每天几点触发 HH:MM。 */
    time: string;
    chatId: string;
    /** 今天是否已经执行过。 */
    doneToday: boolean;
    /** 下一次到点的时刻 HH:MM（今天已执行 = 明天的同一时刻）。 */
    nextAt?: string;
}
/** 权限行（T5 已有）。 */
export interface CompanionStatusPermissions {
    admin: string;
    member: string;
}
/** 概览页「功能」卡片：能力开关摘要（与 /doctor 的能力行同源，按管理员私聊视角）。 */
export type CompanionStatusCapabilities = CapabilitySummary;
/** 设置页概览的完整状态快照（纯 JSON）。 */
export interface CompanionStatusSnapshot {
    connection: CompanionStatusConnection | null;
    sessions: CompanionStatusSessions | null;
    today: {
        sent: number;
    } | null;
    proactive: CompanionStatusProactive | null;
    stickers: CompanionStatusStickers | null;
    memory: CompanionStatusMemory[] | null;
    scheduled: CompanionStatusScheduled[] | null;
    permissions: CompanionStatusPermissions | null;
    /** 能力开关摘要（主插件未提供 = null，概览显示「—」）。 */
    capabilities: CompanionStatusCapabilities | null;
    /** 快照生成时刻（epoch ms）。 */
    generatedAt: number;
}
/** 主插件挂出去的服务面（只读）。 */
export interface CompanionStatusService {
    snapshot(): Promise<CompanionStatusSnapshot>;
}
/** 快照取数依赖：每一项都是可选的现读函数，缺席 / 抛错都只让对应字段为 null。 */
export interface CompanionStatusDeps {
    /** 连接状态（bridge 的 connection）。 */
    connection?: () => {
        connected: boolean;
        selfId: string;
    };
    /** 监听地址（/doctor 的同一来源）。 */
    transport?: {
        host: string;
        port: number;
    };
    /** 配置里的机器人 QQ（空 = 用 selfId）。 */
    botQQ?: string;
    /** QQ 在线监视快照（未知 online = null）。 */
    liveness?: () => LivenessSnapshot | undefined;
    /** live 会话与映射里已知的聊天（live 优先，去重由本模块做）。 */
    chats?: () => {
        live?: CompanionStatusChat[];
        mapped?: CompanionStatusChat[];
    };
    /** 宿主 workspace 注册表里已归入工作区的 session id（缺席 = 全部 null）。 */
    workspaceSessionIds?: () => ReadonlySet<string> | undefined;
    /** 宿主 sessionTitle 的当前标题（没有 = undefined）。 */
    titleOf?: (chatId: string, sessionId: string) => string | undefined;
    /** 发送计数器（今天已发送条数）。 */
    sendCounter?: () => SendCounterSnapshot;
    /** 每日定时任务的执行状态（DailyScheduler.snapshot）。 */
    scheduler?: () => Array<{
        id: string;
        time: string;
        firedToday: boolean;
    }>;
    /** 配置里的定时任务（带目标会话）。 */
    scheduledPrompts?: readonly {
        id: string;
        time: string;
        chatId: string;
    }[];
    /** 主动聊天状态（未开启就**不要传**，快照会给 enabled:false）。 */
    proactive?: () => {
        enabled?: boolean;
        firedToday: number;
        remaining: string[];
    };
    /** 表情包库（库未开启就不要传）。 */
    stickers?: () => {
        count: number;
        maxCount: number;
        today: number;
        dailyMax: number;
    };
    /** 记忆文件（与 /doctor 同源：公开 / 私密）。 */
    memoryFiles?: Array<{
        label: string;
        path: string;
        max?: number;
    }>;
    /** 每群一份记忆的目录（/doctor 也读它）。 */
    groupMemoryDir?: string;
    groupMemoryMaxBytes?: number;
    /** /doctor 的权限行（'' = 宿主默认）。 */
    permissions?: {
        admin: string;
        member: string;
    };
    /** 能力开关摘要（bridge.capabilitySummary；缺席 = null）。 */
    capabilities?: () => CompanionStatusCapabilities;
    now?: () => number;
}
/**
 * 构建概览快照：任何一部分取数失败只让该字段为 null，整个快照仍然返回。
 * 快照只含连接 / 会话 id / 计数 / 文件大小 / 标题，**不含密钥与聊天正文**。
 */
export declare function buildCompanionStatusSnapshot(deps?: CompanionStatusDeps): Promise<CompanionStatusSnapshot>;
/** cordis 上下文里本模块用到的最小面（provide 自动随插件 fiber 卸载撤销）。 */
export interface ProvideContextLike {
    provide(name: string, value?: unknown): (() => void) | void;
}
/**
 * 把只读状态服务挂到 cordis 上，返回撤销函数。
 *
 * `ctx.provide()` 内部走 `ctx.fiber.effect()`：fiber 卸载时服务自动注销并唤醒
 * 依赖方（reflect.ts 的 provide 实现），所以插件被禁用 / 重载后
 * `ctx.get('qqCompanionStatus')` 立即回到 undefined（设置页据此显示
 * 「QQ 主插件未运行」横幅）。这里仍返回 dispose，供调用方显式提前撤销。
 */
export declare function provideCompanionStatus(ctx: ProvideContextLike, service: CompanionStatusService): () => void;
