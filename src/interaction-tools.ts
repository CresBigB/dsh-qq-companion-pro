/**
 * 轻互动工具（T14）：表情回应 / 戳一戳 / 点赞。
 *
 * 三个工具的共同点：都在**当前这个 QQ 聊天里**做一件很小的事，参数里没有任何
 * 「聊天 id」——目标只能是对面那个人（私聊）或本群的人（群聊），从结构上就做不到
 * 跨聊天操作。
 *
 * 门禁分两组，与 T13 的群管理工具同一套思路（能力层 + 回合层），但闸数不同：
 *
 * 1. **表情回应**（`qq_emoji_react`）：只是贴个表情、不改消息、不发言，所以
 *    `qq.interact.react` 三个默认位都是 true（`src/capabilities.ts`），门禁只有
 *    **会话绑定** + **消息归属**两道：必须来自 QQ 会话，且 `message_id` 必须是这个
 *    聊天里真的出现过的消息（{@link InteractionToolHost.hasSeenMessage}）——否则
 *    就是跨聊天操作，一个请求都不发。审计照写（三个工具都审计）。
 * 2. **戳一戳 / 点赞**（`qq_poke` / `qq_send_like`）：会真的动到别人的账号（戳一下
 *    会弹提示，点赞会改对方资料卡上的赞数），所以多一道**回合层**门禁：
 *    {@link InteractionToolHost.canEditFiles}（本回合发起者是主人，回合开始时冻结、
 *    fail-closed 为 member）。不是主人回合 → 当场返回结构化错误，**一个 OneBot
 *    请求都不发**（连参数都不再看）。它们的三个默认位全是 false（连主人私聊也关）：
 *    要给群里开必须显式 `memberGrant`，要给主人私聊开必须显式 `ownerGrant`。
 *
 * 审计：每次调用都写一行到 `mediaDir/qq-actions.log`（`bridge.auditAction` →
 * `OutboundPipeline.auditWrite`，jsonl：ts / chatId / action / ok / reason），
 * 成功、失败、被门禁拒掉、参数不合法全算。
 *
 * 参数校验的取舍与 T13 一致：**宁可少做不可错伤**，校验不过就拒绝、绝不猜一个值
 * （点赞次数超上限不夹到 10，那会变成"她要 99 个赞，结果只点了 10 个"却不告诉她）。
 *
 * 真机验证限制（离线确认不了的，一并记在这里而不是悄悄假设）：
 * - `set_msg_emoji_like` 的 `set` 参数（true = 贴、false = 取消）在离线文档里没有
 *   写清，本实现**不带** `set`，只发 `{message_id, emoji_id}`——按"贴一个回应"理解。
 *   取消回应、以及 `emoji_id` 到底接受「表情序号」还是「unicode 码点」，都需要真机
 *   各试一次才能写死；
 * - `group_poke` 要求目标必须是本群成员，这一点由服务端判（我们拿不到成员列表，
 *   拿到了也不该在这条路径上查）；私聊 `friend_poke` 的目标我们**自己**钉死为对面
 *   那个人，不依赖服务端。
 * @module dsh-qq-companion/interaction-tools
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

import { sanitizeMessageId, splitChatId } from './chat.js'
import { describeError } from './errors.js'
import { toQQ } from './tools.js'

/** 一次点赞的最多次数（QQ 侧一次最多 10 个；分多次点没有意义，会被服务端节流）。 */
export const MAX_LIKE_TIMES = 10

/** 省略 `times` 时的默认值：点满。 */
export const DEFAULT_LIKE_TIMES = 10

/** 互动工具从 bridge 需要的四件事（bridge 自己就满足，与 T13 的 host 同形）。 */
export interface InteractionToolHost {
  /** 一个 agent 会话对应的 chat id（没有映射 = 这个会话不来自 QQ）。 */
  chatForSession(sessionId: string): string | undefined
  /** 本回合发起者是不是主人（回合开始时冻结，fail-closed 为 member）。 */
  canEditFiles(sessionId: string): boolean
  /** 这个聊天里是否真的见过这条消息（入站消息或她自己发出的；消息归属门禁用）。 */
  hasSeenMessage(chatId: string, messageId: string): boolean
  /** 写操作审计一行（与工具发送审计同一套写入）。 */
  auditAction(chatId: string, action: string, ok: boolean, reason: string): void
}

