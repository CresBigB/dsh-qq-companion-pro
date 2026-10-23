/**
 * 设置页字段定义：表 + 诊断组 + workspacePath + newMessagePolicy +
 * autoSteerPolicy 的分组/键集/类型/默认值。
 *
 * 与 src/settings-remote.ts 的 SETTINGS_GROUPS / SCHEMA_DEFAULTS / 类型分组
 * 逐字对齐（tests/client-settings.spec.ts 断言一致性）。数值键
 * dedupWindowSeconds / actionRatePerMinute / actionRatePerDay /
 * injectIntervalMs 与枚举键 traceLevel 本期不上面板（host 白名单同样不含），
 * 仍走 patch config 手改。
 */

/** 字段类型：enum（下拉）/ number / boolean / string / stringArray（多行文本）/ secret（密码型）。 */
export type FieldType = 'enum' | 'number' | 'boolean' | 'string' | 'stringArray' | 'secret'

/** 一个字段的呈现定义（键序即面板行序）。 */
export interface OnebotField {
  /** 配置键（= patch config 的键名）。 */
  key: string
  /** 中文标签。 */
  label: string
  /** 控件类型。 */
  type: FieldType
  /** enum 的取值列表。 */
  options?: string[]
  /** enum 的取值 → 中文标签。 */
  optionLabels?: Record<string, string>
  /** 行尾提示（一句话说明 + 配置键名）。 */
  hint?: string
}

/** 一个分组：标题 + 字段列表。 */
export interface OnebotGroup {
  /** 分组 id（= host SETTINGS_GROUPS 的键）。 */
  id: string
  /** 分组标题（中文常量，不走词条）。 */
  title: string
  /** 组内字段（键序即渲染顺序）。 */
  fields: OnebotField[]
}

