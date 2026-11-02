/**
 * T13 · 群管理写操作（四个工具 + 两个能力 + 双重门禁 + 审计 + /doctor 提示）。
 *
 * 这是全插件唯一会真的改变群状态的模型工具，所以本文件按「四道关」组织：
 *   ① 能力层：两个能力的默认位全为 false、工具归属正确、说明里写清是写操作；
 *   ② 注册层（真 bridge + 真能力判定）：四类关系默认都不注册；显式 grant 后才注册；
 *   ③ 回合层（本任务的关键安全设计）：**能力已开启 + 群友发起的回合 → 仍被拒绝**，
 *      而且一个 OneBot 请求都不发；主人回合放行；非管理员私聊拒绝；无会话映射
 *      fail-closed；
 *   ④ 参数与审计：非法参数一律拒绝（不夹逼、不猜）；每次调用（成功 / 失败 / 被
 *      门禁拒掉 / 参数不合法）都往 mediaDir/qq-actions.log 追加一行 jsonl。
 * 另外钉住 /doctor 的那句提示：非主人档真的开了才出现，全关时不出。
 * @module dsh-qq-companion-pro/tests/group-tools
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'

import { ChatBridge } from '../src/bridge.js'
import {
  MAX_ANNOUNCE_CHARS,
  MAX_BAN_SECONDS,
  MAX_CARD_CHARS,
  registerGroupTools,
} from '../src/group-tools.js'
import { CAPABILITIES, capabilityOfTool, findCapability, groupWriteWarningLine } from '../src/capabilities.js'
import { ACTION_AUDIT_FILE } from '../src/outbound.js'
import { healthReport } from '../src/health.js'
import { makeCmdHarness } from './helpers/bridge-harness.js'

/** 本任务新增的四个工具（顺序无关）。 */
const GROUP_TOOLS = ['qq_group_ban', 'qq_group_card', 'qq_group_announce', 'qq_group_essence']

/** 两个能力 → 各自的工具（能力层的期望）。 */
const EXPECTED_CAPABILITIES = {
  'qq.group.manage': ['qq_group_ban', 'qq_group_card'],
  'qq.group.notice': ['qq_group_announce', 'qq_group_essence'],
} as const

interface GroupTool {
  name: string
  description: string
  parameters: { properties?: Record<string, { description?: string; required?: boolean; enum?: readonly string[] }> }
  output: { render: (args: unknown, value: unknown) => Array<{ type: string; text: string }> }
  execute: (args: unknown, exec?: unknown) => Promise<unknown>
}

/** 一个能被门禁识别的执行上下文（session id 由测试指定）。 */
const exec = (sessionId: string) => ({ agent: { session: { id: sessionId } } })

