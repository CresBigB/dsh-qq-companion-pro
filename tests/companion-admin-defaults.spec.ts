/**
 * an admin's private chat defaults to config.adminPreset and
 * each NEW admin private session gets config.adminPermission; other sessions —
 * non-admin private chats and every group chat — default to config.agentPreset
 * and are switched to config.memberPermission when that is set (empty = the
 * host default, i.e. the old behavior).
 * @module dsh-qq-companion/tests/companion-admin-defaults
 */
import { describe, expect, it, vi } from 'vitest'

import { makeCmdHarness } from './helpers/bridge-harness.js'

function makePresets() {
  const resolve = vi.fn(async (id?: string) => ({ id: id ?? 'standard' }))
  const mount = vi.fn(async (_agentCtx: unknown, id?: string) => ({ id: id ?? 'standard' }))
  return { defaultId: 'standard', resolve, mount }
}

function makeCommands() {
  const lines: string[] = []
  const execute = vi.fn(async (_agent: unknown, line: string) => {
    lines.push(line)
    return { commandId: 'cmd-test', result: { kind: 'success', text: 'ok' } }
  })
  return { commands: { execute }, lines }
}

describe('admin private-chat defaults', () => {
  it('an admin private chat gets adminPreset and the adminPermission switch on creation', async () => {
    const presets = makePresets()
    const { commands, lines } = makeCommands()
    const h = await makeCmdHarness({ agentPresets: presets, commands, adminPreset: 'companion', adminPermission: 'danger-full-access' })
    h.sendText('你好')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    expect(h.capturedMeta[0].agentPreset).toBe('companion')
    expect(presets.mount).toHaveBeenLastCalledWith(expect.anything(), 'companion')
    expect(lines).toEqual(['/permission danger-full-access'])

    // /new re-creates the session: the defaults apply again.
    h.sendText('/new')
    await vi.waitFor(() => expect(h.chats().has('private:10001')).toBe(false))
    h.sendText('再来')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(2))
    expect(h.capturedMeta[1].agentPreset).toBe('companion')
    expect(lines.filter(l => l.startsWith('/permission'))).toEqual(['/permission danger-full-access', '/permission danger-full-access'])

    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  })

  it('a /preset override still wins over adminPreset', async () => {
    const presets = makePresets()
    const { commands } = makeCommands()
    const h = await makeCmdHarness({ agentPresets: presets, commands, adminPreset: 'companion' })
    h.sendText('/preset standard')
    await vi.waitFor(() => {
      expect(h.outbound.some(f => JSON.stringify(f.params).includes('预设已切换：standard'))).toBe(true)
    })
    h.sendText('你好')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    expect(h.capturedMeta.at(-1)?.agentPreset).toBe('standard')
    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  })

  it('group chats without memberPermission keep agentPreset and get no permission switch, even for the admin', async () => {
    const presets = makePresets()
    const { commands, lines } = makeCommands()
    const h = await makeCmdHarness({ agentPresets: presets, commands, adminPreset: 'companion', adminPermission: 'danger-full-access' })
    h.sendGroupTextAs('大家好', 10001)
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    expect(h.capturedMeta[0].agentPreset).toBe('standard')
    expect(lines).toEqual([])
    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  })

  it('without the new config keys the behavior is unchanged', async () => {
    const presets = makePresets()
    const { commands, lines } = makeCommands()
    const h = await makeCmdHarness({ agentPresets: presets, commands })
    h.sendText('你好')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    expect(h.capturedMeta[0].agentPreset).toBe('standard')
    expect(lines).toEqual([])
    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  })
})

