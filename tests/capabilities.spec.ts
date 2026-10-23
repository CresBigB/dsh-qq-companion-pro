/**
 * T6 · 能力注册表（src/capabilities.ts）的契约与**零行为变化**证据。
 *
 *   ① 注册表结构自洽：每个工具恰好属于一个能力、id 唯一、中文名/说明齐全、
 *      默认位现状全开；
 *   ② 两份手写工具清单（package.json dshx.contributes.tools / dsh.plugin.json
 *      contributes.tools）≡ 注册表，且注册表 ≡「依赖全开的管理员私聊」里实际
 *      注册到的工具集合（以后加工具忘了登记会被拦住）；
 *   ③ resolveCapabilities 的判定顺序与 why() 中文文案；
 *   ④ 矩阵：`capabilitiesDeny = []` 时三种会话 × 表情包库开/关 × 记忆文件开/关，
 *      注册到的工具集合与**改造前**逐字一致（见 PRE_CHANGE_TOOLS 的注释）；
 *   ⑤ deny 生效、未知 id 告警、/doctor 行与状态快照摘要。
 * @module dsh-qq-companion-pro/tests/capabilities
 */
import { mkdtempSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  ALL_CAPABILITY_IDS,
  CAPABILITIES,
  allToolNames,
  capabilityCatalogText,
  capabilityOfTool,
  findCapability,
  formatCapabilityLine,
  resolveCapabilities,
  summarizeCapabilities,
  unknownCapabilityIds,
  type CapabilityDependency,
} from '../src/capabilities.js'
import { Config } from '../src/config.js'
import { healthReport } from '../src/health.js'
import { selfCheck } from '../src/selfcheck.js'
import { buildCompanionStatusSnapshot } from '../src/status.js'
import { makeCmdHarness } from './helpers/bridge-harness.js'

const ROOT = join(import.meta.dirname, '..')

/** 从注册表读出的「全部工具」名称（顺序即清单顺序）。 */
const REGISTRY_TOOLS = allToolNames()

describe('能力注册表 — 结构自洽', () => {
  it('每个工具恰好属于一个能力（不重不漏）', () => {
    const seen = new Map<string, string>()
    for (const capability of CAPABILITIES) {
      for (const tool of capability.tools) {
        expect(seen.has(tool), tool + ' 同时属于 ' + String(seen.get(tool)) + ' 和 ' + capability.id).toBe(false)
        seen.set(tool, capability.id)
      }
    }
    expect([...seen.keys()].sort()).toEqual([...REGISTRY_TOOLS].sort())
    expect(capabilityOfTool('qq_send_image')?.id).toBe('qq.send.image')
    expect(capabilityOfTool('not_a_tool')).toBeUndefined()
  })

  it('覆盖现在的全部模型工具（14 个）', () => {
    expect(REGISTRY_TOOLS).toEqual([
      'qq_send_image',
      'qq_send_voice',
      'qq_send_video',
      'qq_send_file',
      'qq_send_forward',
      'qq_napcat_api',
      'qq_group_history',
      'qq_open_message',
      'qq_memory_note',
      'qq_sticker_save',
      'qq_sticker_search',
      'qq_sticker_send',
      'qq_sticker_edit',
      'qq_sticker_delete',
    ])
    expect(new Set(REGISTRY_TOOLS).size).toBe(REGISTRY_TOOLS.length)
  })

  it('id 唯一、有中文名与一句说明；依赖键合法', () => {
    expect(new Set(ALL_CAPABILITY_IDS).size).toBe(ALL_CAPABILITY_IDS.length)
    const validDeps: CapabilityDependency[] = ['stickerLib', 'memoryNote']
    for (const capability of CAPABILITIES) {
      expect(capability.title).toMatch(/[\u4e00-\u9fa5]/u)
      expect(capability.describe.length).toBeGreaterThan(8)
      expect(capability.tools.length).toBeGreaterThan(0)
      for (const dep of capability.deps ?? []) expect(validDeps).toContain(dep)
      expect(findCapability(capability.id)).toBe(capability)
    }
  })

  it('默认位现状全部为 true（改造前就是「每个聊天都注册全部工具」）', () => {
    for (const capability of CAPABILITIES) {
      expect(capability.memberDefault, capability.id).toBe(true)
      expect(capability.groupDefault, capability.id).toBe(true)
    }
  })

  it('配置项 capabilitiesDeny 的描述覆盖注册表里的每个 id 与中文名（改注册表忘改描述会失败）', () => {
    const dict = (Config as unknown as { dict: Record<string, { meta?: { description?: string } }> }).dict
    const description = dict.capabilitiesDeny?.meta?.description ?? ''
    expect(description).toContain(capabilityCatalogText())
    for (const capability of CAPABILITIES) {
      expect(description).toContain(capability.id)
      expect(description).toContain(capability.title)
    }
  })
})

