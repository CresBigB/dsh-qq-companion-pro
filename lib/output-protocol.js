/**
 * 输出协议：她可以决定「这次不回」，而且留下痕迹；也可以精确控制怎么发。
 *
 * **A 档**——模型用**整条回复只是一个标记**的方式表达「这次不回」：
 * - `[不回]` / `[不回:简短原因]`（半角或全角冒号、方括号或圆括号包裹、前后空白
 *   与句末标点都容忍）；
 * - `[不发]`（主动聊天 / 群聊旁观沿用的旧标记，等价于「不回且没说原因」）。
 *
 * **B 档**——正文**最后一行**的单行控制块（默认关闭，按聊天灰度）：
 * ```
 * 正文……
 * 【控制】{"reply":true,"why":"他骂我，先不理","send":["嗯。","……你自己想想"],"quote":"12345"}
 * ```
 * 字段：`reply`（是否回应）/ `why`（≤40 字，只落日志与记忆，绝不发 QQ）/
 * `send`（多条连发，给了就覆盖 splitLines 自动拆句）/ `quote`（引用哪条消息）/
 * `voice`（v1 不支持，识别出来只记一条 debug）。
 *
 * 纪律（协议的核心，别放宽）：
 * - A 档**必须整条只有这个标记**：去掉标记与空白、句末标点之后没有任何内容。正文
 *   中间或结尾出现「不回」二字、把 `[不发]` 当例子提一句、`[不回] 后面还有正文`
 *   都不算标记——否则模型的正常回答会被悄悄吞掉；
 * - B 档**只认最后一行**且只认语法合法的 JSON 对象：JSON 写错就整段原样返回
 *   （control 缺席），**绝不吞消息**；单个字段类型不对只丢那个字段（记一条
 *   warning），其余字段照常生效；
 * - 判定是纯函数（无副作用、不碰 IO），在 `sendToChat` 的统一出站闸门里跑；
 *   B 档只在「该聊天启用协议」时才调用解析器，未启用时一行代码都不走（零行为
 *   变化）；留痕（日志 / trace / 今日计数 / 活动记录）由调用方负责；
 * - 这里只放**纯函数与常量**，不依赖 bridge / companion。
 * @module dsh-qq-companion/output-protocol
 */
import { sanitizeMessageId } from './chat.js';
/** 「这次不发」标记：主动聊天与群聊旁观沿用（guide 文案与旧行为都靠它）。 */
export const PASS_MARKER = '[不发]';
/** 触发「不回应」判定的标记词（顺序即匹配优先级）。 */
export const PASS_TOKENS = ['不回', '不发'];
/** 原因长度上限（字，按码点数；超出截断并补「…」，总长仍不超过上限）。 */
export const PASS_REASON_MAX_CHARS = 80;
/** 标记允许的成对括号（开 → 闭）。 */
const BRACKETS = { '[': ']', '【': '】', '（': '）', '(': ')' };
/** 收尾装饰：空白与中英文句末标点（「不回。」「（不发）！」都算整条标记）。 */
const TRAILING_DECOR = /[\s\u3000。．.!！?？~～,，、;；]+$/u;
/** 去掉尾部的空白与句末标点（`stripTrailing('不回。') === '不回'`）。 */
function stripTrailing(text) {
    let out = text;
    // 一次 replace 只吃一段（如「。 」），循环到不再变化为止。
    while (TRAILING_DECOR.test(out)) {
        const next = out.replace(TRAILING_DECOR, '');
        if (next === out)
            break;
        out = next;
    }
    return out;
}
/**
 * 清洗「不回」的原因：去首尾空白、换行折叠成空格、连续空白合并成一个，
 * 超过 {@link PASS_REASON_MAX_CHARS} 字截断并补「…」。
 * @param text - 原始原因文本。
 * @returns 一条单行、定长的原因（可能为 ''）。
 */
export function cleanPassReason(text) {
    const collapsed = String(text ?? '').replace(/[\s\u3000]+/gu, ' ').trim();
    const chars = Array.from(collapsed);
    if (chars.length <= PASS_REASON_MAX_CHARS)
        return collapsed;
    return chars.slice(0, PASS_REASON_MAX_CHARS - 1).join('') + '…';
}
/**
 * 识别「整条回复就是一个不回应标记」。容忍前后空白、全角/半角括号、全角/半角
 * 冒号、句末标点。
 *
 * 支持的形式（`⊂⊃` 表示括号可有可无，`：` 表示半角或全角冒号）：
 * - `不回` / `[不回]` / `【不回】` / `（不回）` / `(不回)。`
 * - `不回:原因` / `[不回:原因]` / `[不回：原因]`
 * - `[不发]` / `不发` / `（不发）`（旧标记，原因留空；`[不发:原因]` 也认）
 *
 * **不触发**（原样返回，body = 入参）：正文里提到「不回」二字、正文里提到
 * `[不发]` 当例子、标记后面还跟着正文、标记后面跟着别的字（`不回你消息`）。
 * @param text - 模型产出的回复文本（已经剥掉引用标记的正文）。
 * @returns pass / reason / body（见 {@link ReplyPassResult}）。
 */