describe('memberPermission（非管理员会话收口）', () => {
  it('non-admin private and group sessions each get /permission <memberPermission> on creation; the admin in a group reuses that group session', async () => {
    const presets = makePresets()
    const { commands, lines } = makeCommands()
    const h = await makeCmdHarness({ agentPresets: presets, commands, memberPermission: 'read-only', allowAllUsers: true })
    // 非管理员私聊：新会话切到 memberPermission
    h.sendTextAs('你好', 20003)
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    expect(lines).toEqual(['/permission read-only'])

    // 群聊：新会话同样切到 memberPermission
    h.sendGroupTextAs('大家好', 20003)
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(2))
    expect(lines).toEqual(['/permission read-only', '/permission read-only'])

    // 一个群只有一个会话：管理员在群里发言不会再切一次（也不会用 adminPermission）
    h.sendGroupTextAs('管理员也说话', 10001)
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(3))
    expect(lines).toEqual(['/permission read-only', '/permission read-only'])

    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  })

  it('an admin private chat still uses adminPermission and never memberPermission', async () => {
    const presets = makePresets()
    const { commands, lines } = makeCommands()
    const h = await makeCmdHarness({ agentPresets: presets, commands, adminPermission: 'danger-full-access', memberPermission: 'read-only' })
    h.sendText('你好')
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    expect(lines).toEqual(['/permission danger-full-access'])
    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  })

  it('an empty memberPermission leaves the host default untouched (private member + group)', async () => {
    const presets = makePresets()
    const { commands, lines } = makeCommands()
    const h = await makeCmdHarness({ agentPresets: presets, commands, allowAllUsers: true })
    h.sendTextAs('你好', 20003)
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    h.sendGroupTextAs('大家好', 20003)
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(2))
    expect(lines).toEqual([])
    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  })

  it('a failing switch only logs a warning and the message still gets through', async () => {
    const presets = makePresets()
    const warns: string[] = []
    const execute = vi.fn(async () => { throw new Error('boom') })
    const h = await makeCmdHarness({
      agentPresets: presets, commands: { execute }, memberPermission: 'read-only', allowAllUsers: true,
      log: (level, message) => { if (level === 'warn') warns.push(message) },
    })
    h.sendTextAs('你好', 20003)
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
    expect(warns.some(message => message.includes('member permission default apply failed'))).toBe(true)
    expect(execute).toHaveBeenCalledWith(expect.anything(), '/permission read-only', [], expect.anything())
    h.client.close()
    await h.bridge.stop()
    await h.connection.stop()
  })

  it('a resumed session does not apply the switch again', async () => {
    const { mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const mediaDir = mkdtempSync(join(tmpdir(), 'member-perm-resume-'))
    const h1 = await makeCmdHarness({ agentPresets: makePresets(), commands: makeCommands().commands, memberPermission: 'read-only', allowAllUsers: true, mediaDir })
    h1.sendTextAs('你好', 20003)
    await vi.waitFor(() => expect(h1.captured.followups).toHaveLength(1))
    const firstSession = h1.sessionIds[0]
    h1.client.close()
    await h1.bridge.stop()
    await h1.connection.stop()

    // 重启：旧会话被 resume（不是新建），所以不再切权限
    const { commands, lines } = makeCommands()
    const h2 = await makeCmdHarness({ agentPresets: makePresets(), commands, memberPermission: 'read-only', allowAllUsers: true, mediaDir, resumeOk: true })
    await vi.waitFor(() => expect(h2.chats().has('private:20003')).toBe(true))
    h2.sendTextAs('重启后第一条', 20003)
    await vi.waitFor(() => expect(h2.captured.followups).toHaveLength(1))
    expect(h2.sessionIds).toEqual([firstSession])
    expect(lines).toEqual([])
    h2.client.close()
    await h2.bridge.stop()
    await h2.connection.stop()
  })
})

describe('/preset override persistence', () => {
  it('a /preset choice survives a restart', async () => {
    const { mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const mediaDir = mkdtempSync(join(tmpdir(), 'preset-persist-'))
    const presets = makePresets()
    const h1 = await makeCmdHarness({ agentPresets: presets, mediaDir })
    h1.sendText('/preset standard-2')
    await vi.waitFor(() => {
      expect(h1.outbound.some(f => JSON.stringify(f.params).includes('预设已切换：standard-2'))).toBe(true)
    })
    await new Promise(resolve => setTimeout(resolve, 100))
    h1.client.close()
    await h1.bridge.stop()
    await h1.connection.stop()

    const h2 = await makeCmdHarness({ agentPresets: makePresets(), mediaDir })
    h2.sendText('你好')
    await vi.waitFor(() => expect(h2.captured.followups).toHaveLength(1))
    expect(h2.capturedMeta[0].agentPreset).toBe('standard-2')
    h2.client.close()
    await h2.bridge.stop()
    await h2.connection.stop()
  })
})
