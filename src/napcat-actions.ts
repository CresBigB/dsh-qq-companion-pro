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