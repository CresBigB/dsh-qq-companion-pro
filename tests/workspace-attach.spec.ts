/**
 * Workspace attach: the create/resume attach under the three
 * attachWorkspaceMode values, the manual /workspace attach escape hatch and
 * the /workspace bare-form membership line.
 * @module dsh-qq-companion/tests/workspace-attach
 */
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ChatRegistry } from '../src/registry.js'
import type { RegistryDeps, WorkspaceAttachOutcome } from '../src/registry.js'
import { handleWorkspaceCommand } from '../src/commands/model.js'
import type { CommandContext } from '../src/commands/types.js'

const tmp = (prefix: string): string => mkdtempSync(join(tmpdir(), prefix))

function makeAgent(sessionId: string, cwd: string) {
  return {
    session: { id: sessionId, header: { cwd } },
    status: 'idle' as const,
    whenIdle: async () => undefined,
  }
}

/** Recording agents registry: create/resume hand back a session whose header
 * cwd is whatever the test needs — that is exactly what the attach reads. */
function makeAgents(cwd: string) {
  return {
    create: vi.fn(async (options: { sessionId: string }) => ({
      agent: makeAgent(String(options.sessionId), cwd),
      dispose: vi.fn(async () => undefined),
    })),
    resume: vi.fn(async (options: { resumeSessionId: string }) => ({
      agent: makeAgent(String(options.resumeSessionId), cwd),
      dispose: vi.fn(async () => undefined),
    })),
  }
}

/** Recording workspace registry: only `owned` paths resolve to a workspace. */
function makeWorkspaceRegistry(opts: {
  owned?: string[]
  createThrows?: boolean
  attachThrows?: boolean
} = {}) {
  const attached: Array<{ path: string; sessionId: string }> = []
  const created: Array<{ path: string; title?: string }> = []
  const attachTo = (path: string) => vi.fn(async (sessionId: string) => {
    if (opts.attachThrows === true) throw new Error('attach boom')
    attached.push({ path, sessionId })
  })
  return {
    attached,
    created,
    resolveByPath: vi.fn(async (path: string) => {
      if (!(opts.owned ?? []).includes(path)) return undefined
      return { id: 'ws-' + path, path, sessionIds: [] as string[], attachSession: attachTo(path) }
    }),
    create: vi.fn(async (path: string, title?: string) => {
      if (opts.createThrows === true) throw new Error('create boom')
      created.push({ path, title })
      return { id: 'ws-' + path, path, sessionIds: [] as string[], attachSession: attachTo(path) }
    }),
    // T28: 祖先归入要查 list()，所以 owned 里的路径也要出现在列表里。
    list: vi.fn(() => (opts.owned ?? []).map(path => ({ id: 'ws-' + path, path, sessionIds: [] as string[], attachSession: attachTo(path) }))),
  }
}

/** Minimal RegistryDeps for the attach paths. */
function makeDeps(overrides: {
  cwd: string
  workspaceRegistry?: unknown
  config?: Partial<RegistryDeps['config']>
  mediaDir?: string
  isAdminPrivate?: (chatId: string) => boolean
  log?: (level: 'info' | 'warn' | 'error' | 'debug', message: string) => void
}): RegistryDeps {
  return {
    agents: makeAgents(overrides.cwd) as never,
    sessions: { flush: vi.fn(async () => undefined) } as never,
    sessionPersistence: undefined,
    workspaceRegistry: (overrides.workspaceRegistry ?? undefined) as never,
    agentPresets: undefined,
    defaultModel: undefined,
    config: {
      mediaDir: overrides.mediaDir ?? tmp('onebot-wsa-'),
      workspacePath: '',
      attachWorkspaceMode: 'existing',
      adminWorkspacePath: '',
      groupMemoryDir: '',
      groupMemoryMaxBytes: 8 * 1024,
      agentPreset: '',
      adminPreset: '',
      restrictedMemberPrefix: false,
      maxImageBytes: 8 * 1024 * 1024,
      maxVoiceBytes: 15 * 1024 * 1024,
      maxFileBytes: 20 * 1024 * 1024,
      chatIdleEvictDays: 7,
      groupReasoningEffort: '',
      sessionTitleTemplate: '',
      ...overrides.config,
    },
    log: (level, message) => overrides.log?.(level, message),
    isStopping: () => false,
    onChatRemoved: () => undefined,
    installChannelScope: () => undefined,
    ...(overrides.isAdminPrivate !== undefined ? { isAdminPrivate: overrides.isAdminPrivate } : {}),
  }
}

