/**
 * The global group-context count (T35): every turn she takes in a group — a
 * call, a follow-up, a look, a group check-in she starts herself — carries the
 * newest N lines of the group's chatter, and the same tail is shown again on
 * the next turn instead of "only what is new".
 * @module dsh-qq-companion/tests/group-context-attach
 */
import { describe, expect, it, vi } from 'vitest'

import { GroupChatter, type GroupChatterConfig } from '../src/companion/index.js'

import { makeCmdHarness } from './helpers/bridge-harness.js'

const chatterConfig = (contextLines: number): GroupChatterConfig => ({
  contextLines,
  names: [],
  followupSeconds: 0,
  peekEnabled: true,
  peekGapMinutes: 30,
  peekMinMessages: 2,
  peekQuietMinutes: 0,
  peekWindowStart: '00:00',
  peekWindowEnd: '24:00',
})

const close = async (h: Awaited<ReturnType<typeof makeCmdHarness>>): Promise<void> => {
  h.client.close()
  await h.bridge.stop()
  await h.connection.stop()
}

describe('group context on every group turn', () => {
  it('rides along a mention turn and comes back on the next one', async () => {
    const h = await makeCmdHarness({ requireMention: true, groupChatter: new GroupChatter({ config: chatterConfig(5) }) })
    h.sendPlainGroupTextAs('今天吃啥', 20003)
    h.sendPlainGroupTextAs('火锅', 20004)
    await new Promise(resolve => setTimeout(resolve, 120))
    expect(h.captured.followups).toHaveLength(0)

    h.sendGroupTextAs('你们聊什么呢', 20005)
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    const first = h.captured.followups[0].text
    expect(first).toContain('<group_context>')
    const firstBlock = first.slice(first.indexOf('<group_context>'))
    expect(firstBlock).toContain('今天吃啥')
    expect(firstBlock).toContain('火锅')
    expect(firstBlock).not.toContain('你们聊什么呢') // the calling message rides the turn, not the context

    h.sendGroupTextAs('那我也问一句', 20006)
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(2))
    const second = h.captured.followups[1].text
    const secondBlock = second.slice(second.indexOf('<group_context>'))
    expect(secondBlock).toContain('今天吃啥') // same tail, not "only what is new"
    expect(secondBlock).toContain('你们聊什么呢') // the previous turn is part of the group's tail now
    expect(secondBlock).not.toContain('那我也问一句')
    await close(h)
  })

  it('rides along a look at the group', async () => {
    const h = await makeCmdHarness({ requireMention: true, groupChatter: new GroupChatter({ config: chatterConfig(5) }) })
    h.sendPlainGroupTextAs('甲说了一句', 20003)
    h.sendPlainGroupTextAs('乙也说了一句', 20004)
    await new Promise(resolve => setTimeout(resolve, 120))
    await h.bridge.firePeek('888')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    const text = h.captured.followups[0].text
    expect(text).toContain('看一眼群聊')
    expect(text).toContain('<group_context>')
    expect(text).toContain('甲说了一句')
    expect(text).toContain('乙也说了一句')
    await close(h)
  })

  it('rides along a group check-in she starts herself', async () => {
    const h = await makeCmdHarness({ requireMention: true, groupChatter: new GroupChatter({ config: chatterConfig(5) }) })
    h.sendPlainGroupTextAs('今天好安静', 20003)
    await new Promise(resolve => setTimeout(resolve, 120))
    await h.bridge.fireGroupCheckin('888', { time: '12:00', unanswered: 0, lastUserAt: undefined })
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    const text = h.captured.followups[0].text
    expect(text).toContain('<group_context>')
    expect(text).toContain('今天好安静')
    await close(h)
  })
})