export function parseReplyPass(text) {
    const miss = { pass: false, reason: '', body: text };
    if (typeof text !== 'string')
        return miss;
    let rest = text.trim();
    if (rest === '')
        return miss;
    // ① 成对括号包裹的形式：[不回] 【不回：原因】 （不发）。括号不成对就不是标记。
    const closer = BRACKETS[rest.charAt(0)];
    if (closer !== undefined) {
        rest = stripTrailing(rest.slice(1).trim());
        if (!rest.endsWith(closer))
            return miss;
        rest = rest.slice(0, -1).trim();
    }
    // ② 标记词必须紧跟在（括号内的）开头。
    const token = PASS_TOKENS.find(candidate => rest.startsWith(candidate));
    if (token === undefined)
        return miss;
    // ③ 标记后面只允许「：原因」或空白 / 句末标点——多出正文就不算标记。
    const afterTrimmed = rest.slice(token.length).trim();
    if (afterTrimmed === '')
        return { pass: true, reason: '', body: '' };
    if (/^[:：]/u.test(afterTrimmed)) {
        return { pass: true, reason: cleanPassReason(afterTrimmed.slice(1)), body: '' };
    }
    if (stripTrailing(afterTrimmed) === '')
        return { pass: true, reason: '', body: '' };
    return miss;
}
// ────────────────────────── B 档：正文最后一行的控制块 ──────────────────────────
/** 控制块的行首标记（提示词里给模型的写法就是这个）。 */
export const CONTROL_BLOCK_PREFIX = '【控制】';
/** why 字段的字数上限（按码点数；超出截断并补「…」，总长仍不超过上限）。 */
export const CONTROL_WHY_MAX_CHARS = 40;
/** send 字段最多几条（超出的丢弃）。 */
export const CONTROL_SEND_MAX_PARTS = 9;
/** send 每条的字符上限（按码点数；超出截断并补「…」）。 */
export const CONTROL_SEND_PART_MAX_CHARS = 500;
/** voice 字段在 v1 不支持的提示（解析器的 warning 与调用方的 debug 日志共用一句）。 */
export const CONTROL_VOICE_IGNORED = 'v1 不支持 voice 字段，已忽略';
/**
 * 控制块行首：容忍全角/半角方括号与圆括号、括号内外的空白。
 * 整行必须是「前缀 + 其余」（其余部分即 JSON 文本）。
 */
const CONTROL_LINE = /^[\s\u3000]*[【[（(][\s\u3000]*控制[\s\u3000]*[】\]）)][\s\u3000]*(.*)$/u;
/** 码点截断（超出补「…」，总长仍不超过 max）。 */
function clipChars(text, max) {
    const chars = Array.from(text);
    if (chars.length <= max)
        return { text, clipped: false };
    return { text: chars.slice(0, Math.max(0, max - 1)).join('') + '…', clipped: true };
}
/** warning 去重追加（同一句话只说一次）。 */
function note(warnings, message) {
    if (!warnings.includes(message))
        warnings.push(message);
}
/**
 * 拆出「最后一行」（容忍行尾空白与多个空行），返回它之前的正文与该行。
 * 没有内容 / 只有空白时返回 null。
 */
function splitLastLine(text) {
    const trimmed = text.replace(/[\s\u3000]+$/u, '');
    if (trimmed === '')
        return null;
    const at = trimmed.lastIndexOf('\n');
    if (at < 0)
        return { before: '', line: trimmed };
    return { before: trimmed.slice(0, at).replace(/[\s\u3000]+$/u, ''), line: trimmed.slice(at + 1) };
}
/** 清洗 why：去空白合并成单行，超过 {@link CONTROL_WHY_MAX_CHARS} 字截断补「…」。 */
export function cleanControlWhy(text) {
    const collapsed = String(text ?? '').replace(/[\s\u3000]+/gu, ' ').trim();
    return clipChars(collapsed, CONTROL_WHY_MAX_CHARS);
}
/** 清洗 quote：与 {@link sanitizeMessageId} 同一套白名单（数字/字母/连字符，≤64）。 */
export function cleanControlQuote(text) {
    return sanitizeMessageId(String(text ?? ''));
}
/**
 * 清洗 send：逐项去首尾空白、丢空项、最多 {@link CONTROL_SEND_MAX_PARTS} 条、
 * 每条最多 {@link CONTROL_SEND_PART_MAX_CHARS} 字（超出截断补「…」）。
 */
