/**
 * F3 · 状态快照与服务装配的宿主侧测试（《前端设计规范》§1.2 overview / §4.14）：
 *
 *   ① `buildCompanionStatusSnapshot` 的全量字段、去重/计数/上限、任何一部分
 *      取数失败只让该字段为 null（其余照常返回）；
 *   ② 快照不含密钥与聊天正文；
 *   ③ 主插件挂的服务：`ctx.provide('qqCompanionStatus')` 后 settings-remote 的
 *      `getStatus()` 三种结果（可用 / 不可用 / 异常），卸载后服务被撤销；
 *   ④ `/doctor` 的记忆文件行与快照的 memory 同源（同一份 memoryFileSpecs）。
 *
 * @module dsh-qq-companion-pro/tests/status
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'

import { apply, Config } from '../src/index.js'
import {
  STATUS_SERVICE,
  STATUS_SESSION_LIMIT,
  buildCompanionStatusSnapshot,
  provideCompanionStatus,
  type CompanionStatusDeps,
} from '../src/status.js'
import {
  NAMESPACE,
  OnebotSettingsService,
  createOnebotSettingsMethods,
  getStatus,
  type ConfigEditorLike,
  type CompanionStatusServiceLike,
} from '../src/settings-remote.js'
import { companionStatusLines } from '../src/companion/doctor.js'

/** 固定的「现在」（本地时间 2026-10-23 12:00）。 */
const NOW = new Date(2026, 9, 23, 12, 0, 0).getTime()

/** 一个临时目录 + 里面的记忆文件（返回真实字节数）。 */
function memoryDir(): { dir: string; file: string; bytes: number } {
  const dir = mkdtempSync(join(tmpdir(), 'onebot-status-'))
  const file = join(dir, 'AGENTS.md')
  writeFileSync(file, '# 记忆\n')
  return { dir, file, bytes: readFileSync(file).length }
}

/** 全量依赖（每个字段都有真实取数）。 */
function fullDeps(overrides: Partial<CompanionStatusDeps> = {}): CompanionStatusDeps {
  const { file } = memoryDir()
  return {
    connection: () => ({ connected: true, selfId: '2564812526' }),
    transport: { host: '127.0.0.1', port: 8643 },
    botQQ: '2564812526',
    liveness: () => ({ lastHeartbeatAt: NOW, online: true, intervalMs: 30_000 }),
    chats: () => ({
      live: [
        { chatId: 'private:2824149798', sessionId: 's1' },
        { chatId: 'group:123456', sessionId: 's2' },
      ],
      mapped: [
        { chatId: 'private:2824149798', sessionId: 's1-stale' },
        { chatId: 'group:999999', sessionId: 's3' },
      ],
    }),
    workspaceSessionIds: () => new Set(['s2']),
    titleOf: chatId => (chatId === 'private:2824149798' ? 'QQ私聊 2824149798 · 10-23' : undefined),
    sendCounter: () => ({ lastMinute: 1, lastHour: 2, today: 12 }),
    scheduler: () => [
      { id: 'diary', time: '23:00', firedToday: false },
      { id: 'morning', time: '08:00', firedToday: true },
    ],
    scheduledPrompts: [
      { id: 'diary', time: '23:00', chatId: 'private:2824149798' },
      { id: 'morning', time: '08:00', chatId: 'group:123456' },
    ],
    proactive: () => ({ enabled: true, firedToday: 1, remaining: ['15:30', '20:00'] }),
    stickers: () => ({ count: 10, maxCount: 300, today: 2, dailyMax: 20 }),
    memoryFiles: [{ label: '公开', path: file, max: 6144 }],
    permissions: { admin: 'danger-full-access', member: 'read-only' },
    now: () => NOW,
    ...overrides,
  }
}

