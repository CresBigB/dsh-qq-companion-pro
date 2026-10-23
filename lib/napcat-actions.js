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
