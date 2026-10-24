/**
 * T12 · NapCat 白名单表驱动化（`src/napcat-actions.ts`）的契约与**零行为变化**证据。
 *
 *   ① 改造前的 15 条 action **逐个**仍能通过 `qq_napcat_api` 调用，参数原样转发；
 *   ② 表外 action 的拒绝文案、白名单描述文案与改造前**逐字一致**（都从表生成），
 *      且被拒绝时不发任何 OneBot 请求；
 *   ③ 表结构：每条 action 都有 capability，且该能力真的在 CAPABILITIES 里注册
 *      （「以后新增 action 只需加一行」的前提），describe 是一句中文；
 *   ④ write 标记把「改外部状态」和「只读查询」分开（改造前 3 条写、12 条读；
 *      T13 追加的 6 条群管理 action、T14 追加的 4 条轻互动 action 也是写）；
 *   ⑤ T13 / T14 之后 `qq_napcat_api` 的放行集合仍然是改造前那 15 条：表内的群管理
 *      action 与戳一戳 / 点赞 / 表情回应不能借万能入口绕过「能力默认关 + 只有主人
 *      回合」两道门禁。
 * @module dsh-qq-companion-pro/tests/napcat-actions
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'

import { registerTools } from '../src/tools.js'
import {
  NAPCAT_ACTIONS,
  NAPCAT_ACTION_NAMES,
  NAPCAT_PROXY_ACTION_NAMES,
  isNapCatActionWhitelisted,
  isNapCatProxyAction,
  napcatActionMeta,
  napcatActionsOfCapability,
} from '../src/napcat-actions.js'
import { CAPABILITIES, findCapability } from '../src/capabilities.js'

/**
 * 改造前的硬编码白名单（逐字抄自 T12 之前的 src/tools.ts）。
 * 这 15 条是「零行为变化」的对照基准，不许改动。
 */
const PRE_CHANGE_WHITELIST = [
  'get_group_member_list',
  'get_group_member_info',
  'get_stranger_info',
  'get_forward_msg',
  'get_record',
  'get_file',
  'upload_group_file',
  'upload_private_file',
  'get_group_root_files',
  'get_group_files_by_folder',
  'get_group_file_url',
  'get_private_file_url',
  'ocr_image',
  'get_ai_characters',
  'send_group_ai_record',
]

/** 改造前的工具描述（同样逐字抄下来对照）。 */
const PRE_CHANGE_DESCRIPTION = '调用 NapCat 白名单内的 OneBot 扩展 API（群成员列表/信息、文件、OCR、AI 语音等）。非白名单 action 会被拒绝。'

/**
 * T13 追加的 6 条群管理写操作（表尾，挂在新能力下）。
 *
 * 它们**不在 `qq_napcat_api` 的放行集合里**：那个工具的放行集合是
 * `NAPCAT_PROXY_ACTION_NAMES`（只在 qq.napcat.api 能力下的 15 条），否则
 * qq.napcat.api 一开（默认就对每个会话开）就等于把禁言的刀发给所有人。
 */
const T13_ACTIONS = [
  'set_group_ban',
  'set_group_whole_ban',
  'set_group_card',
  '_send_group_notice',
  'set_essence_msg',
  'delete_essence_msg',
]

/**
 * T14 追加的 4 条轻互动（表尾，挂在三个互动能力下）。
 *
 * 同样**不在 `qq_napcat_api` 的放行集合里**：戳一戳与点赞会真的打扰到对方，表情
 * 回应也会改动消息，不能借万能入口绕过能力门禁。`friend_poke` 与 `group_poke`
 * 是同一能力的两个 action（私聊 / 群聊各一条）。
 */
const T14_ACTIONS = ['set_msg_emoji_like', 'friend_poke', 'group_poke', 'send_like']

interface ApiTool {
  name: string
  description: string
  /** defineTool 会把参数声明编译成 JSON Schema，所以说明在 properties.action 下。 */
  parameters: { properties?: Record<string, { description?: string }> }
  execute: (args: unknown, exec?: unknown) => Promise<unknown>
}

