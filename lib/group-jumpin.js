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
export function createJumpInState() {
    return { unanswered: 0, backoffFrom: 0 };
}
/** 退避基数：她说完第一次没人接，就先安静一分钟。 */
export const JUMP_IN_BASE_MS = 60_000;
export const JUMP_IN_BACKOFF_MAX_MINUTES = 30;
function clampMinutes(raw) {
    const value = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : JUMP_IN_BACKOFF_MAX_MINUTES;
    return Math.max(1, Math.min(180, value));
}
/**
 * 现在还要不要闭嘴：`unanswered === 0` 时随时可以开口；否则要等
 * `base * 2^(unanswered-1)` 分钟过去，上限是配置里的分钟数。
 */
export function jumpInBlocked(state, now, maxMinutes = JUMP_IN_BACKOFF_MAX_MINUTES) {
    if (state.unanswered <= 0)
        return false;
    const cap = clampMinutes(maxMinutes) * 60_000;
    const wait = Math.min(cap, JUMP_IN_BASE_MS * Math.pow(2, Math.max(0, state.unanswered - 1)));
    return now - state.backoffFrom < wait;
}
/** 她主动说了一句：进入下一档退避。 */
export function noteJumpInSpoke(state, now) {
    state.unanswered = Math.min(16, state.unanswered + 1);
    state.backoffFrom = now;
}
/** 有人在群里接着说话了：退避清零。 */
export function noteJumpInAnswered(state) {
    state.unanswered = 0;
    state.backoffFrom = 0;
}
/** 退避还剩多少毫秒（0 = 可以开口）。 */
export function jumpInWaitMs(state, now, maxMinutes = JUMP_IN_BACKOFF_MAX_MINUTES) {
    if (!jumpInBlocked(state, now, maxMinutes))
        return 0;
    const cap = clampMinutes(maxMinutes) * 60_000;
    const wait = Math.min(cap, JUMP_IN_BASE_MS * Math.pow(2, Math.max(0, state.unanswered - 1)));
    return Math.max(0, wait - (now - state.backoffFrom));
}
/**
 * 把背景拼成提示词的一段。
 *
 * 没有这段的时候，判断只能看到孤零零的一句话：明明在聊她、在评价她，也看不出
 * 来，只好瞎猜；而真正无关的闲聊又容易被她当成「在问事」。名字与最近的记录是
 * 判断「关于她」唯一可靠的依据，所以两条都必须给。
 */
export function jumpInBackgroundText(background) {
    const names = background.names.map(name => name.trim()).filter(name => name !== '');
    const head = names.length === 0
        ? '群里没有固定叫你的名字。'
        : '群里叫你：' + names.join('、') + '（有人这么叫，就是在叫你）。';
    return background.recent === '' ? head : head + '\n' + background.recent;
}
/** 自判提示词：先读懂背景，再决定接不接；只回一个词，省 token 也省时间。 */
export const JUMP_IN_INSTRUCTION = [
    '你在一个 QQ 群里，是群友之一。下面这条消息没有 @ 你、也不是在接着你的话。',
    '先看背景（你在群里叫什么、群里最近在聊什么），再判断这条消息要不要你开口。',
    '规则：只输出「接」或「不接」，不要解释，不要标点，不要调用工具。',
    '回「接」的情形：消息在说你、问你、评价你、点名要你表态；在问一件你正好懂或能查到的事；群里冷场或说到点子上，你补一句确实有用的话。',
    '回「不接」的情形：别人互相聊天、和你无关的日常、刷屏玩笑、你看不出在说什么、你接话也只是重复别人。',
    '拿不准就回「不接」。',
].join('\n');
/**
 * 解析自判结果：只有明确说「接」才算接。模型回了别的东西（空、报错文本、
 * 一段解释）一律当「不接」——宁可少说话，也不要刷屏。
 */
export function parseJumpInAnswer(raw) {
    if (typeof raw !== 'string')
        return false;
    const text = raw.trim();
    if (text === '')
        return false;
    if (text.startsWith('不接') || text.startsWith('不'))
        return false;
    return text.startsWith('接');
}
