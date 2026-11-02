/**
 * QQ session titles: render the configured template and hand the result to the
 * host `sessionTitle` service.
 *
 * Why this exists: the host's automatic title only reads messages whose
 * `source.kind === 'user'` (@deepseek-ai/dsh-session-title,
 * `sessionTitleUserMessageOf`), and every message this plugin feeds an agent is
 * `plugin:qq-companion`-sourced — so a QQ session would keep its raw id
 * (`onebot-private-10001-mvjxpyk7`) as its display name forever. This
 * module writes the title itself through `sessionTitle.rename(session, title)`,
 * which appends one `session/title` event with the `user` source (that also pins
 * the title against later automatic generation, exactly like a Web rename).
 *
 * Everything here is best-effort: the service is optional (the plugin does not
 * statically inject it), a missing / throwing service or an invalid title only
 * logs, and naming never affects session creation or resume.
 * @module dsh-qq-companion/session-title
 */
import type { Session } from '@deepseek-ai/dsh-session'

import type { ChatId, ChatKind } from './chat.js'
import { sanitizeNickname, splitChatId } from './chat.js'

/**
 * The host's title byte budget: the `session-title` row in both bundled host
 * patches (`@deepseek-ai/dsh-base` / `dsh-sdk-minimal` cordis.patch.yml) sets
 * `maxTitleBytes: 80`. `rename` re-normalizes and truncates at that budget
 * anyway (`normalizeSessionTitle` → `truncateTitleUtf8`, code-point safe,
 * `trimEnd` after the cut) — truncating here keeps the rendered title
 * predictable and the separator cleanup below meaningful.
 */
export const MAX_TITLE_BYTES = 80

/** The folded title snapshot (`SessionTitleSnapshot` in
 * @deepseek-ai/dsh-session-title): `title`, the `messageSeqs` the title was
 * derived from, the `source` (`{kind:'user'}` for an explicit rename,
 * `{kind:'fallback'}` for the deterministic first-prompt title, or
 * `{kind:'provider', provider, model?}` for a model-generated one), the
 * `eventSeq` of that `session/title` event and its `updatedAt` (event time,
 * epoch ms). Only `title` matters here — the resume check — so the rest stays
 * off this structural type. */
export interface SessionTitleSnapshotLike {
  title?: string
}

/**
 * The host `sessionTitle` service surface this plugin uses. `get` folds the
 * session log (works on any live or replayed session); `rename` appends the
 * title event and REQUIRES the session to be live in the host session store
 * (it throws `session "<id>" is not live in this store` otherwise, and
 * `SessionTitleInvalidError` when the text normalizes to empty). `get` is
 * optional so a stub service can omit it.
 */
export interface SessionTitleLike {
  get?(session: Session): SessionTitleSnapshotLike | undefined
  rename(session: Session, title: string): unknown
}

/** Create = a brand-new session; resume = an existing one that may already be
 * named (only a blank title is filled, a user's Web rename is never undone). */
export type SessionTitleMode = 'create' | 'resume'

/** Placeholder inputs for {@link renderSessionTitle}. */
export interface SessionTitleVars {
  /** Chat kind: private → `{kind}` = QQ私聊, group → QQ群. */
  kind: ChatKind
  /** QQ number (private: the peer user id; group: the group id). */
  target: string
  /** Sender display name — used for `{nickname}` in private chats only (a
   * group title names the group, so `{nickname}` renders empty there). */
  nickname?: string
  /** Reference time for `{date}` / `{time}` (local timezone); default now. */
  at?: Date
}

/** `{kind}` labels. */
const KIND_LABEL: Record<ChatKind, string> = { private: 'QQ私聊', group: 'QQ群' }

/** One `{placeholder}` occurrence (an unknown name is left verbatim). */
const PLACEHOLDER = /\{([^{}]*)\}/gu
/** Bracket pairs left behind by an empty placeholder, e.g. `（）` / `()`. */
const EMPTY_BRACKET_PAIR = /\(\s*\)|（\s*）|\[\s*\]|【\s*】|<\s*>|《\s*》|"\s*"|'\s*'/gu
/** Joining punctuation that must not dangle at either end. */
const LEADING_SEPARATOR = /^[\s·•|/\\,，、;；:：\-–—_]+/u
const TRAILING_SEPARATOR = /[\s·•|/\\,，、;；:：\-–—_]+$/u

/** Two-digit zero-padded number (00–99). */
function pad2(value: number): string {
  return value < 10 ? '0' + value : String(value)
}

/** Strip leading/trailing whitespace and joining punctuation until stable, so
 * an empty placeholder never leaves a dangling ` · ` or an empty `（）`. */
function stripEdgeSeparators(text: string): string {
  let out = text
  for (;;) {
    const next = out.replace(LEADING_SEPARATOR, '').replace(TRAILING_SEPARATOR, '')
    if (next === out) return out
    out = next
  }
}