/** 四组 29 键字段定义（顺序 = 面板分组顺序）。 */
export const GROUPS: OnebotGroup[] = [
  {
    id: 'connection',
    title: '连接',
    fields: [
      { key: 'host', label: '监听地址', type: 'string', hint: 'NapCat 反向 WebSocket 连接的地址，一般保持 127.0.0.1。' },
      { key: 'port', label: '监听端口', type: 'number', hint: 'NapCat 反向 WebSocket 连接的端口。' },
      { key: 'accessToken', label: '访问令牌（AccessToken）', type: 'secret', hint: '与 NapCat 侧一致的鉴权令牌；留空 = 不修改，勾选清除后保存 = 清空。' },
      { key: 'botQQ', label: '机器人 QQ 号', type: 'string' },
      // workspacePath 入面板（connection 组键序追加）。语义（对齐 README「会话工作区选择」）：
      // 修改只对新会话生效；已设 per-chat /workspace 覆盖的会话不受影响。
      { key: 'workspacePath', label: '会话默认工作区路径', type: 'string', hint: 'QQ 会话的工作区目录；保存后仅对新会话生效，已用 /workspace 设置 per-chat 覆盖的会话不受影响。留空 = 宿主进程工作目录。管理员私聊优先用 adminWorkspacePath，开了群记忆（groupMemoryDir）的群聊用 <群记忆目录>/<群号>，这两类会话不受本项影响。（配置键 workspacePath）' },
      // 会话归入 DSH 工作区的方式（网页会话列表按工作区分组）；已有会话可发 /workspace attach 立即补挂。
      { key: 'attachWorkspaceMode', label: '会话归入工作区', type: 'enum', options: ['existing', 'auto', 'off'], optionLabels: { existing: '只归入已有的', auto: '自动为每个聊天建', off: '不归入' }, hint: 'QQ 会话怎么归入 DSH 工作区（网页会话列表按工作区分组）：只归入已有的 = 已有工作区的目录就归入（另外为 workspacePath 自动建一个）；自动为每个聊天建 = 群聊、私聊各自的工作目录也自动建工作区（每个群一个）；不归入 = 不碰工作区。已有会话在 QQ 里发 /workspace attach 可立即补挂。（配置键 attachWorkspaceMode）' },
    ],
  },
  {
    id: 'permissions',
    title: '权限',
    fields: [
      { key: 'requireMention', label: '群聊必须 @ 机器人', type: 'boolean' },
      { key: 'adminUsers', label: '管理员用户列表', type: 'stringArray', hint: '每行一个 QQ 号。' },
      { key: 'dmPolicy', label: '私聊策略', type: 'enum', options: ['open', 'allowlist', 'disabled'], optionLabels: { open: '开放', allowlist: '白名单', disabled: '禁用' } },
      { key: 'groupPolicy', label: '群聊策略', type: 'enum', options: ['open', 'allowlist', 'disabled'], optionLabels: { open: '开放', allowlist: '白名单', disabled: '禁用' } },
      { key: 'allowAllUsers', label: '允许所有用户', type: 'boolean', hint: '关闭时仅管理员可触发。' },
      { key: 'allowFrom', label: '私聊白名单', type: 'stringArray', hint: '每行一个 QQ 号，仅白名单策略生效。' },
      { key: 'groupAllowFrom', label: '群聊白名单', type: 'stringArray', hint: '每行一个群号，仅白名单策略生效。' },
    ],
  },
  {
    id: 'behavior',
    title: '行为',
    fields: [
      { key: 'interimMessages', label: '中间消息', type: 'boolean', hint: '回合进行中发送流式中间消息。' },
      { key: 'interimRecall', label: '自动撤回中间消息', type: 'boolean' },
      { key: 'interimRecallMs', label: '中间消息保留时长（毫秒）', type: 'number' },
      { key: 'sendErrorNotice', label: '发送错误通知', type: 'boolean' },
      { key: 'unknownCommand', label: '未知命令处理', type: 'enum', options: ['intercept', 'passthrough'], optionLabels: { intercept: '拦截', passthrough: '透传' } },
      { key: 'rateLimitPerMinute', label: '每分钟消息频率上限', type: 'number' },
      { key: 'newMessagePolicy', label: '任务运行中的新消息', type: 'enum', options: ['queue', 'steer'], optionLabels: { queue: '排队', steer: '插话' }, hint: '任务运行中收到新普通消息：排队=当前任务结束后按序处理（每回合至多提示一次）；插话=作为补充指令加入当前任务。图片/文件/语音/引用消息与受限用户始终按排队处理。（配置键 newMessagePolicy）' },
      { key: 'autoSteerPolicy', label: '自动插话资格', type: 'enum', options: ['admin', 'all'], optionLabels: { admin: '仅管理员', all: '所有成员' }, hint: '插话模式下运行中收到的新普通纯文字消息谁可自动插话：仅管理员（默认）或所有成员。不具备资格的消息按排队处理；/steer 命令始终仅管理员；受限用户任何档都不自动插话。（配置键 autoSteerPolicy）' },
      { key: 'deferredTimeoutMs', label: '等待模型回复超时（毫秒）', type: 'number', hint: '回合超过该时长无任何模型输出时提示超时并登记补发跟踪，任务完成后自动补发最终文字（超时补发）；发送失败最多重试 3 次，结果不确定时停止自动重试；/stop 终止该聊天的补发跟踪。0=关闭。（配置键 deferredTimeoutMs）' },
      { key: 'groupAutoQuote', label: '群聊自动引用', type: 'enum', options: ['off', 'busy', 'always'], optionLabels: { off: '关闭', busy: '有人插话时', always: '总是' }, hint: '群里回复时是否自动引用叫她的那条消息：关闭 = 不自动（她仍可以自己决定引用）；有人插话时 = 从叫她那句到她回复之间群里又有人说话才引用；总是 = 每次都引用。她自己在回复开头写 [引用:消息 id] 时以她为准；私聊不自动引用。（配置键 groupAutoQuote）' },
    ],
  },
  {
    id: 'diagnostics',
    title: '诊断',
    fields: [
      { key: 'actionAuditEnabled', label: '工具发送审计', type: 'boolean', hint: '她用工具主动发出的图片、语音、文件、合并转发，每条都记一行到 qq-actions.log；关闭后不再留这份记录，发送本身不受影响。（配置键 actionAuditEnabled）' },
      { key: 'traceEnabled', label: '决策追踪（trace）', type: 'boolean', hint: '把每个入站/出站决策事件写入 qq-trace.jsonl 便于排查；关闭后零文件、行为与关闭时完全一致。（配置键 traceEnabled）' },
    ],
  },
  {
    id: 'companion',
    title: '陪伴',
    fields: [
      { key: 'ownerTitle', label: '对主人的称呼', type: 'string', hint: '系统提示和通知里怎么称呼管理员，例如“主人”。（配置键 ownerTitle）' },
      { key: 'agentPreset', label: 'QQ 会话默认预设', type: 'string', hint: '群聊和其他人用的 dsh 预设 id；留空 = 宿主默认预设。（配置键 agentPreset）' },
      { key: 'adminPreset', label: '管理员私聊预设', type: 'string', hint: '管理员私聊的新会话用这个预设；留空 = 同上。（配置键 adminPreset）' },
      { key: 'adminPermission', label: '管理员私聊权限预设', type: 'string', hint: '管理员私聊每个新会话自动切到的宿主权限预设，例如 danger-full-access；留空 = 不切。（配置键 adminPermission）' },
      { key: 'adminWorkspacePath', label: '管理员私聊工作目录', type: 'string', hint: '管理员私聊的会话工作目录（私密记忆所在目录）；留空 = 会话默认工作区。设置后覆盖 workspacePath：管理员私聊会话用这个目录，不受「会话默认工作区路径」影响。（配置键 adminWorkspacePath）' },
      { key: 'splitLines', label: '一句一条', type: 'boolean', hint: '最终回复按行拆成多条 QQ 消息发送。（配置键 splitLines）' },
      { key: 'splitMaxMessages', label: '最多拆成几条', type: 'number', hint: '超过就整段发。（配置键 splitMaxMessages）' },
      { key: 'textImageThreshold', label: '长回复转图片的字数', type: 'number', hint: '超过这个字数渲染成图片卡片；0 = 永远发文字。（配置键 textImageThreshold）' },
      { key: 'inboundImageMaxPx', label: '收到的图片压到多大（像素）', type: 'number', hint: '长边超过就缩小再给模型看，省 token。（配置键 inboundImageMaxPx）' },
      { key: 'autoAcceptAdminRequests', label: '自动同意管理员的好友/拉群请求', type: 'boolean', hint: '别人的请求不同意，会私聊告诉管理员。（配置键 autoAcceptAdminRequests）' },
      { key: 'autoAllowInvitedGroups', label: '管理员拉进的群自动加白名单', type: 'boolean', hint: '（配置键 autoAllowInvitedGroups）' },
      { key: 'groupSplitLines', label: '群里也一句一条', type: 'boolean', hint: '关掉后群里每次回复只发一条，发送量少很多，降低 QQ 风控概率。（配置键 groupSplitLines）' },
      { key: 'humanTypingPace', label: '所有消息按真人打字速度发', type: 'boolean', hint: '每条消息发出前按字数等“打字”时间，整个小号同一时间只打一条，几个会话同时回复时自然排队。（配置键 humanTypingPace）' },
      { key: 'typingDelayPerCharMs', label: '每个字的打字时间（毫秒）', type: 'number', hint: '（配置键 typingDelayPerCharMs）' },
      { key: 'typingDelayMinMs', label: '一条消息最短打字时间（毫秒）', type: 'number', hint: '（配置键 typingDelayMinMs）' },
      { key: 'typingDelayMaxMs', label: '一条消息最长打字时间（毫秒）', type: 'number', hint: '太长的消息也不会等超过这个时间。（配置键 typingDelayMaxMs）' },
    ],
  },
  {
    id: 'stickers',
    title: '表情包',
    fields: [
      { key: 'stickerDir', label: '表情包库目录', type: 'string', hint: '留空 = 关闭表情包（她没有存、找、发表情包的工具）；填一个目录即开启，图片和 index.json 都放在这里，例如 E:\\To DeepSeek\\companion\\stickers。（配置键 stickerDir）' },
      { key: 'stickerMaxCount', label: '最多存多少张', type: 'number', hint: '库满了要先删几张不常用的，才能再存新的。（配置键 stickerMaxCount）' },
      { key: 'stickerMaxBytes', label: '单张最大（字节）', type: 'number', hint: '默认 4MB（4194304）。QQ 动图常超过 1MB，所以别卡得太紧；超过这张的上限她会存不进来。（配置键 stickerMaxBytes）' },
      { key: 'stickerDailyMax', label: '每天最多新存几张', type: 'number', hint: '控制她看图打标签的花费；同一张图合并到已有表情包不算。（配置键 stickerDailyMax）' },
    ],
  },
  {
    id: 'memory',
    title: '记忆与会话',
    fields: [
      { key: 'idleResetHours', label: '空闲多久换新会话（小时）', type: 'number', hint: '超过这么久没说话，下一条消息开新会话并附最近几句交接；0 = 关。（配置键 idleResetHours）' },
      { key: 'privateResetDays', label: '私聊几天换一次会话', type: 'number', hint: '按凌晨 4 点算天；0 = 关。（配置键 privateResetDays）' },
      { key: 'groupResetDays', label: '群聊几天换一次会话', type: 'number', hint: '按凌晨 4 点算天；0 = 关。（配置键 groupResetDays）' },
      { key: 'publicMemoryFile', label: '公开记忆文件', type: 'string', hint: '所有会话都读的记忆文件路径（AGENTS.md）。（配置键 publicMemoryFile）' },
      { key: 'publicMemoryMaxBytes', label: '公开记忆上限（字节）', type: 'number', hint: '满了群里就不再追加。（配置键 publicMemoryMaxBytes）' },
      { key: 'groupMemoryDir', label: '每群一份记忆的目录', type: 'string', hint: '<目录>/<群号>/AGENTS.md，群会话以此为工作目录；留空 = 所有群共用公开记忆。设置后覆盖 workspacePath：群会话用 <目录>/<群号>，不受「会话默认工作区路径」影响。（配置键 groupMemoryDir）' },
      { key: 'groupMemoryMaxBytes', label: '每群记忆上限（字节）', type: 'number', hint: '（配置键 groupMemoryMaxBytes）' },
      { key: 'sessionTitleTemplate', label: '会话标题模板', type: 'string', hint: '新建 QQ 会话（以及恢复时还没有标题的旧会话）的网页标题，可用 {kind} {target} {nickname} {date} {time}；已有标题（比如在网页上手动改过）的不会被覆盖，留空 = 不自动命名。（配置键 sessionTitleTemplate）' },
    ],
  },
  {
    id: 'proactive',
    title: '主动聊天',
    fields: [
      { key: 'proactiveEnabled', label: '开启主动聊天', type: 'boolean', hint: '每天在时间窗内随机叫醒几次，她自己决定发不发。（配置键 proactiveEnabled）' },
      { key: 'proactiveChatId', label: '主动找谁', type: 'string', hint: '会话 id，例如 private:QQ号。（配置键 proactiveChatId）' },
      { key: 'proactiveWindowStart', label: '时间窗开始', type: 'string', hint: 'HH:MM。（配置键 proactiveWindowStart）' },
      { key: 'proactiveWindowEnd', label: '时间窗结束', type: 'string', hint: 'HH:MM。（配置键 proactiveWindowEnd）' },
      { key: 'proactiveMinPerDay', label: '每天至少几次', type: 'number', hint: '（配置键 proactiveMinPerDay）' },
      { key: 'proactiveMaxPerDay', label: '每天最多几次', type: 'number', hint: '（配置键 proactiveMaxPerDay）' },
      { key: 'proactiveMinGapMinutes', label: '两次之间至少隔几分钟', type: 'number', hint: '（配置键 proactiveMinGapMinutes）' },
      { key: 'proactiveSkipIfActiveMinutes', label: '刚聊过几分钟内跳过', type: 'number', hint: '（配置键 proactiveSkipIfActiveMinutes）' },
      { key: 'proactiveMaxUnanswered', label: '几条没回就当天停止', type: 'number', hint: '（配置键 proactiveMaxUnanswered）' },
    ],
  },
]

