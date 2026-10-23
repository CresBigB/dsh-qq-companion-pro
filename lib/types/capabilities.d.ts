/**
 * 能力（capability）注册表：模型工具的**唯一真相源**。
 *
 * 为什么需要这一层：`installChannelScope` 过去对每个聊天无差别注册全部 qq_*
 * 工具（只受「表情包库开了没」「记忆文件配了没」这两个运行时依赖限制），没有任何
 * 按功能的开关。把「工具 → 能力」的对应关系集中在这里之后，插件可以：
 * 1. 用 `capabilitiesDeny` 全局关掉某几项功能（主人私聊也关）；
 * 2. 以后按会话角色放权（grant，T11）而不必再改工具定义；
 * 3. 让 `package.json` / `dsh.plugin.json` 的工具清单与真实注册集合同源
 *    （两份清单都由 {@link allToolNames} 生成，测试钉住）。
 *
 * 纪律：
 * - **每个工具恰好属于一个能力**（测试钉住：注册表不重不漏）；
 * - 本模块是纯函数 + 常量，不 import 任何运行时模块（config.ts / health.ts /
 *   status.ts / bridge.ts 都能安全引用，不会成环）；
 * - 默认位（`memberDefault` / `groupDefault`）当前**全部为 true**：改造前的行为
 *   就是「每个聊天都注册全部工具」，本任务要求零行为变化，所以矩阵测试
 *   （tests/capabilities.spec.ts）把「deny 为空时每种会话组合注册到的工具集合」
 *   与改造前的集合逐字对齐。T11 引入按角色的 grant / 默认位调整时才动它们。
 * @module dsh-qq-companion/capabilities
 */
/** 一个能力 id（也是 `capabilitiesDeny` 里能填的值）。 */
export type CapabilityId = 'qq.send.image' | 'qq.send.voice' | 'qq.send.video' | 'qq.send.file' | 'qq.send.forward' | 'qq.napcat.api' | 'qq.group.history' | 'qq.message.open' | 'qq.memory.note' | 'qq.sticker.use' | 'qq.sticker.manage';
/** 能力的运行时依赖键：对应能力只有在依赖具备时才可能开启。 */
export type CapabilityDependency = 'stickerLib' | 'memoryNote';
/** 一条能力定义。 */
export interface CapabilityDef {
    /** 能力 id（稳定标识，进配置与 /doctor）。 */
    id: CapabilityId;
    /** 中文短名（/doctor、概览、设置页说明用）。 */
    title: string;
    /** 该能力对应的模型工具名（注册表顺序即清单顺序）。 */
    tools: readonly string[];
    /** 一句中文说明（给后续提示词生成用）。 */
    describe: string;
    /** 运行时依赖；只要有一项不满足，这个能力就关闭。 */
    deps?: readonly CapabilityDependency[];
    /** 默认是否对非管理员私聊开放。 */
    memberDefault: boolean;
    /** 默认是否在群聊开放。 */
    groupDefault: boolean;
}
/**
 * 全部能力（顺序即工具清单顺序）。
 *
 * 默认位全为 true 的理由见文件头：这是改造前「一律注册」的等价表达。
 */
export declare const CAPABILITIES: readonly CapabilityDef[];
/** 全部能力 id（顺序同注册表）。 */
export declare const ALL_CAPABILITY_IDS: readonly CapabilityId[];
/** 全部工具名（顺序同注册表，跨能力按 tools 声明顺序展开）。 */
export declare function allToolNames(): string[];
/** 按 id 找能力定义（未知 id = undefined）。 */
export declare function findCapability(id: string): CapabilityDef | undefined;
/** 某个工具名属于哪个能力（未知 = undefined）。 */
export declare function capabilityOfTool(toolName: string): CapabilityDef | undefined;
/** `capabilitiesDeny` 里认不出的 id（启动自检告警用；每项只报一次，保持出现顺序）。 */
export declare function unknownCapabilityIds(deny: readonly string[] | undefined): string[];
/** 配置项 `capabilitiesDeny` 的描述正文：列出全部能力 id 与中文含义（由注册表生成，
 *  测试钉住「注册表里的每个 id / 中文名都出现在这段描述里」）。 */
export declare function capabilityCatalogText(): string;
/** 一个聊天的会话视角（能力按它分流）。 */
export interface CapabilityChatContext {
    /** 私聊还是群聊。 */
    kind: 'private' | 'group';
    /** 是否管理员本人的私聊（群聊恒 false）。 */
    adminPrivate: boolean;
}
/** resolveCapabilities 的入参。 */
export interface ResolveCapabilitiesInput {
    /** 相关配置（本任务只读 capabilitiesDeny；T11 会再加 grant）。 */
    config: {
        capabilitiesDeny?: readonly string[];
    };
    /** 当前进程里实际具备的运行时依赖。 */
    deps: Iterable<CapabilityDependency>;
    /** 目标会话。 */
    chat: CapabilityChatContext;
}
/** resolveCapabilities 的结果。 */
export interface ResolveCapabilitiesResult {
    /** 这个聊天能用的能力。 */
    enabled: ReadonlySet<CapabilityId>;
    /** 这些能力对应的工具名（注册表顺序；注册时据此放行）。 */
    tools: readonly string[];
    /** 某个能力为什么开 / 为什么关（一句中文）。 */
    why(id: CapabilityId): string;
}
/**
 * 判定一个聊天能有哪些能力。判定顺序（不可调换，T11 的 grant 会插在 deny 之后）：
 * 1. `capabilitiesDeny` 命中 → 关（主人私聊也关）；
 * 2. 运行时依赖不满足 → 关；
 * 3.（T11：按角色的 grant 命中 → 开，优先于下面的默认位）；
 * 4. 管理员私聊 → 开；
 * 5. 群聊 → `groupDefault`；
 * 6. 非管理员私聊 → `memberDefault`。
 */
export declare function resolveCapabilities(input: ResolveCapabilitiesInput): ResolveCapabilitiesResult;
/** /doctor 与概览共用的一份能力摘要（纯 JSON，可直接进状态快照）。 */
export interface CapabilitySummary {
    /** 已开启的能力数。 */
    enabled: number;
    /** 能力总数。 */
    total: number;
    /** 关闭的能力（注册表顺序）。 */
    disabled: Array<{
        id: string;
        title: string;
        reason: string;
    }>;
}
/** 把一次判定压成摘要。 */
export declare function summarizeCapabilities(result: ResolveCapabilitiesResult): CapabilitySummary;
/** /doctor 那一行的正文（没有关闭项时只报「已开 N / 共 M」）。 */
export declare function formatCapabilityLine(summary: CapabilitySummary): string;
