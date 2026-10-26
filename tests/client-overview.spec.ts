/**
 * F3 · 设置页「概览」子页的客户端测试（《前端设计规范》§1.2 overview / §2 页头胶囊 /
 * §3.8 定时任务只读列表 / §4.14 概览组件）：
 *
 *   ① 六格状态、记忆用量 meter 阈值、定时任务与会话卡片；
 *   ② 任何字段缺失显示「—」；主插件未运行时只加 info 横幅，其余子页照常可用；
 *   ③ 「去开启」跳转媒体子页；页头胶囊用真实状态（ok/warn/error/idle）；
 *   ④ 导航首项是概览、面板默认打开概览；
 *   ⑤ 概览可见时每 30 秒自动刷新，离开概览页即清掉定时器；
 *   ⑥ 主动聊天页的「定时任务」只读卡片来自 getStatus().status.scheduled。
 *
 * @module dsh-qq-companion-pro/tests/client-overview
 */
import { buildClientSource } from './client-bundle.js'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SCHEMA_DEFAULTS } from '../src/settings-remote.js'

const CLIENT_SOURCE = buildClientSource()

/** 极简 React 替身：createElement 产出可遍历的元素树。 */
type StubElement = { type: unknown; props: Record<string, unknown>; children: unknown[] }
function createElementStub(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): StubElement {
  return {
    type,
    props: props ?? {},
    children: children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false && child !== true),
  }
}
function walk(node: unknown): StubElement[] {
  if (Array.isArray(node)) return node.flatMap(child => walk(child))
  if (node === null || typeof node !== 'object') return []
  const out: StubElement[] = []
  const element = node as StubElement
  if (element.type !== undefined && typeof element.props === 'object' && element.props !== null) out.push(element)
  for (const child of element.children ?? []) out.push(...walk(child))
  return out
}
function textOf(node: unknown): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node === null || typeof node !== 'object') return ''
  const element = node as StubElement
  return (element.children ?? []).map(textOf).join('')
}
function hasClass(element: StubElement, name: string): boolean {
  return String(element.props.className == null ? '' : element.props.className).split(/\s+/).indexOf(name) >= 0
}
function byClass(node: unknown, name: string): StubElement[] {
  return walk(node).filter(element => hasClass(element, name))
}
function byRole(node: unknown, role: string): StubElement[] {
  return walk(node).filter(element => element.props['data-role'] === role)
}
function statOf(tree: unknown, key: string): StubElement {
  const found = walk(tree).filter(element => hasClass(element, 'qqc-stat') && element.props['data-stat'] === key)
  expect(found.length, `缺少状态格 ${key}`).toBe(1)
  return found[0]
}

/** CJS 包裹装载：react 由调用方提供（视图测试用裸替身，面板测试用 hooks 运行时）。 */
function loadClient(reactImpl: unknown): Record<string, unknown> {
  const factories: Record<string, (request: (spec: string) => unknown) => unknown> = {}
  ;(globalThis as unknown as { window: unknown }).window = {
    __ModuleLoader__: {
      load(entry: { id: string; factory: (request: (spec: string) => unknown) => unknown }) {
        factories[entry.id] = entry.factory
      },
    },
  }
  new Function(CLIENT_SOURCE)()
  const factory = factories['dsh-qq-companion-pro']
  if (factory === undefined) throw new Error('lib/client.js 未注册 dsh-qq-companion-pro 模块')
  return factory((spec: string) => {
    if (spec !== 'react') throw new Error(`unexpected external require: ${spec}`)
    return reactImpl
  }) as Record<string, unknown>
}

/** 视图层用的 client 实例（无 hooks；React 桩 = { createElement }）。 */
const stubReact = { createElement: createElementStub }
const client = loadClient(stubReact)
const renderOverview = client.renderOverview as (react: unknown, opts?: Record<string, unknown>) => StubElement[]
const SettingsView = client.SettingsView as (props: Record<string, unknown>) => StubElement
const draftFromSnapshot = client.draftFromSnapshot as (snapshot: { config: Record<string, unknown> }) => Record<string, unknown>
const meterTone = client.meterTone as (bytes: unknown, maxBytes: unknown) => string | null
const meterPercent = client.meterPercent as (bytes: unknown, maxBytes: unknown) => number
const zh = client.zh as Record<string, string>

function zhT(key: string): string {
  return zh[key] != null ? zh[key] : key
}

