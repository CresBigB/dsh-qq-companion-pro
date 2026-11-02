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
import type { Session } from '@deepseek-ai/dsh-session';
import type { ChatId, ChatKind } from './chat.js';
/**
 * The host's title byte budget: the `session-title` row in both bundled host
 * patches (`@deepseek-ai/dsh-base` / `dsh-sdk-minimal` cordis.patch.yml) sets
 * `maxTitleBytes: 80`. `rename` re-normalizes and truncates at that budget
 * anyway (`normalizeSessionTitle` → `truncateTitleUtf8`, code-point safe,
 * `trimEnd` after the cut) — truncating here keeps the rendered title
 * predictable and the separator cleanup below meaningful.
 */
export declare const MAX_TITLE_BYTES = 80;
/** The folded title snapshot (`SessionTitleSnapshot` in
 * @deepseek-ai/dsh-session-title): `title`, the `messageSeqs` the title was
 * derived from, the `source` (`{kind:'user'}` for an explicit rename,
 * `{kind:'fallback'}` for the deterministic first-prompt title, or
 * `{kind:'provider', provider, model?}` for a model-generated one), the
 * `eventSeq` of that `session/title` event and its `updatedAt` (event time,
 * epoch ms). Only `title` matters here — the resume check — so the rest stays
 * off this structural type. */
export interface SessionTitleSnapshotLike {
    title?: string;
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
    get?(session: Session): SessionTitleSnapshotLike | undefined;
    rename(session: Session, title: string): unknown;
}
/** Create = a brand-new session; resume = an existing one that may already be
 * named (only a blank title is filled, a user's Web rename is never undone). */
export type SessionTitleMode = 'create' | 'resume';
/** Placeholder inputs for {@link renderSessionTitle}. */
export interface SessionTitleVars {
    /** Chat kind: private → `{kind}` = QQ私聊, group → QQ群. */
    kind: ChatKind;
    /** QQ number (private: the peer user id; group: the group id). */
    target: string;
    /** Sender display name — used for `{nickname}` in private chats only (a
     * group title names the group, so `{nickname}` renders empty there). */
    nickname?: string;
    /** Reference time for `{date}` / `{time}` (local timezone); default now. */
    at?: Date;
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
export declare function renderSessionTitle(template: string, vars: SessionTitleVars): string;
/** Inputs of {@link titleSession}. */
export interface TitleSessionParams {
    /** Lazily resolved host service; `undefined` = no title support here. */
    service: SessionTitleLike | undefined;
    /** The exact live session to name (must be live in the host store). */
    session: Session;
    /** Chat the session belongs to (decodes `{kind}` / `{target}`). */
    chatId: ChatId;
    mode: SessionTitleMode;
    /** The configured template (`''` / `undefined` = titles off). */
    template: string | undefined;
    /** Sender display name for `{nickname}` (create passes the inbound one,
     * resume has none). */
    nickname?: string;
    log?: (level: 'info' | 'warn' | 'error' | 'debug', message: string) => void;
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
export declare function titleSession(params: TitleSessionParams): string | undefined;
