/**
 * 部署后首次启动：accessToken 还没填（schema 默认 ''）时的真实 apply 行为。
 *
 * 背景（这次要修的根因）：apply 里 connection.start() 对空 token 直接抛
 * `reverse mode requires a non-empty accessToken`，抛在 apply 里 → 本插件 fiber
 * 变成 failed；宿主 configEditor.edit 只对 `fiber.state === 2`（active）的条目
 * 写配置，于是设置页永远存不进 token（死锁）。
 *
 * 本文件用**真实的 apply + 真实 cordis Context**（不是纯函数断言）钉住：
 *  1) 空 / 纯空白 token 时 apply 不抛；
 *  2) 不建 OneBotConnection —— 没有 lifecycle effect、端口真的没被监听；
 *  3) 不碰 tools / systemPrompt / agents（无业务副作用），不伪造 online；
 *  4) 只挂只读状态服务，概览可见且如实报「未连接」；
 *  5) 合法 token 走原启动路径（lifecycle 照挂，无等待警告）；
 *  6) waiting(active) → 填 token 保存 → 按新配置重启后进正常路径（设置页可保存）。
 *
 * 连接层拒绝空 token 的安全检查**不在这里**、也未被削弱：
 * tests/connection.spec.ts:70 仍然断言 start() 抛 `reverse mode requires a
 * non-empty accessToken`。
 */
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import net from 'node:net'
import { Context } from '@deepseek-ai/cordis'

import { apply, Config, inject, isAccessTokenUnconfigured, name } from '../src/index.js'
import { STATUS_SERVICE } from '../src/status.js'

/** 找一个当前没人监听的端口（先占 0 号端口读出来再关掉）。 */
async function freePort(): Promise<number> {
  const server = net.createServer()
  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve(typeof address === 'object' && address !== null ? address.port : 0)
    })
  })
  await new Promise<void>(resolve => server.close(() => resolve()))
  return port
}

/** 该端口是否拒绝连接（= 没有在监听）。 */
function refuses(port: number): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const done = (value: boolean): void => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(value)
    }
    socket.once('connect', () => done(false))
    socket.once('error', () => done(true))
    socket.setTimeout(2000, () => done(true))
  })
}

/** 跑完所有 ctx.effect 的撤销函数（正常路径会真的开监听，测试末尾必须收尾）。 */
async function disposeEffects(spy: { mock: { results: Array<{ value: unknown }> } }): Promise<void> {
  for (const result of spy.mock.results) {
    const value = result.value
    if (typeof value !== 'function') continue
    try {
      await (value as () => unknown)()
    } catch {
      // 撤销期的次要错误不影响断言结论
    }
  }
}

/** 一个最小的 cordis 宿主面：注入的四个服务全用桩，记录是否被碰过。 */
function makeCtx() {
  const ctx = new Context()
  const calls = { toolRegister: 0, promptSection: 0, agentCreate: 0 }
  ctx.provide('tools' as never, {
    register: () => {
      calls.toolRegister += 1
      return () => undefined
    },
  } as never)
  ctx.provide('systemPrompt' as never, {
    section: () => {
      calls.promptSection += 1
      return () => undefined
    },
  } as never)
  ctx.provide('agents' as never, {
    create: async () => {
      calls.agentCreate += 1
      throw new Error('waiting 态不该创建 agent')
    },
    resume: async () => { throw new Error('no persistence') },
  } as never)
  ctx.provide('sessions' as never, { flush: async () => undefined } as never)
  ctx.provide('agentDefaultModel' as never, {
    currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-chat' }),
  } as never)
  return { ctx, calls }
}

/** 等待态用的最小配置（其余键取 schema 默认）。 */
function waitingConfig(port: number, accessToken: string) {
  const mediaDir = mkdtempSync(join(tmpdir(), 'onebot-waiting-'))
  return Config({ mediaDir, port, accessToken, botQQ: '10002', sttEnabled: false, sensitivePatterns: [] })
}