describe('workspace attach · existing 模式（默认，等于修复前的行为）', () => {
  it('已有工作区认领的目录：直接归入，不新建', async () => {
    const root = tmp('onebot-wsa-root-')
    const dir = join(root, 'companion', 'private', '10001')
    const workspaces = makeWorkspaceRegistry({ owned: [dir] })
    const registry = new ChatRegistry(makeDeps({ cwd: dir, workspaceRegistry: workspaces, config: { workspacePath: root } }))
    const chat = await registry.ensureChat('private:10001', '小明')
    expect(workspaces.resolveByPath).toHaveBeenCalledWith(dir)
    expect(workspaces.create).not.toHaveBeenCalled()
    expect(workspaces.attached).toEqual([{ path: dir, sessionId: chat.sessionId }])
  })

  it('T34：workspace 模式下会话目录就是总工作区，existing 模式直接为它建工作区并归入', async () => {
    const root = tmp('onebot-wsa-root-')
    const workspaces = makeWorkspaceRegistry()
    const registry = new ChatRegistry(makeDeps({ cwd: root, workspaceRegistry: workspaces, config: { workspacePath: root } }))
    const chat = await registry.ensureChat('group:643561596', '群友')
    expect(workspaces.resolveByPath).toHaveBeenCalledWith(root)
    // 会话目录就是总工作区 → 不给它套「QQ群 <群号>」标题，沿用宿主按目录名的默认。
    expect(workspaces.created).toEqual([{ path: root, title: undefined }])
    expect(workspaces.attached).toEqual([{ path: root, sessionId: chat.sessionId }])
  })

  it('T28：聊天子目录归入它所在的总工作区（祖先认领），不为子目录另建工作区', async () => {
    const root = tmp('onebot-wsa-root-')
    const dir = join(root, 'companion', 'groups', '643561596')
    const workspaces = makeWorkspaceRegistry({ owned: [root] })
    const registry = new ChatRegistry(makeDeps({ cwd: dir, workspaceRegistry: workspaces, config: { workspacePath: root, sessionCwdMode: 'chat' } }))
    const chat = await registry.ensureChat('group:643561596', '群友')
    expect(workspaces.resolveByPath).toHaveBeenCalledWith(dir)
    expect(workspaces.create).not.toHaveBeenCalled()
    expect(workspaces.attached).toEqual([{ path: root, sessionId: chat.sessionId }])
  })

  it('总工作区也没注册时 existing 模式不新建，日志说明原因', async () => {
    const root = tmp('onebot-wsa-root-')
    const dir = join(root, 'companion', 'private', '10001')
    const workspaces = makeWorkspaceRegistry()
    const logs: string[] = []
    const registry = new ChatRegistry(makeDeps({
      cwd: dir,
      workspaceRegistry: workspaces,
      log: (level, message) => logs.push(level + ':' + message),
      config: { workspacePath: root, sessionCwdMode: 'chat' },
    }))
    await registry.ensureChat('private:10001', '小明')
    expect(workspaces.create).not.toHaveBeenCalled()
    expect(workspaces.attached).toHaveLength(0)
    const line = logs.find(entry => entry.includes('private:10001'))
    expect(line).toBeDefined()
    expect(line!.startsWith('info:')).toBe(true)
    expect(line).toContain(dir)
    expect(line).toContain('existing')
  })

  it('T28：旧群记忆目录布局的会话（不在总工作区下）不新建工作区，日志写清 chatId、目录和原因', async () => {
    const groupRoot = tmp('onebot-wsa-groups-')
    const root = tmp('onebot-wsa-root-')
    const dir = join(groupRoot, '643561596')
    const workspaces = makeWorkspaceRegistry()
    const logs: string[] = []
    const registry = new ChatRegistry(makeDeps({
      cwd: dir,
      workspaceRegistry: workspaces,
      log: (level, message) => logs.push(level + ':' + message),
      config: { workspacePath: root },
    }))
    await registry.ensureChat('group:643561596', '群友')
    expect(workspaces.resolveByPath).toHaveBeenCalledWith(dir)
    expect(workspaces.create).not.toHaveBeenCalled()
    expect(workspaces.attached).toHaveLength(0)
    const line = logs.find(entry => entry.includes('group:643561596'))
    expect(line).toBeDefined()
    expect(line!.startsWith('info:')).toBe(true)
    expect(line).toContain(dir)
    expect(line).toContain('不是该聊天当前应用的目录')
  })
})