/** 互动工具需要的 OneBot 传输（`connection.call` 就够了）。 */
export interface InteractionToolTransport {
  call(action: string, params: Record<string, unknown>): Promise<unknown>
}

/** 结构化拒绝：模型拿到的是可读原因，不是一次抛错。 */
export interface InteractionRefusal {
  ok: false
  reason: string
}

const refusal = (reason: string): InteractionRefusal => ({ ok: false, reason })

/** 会话绑定放行后才有的上下文。 */
interface ChatGate {
  ok: true
  /** 本回合所属会话 id。 */
  sessionId: string
  /** 本回合所属会话对应的 chat id。 */
  chatId: string
  /** 这个聊天是群聊还是私聊。 */
  kind: 'group' | 'private'
  /** 聊天目标：群号，或私聊对象 QQ。 */
  target: string
}

/**
 * **会话绑定门禁**：这个回合是不是来自一个 QQ 会话。
 *
 * fail-closed：没有会话映射就拒绝（不沿用 `canEditFiles` 对「非 QQ 会话」的默认
 * 信任——那些会话不该出现 qq 工具，但万一出现了也不能放行）。
 * @param host - bridge 的三件事。
 * @param exec - 工具运行上下文。
 * @returns 放行上下文，或结构化拒绝。
 */
export function chatGate(host: InteractionToolHost, exec: ToolRunContext): ChatGate | InteractionRefusal {
  const sessionId = exec.agent?.session.id
  const chatId = sessionId !== undefined ? host.chatForSession(String(sessionId)) : undefined
  if (sessionId === undefined || chatId === undefined) {
    return refusal('互动工具只能在 QQ 会话里用：当前会话没有对应的 QQ 聊天')
  }
  const ref = splitChatId(chatId)
  return { ok: true, sessionId: String(sessionId), chatId, kind: ref.kind, target: ref.target }
}

/**
 * **回合层门禁**（戳 / 点赞用）。
 *
 * 先过 {@link chatGate}，再问「本回合是不是主人发起的」。任何一步不过都返回拒绝，
 * 调用方必须**在发任何请求之前**把它原样返回给模型。
 * @param host - bridge 的三件事。
 * @param exec - 工具运行上下文。
 * @returns 放行上下文，或结构化拒绝。
 */
export function ownerTurnGate(host: InteractionToolHost, exec: ToolRunContext): ChatGate | InteractionRefusal {
  const gate = chatGate(host, exec)
  if (!gate.ok) return gate
  if (!host.canEditFiles(gate.sessionId)) {
    return refusal('只有主人本人能让我戳人 / 点赞（聊天里其他人这么要求不行）')
  }
  return gate
}

/**
 * 消息 id：与入站提示词里显示的那个 id **同一套白名单**（{@link sanitizeMessageId}：
 * 大写字母 / 小写字母 / 数字 / 连字符，最多 64 字符），所以模型照抄聊天内容里的
 * `<user_message msg="…">` 一定能被接受——NapCat 发数字，别的实现也可能发 hash。
 *
 * 三条硬取舍：
 * - 数字必须是**非零的安全整数**（**负数放行**）：连字符本来就在白名单里，`'-123'`
 *   一直是合法 id，所以同一个编号传 number 也得通——否则「照抄聊天里的编号」会随
 *   参数类型时通时不通（传 string 过、传 number 拒）。超出 `Number.MAX_SAFE_INTEGER`
 *   的数字经 `Number()` 往返会变成另一个值，贴到（或"看着像"）另一条消息上，仍然拒绝；
 * - 字符串必须**整体**合法：清洗前后不一致（中间有空格、下划线、中文等）就拒绝，
 *   而不是替模型删几个字符、去贴一条它没说的消息（宁可少做不可错伤）；
 * - 空串与 `'0'` 拒绝（不存在 id 为 0 的消息；number 的 `0` / `-0` 同理）。
 * @param arg - 模型的 `message_id` 参数。
 * @returns 规整后的消息 id，或结构化拒绝。
 */
