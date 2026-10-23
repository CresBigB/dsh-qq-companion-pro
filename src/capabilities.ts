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
 * - 默认位（`memberDefault` / `groupDefault`）当前**全部为 true**：改造前的行为
 *   就是「每个聊天都注册全部工具」，本任务要求零行为变化，所以矩阵测试
 *   （tests/capabilities.spec.ts）把「deny 与 grant 都为空时每种会话组合注册到的
 *   工具集合」与改造前的集合逐字对齐。grant 只能把默认关闭的能力**加开**，
 *   改不了默认位。
 * - 推论（T11 r1 的存在理由）：默认位既然全开，**grant 在当前默认下是空转的**
 *   （写了也不会改变任何东西）；用户「某一档人不许用某项功能」的需求只能靠三个
 *   deny 表达——deny 是「减」，与默认位无关，永远生效。grant 继续留着，是为了
 *   以后把某些能力的默认位改成 false 时不必重做这一层。
 * @module dsh-qq-companion/capabilities
 */
import type { Relation } from './relation.js'
import { RELATIONS, RELATION_NAMES } from './relation.js'

/** 一个能力 id（也是 `capabilitiesDeny` 里能填的值）。 */
export type CapabilityId =
  | 'qq.send.image'
  | 'qq.send.voice'
  | 'qq.send.video'
  | 'qq.send.file'
  | 'qq.send.forward'
  | 'qq.napcat.api'
  | 'qq.group.history'
  | 'qq.message.open'
  | 'qq.memory.note'
  | 'qq.sticker.use'
  | 'qq.sticker.manage'

/** 能力的运行时依赖键：对应能力只有在依赖具备时才可能开启。 */
export type CapabilityDependency = 'stickerLib' | 'memoryNote'

/** 一条能力定义。 */
export interface CapabilityDef {
  /** 能力 id（稳定标识，进配置与 /doctor）。 */
  id: CapabilityId
  /** 中文短名（/doctor、概览、设置页说明用）。 */
  title: string
  /** 该能力对应的模型工具名（注册表顺序即清单顺序）。 */
  tools: readonly string[]
  /** 一句中文说明（给后续提示词生成用）。 */
  describe: string
  /** 运行时依赖；只要有一项不满足，这个能力就关闭。 */
  deps?: readonly CapabilityDependency[]
  /** 默认是否对非管理员私聊开放。 */
  memberDefault: boolean
  /** 默认是否在群聊开放。 */
  groupDefault: boolean
}

/**
 * 全部能力（顺序即工具清单顺序）。
 *
 * 默认位全为 true 的理由见文件头：这是改造前「一律注册」的等价表达。
 */
export const CAPABILITIES: readonly CapabilityDef[] = [
  {
    id: 'qq.send.image',
    title: '发图片',
    tools: ['qq_send_image'],
    describe: '向 QQ 会话发送本地文件或链接图片（一次最多 9 张）。',
    memberDefault: true,
    groupDefault: true,
  },
  {
    id: 'qq.send.voice',
    title: '发语音',
    tools: ['qq_send_voice'],
    describe: '向 QQ 会话发送一条本地音频文件作为语音。',
    memberDefault: true,
    groupDefault: true,
  },
  {
    id: 'qq.send.video',
    title: '发视频',
    tools: ['qq_send_video'],
    describe: '向 QQ 会话发送一条本地视频文件。',
    memberDefault: true,
    groupDefault: true,
  },
  {
    id: 'qq.send.file',
    title: '发文件',
    tools: ['qq_send_file'],
    describe: '向 QQ 会话发送一个本地文件。',
    memberDefault: true,
    groupDefault: true,
  },
  {
    id: 'qq.send.forward',
    title: '合并转发',
    tools: ['qq_send_forward'],
    describe: '以合并转发形式向 QQ 会话发送多条消息节点。',
    memberDefault: true,
    groupDefault: true,
  },
  {
    id: 'qq.napcat.api',
    title: 'NapCat 接口',
    tools: ['qq_napcat_api'],
    describe: '调用 NapCat 白名单内的 OneBot 扩展接口（群成员、文件、OCR 等）。',
    memberDefault: true,
    groupDefault: true,
  },
  {
    id: 'qq.group.history',
    title: '群历史消息',
    tools: ['qq_group_history'],
    describe: '拉取当前群最近的消息历史作为上下文。',
    memberDefault: true,
    groupDefault: true,
  },
  {
    id: 'qq.message.open',
    title: '打开消息',
    tools: ['qq_open_message'],
    describe: '打开当前会话里的某条消息，取回其中的图片、语音转写、聊天记录与文件。',
    memberDefault: true,
    groupDefault: true,
  },
  {
    id: 'qq.memory.note',
    title: '群记忆笔记',
    tools: ['qq_memory_note'],
    describe: '往当前群的记忆文件追加一行值得记住的小事。',
    deps: ['memoryNote'],
    memberDefault: true,
    groupDefault: true,
  },
  {
    id: 'qq.sticker.use',
    title: '表情包（存 / 搜 / 发）',
    tools: ['qq_sticker_save', 'qq_sticker_search', 'qq_sticker_send'],
    describe: '收藏聊天里的图片、按情绪找表情包并把表情包发到当前会话。',
    deps: ['stickerLib'],
    memberDefault: true,
    groupDefault: true,
  },
  {
    id: 'qq.sticker.manage',
    title: '表情包整理（改 / 删）',
    tools: ['qq_sticker_edit', 'qq_sticker_delete'],
    describe: '改表情包的标签、描述，或把表情包删掉（只在和主人私聊时能改能删，群里做不了）。',
    deps: ['stickerLib'],
    memberDefault: true,
    groupDefault: true,
  },
]

