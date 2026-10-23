/**
 * T12 · NapCat 白名单表驱动化（`src/napcat-actions.ts`）的契约与**零行为变化**证据。
 *
 *   ① 改造前的 15 条 action **逐个**仍能通过 `qq_napcat_api` 调用，参数原样转发；
 *   ② 表外 action 的拒绝文案、白名单描述文案与改造前**逐字一致**（都从表生成），
 *      且被拒绝时不发任何 OneBot 请求；
 *   ③ 表结构：每条 action 都有 capability，且该能力真的在 CAPABILITIES 里注册
 *      （「以后新增 action 只需加一行」的前提），describe 是一句中文；
 *   ④ write 标记把「改外部状态」和「只读查询」分开（现在 3 条写、12 条读）。
 * @module dsh-qq-companion-pro/tests/napcat-actions
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'

import { registerTools } from '../src/tools.js'
import {
  NAPCAT_ACTIONS,
  NAPCAT_ACTION_NAMES,
  isNapCatActionWhitelisted,
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

  it('表里就只有这 15 条（不多不少）', () => {
    expect([...NAPCAT_ACTION_NAMES].sort()).toEqual([...PRE_CHANGE_WHITELIST].sort())
    expect(NAPCAT_ACTION_NAMES).toHaveLength(15)
  })

  it('表顺序 = 改造前数组顺序（描述与报错文案由它拼出来）', () => {
    expect([...NAPCAT_ACTION_NAMES]).toEqual(PRE_CHANGE_WHITELIST)
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

  it('当前 15 条全部归 qq.napcat.api（刻意不打散现有能力）', () => {
    expect(napcatActionsOfCapability('qq.napcat.api')).toEqual(PRE_CHANGE_WHITELIST)
    expect(napcatActionMeta('get_group_member_list')?.capability).toBe('qq.napcat.api')
    // 没有任何一条 action 挂在别的能力下（否则就是行为变化）。
    const otherCapabilities = CAPABILITIES
      .filter(capability => capability.id !== 'qq.napcat.api')
      .flatMap(capability => napcatActionsOfCapability(capability.id))
    expect(otherCapabilities).toEqual([])
  })

  it('write 标记：只有「上传文件 / 发群 AI 语音」算写，其余 12 条只读', () => {
    const write = NAPCAT_ACTION_NAMES.filter(action => NAPCAT_ACTIONS[action].write)
    expect(write).toEqual(['upload_group_file', 'upload_private_file', 'send_group_ai_record'])
    const read = NAPCAT_ACTION_NAMES.filter(action => !NAPCAT_ACTIONS[action].write)
    expect(read).toHaveLength(12)
    // 只读里既有查询也有下载类，但都不改 QQ 侧状态。
    expect(read).toContain('get_group_member_list')
    expect(read).toContain('ocr_image')
  })

  it('napcatActionMeta 表外返回 undefined（不抛错、不建新条目）', () => {
    expect(napcatActionMeta('nope')).toBeUndefined()
    expect(Object.keys(NAPCAT_ACTIONS)).toHaveLength(15)
  })
})