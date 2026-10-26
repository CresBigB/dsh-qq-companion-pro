/**
 * T14 · 轻互动工具（表情回应 / 戳一戳 / 点赞）的契约与安全边界。
 *
 * 按「四道关」组织，与 T13 的群管理 spec 同构：
 *   ① 能力层：三个能力各自的默认位（表情回应全开；戳 / 点赞连主人私聊也默认关，
 *      要 ownerGrant 才开）、工具归属、说明里写清「会真的弹一下 / 会真的加赞数」；
 *   ② 注册层（真 bridge + 真能力判定）：默认矩阵下群聊、非管理员私聊与**管理员私聊**
 *      都只多出 `qq_emoji_react`，戳 / 点赞要靠显式 grant（非主人档）或 ownerGrant
 *      （主人私聊）才注册；
 *   ③ 门禁层：会话绑定（不是 QQ 会话就拒绝）+ 回合层（戳 / 点赞只在主人回合放行）
 *      + 消息归属（表情回应只能贴本聊天里真的出现过的消息），拒绝时**一个 OneBot
 *      请求都不发**；
 *   ④ 参数与路由：私聊钉死对面、群里必须给 user_id、点赞只在私聊、次数 1-10，
 *      消息 id 按 sanitizeMessageId 的白名单（数字 / 字母 / 连字符，≤64；数字还须
 *      是非零安全整数——负数放行，number 与 string 走同一条判断），请求体只有**逐字
 *      十进制整数**才转 number（'0x10' / '1e5' 这类字母 hash 原样发字符串，否则
 *      Number() 会把它换成另一个数字 id），非法参数一律拒绝（不夹逼、不清洗后硬用）；
 *      每次调用都往 mediaDir/qq-actions.log 追加一行。
 * 另外钉住「万能入口不能绕行」：四个互动 action 在 NAPCAT_ACTIONS 表里，但不在
 * `qq_napcat_api` 的放行集合里。
 * @module dsh-qq-companion-pro/tests/interaction-tools
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'

import { ChatBridge } from '../src/bridge.js'
import {
  DEFAULT_LIKE_TIMES,
  MAX_LIKE_TIMES,
  messageIdParam,
  parseMessageId,
  registerInteractionTools,
} from '../src/interaction-tools.js'
import { CAPABILITIES, capabilityOfTool, findCapability, interactionWarningLine } from '../src/capabilities.js'
import {
  NAPCAT_PROXY_ACTION_NAMES,
  isNapCatProxyAction,
  napcatActionsOfCapability,
} from '../src/napcat-actions.js'
import { ACTION_AUDIT_FILE } from '../src/outbound.js'
import { healthReport } from '../src/health.js'
import { makeCmdHarness } from './helpers/bridge-harness.js'

/** 本任务新增的三个工具。 */
const INTERACT_TOOLS = ['qq_emoji_react', 'qq_poke', 'qq_send_like']

/** 三个互动 action（表里的键，不属于万能入口）。 */
const INTERACT_ACTIONS = ['set_msg_emoji_like', 'friend_poke', 'group_poke', 'send_like']

interface InteractTool {
  name: string
  description: string
  parameters: { properties?: Record<string, { description?: string; required?: boolean }> }
  output: { render: (args: unknown, value: unknown) => Array<{ type: string; text: string }> }
  execute: (args: unknown, exec?: unknown) => Promise<unknown>
}

/** 一个能被门禁识别的执行上下文（session id 由测试指定）。 */
const exec = (sessionId: string) => ({ agent: { session: { id: sessionId } } })