describe('workspace attach · auto 模式（每个聊天一个工作区）', () => {
  it('群目录新建工作区，标题「QQ群 <群号>」', async () => {
    const root = tmp('onebot-wsa-root-')
    const dir = join(root, 'companion', 'groups', '643561596')
    const workspaces = makeWorkspaceRegistry()
    const registry = new ChatRegistry(makeDeps({
      cwd: dir,
      workspaceRegistry: workspaces,
      config: { workspacePath: root, sessionCwdMode: 'chat', attachWorkspaceMode: 'auto' },
    }))
    const chat = await registry.ensureChat('group:643561596', '群友')
    expect(workspaces.created).toEqual([{ path: dir, title: 'QQ群 643561596' }])
    expect(workspaces.attached).toEqual([{ path: dir, sessionId: chat.sessionId }])
  })

  it('管理员私聊目录新建工作区，标题「QQ私聊 <QQ号>」', async () => {
    const adminDir = tmp('onebot-wsa-admin-')
    const workspaces = makeWorkspaceRegistry()
    const registry = new ChatRegistry(makeDeps({
      cwd: adminDir,
      workspaceRegistry: workspaces,
      isAdminPrivate: chatId => chatId === 'private:2824149798',
      config: { workspacePath: tmp('onebot-wsa-'), adminWorkspacePath: adminDir, attachWorkspaceMode: 'auto' },
    }))
    const chat = await registry.ensureChat('private:2824149798', '管理员')
    expect(workspaces.created).toEqual([{ path: adminDir, title: 'QQ私聊 2824149798' }])
    expect(workspaces.attached).toEqual([{ path: adminDir, sessionId: chat.sessionId }])
  })

  it('与自己该用的目录不同的旧会话 cwd 永不新建', async () => {
    const mediaDir = tmp('onebot-wsa-')
    const globalDir = tmp('onebot-wsa-global-')
    const legacyDir = tmp('onebot-wsa-legacy-')
    await writeFile(join(mediaDir, 'chat-sessions.json'), JSON.stringify({ 'private:10001': 'onebot-private-10001' }), 'utf8')
    const workspaces = makeWorkspaceRegistry()
    const registry = new ChatRegistry(makeDeps({
      cwd: legacyDir,
      mediaDir,
      workspaceRegistry: workspaces,
      config: { workspacePath: globalDir, attachWorkspaceMode: 'auto' },
    }))
    await registry.loadMapping()
    expect(workspaces.resolveByPath).toHaveBeenCalledWith(legacyDir)
    expect(workspaces.create).not.toHaveBeenCalled()
    expect(workspaces.attached).toHaveLength(0)
  })
})

