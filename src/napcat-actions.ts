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
import type { CapabilityId } from './capabilities.js'

/** 一条 OneBot action 的元数据。 */
export interface NapCatActionMeta {
  /** 是否修改外部状态（发送 / 上传）。false = 只读查询。 */
  write: boolean
  /** 归属能力（`src/capabilities.ts` 里的 CapabilityId）。 */
  capability: CapabilityId
  /** 一句中文说明。 */
  describe: string
}

/**
 * 白名单表：action 名 → 元数据。
 *
 * **键的顺序 = 改造前的数组顺序**（`qq_napcat_api` 的工具描述与拒绝文案都由它
 * 拼接；顺序变了文案就变了）。
 */
export const NAPCAT_ACTIONS: Readonly<Record<string, NapCatActionMeta>> = {
  get_group_member_list: { write: false, capability: 'qq.napcat.api', describe: '拉取群成员列表（QQ 号、名片、昵称等）' },
  get_group_member_info: { write: false, capability: 'qq.napcat.api', describe: '查某个群成员的详细资料' },
  get_stranger_info: { write: false, capability: 'qq.napcat.api', describe: '查陌生人的公开资料' },
  get_forward_msg: { write: false, capability: 'qq.napcat.api', describe: '展开一条合并转发里的消息' },
  get_record: { write: false, capability: 'qq.napcat.api', describe: '取语音消息的音频文件' },
  get_file: { write: false, capability: 'qq.napcat.api', describe: '取收到的文件信息' },
  upload_group_file: { write: true, capability: 'qq.napcat.api', describe: '上传文件到群文件' },
  upload_private_file: { write: true, capability: 'qq.napcat.api', describe: '上传文件到私聊文件' },
  get_group_root_files: { write: false, capability: 'qq.napcat.api', describe: '列出群文件根目录' },
  get_group_files_by_folder: { write: false, capability: 'qq.napcat.api', describe: '列出群文件里某个文件夹' },
  get_group_file_url: { write: false, capability: 'qq.napcat.api', describe: '取群文件的下载地址' },
  get_private_file_url: { write: false, capability: 'qq.napcat.api', describe: '取私聊文件的下载地址' },
  ocr_image: { write: false, capability: 'qq.napcat.api', describe: '识别图片里的文字' },
  get_ai_characters: { write: false, capability: 'qq.napcat.api', describe: '列出群 AI 语音的音色' },
  send_group_ai_record: { write: true, capability: 'qq.napcat.api', describe: '用群 AI 语音发一条语音' },
  // ---- T13 · 群管理写操作（两个能力默认关，且只由主人回合驱动；不走 qq_napcat_api）
  set_group_ban: { write: true, capability: 'qq.group.manage', describe: '禁言 / 解除禁言某个群成员（duration 0 = 解除）' },
  set_group_whole_ban: { write: true, capability: 'qq.group.manage', describe: '开启 / 解除全体禁言' },
  set_group_card: { write: true, capability: 'qq.group.manage', describe: '改某个群成员的群名片（空串 = 清除名片）' },
  _send_group_notice: { write: true, capability: 'qq.group.notice', describe: '发布 / 修改群公告（全群可见）' },
  set_essence_msg: { write: true, capability: 'qq.group.notice', describe: '把一条群消息设为精华' },
  delete_essence_msg: { write: true, capability: 'qq.group.notice', describe: '取消某条群消息的精华' },
  // ---- T14 · 轻互动（表情回应默认开；戳 / 点赞默认关，且只由主人回合驱动；不走 qq_napcat_api）
  //      `set_msg_emoji_like` 的 `set` 参数（true/false）在离线文档里没写清，这里只发
  //      `{message_id, emoji_id}`，把「取消回应」留给读到 `set:false` 的真机验证；不传
  //      时 NapCat 的行为按「贴一个回应」理解，见 src/interaction-tools.ts 的注释。
  set_msg_emoji_like: { write: true, capability: 'qq.interact.react', describe: '给一条消息贴 / 取消 QQ 表情回应' },
  friend_poke: { write: true, capability: 'qq.interact.poke', describe: '在私聊里戳一戳对面那个人' },
  group_poke: { write: true, capability: 'qq.interact.poke', describe: '在群里戳一戳某个群成员' },
  send_like: { write: true, capability: 'qq.interact.like', describe: '给某个 QQ 号点名片赞（times = 1-10）' },
}

/**
 * 全部白名单 action 名（顺序 = 表里声明的顺序 = 改造前的数组顺序）。
 *
 * 用 `Object.keys` 而不是另抄一份数组：加一行就够，不必两处同步。
 */
export const NAPCAT_ACTION_NAMES: readonly string[] = Object.freeze(Object.keys(NAPCAT_ACTIONS))

/**
 * 查一条 action 的元数据。
 * @param action - OneBot action 名。
 * @returns 元数据；表外 action 返回 undefined（调用方据此拒绝）。
 */
export function napcatActionMeta(action: string): NapCatActionMeta | undefined {
  return Object.prototype.hasOwnProperty.call(NAPCAT_ACTIONS, action) ? NAPCAT_ACTIONS[action] : undefined
}

/**
 * 这条 action 是否在表内（`qq_napcat_api` 的唯一放行判据）。
 * @param action - OneBot action 名。
 * @returns 在表内为 true。
 */
export function isNapCatActionWhitelisted(action: string): boolean {
  return napcatActionMeta(action) !== undefined
}

/**
 * 某个能力下的全部 action（按表顺序）。
 * @param capability - 能力 id。
 * @returns action 名列表（可能为空）。
 */
export function napcatActionsOfCapability(capability: CapabilityId): string[] {
  return NAPCAT_ACTION_NAMES.filter(action => NAPCAT_ACTIONS[action].capability === capability)
}

/**
 * `qq_napcat_api` 的放行集合：表内**且归 `qq.napcat.api` 能力**的 action。
 *
 * 与 {@link NAPCAT_ACTION_NAMES}（整张表）刻意分开：T13 的群管理写操作也在表里，
 * 但它们有自己的能力开关，绝不能借这个万能入口绕过「能力默认关 + 只有主人回合」
 * 两道门禁。这份清单就是改造前的 15 条，顺序也一致——`qq_napcat_api` 的描述与
 * 拒绝文案都由它拼出来，所以 T13 之后那个工具仍然零行为变化。
 */
export const NAPCAT_PROXY_ACTION_NAMES: readonly string[] = Object.freeze(napcatActionsOfCapability('qq.napcat.api'))

/**
 * 这条 action 能不能经 `qq_napcat_api` 调用（= 在 {@link NAPCAT_PROXY_ACTION_NAMES} 里）。
 * @param action - OneBot action 名。
 * @returns 可经万能入口调用为 true。
 */
export function isNapCatProxyAction(action: string): boolean {
  return NAPCAT_ACTIONS[action]?.capability === 'qq.napcat.api' && isNapCatActionWhitelisted(action)
}