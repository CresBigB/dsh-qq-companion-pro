/**
 * 设置页字段定义：10 个子页（= 宿主 SETTINGS_GROUPS 的 10 个分组）的
 * 键集、顺序、类型、默认值与静态元数据（前端设计规范 §1.2 / §3 / §3.12）。
 *
 * - 分组 id / 键序与 src/settings-remote.ts 的 SETTINGS_GROUPS 完全同构；
 * - title / desc 用 §1.2 的名称与一句话说明；
 * - 每个字段的 section（卡片名）、control、unit、min/max、placeholder、
 *   dependsOnText 是 §3 表格的静态投影；dependsOn / danger 这两个函数型
 *   元数据留给 F2（本文件只放静态数据，便于快照/契约测试比对）；
 * - DEFAULTS 全量覆盖上页的 102 键，与宿主 SCHEMA_DEFAULTS 逐字一致；
 * - 不上页的 5 个键（imageMaxSize / maxImageBytes / maxInboundFileBytes /
 *   scheduledPrompts / sttReplacements）见宿主的 EXCLUDED_KEYS。
 */

/** 字段类型：enum（下拉）/ number / boolean / string / stringArray（标签列表）/ secret（密钥型）。 */
export type FieldType = 'enum' | 'number' | 'boolean' | 'string' | 'stringArray' | 'secret'

/** 数字单位（§3.12，控制行尾单位与换算展示）。 */
export type FieldUnit = 'ms' | 's' | 'min' | 'h' | 'day' | 'byte' | 'px' | 'char' | 'count' | 'perDay' | 'perMin'

/** 在 type 之上细化的控件（§3.12）：路径文本 / 时间 HH:MM / 允许 24:00 的时间。 */
export type FieldControl = 'path' | 'time' | 'time24'

/** 一个字段的呈现定义（键序即面板行序）。 */
export interface FieldMeta {
  /** 配置键（= patch config 的键名）。 */
  key: string
  /** 中文标签。 */
  label: string
  /** 控件类型。 */
  type: FieldType
  /** enum 的取值列表（含 '' = 跟随默认）。 */
  options?: string[]
  /** enum 的取值 → 中文标签。 */
  optionLabels?: Record<string, string>
  /** 行尾提示（一句话说明；不再附带配置键名，键名由统一的 .qqc-key 展示）。 */
  hint?: string
  /** 卡片标题：同页同 section 的字段连续排列（§3 各表的「卡片」列）。 */
  section: string
  /** 在 type 之上细化的控件（§3 各表的「控件」列）。 */
  control?: FieldControl
  /** 数字单位（§3 各表控件列里的单位）。 */
  unit?: FieldUnit
  /** 数字下限（缺省 0；port 为 1）。 */
  min?: number
  /** 数字上限（port 为 65535；其余不设上限）。 */
  max?: number
  /** 文本占位符（§3 标注「占位」的字段）。 */
  placeholder?: string
  /** 依赖条件未满足时的说明（§3「依赖」列改写成一句中文）。 */
  dependsOnText?: string
  /** 依赖条件（§3「依赖」列的函数化投影）：返回 false = 未生效——整行弱化、
   *  加「未生效」徽标、在说明下追加 dependsOnText，但控件仍可编辑。 */
  dependsOn?: (draft: Record<string, unknown>) => boolean
  /** 0 值的语义（§4.3）：数值为 0 时换算区显示「= 关闭」/「= 不限」。 */
  zeroMeans?: '关闭' | '不限'
}

/** 一个子页：id + 名称 + 一句话说明 + 字段列表。 */
export interface GroupMeta {
  /** 分组 id（= host SETTINGS_GROUPS 的键，也 = 子页 id）。 */
  id: string
  /** 子页名称（§1.2）。 */
  title: string
  /** 子页副标题 / 一句话说明（§1.2）。 */
  desc: string
  /** 组内字段（键序即渲染顺序）。 */
  fields: FieldMeta[]
}

/** 兼容别名：F0 之前的字段表类型名（render.ts 等处的既有引用）。 */
export type OnebotField = FieldMeta
/** 兼容别名：F0 之前的分组类型名。 */
export type OnebotGroup = GroupMeta

/* ------------------------------------------------------------------ *
 * 草稿读取小工具（供 dependsOn 判断用；纯函数，不依赖 hooks / 模块状态）
 * 草稿形态见 logic.ts 的 snapshotValueToDraft：布尔是 boolean、数字是文本、
 * 文本是 string、stringArray 是 string[]。这里全部容忍文本/数字/数组三种输入。
 * ------------------------------------------------------------------ */

/** 草稿里的布尔值（缺省 false）。 */
export function draftBool(draft: Record<string, unknown> | null | undefined, key: string): boolean {
  return draft != null && draft[key] === true
}

/** 草稿里的数值（数字或数字文本；缺省 / 非法为 NaN）。 */
export function draftNumber(draft: Record<string, unknown> | null | undefined, key: string): number {
  if (draft == null) return NaN
  const raw = draft[key]
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    return trimmed === '' ? NaN : Number(trimmed)
  }
  return NaN
}

/** 草稿里的文本值（nullish → ''）。 */
export function draftText(draft: Record<string, unknown> | null | undefined, key: string): string {
  if (draft == null) return ''
  const raw = draft[key]
  return raw === undefined || raw === null ? '' : String(raw)
}

