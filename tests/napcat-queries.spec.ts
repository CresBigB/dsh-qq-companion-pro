/**
 * T12 · 四个查询类工具（群列表 / 好友列表 / 群资料 / 私聊历史）。
 *
 * 覆盖三层：
 *   ① 能力层：三个新能力（qq.list.groups / qq.list.friends / qq.history.private）
 *      的默认位**全是 false**，工具归属正确；老能力默认位不受影响；
 *   ② 注册层（真 bridge + 真能力判定）：管理员私聊里四个都注册；群聊 / 好友私聊 /
 *      陌生人私聊里默认一个都没有；`memberGrant` / `strangerGrant` 加上能力 id 后
 *      对应档真的注册（证明按角色授权可用）；`capabilitiesDeny` 照样能关掉；
 *   ③ 工具层（recording connection）：分页参数与截断规则、群资料「拿不到就说
 *      拿不到」、私聊历史的隐私闸门与行格式、以及**返回数据里不含 accessToken /
 *      cookies 之类的敏感字段**。
 * @module dsh-qq-companion-pro/tests/napcat-queries
 */
import { mkdtempSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'

import { ChatBridge } from '../src/bridge.js'
import { registerTools } from '../src/tools.js'
import { CAPABILITIES, capabilityOfTool, findCapability } from '../src/capabilities.js'
import { makeCmdHarness } from './helpers/bridge-harness.js'

/** 这一批新增的四个工具（顺序无关）。 */
const NEW_TOOLS = ['qq_list_groups', 'qq_group_info', 'qq_list_friends', 'qq_private_history']

interface QueryTool {
  name: string
  description: string
  /** defineTool 会把参数声明编译成 JSON Schema。 */
  parameters: { properties?: Record<string, { description?: string; required?: boolean }> }
  output: { render: (args: unknown, value: unknown) => Array<{ type: string; text: string }> }
  execute: (args: unknown, exec?: unknown) => Promise<unknown>
}

/** 真 ChatBridge + 注册好全部工具，connection 只记录调用并按 handlers 回桩数据。 */
async function makeQueryHarness() {
  const root = mkdtempSync(join(tmpdir(), 'napcat-q-'))
  const mediaDir = join(root, 'media')
  await mkdir(mediaDir)

  const calls: Array<{ action: string; params: Record<string, unknown> }> = []
  /** action → 桩（返回数据或抛错）。没登记的 action 视为测试写漏了。 */
  const handlers = new Map<string, (params: Record<string, unknown>) => unknown>()
  const connection = {
    call: async (action: string, params: Record<string, unknown>) => {
      calls.push({ action, params })
      const handler = handlers.get(action)
      if (handler === undefined) throw new Error('unexpected OneBot action: ' + action)
      return handler(params)
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

  /** 把一个 session 挂到某个 chat 上（responses 走 isAdminPrivateChat / resolveChat）。 */
  const seed = (sessionId: string, chatId: string): void => {
    ;(bridge as unknown as { chats: Map<string, Record<string, unknown>> }).chats.set(chatId, {
      queue: Promise.resolve(),
      activeTurnRole: 'admin',
      sessionId,
    })
    ;(bridge as unknown as { bySession: Map<string, string> }).bySession.set(sessionId, chatId)
  }

  const ctx = new Context()
  const tools: QueryTool[] = []
  ctx.provide('tools' as never, {
    register: (tool: QueryTool) => {
      tools.push(tool)
      return () => undefined
    },
  } as never)
  registerTools(ctx, bridge, connection as never, {
    maxImageBytes: 1_000_000,
    maxVoiceBytes: 1_000_000,
    maxFileBytes: 1_000_000,
  })
  const tool = (name: string): QueryTool => {
    const found = tools.find(item => item.name === name)
    if (found === undefined) throw new Error('tool not registered: ' + name)
    return found
  }
  const exec = (sessionId: string) => ({ agent: { session: { id: sessionId } } })
  /** 模型实际读到的文本（output.render 的产物）。 */
  const rendered = (name: string, args: unknown, value: unknown): string => {
    return tool(name).output.render(args, value).map(block => block.text).join('\n')
  }
  return { bridge, tools, tool, exec, rendered, seed, calls, handlers }
}

// ------------------------------------------------------------------ 能力层

describe('三个新能力：默认位全关、工具归属正确、老能力不动', () => {
  const expected = {
    'qq.list.groups': ['qq_list_groups', 'qq_group_info'],
    'qq.list.friends': ['qq_list_friends'],
    'qq.history.private': ['qq_private_history'],
  } as const

  it('memberDefault 与 groupDefault 全部为 false（群列表 / 好友列表 / 私聊历史都是账号隐私）', () => {
    for (const [id, tools] of Object.entries(expected)) {
      const capability = findCapability(id)
      expect(capability, id).toBeDefined()
      expect(capability!.memberDefault, id).toBe(false)
      expect(capability!.groupDefault, id).toBe(false)
      expect(capability!.tools, id).toEqual([...tools])
    }
  })

  it('四个新工具各归一个能力（不重不漏），且说明里写清这是隐私数据', () => {
    for (const [id, tools] of Object.entries(expected)) {
      for (const name of tools) expect(capabilityOfTool(name)?.id, name).toBe(id)
      expect(findCapability(id)!.describe, id).toContain('隐私')
      expect(findCapability(id)!.describe.length, id).toBeGreaterThan(8)
    }
    expect(new Set(NEW_TOOLS.map(name => capabilityOfTool(name)?.id)).size).toBe(3)
  })

  it('改造前的老能力默认位仍全开（只增不改）', () => {
    // T12 的三个隐私能力、T13 的两个群管理写操作、T14 的戳/点赞都是默认关的新增项，
    // 其余仍是老能力（表情回应虽然默认开，但它是 T14 的新增项，不算老能力）。
    const T13_WRITE = ['qq.group.manage', 'qq.group.notice']
    const T14_INTERACT = ['qq.interact.react', 'qq.interact.poke', 'qq.interact.like']
    const legacy = CAPABILITIES.filter(capability =>
      !Object.prototype.hasOwnProperty.call(expected, capability.id)
      && !T13_WRITE.includes(capability.id)
      && !T14_INTERACT.includes(capability.id))
    expect(legacy.length).toBe(11)
    for (const capability of legacy) {
      expect(capability.memberDefault, capability.id).toBe(true)
      expect(capability.groupDefault, capability.id).toBe(true)
    }
    // T13 的两项写操作默认位全是 false（与隐私能力同一条纪律）。
    for (const id of T13_WRITE) {
      const capability = findCapability(id)
      expect(capability, id).toBeDefined()
      expect(capability!.memberDefault, id).toBe(false)
      expect(capability!.groupDefault, id).toBe(false)
    }
  })

  it('四个工具的描述都点明隐私数据与「只在主人私聊」', async () => {
    const h = await makeQueryHarness()
    for (const name of NEW_TOOLS) {
      const description = h.tool(name).description
      expect(description, name).toMatch(/隐私/)
      expect(description, name).toMatch(/主人.*私聊/)
    }
  })
})

// ------------------------------------------------------------------ 注册层

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

describe('注册层 — 只有管理员私聊默认拿到这四个工具', () => {
  it('管理员私聊：四个都注册', async () => {
    const tools = await registeredAs('admin-private')
    for (const name of NEW_TOOLS) expect(tools, name).toContain(name)
  })

  it('群聊：四个都不注册（其余工具照旧，说明只少了这四个）', async () => {
    const tools = await registeredAs('group')
    for (const name of NEW_TOOLS) expect(tools, name).not.toContain(name)
    expect(tools).toContain('qq_send_image')
    expect(tools).toContain('qq_group_history')
  })

  it('陌生人私聊：四个都不注册', async () => {
    const tools = await registeredAs('member-private')
    for (const name of NEW_TOOLS) expect(tools, name).not.toContain(name)
    expect(tools).toContain('qq_napcat_api')
  })

  it('好友私聊：四个都不注册（memberDefault 为 false 对好友档同样生效）', async () => {
    const tools = await registeredAs('friend-private', { friendUsers: ['20002'] })
    for (const name of NEW_TOOLS) expect(tools, name).not.toContain(name)
  })

  it('群聊 + memberGrant 加上 qq.list.groups：群资料那两个工具真的注册了，另两个仍然没有', async () => {
    const tools = await registeredAs('group', { memberGrant: ['qq.list.groups'] })
    expect(tools).toContain('qq_list_groups')
    expect(tools).toContain('qq_group_info')
    expect(tools).not.toContain('qq_list_friends')
    expect(tools).not.toContain('qq_private_history')
  })

  it('陌生人私聊 + strangerGrant 加上 qq.list.friends：只多这一个', async () => {
    const tools = await registeredAs('member-private', { strangerGrant: ['qq.list.friends'] })
    expect(tools).toContain('qq_list_friends')
    expect(tools).not.toContain('qq_list_groups')
    expect(tools).not.toContain('qq_private_history')
  })

  it('管理员私聊 + capabilitiesDeny 关掉 qq.history.private：只少那一个', async () => {
    const tools = await registeredAs('admin-private', { capabilitiesDeny: ['qq.history.private'] })
    expect(tools).not.toContain('qq_private_history')
    expect(tools).toContain('qq_list_groups')
    expect(tools).toContain('qq_list_friends')
  })
})

// -------------------------------------------------------------------- 群列表

/** 造 n 个群；第 0 个群名故意超长（测截断）。 */
function makeGroups(count: number): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, index) => ({
    group_id: 1000 + index,
    group_name: index === 0 ? '群'.repeat(60) : '群' + index,
    member_count: String(10 + index), // NapCat 有时给字符串，要能转成数字
    max_member_count: 500,
  }))
}