/** 一份完整的假快照（与 src/status.ts 的 CompanionStatusSnapshot 同构）。 */
function demoStatus(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return Object.assign({
    connection: { connected: true, online: true, selfId: '2564812526', botQQ: '2564812526', host: '127.0.0.1', port: 8643 },
    sessions: {
      private: 1,
      group: 2,
      list: [
        { chatId: 'private:2824149798', sessionId: 's1', title: 'QQ私聊 2824149798 · 10-23', workspaceAttached: false },
        { chatId: 'group:123456', sessionId: 's2', workspaceAttached: true },
      ],
    },
    today: { sent: 12 },
    proactive: { enabled: true, doneToday: 1, plannedToday: 3, nextAt: '15:30' },
    stickers: { enabled: true, count: 10, maxCount: 300, today: 2, dailyMax: 20 },
    memory: [{ label: '公开', path: 'E:\\To DeepSeek\\AGENTS.md', bytes: 5000, maxBytes: 6144 }],
    scheduled: [{ id: 'diary', time: '23:00', chatId: 'private:2824149798', doneToday: false, nextAt: '23:00' }],
    permissions: { admin: 'danger-full-access', member: 'read-only' },
    capabilities: { enabled: 11, total: 11, disabled: [], byRelation: { owner: 11, friend: 11, groupMember: 11, stranger: 11 } },
    generatedAt: 1_700_000_000_000,
  }, overrides)
}

/** renderOverview 的默认选项。 */
function overviewProps(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return Object.assign({ t: zhT, status: demoStatus(), available: true, error: null }, overrides)
}

/** 概览整页（含 .qqc-main 包裹，等价于 SettingsView 的概览分支）。 */
function overviewTree(overrides: Record<string, unknown> = {}): StubElement {
  return SettingsView({
    ...viewProps(),
    page: 'overview',
    ...overrides,
  })
}

/** SettingsView 的默认 props（与 client-settings.spec.ts 同款）。 */
function viewProps(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const config = Object.assign({}, SCHEMA_DEFAULTS)
  return Object.assign({
    t: zhT,
    page: 'connection',
    query: '',
    changedOnly: false,
    draft: draftFromSnapshot({ config }),
    config,
    botQQ: '2564812526',
    status: null,
    statusAvailable: true,
    statusError: null,
    onRefreshStatus: () => {},
    secretSet: true,
    clearSecret: false,
    tagInputs: {},
    workspace: { loaded: false, available: false, workspaces: [], selectedId: '' },
    busy: false,
    saveState: 'idle',
    conflict: false,
    conflictShowMine: false,
    riskDialog: null,
    loading: false,
    error: null,
    notice: null,
    entryActive: true,
    onPageChange: () => {},
    onQueryChange: () => {},
    onChangedOnlyChange: () => {},
    onRetry: () => {},
    onSave: () => {},
    onRevert: () => {},
    onReload: () => {},
    onToggleMine: () => {},
    onRiskCancel: () => {},
    onRiskConfirm: () => {},
    onChange: () => {},
    onSecretChange: () => {},
    onClearSecretChange: () => {},
    onResetField: () => {},
    onTagInput: () => {},
    onTagCommit: () => {},
    onTagRemove: () => {},
    onTagBackspace: () => {},
  }, overrides)
}

/* ------------------------------------------------------------------ *
 * §4.14 概览六格 + 卡片
 * ------------------------------------------------------------------ */

