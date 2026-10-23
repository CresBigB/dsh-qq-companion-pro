/**
 * 能力（capability）注册表：模型工具的**唯一真相源**。
 *
 * 为什么需要这一层：`installChannelScope` 过去对每个聊天无差别注册全部 qq_*
 * 工具（只受「表情包库开了没」「记忆文件配了没」这两个运行时依赖限制），没有任何
 * 按功能的开关。把「工具 → 能力」的对应关系集中在这里之后，插件可以：
 * 1. 用 `capabilitiesDeny` 全局关掉某几项功能（主人私聊也关）；
 * 2. **按关系收权（T11 r1，当前真正有用的一半）**：`friendDeny` / `memberDeny` /
 *    `strangerDeny` 只关掉某一档人的某几项能力，别的档不受影响——典型用法
 *    「群友不许用 qq.napcat.api，主人私聊照常」；
 * 3. 按关系放权（T11）：`friendGrant` / `memberGrant` / `strangerGrant` 把
 *    「默认关闭」的能力单独开给某一类关系，而不必再改工具定义；
 * 4. 让 `package.json` / `dsh.plugin.json` 的工具清单与真实注册集合同源
 *    （两份清单都由 {@link allToolNames} 生成，测试钉住）。
 *
 * 纪律：
 * - **每个工具恰好属于一个能力**（测试钉住：注册表不重不漏）；
 * - 本模块是纯函数 + 常量：除了同层的纯函数模块 src/relation.ts（关系名 / 顺序 /
 *   Relation 类型，纯到没有一行 I/O）不 import 任何运行时模块——config.ts /
 *   health.ts / status.ts / bridge.ts / 设置页前端都能安全引用，不会成环；
 * - 默认位（`memberDefault` / `groupDefault`）：改造前的 11 项能力**全部为 true**
 *   ——改造前的行为就是「每个聊天都注册全部工具」，T6 要求零行为变化，所以矩阵测试
 *   （tests/capabilities.spec.ts）把「deny 与 grant 都为空时每种会话组合注册到的
 *   工具集合」与改造前的集合逐字对齐（新增的三个隐私能力按下面的例外处理）。
 *   grant 只能把默认关闭的能力**加开**，改不了默认位。
 * - **例外（T12）**：`qq.list.groups` / `qq.list.friends` / `qq.history.private`
 *   三个隐私能力的两个默认位**都是 false**——群列表、好友列表、私聊历史是主人账号
 *   的社交关系与私聊记录，群友一句「列一下你的好友」就能把它们发到群里。默认只给
 *   主人私聊（owner 档不看默认位，恒开），需要时由主人在 `memberGrant` /
 *   `friendGrant` / `strangerGrant` 里显式授权。
 * - **例外（T13）**：`qq.group.manage` / `qq.group.notice` 两个**群管理写操作**的
 *   两个默认位也都是 false——它们会真的改变群里的状态（禁言、群名片、公告、精华）。
 *   这两个能力还有第二道闸：工具执行体里先查「本回合是主人发起的吗」
 *   （`bridge.canEditFiles`），不是主人回合就直接拒绝、一个请求都不发；能力层
 *   的 grant 只决定「这个会话有没有入口」，回合层才决定「这一次能不能真的做」。
 * - 推论（T11 r1 的存在理由）：对默认位为 true 的能力，**grant 是空转的**（写了也
 *   不会改变任何东西），所以「某一档人不许用某项功能」只能靠三个 deny 表达——deny
 *   是「减」，与默认位无关，永远生效。对 T12 的三个隐私能力，grant 才是唯一入口。
 * @module dsh-qq-companion/capabilities
 */
import type { Relation } from './relation.js';
/** 一个能力 id（也是 `capabilitiesDeny` 里能填的值）。 */
export type CapabilityId = 'qq.send.image' | 'qq.send.voice' | 'qq.send.video' | 'qq.send.file' | 'qq.send.forward' | 'qq.napcat.api' | 'qq.group.history' | 'qq.message.open' | 'qq.memory.note' | 'qq.sticker.use' | 'qq.sticker.manage' | 'qq.list.groups' | 'qq.list.friends' | 'qq.history.private' | 'qq.group.manage' | 'qq.group.notice';
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
 * 默认位的来历见文件头：改造前的 11 项全为 true（零行为变化的等价表达），
 * T12 新增的三个隐私能力（群列表 / 好友列表 / 私聊历史）两个默认位都是 false。
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
/** 一个能力 id 列表里认不出的 id（启动自检告警用；capabilitiesDeny、三个按关系
 *  的 deny 与三个 grant 共用这一份校验；每项只报一次，保持出现顺序）。 */