describe('buildCompanionStatusSnapshot — 全量字段（§4.14）', () => {
  it('连接：connected / online / selfId / botQQ / host / port', async () => {
    const snapshot = await buildCompanionStatusSnapshot(fullDeps())
    expect(snapshot.connection).toEqual({
      connected: true,
      online: true,
      selfId: '2564812526',
      botQQ: '2564812526',
      host: '127.0.0.1',
      port: 8643,
    })
  })

  it('online 未知（liveness 还没收到心跳）= null；botQQ 空则退回 selfId', async () => {
    const snapshot = await buildCompanionStatusSnapshot(fullDeps({
      botQQ: '',
      liveness: () => ({ lastHeartbeatAt: undefined, online: undefined, intervalMs: undefined }),
    }))
    expect(snapshot.connection).toMatchObject({ online: null, botQQ: '2564812526' })
  })

  it('会话：live 优先去重、私聊/群计数按全量、workspaceAttached 三态、标题来自宿主 sessionTitle', async () => {
    const snapshot = await buildCompanionStatusSnapshot(fullDeps())
    expect(snapshot.sessions).not.toBeNull()
    const sessions = snapshot.sessions!
    expect(sessions.private).toBe(1)
    expect(sessions.group).toBe(2)
    expect(sessions.list).toEqual([
      { chatId: 'private:2824149798', sessionId: 's1', title: 'QQ私聊 2824149798 · 10-23', workspaceAttached: false },
      { chatId: 'group:123456', sessionId: 's2', workspaceAttached: true },
      { chatId: 'group:999999', sessionId: 's3', workspaceAttached: false },
    ])
  })

  it('sessions.list 最多 STATUS_SESSION_LIMIT 条，计数仍按全量', async () => {
    const live = Array.from({ length: STATUS_SESSION_LIMIT + 10 }, (_, index) => ({
      chatId: 'group:' + String(1000 + index),
      sessionId: 's' + index,
    }))
    const snapshot = await buildCompanionStatusSnapshot(fullDeps({ chats: () => ({ live }) }))
    expect(snapshot.sessions!.group).toBe(STATUS_SESSION_LIMIT + 10)
    expect(snapshot.sessions!.list).toHaveLength(STATUS_SESSION_LIMIT)
  })

  it('工作区注册表缺席 → workspaceAttached 全为 null（不是 false）', async () => {
    const snapshot = await buildCompanionStatusSnapshot(fullDeps({ workspaceSessionIds: () => undefined }))
    expect(snapshot.sessions!.list.every(chat => chat.workspaceAttached === null)).toBe(true)
  })

  it('今天：sendCounter 的 today 与不回次数（passCount）', async () => {
    const snapshot = await buildCompanionStatusSnapshot(fullDeps())
    expect(snapshot.today).toEqual({ sent: 12, passCount: 0 })
    const withPass = await buildCompanionStatusSnapshot(fullDeps({ sendCounter: () => ({ lastMinute: 1, lastHour: 2, today: 12, passToday: 4 }) }))
    expect(withPass.today).toEqual({ sent: 12, passCount: 4 })
  })

  it('主动聊天：enabled / 今日已执行 / 今日计划（已执行 + 剩余）/ 下一次', async () => {
    const snapshot = await buildCompanionStatusSnapshot(fullDeps())
    expect(snapshot.proactive).toEqual({ enabled: true, doneToday: 1, plannedToday: 3, nextAt: '15:30' })
  })

  it('主动聊天未开启（调用方不传 proactive）→ enabled:false', async () => {
    const snapshot = await buildCompanionStatusSnapshot(fullDeps({ proactive: undefined }))
    expect(snapshot.proactive).toEqual({ enabled: false, doneToday: 0, plannedToday: 0 })
  })

  it('表情包：库开启时计数齐全；未开启（调用方不传）→ enabled:false', async () => {
    const enabled = await buildCompanionStatusSnapshot(fullDeps())
    expect(enabled.stickers).toEqual({ enabled: true, count: 10, maxCount: 300, today: 2, dailyMax: 20 })
    const off = await buildCompanionStatusSnapshot(fullDeps({ stickers: undefined }))
    expect(off.stickers).toEqual({ enabled: false, count: 0, maxCount: 0, today: 0, dailyMax: 0 })
  })

  it('记忆：与 /doctor 同源（label / path / bytes / maxBytes）', async () => {
    const deps = fullDeps()
    const snapshot = await buildCompanionStatusSnapshot(deps)
    const file = deps.memoryFiles![0]
    expect(snapshot.memory).toEqual([{ label: '公开', path: file.path, bytes: readFileSync(file.path).length, maxBytes: 6144 }])
  })

  it('定时任务：prompts 与调度器状态按 id 对齐，doneToday 与 nextAt', async () => {
    const snapshot = await buildCompanionStatusSnapshot(fullDeps())
    expect(snapshot.scheduled).toEqual([
      { id: 'diary', time: '23:00', chatId: 'private:2824149798', doneToday: false, nextAt: '23:00' },
      { id: 'morning', time: '08:00', chatId: 'group:123456', doneToday: true, nextAt: '08:00' },
    ])
  })

  it('没有配置定时任务也没有调度器状态 → scheduled 为 null', async () => {
    const snapshot = await buildCompanionStatusSnapshot(fullDeps({ scheduledPrompts: undefined, scheduler: undefined }))
    expect(snapshot.scheduled).toBeNull()
  })

  it('权限行与 generatedAt', async () => {
    const snapshot = await buildCompanionStatusSnapshot(fullDeps())
    expect(snapshot.permissions).toEqual({ admin: 'danger-full-access', member: 'read-only' })
    expect(snapshot.generatedAt).toBe(NOW)
  })
})