describe('概览子页 — 六格状态（§4.14）', () => {
  it('六格的 data-stat 顺序固定，每格都有标签 / 大号数值 / 副文', () => {
    const nodes = renderOverview(stubReact, overviewProps())
    const stats = byClass(nodes, 'qqc-stats')[0]
    expect(stats).toBeDefined()
    expect(byClass(stats, 'qqc-stat').map(stat => stat.props['data-stat'])).toEqual([
      'connection', 'sessions', 'today', 'proactive', 'stickers', 'scheduled',
    ])
    for (const key of ['connection', 'sessions', 'today', 'proactive', 'stickers', 'scheduled']) {
      const stat = statOf(stats, key)
      expect(byClass(stat, 'qqc-stat-label')).toHaveLength(1)
      expect(byClass(stat, 'qqc-stat-value')).toHaveLength(1)
    }
  })

  it('各格的值与副文来自快照（在线 / 私聊 N · 群 N / 已发送 N 条 / a/b 次 / N/上限 张 / N 个）', () => {
    const nodes = renderOverview(stubReact, overviewProps())
    const stats = byClass(nodes, 'qqc-stats')[0]
    const connection = statOf(stats, 'connection')
    expect(textOf(byClass(connection, 'qqc-stat-value')[0])).toBe('在线')
    expect(textOf(byClass(connection, 'qqc-stat-sub')[0])).toBe('2564812526')
    expect(byClass(connection, 'qqc-dot')[0].props['data-state']).toBe('ok')
    expect(textOf(statOf(stats, 'sessions'))).toContain('私聊 1 · 群 2')
    expect(textOf(byClass(statOf(stats, 'today'), 'qqc-stat-value')[0])).toBe('12')
    expect(textOf(byClass(statOf(stats, 'today'), 'qqc-stat-sub')[0])).toBe('条已发送')
    expect(textOf(byClass(statOf(stats, 'proactive'), 'qqc-stat-value')[0])).toBe('1 / 3 次')
    expect(textOf(byClass(statOf(stats, 'proactive'), 'qqc-stat-sub')[0])).toBe('下一次 15:30')
    expect(textOf(byClass(statOf(stats, 'stickers'), 'qqc-stat-value')[0])).toBe('10 / 300 张')
    expect(textOf(byClass(statOf(stats, 'stickers'), 'qqc-stat-sub')[0])).toBe('今天新存 2 / 20')
    expect(textOf(byClass(statOf(stats, 'scheduled'), 'qqc-stat-value')[0])).toBe('1 个')
    expect(textOf(byClass(statOf(stats, 'scheduled'), 'qqc-stat-sub')[0])).toBe('下一次 23:00')
  })

  it('「今天」格的副文带上今天不回条数（today.passCount）', () => {
    const withPass = renderOverview(stubReact, overviewProps({ status: demoStatus({ today: { sent: 12, passCount: 3 } }) }))
    const today = statOf(byClass(withPass, 'qqc-stats')[0], 'today')
    expect(textOf(byClass(today, 'qqc-stat-value')[0])).toBe('12')
    expect(textOf(byClass(today, 'qqc-stat-sub')[0])).toBe('条已发送 · 今天 3 条不回')
    // 0 次也照实说（这是可观测的决定，不是隐藏字段）。
    const zero = renderOverview(stubReact, overviewProps({ status: demoStatus({ today: { sent: 4, passCount: 0 } }) }))
    expect(textOf(byClass(statOf(byClass(zero, 'qqc-stats')[0], 'today'), 'qqc-stat-sub')[0])).toBe('条已发送 · 今天 0 条不回')
  })

  it('连接格三态：离线 → warn、未连接 → error、未知 → idle', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ connected: true, online: false, selfId: '1' }, 'warn'],
      [{ connected: false, online: null, selfId: '' }, 'error'],
      [{ connected: true, online: null, selfId: '1' }, 'idle'],
    ]
    for (const [connection, expected] of cases) {
      const nodes = renderOverview(stubReact, overviewProps({ status: demoStatus({ connection }) }))
      const stat = statOf(byClass(nodes, 'qqc-stats')[0], 'connection')
      expect(byClass(stat, 'qqc-dot')[0].props['data-state']).toBe(expected)
    }
  })

  it('主动聊天未开启显示「未开启」；表情包未开启显示「未开启」+「去开启」按钮跳到媒体页', () => {
    const pages: string[] = []
    const nodes = renderOverview(stubReact, overviewProps({
      status: demoStatus({
        proactive: { enabled: false, doneToday: 0, plannedToday: 0 },
        stickers: { enabled: false, count: 0, maxCount: 300, today: 0, dailyMax: 20 },
      }),
      onGoToPage: (page: string) => { pages.push(page) },
    }))
    const stats = byClass(nodes, 'qqc-stats')[0]
    expect(textOf(byClass(statOf(stats, 'proactive'), 'qqc-stat-value')[0])).toBe('未开启')
    expect(textOf(byClass(statOf(stats, 'stickers'), 'qqc-stat-value')[0])).toBe('未开启')
    const go = byRole(statOf(stats, 'stickers'), 'overview-go-media')
    expect(go).toHaveLength(1)
    expect(textOf(go[0])).toBe('去开启')
    go[0].props.onClick()
    expect(pages).toEqual(['media'])
  })

  it('右上「刷新」按钮触发 onRefresh', () => {
    let refreshed = 0
    const nodes = renderOverview(stubReact, overviewProps({ onRefresh: () => { refreshed += 1 } }))
    const refresh = byRole(nodes, 'overview-refresh')
    expect(refresh).toHaveLength(1)
    expect(textOf(refresh[0])).toBe('刷新')
    refresh[0].props.onClick()
    expect(refreshed).toBe(1)
  })
})