/** 10 组 102 键字段定义（顺序 = 导航顺序 = 宿主 SETTINGS_GROUPS 的键序）。 */
export const GROUPS: GroupMeta[] = [
  {
    id: 'connection',
    title: '连接',
    desc: 'NapCat 怎么连到这个插件，QQ 会话默认放在哪个工作区',
    fields: [
      { key: 'host', label: '监听地址', type: 'string', hint: 'NapCat 反向 WebSocket 连接的地址，一般保持 127.0.0.1。', section: 'NapCat 连接' },
      { key: 'port', label: '监听端口', type: 'number', hint: 'NapCat 反向 WebSocket 连接的端口。', section: 'NapCat 连接', min: 1, max: 65535 },
      { key: 'accessToken', label: '访问令牌（AccessToken）', type: 'secret', hint: '与 NapCat 侧一致的鉴权令牌；留空 = 不修改，点「清空」后保存 = 清空。', section: 'NapCat 连接' },
      { key: 'botQQ', label: '机器人 QQ 号', type: 'string', hint: '留空则连上后自动识别。', section: 'NapCat 连接' },
      // workspacePath 的语义（对齐 README「会话工作区选择」）：修改只对新会话生效；
      // 已设 per-chat /workspace 覆盖的会话不受影响。
      { key: 'workspacePath', label: '会话默认工作区路径', type: 'string', control: 'path', hint: 'QQ 会话的工作区目录；保存后仅对新会话生效，已用 /workspace 设置 per-chat 覆盖的会话不受影响。留空 = 宿主进程工作目录。管理员私聊优先用 adminWorkspacePath，开了群记忆（groupMemoryDir）的群聊用 <群记忆目录>/<群号>，这两类会话不受本项影响。', section: '工作区' },
      { key: 'attachWorkspaceMode', label: '会话归入工作区', type: 'enum', options: ['existing', 'auto', 'off'], optionLabels: { existing: '只归入已有的', auto: '自动为每个聊天建', off: '不归入' }, hint: 'QQ 会话怎么归入 DSH 工作区（网页会话列表按工作区分组）：只归入已有的 = 已有工作区的目录就归入（另外为 workspacePath 自动建一个）；自动为每个聊天建 = 群聊、私聊各自的工作目录也自动建工作区（每个群一个）；不归入 = 不碰工作区。已有会话在 QQ 里发 /workspace attach 可立即补挂。', section: '工作区' },
    ],
  },
  {
    id: 'access',
    title: '谁能找她',
    desc: '谁能私聊、哪些群能用、群里的人能让她做什么',
    fields: [
      { key: 'adminUsers', label: '管理员（主人）QQ', type: 'stringArray', hint: '每行一个 QQ 号。', section: '私聊' },
      { key: 'dmPolicy', label: '私聊策略', type: 'enum', options: ['open', 'allowlist', 'disabled'], optionLabels: { open: '仅管理员（开了"允许所有用户"则所有人）', allowlist: '白名单', disabled: '不接私聊' }, hint: 'open = 仅管理员；allowlist = 仅私聊白名单；disabled = 拒绝所有私聊。', section: '私聊' },
      { key: 'allowFrom', label: '私聊白名单', type: 'stringArray', hint: '每行一个 QQ 号，仅白名单策略生效。', section: '私聊', dependsOnText: '仅在私聊策略为白名单时生效', dependsOn: draft => draftText(draft, 'dmPolicy') === 'allowlist' },
      { key: 'allowAllUsers', label: '允许所有用户', type: 'boolean', hint: '开发用。打开后任何人都能私聊她。', section: '私聊' },
      { key: 'groupPolicy', label: '群聊策略', type: 'enum', options: ['open', 'allowlist', 'disabled'], optionLabels: { open: '所有群', allowlist: '白名单', disabled: '不接群聊' }, hint: 'open = 所有群；allowlist = 仅群聊白名单；disabled = 拒绝所有群聊。', section: '群聊' },
      { key: 'groupAllowFrom', label: '群聊白名单', type: 'stringArray', hint: '每行一个群号，仅白名单策略生效。', section: '群聊', dependsOnText: '仅在群聊策略为白名单时生效', dependsOn: draft => draftText(draft, 'groupPolicy') === 'allowlist' },
      { key: 'requireMention', label: '群聊必须 @ 机器人', type: 'boolean', section: '群聊' },
      { key: 'restrictedMemberPrefix', label: '群友消息加"受限用户"标记', type: 'boolean', hint: '群里非管理员的消息前加 [受限用户:仅问答]，提示她只回答问题、不做文件和终端操作。关掉后提示词里群友和主人没有区别。', section: '群聊' },
      { key: 'autoAcceptAdminRequests', label: '自动同意管理员的好友/拉群请求', type: 'boolean', hint: '别人的请求不同意，会私聊告诉管理员。', section: '自动处理请求' },
      { key: 'autoAllowInvitedGroups', label: '管理员拉进的群自动加白名单', type: 'boolean', hint: '管理员把机器人拉进的群自动加入群白名单，保存在 mediaDir/group-allowlist.json。', section: '自动处理请求' },
    ],
  },
  {
    id: 'persona',
    title: '她',
    desc: '用哪个预设、怎么称呼主人、主人私聊给多大权限',
    fields: [
      { key: 'ownerTitle', label: '对主人的称呼', type: 'string', hint: '系统提示和通知里怎么称呼管理员，例如“主人”。', section: '称呼' },
      { key: 'agentPreset', label: 'QQ 会话默认预设', type: 'string', hint: '群聊和其他人用的 dsh 预设 id；留空 = 宿主默认预设。', section: '预设与权限' },
      { key: 'adminPreset', label: '管理员私聊预设', type: 'string', hint: '管理员私聊的新会话用这个预设；留空 = 同上。', section: '预设与权限' },
      { key: 'adminPermission', label: '管理员私聊权限预设', type: 'string', hint: '管理员私聊每个新会话自动切到的宿主权限预设，例如 danger-full-access；留空 = 不切。', section: '预设与权限' },
      { key: 'memberPermission', label: '其他会话的宿主权限', type: 'string', hint: '非管理员私聊与所有群聊的新会话自动切换的权限预设，建议 read-only；留空 = 不切，会话继承宿主默认预设。', section: '预设与权限' },
      { key: 'adminWorkspacePath', label: '管理员私聊工作目录', type: 'string', control: 'path', hint: '管理员私聊的会话工作目录（私密记忆所在目录）；留空 = 会话默认工作区。设置后覆盖 workspacePath：管理员私聊会话用这个目录，不受「会话默认工作区路径」影响。', section: '预设与权限' },
      { key: 'groupReasoningEffort', label: '群聊思考强度', type: 'enum', options: ['', 'off', 'low', 'high', 'max'], optionLabels: { '': '跟随部署默认', off: '关闭', low: '低', high: '高', max: '最高' }, hint: '群里消息多，调低能省额度；私聊不受影响。', section: '群聊' },
    ],
  },
  {
    id: 'messaging',
    title: '说话方式',
    desc: '一句一条、打字节奏、长回复转图片、中间消息',
    fields: [
      { key: 'splitLines', label: '一句一条', type: 'boolean', hint: '最终回复按行拆成多条 QQ 消息发送。', section: '拆句' },
      { key: 'splitMaxMessages', label: '最多拆成几条', type: 'number', hint: '超过就整段发。', section: '拆句', unit: 'count', min: 0, dependsOnText: '仅在「一句一条」打开时生效', dependsOn: draft => draftBool(draft, 'splitLines') },
      { key: 'groupSplitLines', label: '群里也一句一条', type: 'boolean', hint: '关掉后群里每次回复只发一条，发送量少很多，降低 QQ 风控概率。', section: '拆句', dependsOnText: '仅在「一句一条」打开时生效', dependsOn: draft => draftBool(draft, 'splitLines') },
      { key: 'humanTypingPace', label: '所有消息按真人打字速度发', type: 'boolean', hint: '每条消息发出前按字数等“打字”时间，整个小号同一时间只打一条，几个会话同时回复时自然排队。', section: '打字节奏' },
      { key: 'typingDelayPerCharMs', label: '每个字的打字时间（毫秒）', type: 'number', hint: '拆分发送时每个字的打字停顿。', section: '打字节奏', unit: 'ms', min: 0, dependsOnText: '仅在「所有消息按真人打字速度发」或「一句一条」打开时生效', dependsOn: draft => draftBool(draft, 'humanTypingPace') || draftBool(draft, 'splitLines') },
      { key: 'typingDelayMinMs', label: '一条消息最短打字时间（毫秒）', type: 'number', hint: '两条消息之间最短停顿。', section: '打字节奏', unit: 'ms', min: 0, dependsOnText: '仅在「所有消息按真人打字速度发」或「一句一条」打开时生效', dependsOn: draft => draftBool(draft, 'humanTypingPace') || draftBool(draft, 'splitLines') },
      { key: 'typingDelayMaxMs', label: '一条消息最长打字时间（毫秒）', type: 'number', hint: '太长的消息也不会等超过这个时间。', section: '打字节奏', unit: 'ms', min: 0, dependsOnText: '仅在「所有消息按真人打字速度发」或「一句一条」打开时生效', dependsOn: draft => draftBool(draft, 'humanTypingPace') || draftBool(draft, 'splitLines') },
      { key: 'textImageThreshold', label: '长回复转图片的字数', type: 'number', hint: '超过这个字数渲染成图片卡片；0 = 永远发文字。', section: '长回复卡片', unit: 'char', min: 0, zeroMeans: '关闭' },
      { key: 'cardFooter', label: '卡片页脚', type: 'string', hint: '长回复转成图片时卡片底部的署名文字', section: '长回复卡片', dependsOnText: '仅在「长回复转图片的字数」大于 0 时生效', dependsOn: draft => draftNumber(draft, 'textImageThreshold') > 0 },
      { key: 'fontFiles', label: '卡片字体文件', type: 'stringArray', hint: '每个一行，填字体文件路径；Windows 一般不用填', section: '长回复卡片', dependsOnText: '仅在「长回复转图片的字数」大于 0 时生效', dependsOn: draft => draftNumber(draft, 'textImageThreshold') > 0 },
      { key: 'fontFamilies', label: '卡片优先字体', type: 'stringArray', hint: '字体家族名，覆盖系统默认', section: '长回复卡片', dependsOnText: '仅在「长回复转图片的字数」大于 0 时生效', dependsOn: draft => draftNumber(draft, 'textImageThreshold') > 0 },
      { key: 'interimMessages', label: '中间消息', type: 'boolean', hint: '回合进行中发送流式中间消息。', section: '中间消息与报错' },
      { key: 'interimRecall', label: '自动撤回中间消息', type: 'boolean', hint: '中间消息发送后按「中间消息保留时长」自动单独撤回。', section: '中间消息与报错', dependsOnText: '仅在「中间消息」打开时生效', dependsOn: draft => draftBool(draft, 'interimMessages') },
      { key: 'interimRecallMs', label: '中间消息保留时长（毫秒）', type: 'number', hint: '中间消息各自发送完成后多久自动单独撤回（QQ 撤回时限约 2 分钟，建议 ≤110000）。', section: '中间消息与报错', unit: 'ms', min: 0, dependsOnText: '仅在「中间消息」与「自动撤回中间消息」都打开时生效', dependsOn: draft => draftBool(draft, 'interimMessages') && draftBool(draft, 'interimRecall') },
      { key: 'sendErrorNotice', label: '发送错误通知', type: 'boolean', hint: '一轮运行出错时向聊天发一条 ⚠️ 错误提示。', section: '中间消息与报错' },
    ],
  },
  {
    id: 'conversation',
    title: '会话与任务',
    desc: '忙的时候来新消息怎么办、多久换新会话、旧会话怎么清理',
    fields: [
      { key: 'newMessagePolicy', label: '任务运行中的新消息', type: 'enum', options: ['queue', 'steer'], optionLabels: { queue: '排队', steer: '插话' }, hint: '任务运行中收到新普通消息：排队=当前任务结束后按序处理（每回合至多提示一次）；插话=作为补充指令加入当前任务。图片/文件/语音/引用消息与受限用户始终按排队处理。', section: '忙的时候' },
      { key: 'autoSteerPolicy', label: '自动插话资格', type: 'enum', options: ['admin', 'all'], optionLabels: { admin: '仅管理员', all: '所有成员' }, hint: '插话模式下运行中收到的新普通纯文字消息谁可自动插话：仅管理员（默认）或所有成员。不具备资格的消息按排队处理；/steer 命令始终仅管理员；受限用户任何档都不自动插话。', section: '忙的时候', dependsOnText: '仅在「任务运行中的新消息」为插话时生效', dependsOn: draft => draftText(draft, 'newMessagePolicy') === 'steer' },
      { key: 'deferredTimeoutMs', label: '等待模型回复超时（毫秒）', type: 'number', hint: '回合超过该时长无任何模型输出时提示超时并登记补发跟踪，任务完成后自动补发最终文字（超时补发）；发送失败最多重试 3 次，结果不确定时停止自动重试；/stop 终止该聊天的补发跟踪。0=关闭。', section: '忙的时候', unit: 'ms', min: 0, zeroMeans: '关闭' },
      { key: 'unknownCommand', label: '未知命令处理', type: 'enum', options: ['intercept', 'passthrough'], optionLabels: { intercept: '拦截', passthrough: '透传' }, hint: '未知斜杠命令：拦截 = 提示相近命令或 /help；透传 = 交给模型处理。', section: '命令与频控' },
      { key: 'rateLimitPerMinute', label: '每分钟消息频率上限', type: 'number', hint: '每 chat 每分钟普通消息条数上限；命令消息不计入；0 = 不限。', section: '命令与频控', unit: 'perMin', min: 0, zeroMeans: '不限' },
      { key: 'idleResetHours', label: '空闲多久换新会话（小时）', type: 'number', hint: '超过这么久没说话，下一条消息开新会话并附最近几句交接；0 = 关。', section: '换新会话', unit: 'h', min: 0, zeroMeans: '关闭' },
      { key: 'privateResetDays', label: '私聊几天换一次会话', type: 'number', hint: '按凌晨 4 点算天；0 = 关。', section: '换新会话', unit: 'day', min: 0, zeroMeans: '关闭' },
      { key: 'groupResetDays', label: '群聊几天换一次会话', type: 'number', hint: '按凌晨 4 点算天；0 = 关。', section: '换新会话', unit: 'day', min: 0, zeroMeans: '关闭' },
      { key: 'sessionTitleTemplate', label: '会话标题模板', type: 'string', hint: '新建 QQ 会话（以及恢复时还没有标题的旧会话）的网页标题，可用 {kind} {target} {nickname} {date} {time}；已有标题（比如在网页上手动改过）的不会被覆盖，留空 = 不自动命名。', section: '换新会话' },
      { key: 'privateSessionKeepDays', label: '私聊旧会话保留', type: 'number', hint: '换下来的私聊旧会话超过这么多天没写入就删除；0 = 永不删。正在用的会话不会删', section: '旧会话清理', unit: 'day', min: 0, zeroMeans: '关闭' },
      { key: 'groupSessionKeepDays', label: '群聊旧会话保留', type: 'number', hint: '同上，作用于群聊', section: '旧会话清理', unit: 'day', min: 0, zeroMeans: '关闭' },
      { key: 'chatIdleEvictDays', label: '空闲会话释放', type: 'number', hint: '超过这么多天没动静的聊天先释放内存（会话已落盘，下次来消息自动恢复）；0 = 不释放', section: '旧会话清理', unit: 'day', min: 0, zeroMeans: '关闭' },
    ],
  },
  {
    id: 'group',
    title: '群聊',
    desc: '群里怎么叫她、给她看多少上下文、热闹时要不要看一眼',
    fields: [
      { key: 'groupNameTriggers', label: '点名关键词', type: 'stringArray', hint: '群里说出这些名字也算在叫她，不用 @', section: '怎么叫她' },
      { key: 'groupFollowupSeconds', label: '接话窗口', type: 'number', hint: '她回了某人之后这段时间内，那人接着说不用 @ 也算在跟她聊；0 = 关', section: '怎么叫她', unit: 's', min: 0, zeroMeans: '关闭' },
      { key: 'groupContextLines', label: '附带的群聊条数', type: 'number', hint: '叫到她时，把她没看到的最近几条群聊一并给她看；0 = 不附', section: '怎么叫她', unit: 'count', min: 0, zeroMeans: '关闭' },
      { key: 'groupAutoQuote', label: '群聊自动引用', type: 'enum', options: ['off', 'busy', 'always'], optionLabels: { off: '关闭', busy: '有人插话时', always: '总是' }, hint: '群里回复时是否自动引用叫她的那条消息：关闭 = 不自动（她仍可以自己决定引用）；有人插话时 = 从叫她那句到她回复之间群里又有人说话才引用；总是 = 每次都引用。她自己在回复开头写 [引用:消息 id] 时以她为准；私聊不自动引用。', section: '回复方式' },
      { key: 'groupPeekEnabled', label: '热闹时看一眼', type: 'boolean', hint: '群里聊得热闹时隔一段时间让她看看，自己决定插不插话', section: '热闹时看一眼' },
      { key: 'groupPeekGapMinutes', label: '两次之间至少隔', type: 'number', section: '热闹时看一眼', unit: 'min', min: 0, dependsOnText: '仅在「热闹时看一眼」打开时生效', dependsOn: draft => draftBool(draft, 'groupPeekEnabled') },
      { key: 'groupPeekMinMessages', label: '至少攒够多少条新消息', type: 'number', section: '热闹时看一眼', unit: 'count', min: 0, dependsOnText: '仅在「热闹时看一眼」打开时生效', dependsOn: draft => draftBool(draft, 'groupPeekEnabled') },
      { key: 'groupPeekQuietMinutes', label: '她刚说过话的冷却', type: 'number', hint: '她在群里说话后这段时间内不看', section: '热闹时看一眼', unit: 'min', min: 0, dependsOnText: '仅在「热闹时看一眼」打开时生效', dependsOn: draft => draftBool(draft, 'groupPeekEnabled') },
      { key: 'groupPeekWindowStart', label: '每天从几点开始', type: 'string', control: 'time', section: '热闹时看一眼', dependsOnText: '仅在「热闹时看一眼」打开时生效', dependsOn: draft => draftBool(draft, 'groupPeekEnabled') },
      { key: 'groupPeekWindowEnd', label: '到几点结束', type: 'string', control: 'time24', hint: '可以写 24:00', section: '热闹时看一眼', dependsOnText: '仅在「热闹时看一眼」打开时生效', dependsOn: draft => draftBool(draft, 'groupPeekEnabled') },
    ],
  },
  {
    id: 'memory',
    title: '记忆',
    desc: '记忆文件放哪、多大会满、群友让记的内容哪些词不能出现',
    fields: [
      { key: 'publicMemoryFile', label: '公开记忆文件', type: 'string', control: 'path', hint: '所有会话都读的记忆文件路径（AGENTS.md）。', section: '记忆文件' },
      { key: 'publicMemoryMaxBytes', label: '公开记忆上限（字节）', type: 'number', hint: '满了群里就不再追加。', section: '记忆文件', unit: 'byte', min: 0, dependsOnText: '仅在填了公开记忆文件时生效', dependsOn: draft => draftText(draft, 'publicMemoryFile') !== '' },
      { key: 'groupMemoryDir', label: '每群一份记忆的目录', type: 'string', control: 'path', hint: '<目录>/<群号>/AGENTS.md，群会话以此为工作目录；留空 = 所有群共用公开记忆。设置后覆盖 workspacePath：群会话用 <目录>/<群号>，不受「会话默认工作区路径」影响。', section: '记忆文件' },
      { key: 'groupMemoryMaxBytes', label: '每群记忆上限（字节）', type: 'number', hint: '每个群的记忆文件达到这个大小后就不再追加。', section: '记忆文件', unit: 'byte', min: 0, dependsOnText: '仅在填了每群记忆目录时生效', dependsOn: draft => draftText(draft, 'groupMemoryDir') !== '' },
      { key: 'privateMemoryMaxBytes', label: '私密记忆建议上限', type: 'number', hint: '主人私聊工作目录里 AGENTS.md 的上限，会写进她的功能说明，由她自己整理', section: '记忆文件', unit: 'byte', min: 0 },
      { key: 'memoryNoteDenyWords', label: '群记忆禁词', type: 'stringArray', hint: '群友让她记的内容里出现这些词就拒绝（微信号、真名、住址等）；主人 QQ 号自动包含', section: '群记忆过滤' },
    ],
  },
  {
    id: 'proactive',
    title: '主动聊天',
    desc: '每天什么时间、几次主动找主人；定时任务在这里查看',
    fields: [
      { key: 'proactiveEnabled', label: '开启主动聊天', type: 'boolean', hint: '每天在时间窗内随机叫醒几次，她自己决定发不发。', section: '主动聊天' },
      { key: 'proactiveChatId', label: '主动找谁', type: 'string', hint: '会话 id，例如 private:QQ号。', section: '主动聊天', placeholder: 'private:QQ号', dependsOnText: '仅在「开启主动聊天」打开时生效', dependsOn: draft => draftBool(draft, 'proactiveEnabled') },
      { key: 'proactiveWindowStart', label: '时间窗开始', type: 'string', control: 'time', hint: 'HH:MM。', section: '时间窗', dependsOnText: '仅在「开启主动聊天」打开时生效', dependsOn: draft => draftBool(draft, 'proactiveEnabled') },
      { key: 'proactiveWindowEnd', label: '时间窗结束', type: 'string', control: 'time', hint: 'HH:MM。', section: '时间窗', dependsOnText: '仅在「开启主动聊天」打开时生效', dependsOn: draft => draftBool(draft, 'proactiveEnabled') },
      { key: 'proactiveMinPerDay', label: '每天至少几次', type: 'number', section: '频率', unit: 'perDay', min: 0, dependsOnText: '仅在「开启主动聊天」打开时生效', dependsOn: draft => draftBool(draft, 'proactiveEnabled') },
      { key: 'proactiveMaxPerDay', label: '每天最多几次', type: 'number', section: '频率', unit: 'perDay', min: 0, dependsOnText: '仅在「开启主动聊天」打开时生效', dependsOn: draft => draftBool(draft, 'proactiveEnabled') },
      { key: 'proactiveMinGapMinutes', label: '两次之间至少隔几分钟', type: 'number', section: '频率', unit: 'min', min: 0, dependsOnText: '仅在「开启主动聊天」打开时生效', dependsOn: draft => draftBool(draft, 'proactiveEnabled') },
      { key: 'proactiveSkipIfActiveMinutes', label: '刚聊过几分钟内跳过', type: 'number', section: '频率', unit: 'min', min: 0, dependsOnText: '仅在「开启主动聊天」打开时生效', dependsOn: draft => draftBool(draft, 'proactiveEnabled') },
      { key: 'proactiveMaxUnanswered', label: '几条没回就当天停止', type: 'number', section: '频率', unit: 'count', min: 0, dependsOnText: '仅在「开启主动聊天」打开时生效', dependsOn: draft => draftBool(draft, 'proactiveEnabled') },
    ],
  },
  {
    id: 'media',
    title: '媒体与语音',
    desc: '表情包库、语音转写、收发图片与文件的大小上限',
    fields: [
      { key: 'stickerDir', label: '表情包库目录', type: 'string', control: 'path', hint: '留空 = 关闭表情包（她没有存、找、发表情包的工具）。填一个目录即开启，例如 E:\\To DeepSeek\\companion\\stickers', section: '表情包库' },
      { key: 'stickerMaxCount', label: '最多存多少张', type: 'number', section: '表情包库', unit: 'count', min: 0, dependsOnText: '仅在填了表情包库目录时生效', dependsOn: draft => draftText(draft, 'stickerDir') !== '' },
      { key: 'stickerMaxBytes', label: '单张最大', type: 'number', section: '表情包库', unit: 'byte', min: 0, dependsOnText: '仅在填了表情包库目录时生效', dependsOn: draft => draftText(draft, 'stickerDir') !== '' },
      { key: 'stickerDailyMax', label: '每天最多新存几张', type: 'number', hint: '控制她看图打标签的花费；合并到已有表情不算', section: '表情包库', unit: 'perDay', min: 0, dependsOnText: '仅在填了表情包库目录时生效', dependsOn: draft => draftText(draft, 'stickerDir') !== '' },
      { key: 'sttEnabled', label: '收到语音转成文字', type: 'boolean', hint: '本机离线识别，需要 ffmpeg 和识别引擎；没装好时她只会看到 [语音]', section: '语音转写' },
      { key: 'sttEngine', label: '识别引擎', type: 'enum', options: ['auto', 'sherpa-onnx', 'whisper-cpp', 'command', 'openai', 'custom'], optionLabels: { auto: '自动', 'sherpa-onnx': 'SenseVoice（推荐）', 'whisper-cpp': 'whisper.cpp', command: '自定义命令', openai: 'openai（旧名，等同自动）', custom: 'custom（旧名，等同自定义命令）' }, section: '语音转写', dependsOnText: '仅在「收到语音转成文字」打开时生效', dependsOn: draft => draftBool(draft, 'sttEnabled') },
      { key: 'sttModel', label: '模型', type: 'string', control: 'path', hint: 'sherpa-onnx 填 SenseVoice 模型目录；whisper.cpp 填模型名或 .bin 路径；留空用默认位置', section: '语音转写', dependsOnText: '仅在「收到语音转成文字」打开时生效', dependsOn: draft => draftBool(draft, 'sttEnabled') },
      { key: 'sttCommand', label: '自定义命令程序', type: 'string', control: 'path', section: '语音转写', dependsOnText: '仅在「收到语音转成文字」打开，且识别引擎为自定义命令时生效', dependsOn: draft => draftBool(draft, 'sttEnabled') && (draftText(draft, 'sttEngine') === 'command' || draftText(draft, 'sttEngine') === 'custom') },
      { key: 'sttArgs', label: '自定义命令参数', type: 'stringArray', hint: '每个一行，可用 {wav} {input} {model} {lang} 占位', section: '语音转写', dependsOnText: '仅在「收到语音转成文字」打开，且识别引擎为自定义命令时生效', dependsOn: draft => draftBool(draft, 'sttEnabled') && (draftText(draft, 'sttEngine') === 'command' || draftText(draft, 'sttEngine') === 'custom') },
      { key: 'sttLanguage', label: '语言', type: 'string', hint: 'auto 自动判断，或 zh / en / ja…', section: '语音转写', dependsOnText: '仅在「收到语音转成文字」打开时生效', dependsOn: draft => draftBool(draft, 'sttEnabled') },
      { key: 'sttMaxSeconds', label: '每条只转前多少秒', type: 'number', section: '语音转写', unit: 's', min: 0, dependsOnText: '仅在「收到语音转成文字」打开时生效', dependsOn: draft => draftBool(draft, 'sttEnabled') },
      { key: 'sttTimeoutMs', label: '单次转写超时', type: 'number', section: '语音转写', unit: 'ms', min: 0, dependsOnText: '仅在「收到语音转成文字」打开时生效', dependsOn: draft => draftBool(draft, 'sttEnabled') },
      { key: 'inboundImageMaxPx', label: '收到的图片压到多大（像素）', type: 'number', hint: '长边超过就缩小再给模型看，省 token。', section: '图片与文件', unit: 'px', min: 0 },
      { key: 'outboundImageMaxBytes', label: '发出图片上限', type: 'number', section: '图片与文件', unit: 'byte', min: 0 },
      { key: 'maxVoiceBytes', label: '发出语音上限', type: 'number', section: '图片与文件', unit: 'byte', min: 0 },
      { key: 'maxFileBytes', label: '发出视频/文件上限', type: 'number', section: '图片与文件', unit: 'byte', min: 0 },
      { key: 'inboundFileMaxBytes', label: '接收文件上限', type: 'number', hint: '0 = 不限制', section: '图片与文件', unit: 'byte', min: 0, zeroMeans: '不限' },
      { key: 'mediaDir', label: '媒体与状态目录', type: 'string', control: 'path', hint: '留空 = <DSH 目录>/media/onebot。改了之后会话映射等状态文件也换位置，旧文件不会自动搬', section: '存储与网络' },
      { key: 'tempTtlHours', label: '临时媒体保留', type: 'number', section: '存储与网络', unit: 'h', min: 0 },
      { key: 'allowPrivateHosts', label: '允许从内网地址下载', type: 'boolean', hint: '默认拒绝下载内网/本机地址（防 SSRF）；NapCat 文件服务在本机时才需要打开', section: '存储与网络' },
    ],
  },
  {
    id: 'diagnostics',
    title: '诊断',
    desc: '日志级别、发送审计、决策追踪、消息去重',
    fields: [
      { key: 'logLevel', label: '控制台日志级别', type: 'enum', options: ['debug', 'info', 'warn', 'error'], optionLabels: { debug: '全部', info: '常规（默认）', warn: '只看警告和错误', error: '只看错误' }, section: '日志' },
      { key: 'actionAuditEnabled', label: '工具发送审计', type: 'boolean', hint: '她用工具主动发出的图片、语音、文件、合并转发，每条都记一行到 qq-actions.log；关闭后不再留这份记录，发送本身不受影响。', section: '审计与追踪' },
      { key: 'traceEnabled', label: '决策追踪（trace）', type: 'boolean', hint: '把每个入站/出站决策事件写入 qq-trace.jsonl 便于排查；关闭后零文件、行为与关闭时完全一致。', section: '审计与追踪' },
      { key: 'traceLevel', label: '追踪级别', type: 'enum', options: ['debug', 'warn'], optionLabels: { debug: '全部事件', warn: '只记被拒或失败' }, section: '审计与追踪', dependsOnText: '仅在「决策追踪」打开时生效', dependsOn: draft => draftBool(draft, 'traceEnabled') },
      { key: 'dedupWindowSeconds', label: '消息去重窗口', type: 'number', hint: '断线重连时同一条消息重投只处理一次；0 = 关', section: '入站', unit: 's', min: 0, zeroMeans: '关闭' },
      { key: 'ignoreSelf', label: '忽略自己发出的消息', type: 'boolean', hint: '防止她回复自己形成循环，一般不要关', section: '入站' },
      { key: 'sensitivePatterns', label: '出站敏感内容正则', type: 'stringArray', hint: '每个一行，只记录不拦截；留空用内置规则', section: '出站审计' },
    ],
  },
]