export declare function unknownCapabilityIds(deny: readonly string[] | undefined): string[];
/** 配置项 `capabilitiesDeny` 的描述正文：列出全部能力 id 与中文含义（由注册表生成，
 *  测试钉住「注册表里的每个 id / 中文名都出现在这段描述里」）。 */
export declare function capabilityCatalogText(): string;
/** 一个聊天的会话视角（能力按它分流）。 */
export interface CapabilityChatContext {
    /** 私聊还是群聊。 */
    kind: 'private' | 'group';
    /**
     * 这个会话的关系档（T11 的会话视角，直接用 src/relation.ts 的 Relation）。
     *
     * 群聊只有一个会话，大家共用一个工具注册集，所以**群聊里所有人（包括主人）
     * 都是 'groupMember'**（{@link chatRelationOf} 就是这么算的）；私聊里
     * 管理员 → 'owner'、好友名单里的人 → 'friend'、其余 → 'stranger'。
     *
     * 生产代码（bridge）总是给它；只有老调用点漏传时才回落到 adminPrivate。
     */
    relation?: Relation;
    /**
     * 是否管理员本人的私聊——**兼容位**，只为老调用点保留。
     * 缺省时由 `relation === 'owner' && kind === 'private'` 推导；给了 relation
     * 就以 relation 为准（这个字段被忽略，见 {@link chatRelationOf}）。
     */
    adminPrivate?: boolean;
}
/** 三个 grant（按关系加开能力）的配置键。 */
export type CapabilityGrantKey = 'friendGrant' | 'memberGrant' | 'strangerGrant';
/** 三个 deny（按关系关掉能力）的配置键——T11 r1 的一等公民。 */
export type CapabilityDenyKey = 'friendDeny' | 'memberDeny' | 'strangerDeny';
/** 能力相关的配置（全局 deny + 三个按关系 deny + 三个 grant）。 */
export interface CapabilityConfig {
    /** 全局关闭（最高优先，按关系 deny / grant 都绕不过它）。 */
    capabilitiesDeny?: readonly string[];
    /** 只不给好友私聊用的能力 id（群聊 / 陌生人 / 主人都照常）。 */
    friendDeny?: readonly string[];
    /** 只不给群聊用的能力 id（对所有群成员生效；群里主人发言也按群友档）。 */
    memberDeny?: readonly string[];
    /** 只不给陌生人私聊用的能力 id。 */
    strangerDeny?: readonly string[];
    /** 额外给好友私聊开放的能力 id。 */
    friendGrant?: readonly string[];
    /** 额外给群聊（含群里发言的主人）开放的能力 id。 */
    memberGrant?: readonly string[];
    /** 额外给陌生人私聊开放的能力 id。 */
    strangerGrant?: readonly string[];
}
/** 只描述「一份配置 + 当前进程具备的依赖」的入参（摘要按它算四个关系）。 */
export interface CapabilityViewInput {
    /** 相关配置（全局 deny + 三个按关系 deny + 三个 grant）。 */
    config: CapabilityConfig;
    /** 当前进程里实际具备的运行时依赖。 */
    deps: Iterable<CapabilityDependency>;
}
/** resolveCapabilities 的入参。 */
export interface ResolveCapabilitiesInput extends CapabilityViewInput {
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
 * 把会话视角归一成一个关系：**relation 优先**（生产代码都走这条）；只有老调用点
 * 只给了 adminPrivate 时才由它推导——`adminPrivate === true` 即管理员私聊。
 * @param chat - 会话视角。
 * @returns 关系档。
 */
export declare function chatRelationOf(chat: CapabilityChatContext): Relation;
/** 一个关系档的代表会话视角（群友档用群聊视角，其余用私聊视角；/doctor 与概览按它算）。 */
export declare function chatViewOf(relation: Relation): CapabilityChatContext;
/**
 * 单个能力的判定结果（开着还是关着 + 一句中文原因）。
 */
export interface CapabilityDecision {
    open: boolean;
    reason: string;
}
/** 单个能力判定的上下文（{@link decideCapability} 的入参，摊平后便于测试）。 */
export interface CapabilityDecisionInput {
    /** 这个能力的定义（测试可以传一份 memberDefault/groupDefault 为 false 的假定义）。 */
    capability: CapabilityDef;
    /** capabilitiesDeny 读成的集合。 */
    deny: ReadonlySet<string>;
    /** 当前进程具备的运行时依赖。 */
    available: ReadonlySet<CapabilityDependency>;
    /** 这个会话视角要看的按关系的 deny（null = 这个视角没有 deny 位，例如主人私聊）。 */
    relationDeny?: {
        key: CapabilityDenyKey;
        ids: ReadonlySet<string>;
    } | null;
    /** 这个会话视角要看的 grant（null = 这个视角没有 grant 位，例如主人私聊）。 */
    grant: {
        key: CapabilityGrantKey;
        ids: ReadonlySet<string>;
    } | null;
    /** 会话视角。 */
    chat: CapabilityChatContext;
    /** 归一后的关系档。 */
    relation: Relation;
}
/**
 * **一个**能力的判定——五步顺序就写在这里（**不可调换**，测试逐条钉住）：
 * 1. `capabilitiesDeny` 命中 → 关（全局，最高优先；grant 也绕不过它）；
 * 2. 运行时依赖不满足 → 关（能力没实现，开了也没用；grant 写了也开不了）；
 * 3. **按关系的 deny 命中 → 关**（T11 r1，新增；why 点出是哪个键关的，例如
 *    「群聊关系 deny（memberDeny）已关闭」）——比 grant 硬，比全局 deny 软；
 * 4. 按关系的 grant 命中 → 开（优先于下面的默认位）；
 * 5. 默认位：主人私聊 → 全开；群聊 → `groupDefault`；其他私聊 → `memberDefault`。
 *
 * 也就是说「关」的三个来源优先级递减：全局 deny > 依赖缺失 > 按关系 deny；
 * 任何来源的「关」都压过 grant。
 * @param input - 判定上下文。
 * @returns 开着 / 关着与原因。
 */
export declare function decideCapability(input: CapabilityDecisionInput): CapabilityDecision;
/**
 * 判定一个聊天能有哪些能力。
 *
 * 判定顺序见 {@link decideCapability}（全局 deny → 依赖 → 按关系 deny → 按关系
 * grant → 默认位）：群的 deny / grant 只用 `memberDeny` / `memberGrant`——会话级
 * 注册看不到具体发言人。
 */
export declare function resolveCapabilities(input: ResolveCapabilitiesInput): ResolveCapabilitiesResult;
/** /doctor 与概览共用的一份能力摘要（纯 JSON，可直接进状态快照）。 */
export interface CapabilitySummary {
    /** 已开启的能力数（**主人私聊视角**：缺什么就是配置层真关了什么）。 */
    enabled: number;
    /** 能力总数。 */
    total: number;
    /** 关闭的能力（注册表顺序；主人私聊视角的原因）。 */
    disabled: Array<{
        id: string;
        title: string;
        reason: string;
    }>;
    /** 四个关系各自的已开数（T11：/doctor「主人 X / 好友 Y / 群友 Z / 陌生人 W」；
     *  T11 r1 起四个数**会真的不一样**——按关系的 deny 只影响自己那一档）。 */
    byRelation: Record<Relation, number>;
}
/**
 * 把一份配置（+ 当前进程的依赖）压成摘要。
 *
 * `enabled` / `disabled` 取**主人私聊视角**——主人的私聊是权限最高的一类会话，
 * 缺什么就是配置层真关了什么（全局 deny + 依赖；按关系的 deny 不影响这一档）。
 * `byRelation` 另外给出四个关系各自的已开数（T11），供 /doctor 与设置页概览展示
 * 差异：`memberDeny` 写一项，群友数少 1、其余三个不变。
 */
export declare function summarizeCapabilities(input: CapabilityViewInput): CapabilitySummary;
/** /doctor 那一行的正文：四个关系各自的已开数 + 总数；有关闭项时另附原因。 */
export declare function formatCapabilityLine(summary: CapabilitySummary): string;
/** 群管理写操作的两个能力（/doctor 提示行只关心这两项，顺序即能力注册表顺序）。 */
export declare const GROUP_WRITE_CAPABILITY_IDS: readonly CapabilityId[];
/**
 * /doctor 的群管理提示行（T13）。
 *
 * 判据：这两个能力里**只要有任意一个在非主人档（好友 / 群友 / 陌生人）真的开着**，
 * 就出一句警告。为什么不算主人私聊那一档：owner 的默认位恒开，若把主人也算进来，
 * 这句提示会在任何配置下都出现（包括刚装好、什么都没授权的时候），提示就废了。
 * 也就是说「全关」（默认配置 / 只写在 capabilitiesDeny 里关掉）时这里返回空串，
 * /doctor 不出这一行。
 * @param input - 配置 + 当前进程具备的运行时依赖。
 * @returns 一行提示；空串 = 不提。
 */
export declare function groupWriteWarningLine(input: CapabilityViewInput): string;