describe('概览子页 — 记忆用量 / 定时任务 / 会话卡片（§4.14）', () => {
  it('记忆用量：每行名称 + 路径 + meter + 大小；≥80% 用 warn 色调', () => {
    const nodes = renderOverview(stubReact, overviewProps())
    const card = byRole(nodes, 'overview-memory')[0]
    expect(card).toBeDefined()
    const rows = byClass(card, 'qqc-list-row')
    expect(rows).toHaveLength(1)
    expect(textOf(rows[0])).toContain('公开')
    expect(textOf(rows[0])).toContain('E:\\To DeepSeek\\AGENTS.md')
    expect(textOf(byClass(rows[0], 'qqc-list-path')[0])).toBe('E:\\To DeepSeek\\AGENTS.md')
    const fill = byClass(rows[0], 'qqc-meter-fill')[0]
    expect(fill.props['data-tone']).toBe('warn') // 5000/6144 ≈ 81%
    expect((fill.props.style as { width: string }).width).toBe('81%')
    expect(textOf(rows[0])).toContain('4.9 / 6.0KB')
  })

  it('meter 阈值：≥100% error、≥80% warn、其余无 tone；百分比 0–100 取整', () => {
    expect(meterTone(6144, 6144)).toBe('error')
    expect(meterTone(7000, 6144)).toBe('error')
    expect(meterTone(5000, 6144)).toBe('warn')
    expect(meterTone(1000, 6144)).toBeNull()
    expect(meterTone(null, 6144)).toBeNull()
    expect(meterPercent(5000, 6144)).toBe(81)
    expect(meterPercent(9999, 6144)).toBe(100)
    expect(meterPercent(1, 0)).toBe(0)
  })

  it('记忆文件读不到（bytes:null）显示「—」，memo 行仍在', () => {
    const nodes = renderOverview(stubReact, overviewProps({
      status: demoStatus({ memory: [{ label: '公开', path: '/tmp/AGENTS.md', bytes: null, maxBytes: 6144 }] }),
    }))
    const row = byClass(byRole(nodes, 'overview-memory')[0], 'qqc-list-row')[0]
    expect(textOf(row)).toContain('—')
  })

  it('定时任务卡片：id · 时间 · 目标会话 · 今天是否已执行；空时给空态', () => {
    const nodes = renderOverview(stubReact, overviewProps())
    const card = byRole(nodes, 'overview-scheduled')[0]
    const row = byClass(card, 'qqc-list-row')[0]
    expect(textOf(row)).toContain('diary · 23:00')
    expect(textOf(row)).toContain('private:2824149798')
    expect(textOf(row)).toContain('今天待执行')

    const empty = renderOverview(stubReact, overviewProps({ status: demoStatus({ scheduled: [] }) }))
    const emptyCard = byRole(empty, 'overview-scheduled')[0]
    expect(textOf(byClass(emptyCard, 'qqc-empty')[0])).toBe('没有定时任务')
  })

  it('会话卡片：标题或 chatId + 是否已归入工作区；未归入提示 /workspace attach', () => {
    const nodes = renderOverview(stubReact, overviewProps())
    const card = byRole(nodes, 'overview-sessions')[0]
    const rows = byClass(card, 'qqc-list-row')
    expect(rows).toHaveLength(2)
    expect(textOf(rows[0])).toContain('QQ私聊 2824149798 · 10-23')
    expect(textOf(rows[0])).toContain('未归入工作区')
    expect(textOf(rows[0])).toContain('/workspace attach')
    // 已归入的行没有 attach 提示，显示「已归入工作区」
    expect(textOf(rows[1])).toContain('已归入工作区')
    expect(textOf(rows[1])).not.toContain('/workspace attach')
    // workspaceAttached 未知（null）→ 「—」
    const unknown = renderOverview(stubReact, overviewProps({
      status: demoStatus({ sessions: { private: 1, group: 0, list: [{ chatId: 'private:1', sessionId: 's', workspaceAttached: null }] } }),
    }))
    expect(textOf(byClass(byRole(unknown, 'overview-sessions')[0], 'qqc-list-row')[0])).toContain('—')
  })

  it('功能卡片（T6 能力开关）：已开 N / 共 M；关闭项逐行给出 id（中文名）与原因；全开给空态', () => {
    const allOn = renderOverview(stubReact, overviewProps())
    const card = byRole(allOn, 'overview-capabilities')[0]
    expect(textOf(card)).toContain('已开 11 / 共 11')
    expect(textOf(byRole(card, 'overview-capabilities-all-on')[0])).toBe('全部开启')

    const someOff = renderOverview(stubReact, overviewProps({
      status: demoStatus({
        capabilities: {
          enabled: 9,
          total: 11,
          disabled: [
            { id: 'qq.send.image', title: '发图片', reason: '已在 capabilitiesDeny 里关闭' },
            { id: 'qq.sticker.use', title: '表情包（存 / 搜 / 发）', reason: '表情包库未开启（stickerDir 为空）' },
          ],
        },
      }),
    }))
    const offCard = byRole(someOff, 'overview-capabilities')[0]
    expect(textOf(offCard)).toContain('已开 9 / 共 11')
    const rows = byClass(offCard, 'qqc-list-row')
    expect(rows).toHaveLength(2)
    expect(textOf(rows[0])).toContain('qq.send.image（发图片）')
    expect(textOf(rows[0])).toContain('已在 capabilitiesDeny 里关闭')
    expect(textOf(rows[1])).toContain('表情包库未开启')
    // 每一行都标「未开启」，与其余卡片的用词一致。
    expect(textOf(rows[0])).toContain('未开启')
  })

  it('功能卡片（T11 按关系授权）：展示四个关系各自的已开数；byRelation 缺失显示「—」', () => {
    const nodes = renderOverview(stubReact, overviewProps())
    const card = byRole(nodes, 'overview-capabilities')[0]
    expect(textOf(byRole(card, 'overview-capabilities-by-relation')[0]))
      .toBe('主人 11 / 好友 11 / 群友 11 / 陌生人 11')
    // 四个数字互不相同也照原样念（grant / 默认位不同时会出现差异）。
    const varied = renderOverview(stubReact, overviewProps({
      status: demoStatus({
        capabilities: {
          enabled: 11,
          total: 11,
          disabled: [],
          byRelation: { owner: 11, friend: 9, groupMember: 7, stranger: 5 },
        },
      }),
    }))
    expect(textOf(byRole(byRole(varied, 'overview-capabilities')[0], 'overview-capabilities-by-relation')[0]))
      .toBe('主人 11 / 好友 9 / 群友 7 / 陌生人 5')
    // byRelation 缺失（老主插件 / 取数不全）→ 这一行「—」，卡片其余部分照旧。
    const legacy = renderOverview(stubReact, overviewProps({
      status: demoStatus({ capabilities: { enabled: 9, total: 11, disabled: [] } }),
    }))
    const legacyCard = byRole(legacy, 'overview-capabilities')[0]
    expect(textOf(byRole(legacyCard, 'overview-capabilities-by-relation')[0])).toBe('—')
    expect(textOf(legacyCard)).toContain('已开 9 / 共 11')
    // 数据不完整（宿主不会这样发，status.ts 会整块省略）→ 缺的那一项显示「—」，不崩。
    const partial = renderOverview(stubReact, overviewProps({
      status: demoStatus({ capabilities: { enabled: 9, total: 11, disabled: [], byRelation: { owner: 9 } } }),
    }))
    expect(textOf(byRole(byRole(partial, 'overview-capabilities')[0], 'overview-capabilities-by-relation')[0]))
      .toBe('主人 9 / 好友 — / 群友 — / 陌生人 —')
  })

  it('功能卡片：快照里没有 capabilities 时显示「—」（不整页报错）', () => {
    const missing = renderOverview(stubReact, overviewProps({ status: demoStatus({ capabilities: undefined }) }))
    const card = byRole(missing, 'overview-capabilities')[0]
    expect(textOf(byClass(card, 'qqc-empty')[0])).toBe('—')
  })
})