/** 真 ChatBridge（只为 chatForSession / canEditFiles / auditAction），connection 只记录调用。 */
function makeToolHarness(opts?: { failWith?: string; allow?: (toolName: string) => boolean }) {
  const root = mkdtempSync(join(tmpdir(), 'interact-tools-'))
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
  /**
   * 模拟「这个聊天里真的出现过这些消息」：表情回应的消息归属门禁只认 bridge 自己的
   * 已见消息表（正常由入站消息登记），测试里直接登记，免得为了贴个表情造一整轮会话。
   */
  const see = (chatId: string, ...messageIds: Array<string | number>): void => {
    const seen = (bridge as unknown as { seenMessageIds: { noteInbound(chatId: string, messageId: string): number } }).seenMessageIds
    for (const id of messageIds) seen.noteInbound(chatId, String(id))
  }
  const tools: InteractTool[] = []
  const ctx = new Context()
  ctx.provide('tools' as never, {
    register: (tool: InteractTool) => {
      tools.push(tool)
      return () => undefined
    },
  } as never)
  registerInteractionTools(ctx, bridge, connection as never, opts?.allow)
  const tool = (name: string): InteractTool => {
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
  return { root, mediaDir, bridge, tools, tool, rendered, seed, see, calls, audit }
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

const PRIVATE_CHAT = 'private:20002'
const GROUP_CHAT = 'group:10001'

// ------------------------------------------------------------------ ① 能力层

describe('能力层 — 默认位与工具归属', () => {
  it('表情回应对谁默认开；戳一戳与点赞仅非主人默认关，执行守卫不变', () => {
    const react = findCapability('qq.interact.react')!
    expect(react.memberDefault).toBe(true)
    expect(react.groupDefault).toBe(true)
    expect(react.ownerDefault).toBe(true)
    expect(react.tools).toEqual(['qq_emoji_react'])
    for (const id of ['qq.interact.poke', 'qq.interact.like'] as const) {
      const capability = findCapability(id)!
      expect(capability.memberDefault, id).toBe(false)
      expect(capability.groupDefault, id).toBe(false)
      // T14 r2：连主人私聊也默认关——「替别人动手」的动作不能由默认位替主人做主。
      expect(capability.ownerDefault, id).not.toBe(false)
    }
    expect(findCapability('qq.interact.poke')!.tools).toEqual(['qq_poke'])
    expect(findCapability('qq.interact.like')!.tools).toEqual(['qq_send_like'])
  })

  it('三个工具各归一个能力（不重不漏），三个默认位都显式写出来', () => {
    const expected = {
      'qq.interact.react': ['qq_emoji_react'],
      'qq.interact.poke': ['qq_poke'],
      'qq.interact.like': ['qq_send_like'],
    } as const
    for (const [id, tools] of Object.entries(expected)) {
      const capability = findCapability(id)!
      expect(capability.tools, id).toEqual([...tools])
      for (const name of tools) expect(capabilityOfTool(name)?.id, name).toBe(id)
    }
    // 一工具一能力：三项都不同。
    expect(new Set(INTERACT_TOOLS.map(name => capabilityOfTool(name)?.id)).size).toBe(3)
  })

  it('说明里写清这些动作是真的会打扰到人 / 只能在本聊天里做', () => {
    const react = findCapability('qq.interact.react')!
    expect(react.describe).toContain('表情')
    for (const id of ['qq.interact.poke', 'qq.interact.like'] as const) {
      const describe = findCapability(id)!.describe
      expect(describe, id).toMatch(/戳|赞/)
      expect(describe, id).toContain('主人')
    }
    // 这三个能力确实都进了注册表（工具清单 ≡ 能力清单的另一半由 capabilities.spec 守）。
    expect(CAPABILITIES.some(item => item.id === 'qq.interact.poke')).toBe(true)
  })
})

// ------------------------------------------------------------------ ② 注册层

describe('注册层 — allow 门禁与真 bridge 的默认矩阵', () => {
  /** 发一句话让 bridge 建会话，等它把本聊天的工具清单记下来。 */
  async function toolsAfterSend(
    h: Awaited<ReturnType<typeof makeCmdHarness>>,
    send: (h: Awaited<ReturnType<typeof makeCmdHarness>>) => void,
  ): Promise<string[]> {
    send(h)
    const deadline = Date.now() + 15_000
    while (h.captured.channelTools.length === 0 && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    h.client.close()
    return h.captured.channelTools
  }

  it('allow 关掉的能力连工具都不注册（门禁在注册层就生效）', () => {
    const h = makeToolHarness()
    expect(h.tools.map(tool => tool.name)).toEqual(INTERACT_TOOLS)
    const only = makeToolHarness({ allow: name => name === 'qq_emoji_react' })
    expect(only.tools.map(tool => tool.name)).toEqual(['qq_emoji_react'])
    expect(() => only.tool('qq_poke')).toThrow('tool not registered')
  })

  it('默认矩阵：非主人只有表情回应，管理员三项都授权', async () => {
    const group = await toolsAfterSend(
      await makeCmdHarness({ allowAllUsers: true }),
      h => h.sendGroupTextAs('hi', 10001),
    )
    expect(group).toContain('qq_emoji_react')
    expect(group).not.toContain('qq_poke')
    expect(group).not.toContain('qq_send_like')

    const member = await toolsAfterSend(
      await makeCmdHarness({ allowAllUsers: true }),
      h => h.sendTextAs('hi', 20002),
    )
    expect(member).toContain('qq_emoji_react')
    expect(member).not.toContain('qq_poke')

    // T14 r2：管理员私聊的默认位也不含戳 / 点赞——不能靠「反正主人档恒开」放行。
    const owner = await toolsAfterSend(
      await makeCmdHarness(),
      h => h.sendText('hi'),
    )
    expect(owner).toContain('qq_emoji_react')
    expect(owner).toContain('qq_poke')
    expect(owner).toContain('qq_send_like')
  })

  it('显式 grant 之后才注册：非主人档写 strangerGrant 就开', async () => {
    const granted = await toolsAfterSend(
      await makeCmdHarness({ allowAllUsers: true, strangerGrant: ['qq.interact.poke'] }),
      h => h.sendTextAs('hi', 20002),
    )
    expect(granted).toContain('qq_poke')
    expect(granted).toContain('qq_emoji_react')
    expect(granted).not.toContain('qq_send_like')
  })

  it('ownerGrant 保留兼容，主人默认全部授权', async () => {
    const granted = await toolsAfterSend(
      await makeCmdHarness({ ownerGrant: ['qq.interact.poke', 'qq.interact.like'] }),
      h => h.sendText('hi'),
    )
    expect(granted).toContain('qq_poke')
    expect(granted).toContain('qq_send_like')
    expect(granted).toContain('qq_emoji_react')
  })
})

// ------------------------------------------------------------------ ③ 门禁层

describe('门禁层 — 会话绑定 + 回合主人', () => {
  it('没有会话映射：三个工具都拒绝，一个请求都不发，审计里没有 chatId', async () => {
    const h = makeToolHarness()
    h.seed('s-x', PRIVATE_CHAT, 'admin')
    // 一个根本没被 seed 过的会话 = 不来自 QQ。
    for (const name of INTERACT_TOOLS) {
      const value = await h.tool(name).execute(
        name === 'qq_send_like' ? {} : name === 'qq_poke' ? {} : { message_id: 1, emoji_id: 76 },
        exec('s-nope'),
      )
      expect(h.rendered(name, value), name).toContain('只能在 QQ 会话里用')
    }
    expect(h.calls).toHaveLength(0)
    const lines = await waitAudit(h, 3)
    expect(lines.map(line => line.chatId)).toEqual(['unknown', 'unknown', 'unknown'])
  })

  it('群友回合：戳一戳与点赞被回合层拒掉（能力开了也不行），表情回应照做', async () => {
    const h = makeToolHarness()
    h.seed('s-group', GROUP_CHAT, 'member')
    h.see(GROUP_CHAT, 9)
    const poke = await h.tool('qq_poke').execute({ user_id: 20002 }, exec('s-group'))
    expect(h.rendered('qq_poke', poke)).toContain('只有主人本人能让我戳人')
    expect(h.rendered('qq_poke', poke)).toContain('没做')
    expect(h.calls).toHaveLength(0)
    // 表情回应没有回合层门禁：贴个表情不打扰人。
    const react = await h.tool('qq_emoji_react').execute({ message_id: 9, emoji_id: 76 }, exec('s-group'))
    expect(h.rendered('qq_emoji_react', react)).toBe('已执行')
    expect(h.calls).toEqual([{ action: 'set_msg_emoji_like', params: { message_id: 9, emoji_id: '76' } }])
  })

  it('表情回应只能贴本聊天里出现过的消息：别的聊天的编号 → 拒绝，一个请求都不发', async () => {
    const h = makeToolHarness()
    h.seed('s-private', PRIVATE_CHAT, 'admin')
    h.see(PRIVATE_CHAT, 500)
    h.see(GROUP_CHAT, 600)
    // 600 这个编号本身合法，但它只在这个群的聊天里出现过，私聊里没有。
    const foreign = await h.tool('qq_emoji_react').execute({ message_id: 600, emoji_id: 76 }, exec('s-private'))
    expect(h.rendered('qq_emoji_react', foreign)).toContain('这个聊天里没有编号 600 的消息')
    expect(h.rendered('qq_emoji_react', foreign)).toContain('没做')
    expect(h.calls).toHaveLength(0)
    // 本聊天见过的照常贴。
    const own = await h.tool('qq_emoji_react').execute({ message_id: 500, emoji_id: 76 }, exec('s-private'))
    expect(h.rendered('qq_emoji_react', own)).toBe('已执行')
    expect(h.calls).toEqual([{ action: 'set_msg_emoji_like', params: { message_id: 500, emoji_id: '76' } }])
    // 归属拒绝也留痕，chatId 是已知的那个（会话绑定已经过了）。
    const lines = await waitAudit(h, 2)
    expect(lines[0].ok).toBe(false)
    expect(lines[0].chatId).toBe(PRIVATE_CHAT)
    expect(String(lines[0].reason)).toContain('消息不属于本聊天')
  })

  it('主人回合放行：私聊戳一戳 → friend_poke，参数只有对方 QQ', async () => {
    const h = makeToolHarness()
    h.seed('s-private', PRIVATE_CHAT, 'admin')
    const value = await h.tool('qq_poke').execute({}, exec('s-private'))
    expect(h.rendered('qq_poke', value)).toBe('已执行')
    expect(h.calls).toEqual([{ action: 'friend_poke', params: { user_id: 20002 } }])
  })

  it('点赞：群里没有唯一的「对方」，主人回合也拒绝', async () => {
    const h = makeToolHarness()
    h.seed('s-group', GROUP_CHAT, 'admin')
    const value = await h.tool('qq_send_like').execute({ times: 3 }, exec('s-group'))
    expect(h.rendered('qq_send_like', value)).toContain('点赞只能在私聊里点')
    expect(h.calls).toHaveLength(0)
  })
})

// ------------------------------------------------------------------ ④ 参数与路由

describe('参数与路由 — 私聊钉死对面，群里必须给 user_id', () => {
  it('群里戳人：action = group_poke，带 group_id 与 user_id', async () => {
    const h = makeToolHarness()
    h.seed('s-group', GROUP_CHAT, 'admin')
    const value = await h.tool('qq_poke').execute({ user_id: '20002' }, exec('s-group'))
    expect(h.rendered('qq_poke', value)).toBe('已执行')
    expect(h.calls).toEqual([{ action: 'group_poke', params: { group_id: 10001, user_id: 20002 } }])
  })

  it('群里不给 user_id → 拒绝（不猜一个人来戳）', async () => {
    const h = makeToolHarness()
    h.seed('s-group', GROUP_CHAT, 'admin')
    const value = await h.tool('qq_poke').execute({}, exec('s-group'))
    expect(h.rendered('qq_poke', value)).toContain('群里戳人要传 user_id')
    expect(h.calls).toHaveLength(0)
  })

  it('私聊里戳别人 → 拒绝（跨聊天操作从结构上做不到）', async () => {
    const h = makeToolHarness()
    h.seed('s-private', PRIVATE_CHAT, 'admin')
    const value = await h.tool('qq_poke').execute({ user_id: '30003' }, exec('s-private'))
    expect(h.rendered('qq_poke', value)).toContain('只能戳正在和你说话的那个人')
    expect(h.calls).toHaveLength(0)
  })

  it('私聊里显式填对面那个人 → 放行', async () => {
    const h = makeToolHarness()
    h.seed('s-private', PRIVATE_CHAT, 'admin')
    const value = await h.tool('qq_poke').execute({ user_id: 20002 }, exec('s-private'))
    expect(h.rendered('qq_poke', value)).toBe('已执行')
    expect(h.calls).toEqual([{ action: 'friend_poke', params: { user_id: 20002 } }])
  })

  it('message_id 只接受非零安全整数或白名单字符串；清洗后不一致就拒绝（不替模型删字）', async () => {
    // 纯函数契约：数字必须是安全整数——超出 Number.MAX_SAFE_INTEGER 的数经 Number()
    // 往返会变成另一个值，贴出去就是另一条消息。零（含 -0）没有对应消息，拒绝。
    expect(parseMessageId(0)).toMatchObject({ ok: false })
    expect(parseMessageId(-0)).toMatchObject({ ok: false })
    expect(parseMessageId('0')).toMatchObject({ ok: false })
    expect(parseMessageId(1.5)).toMatchObject({ ok: false })
    expect(parseMessageId('')).toMatchObject({ ok: false })
    expect(parseMessageId(Number.MAX_SAFE_INTEGER + 2)).toMatchObject({ ok: false })
    // 与入站提示词里的 id 同一套白名单（sanitizeMessageId）：数字、字母、连字符。
    expect(parseMessageId('abc')).toEqual({ ok: true, messageId: 'abc' })
    expect(parseMessageId('123')).toEqual({ ok: true, messageId: '123' })
    expect(parseMessageId(123)).toEqual({ ok: true, messageId: '123' })
    // 负数：连字符本来就在白名单里，string 一直能过；number 必须给出同一个结论，
    // 否则同一个编号「传 string 过、传 number 拒」，模型照抄提示词里的 id 就会随机失败。
    expect(parseMessageId('-123')).toEqual({ ok: true, messageId: '-123' })
    expect(parseMessageId(-123)).toEqual({ ok: true, messageId: '-123' })
    // 含空白 / 下划线 / 中文 —— 清洗后与原文不一致，拒绝而不是清洗后硬用。
    for (const raw of ['1 2', 'a_b', '消息1', 'a/b']) {
      expect(parseMessageId(raw), raw).toMatchObject({ ok: false })
    }
    // 请求参数：纯数字且安全 → number（与改造前逐字一致，负号也一样是 number）；
    // 其余（hash、超长编号）原样发字符串。
    expect(messageIdParam('123')).toBe(123)
    expect(messageIdParam('-123')).toBe(-123)
    expect(messageIdParam('abc')).toBe('abc')
    expect(messageIdParam('99999999999999999999')).toBe('99999999999999999999')

    // 工具层：参数门禁拒掉时一个请求都不发。
    const h = makeToolHarness()
    h.seed('s-private', PRIVATE_CHAT, 'admin')
    for (const message_id of [0, '0', 1.5, '']) {
      const value = await h.tool('qq_emoji_react').execute({ message_id, emoji_id: 76 }, exec('s-private'))
      expect(h.rendered('qq_emoji_react', value), String(message_id)).toContain('message_id 要填')
    }
    // message_id 是 required 且只接受 string / number：缺席或类型不对由 defineTool 的参数校验先挡下。
    // `-0` 也在这一组：JSON 往返会丢掉负号（不是无损 JSON），宿主的参数校验先抛错，
    // 根本到不了 parseMessageId——上面那条纯函数断言钉住「就算到了也拒」。
    for (const message_id of [undefined, null, true, {}, -0]) {
      await expect(h.tool('qq_emoji_react').execute({ message_id, emoji_id: 76 }, exec('s-private'))).rejects.toThrow()
    }
    expect(h.calls).toHaveLength(0)
  })

  it('message_id 只把逐字十进制整数转 number：0x10 / 1e5 这类字母 hash 原样发字符串', async () => {
    // 归属门禁比的是**字符串**，请求体却可能被 Number() 换成另一个数字：
    // '0x10' → 16、'1e5' → 100000。'x' 和 'e' 都在白名单里（hash 实现本来就用字母），
    // 所以「见过 hash」不等于「见过转出来的那个数字 id」——不加写法规整就等于贴到
    // 另一条消息上。这是归属闸的硬保证，不是请求体的美观问题。
    expect(messageIdParam('0x10')).toBe('0x10')
    expect(messageIdParam('1e5')).toBe('1e5')
    // 真正的十进制写法不变：16 / 100000 仍发 number（与改造前逐字一致）。
    expect(messageIdParam('16')).toBe(16)
    expect(messageIdParam('100000')).toBe(100000)

    // 工具端到端：这四条消息都在本聊天里见过 → 全部放行，请求体的类型按上面那条规则。
    const h = makeToolHarness()
    h.seed('s-private', PRIVATE_CHAT, 'admin')
    h.see(PRIVATE_CHAT, '0x10', '1e5', '16', '100000')
    for (const message_id of ['0x10', '1e5', '16', '100000']) {
      const value = await h.tool('qq_emoji_react').execute({ message_id, emoji_id: 76 }, exec('s-private'))
      expect(h.rendered('qq_emoji_react', value), message_id).toBe('已执行')
    }
    expect(h.calls).toEqual([
      { action: 'set_msg_emoji_like', params: { message_id: '0x10', emoji_id: '76' } },
      { action: 'set_msg_emoji_like', params: { message_id: '1e5', emoji_id: '76' } },
      { action: 'set_msg_emoji_like', params: { message_id: 16, emoji_id: '76' } },
      { action: 'set_msg_emoji_like', params: { message_id: 100000, emoji_id: '76' } },
    ])
  })

  it('负数 message_id：number 与 string 过同一道归属门禁，请求体都是 number -123', async () => {
    const h = makeToolHarness()
    h.seed('s-private', PRIVATE_CHAT, 'admin')
    // 归属门禁按规整后的字符串比：先登记本聊天里真的出现过的 -123。
    h.see(PRIVATE_CHAT, -123)
    // 没见过的负编号一样被归属门禁挡下（负数不是绕过归属的捷径），一个请求都不发。
    const foreign = await h.tool('qq_emoji_react').execute({ message_id: -124, emoji_id: 76 }, exec('s-private'))
    expect(h.rendered('qq_emoji_react', foreign)).toContain('这个聊天里没有编号 -124 的消息')
    expect(h.calls).toHaveLength(0)
    // 同一个编号的两种写法：都放行，请求体一致（number -123），不留 number / string 分叉。
    for (const message_id of [-123, '-123']) {
      const value = await h.tool('qq_emoji_react').execute({ message_id, emoji_id: 76 }, exec('s-private'))
      expect(h.rendered('qq_emoji_react', value), String(message_id)).toBe('已执行')
    }
    expect(h.calls).toEqual([
      { action: 'set_msg_emoji_like', params: { message_id: -123, emoji_id: '76' } },
      { action: 'set_msg_emoji_like', params: { message_id: -123, emoji_id: '76' } },
    ])
    // 归属拒绝也留痕：审计里先一行失败、后两行成功。
    const lines = await waitAudit(h, 3)
    expect(lines.map(line => line.ok)).toEqual([false, true, true])
  })

  it('emoji_id 只接受 1-7 位数字（真伪交给服务端）', async () => {
    const h = makeToolHarness()
    h.seed('s-private', PRIVATE_CHAT, 'admin')
    for (const emoji_id of ['abc', '', '-1', '12345678', 0, 1.5]) {
      const value = await h.tool('qq_emoji_react').execute({ message_id: 1, emoji_id }, exec('s-private'))
      expect(h.rendered('qq_emoji_react', value), String(emoji_id)).toContain('emoji_id 要填数字表情 id')
    }
    expect(h.calls).toHaveLength(0)
    // 字符串数字与码点都放行（归属门禁要求这条消息在本聊天里见过，先登记）。
    h.see(PRIVATE_CHAT, '123')
    await h.tool('qq_emoji_react').execute({ message_id: '123', emoji_id: '128077' }, exec('s-private'))
    expect(h.calls).toEqual([{ action: 'set_msg_emoji_like', params: { message_id: 123, emoji_id: '128077' } }])
  })

  it('点赞次数：1-10 的整数，越界拒绝（不夹逼），省略 = 10', async () => {
    const h = makeToolHarness()
    h.seed('s-private', PRIVATE_CHAT, 'admin')
    for (const times of [0, 11, -1, 1.5, 'abc']) {
      const value = await h.tool('qq_send_like').execute({ times }, exec('s-private'))
      expect(h.rendered('qq_send_like', value), String(times)).toContain('1-10 的整数')
    }
    expect(h.calls).toHaveLength(0)
    await h.tool('qq_send_like').execute({}, exec('s-private'))
    await h.tool('qq_send_like').execute({ times: '3' }, exec('s-private'))
    expect(h.calls).toEqual([
      { action: 'send_like', params: { user_id: 20002, times: DEFAULT_LIKE_TIMES } },
      { action: 'send_like', params: { user_id: 20002, times: 3 } },
    ])
    expect(MAX_LIKE_TIMES).toBe(10)
  })
})

// ------------------------------------------------------------------ ⑤ 审计

describe('审计 — 成功 / 失败 / 被拒都留痕', () => {
  it('成功写 ok=true 一行，reason 带目标与参数摘要', async () => {
    const h = makeToolHarness()
    h.seed('s-private', PRIVATE_CHAT, 'admin')
    await h.tool('qq_send_like').execute({ times: 5 }, exec('s-private'))
    const [line] = await waitAudit(h, 1)
    expect(line.chatId).toBe(PRIVATE_CHAT)
    expect(line.action).toBe('qq_send_like')
    expect(line.ok).toBe(true)
    expect(String(line.reason)).toContain('5 个赞')
    expect(String(line.reason)).toContain('成功')
  })

  it('OneBot 调用抛错 → ok=false，模型看到「没做成」', async () => {
    const h = makeToolHarness({ failWith: 'rate limited' })
    h.seed('s-private', PRIVATE_CHAT, 'admin')
    const value = await h.tool('qq_poke').execute({}, exec('s-private'))
    expect(h.rendered('qq_poke', value)).toContain('没做成')
    expect(h.rendered('qq_poke', value)).toContain('rate limited')
    const [line] = await waitAudit(h, 1)
    expect(line.ok).toBe(false)
    expect(String(line.reason)).toContain('失败：rate limited')
  })

  it('参数不合法也写一行（reason 里带「拒绝」）', async () => {
    const h = makeToolHarness()
    h.seed('s-private', PRIVATE_CHAT, 'admin')
    await h.tool('qq_send_like').execute({ times: 99 }, exec('s-private'))
    const [line] = await waitAudit(h, 1)
    expect(line.ok).toBe(false)
    expect(String(line.reason)).toContain('拒绝：')
    expect(String(line.reason)).toContain('1-10 的整数')
  })

  it('被回合门禁拒掉也写一行（chatId = unknown：门禁没过就不知道是哪个聊天）', async () => {
    const h = makeToolHarness()
    h.seed('s-group', GROUP_CHAT, 'member')
    await h.tool('qq_poke').execute({ user_id: 20002 }, exec('s-group'))
    const [line] = await waitAudit(h, 1)
    expect(line.chatId).toBe('unknown')
    expect(line.ok).toBe(false)
    expect(String(line.reason)).toContain('只有主人本人')
  })
})

// ------------------------------------------------------------------ ⑥ /doctor 提示

describe('/doctor 提示 — 非主人档真的开了才出现', () => {
  it('全关（空配置）时不提示：主人档恒开不算「开给谁了」', () => {
    expect(interactionWarningLine({ config: {}, deps: [] })).toBe('')
  })

  it('任一个在非主人档开着就出一句，点出 id 与中文名', () => {
    const line = interactionWarningLine({
      config: { memberGrant: ['qq.interact.poke'], strangerGrant: ['qq.interact.like'] },
      deps: [],
    })
    expect(line).toContain('qq.interact.poke（戳一戳）')
    expect(line).toContain('qq.interact.like（点赞）')
    expect(line).toContain('只有主人本人的回合会真的执行')
    // 两项都开只提一次，不重复成两句。
    expect(line.split('⚠')).toHaveLength(2)
  })

  it('表情回应（默认开的那一项）不进提示：贴个表情不打扰人', () => {
    expect(interactionWarningLine({ config: { friendGrant: ['qq.interact.react'] }, deps: [] })).toBe('')
  })

  it('/doctor 报告里带上这一行', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'interact-doctor-'))
    const report = await healthReport({
      mediaDir: dir,
      connection: { connected: true, selfId: '10002' },
      transport: { host: '127.0.0.1', port: 8643 },
      retryState: {},
      dedup: { entries: 0, windowSeconds: 300 },
      configSnapshot: {},
      interactionWarning: () => interactionWarningLine({ config: { memberGrant: ['qq.interact.poke'] }, deps: [] }),
      log: () => undefined,
    })
    expect(report).toContain('戳一戳 / 点赞已对非主人会话开启')
    expect(report).toContain('qq.interact.poke（戳一戳）')
  })
})

// ------------------------------------------------------------------ ⑦ 万能入口不能绕行

describe('万能入口 qq_napcat_api 不能绕过三个互动 action', () => {
  it('三个互动 action 在表里，但不在 qq_napcat_api 的放行集合里', () => {
    for (const action of INTERACT_ACTIONS) {
      expect(isNapCatProxyAction(action), action).toBe(false)
    }
    for (const action of INTERACT_ACTIONS) {
      expect(NAPCAT_PROXY_ACTION_NAMES, action).not.toContain(action)
    }
  })

  it('四个互动 action 各自挂在三个互动能力下（能力关 = 入口没）', () => {
    expect(napcatActionsOfCapability('qq.interact.react')).toEqual(['set_msg_emoji_like'])
    expect(napcatActionsOfCapability('qq.interact.poke').sort()).toEqual(['friend_poke', 'group_poke'])
    expect(napcatActionsOfCapability('qq.interact.like')).toEqual(['send_like'])
  })
})