export function parseMessageId(arg: unknown): { ok: true; messageId: string } | InteractionRefusal {
  const raw = typeof arg === 'number'
    ? (Number.isSafeInteger(arg) && arg !== 0 ? String(arg) : '')
    : typeof arg === 'string' ? arg.trim() : ''
  if (raw === '' || raw === '0') {
    return refusal('message_id 要填这条消息的 id：就是聊天里那条消息自己的编号（<user_message msg="…"> 里那个）')
  }
  const messageId = sanitizeMessageId(raw)
  if (messageId === '') {
    return refusal('message_id 里没有任何可用的字符：照抄聊天里那条消息的编号（数字 / 字母 / 连字符）')
  }
  if (messageId !== raw) {
    return refusal('message_id 里只能有数字、字母和连字符（照抄聊天里那条消息的编号，不要加空格或别的符号）')
  }
  return { ok: true, messageId }
}

/**
 * 十进制整数写法：`messageIdParam` 唯一允许转 number 的形态。
 *
 * **不是** `\d` 宽松判断就够了：`Number()` 认的远不止十进制整数——`'0x10'` → 16、
 * `'1e5'` → 100000、`'  12 '` → 12，而这些字符串全都在 {@link sanitizeMessageId}
 * 的白名单里（十六进制字母、`e`、连字符都合法），所以字母 hash 的 id 会被悄悄换成
 * 另一个数字 id。消息归属门禁比的是**字符串**（{@link parseMessageId} 规整后的 id 与
 * 已见消息表逐字比），编号对得上 ≠ 转出来的数字也对得上：`'0x10'` 见过不等于 16
 * 这条消息见过，发出去就贴到了另一条消息上。所以只有逐字十进制整数才转 number。
 */
const DECIMAL_MESSAGE_ID = /^-?\d+$/

/**
 * 发请求时 `message_id` 带什么类型：OneBot 11 的 message_id 是整数，所以**逐字十进制
 * 整数**且在安全整数范围内就转成 number（与改造前的请求体逐字一致）；其余（字母 hash、
 * 十六进制 / 科学计数这类 `Number()` 也认的写法、或超出安全范围的超长编号）原样发
 * 字符串——转成 Number 会悄悄变成另一个值，等于替模型贴到另一条消息上（见
 * {@link DECIMAL_MESSAGE_ID}）。
 * 负数同样转 number：`'-123'` 与 `-123` 在上游是同一个编号，只差一对引号，
 * 不能因为模型传的是字符串就把请求体的类型换掉（{@link parseMessageId} 已放行负数）。
 * @param messageId - {@link parseMessageId} 规整后的 id。
 * @returns 请求参数里的 message_id。
 */
export function messageIdParam(messageId: string): number | string {
  if (!DECIMAL_MESSAGE_ID.test(messageId)) return messageId
  const numeric = Number(messageId)
  return Number.isSafeInteger(numeric) && numeric !== 0 ? numeric : messageId
}

/**
 * 表情 id：全数字字符串（表情序号如 76，或 unicode 码点如 128077）。
 *
 * 我们**不**校验它是不是一个真实存在的表情：那张表在 QQ 服务端，离线拿不到，
 * 编一张不完整的表只会拒掉合法输入。所以只挡明显不是 id 的东西，真伪交给服务端。
 * @param arg - 模型的 `emoji_id` 参数。
 * @returns 规整后的十进制字符串，或结构化拒绝。
 */