/** 全部能力 id（顺序同注册表）。 */
export const ALL_CAPABILITY_IDS: readonly CapabilityId[] = CAPABILITIES.map(capability => capability.id)

/** 全部工具名（顺序同注册表，跨能力按 tools 声明顺序展开）。 */
export function allToolNames(): string[] {
  return CAPABILITIES.flatMap(capability => [...capability.tools])
}

/** 按 id 找能力定义（未知 id = undefined）。 */
export function findCapability(id: string): CapabilityDef | undefined {
  return CAPABILITIES.find(capability => capability.id === id)
}

/** 某个工具名属于哪个能力（未知 = undefined）。 */
export function capabilityOfTool(toolName: string): CapabilityDef | undefined {
  return CAPABILITIES.find(capability => capability.tools.includes(toolName))
}

/** 一个能力 id 列表里认不出的 id（启动自检告警用；capabilitiesDeny、三个按关系
 *  的 deny 与三个 grant 共用这一份校验；每项只报一次，保持出现顺序）。 */
export function unknownCapabilityIds(deny: readonly string[] | undefined): string[] {
  const out: string[] = []
  for (const raw of deny ?? []) {
    const id = typeof raw === 'string' ? raw.trim() : ''
    if (id === '' || findCapability(id) !== undefined || out.includes(id)) continue
    out.push(id)
  }
  return out
}

/** 配置项 `capabilitiesDeny` 的描述正文：列出全部能力 id 与中文含义（由注册表生成，
 *  测试钉住「注册表里的每个 id / 中文名都出现在这段描述里」）。 */
export function capabilityCatalogText(): string {
  return '可用能力 id：' + CAPABILITIES.map(capability => capability.id + '（' + capability.title + '）').join('、')
}

/** 依赖不满足时给 /doctor 与概览看的中文原因。 */
const DEPENDENCY_REASON: Readonly<Record<CapabilityDependency, string>> = {
  stickerLib: '表情包库未开启（stickerDir 为空）',
  memoryNote: '没有可写的记忆文件（publicMemoryFile 与 groupMemoryDir 都没配）',
}

/** 一个聊天的会话视角（能力按它分流）。 */
export interface CapabilityChatContext {
  /** 私聊还是群聊。 */
  kind: 'private' | 'group'
  /**
   * 这个会话的关系档（T11 的会话视角，直接用 src/relation.ts 的 Relation）。
   *
   * 群聊只有一个会话，大家共用一个工具注册集，所以**群聊里所有人（包括主人）
   * 都是 'groupMember'**（{@link chatRelationOf} 就是这么算的）；私聊里
   * 管理员 → 'owner'、好友名单里的人 → 'friend'、其余 → 'stranger'。
   *
   * 生产代码（bridge）总是给它；只有老调用点漏传时才回落到 adminPrivate。
   */
  relation?: Relation
  /**
   * 是否管理员本人的私聊——**兼容位**，只为老调用点保留。
   * 缺省时由 `relation === 'owner' && kind === 'private'` 推导；给了 relation
   * 就以 relation 为准（这个字段被忽略，见 {@link chatRelationOf}）。
   */
  adminPrivate?: boolean
}

/** 三个 grant（按关系加开能力）的配置键。 */
export type CapabilityGrantKey = 'friendGrant' | 'memberGrant' | 'strangerGrant'

/** 三个 deny（按关系关掉能力）的配置键——T11 r1 的一等公民。 */
export type CapabilityDenyKey = 'friendDeny' | 'memberDeny' | 'strangerDeny'