describe('概览子页 — 缺失字段 / 不可用横幅（§4.14）', () => {
  it('任何字段缺失都显示「—」（六格全空也不报错）', () => {
    const nodes = renderOverview(stubReact, overviewProps({ status: {} }))
    const stats = byClass(nodes, 'qqc-stats')[0]
    for (const key of ['connection', 'sessions', 'today', 'proactive', 'stickers', 'scheduled']) {
      expect(textOf(byClass(statOf(stats, key), 'qqc-stat-value')[0])).toBe('—')
    }
    expect(textOf(byClass(byRole(nodes, 'overview-memory')[0], 'qqc-empty')[0])).toBe('还没有记忆文件')
    expect(textOf(byClass(byRole(nodes, 'overview-sessions')[0], 'qqc-empty')[0])).toBe('还没有会话')
  })

  it('available:false → info 横幅「QQ 主插件未运行，暂时看不到状态」，六格全「—」', () => {
    const nodes = renderOverview(stubReact, overviewProps({ available: false }))
    const banner = byRole(nodes, 'overview-unavailable')
    expect(banner).toHaveLength(1)
    expect(banner[0].props['data-tone']).toBe('info')
    expect(textOf(banner[0])).toBe('QQ 主插件未运行，暂时看不到状态')
    const stats = byClass(nodes, 'qqc-stats')[0]
    expect(textOf(byClass(statOf(stats, 'connection'), 'qqc-stat-value')[0])).toBe('—')
  })

  it('取数抛错（error）→ error 横幅 + 重试；不显示不可用横幅', () => {
    let retried = 0
    const nodes = renderOverview(stubReact, overviewProps({ error: '读取失败', onRefresh: () => { retried += 1 } }))
    expect(byRole(nodes, 'overview-unavailable')).toHaveLength(0)
    const banner = byRole(nodes, 'overview-error')[0]
    expect(textOf(banner)).toContain('状态读取失败')
    expect(textOf(banner)).toContain('读取失败')
    const retry = byClass(banner, 'qqc-btn')[0]
    retry.props.onClick()
    expect(retried).toBe(1)
  })

  it('不可用时其余子页照常可用（媒体页仍有自己的卡片与字段行）', () => {
    const view = SettingsView(viewProps({ page: 'media', statusAvailable: false }))
    const main = byClass(view, 'qqc-main')[0]
    expect(byClass(main, 'qqc-card').length).toBeGreaterThan(0)
    expect(walk(main).filter(element => hasClass(element, 'qqc-row') && element.props['data-key'] === 'stickerDir')).toHaveLength(1)
    // 其它子页不渲染概览的内容
    expect(byRole(view, 'overview-stats')).toHaveLength(0)
  })

  it('概览不含配置键：没有任何 .qqc-row[data-key]；搜索与「只看已改动」不影响概览', () => {
    const view = overviewTree({ changedOnly: true })
    expect(byRole(view, 'overview-stats')).toHaveLength(1)
    expect(walk(view).filter(element => hasClass(element, 'qqc-row') && element.props['data-key'] != null)).toHaveLength(0)
    // 搜索词非空时照常切到搜索结果（概览让位给搜索）
    const searched = overviewTree({ query: '端口' })
    expect(byRole(searched, 'overview-stats')).toHaveLength(0)
    expect(textOf(searched)).toContain('搜索结果')
  })

  it('内嵌入口（embedded）同样有概览：不渲染页头，但六格照常', () => {
    const view = overviewTree({ embedded: true, status: demoStatus() })
    expect(view.props['data-embedded']).toBe('true')
    expect(byClass(view, 'qqc-header')).toHaveLength(0)
    expect(byRole(view, 'overview-stats')).toHaveLength(1)
    expect(byClass(view, 'qqc-stat')).toHaveLength(6)
  })
})