describe('qq_list_groups — 分页与截断', () => {
  it('默认每页 50 条、总数照实报、还有更多时提示用 page 翻页', async () => {
    const h = await makeQueryHarness()
    h.handlers.set('get_group_list', () => makeGroups(120))
    const value = await h.tool('qq_list_groups').execute({}) as {
      total: number; page: number; limit: number; has_more: boolean
      groups: Array<Record<string, unknown>>
    }
    expect(value.total).toBe(120)
    expect(value.page).toBe(1)
    expect(value.limit).toBe(50)
    expect(value.groups).toHaveLength(50)
    expect(value.has_more).toBe(true)
    // 只调一次 get_group_list（分页在本地切，不重复打 API）。
    expect(h.calls.filter(call => call.action === 'get_group_list')).toHaveLength(1)
    const text = h.rendered('qq_list_groups', {}, value)
    expect(text).toContain('共 120 个群，第 1 页（每页 50）')
    expect(text).toContain('还有更多：用 page=2 翻页')
    expect(text).toContain('群号 1000')
    expect(text).toContain('10 人')
  })

  it('page=3 拿到剩下 20 条，没有下一页提示', async () => {
    const h = await makeQueryHarness()
    h.handlers.set('get_group_list', () => makeGroups(120))
    const value = await h.tool('qq_list_groups').execute({ page: 3 }) as {
      groups: unknown[]; has_more: boolean; page: number
    }
    expect(value.page).toBe(3)
    expect(value.groups).toHaveLength(20)
    expect(value.has_more).toBe(false)
    const text = h.rendered('qq_list_groups', { page: 3 }, value)
    expect(text).not.toContain('还有更多')
    expect(text).toContain('第 3 页')
  })

  it('limit 越界被夹到 [1, 100]：500 → 100 条，0 → 1 条；page 负数按第一页', async () => {
    const h = await makeQueryHarness()
    h.handlers.set('get_group_list', () => makeGroups(120))
    const big = await h.tool('qq_list_groups').execute({ limit: 500 }) as { limit: number; groups: unknown[] }
    expect(big.limit).toBe(100)
    expect(big.groups).toHaveLength(100)
    const tiny = await h.tool('qq_list_groups').execute({ limit: 0 }) as { limit: number; groups: unknown[] }
    expect(tiny.limit).toBe(1)
    expect(tiny.groups).toHaveLength(1)
    const weird = await h.tool('qq_list_groups').execute({ page: -3 }) as { limit: number; page: number }
    expect(weird.limit).toBe(50)
    expect(weird.page).toBe(1)
  })

  it('群名超 40 字截断加省略号；成员数认字符串；in_group 恒为 true', async () => {
    const h = await makeQueryHarness()
    h.handlers.set('get_group_list', () => makeGroups(2))
    const value = await h.tool('qq_list_groups').execute({}) as {
      groups: Array<{ group_id: string; group_name: string; member_count: number; in_group: boolean }>
    }
    expect(value.groups[0].group_name).toBe('群'.repeat(40) + '…')
    expect(value.groups[0].group_name).toHaveLength(41)
    expect(value.groups[0].member_count).toBe(10)
    expect(value.groups[0].in_group).toBe(true)
    expect(value.groups[1].group_name).toBe('群1')
  })

  it('拿到空列表时如实说没有，不编造', async () => {
    const h = await makeQueryHarness()
    h.handlers.set('get_group_list', () => [])
    const value = await h.tool('qq_list_groups').execute({}) as { total: number }
    expect(value.total).toBe(0)
    expect(h.rendered('qq_list_groups', {}, value)).toContain('没有拉到群列表')
  })

  it('返回数据里不含 accessToken / cookies 这类敏感字段', async () => {
    const h = await makeQueryHarness()
    h.handlers.set('get_group_list', () => [
      { group_id: 1, group_name: '群', member_count: 1, accessToken: 'SECRET-TOKEN', cookies: 'SECRET-COOKIE' },
    ])
    const value = await h.tool('qq_list_groups').execute({})
    const json = JSON.stringify(value)
    expect(json).not.toContain('SECRET')
    expect(json).not.toContain('accessToken')
    expect(json).not.toContain('cookies')
  })
})