/** 全部 29 键扁平表（顺序 = 分组声明顺序，与 host ALL_KEYS 语义一致）。 */
export const ALL_FIELDS: OnebotField[] = []
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
  requireMention: true,
  adminUsers: [],
  dmPolicy: 'open',
  groupPolicy: 'open',
  allowAllUsers: false,
  allowFrom: [],
  groupAllowFrom: [],
  interimMessages: true,
  interimRecall: true,
  interimRecallMs: 90000,
  sendErrorNotice: true,
  unknownCommand: 'intercept',
  rateLimitPerMinute: 30,
  newMessagePolicy: 'queue',
  autoSteerPolicy: 'admin',
  deferredTimeoutMs: 600000,
  actionAuditEnabled: true,
  traceEnabled: false,
  humanTypingPace: false,
  typingDelayPerCharMs: 80,
  typingDelayMinMs: 500,
  typingDelayMaxMs: 2500,
  groupSplitLines: true,
  ownerTitle: '管理员',
  agentPreset: '',
  adminPreset: '',
  adminPermission: '',
  adminWorkspacePath: '',
  splitLines: false,
  splitMaxMessages: 6,
  textImageThreshold: 150,
  inboundImageMaxPx: 2048,
  autoAcceptAdminRequests: false,
  autoAllowInvitedGroups: false,
  idleResetHours: 0,
  privateResetDays: 0,
  groupResetDays: 0,
  publicMemoryFile: '',
  publicMemoryMaxBytes: 6144,
  groupMemoryDir: '',
  groupMemoryMaxBytes: 8192,
  stickerDir: '',
  stickerMaxCount: 300,
  stickerMaxBytes: 4194304,
  stickerDailyMax: 20,
  sessionTitleTemplate: '{kind} {target} · {date}',
  proactiveEnabled: false,
  proactiveChatId: '',
  proactiveWindowStart: '09:00',
  proactiveWindowEnd: '22:00',
  proactiveMinPerDay: 4,
  proactiveMaxPerDay: 6,
  proactiveMinGapMinutes: 90,
  proactiveSkipIfActiveMinutes: 30,
  proactiveMaxUnanswered: 2,
  groupAutoQuote: 'off',
}

/** 分组 → 键数组（与 host SETTINGS_GROUPS 同构；供契约核对与快照渲染兜底）。 */
export const GROUP_KEYS: Record<string, string[]> = {}
for (const group of GROUPS) GROUP_KEYS[group.id] = group.fields.map(field => field.key)