describe('页头连接胶囊用真实状态（§2）', () => {
  it('已连接且在线 → ok + 「已连接 · selfId」', () => {
    const view = SettingsView(viewProps({ status: demoStatus() }))
    const conn = byClass(view, 'qqc-conn')[0]
    expect(byClass(conn, 'qqc-dot')[0].props['data-state']).toBe('ok')
    expect(textOf(conn)).toBe('已连接 · 2564812526')
  })

  it('已连接但 QQ 离线 → warn', () => {
    const view = SettingsView(viewProps({ status: demoStatus({ connection: { connected: true, online: false, selfId: '2564812526' } }) }))
    const conn = byClass(view, 'qqc-conn')[0]
    expect(byClass(conn, 'qqc-dot')[0].props['data-state']).toBe('warn')
    expect(textOf(conn)).toBe('QQ 离线 · 2564812526')
  })

  it('未连接 → error；在线状态未知 → idle', () => {
    const disconnected = SettingsView(viewProps({ status: demoStatus({ connection: { connected: false, online: null, selfId: '' } }) }))
    const errorConn = byClass(disconnected, 'qqc-conn')[0]
    expect(byClass(errorConn, 'qqc-dot')[0].props['data-state']).toBe('error')
    expect(textOf(errorConn)).toBe('未连接')

    const unknown = SettingsView(viewProps({ status: demoStatus({ connection: { connected: true, online: null, selfId: '2564812526' } }) }))
    const idleConn = byClass(unknown, 'qqc-conn')[0]
    expect(byClass(idleConn, 'qqc-dot')[0].props['data-state']).toBe('idle')
    expect(textOf(idleConn)).toBe('QQ 状态未知 · 2564812526')
  })

  it('没有状态快照时保持旧形态（idle + QQ 号）', () => {
    const view = SettingsView(viewProps({ status: null }))
    const conn = byClass(view, 'qqc-conn')[0]
    expect(byClass(conn, 'qqc-dot')[0].props['data-state']).toBe('idle')
    expect(textOf(conn)).toBe('QQ 号 2564812526')
  })
})

describe('主动聊天页的「定时任务」只读卡片（§3.8）', () => {
  it('有快照时显示真实列表（id · 时间 · 目标会话 · 今天是否已执行）', () => {
    const view = SettingsView(viewProps({ page: 'proactive', status: demoStatus() }))
    const card = byRole(view, 'proactive-scheduled')[0]
    expect(card).toBeDefined()
    expect(textOf(card)).toContain('scheduledPrompts') // 提示仍指向 cordis.patch.yml
    expect(textOf(card)).toContain('diary · 23:00')
    expect(textOf(card)).toContain('今天待执行')
  })

  it('没有快照时退回空态说明，卡片仍然在', () => {
    const view = SettingsView(viewProps({ page: 'proactive', status: null }))
    const card = byRole(view, 'proactive-scheduled')[0]
    expect(card).toBeDefined()
    expect(textOf(card)).toContain('scheduledPrompts')
    expect(textOf(byClass(card, 'qqc-empty')[0])).toBe('没有定时任务')
  })
})

