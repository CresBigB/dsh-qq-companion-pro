/**
 * T6 · 能力注册表（src/capabilities.ts）的契约与**零行为变化**证据，
 * 以及 T11 · 按关系授权（grant）的判定顺序与矩阵。
 *
 *   ① 注册表结构自洽：每个工具恰好属于一个能力、id 唯一、中文名/说明齐全、
 *      默认位（改造前的 11 项全开；T12 的三个隐私能力全关）；
 *   ② 两份手写工具清单（package.json dshx.contributes.tools / dsh.plugin.json
 *      contributes.tools）≡ 注册表，且注册表 ≡「依赖全开的管理员私聊」里实际
 *      注册到的工具集合（以后加工具忘了登记会被拦住）；
 *   ③ resolveCapabilities 的判定顺序与 why() 中文文案；
 *   ④ 矩阵：`capabilitiesDeny` 与三个 grant 都为空时三种会话 × 表情包库开/关 ×
 *      记忆文件开/关，注册到的工具集合与**改造前**逐字一致（见 PRE_CHANGE_TOOLS
 *      与 expectedTools 的注释）；四个关系 × 全部能力的开启矩阵；
 *   ⑤ deny 生效、T11 的三个 grant 各自只影响自己的档（deny / 依赖都比 grant 硬）、
 *      T11 r1 的三个按关系 deny（friendDeny / memberDeny / strangerDeny）各自只关
 *      自己那一档、deny 优先于 grant、群聊里主人也走群友档、老 adminPrivate 入参的
 *      兼容；
 *   ⑥ 未知 id 告警（全局 deny + 三个按关系 deny + 三个 grant）、配置描述里的能力
 *      清单 ≡ 注册表、/doctor 四关系行（按关系 deny 后四个数真的不同）与状态快照
 *      摘要 byRelation。
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
  chatViewOf,
  decideCapability,
  findCapability,
  formatCapabilityLine,
  resolveCapabilities,
  summarizeCapabilities,
  unknownCapabilityIds,
  type CapabilityDef,
  type CapabilityDependency,
} from '../src/capabilities.js'
import { Config } from '../src/config.js'
import { healthReport } from '../src/health.js'
import { RELATIONS, RELATION_NAMES, sessionRelation } from '../src/relation.js'
import { selfCheck } from '../src/selfcheck.js'
import { buildCompanionStatusSnapshot } from '../src/status.js'
import { makeCmdHarness } from './helpers/bridge-harness.js'

const ROOT = join(import.meta.dirname, '..')

/** 从注册表读出的「全部工具」名称（顺序即清单顺序）。 */
const REGISTRY_TOOLS = allToolNames()