/** 能力相关的配置（全局 deny + 三个按关系 deny + 三个 grant）。 */
export interface CapabilityConfig {
  /** 全局关闭（最高优先，按关系 deny / grant 都绕不过它）。 */
  capabilitiesDeny?: readonly string[]
  /** 只不给好友私聊用的能力 id（群聊 / 陌生人 / 主人都照常）。 */
  friendDeny?: readonly string[]
  /** 只不给群聊用的能力 id（对所有群成员生效；群里主人发言也按群友档）。 */
  memberDeny?: readonly string[]
  /** 只不给陌生人私聊用的能力 id。 */
  strangerDeny?: readonly string[]
  /** 额外给好友私聊开放的能力 id。 */
  friendGrant?: readonly string[]
  /** 额外给群聊（含群里发言的主人）开放的能力 id。 */
  memberGrant?: readonly string[]
  /** 额外给陌生人私聊开放的能力 id。 */
  strangerGrant?: readonly string[]
}

/** 只描述「一份配置 + 当前进程具备的依赖」的入参（摘要按它算四个关系）。 */
export interface CapabilityViewInput {
  /** 相关配置（全局 deny + 三个按关系 deny + 三个 grant）。 */
  config: CapabilityConfig
  /** 当前进程里实际具备的运行时依赖。 */
  deps: Iterable<CapabilityDependency>
}

/** resolveCapabilities 的入参。 */
export interface ResolveCapabilitiesInput extends CapabilityViewInput {
  /** 目标会话。 */
  chat: CapabilityChatContext
}

/** resolveCapabilities 的结果。 */
export interface ResolveCapabilitiesResult {
  /** 这个聊天能用的能力。 */
  enabled: ReadonlySet<CapabilityId>
  /** 这些能力对应的工具名（注册表顺序；注册时据此放行）。 */
  tools: readonly string[]
  /** 某个能力为什么开 / 为什么关（一句中文）。 */
  why(id: CapabilityId): string
}

/** 三个 grant 命中时的中文原因（点出配置键名，改了配置一眼能对上）。 */
const GRANT_REASONS: Readonly<Record<CapabilityGrantKey, string>> = {
  friendGrant: '好友 grant（friendGrant）已开放',
  memberGrant: '群聊 grant（memberGrant）已开放',
  strangerGrant: '陌生人 grant（strangerGrant）已开放',
}

/** 三个按关系的 deny 命中时的中文原因（同样点出配置键名）。 */
const RELATION_DENY_REASONS: Readonly<Record<CapabilityDenyKey, string>> = {
  friendDeny: '好友关系 deny（friendDeny）已关闭',
  memberDeny: '群聊关系 deny（memberDeny）已关闭',
  strangerDeny: '陌生人关系 deny（strangerDeny）已关闭',
}

/**
 * 把会话视角归一成一个关系：**relation 优先**（生产代码都走这条）；只有老调用点
 * 只给了 adminPrivate 时才由它推导——`adminPrivate === true` 即管理员私聊。
 * @param chat - 会话视角。
 * @returns 关系档。
 */
export function chatRelationOf(chat: CapabilityChatContext): Relation {
  if (chat.relation !== undefined) return chat.relation
  if (chat.adminPrivate === true) return 'owner'
  return chat.kind === 'group' ? 'groupMember' : 'stranger'
}

/** 一个关系档的代表会话视角（群友档用群聊视角，其余用私聊视角；/doctor 与概览按它算）。 */
export function chatViewOf(relation: Relation): CapabilityChatContext {
  return relation === 'groupMember' ? { kind: 'group', relation } : { kind: 'private', relation }
}

/**
 * 一个关系档在「按关系的配置键」上的槽位：群聊恒走群聊键，好友 / 陌生私聊各走
 * 自己的键，主人私聊没有槽位（null）。
 *
 * grant 与 deny 共用这一套分档，于是「哪些人算哪一档」只有一处定义：改档位归属
 * 不会只改一半。
 * @param chat - 会话视角。
 * @param relation - 归一后的关系档。
 * @param keys - 三个关系槽位对应的配置键。
 * @returns 该视角的键；null = 这个视角没有这个槽位。
 */
function relationSlotKey<K extends string>(
  chat: CapabilityChatContext,
  relation: Relation,
  keys: { readonly friend: K; readonly groupMember: K; readonly stranger: K },
): K | null {
  if (chat.kind === 'group') return keys.groupMember
  if (relation === 'friend') return keys.friend
  if (relation === 'stranger') return keys.stranger
  return null
}