/** 一个只装了 qq_napcat_api 的 harness：connection 只记录调用，不联网。 */
function makeApiHarness() {
  const calls: Array<{ action: string; params: Record<string, unknown> }> = []
  const tools: ApiTool[] = []
  const ctx = new Context()
  ctx.provide('tools' as never, {
    register: (tool: ApiTool) => {
      tools.push(tool)
      return () => undefined
    },
  } as never)
  registerTools(ctx, {} as never, {
    call: async (action: string, params: Record<string, unknown>) => {
      calls.push({ action, params })
      return { action, ok: true }
    },
  } as never, { maxImageBytes: 1, maxVoiceBytes: 1, maxFileBytes: 1 })
  const tool = tools.find(item => item.name === 'qq_napcat_api')
  if (tool === undefined) throw new Error('qq_napcat_api 没注册')
  return { tool, calls }
}

describe('表驱动零行为变化 — 改造前的 15 条 action 逐条可用', () => {
  for (const action of PRE_CHANGE_WHITELIST) {
    it(action + ' 仍能被 qq_napcat_api 调用，参数原样转发', async () => {
      const h = makeApiHarness()
      const result = await h.tool.execute({ action, params: { a: 1, b: 'x' } })
      expect(result).toEqual({ action, ok: true })
      expect(h.calls).toEqual([{ action, params: { a: 1, b: 'x' } }])
    })
  }

  it('表的前 15 条就是改造前那 15 条；T13 的 6 条、T14 的 4 条追加在尾部（不多不少）', () => {
    expect(NAPCAT_ACTION_NAMES.slice(0, PRE_CHANGE_WHITELIST.length)).toEqual(PRE_CHANGE_WHITELIST)
    expect(NAPCAT_ACTION_NAMES.slice(PRE_CHANGE_WHITELIST.length)).toEqual([...T13_ACTIONS, ...T14_ACTIONS])
    expect(NAPCAT_ACTION_NAMES).toHaveLength(PRE_CHANGE_WHITELIST.length + T13_ACTIONS.length + T14_ACTIONS.length)
  })

  it('表顺序 = 改造前数组顺序（描述与报错文案由它拼出来）', () => {
    expect(NAPCAT_ACTION_NAMES.slice(0, PRE_CHANGE_WHITELIST.length)).toEqual(PRE_CHANGE_WHITELIST)
  })

  it('工具描述与 action 参数描述（= 白名单清单）与改造前逐字一致', () => {
    const h = makeApiHarness()
    expect(h.tool.description).toBe(PRE_CHANGE_DESCRIPTION)
    expect(h.tool.parameters.properties?.action?.description).toBe('白名单 action：' + PRE_CHANGE_WHITELIST.join(' / '))
  })

  it('params 缺席时按空对象下发（与改造前一致）', async () => {
    const h = makeApiHarness()
    await h.tool.execute({ action: 'get_group_root_files' })
    expect(h.calls).toEqual([{ action: 'get_group_root_files', params: {} }])
  })
})

describe('表外 action 照旧拒绝（文案逐字一致，且不发请求）', () => {
  it('未知 action → 抛错，文案 = 改造前那句', async () => {
    const h = makeApiHarness()
    await expect(h.tool.execute({ action: 'set_group_kick' }))
      .rejects.toThrow('qq_napcat_api: action 不在白名单内（' + PRE_CHANGE_WHITELIST.join(', ') + '）')
    expect(h.calls).toHaveLength(0)
  })

  it('action 不是字符串时被参数校验挡下（一个请求都不发）', async () => {
    const h = makeApiHarness()
    for (const action of [undefined, null, 42, {}]) {
      await expect(h.tool.execute({ action })).rejects.toThrow()
    }
    expect(h.calls).toHaveLength(0)
  })

  it('isNapCatActionWhitelisted 只认表里的键（原型链上的键不算）', () => {
    expect(isNapCatActionWhitelisted('get_group_member_list')).toBe(true)
    expect(isNapCatActionWhitelisted('toString')).toBe(false)
    expect(isNapCatActionWhitelisted('constructor')).toBe(false)
    expect(isNapCatActionWhitelisted('')).toBe(false)
    expect(isNapCatActionWhitelisted('get_group_list')).toBe(false)
  })
})

