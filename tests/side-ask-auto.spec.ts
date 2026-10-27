/**
 * 自动旁问（BTW 式侧道）语义回归。
 *
 * 语义定案（用户裁决 2026-10-28）：旁问不是指令，而是忙碌回合的自动行为 ——
 * 当前聊天正在跑任务时又发来的普通纯文字消息，交给一个继承上下文的独立
 * fork 立刻回答，回答作为另一条 QQ 消息发回；主任务完全不受影响（既不
 * steer 也不新开回合）。
 *
 * 边界（与既有 busy 策略的交接）：
 * - 只接纯文字：带媒体 / 引用 / 转发 的消息仍走排队（fork 拿不到附件）。
 * - 只接有资格的人：沿用 autoSteerPolicy 的资格判定（默认 admin），带关系
 *   绸标的非管理员消息任何档都不进侧道，避免拿父会话上下文回答陌生人。
 * - 并发占满或超过 sideAskMaxChars 时不报错，静默退回排队/插话。
 * - 功能默认关闭；没有 fork 适配器时行为与开启前完全一致。
 * - 侧道失败只回一句通用提示：问题正文与宿主错误都不外泄。
 * @module dsh-qq-companion/tests/side-ask-auto
 */
import { describe, expect, it, vi } from 'vitest'

import { QUEUE_NOTICE_TEXT } from '../src/bridge.js'
import { STEER_ACCEPTED_NOTICE } from '../src/commands.js'
import { makeCmdHarness, sentTexts } from './helpers/bridge-harness.js'

/** 把管理员私聊的假 agent 置于运行态（真实宿主中由回合驱动切换）。 */
function setRunning(h: Awaited<ReturnType<typeof makeCmdHarness>>, chatId = 'private:10001'): void {
  const chat = (h as unknown as { chats: Map<string, { agent: { status: string } }> }).chats().get(chatId)
  expect(chat, 'chat 未创建').toBeDefined()
  chat!.agent.status = 'running'
}

describe('自动旁问 — 开启后替换忙碌回合的排队/插话', () => {
  it('运行中收到的纯文本交给 fork：不入队、不插话、无排队提示，回答单独发回', async () => {
    const h = await makeCmdHarness({
      sideAsk: { fork: async () => '这是旁问的回答' },
    })
    h.sendText('启动任务')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    setRunning(h)

    h.sendText('顺手问一句别的')
    await vi.waitFor(() => expect(sentTexts(h.outbound).some(t => t.includes('这是旁问的回答'))).toBe(true))

    // fork 收到的正是这条消息，且主流水线没有被触发
    expect(h.captured.sideAsks).toHaveLength(1)
    expect(h.captured.sideAsks[0]).toContain('顺手问一句别的')
    expect(h.captured.followups).toHaveLength(1) // 不新开回合
    expect(h.captured.steers ?? []).toHaveLength(0) // 不插话
    expect(sentTexts(h.outbound).filter(t => t.includes(QUEUE_NOTICE_TEXT))).toHaveLength(0)
    expect(sentTexts(h.outbound).filter(t => t.includes(STEER_ACCEPTED_NOTICE))).toHaveLength(0)

    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  }, 60_000)

  it('steer 模式下旁问优先：不再作为补充指令插进当前任务', async () => {
    const h = await makeCmdHarness({
      newMessagePolicy: 'steer',
      sideAsk: { fork: async () => '旁问的回答' },
    })
    h.sendText('启动任务')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    setRunning(h)

    h.sendText('这条不该插话')
    await vi.waitFor(() => expect(h.captured.sideAsks).toHaveLength(1))
    expect(h.captured.steers ?? []).toHaveLength(0)
    expect(sentTexts(h.outbound).filter(t => t.includes(STEER_ACCEPTED_NOTICE))).toHaveLength(0)

    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  }, 60_000)

  it('并发占满时静默退回排队：fork 只跑一次、消息照旧入队并给一次排队提示', async () => {
    let release!: (text: string) => void
    const h = await makeCmdHarness({
      sideAsk: {
        concurrency: 1,
        fork: () => new Promise<string>(resolve => { release = resolve }),
      },
    })
    h.sendText('启动任务')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    setRunning(h)

    h.sendText('第一条旁问')
    await vi.waitFor(() => expect(h.captured.sideAsks).toHaveLength(1))

    h.sendText('第二条挤不进去')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(2))
    expect(h.captured.followups[1].text).toContain('第二条挤不进去')
    expect(h.captured.sideAsks).toHaveLength(1) // 没有第二条旁问
    await vi.waitFor(() => expect(sentTexts(h.outbound).some(t => t.includes(QUEUE_NOTICE_TEXT))).toBe(true))

    release('第一条的回答')
    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  }, 60_000)

  it('超过 sideAskMaxChars 的消息不进侧道，仍按排队处理', async () => {
    const h = await makeCmdHarness({
      sideAsk: { maxChars: 4, fork: async () => '不该出现' },
    })
    h.sendText('启动任务')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    setRunning(h)

    h.sendText('这条明显超过四个字')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(2))
    expect(h.captured.sideAsks).toHaveLength(0)

    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  }, 60_000)

  it('fork 失败只回通用提示：问题正文与宿主错误都不外泄', async () => {
    const h = await makeCmdHarness({
      sideAsk: { fork: async () => { throw new Error('host exploded: secret-detail') } },
    })
    h.sendText('启动任务')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    setRunning(h)

    h.sendText('别把我的问题回显出去')
    await vi.waitFor(() => expect(sentTexts(h.outbound).some(t => t.includes('旁问没能回答'))).toBe(true))
    const all = sentTexts(h.outbound).join('\n')
    expect(all).not.toContain('secret-detail')
    expect(all).not.toContain('别把我的问题回显出去')

    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  }, 60_000)
})