/**
 * 这个会话视角该看哪个 grant。
 *
 * 群聊恒看 `memberGrant`：会话级注册看不到具体发言人，群里主人发言也算群友档。
 * 主人私聊没有 grant 位（默认位已经全开，加开没有意义）。主人以外私聊按关系分
 * 好友 / 陌生人两个 grant。
 * @param chat - 会话视角。
 * @param relation - 归一后的关系档。
 * @returns 要看的 grant 键；null = 这个视角没有 grant。
 */
function grantKeyOf(chat: CapabilityChatContext, relation: Relation): CapabilityGrantKey | null {
  return relationSlotKey(chat, relation, { friend: 'friendGrant', groupMember: 'memberGrant', stranger: 'strangerGrant' })
}

/**
 * 这个会话视角该看哪个按关系的 deny（T11 r1）。
 *
 * 与 {@link grantKeyOf} **同一套分档**（群聊 → memberDeny，好友私聊 → friendDeny，
 * 陌生人私聊 → strangerDeny，主人私聊没有 deny 位——要关主人就写全局
 * `capabilitiesDeny`）。
 * @param chat - 会话视角。
 * @param relation - 归一后的关系档。
 * @returns 要看的 deny 键；null = 这个视角没有按关系的 deny。
 */
function denyKeyOf(chat: CapabilityChatContext, relation: Relation): CapabilityDenyKey | null {
  return relationSlotKey(chat, relation, { friend: 'friendDeny', groupMember: 'memberDeny', stranger: 'strangerDeny' })
}

/** 把一份 id 列表读成集合（裁空白；空串丢弃）。 */
function idSet(ids: readonly string[] | undefined): Set<string> {
  const out = new Set<string>()
  for (const raw of ids ?? []) {
    const id = typeof raw === 'string' ? raw.trim() : ''
    if (id !== '') out.add(id)
  }
  return out
}

/**
 * 单个能力的判定结果（开着还是关着 + 一句中文原因）。
 */
export interface CapabilityDecision {
  open: boolean
  reason: string
}