describe('工具清单一致性 — 两份手写清单 ≡ 注册表 ≡ 实际注册', () => {
  it('package.json 的 dshx.contributes.tools 与 dsh.plugin.json 的 contributes.tools 都等于注册表（按注册表顺序）', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dshx?: { contributes?: { tools?: string[] } }
    }
    const manifest = JSON.parse(readFileSync(join(ROOT, 'dsh.plugin.json'), 'utf8')) as {
      contributes?: { tools?: string[] }
    }
    expect(pkg.dshx?.contributes?.tools).toEqual(REGISTRY_TOOLS)
    expect(manifest.contributes?.tools).toEqual(REGISTRY_TOOLS)
  })

  it('注册表工具集合 ≡ 依赖全开的管理员私聊里实际注册到的工具集合', async () => {
    const h = await makeCmdHarness({
      stickers: {},
      publicMemoryFile: join(mkdtempSync(join(tmpdir(), 'cap-mem-')), 'AGENTS.md'),
    })
    h.sendText('hi')
    await waitForTools(h)
    h.client.close()
    expect([...h.captured.channelTools].sort()).toEqual([...REGISTRY_TOOLS].sort())
  })
})

/**
 * 矩阵的**改造前**期望集合：在 capability 层落地之前用同一套 harness 跑一遍
 * （三种会话 × 表情包库开关 × 记忆文件开关 = 12 组）得到的原始输出，逐字写死
 * 在这里。任何一组对不上就说明这次改造改变了行为。
 */
const PRE_CHANGE_TOOLS: Readonly<Record<string, string>> = {
  'admin-private|sticker=off|memory=off': 'qq_group_history qq_napcat_api qq_open_message qq_send_file qq_send_forward qq_send_image qq_send_video qq_send_voice',
  'admin-private|sticker=off|memory=on': 'qq_group_history qq_memory_note qq_napcat_api qq_open_message qq_send_file qq_send_forward qq_send_image qq_send_video qq_send_voice',
  'admin-private|sticker=on|memory=off': 'qq_group_history qq_napcat_api qq_open_message qq_send_file qq_send_forward qq_send_image qq_send_video qq_send_voice qq_sticker_delete qq_sticker_edit qq_sticker_save qq_sticker_search qq_sticker_send',
  'admin-private|sticker=on|memory=on': 'qq_group_history qq_memory_note qq_napcat_api qq_open_message qq_send_file qq_send_forward qq_send_image qq_send_video qq_send_voice qq_sticker_delete qq_sticker_edit qq_sticker_save qq_sticker_search qq_sticker_send',
  'member-private|sticker=off|memory=off': 'qq_group_history qq_napcat_api qq_open_message qq_send_file qq_send_forward qq_send_image qq_send_video qq_send_voice',
  'member-private|sticker=off|memory=on': 'qq_group_history qq_memory_note qq_napcat_api qq_open_message qq_send_file qq_send_forward qq_send_image qq_send_video qq_send_voice',
  'member-private|sticker=on|memory=off': 'qq_group_history qq_napcat_api qq_open_message qq_send_file qq_send_forward qq_send_image qq_send_video qq_send_voice qq_sticker_delete qq_sticker_edit qq_sticker_save qq_sticker_search qq_sticker_send',
  'member-private|sticker=on|memory=on': 'qq_group_history qq_memory_note qq_napcat_api qq_open_message qq_send_file qq_send_forward qq_send_image qq_send_video qq_send_voice qq_sticker_delete qq_sticker_edit qq_sticker_save qq_sticker_search qq_sticker_send',
  'group|sticker=off|memory=off': 'qq_group_history qq_napcat_api qq_open_message qq_send_file qq_send_forward qq_send_image qq_send_video qq_send_voice',
  'group|sticker=off|memory=on': 'qq_group_history qq_memory_note qq_napcat_api qq_open_message qq_send_file qq_send_forward qq_send_image qq_send_video qq_send_voice',
  'group|sticker=on|memory=off': 'qq_group_history qq_napcat_api qq_open_message qq_send_file qq_send_forward qq_send_image qq_send_video qq_send_voice qq_sticker_delete qq_sticker_edit qq_sticker_save qq_sticker_search qq_sticker_send',
  'group|sticker=on|memory=on': 'qq_group_history qq_memory_note qq_napcat_api qq_open_message qq_send_file qq_send_forward qq_send_image qq_send_video qq_send_voice qq_sticker_delete qq_sticker_edit qq_sticker_save qq_sticker_search qq_sticker_send',
}

