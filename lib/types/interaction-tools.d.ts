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
import type { Context } from '@deepseek-ai/cordis';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
/** 一次点赞的最多次数（QQ 侧一次最多 10 个；分多次点没有意义，会被服务端节流）。 */
export declare const MAX_LIKE_TIMES = 10;
/** 省略 `times` 时的默认值：点满。 */
export declare const DEFAULT_LIKE_TIMES = 10;
/** 互动工具从 bridge 需要的四件事（bridge 自己就满足，与 T13 的 host 同形）。 */
export interface InteractionToolHost {
    /** 一个 agent 会话对应的 chat id（没有映射 = 这个会话不来自 QQ）。 */
    chatForSession(sessionId: string): string | undefined;
    /** 本回合发起者是不是主人（回合开始时冻结，fail-closed 为 member）。 */
    canEditFiles(sessionId: string): boolean;
    /** 这个聊天里是否真的见过这条消息（入站消息或她自己发出的；消息归属门禁用）。 */
    hasSeenMessage(chatId: string, messageId: string): boolean;
    /** 写操作审计一行（与工具发送审计同一套写入）。 */
    auditAction(chatId: string, action: string, ok: boolean, reason: string): void;
}
/** 互动工具需要的 OneBot 传输（`connection.call` 就够了）。 */
export interface InteractionToolTransport {
    call(action: string, params: Record<string, unknown>): Promise<unknown>;
}
/** 结构化拒绝：模型拿到的是可读原因，不是一次抛错。 */
export interface InteractionRefusal {
    ok: false;
    reason: string;
}
/** 会话绑定放行后才有的上下文。 */
interface ChatGate {
    ok: true;
    /** 本回合所属会话 id。 */
    sessionId: string;
    /** 本回合所属会话对应的 chat id。 */
    chatId: string;
    /** 这个聊天是群聊还是私聊。 */
    kind: 'group' | 'private';
    /** 聊天目标：群号，或私聊对象 QQ。 */
    target: string;
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
export declare function chatGate(host: InteractionToolHost, exec: ToolRunContext): ChatGate | InteractionRefusal;
/**
 * **回合层门禁**（戳 / 点赞用）。
 *
 * 先过 {@link chatGate}，再问「本回合是不是主人发起的」。任何一步不过都返回拒绝，
 * 调用方必须**在发任何请求之前**把它原样返回给模型。
 * @param host - bridge 的三件事。
 * @param exec - 工具运行上下文。
 * @returns 放行上下文，或结构化拒绝。
 */
export declare function ownerTurnGate(host: InteractionToolHost, exec: ToolRunContext): ChatGate | InteractionRefusal;
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
export declare function parseMessageId(arg: unknown): {
    ok: true;
    messageId: string;
} | InteractionRefusal;
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
export declare function messageIdParam(messageId: string): number | string;
/**
 * 表情 id：全数字字符串（表情序号如 76，或 unicode 码点如 128077）。
 *
 * 我们**不**校验它是不是一个真实存在的表情：那张表在 QQ 服务端，离线拿不到，
 * 编一张不完整的表只会拒掉合法输入。所以只挡明显不是 id 的东西，真伪交给服务端。
 * @param arg - 模型的 `emoji_id` 参数。
 * @returns 规整后的十进制字符串，或结构化拒绝。
 */
export declare function parseEmojiId(arg: unknown): {
    ok: true;
    emojiId: string;
} | InteractionRefusal;
/**
 * 点赞次数：1 到 {@link MAX_LIKE_TIMES} 的整数；省略 = {@link DEFAULT_LIKE_TIMES}。
 * 越界一律拒绝（不夹逼）。
 * @param arg - 模型的 `times` 参数。
 * @returns 规整后的次数，或结构化拒绝。
 */
export declare function parseLikeTimes(arg: unknown): {
    ok: true;
    times: number;
} | InteractionRefusal;
/**
 * 戳的对象：私聊里必须是对面那个人（省略 = 对面），群里必须显式填一个群成员。
 *
 * 「私聊里不能戳别人」是在这里**自己钉死**的：私聊的 chat 目标就是对面，戳第三个
 * 人等于跨聊天操作，直接拒绝而不是交给服务端。
 * @param gate - 门禁放行后的上下文。
 * @param arg - 模型的 `user_id` 参数。
 * @returns 目标 QQ，或结构化拒绝。
 */
export declare function pokeTarget(gate: ChatGate, arg: unknown): {
    ok: true;
    userId: string;
} | InteractionRefusal;
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
export declare function registerInteractionTools(ctx: Context, host: InteractionToolHost, transport: InteractionToolTransport, allow?: (toolName: string) => boolean): () => void;
export {};
