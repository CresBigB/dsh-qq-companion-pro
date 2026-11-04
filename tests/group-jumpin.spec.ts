import { describe, expect, it } from 'vitest'
import {
  JUMP_IN_BACKOFF_MAX_MINUTES,
  JUMP_IN_BASE_MS,
  createJumpInState,
  jumpInBackgroundText,
  jumpInBlocked,
  jumpInWaitMs,
  noteJumpInAnswered,
  noteJumpInSpoke,
  parseJumpInAnswer,
} from '../src/group-jumpin.js'

describe('群聊自判的社交退避（T30）', () => {
  it('刚创建的状态随时可以开口', () => {
    const state = createJumpInState()
    expect(jumpInBlocked(state, 0)).toBe(false)
    expect(jumpInWaitMs(state, 0)).toBe(0)
  })

  it('她说完一次没人接：先安静一分钟，之后逐次翻倍', () => {
    const state = createJumpInState()
    noteJumpInSpoke(state, 1_000)
    expect(jumpInBlocked(state, 1_000)).toBe(true)
    expect(jumpInWaitMs(state, 1_000)).toBe(JUMP_IN_BASE_MS)
    // 一分钟过去就能再说
    expect(jumpInBlocked(state, 1_000 + JUMP_IN_BASE_MS)).toBe(false)

    noteJumpInSpoke(state, 2_000)
    expect(jumpInWaitMs(state, 2_000)).toBe(JUMP_IN_BASE_MS * 2)
    noteJumpInSpoke(state, 3_000)
    expect(jumpInWaitMs(state, 3_000)).toBe(JUMP_IN_BASE_MS * 4)
    noteJumpInSpoke(state, 4_000)
    expect(jumpInWaitMs(state, 4_000)).toBe(JUMP_IN_BASE_MS * 8)
  })

  it('封顶在配置的分钟数上，再多次也不超过', () => {
    const state = createJumpInState()
    for (let i = 0; i < 8; i += 1) noteJumpInSpoke(state, 1_000)
    expect(jumpInWaitMs(state, 1_000, 5)).toBe(5 * 60_000)
    expect(jumpInBlocked(state, 1_000 + 5 * 60_000 - 1, 5)).toBe(true)
    expect(jumpInBlocked(state, 1_000 + 5 * 60_000, 5)).toBe(false)
  })

  it('配置的分钟数会被夹到 1–180', () => {
    const state = createJumpInState()
    // 先攒够档数，让「翻倍」本身超过任何上限，才能看出夹取
    for (let i = 0; i < 20; i += 1) noteJumpInSpoke(state, 1_000)
    expect(jumpInWaitMs(state, 1_000, 0)).toBe(60_000) // 小于 1 → 1 分钟
    expect(jumpInWaitMs(state, 1_000, 10_000)).toBe(180 * 60_000) // 大得离谱 → 180 分钟
    expect(jumpInWaitMs(state, 1_000, Number.NaN)).toBe(JUMP_IN_BACKOFF_MAX_MINUTES * 60_000)
  })

  it('有人在群里接着她说话：退避清零，立刻恢复正常', () => {
    const state = createJumpInState()
    noteJumpInSpoke(state, 1_000)
    noteJumpInSpoke(state, 2_000)
    expect(jumpInBlocked(state, 2_000)).toBe(true)
    noteJumpInAnswered(state)
    expect(jumpInBlocked(state, 2_000)).toBe(false)
    expect(state.unanswered).toBe(0)
  })

  it('连续没人接也不会把计数涨到溢出（内部封在 16 档）', () => {
    const state = createJumpInState()
    for (let i = 0; i < 40; i += 1) noteJumpInSpoke(state, 1_000 + i)
    expect(state.unanswered).toBe(16)
  })
})

describe('群聊自判的背景（T36）', () => {
  it('没有名字也没有记录时，只说「没有固定叫你的名字」', () => {
    expect(jumpInBackgroundText({ names: [], recent: '' })).toBe('群里没有固定叫你的名字。')
  })

  it('名字与最近的聊天都拼进去，空名字被忽略', () => {
    const text = jumpInBackgroundText({
      names: ['小岚', '  ', '青岚'],
      recent: '<group_context>\n甲：在吗\n</group_context>',
    })
    expect(text).toContain('小岚、青岚')
    expect(text).toContain('<group_context>')
    expect(text).toContain('甲：在吗')
    // 空字符串名字不能变成「、、」
    expect(text).not.toContain('、、')
  })

  it('只有最近记录时不出现名字那一行', () => {
    const text = jumpInBackgroundText({ names: ['   '], recent: '<group_context>\n乙：睡了\n</group_context>' })
    expect(text.startsWith('群里没有固定叫你的名字。')).toBe(true)
    expect(text).toContain('乙：睡了')
  })
})

describe('群聊自判的回答解析', () => {
  it('只认明确的「接」', () => {
    expect(parseJumpInAnswer('接')).toBe(true)
    expect(parseJumpInAnswer('  接。 ')).toBe(true)
    expect(parseJumpInAnswer('接一句')).toBe(true)
  })

  it('「不接」与任何含糊回答都算不接', () => {
    expect(parseJumpInAnswer('不接')).toBe(false)
    expect(parseJumpInAnswer('不')).toBe(false)
    expect(parseJumpInAnswer('不接，他们在闲聊')).toBe(false)
    expect(parseJumpInAnswer('也许吧')).toBe(false)
    expect(parseJumpInAnswer('')).toBe(false)
    expect(parseJumpInAnswer('   ')).toBe(false)
  })

  it('不是字符串（宿主没有文字输出）也算不接', () => {
    expect(parseJumpInAnswer(undefined)).toBe(false)
    expect(parseJumpInAnswer(null)).toBe(false)
    expect(parseJumpInAnswer(1)).toBe(false)
  })
})