/* ------------------------------------------------------------------ *
 * 面板：默认页 / 30 秒刷新 / 离开概览页清理定时器
 * ------------------------------------------------------------------ */

/** 一次挂载的 hooks 运行时（与 client-settings-f2b.spec.ts 同款）。 */
function createHookRuntime(): {
  react: Record<string, unknown>
  beginPass(): void
  runEffects(): void
  takeDirty(): boolean
} {
  const stateSlots: unknown[] = []
  const depSlots: Array<unknown[] | undefined> = []
  const cleanups: Array<(() => void) | undefined> = []
  let effectQueue: Array<() => void> = []
  let hookIndex = 0
  let dirty = false
  const react = {
    createElement: createElementStub,
    useState<T>(initial: T): [T, (next: T | ((prev: T) => T)) => void] {
      const index = hookIndex
      hookIndex += 1
      if (!(index in stateSlots)) stateSlots[index] = initial
      const set = (next: T | ((prev: T) => T)): void => {
        stateSlots[index] = typeof next === 'function' ? (next as (prev: T) => T)(stateSlots[index] as T) : next
        dirty = true
      }
      return [stateSlots[index] as T, set]
    },
    useEffect(effect: () => void | (() => void), nextDeps?: unknown[]): void {
      const index = hookIndex
      hookIndex += 1
      const prevDeps = depSlots[index]
      let changed = nextDeps === undefined || prevDeps === undefined || prevDeps.length !== nextDeps.length
      if (!changed && nextDeps !== undefined && prevDeps !== undefined) {
        for (let i = 0; i < nextDeps.length; i += 1) {
          if (!Object.is(prevDeps[i], nextDeps[i])) {
            changed = true
            break
          }
        }
      }
      if (!changed) return
      depSlots[index] = nextDeps
      effectQueue.push(() => {
        const cleanup = cleanups[index]
        if (typeof cleanup === 'function') cleanup()
        const returned = effect()
        cleanups[index] = typeof returned === 'function' ? returned : undefined
      })
    },
  }
  return {
    react,
    beginPass() {
      hookIndex = 0
      effectQueue = []
    },
    runEffects() {
      const queue = effectQueue
      effectQueue = []
      for (const run of queue) run()
    },
    takeDirty() {
      const value = dirty
      dirty = false
      return value
    },
  }
}

interface PanelHarness {
  client: Record<string, unknown>
  tree: StubElement
  calls: { getSettings: number; listWorkspaces: number; getStatus: number; updateSettings: number }
  flush(): void
  settle(): Promise<void>
}

/** 挂载面板（remote 桩带 getStatus）。 */
function mountPanel(options: { statusResult?: unknown } = {}): PanelHarness {
  const runtime = createHookRuntime()
  const loaded = loadClient(runtime.react)
  const calls: PanelHarness['calls'] = { getSettings: 0, listWorkspaces: 0, getStatus: 0, updateSettings: 0 }
  const snapshot = {
    revision: 1,
    entryActive: true,
    config: Object.assign({}, SCHEMA_DEFAULTS),
    secrets: [{ path: ['accessToken'], set: true }],
    groups: {},
    effect: 'restart',
  }
  const remote = {
    async getSettings() {
      calls.getSettings += 1
      return { ok: true, value: snapshot }
    },
    async updateSettings() {
      calls.updateSettings += 1
      return { ok: true, value: snapshot }
    },
    async listWorkspaces() {
      calls.listWorkspaces += 1
      return { ok: true, value: { available: false, workspaces: [] } }
    },
    async getStatus() {
      calls.getStatus += 1
      return options.statusResult ?? { ok: true, value: { available: true, status: demoStatus() } }
    },
  }
  const Component = loaded.OnebotSettingsPanel as (props: Record<string, unknown>) => StubElement
  const props = { t: zhT, remote }
  const expand = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(expand)
    if (node === null || typeof node !== 'object') return node
    const element = node as StubElement
    if (typeof element.type === 'function') {
      return expand((element.type as (input: Record<string, unknown>) => unknown)(element.props))
    }
    return { type: element.type, props: element.props, children: element.children.map(expand) }
  }
  let tree: StubElement = { type: 'div', props: {}, children: [] }
  const flush = (): void => {
    runtime.beginPass()
    tree = expand(Component(props)) as StubElement
    runtime.runEffects()
    let guard = 0
    while (runtime.takeDirty() && guard < 50) {
      guard += 1
      runtime.beginPass()
      tree = expand(Component(props)) as StubElement
      runtime.runEffects()
    }
  }
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 16; i += 1) {
      await Promise.resolve()
      flush()
    }
  }
  flush()
  return {
    client: loaded,
    get tree() { return tree },
    calls,
    flush,
    settle,
  }
}

