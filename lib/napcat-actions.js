/**
 * 白名单表：action 名 → 元数据。
 *
 * **键的顺序 = 改造前的数组顺序**（`qq_napcat_api` 的工具描述与拒绝文案都由它
 * 拼接；顺序变了文案就变了）。
 */
export const NAPCAT_ACTIONS = {
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
};
/**
 * 全部白名单 action 名（顺序 = 表里声明的顺序 = 改造前的数组顺序）。
 *
 * 用 `Object.keys` 而不是另抄一份数组：加一行就够，不必两处同步。
 */
export const NAPCAT_ACTION_NAMES = Object.freeze(Object.keys(NAPCAT_ACTIONS));
/**
 * 查一条 action 的元数据。
 * @param action - OneBot action 名。
 * @returns 元数据；表外 action 返回 undefined（调用方据此拒绝）。
 */
export function napcatActionMeta(action) {
    return Object.prototype.hasOwnProperty.call(NAPCAT_ACTIONS, action) ? NAPCAT_ACTIONS[action] : undefined;
}
/**
 * 这条 action 是否在表内（`qq_napcat_api` 的唯一放行判据）。
 * @param action - OneBot action 名。
 * @returns 在表内为 true。
 */
export function isNapCatActionWhitelisted(action) {
    return napcatActionMeta(action) !== undefined;
}
/**
 * 某个能力下的全部 action（按表顺序）。
 * @param capability - 能力 id。
 * @returns action 名列表（可能为空）。
 */
export function napcatActionsOfCapability(capability) {
    return NAPCAT_ACTION_NAMES.filter(action => NAPCAT_ACTIONS[action].capability === capability);
}
/**
 * `qq_napcat_api` 的放行集合：表内**且归 `qq.napcat.api` 能力**的 action。
 *
 * 与 {@link NAPCAT_ACTION_NAMES}（整张表）刻意分开：T13 的群管理写操作也在表里，
 * 但它们有自己的能力开关，绝不能借这个万能入口绕过「能力默认关 + 只有主人回合」
 * 两道门禁。这份清单就是改造前的 15 条，顺序也一致——`qq_napcat_api` 的描述与
 * 拒绝文案都由它拼出来，所以 T13 之后那个工具仍然零行为变化。
 */
export const NAPCAT_PROXY_ACTION_NAMES = Object.freeze(napcatActionsOfCapability('qq.napcat.api'));
/**
 * 这条 action 能不能经 `qq_napcat_api` 调用（= 在 {@link NAPCAT_PROXY_ACTION_NAMES} 里）。
 * @param action - OneBot action 名。
 * @returns 可经万能入口调用为 true。
 */
export function isNapCatProxyAction(action) {
    return NAPCAT_ACTIONS[action]?.capability === 'qq.napcat.api' && isNapCatActionWhitelisted(action);
}
