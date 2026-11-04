/**
 * 群里的「要不要接这句话」与「没人理就退避」。
 *
 * 用户的原话：群内打开「不需要艾特也能回复」之后，回复频率非常高。这里的做法
 * 分两层：
 *
 *  1. 自判：每条「没被叫到、也没接着上文」的群消息，先过一次极短的模型判断
 *     （要不要接 + 半句理由），说要接才真的跑完整回合。判断本身由宿主 subagent
 *     完成，见 src/index.ts 的 jumpInJudgeOf。
 *  2. 社交退避：她主动说了话而没人接，下次开口的间隔就翻倍（1 → 2 → 4 …分钟，
 *     上限由配置给），有人回她就清零恢复。
 *
 * 这个模块只放纯函数与状态类型，不碰时钟也不碰 I/O，方便单测穷举。
 */
/** 一个群自己的退避状态。 */
export interface JumpInState {
    /** 她主动说完话之后，连续几次没有人接着理她。 */
    unanswered: number;
    /** 这一轮退避从什么时候开始算（毫秒时间戳，0 = 没有在退避）。 */
    backoffFrom: number;
}
export declare function createJumpInState(): JumpInState;
/** 退避基数：她说完第一次没人接，就先安静一分钟。 */
export declare const JUMP_IN_BASE_MS = 60000;
export declare const JUMP_IN_BACKOFF_MAX_MINUTES = 30;
/**
 * 现在还要不要闭嘴：`unanswered === 0` 时随时可以开口；否则要等
 * `base * 2^(unanswered-1)` 分钟过去，上限是配置里的分钟数。
 */
export declare function jumpInBlocked(state: JumpInState, now: number, maxMinutes?: number): boolean;
/** 她主动说了一句：进入下一档退避。 */
export declare function noteJumpInSpoke(state: JumpInState, now: number): void;
/** 有人在群里接着说话了：退避清零。 */
export declare function noteJumpInAnswered(state: JumpInState): void;
/** 退避还剩多少毫秒（0 = 可以开口）。 */
export declare function jumpInWaitMs(state: JumpInState, now: number, maxMinutes?: number): number;
/** 自判时给她的背景：她在群里叫什么、群里最近在聊什么。 */
export interface JumpInBackground {
    /** 群里用来叫她的名字与别名（空数组 = 没设）。 */
    names: readonly string[];
    /** 群里最近的聊天记录，已经是 `<group_context>` 块（'' = 没有）。 */
    recent: string;
}
/**
 * 把背景拼成提示词的一段。
 *
 * 没有这段的时候，判断只能看到孤零零的一句话：明明在聊她、在评价她，也看不出
 * 来，只好瞎猜；而真正无关的闲聊又容易被她当成「在问事」。名字与最近的记录是
 * 判断「关于她」唯一可靠的依据，所以两条都必须给。
 */
export declare function jumpInBackgroundText(background: JumpInBackground): string;
/** 自判提示词：先读懂背景，再决定接不接；只回一个词，省 token 也省时间。 */
export declare const JUMP_IN_INSTRUCTION: string;
/**
 * 解析自判结果：只有明确说「接」才算接。模型回了别的东西（空、报错文本、
 * 一段解释）一律当「不接」——宁可少说话，也不要刷屏。
 */
export declare function parseJumpInAnswer(raw: unknown): boolean;