describe('workspace attach · off 模式', () => {
  it('从不调用 workspaceRegistry（建会话与手动 attach 都算）', async () => {
    const dir = tmp('onebot-wsa-')
    const workspaces = makeWorkspaceRegistry({ owned: [dir] })
    const registry = new ChatRegistry(makeDeps({
      cwd: dir,
      workspaceRegistry: workspaces,
      config: { workspacePath: dir, attachWorkspaceMode: 'off' },
    }))
    const chat = await registry.ensureChat('private:10001', '小明')
    expect(workspaces.resolveByPath).not.toHaveBeenCalled()
    expect(workspaces.create).not.toHaveBeenCalled()
    expect(workspaces.attached).toHaveLength(0)
    // 手动补挂也被关闭挡住，且不触达宿主。
    const outcome = await registry.attachChatToWorkspace(chat.chatId)
    expect(outcome).toEqual({ ok: false, reason: 'off' })
    expect(workspaces.resolveByPath).not.toHaveBeenCalled()
  })
})

describe('workspace attach · 归入失败只记日志，不影响会话', () => {
  it('create 抛错：会话照常建好，只写一条 warn', async () => {
    const root = tmp('onebot-wsa-root-')
    const dir = join(root, 'companion', 'private', '10001')
    const workspaces = makeWorkspaceRegistry({ createThrows: true })
    const logs: string[] = []
    const registry = new ChatRegistry(makeDeps({
      cwd: dir,
      workspaceRegistry: workspaces,
      log: (level, message) => logs.push(level + ':' + message),
      config: { workspacePath: root, sessionCwdMode: 'chat', attachWorkspaceMode: 'auto' },
    }))
    const chat = await registry.ensureChat('private:10001', '小明')
    expect(chat.sessionId).toBeTruthy()
    expect(workspaces.attached).toHaveLength(0)
    const line = logs.find(entry => entry.includes('workspace attach failed'))
    expect(line).toBeDefined()
    expect(line!.startsWith('warn:')).toBe(true)
    expect(line).toContain('create boom')
  })

  it('T34：workspace 模式下旧会话的子目录 cwd 只记 stale-cwd，不为它新建工作区', async () => {
    const root = tmp('onebot-wsa-root-')
    const dir = join(root, 'companion', 'groups', '643561596')
    const workspaces = makeWorkspaceRegistry({ owned: [root] })
    const logs: string[] = []
    const registry = new ChatRegistry(makeDeps({
      cwd: dir,
      workspaceRegistry: workspaces,
      log: (level, message) => logs.push(level + ':' + message),
      config: { workspacePath: root },
    }))
    const chat = await registry.ensureChat('group:643561596', '群友')
    expect(chat.sessionId).toBeTruthy()
    expect(workspaces.create).not.toHaveBeenCalled()
    expect(workspaces.attached).toHaveLength(0)
    const line = logs.find(entry => entry.includes('group:643561596'))
    expect(line).toBeDefined()
    expect(line!.startsWith('info:')).toBe(true)
    expect(line).toContain('旧的每聊天子目录')
    expect(line).toContain('发 /new')
  })

  it('attachSession 抛错：同上', async () => {
    const root = tmp('onebot-wsa-root-')
    const dir = join(root, 'companion', 'private', '10001')
    const workspaces = makeWorkspaceRegistry({ owned: [dir], attachThrows: true })
    const logs: string[] = []
    const registry = new ChatRegistry(makeDeps({
      cwd: dir,
      workspaceRegistry: workspaces,
      log: (level, message) => logs.push(level + ':' + message),
      config: { workspacePath: root },
    }))
    const chat = await registry.ensureChat('private:10001', '小明')
    expect(chat.sessionId).toBeTruthy()
    expect(workspaces.attached).toHaveLength(0)
    const line = logs.find(entry => entry.includes('workspace attach failed'))
    expect(line).toBeDefined()
    expect(line!.startsWith('warn:')).toBe(true)
    expect(line).toContain('attach boom')
  })
})