/** Truncate to a UTF-8 byte budget without splitting a code point (the host's
 * `truncateTitleUtf8` rule). */
function truncateUtf8(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text
  let used = 0
  let out = ''
  for (const character of text) {
    const bytes = Buffer.byteLength(character, 'utf8')
    if (used + bytes > maxBytes) break
    out += character
    used += bytes
  }
  return out
}

/**
 * Render a session title from one template and its placeholder values.
 *
 * Placeholders: `{kind}` (QQ私聊 / QQ群), `{target}` (QQ or group number),
 * `{nickname}` (private-chat peer nickname, sanitized with
 * {@link sanitizeNickname}; always empty in groups), `{date}` (MM-DD) and
 * `{time}` (HH:MM), both in the local timezone. Unknown placeholders are kept
 * verbatim. The result collapses whitespace runs, drops separators / empty
 * bracket pairs an empty placeholder left behind, trims, and truncates to
 * {@link MAX_TITLE_BYTES} UTF-8 bytes without breaking a multi-byte character.
 * @param template - the configured template (empty = no title).
 * @param vars - placeholder values.
 * @returns the title; `''` when the template or the rendered text is blank.
 */
export function renderSessionTitle(template: string, vars: SessionTitleVars): string {
  if (template.trim() === '') return ''
  const at = vars.at ?? new Date()
  const values: Record<string, string> = {
    kind: KIND_LABEL[vars.kind],
    target: vars.target,
    nickname: vars.kind === 'private' ? sanitizeNickname(vars.nickname ?? '') : '',
    date: pad2(at.getMonth() + 1) + '-' + pad2(at.getDate()),
    time: pad2(at.getHours()) + ':' + pad2(at.getMinutes()),
  }
  const filled = template.replace(PLACEHOLDER, (match, name: string) => (Object.hasOwn(values, name) ? values[name] : match))
  const cleaned = stripEdgeSeparators(filled.replace(EMPTY_BRACKET_PAIR, '').replace(/\s+/gu, ' '))
  if (cleaned === '') return ''
  return stripEdgeSeparators(truncateUtf8(cleaned, MAX_TITLE_BYTES).trimEnd())
}

/** The title a session already carries (`undefined` = blank / unreadable). */
function existingTitle(service: SessionTitleLike, session: Session): string | undefined {
  if (typeof service.get !== 'function') return undefined
  const title = service.get(session)?.title
  return typeof title === 'string' && title.trim() !== '' ? title : undefined
}

/** The session's creation time from its header (epoch ms → Date), if any. A UI
 * rename keeps the original creation date rather than the moment of resume. */
function sessionCreatedAt(session: Session): Date | undefined {
  const createdAt = (session as { header?: { createdAt?: unknown } }).header?.createdAt
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt) || createdAt <= 0) return undefined
  return new Date(createdAt)
}

/** Inputs of {@link titleSession}. */
export interface TitleSessionParams {
  /** Lazily resolved host service; `undefined` = no title support here. */
  service: SessionTitleLike | undefined
  /** The exact live session to name (must be live in the host store). */
  session: Session
  /** Chat the session belongs to (decodes `{kind}` / `{target}`). */
  chatId: ChatId
  mode: SessionTitleMode
  /** The configured template (`''` / `undefined` = titles off). */
  template: string | undefined
  /** Sender display name for `{nickname}` (create passes the inbound one,
   * resume has none). */
  nickname?: string
  log?: (level: 'info' | 'warn' | 'error' | 'debug', message: string) => void
}

/**
 * Name one live session from the configured template — best-effort, never
 * throws. Skips (silently) when: the service is absent, the template is blank,
 * the rendered title is blank, or — for `resume` — the session already carries
 * a non-empty title (a session renamed in the Web UI keeps that name; only old
 * untitled sessions get backfilled). Any other failure (session not live,
 * invalid title, a throwing `get`/`rename`) is logged as one `warn` line
 * carrying the chat id.
 * @param params - service, session, chat, mode, template and nickname.
 * @returns the title actually applied, or `undefined` when nothing was named.
 */
export function titleSession(params: TitleSessionParams): string | undefined {
  const { chatId, mode, service, session } = params
  try {
    if (service === undefined || service === null) return undefined
    const template = params.template ?? ''
    if (template.trim() === '') return undefined
    if (mode === 'resume' && existingTitle(service, session) !== undefined) return undefined
    const { kind, target } = splitChatId(chatId)
    const title = renderSessionTitle(template, {
      kind,
      target,
      nickname: params.nickname ?? '',
      at: sessionCreatedAt(session) ?? new Date(),
    })
    if (title === '') return undefined
    service.rename(session, title)
    return title
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    params.log?.('warn', '会话标题设置失败（' + chatId + '）：' + message)
    return undefined
  }
}