export function cleanControlSend(items) {
    const parts = [];
    let clippedPart = false;
    for (const item of items) {
        const trimmed = String(item ?? '').replace(/^[\s\u3000]+|[\s\u3000]+$/gu, '');
        if (trimmed === '')
            continue;
        const clipped = clipChars(trimmed, CONTROL_SEND_PART_MAX_CHARS);
        if (clipped.clipped)
            clippedPart = true;
        parts.push(clipped.text);
    }
    const clippedCount = parts.length > CONTROL_SEND_MAX_PARTS;
    return { parts: parts.slice(0, CONTROL_SEND_MAX_PARTS), clippedPart, clippedCount };
}
/**
 * 解析正文**最后一行**的控制块（B 档）。
 *
 * 只认最后一行：该行以「【控制】」开头（容忍全角/半角括号与括号内外空白），
 * 其后必须是一段语法合法的 JSON 对象。字段全部容错：
 * - 单个字段类型不对 → 丢该字段 + 一条 warning，其余字段照常生效；
 * - JSON 语法错 / 不是对象 → `error` 有值、`control` 缺席、**body = 入参原样**
 *   （绝不吞消息：那一段会原样发给对方，提示词里也这么警告模型）；
 * - `voice` 识别出来但不支持：只产出一条 {@link CONTROL_VOICE_IGNORED} warning。
 *
 * 纯函数、无副作用：日志 / 计数 / trace 由调用方按 `error` / `warnings` 决定。
 * @param text - 模型产出的回复文本（已剥掉行首引用标记）。
 * @returns body / control / error / warnings（见 {@link ParseControlBlockResult}）。
 */
export function parseControlBlock(text) {
    if (typeof text !== 'string')
        return { body: text };
    const split = splitLastLine(text);
    if (split === null)
        return { body: text };
    const matched = CONTROL_LINE.exec(split.line);
    if (matched === null)
        return { body: text };
    const raw = (matched[1] ?? '').trim();
    const fail = (error) => ({ body: text, error });
    if (raw === '')
        return fail('【控制】后面没有 JSON');
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return fail('控制块的 JSON 语法有错');
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return fail('控制块不是 JSON 对象');
    }
    const source = parsed;
    const control = {};
    const warnings = [];
    if (Object.hasOwn(source, 'reply')) {
        if (typeof source.reply === 'boolean')
            control.reply = source.reply;
        else
            note(warnings, '控制块的 reply 字段类型不对（应为 true/false），已丢弃该字段');
    }
    if (Object.hasOwn(source, 'why')) {
        if (typeof source.why === 'string') {
            const why = cleanControlWhy(source.why);
            if (why.clipped)
                note(warnings, '控制块的 why 超过 ' + CONTROL_WHY_MAX_CHARS + ' 字，已截断');
            if (why.text !== '')
                control.why = why.text;
        }
        else {
            note(warnings, '控制块的 why 字段类型不对（应为字符串），已丢弃该字段');
        }
    }
    if (Object.hasOwn(source, 'send')) {
        const rawSend = source.send;
        if (Array.isArray(rawSend)) {
            const strings = rawSend.filter((item) => typeof item === 'string');
            if (strings.length !== rawSend.length)
                note(warnings, '控制块的 send 里有非字符串项，已丢弃');
            const cleaned = cleanControlSend(strings);
            if (cleaned.clippedPart)
                note(warnings, '控制块的 send 有单条超过 ' + CONTROL_SEND_PART_MAX_CHARS + ' 字，已截断');
            if (cleaned.clippedCount)
                note(warnings, '控制块的 send 超过 ' + CONTROL_SEND_MAX_PARTS + ' 条，已只保留前 ' + CONTROL_SEND_MAX_PARTS + ' 条');
            // 清空后为空 = 没有分条要求：整个字段丢掉（否则会把正文也一起吞掉）。
            if (cleaned.parts.length > 0)
                control.send = cleaned.parts;
        }
        else {
            note(warnings, '控制块的 send 字段类型不对（应为字符串数组），已丢弃该字段');
        }
    }
    if (Object.hasOwn(source, 'quote')) {
        const rawQuote = source.quote;
        if (typeof rawQuote === 'string') {
            const quote = cleanControlQuote(rawQuote);
            if (quote !== '')
                control.quote = quote;
            else
                note(warnings, '控制块的 quote 清洗后为空，已丢弃该字段');
        }
        else {
            note(warnings, '控制块的 quote 字段类型不对（应为消息 id 字符串），已丢弃该字段');
        }
    }
    if (Object.hasOwn(source, 'voice')) {
        // v1 明确不支持：识别出来只用一条 debug 提示，绝不因为模型写了它就整体失败。
        note(warnings, CONTROL_VOICE_IGNORED);
    }
    return warnings.length > 0 ? { body: split.before, control, warnings } : { body: split.before, control };
}