/** 等首个回合进到 agent（channel scope 在创建时注册完，工具捕获早于 followup）。 */
async function waitForTools(h: Awaited<ReturnType<typeof makeCmdHarness>>): Promise<void> {
  const deadline = Date.now() + 15_000
  while (h.captured.channelTools.length === 0 && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  expect(h.captured.channelTools.length).toBeGreaterThan(0)
}

type ChatKind = 'admin-private' | 'member-private' | 'group'

/** 跑一个组合：建 harness → 用对应身份发一句话 → 读出实际注册的工具（已排序）。 */
async function toolsOf(chat: ChatKind, options: { stickers: boolean; memory: boolean; deny?: string[] }): Promise<string[]> {
  const h = await makeCmdHarness({
    allowAllUsers: true,
    ...(options.stickers ? { stickers: {} } : {}),
    ...(options.memory ? { publicMemoryFile: join(mkdtempSync(join(tmpdir(), 'cap-mem-')), 'AGENTS.md') } : {}),
    ...(options.deny !== undefined ? { capabilitiesDeny: options.deny } : {}),
  })
  if (chat === 'admin-private') h.sendText('hi')
  else if (chat === 'member-private') h.sendTextAs('hi', 20002)
  else h.sendGroupTextAs('hi', 10001)
  await waitForTools(h)
  h.client.close()
  return [...h.captured.channelTools].sort()
}

describe('矩阵 — capabilitiesDeny=[] 时与改造前完全一致（零行为变化）', () => {
  for (const chat of ['admin-private', 'member-private', 'group'] as const) {
    for (const stickers of [false, true]) {
      for (const memory of [false, true]) {
        const key = chat + '|sticker=' + (stickers ? 'on' : 'off') + '|memory=' + (memory ? 'on' : 'off')
        it(key + ' 注册到的工具集合 = 改造前', async () => {
          const actual = await toolsOf(chat, { stickers, memory })
          expect(actual.join(' ')).toBe(PRE_CHANGE_TOOLS[key])
        })
      }
    }
  }
})

describe('deny 生效 — 关掉的能力连主人私聊也不再注册工具', () => {
  it('管理员私聊 deny 两项：图片工具与表情包存/搜/发消失，其余照旧', async () => {
    const actual = await toolsOf('admin-private', {
      stickers: true,
      memory: true,
      deny: ['qq.send.image', 'qq.sticker.use'],
    })
    expect(actual).not.toContain('qq_send_image')
    expect(actual).not.toContain('qq_sticker_save')
    expect(actual).not.toContain('qq_sticker_search')
    expect(actual).not.toContain('qq_sticker_send')
    // 同一依赖下的另一项能力（表情包改/删）不受影响。
    expect(actual).toContain('qq_sticker_edit')
    expect(actual).toContain('qq_sticker_delete')
    expect(actual).toContain('qq_send_voice')
    expect(actual).toContain('qq_memory_note')
  })

  it('群聊与非管理员私聊同样受 deny 约束（全局关闭）', async () => {
    for (const chat of ['group', 'member-private'] as const) {
      const actual = await toolsOf(chat, { stickers: false, memory: false, deny: ['qq.napcat.api'] })
      expect(actual).not.toContain('qq_napcat_api')
      expect(actual).toContain('qq_send_image')
    }
  })

  it('未知 id 不会关掉任何功能（启动自检另有告警）', async () => {
    const actual = await toolsOf('admin-private', { stickers: false, memory: false, deny: ['qq.nope'] })
    expect(actual.join(' ')).toBe(PRE_CHANGE_TOOLS['admin-private|sticker=off|memory=off'])
  })
})

describe('resolveCapabilities — 判定顺序与 why 文案', () => {
  const allDeps: CapabilityDependency[] = ['memoryNote', 'stickerLib']

  it('管理员私聊 + 依赖全开 → 全部能力，tools = 注册表工具名', () => {
    const resolved = resolveCapabilities({
      config: { capabilitiesDeny: [] },
      deps: allDeps,
      chat: { kind: 'private', adminPrivate: true },
    })
    expect([...resolved.enabled].sort()).toEqual([...ALL_CAPABILITY_IDS].sort())
    expect(resolved.tools).toEqual(REGISTRY_TOOLS)
    for (const id of ALL_CAPABILITY_IDS) expect(resolved.why(id)).toBe('管理员私聊默认开启')
  })

  it('deny 优先于一切：命中即关（主人私聊也关），原因为 deny', () => {
    const resolved = resolveCapabilities({
      config: { capabilitiesDeny: ['qq.send.forward', ' qq.napcat.api '] },
      deps: allDeps,
      chat: { kind: 'private', adminPrivate: true },
    })
    expect(resolved.enabled.has('qq.send.forward')).toBe(false)
    expect(resolved.enabled.has('qq.napcat.api')).toBe(false) // 两侧空白被裁掉
    expect(resolved.tools).not.toContain('qq_send_forward')
    expect(resolved.why('qq.send.forward')).toBe('已在 capabilitiesDeny 里关闭')
    expect(resolved.why('qq.send.image')).toBe('管理员私聊默认开启')
  })

  it('依赖不满足 → 关，原因说清缺什么；deny 的优先级更高（同时命中报 deny）', () => {
    const resolved = resolveCapabilities({
      config: { capabilitiesDeny: ['qq.sticker.manage'] },
      deps: [],
      chat: { kind: 'private', adminPrivate: true },
    })
    expect(resolved.enabled.has('qq.sticker.use')).toBe(false)
    expect(resolved.why('qq.sticker.use')).toBe('表情包库未开启（stickerDir 为空）')
    expect(resolved.why('qq.memory.note')).toBe('没有可写的记忆文件（publicMemoryFile 与 groupMemoryDir 都没配）')
    expect(resolved.why('qq.sticker.manage')).toBe('已在 capabilitiesDeny 里关闭')
    // 无依赖的能力不受影响。
    expect(resolved.enabled.has('qq.send.image')).toBe(true)
    expect(resolved.enabled.size).toBe(CAPABILITIES.length - 3)
  })

  it('群聊 / 非管理员私聊按各自的默认位判定（why 文案区分会话类型）', () => {
    const group = resolveCapabilities({ config: {}, deps: allDeps, chat: { kind: 'group', adminPrivate: false } })
    expect(group.enabled.size).toBe(CAPABILITIES.length)
    expect(group.why('qq.send.image')).toBe('群聊默认开启')
    const member = resolveCapabilities({ config: {}, deps: allDeps, chat: { kind: 'private', adminPrivate: false } })
    expect(member.enabled.size).toBe(CAPABILITIES.length)
    expect(member.why('qq.send.image')).toBe('非管理员私聊默认开启')
  })

  it('未知 id 的 why 是可读的兜底文案；配置文件里也只看已知 id', () => {
    const resolved = resolveCapabilities({ config: {}, deps: allDeps, chat: { kind: 'private', adminPrivate: true } })
    expect(resolved.why('qq.no.such' as never)).toBe('未知能力 id')
    expect(unknownCapabilityIds(['qq.send.image', 'qq.bogus', ' qq.bogus ', ''])).toEqual(['qq.bogus'])
  })
})

describe('未知能力 id 在启动自检里告警', () => {
  const base = {
    host: '127.0.0.1', accessToken: 't', botQQ: '', adminUsers: ['2824149798'],
    dmPolicy: 'open', groupPolicy: 'open', allowFrom: [], groupAllowFrom: [], allowAllUsers: false,
    memberPermission: 'read-only', workspacePath: '', adminWorkspacePath: '', groupMemoryDir: '',
    publicMemoryFile: '', scheduledPrompts: [], proactiveEnabled: false, proactiveChatId: '',
    proactiveWindowStart: '09:00', proactiveWindowEnd: '22:00', proactiveMinPerDay: 0,
    proactiveMaxPerDay: 0, splitLines: false, splitMaxMessages: 6,
  }

  it('未知 id → 一条中文告警，列出可用 id；合法配置不产生这条告警', () => {
    const withUnknown = selfCheck({ ...base, capabilitiesDeny: ['qq.send.image', 'qq.unknown.thing'] })
    const warning = withUnknown.filter(problem => problem.includes('capabilitiesDeny'))
    expect(warning).toHaveLength(1)
    expect(warning[0]).toContain('qq.unknown.thing')
    expect(warning[0]).toContain('qq.send.image')
    const clean = selfCheck({ ...base, capabilitiesDeny: ['qq.send.image'] })
    expect(clean.filter(problem => problem.includes('capabilitiesDeny'))).toHaveLength(0)
  })
})

describe('/doctor 与状态快照', () => {
  it('summarizeCapabilities / formatCapabilityLine：全开与关闭项两种形态', () => {
    const all = summarizeCapabilities(resolveCapabilities({
      config: {},
      deps: ['memoryNote', 'stickerLib'],
      chat: { kind: 'private', adminPrivate: true },
    }))
    expect(all).toEqual({ enabled: CAPABILITIES.length, total: CAPABILITIES.length, disabled: [] })
    expect(formatCapabilityLine(all)).toBe('能力：已开 ' + CAPABILITIES.length + ' / 共 ' + CAPABILITIES.length)
    const some = summarizeCapabilities(resolveCapabilities({
      config: { capabilitiesDeny: ['qq.send.image'] },
      deps: [],
      chat: { kind: 'private', adminPrivate: true },
    }))
    const line = formatCapabilityLine(some)
    expect(line).toContain('能力：已开 ' + (CAPABILITIES.length - 4) + ' / 共 ' + CAPABILITIES.length)
    expect(line).toContain('qq.send.image（已在 capabilitiesDeny 里关闭）')
    expect(line).toContain('qq.sticker.use（表情包库未开启（stickerDir 为空））')
  })

  it('/doctor 报告里有一行「能力：…」（按管理员私聊视角）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cap-doctor-'))
    const report = await healthReport({
      mediaDir: dir,
      connection: { connected: true, selfId: '10002' },
      transport: { host: '127.0.0.1', port: 8643 },
      retryState: {},
      dedup: { entries: 0, windowSeconds: 300 },
      configSnapshot: {},
      capabilities: () => summarizeCapabilities(resolveCapabilities({
        config: { capabilitiesDeny: ['qq.send.image'] },
        deps: ['memoryNote', 'stickerLib'],
        chat: { kind: 'private', adminPrivate: true },
      })),
      log: () => undefined,
    })
    expect(report).toContain('能力：已开 ' + (CAPABILITIES.length - 1) + ' / 共 ' + CAPABILITIES.length)
    expect(report).toContain('qq.send.image（已在 capabilitiesDeny 里关闭）')
  })

  it('状态快照带上 capabilities（缺席为 null；bridge 的 capabilitySummary 与 /doctor 同源）', async () => {
    const summary = summarizeCapabilities(resolveCapabilities({ config: {}, deps: [], chat: { kind: 'private', adminPrivate: true } }))
    const withCaps = await buildCompanionStatusSnapshot({ capabilities: () => summary })
    expect(withCaps.capabilities).toEqual(summary)
    const without = await buildCompanionStatusSnapshot()
    expect(without.capabilities).toBeNull()
    // 单次取数抛错只让该字段为 null。
    const boom = await buildCompanionStatusSnapshot({ capabilities: () => { throw new Error('no caps') } })
    expect(boom.capabilities).toBeNull()

    const h = await makeCmdHarness({ stickers: {}, publicMemoryFile: join(mkdtempSync(join(tmpdir(), 'cap-mem-')), 'AGENTS.md') })
    const bridgeSummary = h.bridge.capabilitySummary()
    h.client.close()
    expect(bridgeSummary).toEqual({
      enabled: CAPABILITIES.length,
      total: CAPABILITIES.length,
      disabled: [],
    })
  })

  it('bridge 的摘要跟随 capabilitiesDeny 与运行时依赖', async () => {
    const h = await makeCmdHarness({ capabilitiesDeny: ['qq.sticker.use', 'qq.memory.note'] })
    const summary = h.bridge.capabilitySummary()
    h.client.close()
    // 表情包库 / 记忆文件都没开 → 两项本来就因依赖关闭，这里再 deny 也还是关；
    // 但 deny 的原因优先。
    expect(summary.disabled.map(item => item.id)).toEqual(['qq.memory.note', 'qq.sticker.use', 'qq.sticker.manage'])
    expect(summary.disabled[0].reason).toBe('已在 capabilitiesDeny 里关闭')
    expect(summary.disabled[1].reason).toBe('已在 capabilitiesDeny 里关闭')
    // 没被 deny 的那一项仍按依赖说明原因。
    expect(summary.disabled[2].reason).toBe('表情包库未开启（stickerDir 为空）')
    expect(summary.enabled).toBe(CAPABILITIES.length - 3)
  })
})