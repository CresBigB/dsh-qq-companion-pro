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
  unanswered: number
  /** 这一轮退避从什么时候开始算（毫秒时间戳，0 = 没有在退避）。 */
  backoffFrom: number
}

export function createJumpInState(): JumpInState {
  return { unanswered: 0, backoffFrom: 0 }
}

/** 退避基数：她说完第一次没人接，就先安静一分钟。 */
export const JUMP_IN_BASE_MS = 60_000

export const JUMP_IN_BACKOFF_MAX_MINUTES = 30

function clampMinutes(raw: unknown): number {
  const value = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : JUMP_IN_BACKOFF_MAX_MINUTES
  return Math.max(1, Math.min(180, value))
}

/**
 * 现在还要不要闭嘴：`unanswered === 0` 时随时可以开口；否则要等
 * `base * 2^(unanswered-1)` 分钟过去，上限是配置里的分钟数。
 */
export function jumpInBlocked(state: JumpInState, now: number, maxMinutes: number = JUMP_IN_BACKOFF_MAX_MINUTES): boolean {
  if (state.unanswered <= 0) return false
  const cap = clampMinutes(maxMinutes) * 60_000
  const wait = Math.min(cap, JUMP_IN_BASE_MS * Math.pow(2, Math.max(0, state.unanswered - 1)))
  return now - state.backoffFrom < wait
}

/** 她主动说了一句：进入下一档退避。 */
export function noteJumpInSpoke(state: JumpInState, now: number): void {
  state.unanswered = Math.min(16, state.unanswered + 1)
  state.backoffFrom = now
}

/** 有人在群里接着说话了：退避清零。 */
export function noteJumpInAnswered(state: JumpInState): void {
  state.unanswered = 0
  state.backoffFrom = 0
}

/** 退避还剩多少毫秒（0 = 可以开口）。 */
export function jumpInWaitMs(state: JumpInState, now: number, maxMinutes: number = JUMP_IN_BACKOFF_MAX_MINUTES): number {
  if (!jumpInBlocked(state, now, maxMinutes)) return 0
  const cap = clampMinutes(maxMinutes) * 60_000
  const wait = Math.min(cap, JUMP_IN_BASE_MS * Math.pow(2, Math.max(0, state.unanswered - 1)))
  return Math.max(0, wait - (now - state.backoffFrom))
}

/** 自判提示词：只回一个词，省 token 也省时间。 */
export const JUMP_IN_INSTRUCTION = [
  '你在一个 QQ 群里，是群友之一。',
  '下面这条消息没有 @ 你、也不是在接着你的话，你想不想主动接一句？',
  '规则：只输出「接」或「不接」两个词之一，不要解释，不要标点，不要调用工具。',
  '觉得插话有价值（需要你、在问事、正好你懂、气氛合适）就回「接」；',
  '闲聊寒暄、别人互相聊天、刷屏玩笑、你看不出在说什么，一律回「不接」。',
  '',
  '群友的消息：',
].join('\n')

/**
 * 解析自判结果：只有明确说「接」才算接。模型回了别的东西（空、报错文本、
 * 一段解释）一律当「不接」——宁可少说话，也不要刷屏。
 */
export function parseJumpInAnswer(raw: unknown): boolean {
  if (typeof raw !== 'string') return false
  const text = raw.trim()
  if (text === '') return false
  if (text.startsWith('不接') || text.startsWith('不')) return false
  return text.startsWith('接')
}