// -------------------------------------------------------------------- 好友列表

describe('qq_list_friends — 分页、备注与截断', () => {
  it('默认一页 50 条；好友多时提醒用 page 翻页；昵称/备注超长截断', async () => {
    const h = await makeQueryHarness()
    const friends = Array.from({ length: 60 }, (_, index) => ({
      user_id: 30000 + index,
      nickname: index === 0 ? '昵'.repeat(60) : '好友' + index,
      remark: index === 0 ? '备'.repeat(60) : '备注' + index,
    }))
    h.handlers.set('get_friend_list', () => friends)
    const value = await h.tool('qq_list_friends').execute({}) as {
      total: number; limit: number; has_more: boolean
      friends: Array<{ user_id: string; nickname: string; remark: string }>
    }
    expect(value.total).toBe(60)
    expect(value.limit).toBe(50)
    expect(value.has_more).toBe(true)
    expect(value.friends).toHaveLength(50)
    expect(value.friends[0].nickname).toBe('昵'.repeat(40) + '…')
    expect(value.friends[0].remark).toBe('备'.repeat(40) + '…')
    const text = h.rendered('qq_list_friends', {}, value)
    expect(text).toContain('共 60 个好友，第 1 页（每页 50）')
    expect(text).toContain('好友比较多：用 page=2 翻页')
    expect(text).toContain('备注：备注1')
  })

  it('第二页拿到剩下 10 条，且没有翻页提示', async () => {
    const h = await makeQueryHarness()
    h.handlers.set('get_friend_list', () => Array.from({ length: 60 }, (_, index) => ({ user_id: 30000 + index, nickname: 'n' + index })))
    const value = await h.tool('qq_list_friends').execute({ page: 2 }) as { friends: unknown[]; has_more: boolean }
    expect(value.friends).toHaveLength(10)
    expect(value.has_more).toBe(false)
    expect(h.rendered('qq_list_friends', { page: 2 }, value)).not.toContain('翻页')
  })

  it('数据量大时返回的数据里带翻页说明（note 字段）', async () => {
    const h = await makeQueryHarness()
    h.handlers.set('get_friend_list', () => [{ user_id: 1, nickname: 'a' }])
    const value = await h.tool('qq_list_friends').execute({}) as { note: string }
    expect(value.note).toContain('page 翻页')
    expect(value.note).toContain('截断')
  })
})

