/**
 * QQ「拍一拍」→ 一条没有文字的入站消息。
 *
 * 拍一拍在 OneBot 11 里不是消息事件，而是一条 notice：
 *
 *   { post_type: 'notice', notice_type: 'notify', sub_type: 'poke',
 *     user_id: 拍的人, target_id: 被拍的人, group_id?: 群号 }
 *
 * 也有实现直接把 notice_type 写成 'poke'。这里把两种写法都认下来，再把
 * 「她被人拍了」翻译成一次普通入站消息（见 pokeMessageEvent），这样后面
 * 的会话/权限/忙碌/频率/策略全链路一行都不用改——拍一拍只是「一句话」，
 * 不是第二套派发路径。群聊里拍她等同 @：由 inbound 管线把 poked 当成
 * mentioned，requireMention 因此放行。
 *
 * 纯函数，无 I/O、无状态。
 */
import type { OneBotEvent } from './connection.js'

/** 被拍时喂给她的那句「消息」文本（占位，不含任何用户可控内容）。 */
export const POKE_TEXT = '[拍了拍你]'

/** 一次拍一拍事件里我们真正关心的字段。 */
export interface PokeNotice {
  /** 'private' | 'group' —— 有 group_id 就是群里拍的。 */
  kind: 'private' | 'group'
  /** 动手拍的那个人。 */
  userId: string
  /** 群号；私聊为 ''。 */
  groupId: string
  /** 被拍的人（她要等于自己的 QQ 号才理会）。 */
  targetId: string
}

/** `user_id`/`target_id` 可能是数字、字符串或缺失——统一成字符串。 */
function idOf(raw: unknown): string {
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(Math.trunc(raw))
  if (typeof raw === 'string') return raw.trim()
  return ''
}

/**
 * Reduce one notice event to a PokeNotice, or null when it is not a poke.
 * Notice-type gates only: who was poked (and whether we care) is the bridge's
 * decision, because only it knows its own QQ number.
 */
export function parsePokeNotice(event: OneBotEvent): PokeNotice | null {
  if (event.post_type !== 'notice') return null
  const noticeType = typeof event.notice_type === 'string' ? event.notice_type : ''
  const subType = typeof event.sub_type === 'string' ? event.sub_type : ''
  const isPoke = noticeType === 'poke' || (noticeType === 'notify' && subType === 'poke')
  if (!isPoke) return null
  const userId = idOf(event.user_id)
  const targetId = idOf(event.target_id)
  if (userId === '' || targetId === '') return null
  const groupId = idOf(event.group_id)
  return {
    kind: groupId === '' ? 'private' : 'group',
    userId,
    groupId,
    targetId,
  }
}

/**
 * Build the equivalent message event for a poke, so the ordinary inbound
 * pipeline handles it. No `sender` fields: an implementation that does not
 * report who poked us cannot supply a nickname, and the pipeline's own
 * fallback (user id) is the honest answer.
 */
export function pokeMessageEvent(notice: PokeNotice): OneBotEvent {
  return {
    post_type: 'message',
    message_type: notice.kind,
    user_id: notice.userId,
    ...(notice.kind === 'group' ? { group_id: notice.groupId } : {}),
    message: [{ type: 'text', data: { text: POKE_TEXT } }],
    raw_message: POKE_TEXT,
  }
}