describe('accessToken 未配置 → 等待配置（apply 不再 failed）', () => {
  it('isAccessTokenUnconfigured：空串 / 纯空白 / 非字符串都算没配，有内容才算配了', () => {
    expect(isAccessTokenUnconfigured('')).toBe(true)
    expect(isAccessTokenUnconfigured('   ')).toBe(true)
    expect(isAccessTokenUnconfigured('\t\r\n ')).toBe(true)
    expect(isAccessTokenUnconfigured(undefined)).toBe(true)
    expect(isAccessTokenUnconfigured(null)).toBe(true)
    expect(isAccessTokenUnconfigured('t')).toBe(false)
    expect(isAccessTokenUnconfigured('  tok  ')).toBe(false)
  })

  it('缺 token：apply 不抛、不挂 lifecycle、端口没被监听、业务面一次都没碰', async () => {
    const port = await freePort()
    expect(await refuses(port)).toBe(true) // 前置：这个端口本来是空的

    const { ctx, calls } = makeCtx()
    const effectSpy = vi.spyOn(ctx as { effect: (cb: () => unknown, label?: string) => unknown }, 'effect')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      expect(() => apply(ctx as never, waitingConfig(port, ''))).not.toThrow()
      expect(effectSpy).not.toHaveBeenCalled() // 连接/桥/调度器全在 lifecycle 里
      expect(calls.toolRegister).toBe(0)
      expect(calls.promptSection).toBe(0)
      expect(calls.agentCreate).toBe(0)
      expect(await refuses(port)).toBe(true) // 没有监听端口（不连 NapCat、不占端口）
    } finally {
      warn.mockRestore()
      effectSpy.mockRestore()
    }
  })

  it('纯空白 token 同样进等待配置（连接层只挡 === ""，空白 token 连不上任何人）', async () => {
    const port = await freePort()
    const { ctx } = makeCtx()
    const effectSpy = vi.spyOn(ctx as { effect: (cb: () => unknown, label?: string) => unknown }, 'effect')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      expect(() => apply(ctx as never, waitingConfig(port, '   \t '))).not.toThrow()
      expect(effectSpy).not.toHaveBeenCalled()
      expect(ctx.get(STATUS_SERVICE as never)).toBeDefined()
    } finally {
      warn.mockRestore()
      effectSpy.mockRestore()
    }
  })

  it('等待态只挂只读状态服务：概览可用、如实「未连接」、online 未知、其余无数据', async () => {
    const port = await freePort()
    const { ctx } = makeCtx()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      apply(ctx as never, waitingConfig(port, ''))
      const service = ctx.get(STATUS_SERVICE as never) as { snapshot(): Promise<Record<string, unknown>> }
      expect(typeof service.snapshot).toBe('function')
      const snapshot = await service.snapshot()
      const connection = snapshot.connection as Record<string, unknown>
      expect(connection.connected).toBe(false) // 没连上就是没连上
      expect(connection.online).toBeNull() // 不伪造 online
      expect(connection.selfId).toBe('')
      expect(connection.botQQ).toBe('10002')
      expect(connection.host).toBe('127.0.0.1') // 配置里的地址照实显示（NapCat 该拨的地方）
      expect(connection.port).toBe(port)
      // 没建 bridge / 调度器 / 媒体库：这些卡片的取数源不存在 → 无数据（null）。
      expect(snapshot.sessions).toBeNull()
      expect(snapshot.today).toBeNull()
      const emptyList = (value: unknown): boolean => value === null || (Array.isArray(value) && value.length === 0)
      expect(emptyList(snapshot.memory)).toBe(true) // 没建媒体/记忆组件：没有文件行
      expect(emptyList(snapshot.scheduled)).toBe(true) // 没起调度器：没有定时任务行
      expect(snapshot.capabilities).toBeNull()
      expect(snapshot.protocol).toBeNull()
      // 主动聊天 / 表情包在取数源缺席时归一为「关掉的全零」（status.ts 的既有语义）。
      expect(snapshot.proactive).toEqual({ enabled: false, doneToday: 0, plannedToday: 0 })
      expect(snapshot.stickers).toEqual({ enabled: false, count: 0, maxCount: 0, today: 0, dailyMax: 0 })
      expect(typeof snapshot.generatedAt).toBe('number')
    } finally {
      warn.mockRestore()
    }
  })

  it('等待态的警告说清「为什么没连」且不含 token 值（不含秘密）', async () => {
    const port = await freePort()
    const { ctx } = makeCtx()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      apply(ctx as never, waitingConfig(port, ''))
      const lines = warn.mock.calls.map(call => String(call[0]))
      const waiting = lines.filter(line => line.includes('未配置 accessToken'))
      expect(waiting).toHaveLength(1)
      expect(waiting[0]).toContain('等待配置')
      expect(waiting[0]).toContain('access_token')
      expect(waiting[0]).toContain(String(port))
      // 只说明「没配置」，不 dump 任何 token 形态
      expect(waiting[0]).not.toMatch(/accessToken\s*[:=]\s*\S/)
    } finally {
      warn.mockRestore()
    }
  })

  it('合法 token 保持原启动路径：lifecycle 照挂、进入正常装配、没有等待警告', async () => {
    const port = await freePort()
    const { ctx } = makeCtx()
    const effectSpy = vi.spyOn(ctx as { effect: (cb: () => unknown, label?: string) => unknown }, 'effect')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      apply(ctx as never, waitingConfig(port, 'test-token'))
      expect(effectSpy).toHaveBeenCalled()
      const lines = warn.mock.calls.map(call => String(call[0]))
      expect(lines.filter(line => line.includes('未配置 accessToken'))).toEqual([])
      // 正常路径也挂状态服务（概览的取数源仍是真连接对象）
      expect(ctx.get(STATUS_SERVICE as never)).toBeDefined()
    } finally {
      await disposeEffects(effectSpy)
      warn.mockRestore()
      effectSpy.mockRestore()
    }
  })

  it('宿主写配置的前提：真 cordis fiber 在等待态是 ACTIVE（state 2），不是 FAILED（state 3）', async () => {
    // cordis 的 FiberState 是 const enum（运行时不导出），这里按数值断言并注明：
    // 0 PENDING / 1 LOADING / 2 ACTIVE / 3 FAILED / 4 DISPOSED。
    const ACTIVE = 2
    const port = await freePort()
    const { ctx } = makeCtx()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      // inject 声明的 10 个服务缺一个，fiber 就停在 PENDING —— 这里全给桩，
      // 只为让 fiber 真的走到「apply 跑完」这一步。
      for (const service of ['agentPresets', 'sessionPersistence', 'workspaceRegistry', 'commands', 'llm']) {
        ctx.provide(service as never, {} as never)
      }
      const fork = ctx.plugin({ name, inject, Config, apply } as never, waitingConfig(port, ''))
      await fork // 等 loading 落定（apply 是同步的）
      const fiber = fork as unknown as { state: number; dispose?: () => unknown }
      // 宿主 configEditor.edit 只对 state === 2（active）的条目写配置；这条一旦变成
      // 3（FAILED），设置页就再也存不进 token —— 正是这次要修的部署死锁。
      expect(fiber.state).toBe(ACTIVE)
      await fiber.dispose?.()
    } finally {
      warn.mockRestore()
    }
  })

  it('设置页可保存的契约：waiting 态（active）→ 填 token 保存 → 按新配置重启进正常路径', async () => {
    const port = await freePort()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      // 第一次挂载：没有 token。宿主视角是「条目 active 且没抛」，所以
      // configEditor.edit 的 `fiber.state === 2` 门槛过得去，设置页写得进配置。
      const first = makeCtx()
      const firstEffect = vi.spyOn(first.ctx as { effect: (cb: () => unknown, label?: string) => unknown }, 'effect')
      expect(() => apply(first.ctx as never, waitingConfig(port, ''))).not.toThrow()
      expect(firstEffect).not.toHaveBeenCalled()
      await disposeEffects(firstEffect)
      firstEffect.mockRestore()

      // 宿主 reconcile 用新配置重启条目：这次带上了刚保存的 token。
      const second = makeCtx()
      const secondEffect = vi.spyOn(second.ctx as { effect: (cb: () => unknown, label?: string) => unknown }, 'effect')
      expect(() => apply(second.ctx as never, waitingConfig(port, 'saved-token'))).not.toThrow()
      expect(secondEffect).toHaveBeenCalled() // 正常启动路径（建连接、起 bridge/调度）
      await disposeEffects(secondEffect)
      secondEffect.mockRestore()
    } finally {
      warn.mockRestore()
    }
  })
})