/** Minimal CommandContext for the /workspace handler. */
function makeCommandCtx(overrides: {
  outcome?: WorkspaceAttachOutcome
  cwd?: string
  sessionId?: string
  workspace?: { id: string; path: string; sessionIds: string[] }
  list?: Array<{ id: string; path: string; sessionIds: string[] }>
} = {}) {
  const sent: string[] = []
  const pending: unknown[] = []
  const cwd = overrides.cwd ?? '/ws/current'
  const ctx = {
    sendToChat: async (_chatId: string, text: string) => {
      sent.push(text)
      return ['m1']
    },
    log: () => undefined,
    isAdmin: () => true,
    getChat: () => (overrides.sessionId === undefined ? undefined : { sessionId: overrides.sessionId }),
    hasChat: () => overrides.sessionId !== undefined,
    effectiveCwd: () => cwd,
    attachChatToWorkspace: async () => overrides.outcome ?? { ok: true, path: cwd, created: false },
    workspaceRegistry: {
      resolveByPath: async () => overrides.workspace,
      create: async () => {
        throw new Error('the command layer never creates directly')
      },
      list: () => overrides.list ?? [],
    },
    setPendingSelection: (_chatId: string, value: unknown) => {
      pending.push(value)
    },
    pendingSelection: () => undefined,
  }
  return { ctx: ctx as unknown as CommandContext, sent, pending }
}

describe('/workspace attach 的四种回复', () => {
  it('成功（新建）：✅ 已归入工作区 <path>（新建）', async () => {
    const { ctx, sent } = makeCommandCtx({ outcome: { ok: true, path: '/ws/group', created: true } })
    await handleWorkspaceCommand(ctx, 'group:643561596', 'attach')
    expect(sent).toEqual(['✅ 已归入工作区 /ws/group（新建）'])
  })

  it('成功（已有）：✅ 已归入工作区 <path>（已有）', async () => {
    const { ctx, sent } = makeCommandCtx({ outcome: { ok: true, path: '/ws/group', created: false } })
    await handleWorkspaceCommand(ctx, 'group:643561596', 'attach')
    expect(sent).toEqual(['✅ 已归入工作区 /ws/group（已有）'])
  })

  it('模式 off：提示已关闭并给出下一步', async () => {
    const { ctx, sent } = makeCommandCtx({ outcome: { ok: false, reason: 'off' } })
    await handleWorkspaceCommand(ctx, 'group:643561596', 'attach')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('❌ 会话归入工作区已关闭')
    expect(sent[0]).toContain('attachWorkspaceMode=off')
    expect(sent[0]).toContain('/workspace attach')
  })

  it('没有 live 会话：说明下一条消息建会话时自动归入', async () => {
    const { ctx, sent } = makeCommandCtx({ outcome: { ok: false, reason: 'no-session' } })
    await handleWorkspaceCommand(ctx, 'private:10001', 'attach')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('下一条消息建会话时会自动归入')
  })
})

describe('/workspace 无参输出的归入状态行', () => {
  it('当前会话在工作区的 sessionIds 里 → ✅ 已归入', async () => {
    const { ctx, sent } = makeCommandCtx({
      sessionId: 'onebot-private-10001',
      cwd: '/ws/current',
      workspace: { id: 'w1', path: '/ws/current', sessionIds: ['onebot-private-10001'] },
    })
    await handleWorkspaceCommand(ctx, 'private:10001', '')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('归入状态：✅ 已归入工作区 w1')
  })

  it('工作区存在但不含当前会话 → ❌ 未归入并提示 /workspace attach', async () => {
    const { ctx, sent } = makeCommandCtx({
      sessionId: 'onebot-private-10001',
      cwd: '/ws/current',
      workspace: { id: 'w1', path: '/ws/current', sessionIds: ['someone-else'] },
    })
    await handleWorkspaceCommand(ctx, 'private:10001', '')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('归入状态：❌ 未归入工作区')
    expect(sent[0]).toContain('/workspace attach')
  })

  it('没有活跃会话 → 说明下一条消息建会话时自动归入', async () => {
    const { ctx, sent } = makeCommandCtx({})
    await handleWorkspaceCommand(ctx, 'private:10001', '')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('当前没有活跃会话')
    expect(sent[0]).toContain('自动归入')
  })
})