export function parseEmojiId(arg: unknown): { ok: true; emojiId: string } | InteractionRefusal {
  const text = typeof arg === 'number' && Number.isSafeInteger(arg) && arg > 0 ? String(arg) : typeof arg === 'string' ? arg.trim() : ''
  if (!/^\d{1,7}$/.test(text)) {
    return refusal('emoji_id 要填数字表情 id（例如 76 是「赞」，128077 是 👍）')
  }
  return { ok: true, emojiId: text }
}

/**
 * 点赞次数：1 到 {@link MAX_LIKE_TIMES} 的整数；省略 = {@link DEFAULT_LIKE_TIMES}。
 * 越界一律拒绝（不夹逼）。
 * @param arg - 模型的 `times` 参数。
 * @returns 规整后的次数，或结构化拒绝。
 */
export function parseLikeTimes(arg: unknown): { ok: true; times: number } | InteractionRefusal {
  if (arg === undefined || arg === null || (typeof arg === 'string' && arg.trim() === '')) {
    return { ok: true, times: DEFAULT_LIKE_TIMES }
  }
  const value = typeof arg === 'number' ? arg : typeof arg === 'string' ? Number(arg.trim()) : Number.NaN
  if (!Number.isFinite(value)) return refusal('times 要填点赞次数（1-' + MAX_LIKE_TIMES + ' 的整数）')
  if (!Number.isInteger(value) || value < 1 || value > MAX_LIKE_TIMES) {
    return refusal('times 只能是 1-' + MAX_LIKE_TIMES + ' 的整数')
  }
  return { ok: true, times: value }
}

/**
 * 戳的对象：私聊里必须是对面那个人（省略 = 对面），群里必须显式填一个群成员。
 *
 * 「私聊里不能戳别人」是在这里**自己钉死**的：私聊的 chat 目标就是对面，戳第三个
 * 人等于跨聊天操作，直接拒绝而不是交给服务端。
 * @param gate - 门禁放行后的上下文。
 * @param arg - 模型的 `user_id` 参数。
 * @returns 目标 QQ，或结构化拒绝。
 */
export function pokeTarget(gate: ChatGate, arg: unknown): { ok: true; userId: string } | InteractionRefusal {
  const blank = arg === undefined || arg === null || (typeof arg === 'string' && arg.trim() === '')
  if (gate.kind === 'private') {
    if (blank) return { ok: true, userId: gate.target }
    const userId = toQQ(arg)
    if (userId === '') return refusal('user_id 要填数字 QQ 号（私聊里省略 = 对面那个人）')
    if (userId !== gate.target) return refusal('这是私聊：只能戳正在和你说话的那个人，不能戳别人')
    return { ok: true, userId }
  }
  if (blank) return refusal('群里戳人要传 user_id（要戳这个群里的谁）')
  const userId = toQQ(arg)
  if (userId === '') return refusal('user_id 要填数字 QQ 号（这个群里要戳的那个人）')
  return { ok: true, userId }
}

const json = (render: (value: unknown) => string) => ({
  schema: { type: 'json' as const },
  render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: render(value) }],
})

const doneText = (value: unknown): string => {
  const v = value as { ok?: boolean; reason?: string }
  return v.ok === true ? '已执行' : '没做：' + String(v.reason ?? '')
}

/**
 * 注册三个轻互动工具。
 *
 * 注册是 effect-based（返回的 disposer 反注册）；`allow` 是能力层门禁——关掉的
 * 能力连工具都不注册。`allow` 用的是会话级注册集，它只回答"这个会话有没有入口"，
 * "这一次能不能真的做"由每个执行体里的 {@link ownerTurnGate} 回答。
 * @param ctx - 插件/agent 上下文。
 * @param host - bridge 的四件事（会话映射、回合角色、消息归属、审计）。
 * @param transport - OneBot 传输。
 * @param allow - 可选的能力层门禁（返回 false 的工具不注册）。
 * @returns the disposer。
 */
