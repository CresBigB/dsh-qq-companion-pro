/** 被拍时喂给她的那句「消息」文本（占位，不含任何用户可控内容）。 */
export const POKE_TEXT = '[拍了拍你]';
/** `user_id`/`target_id` 可能是数字、字符串或缺失——统一成字符串。 */
function idOf(raw) {
    if (typeof raw === 'number' && Number.isFinite(raw))
        return String(Math.trunc(raw));
    if (typeof raw === 'string')
        return raw.trim();
    return '';
}
/**
 * Reduce one notice event to a PokeNotice, or null when it is not a poke.
 * Notice-type gates only: who was poked (and whether we care) is the bridge's
 * decision, because only it knows its own QQ number.
 */
export function parsePokeNotice(event) {
    if (event.post_type !== 'notice')
        return null;
    const noticeType = typeof event.notice_type === 'string' ? event.notice_type : '';
    const subType = typeof event.sub_type === 'string' ? event.sub_type : '';
    const isPoke = noticeType === 'poke' || (noticeType === 'notify' && subType === 'poke');
    if (!isPoke)
        return null;
    const userId = idOf(event.user_id);
    const targetId = idOf(event.target_id);
    if (userId === '' || targetId === '')
        return null;
    const groupId = idOf(event.group_id);
    return {
        kind: groupId === '' ? 'private' : 'group',
        userId,
        groupId,
        targetId,
    };
}
/**
 * Build the equivalent message event for a poke, so the ordinary inbound
 * pipeline handles it. No `sender` fields: an implementation that does not
 * report who poked us cannot supply a nickname, and the pipeline's own
 * fallback (user id) is the honest answer.
 */
export function pokeMessageEvent(notice) {
    return {
        post_type: 'message',
        message_type: notice.kind,
        user_id: notice.userId,
        ...(notice.kind === 'group' ? { group_id: notice.groupId } : {}),
        message: [{ type: 'text', data: { text: POKE_TEXT } }],
        raw_message: POKE_TEXT,
    };
}