/** 全部 102 键扁平表（顺序 = 分组声明顺序，与 host ALL_KEYS 语义一致）。 */
export const ALL_FIELDS: FieldMeta[] = []
for (const group of GROUPS) {
  for (const field of group.fields) ALL_FIELDS.push(field)
}

/** schema 默认值（重置按钮与空快照兜底的唯一来源；与
 *  src/settings-remote.ts SCHEMA_DEFAULTS 逐字对齐）。 */
export const DEFAULTS: Record<string, unknown> = {
  host: '127.0.0.1',
  port: 8643,
  accessToken: '',
  botQQ: '',
  workspacePath: '',
  attachWorkspaceMode: 'existing',
  adminUsers: [],
  dmPolicy: 'open',
  allowFrom: [],
  allowAllUsers: false,
  groupPolicy: 'open',
  groupAllowFrom: [],
  requireMention: true,
  restrictedMemberPrefix: true,
  autoAcceptAdminRequests: false,
  autoAllowInvitedGroups: false,
  ownerTitle: '管理员',
  agentPreset: '',
  adminPreset: '',
  adminPermission: '',
  memberPermission: '',
  adminWorkspacePath: '',
  groupReasoningEffort: '',
  splitLines: false,
  splitMaxMessages: 6,
  groupSplitLines: true,
  humanTypingPace: false,
  typingDelayPerCharMs: 80,
  typingDelayMinMs: 500,
  typingDelayMaxMs: 2500,
  textImageThreshold: 150,
  cardFooter: 'dsh',
  fontFiles: [],
  fontFamilies: [],
  interimMessages: true,
  interimRecall: true,
  interimRecallMs: 90000,
  sendErrorNotice: true,
  newMessagePolicy: 'queue',
  autoSteerPolicy: 'admin',
  deferredTimeoutMs: 600000,
  unknownCommand: 'intercept',
  rateLimitPerMinute: 30,
  idleResetHours: 0,
  privateResetDays: 0,
  groupResetDays: 0,
  sessionTitleTemplate: '{kind} {target} · {date}',
  privateSessionKeepDays: 0,
  groupSessionKeepDays: 0,
  chatIdleEvictDays: 7,
  groupNameTriggers: [],
  groupFollowupSeconds: 0,
  groupContextLines: 0,
  groupAutoQuote: 'off',
  groupPeekEnabled: false,
  groupPeekGapMinutes: 30,
  groupPeekMinMessages: 10,
  groupPeekQuietMinutes: 10,
  groupPeekWindowStart: '09:00',
  groupPeekWindowEnd: '24:00',
  publicMemoryFile: '',
  publicMemoryMaxBytes: 6144,
  groupMemoryDir: '',
  groupMemoryMaxBytes: 8192,
  privateMemoryMaxBytes: 24576,
  memoryNoteDenyWords: [],
  proactiveEnabled: false,
  proactiveChatId: '',
  proactiveWindowStart: '09:00',
  proactiveWindowEnd: '22:00',
  proactiveMinPerDay: 4,
  proactiveMaxPerDay: 6,
  proactiveMinGapMinutes: 90,
  proactiveSkipIfActiveMinutes: 30,
  proactiveMaxUnanswered: 2,
  stickerDir: '',
  stickerMaxCount: 300,
  stickerMaxBytes: 4194304,
  stickerDailyMax: 20,
  sttEnabled: false,
  sttEngine: 'auto',
  sttModel: '',
  sttCommand: '',
  sttArgs: [],
  sttLanguage: 'auto',
  sttMaxSeconds: 60,
  sttTimeoutMs: 60000,
  inboundImageMaxPx: 2048,
  outboundImageMaxBytes: 8388608,
  maxVoiceBytes: 15728640,
  maxFileBytes: 20971520,
  inboundFileMaxBytes: 20971520,
  mediaDir: '',
  tempTtlHours: 6,
  allowPrivateHosts: false,
  logLevel: 'info',
  actionAuditEnabled: true,
  traceEnabled: false,
  traceLevel: 'debug',
  dedupWindowSeconds: 300,
  ignoreSelf: true,
  sensitivePatterns: [],
}

/** 分组 → 键数组（与 host SETTINGS_GROUPS 同构；供契约核对与快照渲染兜底）。 */
export const GROUP_KEYS: Record<string, string[]> = {}
for (const group of GROUPS) GROUP_KEYS[group.id] = group.fields.map(field => field.key)

/** 卡片上的固定说明（§3.8 / §3.9）：'foot' = 挂在该卡片底部，'card' = 单独一张只读卡片。 */
export interface CardNote {
  /** 卡片名。 */
  section: string
  /** 展示形态。 */
  mode: 'foot' | 'card'
  /** 说明文字（中文常量，与卡片名同一套约定）。 */
  text: string
}

/** 各组卡片上不属于任何配置键的固定说明（F2a 的只读提示）。 */
export const CARD_NOTES: Record<string, CardNote[]> = {
  media: [
    { section: '语音转写', mode: 'foot', text: '纠错表（sttReplacements）请在 cordis.patch.yml 里编辑' },
  ],
  proactive: [
    { section: '定时任务', mode: 'card', text: '定时任务请在 cordis.patch.yml 的 scheduledPrompts 里编辑（F3 起这里显示只读列表）。' },
  ],
}