describe('表结构 — 加一行就够（能力必须已登记）', () => {
  it('每条 action 都有 capability，且该能力真的在 CAPABILITIES 里', () => {
    for (const action of NAPCAT_ACTION_NAMES) {
      const meta = napcatActionMeta(action)
      expect(meta, action).toBeDefined()
      expect(typeof meta?.capability, action).toBe('string')
      expect(findCapability(meta!.capability), action + ' 的能力 ' + meta!.capability + ' 没登记').toBeDefined()
    }
  })

  it('describe 是一句中文（非空、含汉字）', () => {
    for (const action of NAPCAT_ACTION_NAMES) {
      const meta = NAPCAT_ACTIONS[action]
      expect(meta.describe.length, action).toBeGreaterThan(3)
      expect(meta.describe, action).toMatch(/[\u4e00-\u9fa5]/u)
    }
  })

  it('当前归 qq.napcat.api 的仍是改造前那 15 条（刻意不打散现有能力）', () => {
    expect(napcatActionsOfCapability('qq.napcat.api')).toEqual(PRE_CHANGE_WHITELIST)
    expect(napcatActionMeta('get_group_member_list')?.capability).toBe('qq.napcat.api')
    // 挂到别的能力下的只有 T13 追加的 6 条与 T14 追加的 4 条（qq.napcat.api 的集合一个字没动）。
    const otherCapabilities = CAPABILITIES
      .filter(capability => capability.id !== 'qq.napcat.api')
      .flatMap(capability => napcatActionsOfCapability(capability.id))
    expect(otherCapabilities).toEqual([...T13_ACTIONS, ...T14_ACTIONS])
  })

  it('write 标记：改造前 3 条写 + T13 的 6 条 + T14 的 4 条，其余 12 条只读', () => {
    const write = NAPCAT_ACTION_NAMES.filter(action => NAPCAT_ACTIONS[action].write)
    expect(write).toEqual(['upload_group_file', 'upload_private_file', 'send_group_ai_record', ...T13_ACTIONS, ...T14_ACTIONS])
    const read = NAPCAT_ACTION_NAMES.filter(action => !NAPCAT_ACTIONS[action].write)
    expect(read).toHaveLength(12)
    // 只读里既有查询也有下载类，但都不改 QQ 侧状态。
    expect(read).toContain('get_group_member_list')
    expect(read).toContain('ocr_image')
    // T13 的每一条都必须是写（禁言、改名、公告、精华都改群状态）。
    for (const action of T13_ACTIONS) expect(NAPCAT_ACTIONS[action].write, action).toBe(true)
    // T14 的每一条也都是写（戳、点赞、表情回应都会让别人看见）。
    for (const action of T14_ACTIONS) expect(NAPCAT_ACTIONS[action].write, action).toBe(true)
  })

  it('napcatActionMeta 表外返回 undefined（不抛错、不建新条目）', () => {
    expect(napcatActionMeta('nope')).toBeUndefined()
    expect(Object.keys(NAPCAT_ACTIONS)).toHaveLength(PRE_CHANGE_WHITELIST.length + T13_ACTIONS.length + T14_ACTIONS.length)
  })
})

describe('T13 / T14 · qq_napcat_api 的放行集合仍然只有改造前那 15 条', () => {
  it('NAPCAT_PROXY_ACTION_NAMES = 改造前 15 条（顺序一致）', () => {
    expect([...NAPCAT_PROXY_ACTION_NAMES]).toEqual(PRE_CHANGE_WHITELIST)
  })

  it('表内的群管理 action 也不能经 qq_napcat_api 调用（一个请求都不发）', async () => {
    for (const action of T13_ACTIONS) {
      const h = makeApiHarness()
      await expect(h.tool.execute({ action })).rejects.toThrow('qq_napcat_api: action 不在白名单内（' + PRE_CHANGE_WHITELIST.join(', ') + '）')
      expect(h.calls, action).toHaveLength(0)
    }
  })

  it('表内的戳 / 点赞 / 表情回应也不能经 qq_napcat_api 调用（一个请求都不发）', async () => {
    for (const action of T14_ACTIONS) {
      const h = makeApiHarness()
      await expect(h.tool.execute({ action })).rejects.toThrow('qq_napcat_api: action 不在白名单内（' + PRE_CHANGE_WHITELIST.join(', ') + '）')
      expect(h.calls, action).toHaveLength(0)
    }
  })

  it('isNapCatProxyAction / isNapCatActionWhitelisted 的分工：前者是万能入口的门，后者是表本身', () => {
    expect(isNapCatProxyAction('get_group_member_list')).toBe(true)
    expect(isNapCatProxyAction('set_group_ban')).toBe(false)
    expect(isNapCatActionWhitelisted('set_group_ban')).toBe(true)
    expect(isNapCatProxyAction('toString')).toBe(false)
  })
})