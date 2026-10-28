/**
 * 定时任务表（scheduledPrompts）的校验测试（T25）。
 *
 * 两层：
 *   ① 纯模块 `src/scheduled-prompts.ts`：规范化、宽松读取、严格校验、默认 id；
 *   ② 保存路径 `updateSettings`：合法的对象数组能写进 patch，坏行则整次拒绝且不落盘。
 *
 * 规则只有一份（设置页与 host 共用），所以这里同时锁住「页面放过、后端拒了」这类裂缝。
 *
 * @module dsh-qq-companion-pro/tests/scheduled-prompts
 */
import { describe, expect, it } from 'vitest'

import {
  emptyScheduledPrompt,
  nextScheduleId,
  normalizeScheduledPrompt,
  scheduledPromptEntriesOf,
  validateScheduledPrompts,
} from '../src/scheduled-prompts.js'
import { createRevisionState, ENTRY_ID, updateSettings } from '../src/settings-remote.js'

const VALID = { id: 'p1', time: '09:00', chatId: 'private:10001', prompt: '写日记' }

describe('normalizeScheduledPrompt：一条记录 → 规范条目', () => {
  it('补齐两个布尔、丢掉未知字段', () => {
    expect(normalizeScheduledPrompt(Object.assign({ extra: 'x' }, VALID))).toEqual({
      id: 'p1', time: '09:00', chatId: 'private:10001', prompt: '写日记', includeTodayLog: false, includeGroupLogs: false,
    })
  })

  it('trim 文本字段', () => {
    expect(normalizeScheduledPrompt({ id: ' p1 ', time: ' 09:00 ', chatId: ' private:10001 ', prompt: ' 写日记 ' })?.prompt).toBe('写日记')
  })

  it('格式不对的一律 undefined（时间/前缀/空内容/非对象）', () => {
    expect(normalizeScheduledPrompt(Object.assign({}, VALID, { time: '9:5' }))).toBeUndefined()
    expect(normalizeScheduledPrompt(Object.assign({}, VALID, { time: '24:00' }))).toBeUndefined()
    expect(normalizeScheduledPrompt(Object.assign({}, VALID, { chatId: '10001' }))).toBeUndefined()
    expect(normalizeScheduledPrompt(Object.assign({}, VALID, { prompt: '   ' }))).toBeUndefined()
    expect(normalizeScheduledPrompt(null)).toBeUndefined()
    expect(normalizeScheduledPrompt([VALID])).toBeUndefined()
  })
})

describe('scheduledPromptEntriesOf：宽松读取（草稿/旧快照）', () => {
  it('丢掉修不好的项，保留好项', () => {
    expect(scheduledPromptEntriesOf([VALID, { id: 'x' }])).toHaveLength(1)
    expect(scheduledPromptEntriesOf('not-an-array')).toEqual([])
    expect(scheduledPromptEntriesOf(undefined)).toEqual([])
  })
})

describe('validateScheduledPrompts：严格校验（保存路径）', () => {
  it('全部合法时不报问题，并把布尔归一', () => {
    const checked = validateScheduledPrompts([Object.assign({ includeGroupLogs: true }, VALID)])
    expect(checked.issues).toEqual([])
    expect(checked.entries[0].includeGroupLogs).toBe(true)
    expect(checked.entries[0].includeTodayLog).toBe(false)
  })

  it('非数组、坏时间、坏前缀、空内容都报告位置', () => {
    expect(validateScheduledPrompts({}).issues[0]).toContain('必须是定时任务数组')
    const issues = validateScheduledPrompts([
      Object.assign({}, VALID, { time: '9:5' }),
      Object.assign({}, VALID, { id: 'p2', chatId: 'group:' }),
      Object.assign({}, VALID, { id: 'p3', prompt: '' }),
    ]).issues
    expect(issues).toHaveLength(3)
    expect(issues[0]).toContain('第 1 条')
    expect(issues[0]).toContain('HH:MM')
    expect(issues[1]).toContain('private:<QQ号> 或 group:<群号>')
    expect(issues[2]).toContain('内容不能为空')
  })

  it('重复 id 报告「与前面重复」（都被前面合法条目占用时）', () => {
    const issues = validateScheduledPrompts([VALID, Object.assign({}, VALID, { time: '10:00' })]).issues
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('第 2 条')
    expect(issues[0]).toContain('与前面重复')
  })

  it('布尔字段写错类型也报', () => {
    const issues = validateScheduledPrompts([Object.assign({ includeTodayLog: 'yes' }, VALID)]).issues
    expect(issues[0]).toContain('includeTodayLog 必须是布尔值')
  })
})

describe('id 生成', () => {
  it('顺延到第一个没被占用的 pN', () => {
    expect(nextScheduleId([])).toBe('p1')
    expect(nextScheduleId([{ id: 'p1' }, { id: 'p2' }])).toBe('p3')
    expect(nextScheduleId([{ id: 'p2' }])).toBe('p1')
  })

  it('新条目默认时间为 09:00、内容是空的', () => {
    expect(emptyScheduledPrompt([{ id: 'p1' }])).toEqual({
      id: 'p2', time: '09:00', chatId: '', prompt: '', includeTodayLog: false, includeGroupLogs: false,
    })
  })
})

/** configEditor 最小替身：形状与 tests/settings-remote.spec.ts 的 FakeConfigEditor 一致。 */
class StubEditor {
  rows: Array<{ id: string; config: Record<string, unknown> }> = []
  writeCount = 0
  entry: { options: { id: string; name: string; config: Record<string, unknown> }; fiber: { state: number } }

  constructor(config: Record<string, unknown> = {}) {
    this.entry = { options: { id: ENTRY_ID, name: '/tmp/deploy/dsh-onebot/lib/index.js', config: { ...config } }, fiber: { state: 2 } }
  }

  entries(): unknown[] {
    return [this.entry]
  }

  async edit(
    entry: { options: { id: string; config: Record<string, unknown> } },
    change: (current: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>,
  ): Promise<void> {
    this.writeCount += 1
    const next = change({ ...entry.options.config }, {})
    this.rows = [{ id: entry.options.id, config: structuredClone(next) }]
    entry.options.config = structuredClone(next)
  }
}

describe('保存路径：对象数组能落盘，坏行整体拒绝', () => {
  it('合法的定时任务写进 patch', async () => {
    const editor = new StubEditor()
    const state = createRevisionState()
    const written = await updateSettings(editor as never, state, { scheduledPrompts: [VALID] })
    expect(written).toBeTruthy()
    expect(editor.writeCount).toBe(1)
    expect(editor.rows[0].config.scheduledPrompts).toEqual([
      { id: 'p1', time: '09:00', chatId: 'private:10001', prompt: '写日记', includeTodayLog: false, includeGroupLogs: false },
    ])
  })

  it('坏行让整次保存失败且不写盘', async () => {
    const editor = new StubEditor()
    const state = createRevisionState()
    await expect(updateSettings(editor as never, state, {
      scheduledPrompts: [Object.assign({}, VALID, { time: '9:5' })],
    })).rejects.toThrow(/scheduledPrompts/)
    expect(editor.writeCount).toBe(0)
  })
})
