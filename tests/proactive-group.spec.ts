/**
 * 群聊里的主动聊天：文案走群的口吻，回合身份是群友（不是管理员，因此不能改
 * 文件），群不在白名单里或这个群正忙时直接跳过而不是硬塞一句。
 * @module dsh-qq-companion/tests/proactive-group
 */
import { describe, expect, it, vi } from 'vitest'

import { admitUserMessage, makeCmdHarness } from './helpers/bridge-harness.js'

const GROUP = '888'
const context = { time: '12:00', unanswered: 1, lastUserAt: undefined }

describe('群聊主动聊天', () => {
  it('用群友身份说话，文案是群的口吻', async () => {
    const h = await makeCmdHarness()
    h.sendGroupTextAs('先建个会话', 10003)
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    const sessionId = h.captured.followups[0]!.sessionId
    await vi.waitFor(() => expect(h.chats().get('group:' + GROUP)?.busy).toBe(false))

    await h.bridge.fireGroupCheckin(GROUP, context)
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(2))
    const text = h.captured.followups[1]!.text
    expect(text).toContain('这条不是群成员发的')
    expect(text).toContain('群里最近没有人跟你说话')
    expect(text).toContain('不发')
    expect(text).not.toContain('不是管理员发的')

    // 宿主真的把这条 dispatch 当用户输入接纳之后，它是群友回合，改不了文件。
    admitUserMessage(h, sessionId)
    expect(h.bridge.canEditFiles(sessionId)).toBe(false)

    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  })

  it('管理员私聊的主动聊天仍然是管理员回合（对照组）', async () => {
    const h = await makeCmdHarness()
    h.sendText('早')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    const sessionId = h.captured.followups[0]!.sessionId
    await vi.waitFor(() => expect(h.chats().get('private:10001')?.busy).toBe(false))

    await h.bridge.fireCheckin('private:10001', context)
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(2))
    expect(h.captured.followups[1]!.text).toContain('这条不是')

    admitUserMessage(h, sessionId)
    expect(h.bridge.canEditFiles(sessionId)).toBe(true)

    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  })

  it('群不在白名单里就不叫醒', async () => {
    const h = await makeCmdHarness({ groupPolicy: 'allowlist', groupAllowFrom: ['999'] })
    await h.bridge.fireGroupCheckin(GROUP, context)
    expect(h.captured.followups).toHaveLength(0)

    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  })

  it('这个群正忙时跳过', async () => {
    const h = await makeCmdHarness()
    h.sendGroupTextAs('先建个会话', 10003)
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    await vi.waitFor(() => expect(h.chats().get('group:' + GROUP)?.busy).toBe(false))
    const chat = h.chats().get('group:' + GROUP)
    if (chat === undefined) throw new Error('群会话没建起来')
    chat.busy = true

    await h.bridge.fireGroupCheckin(GROUP, context)
    expect(h.captured.followups).toHaveLength(1)

    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  })
})
