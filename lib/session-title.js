import { sanitizeNickname, splitChatId } from './chat.js';
/**
 * The host's title byte budget: the `session-title` row in both bundled host
 * patches (`@deepseek-ai/dsh-base` / `dsh-sdk-minimal` cordis.patch.yml) sets
 * `maxTitleBytes: 80`. `rename` re-normalizes and truncates at that budget
 * anyway (`normalizeSessionTitle` → `truncateTitleUtf8`, code-point safe,
 * `trimEnd` after the cut) — truncating here keeps the rendered title
 * predictable and the separator cleanup below meaningful.
 */
export const MAX_TITLE_BYTES = 80;
/** `{kind}` labels. */
const KIND_LABEL = { private: 'QQ私聊', group: 'QQ群' };
/** One `{placeholder}` occurrence (an unknown name is left verbatim). */
const PLACEHOLDER = /\{([^{}]*)\}/gu;
/** Bracket pairs left behind by an empty placeholder, e.g. `（）` / `()`. */
const EMPTY_BRACKET_PAIR = /\(\s*\)|（\s*）|\[\s*\]|【\s*】|<\s*>|《\s*》|"\s*"|'\s*'/gu;
/** Joining punctuation that must not dangle at either end. */
const LEADING_SEPARATOR = /^[\s·•|/\\,，、;；:：\-–—_]+/u;
const TRAILING_SEPARATOR = /[\s·•|/\\,，、;；:：\-–—_]+$/u;
/** Two-digit zero-padded number (00–99). */
function pad2(value) {
    return value < 10 ? '0' + value : String(value);
}
/** Strip leading/trailing whitespace and joining punctuation until stable, so
 * an empty placeholder never leaves a dangling ` · ` or an empty `（）`. */
function stripEdgeSeparators(text) {
    let out = text;
    for (;;) {
        const next = out.replace(LEADING_SEPARATOR, '').replace(TRAILING_SEPARATOR, '');
        if (next === out)
            return out;
        out = next;
    }
}
/** Truncate to a UTF-8 byte budget without splitting a code point (the host's
 * `truncateTitleUtf8` rule). */
function truncateUtf8(text, maxBytes) {
    if (Buffer.byteLength(text, 'utf8') <= maxBytes)
        return text;
    let used = 0;
    let out = '';
    for (const character of text) {
        const bytes = Buffer.byteLength(character, 'utf8');
        if (used + bytes > maxBytes)
            break;
        out += character;
        used += bytes;
    }
    return out;
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
export function renderSessionTitle(template, vars) {
    if (template.trim() === '')
        return '';
    const at = vars.at ?? new Date();
    const values = {
        kind: KIND_LABEL[vars.kind],
        target: vars.target,
        nickname: vars.kind === 'private' ? sanitizeNickname(vars.nickname ?? '') : '',
        date: pad2(at.getMonth() + 1) + '-' + pad2(at.getDate()),
        time: pad2(at.getHours()) + ':' + pad2(at.getMinutes()),
    };
    const filled = template.replace(PLACEHOLDER, (match, name) => (Object.hasOwn(values, name) ? values[name] : match));
    const cleaned = stripEdgeSeparators(filled.replace(EMPTY_BRACKET_PAIR, '').replace(/\s+/gu, ' '));
    if (cleaned === '')
        return '';
    return stripEdgeSeparators(truncateUtf8(cleaned, MAX_TITLE_BYTES).trimEnd());
}
/** The title a session already carries (`undefined` = blank / unreadable). */
function existingTitle(service, session) {
    if (typeof service.get !== 'function')
        return undefined;
    const title = service.get(session)?.title;
    return typeof title === 'string' && title.trim() !== '' ? title : undefined;
}
/** The session's creation time from its header (epoch ms → Date), if any. A UI
 * rename keeps the original creation date rather than the moment of resume. */
function sessionCreatedAt(session) {
    const createdAt = session.header?.createdAt;
    if (typeof createdAt !== 'number' || !Number.isFinite(createdAt) || createdAt <= 0)
        return undefined;
    return new Date(createdAt);
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
export function titleSession(params) {
    const { chatId, mode, service, session } = params;
    try {
        if (service === undefined || service === null)
            return undefined;
        const template = params.template ?? '';
        if (template.trim() === '')
            return undefined;
        if (mode === 'resume' && existingTitle(service, session) !== undefined)
            return undefined;
        const { kind, target } = splitChatId(chatId);
        const title = renderSessionTitle(template, {
            kind,
            target,
            nickname: params.nickname ?? '',
            at: sessionCreatedAt(session) ?? new Date(),
        });
        if (title === '')
            return undefined;
        service.rename(session, title);
        return title;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        params.log?.('warn', '会话标题设置失败（' + chatId + '）：' + message);
        return undefined;
    }
}