describe('buildCompanionStatusSnapshot — 部分取数失败只让该字段为 null', () => {
  it('每个取数函数各自抛错：对应字段为 null，其余照常返回', async () => {
    const boom = (): never => { throw new Error('boom') }
    const snapshot = await buildCompanionStatusSnapshot({
      connection: () => { throw new Error('no connection') },
      transport: { host: '127.0.0.1', port: 8643 },
      liveness: () => { throw new Error('no liveness') },
      chats: () => { throw new Error('no chats') },
      workspaceSessionIds: () => { throw new Error('no registry') },
      sendCounter: () => { throw new Error('no counter') },
      scheduler: boom,
      scheduledPrompts: [{ id: 'diary', time: '23:00', chatId: 'private:1' }],
      proactive: boom,
      stickers: boom,
      memoryFiles: [{ label: '公开', path: join(tmpdir(), 'definitely-missing-' + Date.now() + '.md'), max: 10 }],
      now: () => NOW,
    })
    expect(snapshot.connection).toBeNull()
    expect(snapshot.sessions).toBeNull()
    expect(snapshot.today).toBeNull()
    expect(snapshot.proactive).toBeNull()
    expect(snapshot.stickers).toBeNull()
    expect(snapshot.scheduled).toBeNull()
    expect(snapshot.permissions).toBeNull() // 没传权限行 = 省略（不是空串对象）
    // 记忆文件读不到只让 bytes 为 null，整行仍在。
    expect(snapshot.memory).toEqual([{ label: '公开', path: snapshot.memory![0].path, bytes: null, maxBytes: 10 }])
    expect(snapshot.generatedAt).toBe(NOW)
  })

  it('单行 title 取数抛错只影响该行（sessions 不整体失败）', async () => {
    const snapshot = await buildCompanionStatusSnapshot(fullDeps({
      titleOf: (chatId) => {
        if (chatId === 'group:123456') throw new Error('title service down')
        return 'QQ私聊'
      },
    }))
    expect(snapshot.sessions!.list[0].title).toBe('QQ私聊')
    expect(snapshot.sessions!.list[1].title).toBeUndefined()
  })

  it('完全没有依赖也能返回一份全 null 的快照（主插件刚启动时）', async () => {
    const snapshot = await buildCompanionStatusSnapshot()
    expect(snapshot).toEqual({
      connection: null,
      sessions: null,
      today: null,
      proactive: { enabled: false, doneToday: 0, plannedToday: 0 },
      stickers: { enabled: false, count: 0, maxCount: 0, today: 0, dailyMax: 0 },
      memory: [],
      scheduled: null,
      permissions: null,
      capabilities: null,
      generatedAt: expect.any(Number),
    })
  })
})