/** 单个能力判定的上下文（{@link decideCapability} 的入参，摊平后便于测试）。 */
export interface CapabilityDecisionInput {
  /** 这个能力的定义（测试可以传一份 memberDefault/groupDefault 为 false 的假定义）。 */
  capability: CapabilityDef
  /** capabilitiesDeny 读成的集合。 */
  deny: ReadonlySet<string>
  /** 当前进程具备的运行时依赖。 */
  available: ReadonlySet<CapabilityDependency>
  /** 这个会话视角要看的按关系的 deny（null = 这个视角没有 deny 位，例如主人私聊）。 */
  relationDeny?: { key: CapabilityDenyKey; ids: ReadonlySet<string> } | null
  /** 这个会话视角要看的 grant（null = 这个视角没有 grant 位，例如主人私聊）。 */
  grant: { key: CapabilityGrantKey; ids: ReadonlySet<string> } | null
  /** 会话视角。 */
  chat: CapabilityChatContext
  /** 归一后的关系档。 */
  relation: Relation
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
export function decideCapability(input: CapabilityDecisionInput): CapabilityDecision {
  const { capability, deny, available, relationDeny, grant, chat, relation } = input
  // 1. 全局关闭优先——即使依赖齐全、即使是主人私聊、即使写了 grant。
  if (deny.has(capability.id)) return { open: false, reason: '已在 capabilitiesDeny 里关闭' }
  // 2. 依赖不满足：能力没有实现，开了也没用（例如表情包库目录没填）。
  const missing = (capability.deps ?? []).find(dep => !available.has(dep))
  if (missing !== undefined) return { open: false, reason: DEPENDENCY_REASON[missing] }
  // 3. 按关系的 deny 命中 → 关，不再看 grant 与默认位（deny 优先于 grant）。
  if (relationDeny !== undefined && relationDeny !== null && relationDeny.ids.has(capability.id)) {
    return { open: false, reason: RELATION_DENY_REASONS[relationDeny.key] }
  }
  // 4. 按关系的 grant 命中 → 开，不再看默认位。
  if (grant !== null && grant.ids.has(capability.id)) return { open: true, reason: GRANT_REASONS[grant.key] }
  // 5. 按会话类型与关系档的默认位判定。
  if (chat.kind === 'group') {
    return capability.groupDefault
      ? { open: true, reason: '群聊默认开启' }
      : { open: false, reason: '群聊默认关闭' }
  }
  if (relation === 'owner') return { open: true, reason: '管理员私聊默认开启' }
  return capability.memberDefault
    ? { open: true, reason: '非管理员私聊默认开启' }
    : { open: false, reason: '非管理员私聊默认关闭' }
}

/**
 * 判定一个聊天能有哪些能力。
 *
 * 判定顺序见 {@link decideCapability}（全局 deny → 依赖 → 按关系 deny → 按关系
 * grant → 默认位）：群的 deny / grant 只用 `memberDeny` / `memberGrant`——会话级
 * 注册看不到具体发言人。
 */
export function resolveCapabilities(input: ResolveCapabilitiesInput): ResolveCapabilitiesResult {
  const deny = idSet(input.config.capabilitiesDeny)
  const available = new Set<CapabilityDependency>(input.deps)
  const { chat } = input
  const relation = chatRelationOf(chat)
  const denyKey = denyKeyOf(chat, relation)
  const relationDeny = denyKey === null ? null : { key: denyKey, ids: idSet(input.config[denyKey]) }
  const grantKey = grantKeyOf(chat, relation)
  const grant = grantKey === null ? null : { key: grantKey, ids: idSet(input.config[grantKey]) }
  const enabled = new Set<CapabilityId>()
  const reasons = new Map<CapabilityId, string>()
  for (const capability of CAPABILITIES) {
    const decision = decideCapability({ capability, deny, available, relationDeny, grant, chat, relation })
    if (decision.open) enabled.add(capability.id)
    reasons.set(capability.id, decision.reason)
  }
  const tools: string[] = []
  for (const capability of CAPABILITIES) {
    if (!enabled.has(capability.id)) continue
    tools.push(...capability.tools)
  }
  return {
    enabled,
    tools,
    why(id: CapabilityId): string {
      return reasons.get(id) ?? '未知能力 id'
    },
  }
}

/** /doctor 与概览共用的一份能力摘要（纯 JSON，可直接进状态快照）。 */
export interface CapabilitySummary {
  /** 已开启的能力数（**主人私聊视角**：缺什么就是配置层真关了什么）。 */
  enabled: number
  /** 能力总数。 */
  total: number
  /** 关闭的能力（注册表顺序；主人私聊视角的原因）。 */
  disabled: Array<{ id: string; title: string; reason: string }>
  /** 四个关系各自的已开数（T11：/doctor「主人 X / 好友 Y / 群友 Z / 陌生人 W」；
   *  T11 r1 起四个数**会真的不一样**——按关系的 deny 只影响自己那一档）。 */
  byRelation: Record<Relation, number>
}

/** 四个关系各自的已开数（每个关系用 {@link chatViewOf} 的代表会话视角各算一遍）。 */
function countByRelation(config: CapabilityConfig, deps: readonly CapabilityDependency[]): Record<Relation, number> {
  const out = {} as Record<Relation, number>
  for (const relation of RELATIONS) {
    out[relation] = resolveCapabilities({ config, deps, chat: chatViewOf(relation) }).enabled.size
  }
  return out
}

/**
 * 把一份配置（+ 当前进程的依赖）压成摘要。
 *
 * `enabled` / `disabled` 取**主人私聊视角**——主人的私聊是权限最高的一类会话，
 * 缺什么就是配置层真关了什么（全局 deny + 依赖；按关系的 deny 不影响这一档）。
 * `byRelation` 另外给出四个关系各自的已开数（T11），供 /doctor 与设置页概览展示
 * 差异：`memberDeny` 写一项，群友数少 1、其余三个不变。
 */
export function summarizeCapabilities(input: CapabilityViewInput): CapabilitySummary {
  const deps = [...input.deps]
  const owner = resolveCapabilities({ config: input.config, deps, chat: chatViewOf('owner') })
  const disabled: CapabilitySummary['disabled'] = []
  for (const capability of CAPABILITIES) {
    if (owner.enabled.has(capability.id)) continue
    disabled.push({ id: capability.id, title: capability.title, reason: owner.why(capability.id) })
  }
  return {
    enabled: CAPABILITIES.length - disabled.length,
    total: CAPABILITIES.length,
    disabled,
    byRelation: countByRelation(input.config, deps),
  }
}

/** 已开数 → 文案（缺数按 0：老快照 / 手搓的摘要不会把 /doctor 打出 undefined）。 */
function countText(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? String(value) : '0'
}

/** /doctor 那一行的正文：四个关系各自的已开数 + 总数；有关闭项时另附原因。 */
export function formatCapabilityLine(summary: CapabilitySummary): string {
  const counts = RELATIONS
    .map(relation => RELATION_NAMES[relation] + ' ' + countText(summary.byRelation?.[relation]))
    .join(' / ')
  const head = '能力：' + counts + '（共 ' + summary.total + '）'
  if (summary.disabled.length === 0) return head
  return head + '；关闭的：' + summary.disabled.map(item => item.id + '（' + item.reason + '）').join('、')
}