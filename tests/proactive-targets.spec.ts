/**
 * 主动聊天可以同时叫醒好几个聊天：私聊与群聊各有一套自己的计划、今天的
 * 次数与「几条没回就停」，加一个群不会打乱私聊的时间表；旧的单目标状态
 * 文件只在确实只配了一个聊天时才被接管。
 * @module dsh-qq-companion/tests/proactive-targets
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { ChatActivity, ProactiveScheduler, proactiveTargetsOf } from '../src/companion/index.js'

const tmp = () => mkdtempSync(join(tmpdir(), 'proactive-targets-'))
const at = (h: number, m: number, day = 20) => new Date(2026, 9, day, h, m).getTime()
const quiet = () => undefined

/** 09:00–22:00 窗口，每个聊天每天两次、间隔至少 60 分钟。 */
const window2 = {
  windowStart: '09:00', windowEnd: '22:00', minPerDay: 2, maxPerDay: 2,
  minGapMinutes: 60, skipIfActiveMinutes: 30, maxUnanswered: 2,
}
const single = { chatId: 'private:1', ...window2 }
const both = { targets: ['private:1', 'group:888'], ...window2 }

describe('proactiveTargetsOf', () => {
  it('keeps the legacy chatId first, drops blanks and de-duplicates', () => {
    expect(proactiveTargetsOf({ chatId: 'private:1', targets: ['  ', 'private:1', 'group:888', '  group:888  ', 'private:2'] }))
      .toEqual(['private:1', 'group:888', 'private:2'])
    expect(proactiveTargetsOf({ targets: ['group:888'] })).toEqual(['group:888'])
    expect(proactiveTargetsOf({ chatId: '   ', targets: [] })).toEqual([])
  })
})

describe('ProactiveScheduler 多目标', () => {
  it('每个聊天各有一套计划，槽位带聊天标签', async () => {
    const dir = tmp()
    const now = at(8, 0)
    const activity = new ChatActivity({ mediaDir: dir, log: quiet, now: () => now })
    const s = new ProactiveScheduler({ config: both, activity, fire: async () => undefined, log: quiet, now: () => now, random: () => 0 })
    await s.load()
    expect(s.remaining()).toEqual([
      'private:1 09:00', 'private:1 10:00',
      'group:888 09:00', 'group:888 10:00',
    ])
    expect(s.snapshot().firedToday).toBe(0)
  })

  it('一个聊天停止叫醒不影响另一个', async () => {
    const dir = tmp()
    let now = at(8, 0)
    const activity = new ChatActivity({ mediaDir: dir, log: quiet, now: () => now })
    // 她在这个群里已经主动说了三句、没人接：群聊该自己停，私聊照旧。
    activity.record('group:888', 'bot', '一')
    activity.record('group:888', 'bot', '二')
    activity.record('group:888', 'bot', '三')
    const fired: string[] = []
    const s = new ProactiveScheduler({
      config: both, activity, fire: async chatId => { fired.push(chatId) }, log: quiet, now: () => now, random: () => 0,
    })
    await s.load()
    s.remaining() // 08:00 就已经排好今天的时间表
    now = at(9, 0)
    await s.tick()
    expect(fired).toEqual(['private:1'])
    expect(s.remaining()).toEqual(['private:1 10:00'])
    now = at(10, 0)
    await s.tick()
    expect(fired).toEqual(['private:1', 'private:1'])
    expect(s.snapshot().firedToday).toBe(2)
  })

  it('重启后每个聊天的计划与计数都在', async () => {
    const dir = tmp()
    const file = join(dir, 'proactive-state.json')
    let now = at(8, 0)
    const activity = new ChatActivity({ mediaDir: dir, log: quiet, now: () => now })
    const make = (random: () => number) => new ProactiveScheduler({
      config: both, activity, fire: async () => undefined, log: quiet, now: () => now, random, stateFile: file,
    })
    const a = make(() => 0)
    await a.load()
    a.remaining()
    now = at(9, 0)
    await a.tick()
    expect(a.snapshot().firedToday).toBe(2)
    // 状态文件是异步写的，重启前先等它落盘。
    await vi.waitFor(() => expect(readFileSync(file, 'utf8')).toContain('"fired":1'))
    now = at(9, 30)
    const b = make(() => 0.99)
    await b.load()
    expect(b.remaining()).toEqual(['private:1 10:00', 'group:888 10:00'])
    expect(b.snapshot().firedToday).toBe(2)
  })

  it('立即叫醒会走遍每个聊天', async () => {
    const dir = tmp()
    const now = at(8, 0)
    const activity = new ChatActivity({ mediaDir: dir, log: quiet, now: () => now })
    const fired: string[] = []
    const s = new ProactiveScheduler({
      config: both, activity, fire: async chatId => { fired.push(chatId) }, log: quiet, now: () => now, random: () => 0,
    })
    await s.fireNow()
    expect(fired).toEqual(['private:1', 'group:888'])
  })

  it('旧状态文件只在只配了一个聊天时被接管', async () => {
    const dir = tmp()
    const file = join(dir, 'proactive-state.json')
    const now = at(9, 30)
    const activity = new ChatActivity({ mediaDir: dir, log: quiet, now: () => now })
    // 先问出「今天」的日期键，再手写一份旧格式（计划留在根对象上、没有聊天名）。
    const probe = new ProactiveScheduler({
      config: single, activity, fire: async () => undefined, log: quiet, now: () => now, random: () => 0,
      stateFile: join(dir, 'probe.json'),
    })
    probe.remaining()
    writeFileSync(file, JSON.stringify({ day: probe.snapshot().day, plan: [600], fired: 1 }), 'utf8')

    const one = new ProactiveScheduler({
      config: single, activity, fire: async () => undefined, log: quiet, now: () => now, random: () => 0, stateFile: file,
    })
    await one.load()
    expect(one.remaining()).toEqual(['10:00'])
    expect(one.snapshot().firedToday).toBe(1)

    // 配了两个聊天：根上的旧计划没有聊天名，不能被某个聊天认领。
    const two = new ProactiveScheduler({
      config: both, activity, fire: async () => undefined, log: quiet, now: () => now, random: () => 0, stateFile: file,
    })
    await two.load()
    expect(two.snapshot().firedToday).toBe(0)
    expect(two.remaining()).toHaveLength(4)
  })
})