describe('自动旁问 — 关闭时行为逐字不变', () => {
  it('sideAskEnabled=false（即使宿主给了 fork）仍走排队', async () => {
    const h = await makeCmdHarness({
      sideAsk: { enabled: false, fork: async () => '不该出现' },
    })
    h.sendText('启动任务')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    setRunning(h)

    h.sendText('照旧排队')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(2))
    expect(h.captured.sideAsks).toHaveLength(0)
    await vi.waitFor(() => expect(sentTexts(h.outbound).some(t => t.includes(QUEUE_NOTICE_TEXT))).toBe(true))

    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  }, 60_000)

  it('没有 fork 适配器时开启也不报错，行为与关闭一致', async () => {
    const h = await makeCmdHarness() // 无 sideAsk = 无 fork
    h.sendText('启动任务')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    setRunning(h)

    h.sendText('照旧排队')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(2))
    expect(h.captured.sideAsks).toHaveLength(0)

    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  }, 60_000)
})

describe('自动旁问 — 资格与消息形态限制', () => {
  it('关系绸标下的非管理员消息不进侧道（不拿父会话上下文回答陌生人）', async () => {
    const h = await makeCmdHarness({
      restrictedMemberPrefix: true,
      sideAsk: { fork: async () => '不该出现' },
    })
    // 群成员先建立群会话，再进入运行态
    h.sendGroupTextAs('发起群任务', 20003)
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    setRunning(h, 'group:888')

    h.sendGroupTextAs('受限成员的问题', 20003)
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(2))
    expect(h.captured.sideAsks).toHaveLength(0)

    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  }, 60_000)

  it('带媒体的消息不进侧道（fork 拿不到附件），仍排队', async () => {
    const h = await makeCmdHarness({ sideAsk: { fork: async () => '不该出现' } })
    h.sendText('启动任务')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    setRunning(h)

    h.client.send(JSON.stringify({
      post_type: 'message', message_type: 'private', user_id: 10001, self_id: 10002,
      message: [{ type: 'image', data: { file: 'https://example.invalid/a.png', sub_type: 0, url: 'https://example.invalid/a.png' } }],
      raw_message: '[CQ:image,file=https://example.invalid/a.png]',
      sender: { user_id: 10001, nickname: '小明' },
    }))
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(2))
    expect(h.captured.sideAsks).toHaveLength(0)

    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  }, 60_000)
})
