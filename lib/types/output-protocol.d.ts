/** 「这次不发」标记：主动聊天与群聊旁观沿用（guide 文案与旧行为都靠它）。 */
export declare const PASS_MARKER = "[\u4E0D\u53D1]";
/** 触发「不回应」判定的标记词（顺序即匹配优先级）。 */
export declare const PASS_TOKENS: readonly string[];
/** 原因长度上限（字，按码点数；超出截断并补「…」，总长仍不超过上限）。 */
export declare const PASS_REASON_MAX_CHARS = 80;
/** {@link parseReplyPass} 的结果。 */
export interface ReplyPassResult {
    /** true = 整条回复就是「不回」标记，什么也不发。 */
    pass: boolean;
    /** 她给的原因（已清洗；'' = 没写原因，或写的是 `[不发]`）。 */
    reason: string;
    /** 要发出去的正文：pass 时恒为 ''，否则原样返回入参。 */
    body: string;
}
/**
 * 清洗「不回」的原因：去首尾空白、换行折叠成空格、连续空白合并成一个，
 * 超过 {@link PASS_REASON_MAX_CHARS} 字截断并补「…」。
 * @param text - 原始原因文本。
 * @returns 一条单行、定长的原因（可能为 ''）。
 */
export declare function cleanPassReason(text: string): string;
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
export declare function parseReplyPass(text: string): ReplyPassResult;
/** 控制块的行首标记（提示词里给模型的写法就是这个）。 */
export declare const CONTROL_BLOCK_PREFIX = "\u3010\u63A7\u5236\u3011";
/** why 字段的字数上限（按码点数；超出截断并补「…」，总长仍不超过上限）。 */
export declare const CONTROL_WHY_MAX_CHARS = 40;
/** send 字段最多几条（超出的丢弃）。 */
export declare const CONTROL_SEND_MAX_PARTS = 9;
/** send 每条的字符上限（按码点数；超出截断并补「…」）。 */
export declare const CONTROL_SEND_PART_MAX_CHARS = 500;
/** voice 字段在 v1 不支持的提示（解析器的 warning 与调用方的 debug 日志共用一句）。 */
export declare const CONTROL_VOICE_IGNORED = "v1 \u4E0D\u652F\u6301 voice \u5B57\u6BB5\uFF0C\u5DF2\u5FFD\u7565";
/** 一个解析出来的控制块（只含**v1 真正支持**的字段；voice 永远不在这里）。 */
export interface ControlBlock {
    /** false = 这次不回（正文不发）；缺席 = 没说，按正常回复走。 */
    reply?: boolean;
    /** 不回的原因 / 说明（已清洗：单行、≤40 字）；只落日志与记忆，绝不发 QQ。 */
    why?: string;
    /** 明确要连发的几条（已清洗：去空白、丢空项、≤9 条、每条 ≤500 字）。 */
    send?: string[];
    /** 要引用的消息 id（只保留数字/字母/连字符）。 */
    quote?: string;
}
/** {@link parseControlBlock} 的结果。 */
export interface ParseControlBlockResult {
    /** 要发出去的正文：解析成功 = 控制块之前的内容（尾随空白去掉）；否则 = 入参原样。 */
    body: string;
    /** 解析成功的控制块；`error` 存在时一定缺席（= 整段原样发送）。 */
    control?: ControlBlock;
    /** 有「【控制】」行但不可用时的人类可读原因（此时 body 恒为入参原样）。 */
    error?: string;
    /** 字段级清洗提示（类型不对被丢弃 / voice 被忽略 / 超长被截断）；空 = 没有。 */
    warnings?: string[];
}
/** 清洗 why：去空白合并成单行，超过 {@link CONTROL_WHY_MAX_CHARS} 字截断补「…」。 */
export declare function cleanControlWhy(text: string): {
    text: string;
    clipped: boolean;
};
/** 清洗 quote：与 {@link sanitizeMessageId} 同一套白名单（数字/字母/连字符，≤64）。 */
export declare function cleanControlQuote(text: string): string;
/**
 * 清洗 send：逐项去首尾空白、丢空项、最多 {@link CONTROL_SEND_MAX_PARTS} 条、
 * 每条最多 {@link CONTROL_SEND_PART_MAX_CHARS} 字（超出截断补「…」）。
 */
export declare function cleanControlSend(items: readonly string[]): {
    parts: string[];
    clippedPart: boolean;
    clippedCount: boolean;
};
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
export declare function parseControlBlock(text: string): ParseControlBlockResult;