describe('快照不含密钥与聊天正文', () => {
  it('JSON 里没有 accessToken / 令牌，也没有定时任务的 prompt 正文', async () => {
    const deps = fullDeps()
    // 调用方就算把带密钥的配置混进来，本快照也从不读它（只读 botQQ 等展示字段）。
    const polluted = Object.assign({}, deps, { accessToken: 'super-secret-token', scheduledPromptText: '给主人写日记' })
    const snapshot = await buildCompanionStatusSnapshot(polluted as CompanionStatusDeps)
    const text = JSON.stringify(snapshot)
    expect(text).not.toContain('super-secret-token')
    expect(text).not.toContain('accessToken')
    expect(text).not.toContain('给主人写日记')
    expect(text).not.toContain('写日记')
    // 只保留会话 id / 标题 / 计数 / 路径 / 大小这类展示信息。
    expect(snapshot.sessions!.list[0]).not.toHaveProperty('message')
  })
})

describe('qqCompanionStatus 服务 — 注册与卸载', () => {
  it('provide 后 ctx.get 可见；显式撤销后不可见（插件卸载同一条路径）', () => {
    const ctx = new Context()
    const service: CompanionStatusServiceLike = { snapshot: async () => buildCompanionStatusSnapshot(fullDeps()) }
    const dispose = provideCompanionStatus(ctx, service)
    expect(ctx.get(STATUS_SERVICE)).toBe(service)
    dispose()
    expect(ctx.get(STATUS_SERVICE)).toBeUndefined()
  })

  it('插件 fiber 卸载时服务自动撤销（ctx.provide 的 effect 语义）', async () => {
    const ctx = new Context()
    const service: CompanionStatusServiceLike = { snapshot: async () => buildCompanionStatusSnapshot() }
    provideCompanionStatus(ctx, service)
    expect(ctx.get(STATUS_SERVICE)).toBe(service)
    await ctx.fiber.dispose()
    expect(ctx.get(STATUS_SERVICE)).toBeUndefined()
  })

  it('主插件 apply 之后服务在位，snapshot() 返回一份可序列化快照', async () => {
    const mediaDir = mkdtempSync(join(tmpdir(), 'onebot-status-apply-'))
    const ctx = new Context()
    const registries: Array<Record<string, unknown>> = []
    ctx.provide('tools' as never, { register: () => () => undefined } as never)
    ctx.provide('systemPrompt' as never, { section: () => () => undefined } as never)
    ctx.provide('agents' as never, {
      create: async () => ({ agent: { session: { id: 's' }, followup: () => undefined, whenIdle: async () => undefined }, dispose: async () => undefined }),
      resume: async () => { throw new Error('no persistence') },
    } as never)
    ctx.provide('sessions' as never, { flush: async () => undefined } as never)
    ctx.provide('agentDefaultModel' as never, { currentSelection: () => undefined } as never)
    ctx.provide('workspaceRegistry' as never, { list: () => registries, resolveByPath: async () => undefined, create: async () => { throw new Error('unused') } } as never)
    const effectSpy = vi.spyOn(ctx as unknown as { effect: (cb: () => unknown, label?: string) => unknown }, 'effect')
    apply(ctx as never, Config({ mediaDir, port: 0, accessToken: 'test-token', botQQ: '10002', sttEnabled: false, sensitivePatterns: [] }))
    const service = ctx.get(STATUS_SERVICE) as CompanionStatusServiceLike | undefined
    expect(service).toBeDefined()
    const snapshot = await service!.snapshot()
    expect(snapshot).toMatchObject({
      connection: { connected: false, selfId: '10002', botQQ: '10002', host: '127.0.0.1', port: 0 },
      sessions: { private: 0, group: 0, list: [] },
      today: { sent: 0 },
      stickers: { enabled: false },
    })
    expect(typeof snapshot.generatedAt).toBe('number')
    // 卸载：lifecycle disposer 是 apply 注册的第一个 effect（provide 在它之后）。
    const disposer = effectSpy.mock.results[0].value as () => Promise<void>
    await disposer()
  })
})

