/**
 * 输出协议（A 档）：她可以决定「这次不回」，而且留下痕迹。
 *
 * 模型用**整条回复只是一个标记**的方式表达「这次不回」：
 * - `[不回]` / `[不回:简短原因]`（半角或全角冒号、方括号或圆括号包裹、前后空白
 *   与句末标点都容忍）；
 * - `[不发]`（主动聊天 / 群聊旁观沿用的旧标记，等价于「不回且没说原因」）。
 *
 * 纪律（协议的核心，别放宽）：
 * - **必须整条只有这个标记**：去掉标记与空白、句末标点之后没有任何内容。正文
 *   中间或结尾出现「不回」二字、把 `[不发]` 当例子提一句、`[不回] 后面还有正文`
 *   都不算标记——否则模型的正常回答会被悄悄吞掉；
 * - 判定是纯函数，在 `sendToChat` 的统一出站闸门里跑，对**所有**出站文本生效
 *   （最终回复、中间消息、超时补发）；留痕（日志 / trace / 今日计数 / 活动记录）
 *   由调用方负责；
 * - 这里只放**纯函数与常量**，不碰 IO、不依赖 bridge / companion，后续行尾控制块
 *   （T9）也放在这里。
 * @module dsh-qq-companion/output-protocol
 */
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
