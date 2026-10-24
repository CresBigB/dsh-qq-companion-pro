/**
 * 群管理写操作工具（T13 · 待办 7 的「群管理」一批）。
 *
 * 这四项是真会改变**群设置**的模型工具：禁言 / 解禁、改群名片、发群公告、
 * 设 / 取消精华。它们比别的工具多两道门禁，缺一不可（T14 的轻互动工具同样是对外
 * 的写操作，但那三个改的是消息与别人的观感、不动群设置，门禁写在
 * `src/interaction-tools.ts`）：
 *
 * 1. **能力层（注册层）**：`qq.group.manage` / `qq.group.notice` 的
 *    `memberDefault` 与 `groupDefault` 都是 false（`src/capabilities.ts`）——
 *    默认连工具都不注册，模型看不到，需要主人在 `memberGrant` /
 *    `friendGrant` / `strangerGrant` 里显式授权才有入口；
 * 2. **回合层（执行层，本模块）**：工具是按**会话**注册的，一个群只有一个会话，
 *    注册了就等于整个群都有入口；"群里这句话是谁说的"只有回合级才知道。所以每个
 *    执行体第一件事就是 {@link GroupToolHost.canEditFiles}（本回合发起者是主人，
 *    回合开始时冻结，fail-closed 为 member）。不是主人回合 → 当场返回结构化错误，
 *    **一个 OneBot 请求都不发**（连参数都不再看）。
 *
 * 审计：每一次调用（成功、失败、被上面两道门禁拒掉、参数不合法）都写一行到
 * `mediaDir/qq-actions.log`——与工具发送共用同一套写入（`bridge.auditAction` →
 * `OutboundPipeline.auditWrite`，jsonl：ts / chatId / action / ok / reason），
 * action 是工具名，reason 里带目标与参数摘要（禁言多久、公告多少字…）。
 *
 * 参数校验的取舍：这些是写操作，**宁可少做不可错伤**，所以校验不过就拒绝，绝不
 * "猜一个合理的值"——禁言时长超上限不夹到上限（那会变成"她要禁一年，结果禁了
 * 30 天"），负数不改成 0（那会变成"解禁"）。
 * @module dsh-qq-companion/group-tools
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
/** 一次禁言的最长时长（秒）：QQ 侧上限就是 30 天，再长会被服务端截断。 */
export declare const MAX_BAN_SECONDS: number;
/** 群公告的最长字数（超出直接拒绝，不截断——截断会把话说一半）。 */
export declare const MAX_ANNOUNCE_CHARS = 500;
/** 群名片的最长字数。 */
export declare const MAX_CARD_CHARS = 60;
/** 群管理工具从 bridge 需要的三件事（bridge 自己就满足）。 */
export interface GroupToolHost {
    /** 一个 agent 会话对应的 chat id（没有映射 = 这个会话不来自 QQ）。 */
    chatForSession(sessionId: string): string | undefined;
    /** 本回合发起者是不是主人（回合开始时冻结，fail-closed 为 member）。 */
    canEditFiles(sessionId: string): boolean;
    /** 写操作审计一行（与工具发送审计同一套写入）。 */
    auditAction(chatId: string, action: string, ok: boolean, reason: string): void;
}
/** 群管理工具需要的 OneBot 传输（`connection.call` 就够了）。 */
export interface GroupToolTransport {
    call(action: string, params: Record<string, unknown>): Promise<unknown>;
}
/** 结构化拒绝：模型拿到的是可读原因，不是一次抛错。 */
export interface GroupRefusal {
    ok: false;
    reason: string;
}
/** 回合门禁放行后才有的上下文。 */
interface TurnGate {
    ok: true;
    /** 本回合所属会话 id。 */
    sessionId: string;
    /** 本回合所属会话对应的 chat id。 */
    chatId: string;
}
/** 目标群。 */
interface GroupTarget {
    ok: true;
    /** 群号（纯数字字符串）。 */
    groupId: string;
    /** 审计里用的 chat id（`group:<群号>`）。 */
    chatId: string;
}
/**
 * **回合层门禁**（本任务的关键安全设计）。
 *
 * 顺序固定：先确认这个会话真的来自 QQ（没有映射就 fail-closed 拒绝，不能沿用
 * `canEditFiles` 对「非 QQ 会话」的默认信任），再问「本回合是不是主人发起的」。
 * 两件事都过了才继续；任何一步不过都返回拒绝，调用方必须**在发任何请求之前**
 * 把它原样返回给模型。
 * @param host - bridge 的三件事。
 * @param exec - 工具运行上下文（它的 session 能映回一个 chat）。
 * @returns 放行上下文，或结构化拒绝。
 */
export declare function turnGate(host: GroupToolHost, exec: ToolRunContext): TurnGate | GroupRefusal;
/**
 * 目标群：显式 `group_id` 优先，否则必须是当前群聊（私聊里必须传群号）。
 * @param gate - 门禁放行后的上下文。
 * @param arg - 模型的 `group_id` 参数。
 * @returns 目标群，或结构化拒绝。
 */
export declare function targetGroup(gate: TurnGate, arg: unknown): GroupTarget | GroupRefusal;
/**
 * 禁言时长：必须是非负整数秒，且不超过 {@link MAX_BAN_SECONDS}。
 * 越界一律拒绝（不夹逼：夹逼等于替主人改了她的意思）。
 * @param arg - 模型的 `duration_seconds` 参数。
 * @returns 规整后的秒数，或结构化拒绝。
 */
export declare function parseBanSeconds(arg: unknown): {
    ok: true;
    seconds: number;
} | GroupRefusal;
/**
 * 注册四个群管理写操作工具。
 *
 * 注册是 effect-based（返回的 disposer 反注册）；`allow` 是能力层门禁——关掉的
 * 能力连工具都不注册。注意 allow 用的是会话级注册集，所以它只回答"这个会话有没有
 * 入口"，"这一次能不能真的做"由每个执行体里的 {@link turnGate} 回答。
 * @param ctx - 插件/agent 上下文。
 * @param host - bridge 的三件事（会话映射、回合角色、审计）。
 * @param transport - OneBot 传输。
 * @param allow - 可选的能力层门禁（返回 false 的工具不注册）。
 * @returns the disposer。
 */
export declare function registerGroupTools(ctx: Context, host: GroupToolHost, transport: GroupToolTransport, allow?: (toolName: string) => boolean): () => void;
export {};