// -------------------------------------------------------------------- 群资料

describe('qq_group_info — 群资料与「拿不到就说拿不到」', () => {
  it('群号 / 群名 / 成员数 / 群主 / 公告摘要', async () => {
    const h = await makeQueryHarness()
    h.seed('sess-owner', 'private:10001')
    h.handlers.set('get_group_info', () => ({
      group_id: 888, group_name: '测试群', member_count: 42, max_member_count: 500,
      owner_id: 10001, accessToken: 'SECRET-TOKEN', cookies: 'SECRET-COOKIE',
    }))
    h.handlers.set('get_group_notice', () => [{ content: '群规：不许刷屏' }, { content: '第二条公告' }])
    const value = await h.tool('qq_group_info').execute({ group_id: 888 }, h.exec('sess-owner')) as {
      group_id: string; group_name: string; member_count: number; max_member_count: number
      owner_id: string; announcement: string; unavailable: string[]
    }
    expect(value.group_id).toBe('888')
    expect(value.group_name).toBe('测试群')
    expect(value.member_count).toBe(42)
    expect(value.max_member_count).toBe(500)
    expect(value.owner_id).toBe('10001')
    expect(value.announcement).toContain('群规：不许刷屏')
    expect(value.announcement).toContain('第二条公告')
    expect(value.unavailable).toEqual([])
    const text = h.rendered('qq_group_info', { group_id: 888 }, value)
    expect(text).toContain('群 888「测试群」')
    expect(text).toContain('成员：42/500')
    expect(text).toContain('群主：10001')
    expect(text).toContain('公告：群规：不许刷屏')
    // 只挑需要的字段：API 响应里的敏感字段一个都不进结果。
    const json = JSON.stringify(value)
    expect(json).not.toContain('SECRET')
    expect(json).not.toContain('accessToken')
  })

  it('公告拿不到（action 报错）→ announcement 为 null、unavailable 里有公告、文本如实说拿不到', async () => {
    const h = await makeQueryHarness()
    h.seed('sess-owner', 'private:10001')
    h.handlers.set('get_group_info', () => ({ group_id: 888, group_name: '测试群', member_count: 42, owner_id: 10001 }))
    h.handlers.set('get_group_notice', () => { throw new Error('action not supported') })
    const value = await h.tool('qq_group_info').execute({ group_id: 888 }, h.exec('sess-owner')) as {
      announcement: string | null; unavailable: string[]
    }
    expect(value.announcement).toBeNull()
    expect(value.unavailable).toContain('公告')
    const text = h.rendered('qq_group_info', { group_id: 888 }, value)
    expect(text).toContain('公告：拿不到')
    expect(text).toContain('别猜、别编')
  })

  it('群主拿不到时也不编：unavailable 里点出群主', async () => {
    const h = await makeQueryHarness()
    h.seed('sess-owner', 'private:10001')
    h.handlers.set('get_group_info', () => ({ group_id: 888, group_name: '测试群', member_count: 42 }))
    h.handlers.set('get_group_notice', () => [])
    const value = await h.tool('qq_group_info').execute({ group_id: 888 }, h.exec('sess-owner')) as {
      owner_id: string | null; unavailable: string[]
    }
    expect(value.owner_id).toBeNull()
    expect(value.unavailable).toContain('群主')
    expect(h.rendered('qq_group_info', { group_id: 888 }, value)).toContain('群主：拿不到')
  })

  it('群聊里省略 group_id 时用当前群；私聊里省略则报错要求传 group_id', async () => {
    const h = await makeQueryHarness()
    h.seed('sess-group', 'group:888')
    h.seed('sess-owner', 'private:10001')
    h.handlers.set('get_group_info', () => ({ group_id: 888, group_name: '测试群' }))
    h.handlers.set('get_group_notice', () => [])
    await h.tool('qq_group_info').execute({}, h.exec('sess-group'))
    expect(h.calls.find(call => call.action === 'get_group_info')?.params).toEqual({ group_id: 888 })
    await expect(h.tool('qq_group_info').execute({}, h.exec('sess-owner')))
      .rejects.toThrow(/需要 group_id/)
  })
})

