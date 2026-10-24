/**
 * NapCat / OneBot action 白名单表（T12 · 表驱动化）。
 *
 * 改造前这张表是 `src/tools.ts` 里一个硬编码的 15 条字符串数组
 * （`NAPCAT_API_WHITELIST`），除了「在不在表里」什么都不知道：没有读写标记、
 * 没有归属能力、没有一句人话说明。于是 `qq_napcat_api` 只能是一个「白名单内的
 * 万能调用器」，也没法按 action 单独启停。
 *
 * 现在每条 action 是一行元数据：
 * - `write`：**是否修改外部状态**（往 QQ 发东西、传文件）。只读查询与写操作必须
 *   分开标注，以后要给「只读模式」或按读写分档授权时才有依据；
 * - `capability`：这条 action 归哪个能力（决定它随哪个开关启停）。目前 15 条全部
 *   归 `qq.napcat.api`——**刻意不打散**：改造前的行为是「这个工具一开，15 条全能用」，
 *   打散会改变权限语义；以后要给某个 action 单独开一个能力，改这一行即可；
 * - `describe`：一句中文，说清这条 action 干什么（进 `qq_napcat_api` 的描述，
 *   将来生成独立工具时也直接用这句话）。
 *
 * 纪律：**加一个 action 只需要在这张表里加一行**（同时确认它的 capability 已在
 * `src/capabilities.ts` 登记）。测试（tests/napcat-actions.spec.ts）钉住三件事：
 * 1. 表完整（每条都有 capability，且该能力真的在 CAPABILITIES 里）；
 * 2. 改造前的 15 条**逐条仍可调用**，表外 action 的拒绝文案一字不变（零行为变化）；
 * 3. 表格键的顺序 = 改造前数组的顺序（描述与报错文案由它拼出来）。
 *
 * T14 追加了 4 条**轻互动**（`set_msg_emoji_like` / `friend_poke` / `group_poke` /
 * `send_like`），挂在 `qq.interact.react` / `qq.interact.poke` / `qq.interact.like` 下。
 * 理由与 T13 相同：它们也不走 `qq_napcat_api` 这个万能入口。
 *
 * T13 追加了 6 条**群管理写操作**（禁言 / 全体禁言 / 群名片 / 群公告 / 精华），
 * 各自挂在 `qq.group.manage` / `qq.group.notice` 下。它们**不走 `qq_napcat_api`
 * 这个万能入口**：那个工具的放行集合是 {@link NAPCAT_PROXY_ACTION_NAMES}（只在
 * `qq.napcat.api` 能力下的 15 条），否则 `qq.napcat.api` 一开（默认就对每个会话开）
 * 就等于给所有人一把禁言的刀，连带双重门禁形同虚设。
 * @module dsh-qq-companion/napcat-actions
 */
import type { CapabilityId } from './capabilities.js';
/** 一条 OneBot action 的元数据。 */
export interface NapCatActionMeta {
    /** 是否修改外部状态（发送 / 上传）。false = 只读查询。 */
    write: boolean;
    /** 归属能力（`src/capabilities.ts` 里的 CapabilityId）。 */
    capability: CapabilityId;
    /** 一句中文说明。 */
    describe: string;
}
/**
 * 白名单表：action 名 → 元数据。
 *
 * **键的顺序 = 改造前的数组顺序**（`qq_napcat_api` 的工具描述与拒绝文案都由它
 * 拼接；顺序变了文案就变了）。
 */
export declare const NAPCAT_ACTIONS: Readonly<Record<string, NapCatActionMeta>>;
/**
 * 全部白名单 action 名（顺序 = 表里声明的顺序 = 改造前的数组顺序）。
 *
 * 用 `Object.keys` 而不是另抄一份数组：加一行就够，不必两处同步。
 */
export declare const NAPCAT_ACTION_NAMES: readonly string[];
/**
 * 查一条 action 的元数据。
 * @param action - OneBot action 名。
 * @returns 元数据；表外 action 返回 undefined（调用方据此拒绝）。
 */
export declare function napcatActionMeta(action: string): NapCatActionMeta | undefined;
/**
 * 这条 action 是否在表内（`qq_napcat_api` 的唯一放行判据）。
 * @param action - OneBot action 名。
 * @returns 在表内为 true。
 */
export declare function isNapCatActionWhitelisted(action: string): boolean;
/**
 * 某个能力下的全部 action（按表顺序）。
 * @param capability - 能力 id。
 * @returns action 名列表（可能为空）。
 */
export declare function napcatActionsOfCapability(capability: CapabilityId): string[];
/**
 * `qq_napcat_api` 的放行集合：表内**且归 `qq.napcat.api` 能力**的 action。
 *
 * 与 {@link NAPCAT_ACTION_NAMES}（整张表）刻意分开：T13 的群管理写操作也在表里，
 * 但它们有自己的能力开关，绝不能借这个万能入口绕过「能力默认关 + 只有主人回合」
 * 两道门禁。这份清单就是改造前的 15 条，顺序也一致——`qq_napcat_api` 的描述与
 * 拒绝文案都由它拼出来，所以 T13 之后那个工具仍然零行为变化。
 */
export declare const NAPCAT_PROXY_ACTION_NAMES: readonly string[];
/**
 * 这条 action 能不能经 `qq_napcat_api` 调用（= 在 {@link NAPCAT_PROXY_ACTION_NAMES} 里）。
 * @param action - OneBot action 名。
 * @returns 可经万能入口调用为 true。
 */
export declare function isNapCatProxyAction(action: string): boolean;