export function registerInteractionTools(
  ctx: Context,
  host: InteractionToolHost,
  transport: InteractionToolTransport,
  allow?: (toolName: string) => boolean,
): () => void {
  const disposers: Array<() => void> = []
  const register = (tool: Parameters<typeof ctx.tools.register>[0]): void => {
    if (allow !== undefined) {
      const name = (tool as { name?: unknown }).name
      if (typeof name !== 'string' || !allow(name)) return
    }
    disposers.push(ctx.tools.register(tool))
  }

  /** 被拒的调用也留痕（审计"无论成败"，包括门禁与参数校验）。 */
  const reject = (chatId: string, toolName: string, detail: string, reason: string): InteractionRefusal => {
    host.auditAction(chatId, toolName, false, detail + '；拒绝：' + reason)
    return refusal(reason)
  }

  /** 调一个 action 并按结果写审计（成功 / 失败都记）。 */
  const perform = async (
    chatId: string,
    toolName: string,
    action: string,
    params: Record<string, unknown>,
    detail: string,
  ): Promise<{ ok: true } | InteractionRefusal> => {
    try {
      await transport.call(action, params)
    } catch (error) {
      const message = describeError(error)
      host.auditAction(chatId, toolName, false, detail + '；失败：' + message)
      return refusal('没做成：' + message)
    }
    host.auditAction(chatId, toolName, true, detail + '；成功')
    return { ok: true }
  }

  register(defineTool({
    name: 'qq_emoji_react',
    description: '给这个聊天里的一条消息贴一个 QQ 表情回应。只是贴个表情：不改消息、不发言，也不会有提示音。message_id 用那条消息自己的编号（聊天内容里能看到的那个），emoji_id 填数字表情 id。只能给当前这个聊天里出现过的一条消息贴，别的聊天、你编的编号都会被拒绝。',
    parameters: {
      message_id: { oneOf: [{ type: 'string' }, { type: 'number' }], required: true, description: '要贴表情的那条消息的 id（照抄聊天里那条消息的编号）' },
      emoji_id: { oneOf: [{ type: 'string' }, { type: 'number' }], required: true, description: 'QQ 表情 id，填数字：76 是「赞」，128077 是 👍 这类码点也可以' },
    },
    output: json(doneText),
    execute: async (args, exec) => {
      const a = args as { message_id?: unknown; emoji_id?: unknown }
      const TOOL = 'qq_emoji_react'
      // ① 会话绑定：不是 QQ 会话就到此为止（一个请求都不发）。
      const gate = chatGate(host, exec)
      if (!gate.ok) return reject('unknown', TOOL, '未执行（会话未绑定）', gate.reason) as unknown as JsonValue
      // ② 参数。
      const message = parseMessageId(a.message_id)
      if (!message.ok) return reject(gate.chatId, TOOL, '未执行（message_id 不合法）', message.reason) as unknown as JsonValue
      const emoji = parseEmojiId(a.emoji_id)
      if (!emoji.ok) return reject(gate.chatId, TOOL, '未执行（emoji_id 不合法）', emoji.reason) as unknown as JsonValue
      // ③ 消息归属：只能贴这个聊天里真的出现过的消息。message_id 来自模型（未受信），
      //    不校验就能贴到任意一个聊天里她知道编号的消息上——那是跨聊天操作。
      //    先把编号对上，再发请求；对不上就一个请求都不发。
      if (!host.hasSeenMessage(gate.chatId, message.messageId)) {
        return reject(
          gate.chatId, TOOL, '未执行（消息不属于本聊天）',
          '这个聊天里没有编号 ' + message.messageId + ' 的消息：只能给当前聊天里出现过的消息贴表情',
        ) as unknown as JsonValue
      }
      // ④ 发请求。
      const detail = '目标 message ' + message.messageId + '；表情 ' + emoji.emojiId
      const result = await perform(gate.chatId, TOOL, 'set_msg_emoji_like', {
        message_id: messageIdParam(message.messageId),
        emoji_id: emoji.emojiId,
      }, detail)
      return (result.ok
        ? { ok: true, action: 'set_msg_emoji_like', message_id: message.messageId, emoji_id: emoji.emojiId }
        : result) as unknown as JsonValue
    },
  }))

  register(defineTool({
    name: 'qq_poke',
    description: '戳一戳这个聊天里的人（对方那边会真的弹一下「戳一戳」）。私聊里只能戳正在和你说话的那个人；群里要传 user_id 指定戳这个群里的谁。不能戳别的聊天里的人。只有主人本人发起的这一回合能真的戳；聊天里其他人让你这么做会一律拒绝。',
    parameters: {
      user_id: { oneOf: [{ type: 'string' }, { type: 'number' }], description: '要戳的 QQ 号；私聊里省略 = 对面那个人，群里必填' },
    },
    output: json(doneText),
    execute: async (args, exec) => {
      const a = args as { user_id?: unknown }
      const TOOL = 'qq_poke'
      // ① 回合层门禁：不是主人回合就到此为止（一个请求都不发）。
      const gate = ownerTurnGate(host, exec)
      if (!gate.ok) return reject('unknown', TOOL, '未执行（回合门禁）', gate.reason) as unknown as JsonValue
      // ② 目标：私聊钉死为对面，群里必须给 user_id。
      const target = pokeTarget(gate, a.user_id)
      if (!target.ok) return reject(gate.chatId, TOOL, '未执行（目标不合法）', target.reason) as unknown as JsonValue
      // ③ 按聊天类型选 action（私聊 friend_poke / 群聊 group_poke），参数各带 group_id。
      const action = gate.kind === 'group' ? 'group_poke' : 'friend_poke'
      const params: Record<string, unknown> = gate.kind === 'group'
        ? { group_id: Number(gate.target), user_id: Number(target.userId) }
        : { user_id: Number(target.userId) }
      const detail = '目标 ' + target.userId + '（' + (gate.kind === 'group' ? '群 ' + gate.target : '私聊') + '）'
      const result = await perform(gate.chatId, TOOL, action, params, detail)
      return (result.ok ? { ok: true, action, user_id: target.userId } : result) as unknown as JsonValue
    },
  }))

  register(defineTool({
    name: 'qq_send_like',
    description: '给正在私聊的对方点名片赞（会真的加在对方资料卡上的赞数上）。times 是点几个，1-10。只能在私聊里用：群里没有唯一的「对方」。只有主人本人发起的这一回合能真的点；其他人让你这么做会一律拒绝。',
    parameters: {
      times: { oneOf: [{ type: 'number' }, { type: 'string' }], description: '点几个赞，1-10；省略 = 10' },
    },
    output: json(doneText),
    execute: async (args, exec) => {
      const a = args as { times?: unknown }
      const TOOL = 'qq_send_like'
      // ① 回合层门禁。
      const gate = ownerTurnGate(host, exec)
      if (!gate.ok) return reject('unknown', TOOL, '未执行（回合门禁）', gate.reason) as unknown as JsonValue
      // ② 只能在私聊里点：群聊的 chat 目标是一个群，不是一个人。
      if (gate.kind !== 'private') {
        return reject(gate.chatId, TOOL, '未执行（群聊不可点赞）', '点赞只能在私聊里点：这是在群里，没有唯一的「对方」') as unknown as JsonValue
      }
      // ③ 次数。
      const like = parseLikeTimes(a.times)
      if (!like.ok) return reject(gate.chatId, TOOL, '未执行（次数不合法）', like.reason) as unknown as JsonValue
      // ④ 发请求：目标固定为对面那个人。
      const detail = '目标 ' + gate.target + '；' + like.times + ' 个赞'
      const result = await perform(gate.chatId, TOOL, 'send_like', {
        user_id: Number(gate.target),
        times: like.times,
      }, detail)
      return (result.ok ? { ok: true, action: 'send_like', user_id: gate.target, times: like.times } : result) as unknown as JsonValue
    },
  }))

  return () => {
    for (const dispose of disposers.reverse()) dispose()
  }
}