// ---------------------------------------------------------------- 私聊历史

describe('qq_private_history — 隐私闸门与行格式', () => {
  const t = Math.floor(new Date(2026, 9, 21, 16, 5).getTime() / 1000)

  /** 一段私聊历史：一条纯文本 + 一条图片/语音（二进制与 URL 都不许进结果）。 */
  function seedHistory(h: Awaited<ReturnType<typeof makeQueryHarness>>): void {
    h.handlers.set('get_friend_msg_history', () => ({
      messages: [
        { message_id: 7, time: t, sender: { user_id: 30003, nickname: '小王' }, message: [{ type: 'text', data: { text: '晚上吃啥' } }] },
        {
          message_id: 8, time: t + 60, sender: { user_id: 10001, nickname: '主人' },
          message: [
            { type: 'image', data: { file: 'base64://AAAA', url: 'https://x/y.png' } },
            { type: 'record', data: { file: 'a.amr' } },
          ],
        },
      ],
    }))
  }

  it('管理员私聊里可用：发给 get_friend_msg_history，行格式与 qq_group_history 一致', async () => {
    const h = await makeQueryHarness()
    h.seed('sess-owner', 'private:10001')
    seedHistory(h)
    const value = await h.tool('qq_private_history').execute({ friend_qq: '30003' }, h.exec('sess-owner')) as Array<Record<string, unknown>>
    expect(h.calls.find(call => call.action === 'get_friend_msg_history')?.params).toEqual({ user_id: 30003, count: 20 })
    expect(value).toHaveLength(2)
    expect(value[0]).toMatchObject({ message_id: '7', user_id: '30003', nickname: '小王', text: '晚上吃啥' })
    // 非文本段落只留占位符，二进制与远端 URL 都不进结果。
    expect(value[1].text).toBe('[图片][语音]')
    const json = JSON.stringify(value)
    expect(json).not.toContain('base64')
    expect(json).not.toContain('https://x/y.png')
    const text = h.rendered('qq_private_history', { friend_qq: '30003' }, value)
    expect(text).toContain('与 30003 的私聊最近 2 条')
    expect(text).toContain('[16:05] 小王（30003）：晚上吃啥  〔id 7〕')
  })

  it('count 夹到 1…50（200 → 50，0 → 1）', async () => {
    const h = await makeQueryHarness()
    h.seed('sess-owner', 'private:10001')
    seedHistory(h)
    await h.tool('qq_private_history').execute({ friend_qq: '30003', count: 200 }, h.exec('sess-owner'))
    await h.tool('qq_private_history').execute({ friend_qq: '30003', count: 0 }, h.exec('sess-owner'))
    const counts = h.calls.filter(call => call.action === 'get_friend_msg_history').map(call => call.params.count)
    expect(counts).toEqual([50, 1])
  })

  it('群聊里调用直接拒绝，并说明原因；一次请求都不发', async () => {
    const h = await makeQueryHarness()
    h.seed('sess-group', 'group:888')
    seedHistory(h)
    await expect(h.tool('qq_private_history').execute({ friend_qq: '30003' }, h.exec('sess-group')))
      .rejects.toThrow(/只能用在与主人的私聊里/)
    expect(h.calls).toHaveLength(0)
  })

  it('好友私聊与陌生人私聊里同样拒绝', async () => {
    const h = await makeQueryHarness()
    h.seed('sess-friend', 'private:20002')
    h.seed('sess-stranger', 'private:30003')
    seedHistory(h)
    for (const sessionId of ['sess-friend', 'sess-stranger']) {
      await expect(h.tool('qq_private_history').execute({ friend_qq: '30003' }, h.exec(sessionId)))
        .rejects.toThrow(/只能用在与主人的私聊里/)
    }
    expect(h.calls).toHaveLength(0)
  })

  it('没有会话映射（例如 Web 会话）时同样拒绝', async () => {
    const h = await makeQueryHarness()
    seedHistory(h)
    await expect(h.tool('qq_private_history').execute({ friend_qq: '30003' }, h.exec('sess-web')))
      .rejects.toThrow(/只能用在与主人的私聊里/)
    expect(h.calls).toHaveLength(0)
  })

  it('friend_qq 不是 QQ 号时拒绝（不发请求）；完全不给则由参数校验挡下', async () => {
    const h = await makeQueryHarness()
    h.seed('sess-owner', 'private:10001')
    seedHistory(h)
    for (const friend_qq of ['', 'abc', '-1', 'abc123']) {
      await expect(h.tool('qq_private_history').execute({ friend_qq }, h.exec('sess-owner')))
        .rejects.toThrow(/friend_qq 必填/)
    }
    await expect(h.tool('qq_private_history').execute({}, h.exec('sess-owner')))
      .rejects.toThrow(/friend_qq/)
    expect(h.calls).toHaveLength(0)
  })

  it('空历史如实说没有', async () => {
    const h = await makeQueryHarness()
    h.seed('sess-owner', 'private:10001')
    h.handlers.set('get_friend_msg_history', () => ({ messages: [] }))
    const value = await h.tool('qq_private_history').execute({ friend_qq: '30003' }, h.exec('sess-owner'))
    expect(value).toEqual([])
    expect(h.rendered('qq_private_history', { friend_qq: '30003' }, value)).toContain('没有拉到和 30003 的私聊历史')
  })
})