/** 真 ChatBridge（只为 chatForSession / canEditFiles / auditAction），connection 只记录调用。 */
function makeToolHarness(opts?: { failWith?: string }) {
  const root = mkdtempSync(join(tmpdir(), 'group-tools-'))
  const mediaDir = join(root, 'media')
  const calls: Array<{ action: string; params: Record<string, unknown> }> = []
  const connection = {
    call: async (action: string, params: Record<string, unknown>) => {
      calls.push({ action, params })
      if (opts?.failWith !== undefined) throw new Error(opts.failWith)
      return {}
    },
    connected: true,
    selfId: '10002',
  }
  const bridge = new ChatBridge({
    ctx: new Context(),
    connection: connection as never,
    media: {} as never,
    transcriber: {} as never,
    agents: {} as never,
    sessions: {} as never,
    agentPresets: undefined as never,
    sessionPersistence: undefined,
    workspaceRegistry: undefined as never,
    agentDefaultModel: undefined,
    defaultModel: undefined,
    config: {
      botQQ: '10002', ignoreSelf: false, requireMention: true,
      interimMessages: true, sendErrorNotice: true, restrictedMemberPrefix: false,
      sensitivePatterns: [], mediaDir, maxImageBytes: 8 * 1024 * 1024,
      maxVoiceBytes: 15 * 1024 * 1024, maxFileBytes: 20 * 1024 * 1024,
      textImageThreshold: 0, cardFooter: 'dsh', fontFiles: [], fontFamilies: [],
      agentPreset: 'standard', workspacePath: root, maxInboundFileBytes: 0,
    },
    policy: {
      dmPolicy: 'open', groupPolicy: 'open', allowFrom: [], groupAllowFrom: [],
      adminUsers: ['10001'], allowAllUsers: true, requireMention: true,
    },
    log: () => undefined,
  })
  /** 把一个 session 挂到某个 chat 上，并设定本回合发起者的角色。 */
  const seed = (sessionId: string, chatId: string, role: 'admin' | 'member'): void => {
    ;(bridge as unknown as { chats: Map<string, Record<string, unknown>> }).chats.set(chatId, {
      queue: Promise.resolve(),
      activeTurnRole: role,
      sessionId,
    })
    ;(bridge as unknown as { bySession: Map<string, string> }).bySession.set(sessionId, chatId)
  }
  const tools: GroupTool[] = []
  const ctx = new Context()
  ctx.provide('tools' as never, {
    register: (tool: GroupTool) => {
      tools.push(tool)
      return () => undefined
    },
  } as never)
  registerGroupTools(ctx, bridge, connection as never)
  const tool = (name: string): GroupTool => {
    const found = tools.find(item => item.name === name)
    if (found === undefined) throw new Error('tool not registered: ' + name)
    return found
  }
  /** 模型实际读到的文本。 */
  const rendered = (name: string, value: unknown): string =>
    tool(name).output.render({}, value).map(block => block.text).join('\n')
  /** 审计行（等写入落盘后返回；文件不存在视为空）。 */
  const audit = async (): Promise<Array<Record<string, unknown>>> => {
    let lines: Array<Record<string, unknown>> = []
    try {
      const raw = readFileSync(join(mediaDir, ACTION_AUDIT_FILE), 'utf8').trim()
      lines = raw === '' ? [] : raw.split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    } catch {
      lines = []
    }
    return lines
  }
  return { root, mediaDir, bridge, tools, tool, rendered, seed, calls, audit }
}

/** 等审计行数达到 n（写入是异步串行的，轮询到齐或超时）。 */
async function waitAudit(h: ReturnType<typeof makeToolHarness>, count: number): Promise<Array<Record<string, unknown>>> {
  const deadline = Date.now() + 5_000
  let lines = await h.audit()
  while (lines.length < count && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20))
    lines = await h.audit()
  }
  expect(lines).toHaveLength(count)
  return lines
}

// ------------------------------------------------------------------ ① 能力层

describe('能力层 — 两个写操作能力默认关，说明写清后果', () => {
  it('memberDefault 与 groupDefault 全为 false（写操作等于一把刀，默认不给任何人）', () => {
    for (const [id, tools] of Object.entries(EXPECTED_CAPABILITIES)) {
      const capability = findCapability(id)
      expect(capability, id).toBeDefined()
      expect(capability!.memberDefault, id).toBe(false)
      expect(capability!.groupDefault, id).toBe(false)
      expect(capability!.tools, id).toEqual([...tools])
      // 说明里必须点明这是写操作、会真的改变群状态。
      expect(capability!.describe, id).toContain('写操作')
      expect(capability!.describe, id).toContain('会真的改变群状态')
    }
  })

  it('四个工具各归一个能力（不重不漏）', () => {
    for (const [id, tools] of Object.entries(EXPECTED_CAPABILITIES)) {
      for (const name of tools) expect(capabilityOfTool(name)?.id, name).toBe(id)
    }
    expect(new Set(GROUP_TOOLS.map(name => capabilityOfTool(name)?.id)).size).toBe(2)
    for (const name of GROUP_TOOLS) expect(capabilityOfTool(name), name).toBeDefined()
  })

  it('改造前的 11 个老能力默认位没被动过', () => {
    const writeIds = Object.keys(EXPECTED_CAPABILITIES) as string[]
    const legacy = CAPABILITIES.filter(capability =>
      !writeIds.includes(capability.id)
      && !['qq.list.groups', 'qq.list.friends', 'qq.history.private'].includes(capability.id)
      // T14 的三个互动能力与群体写操作无关，不算「老能力」。
      && !['qq.interact.react', 'qq.interact.poke', 'qq.interact.like'].includes(capability.id)
      // T15 新增的语音能力（默认关）同样不是老能力。
      && capability.id !== 'qq.voice.tts'
      // T33 的记忆库（记 / 搜）也是新增项。
      && capability.id !== 'qq.memory.store')
    expect(legacy).toHaveLength(11)
    for (const capability of legacy) {
      expect(capability.memberDefault, capability.id).toBe(true)
      expect(capability.groupDefault, capability.id).toBe(true)
    }
  })
})