describe('settings-remote — getStatus 三种结果', () => {
  /** 最小 configEditor 桩（getStatus 不读它，只为构造服务）。 */
  const editor: ConfigEditorLike = {
    entries: () => [{ options: { id: 'dsh-onebot', config: {} }, fiber: { state: 2 } }],
    edit: async () => undefined,
  }

  it('可用：服务在位 → { available: true, status }', async () => {
    const status = { connection: { connected: true } }
    const service: CompanionStatusServiceLike = { snapshot: () => status }
    await expect(getStatus(service)).resolves.toEqual({ available: true, status })
  })

  it('不可用：服务缺席 / 形状不符 → { available: false }（绝不抛错）', async () => {
    await expect(getStatus(undefined)).resolves.toEqual({ available: false })
    await expect(getStatus({} as unknown as CompanionStatusServiceLike)).resolves.toEqual({ available: false })
    await expect(getStatus(null as unknown as CompanionStatusServiceLike)).resolves.toEqual({ available: false })
  })

  it('异常：snapshot() 抛错 → { available: true, error: 消息 }', async () => {
    const service: CompanionStatusServiceLike = { snapshot: () => { throw new Error('状态读取失败') } }
    await expect(getStatus(service)).resolves.toEqual({ available: true, error: '状态读取失败' })
  })

  it('createOnebotSettingsMethods 与 descriptor 同一实现：注入服务 / 不注入两态', async () => {
    const service: CompanionStatusServiceLike = { snapshot: async () => ({ generatedAt: 1 }) }
    const withService = createOnebotSettingsMethods(editor, undefined, undefined, service)
    await expect(withService.getStatus()).resolves.toEqual({ available: true, status: { generatedAt: 1 } })
    const withoutService = createOnebotSettingsMethods(editor)
    await expect(withoutService.getStatus()).resolves.toEqual({ available: false })
  })

  it('服务面接线：ctx 提供 qqCompanionStatus → getStatus 可用；缺席 → available:false', async () => {
    const service: CompanionStatusServiceLike = { snapshot: async () => ({ generatedAt: 7 }) }
    const ctxWith = new Context()
    ctxWith.reflect.provide('configEditor', editor)
    ctxWith.reflect.provide(STATUS_SERVICE, service)
    const withService = new OnebotSettingsService(ctxWith)
    expect(NAMESPACE).toBe('onebotSettings')
    await expect(withService.getStatus()).resolves.toEqual({ available: true, status: { generatedAt: 7 } })

    // 主链路不受影响。
    await expect(withService.getSettings()).resolves.toMatchObject({ revision: 0 })

    const ctxWithout = new Context()
    ctxWithout.reflect.provide('configEditor', editor)
    const withoutService = new OnebotSettingsService(ctxWithout)
    await expect(withoutService.getStatus()).resolves.toEqual({ available: false })
  })
})

describe('记忆文件与 /doctor 同源', () => {
  it('memoryFileSpecs 的清单就是 /doctor 的记忆文件行（含每群 AGENTS.md）', async () => {
    const { dir, file } = memoryDir()
    const groupDir = join(dir, 'groups')
    const group = join(groupDir, '123456')
    mkdirSync(group, { recursive: true })
    writeFileSync(join(group, 'AGENTS.md'), '群记忆\n')

    const deps: CompanionStatusDeps = {
      memoryFiles: [{ label: '公开', path: file, max: 6144 }],
      groupMemoryDir: groupDir,
      groupMemoryMaxBytes: 8192,
      now: () => NOW,
    }
    const snapshot = await buildCompanionStatusSnapshot(deps)
    const labels = snapshot.memory!.map(entry => entry.label)
    expect(labels).toEqual(['公开', '群123456'])
    expect(snapshot.memory![1]).toMatchObject({ bytes: readFileSync(join(group, 'AGENTS.md')).length, maxBytes: 8192 })

    const lines = await companionStatusLines({ memoryFiles: [{ label: '公开', path: file, max: 6144 }], groupMemoryDir: groupDir, groupMemoryMaxBytes: 8192, now: () => NOW })
    const memoryLine = lines.find(line => line.startsWith('记忆文件：'))!
    expect(memoryLine).toContain('公开')
    expect(memoryLine).toContain('群123456')
  })
})