function navItem(tree: unknown, pageId: string): StubElement {
  const found = byClass(tree, 'qqc-nav-item').filter(item => item.props['data-page'] === pageId)
  expect(found.length, `缺少子页 ${pageId} 的导航项`).toBe(1)
  return found[0]
}

function gotoPage(harness: PanelHarness, pageId: string): void {
  navItem(harness.tree, pageId).props.onClick()
  harness.flush()
}

const focused: string[] = []

beforeEach(() => {
  focused.length = 0
  ;(globalThis as unknown as { document: unknown }).document = {
    getElementById(id: string) {
      return { focus() { focused.push(id) } }
    },
    get body() { return null },
  }
})

afterEach(() => {
  delete (globalThis as unknown as { document?: unknown }).document
  vi.useRealTimers()
})

describe('面板 — 默认打开概览 + 30 秒自动刷新', () => {
  it('导航首项是概览，挂载后默认停在概览页并渲染六格', async () => {
    const harness = mountPanel()
    await harness.settle()
    expect(navItem(harness.tree, 'overview').props['aria-current']).toBe('page')
    expect(harness.tree.props['data-page']).toBe('overview')
    expect(byRole(harness.tree, 'overview-stats')).toHaveLength(1)
    expect(harness.calls.getStatus).toBeGreaterThanOrEqual(1)
  })

  it('概览可见时每 30 秒刷新一次（不到 30 秒不刷）', async () => {
    vi.useFakeTimers()
    const harness = mountPanel()
    await harness.settle()
    const before = harness.calls.getStatus
    vi.advanceTimersByTime(29_999)
    await harness.settle()
    expect(harness.calls.getStatus).toBe(before)
    vi.advanceTimersByTime(1)
    await harness.settle()
    expect(harness.calls.getStatus).toBeGreaterThan(before)
  })

  it('离开概览页立即清掉定时器（再也不会自动拉状态）', async () => {
    vi.useFakeTimers()
    const harness = mountPanel()
    await harness.settle()
    gotoPage(harness, 'connection')
    const afterLeaving = harness.calls.getStatus
    vi.advanceTimersByTime(120_000)
    await harness.settle()
    expect(harness.calls.getStatus).toBe(afterLeaving)
  })

  it('回到概览页重新开始自动刷新', async () => {
    vi.useFakeTimers()
    const harness = mountPanel()
    await harness.settle()
    gotoPage(harness, 'connection')
    gotoPage(harness, 'overview')
    const afterReturn = harness.calls.getStatus
    vi.advanceTimersByTime(30_000)
    await harness.settle()
    expect(harness.calls.getStatus).toBeGreaterThan(afterReturn)
  })

  it('main plugin 未运行（available:false）→ 概览显示 info 横幅，其它子页照常可用', async () => {
    const harness = mountPanel({ statusResult: { ok: true, value: { available: false } } })
    await harness.settle()
    expect(byRole(harness.tree, 'overview-unavailable')).toHaveLength(1)
    gotoPage(harness, 'media')
    expect(walk(harness.tree).filter(element => hasClass(element, 'qqc-row') && element.props['data-key'] === 'stickerDir')).toHaveLength(1)
    expect(byRole(harness.tree, 'overview-stats')).toHaveLength(0)
  })

  it('「刷新」按钮立即重新拉状态', async () => {
    const harness = mountPanel()
    await harness.settle()
    const before = harness.calls.getStatus
    byRole(harness.tree, 'overview-refresh')[0].props.onClick()
    await harness.settle()
    expect(harness.calls.getStatus).toBeGreaterThan(before)
  })

  it('「去开启」跳到媒体子页（面板内实际切页）', async () => {
    const harness = mountPanel({
      statusResult: { ok: true, value: { available: true, status: demoStatus({ stickers: { enabled: false, count: 0, maxCount: 300, today: 0, dailyMax: 20 } }) } },
    })
    await harness.settle()
    byRole(harness.tree, 'overview-go-media')[0].props.onClick()
    harness.flush()
    expect(harness.tree.props['data-page']).toBe('media')
  })

  it('远程 getStatus 抛错：按「主插件未运行」处理（info 横幅，不报红）', async () => {
    const harness = mountPanel({ statusResult: { ok: false, error: { code: 'gateway', message: 'remote unavailable' } } })
    await harness.settle()
    expect(byRole(harness.tree, 'overview-unavailable')).toHaveLength(1)
    expect(byRole(harness.tree, 'overview-error')).toHaveLength(0)
  })
})