// ------------------------------------------------------------------ ② 注册层

/** 等首个回合进到 agent（channel scope 在创建时注册完）。 */
async function waitForTools(h: Awaited<ReturnType<typeof makeCmdHarness>>): Promise<void> {
  const deadline = Date.now() + 15_000
  while (h.captured.channelTools.length === 0 && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  expect(h.captured.channelTools.length).toBeGreaterThan(0)
}

type ChatKind = 'admin-private' | 'member-private' | 'friend-private' | 'group'

/** 用某个身份发一句话，读出实际注册的工具名。 */
async function registeredAs(
  chat: ChatKind,
  options: Parameters<typeof makeCmdHarness>[0] = {},
): Promise<string[]> {
  const h = await makeCmdHarness({ allowAllUsers: true, ...options })
  if (chat === 'group') h.sendGroupTextAs('hi', 10001)
  else if (chat === 'admin-private') h.sendText('hi')
  else h.sendTextAs('hi', 20002)
  await waitForTools(h)
  h.client.close()
  return [...h.captured.channelTools]
}

describe('注册层 — 默认关；显式 grant 才注册', () => {
  it('管理员私聊：四个都注册（owner 档不看默认位）', async () => {
    const tools = await registeredAs('admin-private')
    for (const name of GROUP_TOOLS) expect(tools, name).toContain(name)
  })

  it('群聊：四个都不注册（其余工具照旧）', async () => {
    const tools = await registeredAs('group')
    for (const name of GROUP_TOOLS) expect(tools, name).not.toContain(name)
    expect(tools).toContain('qq_send_image')
    expect(tools).toContain('qq_group_history')
  })

  it('陌生人私聊：四个都不注册', async () => {
    const tools = await registeredAs('member-private')
    for (const name of GROUP_TOOLS) expect(tools, name).not.toContain(name)
    expect(tools).toContain('qq_napcat_api')
  })

  it('好友私聊：四个都不注册（memberDefault 对好友档同样生效）', async () => {
    const tools = await registeredAs('friend-private', { friendUsers: ['20002'] })
    for (const name of GROUP_TOOLS) expect(tools, name).not.toContain(name)
  })

  it('群聊 + memberGrant 给 qq.group.manage：禁言 / 群名片两个工具真的注册了，公告 / 精华仍没有', async () => {
    const tools = await registeredAs('group', { memberGrant: ['qq.group.manage'] })
    expect(tools).toContain('qq_group_ban')
    expect(tools).toContain('qq_group_card')
    expect(tools).not.toContain('qq_group_announce')
    expect(tools).not.toContain('qq_group_essence')
  })

  it('群聊 + memberGrant 给 qq.group.notice：公告 / 精华两个工具注册，禁言 / 名片仍没有', async () => {
    const tools = await registeredAs('group', { memberGrant: ['qq.group.notice'] })
    expect(tools).toContain('qq_group_announce')
    expect(tools).toContain('qq_group_essence')
    expect(tools).not.toContain('qq_group_ban')
    expect(tools).not.toContain('qq_group_card')
  })

  it('陌生人私聊 + strangerGrant 也按同一套规则开', async () => {
    const tools = await registeredAs('member-private', { strangerGrant: ['qq.group.manage'] })
    expect(tools).toContain('qq_group_ban')
    expect(tools).toContain('qq_group_card')
    expect(tools).not.toContain('qq_group_announce')
  })

  it('管理员私聊 + capabilitiesDeny 关掉两个写能力：四个工具一个都不注册', async () => {
    const tools = await registeredAs('admin-private', { capabilitiesDeny: ['qq.group.manage', 'qq.group.notice'] })
    for (const name of GROUP_TOOLS) expect(tools, name).not.toContain(name)
    // 别的能力不受影响。
    expect(tools).toContain('qq_send_image')
  })
})

// ------------------------------------------------- ③ 回合层门禁（本任务的关键）

describe('回合层门禁 — 能力开着也不等于谁都能用', () => {
  it('群友发起的回合：即使能力已开启（= 群里注册了工具），调用仍被拒，且一个请求都不发', async () => {
    const h = makeToolHarness()
    // 群友发言的这一回合（capability 层已经放行，模拟 memberGrant 已给）。
    h.seed('sess-group-member', 'group:888', 'member')
    const value = await h.tool('qq_group_ban').execute({ user_id: '10001', duration_seconds: 600 }, exec('sess-group-member')) as {
      ok: boolean; reason: string
    }
    expect(value.ok).toBe(false)
    expect(value.reason).toContain('只有主人本人')
    // 关键：没有任何 OneBot 请求。
    expect(h.calls).toHaveLength(0)
    expect(h.rendered('qq_group_ban', value)).toContain('没做：')
    // 被拒的调用也留痕。
    const lines = await waitAudit(h, 1)
    expect(lines[0]).toMatchObject({ chatId: 'unknown', action: 'qq_group_ban', ok: false })
    expect(String(lines[0].reason)).toContain('拒绝')
    expect(String(lines[0].reason)).toContain('只有主人本人')
  })

  it('同一个群里主人发起的回合（role=admin）：真的调用，参数原样下发', async () => {
    const h = makeToolHarness()
    h.seed('sess-group-admin', 'group:888', 'admin')
    const value = await h.tool('qq_group_ban').execute({ user_id: '10001', duration_seconds: 600 }, exec('sess-group-admin')) as { ok: boolean }
    expect(value.ok).toBe(true)
    expect(h.calls).toEqual([{
      action: 'set_group_ban',
      params: { group_id: 888, user_id: 10001, duration: 600 },
    }])
  })

  it('非管理员私聊（role=member）：同样拒绝，不发请求', async () => {
    const h = makeToolHarness()
    h.seed('sess-stranger', 'private:20002', 'member')
    for (const name of GROUP_TOOLS) {
      const args = name === 'qq_group_ban'
        ? { duration_seconds: 60, group_id: '888' }
        : name === 'qq_group_card'
          ? { user_id: '10001', card: 'x', group_id: '888' }
          : name === 'qq_group_announce'
            ? { content: '公告', group_id: '888' }
            : { message_id: '12', action: 'set' }
      const value = await h.tool(name).execute(args, exec('sess-stranger')) as { ok: boolean; reason: string }
      expect(value.ok, name).toBe(false)
      expect(value.reason, name).toContain('只有主人本人')
    }
    expect(h.calls).toHaveLength(0)
    const lines = await waitAudit(h, GROUP_TOOLS.length)
    expect(lines.every(line => line.ok === false)).toBe(true)
  })

  it('无会话映射（session 不来自 QQ）：fail-closed 拒绝，不发请求', async () => {
    const h = makeToolHarness()
    // 注意 canEditFiles 对「非 QQ 会话」是默认信任的；群管理工具不能吃这一套。
    const value = await h.tool('qq_group_announce').execute({ content: '公告', group_id: '888' }, exec('sess-web')) as {
      ok: boolean; reason: string
    }
    expect(value.ok).toBe(false)
    expect(value.reason).toContain('只能在 QQ 会话里用')
    expect(h.calls).toHaveLength(0)
    expect(h.bridge.canEditFiles('sess-web')).toBe(true)
  })

  it('私聊里不传 group_id：拒绝（不知道该管哪个群）', async () => {
    const h = makeToolHarness()
    h.seed('sess-owner-private', 'private:10001', 'admin')
    const value = await h.tool('qq_group_card').execute({ user_id: '10001', card: 'x' }, exec('sess-owner-private')) as {
      ok: boolean; reason: string
    }
    expect(value.ok).toBe(false)
    expect(value.reason).toContain('私聊')
    expect(h.calls).toHaveLength(0)
  })

  it('精华只能在群聊里设（私聊里没有「这个群」）：拒绝，不发请求', async () => {
    const h = makeToolHarness()
    h.seed('sess-owner-private', 'private:10001', 'admin')
    const value = await h.tool('qq_group_essence').execute({ message_id: '123', action: 'set' }, exec('sess-owner-private')) as {
      ok: boolean; reason: string
    }
    expect(value.ok).toBe(false)
    expect(value.reason).toContain('只能在群聊里')
    expect(h.calls).toHaveLength(0)
  })
})

// -------------------------------------------------------------- ④ 参数与调用

describe('四个工具的 action / 参数映射', () => {
  it('qq_group_ban：单人禁言 / 解禁 / 全体禁言 / 解除全体禁言', async () => {
    const h = makeToolHarness()
    h.seed('s', 'group:888', 'admin')
    await h.tool('qq_group_ban').execute({ user_id: '10001', duration_seconds: 3600 }, exec('s'))
    await h.tool('qq_group_ban').execute({ user_id: 10001, duration_seconds: 0 }, exec('s'))
    await h.tool('qq_group_ban').execute({ duration_seconds: 60 }, exec('s'))
    await h.tool('qq_group_ban').execute({ duration_seconds: 0 }, exec('s'))
    expect(h.calls).toEqual([
      { action: 'set_group_ban', params: { group_id: 888, user_id: 10001, duration: 3600 } },
      { action: 'set_group_ban', params: { group_id: 888, user_id: 10001, duration: 0 } },
      { action: 'set_group_whole_ban', params: { group_id: 888, enable: true } },
      { action: 'set_group_whole_ban', params: { group_id: 888, enable: false } },
    ])
  })

  it('qq_group_ban：显式 group_id 覆盖当前群', async () => {
    const h = makeToolHarness()
    h.seed('s', 'group:888', 'admin')
    await h.tool('qq_group_ban').execute({ duration_seconds: 60, group_id: '999' }, exec('s'))
    expect(h.calls[0]).toEqual({ action: 'set_group_whole_ban', params: { group_id: 999, enable: true } })
  })

  it('qq_group_card：改名片与清除名片（空串）', async () => {
    const h = makeToolHarness()
    h.seed('s', 'group:888', 'admin')
    await h.tool('qq_group_card').execute({ user_id: '10001', card: '新名字' }, exec('s'))
    await h.tool('qq_group_card').execute({ user_id: '10001', card: '' }, exec('s'))
    expect(h.calls).toEqual([
      { action: 'set_group_card', params: { group_id: 888, user_id: 10001, card: '新名字' } },
      { action: 'set_group_card', params: { group_id: 888, user_id: 10001, card: '' } },
    ])
  })

  it('qq_group_announce：content 原样下发到 _send_group_notice', async () => {
    const h = makeToolHarness()
    h.seed('s', 'group:888', 'admin')
    const value = await h.tool('qq_group_announce').execute({ content: '今晚八点开会' }, exec('s')) as { ok: boolean; length: number }
    expect(value.ok).toBe(true)
    expect(value.length).toBe(6)
    expect(h.calls).toEqual([{ action: '_send_group_notice', params: { group_id: 888, content: '今晚八点开会' } }])
  })

  it('qq_group_essence：set / remove 分别映射两个 action', async () => {
    const h = makeToolHarness()
    h.seed('s', 'group:888', 'admin')
    await h.tool('qq_group_essence').execute({ message_id: '12345', action: 'set' }, exec('s'))
    await h.tool('qq_group_essence').execute({ message_id: '12345', action: 'remove' }, exec('s'))
    expect(h.calls).toEqual([
      { action: 'set_essence_msg', params: { message_id: '12345' } },
      { action: 'delete_essence_msg', params: { message_id: '12345' } },
    ])
  })

  it('essence 的 action 只能是 set / remove（说明里逐个列出来，代码里再校验一次）', () => {
    const h = makeToolHarness()
    const description = h.tool('qq_group_essence').parameters.properties?.action?.description ?? ''
    expect(description).toContain('set')
    expect(description).toContain('remove')
  })
})

describe('参数校验 — 越界一律拒绝（不夹逼、不猜）', () => {
  const rejected = async (toolName: string, args: Record<string, unknown>, expectInReason: string): Promise<void> => {
    const h = makeToolHarness()
    h.seed('s', 'group:888', 'admin')
    const value = await h.tool(toolName).execute(args, exec('s')) as { ok: boolean; reason: string }
    expect(value.ok, toolName + ' ' + JSON.stringify(args)).toBe(false)
    expect(value.reason, toolName).toContain(expectInReason)
    // 参数不过关就不发请求。
    expect(h.calls, toolName).toHaveLength(0)
  }

  it('duration_seconds 负数 → 拒绝（不会当成解除禁言）', async () => {
    await rejected('qq_group_ban', { user_id: '10001', duration_seconds: -60 }, '不能是负数')
  })

  it('duration_seconds 超上限 → 拒绝（不会偷偷夹到 30 天）', async () => {
    await rejected('qq_group_ban', { user_id: '10001', duration_seconds: MAX_BAN_SECONDS + 1 }, '最多 ' + MAX_BAN_SECONDS)
  })

  it('duration_seconds 不是数字 → 拒绝', async () => {
    // 数字字符串是有意支持的（模型常把数字写成字符串），解析不出来才拒绝。
    // （NaN / Infinity 不是合法 JSON，模型发不出来，所以这里只测字符串形态。）
    await rejected('qq_group_ban', { user_id: '10001', duration_seconds: 'abc' }, '要填秒数')
    await rejected('qq_group_ban', { user_id: '10001', duration_seconds: '' }, '要填秒数')
  })

  it('user_id 不是 QQ 号 → 拒绝', async () => {
    await rejected('qq_group_ban', { user_id: 'abc', duration_seconds: 60 }, 'user_id')
    await rejected('qq_group_card', { user_id: 'abc', card: 'x' }, 'user_id')
  })

  it('公告超长 / 空 → 拒绝', async () => {
    await rejected('qq_group_announce', { content: '字'.repeat(MAX_ANNOUNCE_CHARS + 1) }, '最多 ' + MAX_ANNOUNCE_CHARS)
    await rejected('qq_group_announce', { content: '   ' }, 'content 必填')
  })

  it('群名片超长 → 拒绝；card 不是字符串 → 宿主参数校验先挡下（不发请求）', async () => {
    await rejected('qq_group_card', { user_id: '10001', card: '字'.repeat(MAX_CARD_CHARS + 1) }, '最多 ' + MAX_CARD_CHARS)
    const h = makeToolHarness()
    h.seed('s', 'group:888', 'admin')
    await expect(h.tool('qq_group_card').execute({ user_id: '10001', card: 42 }, exec('s'))).rejects.toThrow('card')
    expect(h.calls).toHaveLength(0)
  })

  it('essence：message_id 非数字 / action 非法 → 拒绝', async () => {
    await rejected('qq_group_essence', { message_id: 'abc', action: 'set' }, 'message_id')
    await rejected('qq_group_essence', { message_id: '12', action: 'delete' }, 'set 或 remove')
  })
})

// ------------------------------------------------------------------- 审计

describe('审计 — 每次调用都往 qq-actions.log 写一行（与工具发送同一套格式）', () => {
  it('成功一次：jsonl 一行，含 ts / chatId / action / ok / reason（目标 + 参数摘要）', async () => {
    const h = makeToolHarness()
    h.seed('s', 'group:888', 'admin')
    await h.tool('qq_group_ban').execute({ user_id: '10001', duration_seconds: 3600 }, exec('s'))
    const lines = await waitAudit(h, 1)
    expect(lines[0]).toMatchObject({ chatId: 'group:888', action: 'qq_group_ban', ok: true })
    expect(typeof lines[0].ts).toBe('number')
    expect(String(lines[0].reason)).toContain('10001')
    expect(String(lines[0].reason)).toContain('3600 秒')
    expect(String(lines[0].reason)).toContain('成功')
    // 文件名与现有审计一致（qq-actions.log），且是追加而不是覆盖。
    expect(readFileSync(join(h.mediaDir, ACTION_AUDIT_FILE), 'utf8').endsWith('\n')).toBe(true)
  })

  it('四个工具各记一行：公告记字数、名片记内容、精华记消息 id 与动作', async () => {
    const h = makeToolHarness()
    h.seed('s', 'group:888', 'admin')
    await h.tool('qq_group_announce').execute({ content: '今晚开会' }, exec('s'))
    await h.tool('qq_group_card').execute({ user_id: '10001', card: '小助手' }, exec('s'))
    await h.tool('qq_group_essence').execute({ message_id: '777', action: 'remove' }, exec('s'))
    await h.tool('qq_group_ban').execute({ duration_seconds: 0 }, exec('s'))
    const lines = await waitAudit(h, 4)
    expect(lines.map(line => line.action)).toEqual(['qq_group_announce', 'qq_group_card', 'qq_group_essence', 'qq_group_ban'])
    expect(String(lines[0].reason)).toContain('公告 4 字')
    expect(String(lines[1].reason)).toContain('小助手')
    expect(String(lines[2].reason)).toContain('取消精华')
    expect(String(lines[2].reason)).toContain('777')
    expect(String(lines[3].reason)).toContain('解除全体禁言')
    expect(lines.every(line => line.ok === true)).toBe(true)
  })

  it('OneBot 调用失败：审计记 ok:false 带原因，模型拿到可读的失败', async () => {
    const h = makeToolHarness({ failWith: '权限不足' })
    h.seed('s', 'group:888', 'admin')
    const value = await h.tool('qq_group_ban').execute({ user_id: '10001', duration_seconds: 60 }, exec('s')) as {
      ok: boolean; reason: string
    }
    expect(value.ok).toBe(false)
    expect(value.reason).toContain('权限不足')
    // 请求确实发了（这次失败来自服务端，不是门禁）。
    expect(h.calls).toHaveLength(1)
    const lines = await waitAudit(h, 1)
    expect(lines[0]).toMatchObject({ chatId: 'group:888', action: 'qq_group_ban', ok: false })
    expect(String(lines[0].reason)).toContain('失败')
    expect(String(lines[0].reason)).toContain('权限不足')
  })

  it('参数不合法的调用也留痕（ok:false + 拒绝原因）', async () => {
    const h = makeToolHarness()
    h.seed('s', 'group:888', 'admin')
    await h.tool('qq_group_ban').execute({ user_id: '10001', duration_seconds: -1 }, exec('s'))
    const lines = await waitAudit(h, 1)
    expect(lines[0]).toMatchObject({ chatId: 'group:888', action: 'qq_group_ban', ok: false })
    expect(String(lines[0].reason)).toContain('拒绝')
    expect(String(lines[0].reason)).toContain('不能是负数')
  })

  it('actionAuditEnabled=false 时一行都不写（与工具发送审计同一个开关）', async () => {
    const h = makeToolHarness()
    // 直接改造审计开关（config 是构造后仍可读的同一个对象）。
    ;(h.bridge as unknown as { deps: { config: Record<string, unknown> } }).deps.config.actionAuditEnabled = false
    h.seed('s', 'group:888', 'admin')
    await h.tool('qq_group_ban').execute({ user_id: '10001', duration_seconds: 60 }, exec('s'))
    expect(await h.audit()).toHaveLength(0)
  })
})

// --------------------------------------------------------------- /doctor

describe('/doctor 群管理提示行', () => {
  /** 一个最小的 /doctor deps（只关心能力行与提示行）。 */
  const doctorDeps = (config: Record<string, string[]>) => ({
    mediaDir: mkdtempSync(join(tmpdir(), 'group-doctor-')),
    connection: { connected: true, selfId: '10002' },
    transport: { host: '127.0.0.1', port: 8643 },
    retryState: {},
    dedup: { entries: 0, windowSeconds: 300 },
    configSnapshot: {},
    groupWriteWarning: () => groupWriteWarningLine({ config, deps: [] }),
    log: () => undefined,
  })

  it('默认配置（全关）：/doctor 不出这句', async () => {
    const report = await healthReport(doctorDeps({}))
    expect(report).not.toContain('群管理写操作已开启')
    // 纯函数同样返回空串。
    expect(groupWriteWarningLine({ config: {}, deps: [] })).toBe('')
  })

  it('群聊开了 qq.group.manage：提示行点出禁言/群名片，顺带说明群友要求也会被拒', async () => {
    const report = await healthReport(doctorDeps({ memberGrant: ['qq.group.manage'] }))
    expect(report).toContain('⚠ 群管理写操作已开启：qq.group.manage（禁言/群名片）')
    expect(report).toContain('群友要求时也会被拒')
    // 只开了其中一个，就不提另一个。
    expect(report).not.toContain('qq.group.notice')
  })

  it('两个都开了：两个能力都点名，顺序 = 能力注册表顺序', async () => {
    const line = groupWriteWarningLine({ config: { memberGrant: ['qq.group.notice', 'qq.group.manage'] }, deps: [] })
    expect(line).toBe('⚠ 群管理写操作已开启：qq.group.manage（禁言/群名片）、qq.group.notice（公告/精华）——群友要求时也会被拒，但请确认这是你要的')
  })

  it('只在好友档开也提示（判据是任何一个非主人档开着）', () => {
    expect(groupWriteWarningLine({ config: { friendGrant: ['qq.group.notice'] }, deps: [] })).toContain('qq.group.notice')
  })

  it('grant 写了但被 capabilitiesDeny 关掉：不出这句（关是真的关）', () => {
    expect(groupWriteWarningLine({
      config: { memberGrant: ['qq.group.manage'], capabilitiesDeny: ['qq.group.manage'] },
      deps: [],
    })).toBe('')
  })

  it('bridge → /doctor 全线打通：memberGrant 之后提示行真的出现在报告里', async () => {
    for (const [options, expected] of [
      [{}, false],
      [{ memberGrant: ['qq.group.manage'] }, true],
    ] as const) {
      const h = await makeCmdHarness(options)
      const deps = (h.bridge as unknown as { healthDeps(): { groupWriteWarning?: () => string } }).healthDeps()
      const line = deps.groupWriteWarning?.() ?? ''
      h.client.close()
      expect(line !== '', JSON.stringify(options)).toBe(expected)
      if (expected) expect(line).toContain('qq.group.manage')
    }
  })
})