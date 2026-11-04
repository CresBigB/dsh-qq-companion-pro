import { describe, expect, it, vi } from 'vitest'
import { makeHarness } from './helpers/bridge-harness.js'

/**
 * T30：群里「没被 @ 到」的回复要先过一道极短的模型自判。这里用 harness 的
 * `jumpIn.judge` 直接控制判词，验证四种情形：
 *   - 判「不接」→ 整条消息被丢掉（不派发、不回话）；
 *   - 判「接」→ 照常派发；
 *   - 被 @ 的消息不经过自判（用户的明确要求：@ 了就必须理）；
 *   - 没接线时退化为旧行为（照常接话）。
 *
 * 用的都是「不需要 @ 也能回复」的群策略：`replyWithoutMention: true` + `replyMode: 'all'`。
 */
const OPEN_POLICY = { replyWithoutMention: true, replyMode: 'all' as const }

describe('群聊自判（T30）', () => {
  it('判为「不接」时不派发、不回话（第二条起才判）', async () => {
    const judge = vi.fn(async () => false)
    const h = await makeHarness({ requireMention: false, groupTriggerPolicy: OPEN_POLICY, jumpIn: { judge } })
    // 第一条：这个群还没有她的会话，宿主要求「活的父 agent」才能开子代理，所以先不判、照常接。
    h.sendPlainGroupTextAs('今天天气不错', 20003)
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    expect(judge).not.toHaveBeenCalled()
    // 第二条：会话已经在了，此时才过自判；判「不接」就不再派发。
    h.sendPlainGroupTextAs('午饭吃什么', 20003)
    await vi.waitFor(() => expect(judge).toHaveBeenCalledTimes(1))
    expect(judge.mock.calls[0]![0]).toContain('午饭吃什么')
    // T36：判断必须拿到背景——群里刚在聊什么（第一条「今天天气不错」），否则它只能
    // 看到一句孤立的话，认不出「在说她」。
    expect(judge.mock.calls[0]![2]).toContain('今天天气不错')
    await new Promise(resolve => setTimeout(resolve, 120))
    expect(h.captured.followups).toHaveLength(1)
    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  })

  it('判为「接」时照常派发，并且把活的父 agent 交给判断', async () => {
    const judge = vi.fn(async () => true)
    const h = await makeHarness({ requireMention: false, groupTriggerPolicy: OPEN_POLICY, jumpIn: { judge } })
    h.sendPlainGroupTextAs('先说一句', 20003)
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    h.sendPlainGroupTextAs('帮我看看这段代码', 20003)
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(2))
    expect(judge).toHaveBeenCalledTimes(1)
    expect(judge.mock.calls[0]![1]).toBeDefined()
    expect(judge.mock.calls[0]![2]).toContain('先说一句')
    expect(h.captured.followups[1]!.text).toContain('帮我看看这段代码')
    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  })

  it('被 @ 的消息不经过自判（@ 了一定理）', async () => {
    const judge = vi.fn(async () => false)
    const h = await makeHarness({ jumpIn: { judge } })
    h.client.send(JSON.stringify({
      post_type: 'message', message_type: 'group', user_id: 20003, group_id: 888, self_id: 10002,
      message: [{ type: 'at', data: { qq: '10002' } }, { type: 'text', data: { text: '在吗' } }],
      raw_message: '[CQ:at,qq=10002]在吗', sender: { user_id: 20003, nickname: '群友' },
    }))
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    expect(judge).not.toHaveBeenCalled()
    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  })

  it('没有接线时保持旧行为：不判、照常接话', async () => {
    const h = await makeHarness({ requireMention: false, groupTriggerPolicy: OPEN_POLICY })
    h.sendPlainGroupTextAs('随便说一句', 20003)
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  })

  it('把「群里怎么叫她」也交给判断（认得出在说她）', async () => {
    const judge = vi.fn(async () => false)
    const h = await makeHarness({
      requireMention: false,
      groupTriggerPolicy: OPEN_POLICY,
      groupNameTriggers: ['小岚'],
      jumpIn: { judge },
    })
    h.sendPlainGroupTextAs('先说一句', 20003)
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    // 这条没出现名字（所以不叫「点名」，仍要走判断），但判断要知道她叫小岚。
    h.sendPlainGroupTextAs('她今天怎么没来', 20003)
    await vi.waitFor(() => expect(judge).toHaveBeenCalledTimes(1))
    expect(judge.mock.calls[0]![2]).toContain('小岚')
    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  })

  it('判断本身抛错时不缝嘴：退回旧行为照常接话', async () => {
    const judge = vi.fn(async () => { throw new Error('host exploded') })
    const h = await makeHarness({ requireMention: false, groupTriggerPolicy: OPEN_POLICY, jumpIn: { judge } })
    h.sendPlainGroupTextAs('这条要不要接', 20003)
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  })
})