/** 依赖全开（表情包库 + 记忆文件都在）。 */
const ALL_DEPS: CapabilityDependency[] = ['memoryNote', 'stickerLib']

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

  it('覆盖现在的全部模型工具（18 个）', () => {
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
      'qq_list_groups',
      'qq_group_info',
      'qq_list_friends',
      'qq_private_history',
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

  it('默认位：改造前的 11 项全为 true；T12 的三个隐私能力全为 false', () => {
    /** 默认关闭的能力（T12：群列表 / 好友列表 / 私聊历史都是账号隐私）。 */
    const OFF_BY_DEFAULT = ['qq.list.groups', 'qq.list.friends', 'qq.history.private']
    for (const capability of CAPABILITIES) {
      const off = OFF_BY_DEFAULT.includes(capability.id)
      expect(capability.memberDefault, capability.id).toBe(!off)
      expect(capability.groupDefault, capability.id).toBe(!off)
    }
    // 改造前有过的那 11 项一个都没被改成默认关。
    expect(CAPABILITIES.filter(capability => !OFF_BY_DEFAULT.includes(capability.id))).toHaveLength(11)
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

  it('三个 grant 的配置描述同样带完整能力清单（hint 由注册表生成，不手写）', () => {
    const dict = (Config as unknown as { dict: Record<string, { meta?: { description?: string } }> }).dict
    for (const key of ['friendGrant', 'memberGrant', 'strangerGrant']) {
      const description = dict[key]?.meta?.description ?? ''
      expect(description, key).toContain(capabilityCatalogText())
      for (const capability of CAPABILITIES) {
        expect(description, key + ' 缺 id ' + capability.id).toContain(capability.id)
        expect(description, key + ' 缺中文名 ' + capability.title).toContain(capability.title)
      }
    }
  })

  it('三个按关系 deny 的配置描述同样带完整能力清单，并讲清「只针对这一档 / 全局 deny 优先」', () => {
    const dict = (Config as unknown as { dict: Record<string, { meta?: { description?: string } }> }).dict
    for (const key of ['friendDeny', 'memberDeny', 'strangerDeny']) {
      const description = dict[key]?.meta?.description ?? ''
      expect(description, key).toContain(capabilityCatalogText())
      for (const capability of CAPABILITIES) {
        expect(description, key + ' 缺 id ' + capability.id).toContain(capability.id)
        expect(description, key + ' 缺中文名 ' + capability.title).toContain(capability.title)
      }
      expect(description, key).toContain('capabilitiesDeny 是全局关，这里只针对这一档人；两边都写了以 capabilitiesDeny 为准。')
    }
    // grant 的说明指回对应的 deny（默认位全开时 grant 空转，要关只能用 deny）。
    expect(dict.friendGrant?.meta?.description ?? '').toContain('friendDeny')
    expect(dict.memberGrant?.meta?.description ?? '').toContain('memberDeny')
    expect(dict.strangerGrant?.meta?.description ?? '').toContain('strangerDeny')
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

/** T12 新增的四个隐私工具（默认只在管理员私聊注册）。 */
const PRIVACY_TOOLS = ['qq_list_groups', 'qq_group_info', 'qq_list_friends', 'qq_private_history']

/**
 * 一个矩阵组合今天该注册到的工具集合 = **改造前集合 + T12 的增量**。
 *
 * 增量只有一条：管理员私聊默认位恒开，所以会多出四个隐私工具；群聊与非管理员
 * 私聊的默认位是 false，集合与改造前**逐字一致**——这条断言本身就是「老工具零
 * 行为变化」的证据（预期串是改造前原文拼出来的，不是我重抄的）。
 */
function expectedTools(key: string): string {
  const legacy = PRE_CHANGE_TOOLS[key]
  if (!key.startsWith('admin-private|')) return legacy
  return [...legacy.split(' '), ...PRIVACY_TOOLS].sort().join(' ')
}

/**
 * 空配置下每个关系能开几项能力：主人恒开；群聊看 `groupDefault`；
 * 其余私聊看 `memberDefault`（T12 起三种关系不再是同一个数）。
 */
function defaultOpenCount(relation: 'owner' | 'friend' | 'groupMember' | 'stranger'): number {
  if (relation === 'owner') return CAPABILITIES.length
  const field = relation === 'groupMember' ? 'groupDefault' : 'memberDefault'
  return CAPABILITIES.filter(capability => capability[field]).length
}

type ChatKind = 'admin-private' | 'member-private' | 'group'

/** 跑一个组合：建 harness → 用对应身份发一句话 → 读出实际注册的工具（已排序）。 */
async function toolsOf(chat: ChatKind, options: {
  stickers: boolean
  memory: boolean
  deny?: string[]
  /** T11 r1：三个按关系的 deny。 */
  friendDeny?: string[]
  memberDeny?: string[]
  strangerDeny?: string[]
  /** 好友名单（让 member-private 档变成好友档；absent = 空 → 陌生人档）。 */
  friendUsers?: string[]
  friendGrant?: string[]
  memberGrant?: string[]
  strangerGrant?: string[]
}): Promise<string[]> {
  const h = await makeCmdHarness({
    allowAllUsers: true,
    ...(options.stickers ? { stickers: {} } : {}),
    ...(options.memory ? { publicMemoryFile: join(mkdtempSync(join(tmpdir(), 'cap-mem-')), 'AGENTS.md') } : {}),
    ...(options.deny !== undefined ? { capabilitiesDeny: options.deny } : {}),
    ...(options.friendDeny !== undefined ? { friendDeny: options.friendDeny } : {}),
    ...(options.memberDeny !== undefined ? { memberDeny: options.memberDeny } : {}),
    ...(options.strangerDeny !== undefined ? { strangerDeny: options.strangerDeny } : {}),
    ...(options.friendUsers !== undefined ? { friendUsers: options.friendUsers } : {}),
    ...(options.friendGrant !== undefined ? { friendGrant: options.friendGrant } : {}),
    ...(options.memberGrant !== undefined ? { memberGrant: options.memberGrant } : {}),
    ...(options.strangerGrant !== undefined ? { strangerGrant: options.strangerGrant } : {}),
  })
  if (chat === 'admin-private') h.sendText('hi')
  else if (chat === 'member-private') h.sendTextAs('hi', 20002)
  else h.sendGroupTextAs('hi', 10001)
  await waitForTools(h)
  h.client.close()
  return [...h.captured.channelTools].sort()
}

describe('矩阵 — deny 与三个 grant 都为空时与改造前完全一致（零行为变化）', () => {
  for (const chat of ['admin-private', 'member-private', 'group'] as const) {
    for (const stickers of [false, true]) {
      for (const memory of [false, true]) {
        const key = chat + '|sticker=' + (stickers ? 'on' : 'off') + '|memory=' + (memory ? 'on' : 'off')
        it(key + ' 注册到的工具集合 = 改造前', async () => {
          const actual = await toolsOf(chat, { stickers, memory })
          expect(actual.join(' ')).toBe(expectedTools(key))
        })
      }
    }
  }

  it('三个 grant 显式填空数组时，与完全不填逐字一致（默认值 = 现有行为）', async () => {
    const empty = await toolsOf('group', { stickers: true, memory: true, friendGrant: [], memberGrant: [], strangerGrant: [] })
    expect(empty.join(' ')).toBe(PRE_CHANGE_TOOLS['group|sticker=on|memory=on'])
  })
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
    expect(actual.join(' ')).toBe(expectedTools('admin-private|sticker=off|memory=off'))
  })
})

describe('T11 · grant 生效 — 三个 grant 各自只影响自己的关系档', () => {
  /**
   * 注册表的默认位当前**全开**，所以 grant 的直接可观测效果是 why() 的解释
   * （第 3 步确实排在第 4 步默认位之前）；「默认关闭的能力被 grant 打开」这件事
   * 用下面的 decideCapability 假定义单独证明。
   *
   * 档位归属（需求 2 / 3）：好友私聊 → friendGrant，群聊 → memberGrant，
   * 陌生人私聊 → strangerGrant，主人私聊没有 grant（默认全开）。
   */
  it('memberGrant 命中群聊档：why 说 grant，群聊里没写进 grant 的照旧按群默认位', () => {
    const resolved = resolveCapabilities({
      config: { memberGrant: ['qq.napcat.api'] },
      deps: ALL_DEPS,
      chat: chatViewOf('groupMember'),
    })
    expect(resolved.enabled.has('qq.napcat.api')).toBe(true)
    expect(resolved.why('qq.napcat.api')).toBe('群聊 grant（memberGrant）已开放')
    expect(resolved.why('qq.send.image')).toBe('群聊默认开启')
  })

  it('memberGrant 不串到好友 / 陌生人私聊（那两档各看自己的 grant）', () => {
    const config = { memberGrant: ['qq.napcat.api'] }
    for (const relation of ['friend', 'stranger'] as const) {
      const resolved = resolveCapabilities({ config, deps: ALL_DEPS, chat: chatViewOf(relation) })
      expect(resolved.why('qq.napcat.api'), RELATION_NAMES[relation]).toBe('非管理员私聊默认开启')
    }
  })

  it('friendGrant 只影响好友私聊', () => {
    const config = { friendGrant: ['qq.send.voice'] }
    const friend = resolveCapabilities({ config, deps: ALL_DEPS, chat: chatViewOf('friend') })
    expect(friend.why('qq.send.voice')).toBe('好友 grant（friendGrant）已开放')
    expect(friend.why('qq.send.image')).toBe('非管理员私聊默认开启')
    const stranger = resolveCapabilities({ config, deps: ALL_DEPS, chat: chatViewOf('stranger') })
    expect(stranger.why('qq.send.voice')).toBe('非管理员私聊默认开启')
    const group = resolveCapabilities({ config, deps: ALL_DEPS, chat: chatViewOf('groupMember') })
    expect(group.why('qq.send.voice')).toBe('群聊默认开启')
    const owner = resolveCapabilities({ config, deps: ALL_DEPS, chat: chatViewOf('owner') })
    expect(owner.why('qq.send.voice')).toBe('管理员私聊默认开启')
  })

  it('strangerGrant 只影响陌生人私聊', () => {
    const config = { strangerGrant: ['qq.message.open'] }
    const stranger = resolveCapabilities({ config, deps: ALL_DEPS, chat: chatViewOf('stranger') })
    expect(stranger.why('qq.message.open')).toBe('陌生人 grant（strangerGrant）已开放')
    for (const relation of ['friend', 'groupMember', 'owner'] as const) {
      const resolved = resolveCapabilities({ config, deps: ALL_DEPS, chat: chatViewOf(relation) })
      expect(resolved.why('qq.message.open'), RELATION_NAMES[relation]).not.toContain('grant')
    }
  })

  it('主人不受三个 grant 影响（默认全开，grant 只加不减）', () => {
    const config = {
      friendGrant: ['qq.send.voice'],
      memberGrant: ['qq.napcat.api'],
      strangerGrant: ['qq.send.image'],
    }
    const owner = resolveCapabilities({ config, deps: ALL_DEPS, chat: chatViewOf('owner') })
    expect([...owner.enabled].sort()).toEqual([...ALL_CAPABILITY_IDS].sort())
    for (const id of ALL_CAPABILITY_IDS) expect(owner.why(id)).toBe('管理员私聊默认开启')
  })

  it('端到端：群聊里 grant 只影响 why，不改变已注册工具（默认位全开时无差）', async () => {
    const withGrant = await toolsOf('group', { stickers: true, memory: true, memberGrant: ['qq.napcat.api'] })
    expect(withGrant.join(' ')).toBe(PRE_CHANGE_TOOLS['group|sticker=on|memory=on'])
  })
})

describe('T11 r1 · 按关系 deny — 只关自己那一档（默认位全开时唯一有效的「减」）', () => {
  it('memberDeny 关 qq.napcat.api：群里 qq_napcat_api 真的不注册，主人私聊照常', async () => {
    const group = await toolsOf('group', { stickers: false, memory: false, memberDeny: ['qq.napcat.api'] })
    expect(group).not.toContain('qq_napcat_api')
    // 群聊其余工具照旧：只比「什么 deny 都没写」时少了 qq_napcat_api 这一个工具。
    expect(group.join(' ')).toBe(
      PRE_CHANGE_TOOLS['group|sticker=off|memory=off'].split(' ').filter(tool => tool !== 'qq_napcat_api').join(' '),
    )
    const owner = await toolsOf('admin-private', { stickers: false, memory: false, memberDeny: ['qq.napcat.api'] })
    expect(owner).toContain('qq_napcat_api')
    expect(owner.join(' ')).toBe(expectedTools('admin-private|sticker=off|memory=off'))
  })

  it('memberDeny 只影响群聊：好友私聊、陌生人私聊都不受影响', async () => {
    const expectedMember = PRE_CHANGE_TOOLS['member-private|sticker=off|memory=off']
    const stranger = await toolsOf('member-private', { stickers: false, memory: false, memberDeny: ['qq.napcat.api'] })
    expect(stranger.join(' ')).toBe(expectedMember)
    const friend = await toolsOf('member-private', {
      stickers: false, memory: false, memberDeny: ['qq.napcat.api'], friendUsers: ['20002'],
    })
    expect(friend.join(' ')).toBe(expectedMember)
  })

  it('friendDeny 只影响好友私聊；strangerDeny 只影响陌生人私聊', async () => {
    const memberPrivate = PRE_CHANGE_TOOLS['member-private|sticker=off|memory=off']
    const withoutNapcat = memberPrivate.split(' ').filter(tool => tool !== 'qq_napcat_api').join(' ')
    // 好友档：要 friendUsers 里才有 20002。
    const friendDenied = await toolsOf('member-private', {
      stickers: false, memory: false, friendDeny: ['qq.napcat.api'], friendUsers: ['20002'],
    })
    expect(friendDenied.join(' ')).toBe(withoutNapcat)
    // 同一条 friendDeny 对陌生人档无效。
    const strangerWithFriendDeny = await toolsOf('member-private', {
      stickers: false, memory: false, friendDeny: ['qq.napcat.api'],
    })
    expect(strangerWithFriendDeny.join(' ')).toBe(memberPrivate)
    // strangerDeny 反过来只影响陌生人档。
    const strangerDenied = await toolsOf('member-private', { stickers: false, memory: false, strangerDeny: ['qq.napcat.api'] })
    expect(strangerDenied.join(' ')).toBe(withoutNapcat)
    const friendWithStrangerDeny = await toolsOf('member-private', {
      stickers: false, memory: false, strangerDeny: ['qq.napcat.api'], friendUsers: ['20002'],
    })
    expect(friendWithStrangerDeny.join(' ')).toBe(memberPrivate)
    // 群聊不受两个私聊档的 deny 影响。
    const group = await toolsOf('group', {
      stickers: false, memory: false, friendDeny: ['qq.napcat.api'], strangerDeny: ['qq.napcat.api'],
    })
    expect(group.join(' ')).toBe(PRE_CHANGE_TOOLS['group|sticker=off|memory=off'])
  })

  it('why 点出是哪个按关系 deny 关的（三档各自的文案）', () => {
    const config = {
      friendDeny: ['qq.send.voice'],
      memberDeny: ['qq.napcat.api'],
      strangerDeny: ['qq.message.open'],
    }
    const friend = resolveCapabilities({ config, deps: ALL_DEPS, chat: chatViewOf('friend') })
    expect(friend.enabled.has('qq.send.voice')).toBe(false)
    expect(friend.why('qq.send.voice')).toBe('好友关系 deny（friendDeny）已关闭')
    const group = resolveCapabilities({ config, deps: ALL_DEPS, chat: chatViewOf('groupMember') })
    expect(group.enabled.has('qq.napcat.api')).toBe(false)
    expect(group.why('qq.napcat.api')).toBe('群聊关系 deny（memberDeny）已关闭')
    const stranger = resolveCapabilities({ config, deps: ALL_DEPS, chat: chatViewOf('stranger') })
    expect(stranger.enabled.has('qq.message.open')).toBe(false)
    expect(stranger.why('qq.message.open')).toBe('陌生人关系 deny（strangerDeny）已关闭')
    // 主人私聊没有按关系的 deny 位：四个关系 deny 都不影响主人（要关就写全局）。
    const owner = resolveCapabilities({ config, deps: ALL_DEPS, chat: chatViewOf('owner') })
    expect([...owner.enabled].sort()).toEqual([...ALL_CAPABILITY_IDS].sort())
    for (const id of ALL_CAPABILITY_IDS) expect(owner.why(id)).toBe('管理员私聊默认开启')
  })

  it('三个 deny 显式填空数组时与完全不填逐字一致（默认值 = 现有行为）', async () => {
    const empty = await toolsOf('group', {
      stickers: true, memory: true, friendDeny: [], memberDeny: [], strangerDeny: [],
    })
    expect(empty.join(' ')).toBe(PRE_CHANGE_TOOLS['group|sticker=on|memory=on'])
  })

  it('未知 id 不会关掉任何功能（启动自检另有告警）', async () => {
    const group = await toolsOf('group', { stickers: false, memory: false, memberDeny: ['qq.nope'] })
    expect(group.join(' ')).toBe(PRE_CHANGE_TOOLS['group|sticker=off|memory=off'])
  })
})

describe('T11 · 判定顺序 — deny 与运行时依赖都比 grant 更硬', () => {
  it('同一能力同时出现在 capabilitiesDeny 与 memberGrant → 关，why 说明是 deny', () => {
    const resolved = resolveCapabilities({
      config: { capabilitiesDeny: ['qq.napcat.api'], memberGrant: ['qq.napcat.api'] },
      deps: ALL_DEPS,
      chat: chatViewOf('groupMember'),
    })
    expect(resolved.enabled.has('qq.napcat.api')).toBe(false)
    expect(resolved.why('qq.napcat.api')).toBe('已在 capabilitiesDeny 里关闭')
    expect(resolved.tools).not.toContain('qq_napcat_api')
  })

  it('deny 与 friendGrant / strangerGrant 撞车也是 deny 优先', () => {
    const config = {
      capabilitiesDeny: ['qq.send.image', 'qq.message.open'],
      friendGrant: ['qq.send.image'],
      strangerGrant: ['qq.message.open'],
    }
    const friend = resolveCapabilities({ config, deps: ALL_DEPS, chat: chatViewOf('friend') })
    expect(friend.why('qq.send.image')).toBe('已在 capabilitiesDeny 里关闭')
    const stranger = resolveCapabilities({ config, deps: ALL_DEPS, chat: chatViewOf('stranger') })
    expect(stranger.why('qq.message.open')).toBe('已在 capabilitiesDeny 里关闭')
  })

  it('依赖不满足时 grant 也开不了：没有表情包库，memberGrant 写了也是依赖原因', () => {
    const resolved = resolveCapabilities({
      config: { memberGrant: ['qq.sticker.use'] },
      deps: ['memoryNote'],
      chat: chatViewOf('groupMember'),
    })
    expect(resolved.enabled.has('qq.sticker.use')).toBe(false)
    expect(resolved.why('qq.sticker.use')).toBe('表情包库未开启（stickerDir 为空）')
    expect(resolved.tools).not.toContain('qq_sticker_send')
  })

  it('同一能力同时出现在 memberDeny 与 memberGrant → 关（按关系 deny 优先于 grant）', () => {
    const resolved = resolveCapabilities({
      config: { memberDeny: ['qq.napcat.api'], memberGrant: ['qq.napcat.api'] },
      deps: ALL_DEPS,
      chat: chatViewOf('groupMember'),
    })
    expect(resolved.enabled.has('qq.napcat.api')).toBe(false)
    expect(resolved.why('qq.napcat.api')).toBe('群聊关系 deny（memberDeny）已关闭')
    expect(resolved.tools).not.toContain('qq_napcat_api')
  })

  it('同一能力同时出现在 friendDeny 与 friendGrant → 关；strangerDeny 与 strangerGrant 同理', () => {
    const config = {
      friendDeny: ['qq.send.image'],
      friendGrant: ['qq.send.image'],
      strangerDeny: ['qq.message.open'],
      strangerGrant: ['qq.message.open'],
    }
    const friend = resolveCapabilities({ config, deps: ALL_DEPS, chat: chatViewOf('friend') })
    expect(friend.why('qq.send.image')).toBe('好友关系 deny（friendDeny）已关闭')
    const stranger = resolveCapabilities({ config, deps: ALL_DEPS, chat: chatViewOf('stranger') })
    expect(stranger.why('qq.message.open')).toBe('陌生人关系 deny（strangerDeny）已关闭')
  })

  it('全局 deny 比按关系 deny 更高优先：两个都写了，why 报全局那条', () => {
    const group = resolveCapabilities({
      config: { capabilitiesDeny: ['qq.napcat.api'], memberDeny: ['qq.napcat.api'] },
      deps: ALL_DEPS,
      chat: chatViewOf('groupMember'),
    })
    expect(group.why('qq.napcat.api')).toBe('已在 capabilitiesDeny 里关闭')
    // 全局 deny 同时关掉其他三档（按关系 deny 不会）。
    for (const relation of ['owner', 'friend', 'stranger'] as const) {
      const resolved = resolveCapabilities({
        config: { capabilitiesDeny: ['qq.napcat.api'], memberDeny: ['qq.napcat.api'] },
        deps: ALL_DEPS,
        chat: chatViewOf(relation),
      })
      expect(resolved.enabled.has('qq.napcat.api'), RELATION_NAMES[relation]).toBe(false)
    }
  })

  it('依赖缺失比按关系 deny 更高优先：两个都命中时报依赖原因', () => {
    const resolved = resolveCapabilities({
      config: { memberDeny: ['qq.sticker.use'] },
      deps: ['memoryNote'],
      chat: chatViewOf('groupMember'),
    })
    expect(resolved.why('qq.sticker.use')).toBe('表情包库未开启（stickerDir 为空）')
  })

  it('端到端：群里 memberDeny 与 memberGrant 撞车 → 工具确实没注册', async () => {
    const actual = await toolsOf('group', {
      stickers: true,
      memory: true,
      memberDeny: ['qq.send.image'],
      memberGrant: ['qq.send.image'],
    })
    expect(actual).not.toContain('qq_send_image')
    expect(actual).toContain('qq_send_voice')
  })

  it('端到端：群里 deny 与 memberGrant 撞车 → 工具确实没注册', async () => {
    const actual = await toolsOf('group', {
      stickers: true,
      memory: true,
      deny: ['qq.send.image'],
      memberGrant: ['qq.send.image'],
    })
    expect(actual).not.toContain('qq_send_image')
    expect(actual).toContain('qq_send_voice')
  })
})

describe('T11 · 默认关闭的能力被 grant 打开（第 3 步确实先于默认位）', () => {
  // 注册表现状默认位全开，「grant 打开一个默认关闭的能力」没法从真实注册表观察，
  // 所以这里喂一份 memberDefault / groupDefault 都为 false 的假定义给纯判定函数。
  const offByDefault: CapabilityDef = {
    id: 'qq.send.image',
    title: '发图片',
    tools: ['qq_send_image'],
    describe: '假定义：默认位关，只有 grant 能开。',
    memberDefault: false,
    groupDefault: false,
  }

  function judge(options: {
    grant?: { key: 'friendGrant' | 'memberGrant' | 'strangerGrant'; ids: string[] } | null
    deny?: string[]
    deps?: CapabilityDependency[]
    relation?: 'owner' | 'friend' | 'groupMember' | 'stranger'
  }) {
    const relation = options.relation ?? 'groupMember'
    return decideCapability({
      capability: offByDefault,
      deny: new Set(options.deny ?? []),
      available: new Set<CapabilityDependency>(options.deps ?? ALL_DEPS),
      grant: options.grant === undefined || options.grant === null
        ? null
        : { key: options.grant.key, ids: new Set(options.grant.ids) },
      chat: chatViewOf(relation),
      relation,
    })
  }

  it('没有 grant → 按默认位关（群聊默认关闭 / 非管理员私聊默认关闭）', () => {
    expect(judge({})).toEqual({ open: false, reason: '群聊默认关闭' })
    expect(judge({ relation: 'stranger' })).toEqual({ open: false, reason: '非管理员私聊默认关闭' })
  })

  it('grant 命中 → 开（原因点出是哪个 grant）', () => {
    expect(judge({ grant: { key: 'memberGrant', ids: ['qq.send.image'] } }))
      .toEqual({ open: true, reason: '群聊 grant（memberGrant）已开放' })
    expect(judge({ relation: 'friend', grant: { key: 'friendGrant', ids: ['qq.send.image'] } }))
      .toEqual({ open: true, reason: '好友 grant（friendGrant）已开放' })
    expect(judge({ relation: 'stranger', grant: { key: 'strangerGrant', ids: ['qq.send.image'] } }))
      .toEqual({ open: true, reason: '陌生人 grant（strangerGrant）已开放' })
  })

  it('grant 没命中 → 仍按默认位关；命中别的 id 不算', () => {
    expect(judge({ grant: { key: 'memberGrant', ids: ['qq.send.voice'] } })).toEqual({ open: false, reason: '群聊默认关闭' })
  })

  it('deny 命中 → 关（grant 绕不过 deny）', () => {
    expect(judge({ deny: ['qq.send.image'], grant: { key: 'memberGrant', ids: ['qq.send.image'] } }))
      .toEqual({ open: false, reason: '已在 capabilitiesDeny 里关闭' })
  })

  it('依赖缺失 → 关（依赖比 grant 硬）', () => {
    const sticker: CapabilityDef = { ...offByDefault, id: 'qq.sticker.use', tools: ['qq_sticker_send'], deps: ['stickerLib'] }
    const decision = decideCapability({
      capability: sticker,
      deny: new Set<string>(),
      available: new Set<CapabilityDependency>(['memoryNote']),
      grant: { key: 'memberGrant', ids: new Set(['qq.sticker.use']) },
      chat: chatViewOf('groupMember'),
      relation: 'groupMember',
    })
    expect(decision).toEqual({ open: false, reason: '表情包库未开启（stickerDir 为空）' })
  })

  it('主人私聊即使默认位关也全开（owner 档不看默认位、也不需要 grant）', () => {
    expect(judge({ relation: 'owner' })).toEqual({ open: true, reason: '管理员私聊默认开启' })
  })
})

describe('resolveCapabilities — 判定顺序与 why 文案', () => {
  it('主人私聊 + 依赖全开 → 全部能力，tools = 注册表工具名', () => {
    const resolved = resolveCapabilities({
      config: { capabilitiesDeny: [] },
      deps: ALL_DEPS,
      chat: chatViewOf('owner'),
    })
    expect([...resolved.enabled].sort()).toEqual([...ALL_CAPABILITY_IDS].sort())
    expect(resolved.tools).toEqual(REGISTRY_TOOLS)
    for (const id of ALL_CAPABILITY_IDS) expect(resolved.why(id)).toBe('管理员私聊默认开启')
  })

  it('deny 优先于一切：命中即关（主人私聊也关），原因为 deny', () => {
    const resolved = resolveCapabilities({
      config: { capabilitiesDeny: ['qq.send.forward', ' qq.napcat.api '] },
      deps: ALL_DEPS,
      chat: chatViewOf('owner'),
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
      chat: chatViewOf('owner'),
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
    const group = resolveCapabilities({ config: {}, deps: ALL_DEPS, chat: chatViewOf('groupMember') })
    expect(group.enabled.size).toBe(defaultOpenCount('groupMember'))
    expect(group.why('qq.send.image')).toBe('群聊默认开启')
    const member = resolveCapabilities({ config: {}, deps: ALL_DEPS, chat: chatViewOf('stranger') })
    expect(member.enabled.size).toBe(defaultOpenCount('stranger'))
    expect(member.why('qq.send.image')).toBe('非管理员私聊默认开启')
    // T12 的三个隐私能力在群聊 / 非管理员私聊里默认关。
    expect(group.why('qq.list.groups')).toBe('群聊默认关闭')
    expect(member.why('qq.list.friends')).toBe('非管理员私聊默认关闭')
  })

  it('未知 id 的 why 是可读的兜底文案；配置文件里也只看已知 id', () => {
    const resolved = resolveCapabilities({ config: {}, deps: ALL_DEPS, chat: chatViewOf('owner') })
    expect(resolved.why('qq.no.such' as never)).toBe('未知能力 id')
    expect(unknownCapabilityIds(['qq.send.image', 'qq.bogus', ' qq.bogus ', ''])).toEqual(['qq.bogus'])
  })
})

describe('兼容 — 老调用点只给 adminPrivate 时行为不变', () => {
  it('adminPrivate: true ≡ relation: owner；adminPrivate: false 私聊 ≡ stranger', () => {
    const legacyAdmin = resolveCapabilities({ config: {}, deps: ALL_DEPS, chat: { kind: 'private', adminPrivate: true } })
    const modernAdmin = resolveCapabilities({ config: {}, deps: ALL_DEPS, chat: chatViewOf('owner') })
    expect([...legacyAdmin.enabled].sort()).toEqual([...modernAdmin.enabled].sort())
    expect(legacyAdmin.why('qq.send.image')).toBe('管理员私聊默认开启')

    const legacyMember = resolveCapabilities({ config: {}, deps: ALL_DEPS, chat: { kind: 'private', adminPrivate: false } })
    expect(legacyMember.why('qq.send.image')).toBe('非管理员私聊默认开启')
  })

  it('relation 与 adminPrivate 冲突时以 relation 为准', () => {
    const resolved = resolveCapabilities({
      config: {},
      deps: ALL_DEPS,
      chat: { kind: 'private', relation: 'stranger', adminPrivate: true },
    })
    expect(resolved.why('qq.send.image')).toBe('非管理员私聊默认开启')
  })
})

describe('四个关系 × 全部能力：空 grant 时的实际开启矩阵', () => {
  /** 依赖全开时空配置的期望集合 = 该关系的默认位（主人全开；群友 / 好友 / 陌生人少三个隐私能力）。 */
  const expectedOf = (relation: 'owner' | 'friend' | 'groupMember' | 'stranger'): string =>
    CAPABILITIES
      .filter(capability => relation === 'owner'
        || (relation === 'groupMember' ? capability.groupDefault : capability.memberDefault))
      .map(capability => capability.id)
      .sort()
      .join(' ')

  for (const relation of RELATIONS) {
    it(RELATION_NAMES[relation] + ' 档：空 grant + 依赖全开 → 开满默认位 ' + defaultOpenCount(relation) + ' 项', () => {
      const resolved = resolveCapabilities({ config: {}, deps: ALL_DEPS, chat: chatViewOf(relation) })
      expect([...resolved.enabled].sort().join(' ')).toBe(expectedOf(relation))
    })
  }

  it('主人私聊开满全部能力；群友 / 好友 / 陌生人各少三个隐私能力（T12 的默认关）', () => {
    const owner = resolveCapabilities({ config: {}, deps: ALL_DEPS, chat: chatViewOf('owner') })
    expect(owner.enabled.size).toBe(CAPABILITIES.length)
    for (const relation of ['friend', 'groupMember', 'stranger'] as const) {
      const resolved = resolveCapabilities({ config: {}, deps: ALL_DEPS, chat: chatViewOf(relation) })
      expect(resolved.enabled.size, RELATION_NAMES[relation]).toBe(CAPABILITIES.length - 3)
      for (const id of ['qq.list.groups', 'qq.list.friends', 'qq.history.private'] as const) {
        expect(resolved.enabled.has(id), RELATION_NAMES[relation] + ' 不该开 ' + id).toBe(false)
      }
    }
  })

  it('依赖全缺时每个关系都少同样的 3 项（表情包 2 + 记忆 1），默认位不受依赖影响', () => {
    for (const relation of RELATIONS) {
      const withDeps = resolveCapabilities({ config: {}, deps: ALL_DEPS, chat: chatViewOf(relation) })
      const without = resolveCapabilities({ config: {}, deps: [], chat: chatViewOf(relation) })
      const lost = [...withDeps.enabled].filter(id => !without.enabled.has(id)).sort()
      expect(lost, RELATION_NAMES[relation]).toEqual(['qq.memory.note', 'qq.sticker.manage', 'qq.sticker.use'])
    }
  })

  it('grant 不会让任何一个档少开（只加不减）', () => {
    const config = { friendGrant: ['qq.napcat.api'], memberGrant: ['qq.send.image'], strangerGrant: ['qq.send.voice'] }
    for (const relation of RELATIONS) {
      const bare = resolveCapabilities({ config: {}, deps: ALL_DEPS, chat: chatViewOf(relation) })
      const granted = resolveCapabilities({ config, deps: ALL_DEPS, chat: chatViewOf(relation) })
      for (const id of bare.enabled) expect(granted.enabled.has(id), RELATION_NAMES[relation] + ' 掉了 ' + id).toBe(true)
    }
  })
})

describe('群聊里主人的回合也走群友档（故意的，别当 bug 修）', () => {
  // 工具是按会话注册的：一个群只有一个会话，会话级注册看不到具体发言人，
  // 所以群里主人自己发言时，能力判定仍是 'groupMember'（群档 grant / 群默认位 /
  // 群会话的宿主权限预设同一口径）。主人私聊才是 owner 档。
  const policy = { adminUsers: ['10001'], friendUsers: ['20002'] }

  it('sessionRelation：群里连主人都算 groupMember；私聊才分 owner / friend / stranger', () => {
    expect(sessionRelation({ userId: '10001', chatKind: 'group', policy })).toBe('groupMember')
    expect(sessionRelation({ userId: '20002', chatKind: 'group', policy })).toBe('groupMember')
    expect(sessionRelation({ userId: '10001', chatKind: 'private', policy })).toBe('owner')
    expect(sessionRelation({ userId: '20002', chatKind: 'private', policy })).toBe('friend')
    expect(sessionRelation({ userId: '30003', chatKind: 'private', policy })).toBe('stranger')
  })

  it('端到端：管理员在群里发言，注册到的是群档工具集（与群友发话完全一致）', async () => {
    const byAdmin = await toolsOf('group', { stickers: true, memory: true, deny: ['qq.send.image'] })
    expect(byAdmin).not.toContain('qq_send_image')
    expect(byAdmin).toEqual(PRE_CHANGE_TOOLS['group|sticker=on|memory=on'].split(' ').filter(tool => tool !== 'qq_send_image'))
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

  it('三个按关系 deny 里的未知 id 也各自告警（与三个 grant 一致），并提示「可用 id 见 /doctor」', () => {
    const problems = selfCheck({
      ...base,
      friendDeny: ['qq.nope.friend.deny'],
      memberDeny: ['qq.nope.member.deny'],
      strangerDeny: ['qq.nope.stranger.deny'],
    })
    for (const [key, id] of [
      ['friendDeny', 'qq.nope.friend.deny'],
      ['memberDeny', 'qq.nope.member.deny'],
      ['strangerDeny', 'qq.nope.stranger.deny'],
    ] as const) {
      const hit = problems.filter(problem => problem.includes(key))
      expect(hit, key).toHaveLength(1)
      expect(hit[0]).toContain(id)
      expect(hit[0]).toContain('可用 id 见 /doctor')
      expect(hit[0]).toContain('不会对任何人关闭功能')
    }
    // 合法 id 不告警（也不会误报 grant / 全局 deny 的那两条）。
    const clean = selfCheck({
      ...base,
      friendDeny: ['qq.send.image'],
      memberDeny: ['qq.napcat.api'],
      strangerDeny: ['qq.send.voice'],
    })
    expect(clean.filter(problem => problem.includes('Deny'))).toHaveLength(0)
  })

  it('三个 grant 里的未知 id 各自告警，并提示「可用 id 见 /doctor」', () => {
    const problems = selfCheck({
      ...base,
      friendGrant: ['qq.nope.friend'],
      memberGrant: ['qq.nope.member'],
      strangerGrant: ['qq.nope.stranger'],
    })
    for (const [key, id] of [['friendGrant', 'qq.nope.friend'], ['memberGrant', 'qq.nope.member'], ['strangerGrant', 'qq.nope.stranger']] as const) {
      const hit = problems.filter(problem => problem.includes(key))
      expect(hit, key).toHaveLength(1)
      expect(hit[0]).toContain(id)
      expect(hit[0]).toContain('可用 id 见 /doctor')
    }
    // 合法 id 不告警（也不会误报 deny 的那条）。
    const clean = selfCheck({ ...base, friendGrant: ['qq.send.image'], memberGrant: ['qq.napcat.api'], strangerGrant: ['qq.send.voice'] })
    expect(clean.filter(problem => problem.includes('Grant'))).toHaveLength(0)
  })
})

describe('/doctor 与状态快照', () => {
  it('summarizeCapabilities / formatCapabilityLine：四个关系各自的已开数 + 关闭项原因', () => {
    const all = summarizeCapabilities({ config: {}, deps: ALL_DEPS })
    // 摘要的 enabled / disabled 取**主人私聊视角**：全开。
    expect(all.enabled).toBe(CAPABILITIES.length)
    expect(all.total).toBe(CAPABILITIES.length)
    expect(all.disabled).toEqual([])
    expect(all.byRelation).toEqual({
      owner: defaultOpenCount('owner'),
      friend: defaultOpenCount('friend'),
      groupMember: defaultOpenCount('groupMember'),
      stranger: defaultOpenCount('stranger'),
    })
    // 三个非主人档同时少掉三个隐私能力 → 四个数从 T12 起真的不同。
    expect(all.byRelation.friend).toBe(CAPABILITIES.length - 3)
    expect(formatCapabilityLine(all)).toBe(
      '能力：主人 ' + defaultOpenCount('owner') + ' / 好友 ' + defaultOpenCount('friend')
      + ' / 群友 ' + defaultOpenCount('groupMember') + ' / 陌生人 ' + defaultOpenCount('stranger')
      + '（共 ' + CAPABILITIES.length + '）',
    )

    const some = summarizeCapabilities({ config: { capabilitiesDeny: ['qq.send.image'] }, deps: [] })
    const line = formatCapabilityLine(some)
    // 每个关系统一再少 4 项：deny 1（qq.send.image）+ 依赖缺 3（表情包 2 + 记忆 1）。
    const lost = 4
    expect(line).toContain('能力：主人 ' + (defaultOpenCount('owner') - lost)
      + ' / 好友 ' + (defaultOpenCount('friend') - lost)
      + ' / 群友 ' + (defaultOpenCount('groupMember') - lost)
      + ' / 陌生人 ' + (defaultOpenCount('stranger') - lost)
      + '（共 ' + CAPABILITIES.length + '）')
    expect(line).toContain('qq.send.image（已在 capabilitiesDeny 里关闭）')
    expect(line).toContain('qq.sticker.use（表情包库未开启（stickerDir 为空））')
  })

  it('summarizeCapabilities 的 byRelation 跟着 deny 走（四个档同时少一项）', () => {
    const summary = summarizeCapabilities({ config: { capabilitiesDeny: ['qq.napcat.api'] }, deps: ALL_DEPS })
    expect(summary.byRelation).toEqual({
      owner: defaultOpenCount('owner') - 1,
      friend: defaultOpenCount('friend') - 1,
      groupMember: defaultOpenCount('groupMember') - 1,
      stranger: defaultOpenCount('stranger') - 1,
    })
    expect(summary.enabled).toBe(CAPABILITIES.length - 1)
  })

  it('memberDeny 一项 → /doctor 四关系行里群友少 1、其他三个不变（四个数真的不同了）', () => {
    const summary = summarizeCapabilities({ config: { memberDeny: ['qq.napcat.api'] }, deps: ALL_DEPS })
    const total = CAPABILITIES.length
    expect(summary.byRelation).toEqual({
      owner: defaultOpenCount('owner'),
      friend: defaultOpenCount('friend'),
      groupMember: defaultOpenCount('groupMember') - 1,
      stranger: defaultOpenCount('stranger'),
    })
    // 主人视角的 enabled / disabled 不受按关系 deny 影响（关的不是主人这一档）。
    expect(summary.enabled).toBe(total)
    expect(summary.disabled).toEqual([])
    expect(formatCapabilityLine(summary)).toBe(
      '能力：主人 ' + defaultOpenCount('owner') + ' / 好友 ' + defaultOpenCount('friend')
      + ' / 群友 ' + (defaultOpenCount('groupMember') - 1) + ' / 陌生人 ' + defaultOpenCount('stranger')
      + '（共 ' + total + '）',
    )
    // 三个 deny 各关一项 → 三档各少 1，主人不变。
    const all = summarizeCapabilities({
      config: { friendDeny: ['qq.send.image'], memberDeny: ['qq.napcat.api'], strangerDeny: ['qq.send.voice'] },
      deps: ALL_DEPS,
    })
    expect(all.byRelation).toEqual({
      owner: defaultOpenCount('owner'),
      friend: defaultOpenCount('friend') - 1,
      groupMember: defaultOpenCount('groupMember') - 1,
      stranger: defaultOpenCount('stranger') - 1,
    })
    expect(formatCapabilityLine(all)).toContain('能力：主人 ' + defaultOpenCount('owner')
      + ' / 好友 ' + (defaultOpenCount('friend') - 1)
      + ' / 群友 ' + (defaultOpenCount('groupMember') - 1)
      + ' / 陌生人 ' + (defaultOpenCount('stranger') - 1))
  })

  it('四个关系 × 依赖全开时按关系 deny 后的工具数（群聊少 1，另三档只少三个隐私能力的工具）', async () => {
    const base = { stickers: true, memory: true, memberDeny: ['qq.napcat.api'] }
    const owner = (await toolsOf('admin-private', base)).length
    const stranger = (await toolsOf('member-private', base)).length
    const friend = (await toolsOf('member-private', { ...base, friendUsers: ['20002'] })).length
    const group = (await toolsOf('group', base)).length
    // qq.napcat.api 只对应一个工具（qq_napcat_api）；三个隐私能力的四个工具默认只在
    // 主人私聊注册，所以群聊 = 全量 - 4（隐私工具）- 1（deny 掉的 qq_napcat_api）。
    expect({ owner, friend, group, stranger }).toEqual({
      owner: REGISTRY_TOOLS.length,
      friend: REGISTRY_TOOLS.length - PRIVACY_TOOLS.length,
      group: REGISTRY_TOOLS.length - PRIVACY_TOOLS.length - 1,
      stranger: REGISTRY_TOOLS.length - PRIVACY_TOOLS.length,
    })
  })

  it('/doctor 报告里有一行四关系能力行', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cap-doctor-'))
    const report = await healthReport({
      mediaDir: dir,
      connection: { connected: true, selfId: '10002' },
      transport: { host: '127.0.0.1', port: 8643 },
      retryState: {},
      dedup: { entries: 0, windowSeconds: 300 },
      configSnapshot: {},
      capabilities: () => summarizeCapabilities({ config: { capabilitiesDeny: ['qq.send.image'] }, deps: ALL_DEPS }),
      log: () => undefined,
    })
    expect(report).toContain('能力：主人 ' + (defaultOpenCount('owner') - 1))
    expect(report).toContain('陌生人 ' + (defaultOpenCount('stranger') - 1) + '（共 ' + CAPABILITIES.length + '）')
    expect(report).toContain('qq.send.image（已在 capabilitiesDeny 里关闭）')
  })

  it('状态快照带上 capabilities.byRelation（缺席为 null；byRelation 缺失时整块省略）', async () => {
    const summary = summarizeCapabilities({ config: {}, deps: [] })
    const withCaps = await buildCompanionStatusSnapshot({ capabilities: () => summary })
    expect(withCaps.capabilities).toEqual(summary)

    const without = await buildCompanionStatusSnapshot()
    expect(without.capabilities).toBeNull()
    // 单次取数抛错只让该字段为 null。
    const boom = await buildCompanionStatusSnapshot({ capabilities: () => { throw new Error('no caps') } })
    expect(boom.capabilities).toBeNull()

    // 老主插件只报 enabled / total / disabled（没有 byRelation）→ 快照里也不编一个。
    const legacy = await buildCompanionStatusSnapshot({
      capabilities: () => ({ enabled: 3, total: 11, disabled: [] }) as never,
    })
    expect(legacy.capabilities).toEqual({ enabled: 3, total: 11, disabled: [] })
    expect(legacy.capabilities?.byRelation).toBeUndefined()

    // 四个关系缺一项（数据不完整）→ 整块省略，不显示半截数字。
    const partial = await buildCompanionStatusSnapshot({
      capabilities: () => ({ enabled: 3, total: 11, disabled: [], byRelation: { owner: 3, friend: 3 } }) as never,
    })
    expect(partial.capabilities?.byRelation).toBeUndefined()
  })

  it('bridge.capabilitySummary 与 /doctor 同源，并带四个关系的已开数', async () => {
    const h = await makeCmdHarness({ stickers: {}, publicMemoryFile: join(mkdtempSync(join(tmpdir(), 'cap-mem-')), 'AGENTS.md') })
    const bridgeSummary = h.bridge.capabilitySummary()
    h.client.close()
    expect(bridgeSummary).toEqual({
      enabled: CAPABILITIES.length,
      total: CAPABILITIES.length,
      disabled: [],
      byRelation: {
        owner: defaultOpenCount('owner'),
        friend: defaultOpenCount('friend'),
        groupMember: defaultOpenCount('groupMember'),
        stranger: defaultOpenCount('stranger'),
      },
    })
  })

  it('bridge 的摘要：memberDeny 只让群友数少 1（配置 → bridge → /doctor 全线打通）', async () => {
    const h = await makeCmdHarness({ stickers: {}, publicMemoryFile: join(mkdtempSync(join(tmpdir(), 'cap-mem-')), 'AGENTS.md'), memberDeny: ['qq.napcat.api'] })
    const summary = h.bridge.capabilitySummary()
    h.client.close()
    const total = CAPABILITIES.length
    expect(summary.byRelation).toEqual({
      owner: defaultOpenCount('owner'),
      friend: defaultOpenCount('friend'),
      groupMember: defaultOpenCount('groupMember') - 1,
      stranger: defaultOpenCount('stranger'),
    })
    expect(summary.enabled).toBe(total)
    expect(summary.disabled).toEqual([])
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
    // 主人视角：11 项老能力里少这 3 项，三个隐私能力照开（默认位异常见前）。
    expect(summary.enabled).toBe(CAPABILITIES.length - 3)
    // deny / 依赖对所有档一致：每个关系都在自己的默认位上少 3 项。
    for (const relation of RELATIONS) {
      expect(summary.byRelation[relation], RELATION_NAMES[relation]).toBe(defaultOpenCount(relation) - 3)
    }
  })
})