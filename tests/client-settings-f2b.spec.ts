/**
 * 设置页交互层测试（F2b：《前端设计规范》§5.4 校验 / §5.5 危险改动 / §4.11 保存条 /
 * §4.12 危险确认对话框 / §5.6 冲突 / §5.7 键盘）。
 *
 * 三层覆盖：
 *   ① 纯函数：validateDraft 的每条规则（含三条跨字段规则）、collectRisks 的每个
 *      触发与不触发（「没改动不算风险」= 已经是 open+allowAllUsers 的生效配置不弹窗）；
 *   ② 视图：错误行 / 红色导航计数 / 有风险徽标 / 保存条三种状态 / 冲突横幅与
 *      「我的修改」清单 / 对话框结构与键盘（Esc、Tab 循环）/ 根节点 Ctrl+S；
 *   ③ 面板（hooks 模拟）：有错误不提交、有风险先弹窗、确认后才调 updateSettings、
 *      取消不调、冲突保留草稿、成功后 2 秒重拉；对话框不挂 document.body。
 *
 * @module dsh-qq-companion-pro/tests/client-settings-f2b
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
function byId(node: unknown, id: string): StubElement {
  const found = walk(node).filter(element => element.props.id === id)
  expect(found.length, `找不到 id=${id} 的元素`).toBe(1)
  return found[0]
}
function rowOf(tree: unknown, key: string): StubElement {
  const found = walk(tree).filter(element => hasClass(element, 'qqc-row') && element.props['data-key'] === key)
  expect(found.length, `缺少 ${key} 的行`).toBe(1)
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

/** 视图层用的 client 实例（无 hooks）。 */
const client = loadClient({ createElement: createElementStub })
const DEFAULTS = client.DEFAULTS as Record<string, unknown>
const GROUPS = client.GROUPS as Array<{ id: string; title: string; fields: Array<{ key: string }> }>
const ALL_FIELDS = client.ALL_FIELDS as Array<{ key: string; label: string; max?: number }>
const draftFromSnapshot = client.draftFromSnapshot as (snapshot: { config: Record<string, unknown> }) => Record<string, unknown>
const validateDraft = client.validateDraft as (draft: Record<string, unknown>, t?: (key: string) => string) => Record<string, string>
const collectRisks = client.collectRisks as (
  draft: Record<string, unknown>,
  config: Record<string, unknown>,
  opts?: { clearSecret?: boolean },
) => Array<{ keys: string[]; label: string; messageKey: string }>
const SettingsView = client.SettingsView as (props: Record<string, unknown>) => StubElement
const zh = client.zh as Record<string, string>

/** 词条翻译（断言就看真实中文文案）。 */
function zhT(key: string): string {
  return zh[key] != null ? zh[key] : key
}

/** 默认草稿（生效值 = 宿主默认）。 */
function defaultDraft(config: Record<string, unknown> = SCHEMA_DEFAULTS): Record<string, unknown> {
  return draftFromSnapshot({ config: config })
}

/** 风险清单 → 词条 key 列表（断言更稳）。 */
function riskKeysOf(risks: Array<{ messageKey: string }>): string[] {
  return risks.map(risk => risk.messageKey)
}

/** SettingsView 的默认 props。 */
function viewProps(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const config = Object.assign({}, SCHEMA_DEFAULTS)
  return Object.assign({
    t: zhT,
    page: 'connection',
    query: '',
    changedOnly: false,
    draft: defaultDraft(config),
    config: config,
    botQQ: '2564812526',
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
 * 面板测试：hooks 模拟（useState / useEffect）+ 微任务 flush
 * ------------------------------------------------------------------ */

/** 一次挂载的 hooks 运行时（hook 顺序与真实 React 一致：面板里全部无条件调用）。 */
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

/** 面板测试用的 remote 桩：记录调用，config 可推进（模拟宿主写盘后重拉）。 */
interface PanelHarness {
  client: Record<string, unknown>
  tree: StubElement
  calls: { getSettings: number; listWorkspaces: number; updateSettings: Array<{ patch: Record<string, unknown>; revision: number }> }
  flush(): void
  settle(): Promise<void>
}

function mountPanel(options: { updateResult?: unknown; config?: Record<string, unknown> } = {}): PanelHarness {
  const runtime = createHookRuntime()
  const loaded = loadClient(runtime.react)
  let serverConfig = Object.assign({}, options.config == null ? SCHEMA_DEFAULTS : options.config)
  const calls: PanelHarness['calls'] = { getSettings: 0, listWorkspaces: 0, updateSettings: [] }
  const snapshotOf = (config: Record<string, unknown>): Record<string, unknown> => ({
    revision: 1 + calls.updateSettings.length,
    entryActive: true,
    config: Object.assign({}, config),
    secrets: [{ path: ['accessToken'], set: true }],
    groups: {},
    effect: 'write-patch',
  })
  const remote = {
    async getSettings() {
      calls.getSettings += 1
      return { ok: true, value: snapshotOf(serverConfig) }
    },
    async updateSettings(patch: Record<string, unknown>, expectedRevision: number) {
      calls.updateSettings.push({ patch: patch, revision: expectedRevision })
      if (options.updateResult !== undefined) return options.updateResult
      serverConfig = Object.assign({}, serverConfig, patch)
      return { ok: true, value: snapshotOf(serverConfig) }
    },
    async listWorkspaces() {
      calls.listWorkspaces += 1
      return { ok: true, value: { available: false, workspaces: [] } }
    },
  }
  const Component = loaded.OnebotSettingsPanel as (props: Record<string, unknown>) => StubElement
  const props = { t: zhT, remote: remote }
  /** 展开函数组件（面板返回的是 <SettingsView {...} /> 元素；视图层不含 hooks）。 */
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
  flush() // 初次挂载：跑完 effect（首帧拉快照）
  const harness: PanelHarness = {
    client: loaded,
    get tree() { return tree },
    calls: calls,
    flush: flush,
    settle: settle,
  }
  return harness
}

/** 保存条上的两个动作按钮（排除「子页跳转」的链接按钮）。 */
function savebarButtons(tree: unknown): StubElement[] {
  const bar = byClass(tree, 'qqc-savebar')[0]
  expect(bar, '保存条不存在').toBeDefined()
  return walk(bar).filter(element => element.type === 'button' && !hasClass(element, 'qqc-link'))
}

/** 导航项（按子页 id）。 */
function navItem(tree: unknown, pageId: string): StubElement {
  const found = byClass(tree, 'qqc-nav-item').filter(item => item.props['data-page'] === pageId)
  expect(found.length, `缺少子页 ${pageId} 的导航项`).toBe(1)
  return found[0]
}

/** 切子页（点导航项 + 重渲染）。 */
function gotoPage(harness: PanelHarness, pageId: string): void {
  navItem(harness.tree, pageId).props.onClick()
  harness.flush()
}

/* ------------------------------------------------------------------ *
 * document 桩：焦点目标记录 + body 访问探测
 * ------------------------------------------------------------------ */
const focusedIds: string[] = []
let bodyTouched = false

beforeEach(() => {
  focusedIds.length = 0
  bodyTouched = false
  ;(globalThis as unknown as { document: unknown }).document = {
    getElementById(id: string) {
      return { focus() { focusedIds.push(id) } }
    },
    get body() {
      bodyTouched = true
      return null
    },
  }
})

afterEach(() => {
  delete (globalThis as unknown as { document?: unknown }).document
  vi.useRealTimers()
})

/* ------------------------------------------------------------------ *
 * §5.4 校验
 * ------------------------------------------------------------------ */
describe('validateDraft — §5.4 每条规则', () => {
  it('默认草稿没有任何错误（默认值必然自洽）', () => {
    expect(validateDraft(defaultDraft())).toEqual({})
  })

  it('数字非法：空串与非数字都是「请输入数字」', () => {
    const values = defaultDraft()
    values.interimRecallMs = 'abc'
    values.sttTimeoutMs = ''
    const errors = validateDraft(values)
    expect(errors.interimRecallMs).toBe('请输入数字')
    expect(errors.sttTimeoutMs).toBe('请输入数字')
  })

  it('小于 min：提示「不能小于 {min}」', () => {
    const values = defaultDraft()
    values.typingDelayPerCharMs = '-1'
    expect(validateDraft(values).typingDelayPerCharMs).toBe('不能小于 0')
  })

  it('taskEveryRounds 下限 1：0 报「不能小于 1」，1 / 2 放行（与宿主 Config 一致）', () => {
    const values = defaultDraft()
    values.taskEveryRounds = '0'
    expect(validateDraft(values)).toEqual({ taskEveryRounds: '不能小于 1' })
    values.taskEveryRounds = '1'
    expect(validateDraft(values)).toEqual({})
    values.taskEveryRounds = '2'
    expect(validateDraft(values)).toEqual({})
    values.taskEveryRounds = '-3'
    expect(validateDraft(values)).toEqual({ taskEveryRounds: '不能小于 1' })
  })

  it('大于 max：提示「不能大于 {max}」（max 只声明在 port，其它键按元数据走通用文案）', () => {
    // 现有字段里只有 port 带 max（1–65535），而 port 有自己的文案；这里临时给
    // 一个数字键加 max 来验证通用规则本身，跑完恢复。
    const field = ALL_FIELDS.find(item => item.key === 'rateLimitPerMinute')
    expect(field).toBeDefined()
    const saved = field == null ? undefined : field.max
    try {
      if (field != null) field.max = 100
      const values = defaultDraft()
      values.rateLimitPerMinute = '200'
      expect(validateDraft(values).rateLimitPerMinute).toBe('不能大于 100')
    } finally {
      if (field != null) {
        if (saved === undefined) delete field.max
        else field.max = saved
      }
    }
  })

  it('port：越界与非整数都给「端口范围 1–65535」', () => {
    const values = defaultDraft()
    values.port = '70000'
    expect(validateDraft(values).port).toBe('端口范围 1–65535')
    values.port = '0'
    expect(validateDraft(values).port).toBe('端口范围 1–65535')
    values.port = '8643'
    expect(validateDraft(values).port).toBeUndefined()
  })

  it('time：必须是 HH:MM（09:30 可以，9:00 / 24:00 不行）', () => {
    const values = defaultDraft()
    values.proactiveWindowStart = '9:00'
    expect(validateDraft(values).proactiveWindowStart).toBe('请用 HH:MM 格式，例如 09:30')
    values.proactiveWindowStart = '09:30'
    expect(validateDraft(values).proactiveWindowStart).toBeUndefined()
    values.proactiveWindowStart = '24:00'
    expect(validateDraft(values).proactiveWindowStart).toBe('请用 HH:MM 格式，例如 09:30')
  })

  it('time24：额外允许 24:00', () => {
    const values = defaultDraft()
    values.groupPeekWindowEnd = '24:00'
    expect(validateDraft(values).groupPeekWindowEnd).toBeUndefined()
    values.groupPeekWindowEnd = '25:00'
    expect(validateDraft(values).groupPeekWindowEnd).toBe('请用 HH:MM 格式，可以写 24:00')
  })

  it('跨字段 · 时间窗：结束不晚于开始 → 错误标在结束字段上（proactive 与 groupPeek 两对）', () => {
    const proactiveValues = defaultDraft()
    proactiveValues.proactiveWindowStart = '22:00'
    proactiveValues.proactiveWindowEnd = '09:00'
    const proactiveErrors = validateDraft(proactiveValues)
    expect(proactiveErrors.proactiveWindowEnd).toBe('结束时间要晚于开始时间')
    expect(proactiveErrors.proactiveWindowStart).toBeUndefined()

    const peekValues = defaultDraft()
    peekValues.groupPeekWindowStart = '09:00'
    peekValues.groupPeekWindowEnd = '09:00' // 相等也算
    const peekErrors = validateDraft(peekValues)
    expect(peekErrors.groupPeekWindowEnd).toBe('结束时间要晚于开始时间')
  })

  it('跨字段 · proactiveMinPerDay > proactiveMaxPerDay → 「最少次数不能多于最多次数」', () => {
    const values = defaultDraft()
    values.proactiveMinPerDay = '8'
    values.proactiveMaxPerDay = '6'
    const errors = validateDraft(values)
    expect(errors.proactiveMaxPerDay).toBe('最少次数不能多于最多次数')
  })

  it('跨字段 · typingDelayMinMs > typingDelayMaxMs → 「最短不能长于最长」', () => {
    const values = defaultDraft()
    values.typingDelayMinMs = '3000'
    values.typingDelayMaxMs = '2500'
    const errors = validateDraft(values)
    expect(errors.typingDelayMaxMs).toBe('最短不能长于最长')
  })

  it('单项规则已经报错时不再叠加跨字段错误（避免一句话说两遍）', () => {
    const values = defaultDraft()
    values.proactiveWindowStart = 'oops'
    values.proactiveWindowEnd = '08:00'
    const errors = validateDraft(values)
    expect(errors.proactiveWindowStart).toBe('请用 HH:MM 格式，例如 09:30')
    expect(errors.proactiveWindowEnd).toBeUndefined()
  })

  it('文案走词条：传入 t 时用宿主的翻译（en 也能出结果）', () => {
    const en = client.en as Record<string, string>
    const values = defaultDraft()
    values.port = '70000'
    const errors = validateDraft(values, key => (en[key] != null ? en[key] : key))
    expect(errors.port).toBe(en['validate.port'])
  })
})

/* ------------------------------------------------------------------ *
 * §5.5 危险改动
 * ------------------------------------------------------------------ */
describe('collectRisks — §5.5 每个触发条件', () => {
  it('没有改动就没有风险（默认草稿）', () => {
    expect(collectRisks(defaultDraft(), SCHEMA_DEFAULTS)).toEqual([])
  })

  it('跨字段：dmPolicy=open 且 allowAllUsers=true（生效值不满足）→ 一条风险，覆盖两个字段', () => {
    const config = Object.assign({}, SCHEMA_DEFAULTS, { dmPolicy: 'allowlist', allowAllUsers: false })
    const values = defaultDraft(config)
    values.dmPolicy = 'open'
    values.allowAllUsers = true
    const risks = collectRisks(values, config)
    expect(riskKeysOf(risks)).toEqual(['risk.dmOpenAll'])
    expect(risks[0].keys.sort()).toEqual(['allowAllUsers', 'dmPolicy'])
    expect(risks[0].label).toContain('私聊策略')
    expect(risks[0].label).toContain('允许所有用户')
  })

  it('已经是 open+allowAllUsers 的生效配置：只改别的键不弹窗', () => {
    const config = Object.assign({}, SCHEMA_DEFAULTS, { dmPolicy: 'open', allowAllUsers: true })
    const values = defaultDraft(config)
    values.ownerTitle = '主人'
    expect(collectRisks(values, config)).toEqual([])
  })

  it('只打开 allowAllUsers 而 dmPolicy 是白名单 → 不构成「所有人私聊」风险', () => {
    const config = Object.assign({}, SCHEMA_DEFAULTS, { dmPolicy: 'allowlist', allowAllUsers: false })
    const values = defaultDraft(config)
    values.allowAllUsers = true
    expect(collectRisks(values, config)).toEqual([])
  })

  it('groupPolicy 改为 open → 风险', () => {
    const config = Object.assign({}, SCHEMA_DEFAULTS, { groupPolicy: 'allowlist' })
    const values = defaultDraft(config)
    values.groupPolicy = 'open'
    expect(riskKeysOf(collectRisks(values, config))).toEqual(['risk.groupOpen'])
  })

  it('restrictedMemberPrefix 改为关 → 风险', () => {
    const values = defaultDraft()
    values.restrictedMemberPrefix = false
    expect(riskKeysOf(collectRisks(values, SCHEMA_DEFAULTS))).toEqual(['risk.restrictedPrefixOff'])
  })

  it('adminPermission 改为 danger-full-access → 风险', () => {
    const values = defaultDraft()
    values.adminPermission = 'danger-full-access'
    expect(riskKeysOf(collectRisks(values, SCHEMA_DEFAULTS))).toEqual(['risk.adminPermissionFull'])
  })

  it('memberPermission 改为空 / 改为 danger-full-access → 两条不同的风险（§3.3）', () => {
    const config = Object.assign({}, SCHEMA_DEFAULTS, { memberPermission: 'read-only' })
    const toEmpty = defaultDraft(config)
    toEmpty.memberPermission = ''
    expect(riskKeysOf(collectRisks(toEmpty, config))).toEqual(['risk.memberPermissionEmpty'])

    const toFull = defaultDraft(config)
    toFull.memberPermission = 'danger-full-access'
    expect(riskKeysOf(collectRisks(toFull, config))).toEqual(['risk.memberPermissionFull'])
  })

  it('清空 accessToken → 风险（只有 clearSecret 标记才算）', () => {
    expect(riskKeysOf(collectRisks(defaultDraft(), SCHEMA_DEFAULTS, { clearSecret: true }))).toEqual(['risk.tokenClear'])
    expect(collectRisks(defaultDraft(), SCHEMA_DEFAULTS)).toEqual([])
  })

  it('host / port 改动 → 同一条风险（NapCat 侧要同步改）', () => {
    const hostValues = defaultDraft()
    hostValues.host = '10.0.0.1'
    expect(riskKeysOf(collectRisks(hostValues, SCHEMA_DEFAULTS))).toEqual(['risk.hostPort'])

    const portValues = defaultDraft()
    portValues.port = '8645'
    const risks = collectRisks(portValues, SCHEMA_DEFAULTS)
    expect(riskKeysOf(risks)).toEqual(['risk.hostPort'])
    expect(risks[0].keys).toEqual(['port'])
  })

  it('mediaDir 改动 → 风险', () => {
    const values = defaultDraft()
    values.mediaDir = 'E:\\To DeepSeek\\onebot'
    expect(riskKeysOf(collectRisks(values, SCHEMA_DEFAULTS))).toEqual(['risk.mediaDir'])
  })

  it('allowPrivateHosts 改为开 → 风险', () => {
    const values = defaultDraft()
    values.allowPrivateHosts = true
    expect(riskKeysOf(collectRisks(values, SCHEMA_DEFAULTS))).toEqual(['risk.privateHosts'])
  })

  it('ignoreSelf 改为关 → 风险', () => {
    const values = defaultDraft()
    values.ignoreSelf = false
    expect(riskKeysOf(collectRisks(values, SCHEMA_DEFAULTS))).toEqual(['risk.ignoreSelfOff'])
  })

  it('多个危险同时存在：按字段表顺序全部列出', () => {
    const config = Object.assign({}, SCHEMA_DEFAULTS, { groupPolicy: 'allowlist' })
    const values = defaultDraft(config)
    values.port = '8645'
    values.groupPolicy = 'open'
    values.ignoreSelf = false
    expect(riskKeysOf(collectRisks(values, config))).toEqual(['risk.hostPort', 'risk.groupOpen', 'risk.ignoreSelfOff'])
  })
})

/* ------------------------------------------------------------------ *
 * 视图：错误行 / 导航计数 / 风险徽标 / 保存条 / 冲突 / 对话框 / 键盘
 * ------------------------------------------------------------------ */
describe('视图 — 校验失败的行（§4.1 / §5.4）', () => {
  it('data-invalid + aria-invalid + 错误文字进 aria-describedby，说明文字仍在', () => {
    const values = defaultDraft()
    values.port = '70000'
    const view = SettingsView(viewProps({ draft: values }))
    const row = rowOf(view, 'port')
    expect(row.props['data-invalid']).toBe('true')
    const input = byId(view, 'qqc-f-port')
    expect(input.props['aria-invalid']).toBe('true')
    expect(String(input.props['aria-describedby'])).toContain('qqc-h-port')
    expect(String(input.props['aria-describedby'])).toContain('qqc-e-port')
    const error = byId(view, 'qqc-e-port')
    expect(textOf(error)).toBe('端口范围 1–65535')
    expect(hasClass(error, 'qqc-error')).toBe(true)
  })

  it('合法的行没有 data-invalid / aria-invalid', () => {
    const view = SettingsView(viewProps())
    expect(rowOf(view, 'port').props['data-invalid']).toBeUndefined()
    expect(byId(view, 'qqc-f-port').props['aria-invalid']).toBeUndefined()
    expect(byClass(view, 'qqc-error')).toHaveLength(0)
  })

  it('导航计数：有错误显示红色计数，且优先于改动计数', () => {
    const values = defaultDraft()
    values.port = '70000' // 错误
    values.host = '10.0.0.1' // 只是改动
    const view = SettingsView(viewProps({ draft: values }))
    const item = navItem(view, 'connection')
    const count = byClass(item, 'qqc-count')[0]
    expect(count.props['data-tone']).toBe('error')
    expect(textOf(count)).toBe('1')
  })

  it('没有错误时导航计数用品牌色（不带 data-tone）', () => {
    const values = defaultDraft()
    values.host = '10.0.0.1'
    const view = SettingsView(viewProps({ draft: values }))
    const count = byClass(navItem(view, 'connection'), 'qqc-count')[0]
    expect(count.props['data-tone']).toBeUndefined()
    expect(textOf(count)).toBe('1')
  })
})

describe('视图 — 保存条三种状态（§4.11）', () => {
  it('有改动：按子页统计，子页名是链接', () => {
    const values = defaultDraft()
    values.host = '10.0.0.1'
    values.port = '8645'
    values.stickerDir = 'E:\\stickers'
    const pages: string[] = []
    const view = SettingsView(viewProps({ draft: values, onPageChange: (next: string) => { pages.push(next) } }))
    const bar = byClass(view, 'qqc-savebar')[0]
    expect(textOf(byClass(bar, 'qqc-savebar-text')[0])).toBe('已修改 3 项 · 连接 2 · 媒体与语音 1')
    const links = byClass(bar, 'qqc-link')
    expect(links.map(link => textOf(link))).toEqual(['连接', '媒体与语音'])
    links[1].props.onClick()
    expect(pages).toEqual(['media'])
    expect(savebarButtons(view)[1].props.disabled).toBe(false)
  })

  it('有错误：「有 N 项填写有误」+ 保存禁用', () => {
    const values = defaultDraft()
    values.port = '70000'
    values.sttTimeoutMs = 'abc'
    const view = SettingsView(viewProps({ draft: values }))
    const bar = byClass(view, 'qqc-savebar')[0]
    expect(bar.props['data-tone']).toBe('error')
    expect(textOf(byClass(bar, 'qqc-savebar-text')[0])).toBe('有 2 项填写有误')
    const buttons = savebarButtons(view)
    expect(textOf(buttons[1])).toBe('保存')
    expect(buttons[1].props.disabled).toBe(true)
    expect(buttons[0].props.disabled).toBe(false) // 还原仍可用
  })

  it('已保存：success 文案 + success 色调 + 不显示动作按钮（2 秒后由面板重拉）', () => {
    const values = defaultDraft()
    values.port = '8645'
    const view = SettingsView(viewProps({ draft: values, saveState: 'saved' }))
    const bar = byClass(view, 'qqc-savebar')[0]
    expect(bar.props['data-tone']).toBe('success')
    expect(textOf(byClass(bar, 'qqc-savebar-text')[0])).toBe('已保存，插件正在原地重启…')
    expect(savebarButtons(view)).toHaveLength(0)
  })

  it('保存中：saving 状态也显示「正在保存…」并禁用还原与保存', () => {
    const values = defaultDraft()
    values.port = '8645'
    const view = SettingsView(viewProps({ draft: values, saveState: 'saving' }))
    const buttons = savebarButtons(view)
    expect(textOf(buttons[1])).toBe('正在保存…')
    expect(buttons[1].props.disabled).toBe(true)
    expect(buttons[0].props.disabled).toBe(true)
  })
})

describe('视图 — 危险确认对话框（§4.12 / §5.5）', () => {
  const risks = [{ keys: ['dmPolicy', 'allowAllUsers'], label: '私聊策略 / 允许所有用户', messageKey: 'risk.dmOpenAll' }]

  it('风险徽标：草稿触发 danger 的行加「有风险」', () => {
    const config = Object.assign({}, SCHEMA_DEFAULTS, { dmPolicy: 'open', allowAllUsers: false })
    const values = defaultDraft(config)
    values.allowAllUsers = true
    const view = SettingsView(viewProps({ draft: values, config: config, page: 'access' }))
    expect(textOf(rowOf(view, 'allowAllUsers'))).toContain('有风险')
    // 没触发的行没有徽标
    expect(textOf(rowOf(view, 'requireMention'))).not.toContain('有风险')
  })

  it('结构：覆盖层在根节点内、role=dialog + aria-modal + aria-labelledby + 风险列表 + 两个按钮', () => {
    const view = SettingsView(viewProps({ riskDialog: risks }))
    expect(hasClass(view, 'qqc-root')).toBe(true)
    // 覆盖层是根节点的直接子节点之一（不挂 document.body）
    const overlay = byClass(view, 'qqc-overlay')
    expect(overlay).toHaveLength(1)
    expect(view.children.some(child => child === overlay[0])).toBe(true)
    const dialog = byRole(view, 'risk-dialog')[0]
    expect(dialog.props.role).toBe('dialog')
    expect(dialog.props['aria-modal']).toBe('true')
    expect(dialog.props['aria-labelledby']).toBe('qqc-risk-title')
    expect(textOf(byId(view, 'qqc-risk-title'))).toBe('这些改动有风险')
    expect(textOf(view)).toContain('确认后才会保存。')
    const items = byClass(view, 'qqc-risk')
    expect(items).toHaveLength(1)
    expect(textOf(byClass(items[0], 'qqc-risk-field')[0])).toBe('私聊策略 / 允许所有用户')
    expect(textOf(items[0])).toContain('任何人都能私聊她')
    // 焦点落在「取消」上
    expect(byId(view, 'qqc-risk-cancel').props.autoFocus).toBe(true)
    expect(textOf(byId(view, 'qqc-risk-cancel'))).toBe('取消')
    expect(byId(view, 'qqc-risk-confirm').props['data-variant']).toBe('danger')
    expect(textOf(byId(view, 'qqc-risk-confirm'))).toBe('仍然保存')
  })

  it('没有风险清单就不渲染对话框', () => {
    expect(byClass(SettingsView(viewProps()), 'qqc-overlay')).toHaveLength(0)
    expect(byClass(SettingsView(viewProps({ riskDialog: [] })), 'qqc-overlay')).toHaveLength(0)
  })

  it('Esc 关闭、Tab 在对话框内循环', () => {
    let cancelled = 0
    const view = SettingsView(viewProps({ riskDialog: risks, onRiskCancel: () => { cancelled += 1 } }))
    const dialog = byRole(view, 'risk-dialog')[0]
    const focused: string[] = []
    const cancelTarget = { name: 'cancel', focus: () => focused.push('cancel') }
    const confirmTarget = { name: 'confirm', focus: () => focused.push('confirm') }
    const scope = { querySelectorAll: () => [cancelTarget, confirmTarget] }
    let prevented = 0
    const fire = (event: Record<string, unknown>) => {
      ;(dialog.props.onKeyDown as (input: Record<string, unknown>) => void)(Object.assign({
        currentTarget: scope,
        preventDefault: () => { prevented += 1 },
      }, event))
    }
    fire({ key: 'Escape', target: cancelTarget })
    expect(cancelled).toBe(1)
    fire({ key: 'Tab', target: cancelTarget })
    fire({ key: 'Tab', target: confirmTarget })
    fire({ key: 'Tab', target: confirmTarget, shiftKey: true })
    expect(focused).toEqual(['confirm', 'cancel', 'cancel'])
    expect(prevented).toBe(4)
  })
})

describe('视图 — 冲突流程（§5.6）', () => {
  it('error 横幅 + 两个操作，草稿改动仍留在保存条上', () => {
    const values = defaultDraft()
    values.botQQ = '2564812526'
    const view = SettingsView(viewProps({ draft: values, conflict: true }))
    const banner = byClass(view, 'qqc-banner').filter(item => item.props['data-tone'] === 'error')[0]
    expect(textOf(banner)).toContain('这期间配置在别处被改过')
    expect(textOf(banner)).toContain('你的修改还在，重新加载会丢弃它们。')
    const reload = byRole(view, 'conflict-reload')[0]
    const mine = byRole(view, 'conflict-mine')[0]
    expect(textOf(reload)).toBe('重新加载（会丢弃未保存的修改）')
    expect(textOf(mine)).toBe('查看我的修改')
    expect(byClass(view, 'qqc-savebar')).toHaveLength(1)
  })

  it('「查看我的修改」展开：子页 · 标签 · 我的值；密钥只显示「已修改」', () => {
    const values = defaultDraft()
    values.botQQ = '2564812526'
    values.allowAllUsers = true
    const view = SettingsView(viewProps({ draft: values, conflict: true, conflictShowMine: true, clearSecret: true }))
    const list = byRole(view, 'conflict-changes')[0]
    expect(list).toBeDefined()
    const rows = byClass(list, 'qqc-list-row')
    const texts = rows.map(row => textOf(row))
    expect(texts).toContain('连接 · 机器人 QQ 号2564812526')
    expect(texts.some(text => text.includes('谁能找她 · 允许所有用户'))).toBe(true)
    // 密钥行只显示「已修改」，不回显值
    const secretRow = rows.filter(row => row.props['data-key'] === 'accessToken')[0]
    expect(textOf(secretRow)).toContain('访问令牌')
    expect(textOf(secretRow)).toContain('已修改')
    // 展开时按钮文案反过来
    expect(textOf(byRole(view, 'conflict-mine')[0])).toBe('收起我的修改')
  })

  it('没有冲突时不显示冲突横幅', () => {
    const view = SettingsView(viewProps())
    expect(byRole(view, 'conflict-reload')).toHaveLength(0)
  })
})

describe('视图 — 键盘（§5.7）与搜索补充', () => {
  /** 在根节点上触发一次 keydown（监听挂在 .qqc-root 上，不是全局 window）。 */
  function fireRoot(overrides: Record<string, unknown>, event: Record<string, unknown>): { prevented: number; saves: number } {
    let prevented = 0
    let saves = 0
    const view = SettingsView(viewProps(Object.assign({ onSave: () => { saves += 1 } }, overrides)))
    ;(view.props.onKeyDown as (input: Record<string, unknown>) => void)(Object.assign({
      target: null,
      currentTarget: null,
      preventDefault: () => { prevented += 1 },
    }, event))
    return { prevented: prevented, saves: saves }
  }

  it('Ctrl+S / ⌘+S 触发保存并 preventDefault；其它键不触发', () => {
    const values = defaultDraft()
    values.botQQ = '2564812526'
    const dirty = { draft: values }
    expect(fireRoot(dirty, { key: 's', ctrlKey: true })).toEqual({ prevented: 1, saves: 1 })
    expect(fireRoot(dirty, { key: 'S', metaKey: true })).toEqual({ prevented: 1, saves: 1 })
    expect(fireRoot(dirty, { key: 's' })).toEqual({ prevented: 0, saves: 0 })
    expect(fireRoot(dirty, { key: 'ArrowDown', ctrlKey: true })).toEqual({ prevented: 0, saves: 0 })
  })

  it('保存中不重复保存；对话框开着时 Ctrl+S 不直接保存', () => {
    const values = defaultDraft()
    values.botQQ = '2564812526'
    expect(fireRoot({ draft: values, busy: true }, { key: 's', ctrlKey: true }).saves).toBe(0)
    const dialogProps = {
      draft: values,
      riskDialog: [{ keys: ['port'], label: '监听端口', messageKey: 'risk.hostPort' }],
    }
    expect(fireRoot(dialogProps, { key: 's', ctrlKey: true }).saves).toBe(0)
  })

  it('节点挂载纪律：除样式 <style> 外不 appendChild，且不读 document.body', () => {
    // 唯一的 appendChild 是 apply() 里的 document.head.appendChild(<style>)。
    expect(CLIENT_SOURCE.match(/appendChild/g) ?? []).toHaveLength(1)
    expect(CLIENT_SOURCE).toContain('document.head.appendChild')
  })

  it('搜索补充：下拉选项文案（optionLabels）也在匹配范围内', () => {
    const matchField = client.matchField as (field: unknown, group: unknown, query: string) => string[]
    const field = ALL_FIELDS.find(item => item.key === 'groupReasoningEffort')!
    const hits = matchField(field, { title: '她' }, '跟随部署默认')
    expect(hits).toContain('option')

    // 走整条渲染链：搜索「跟随部署默认」能找到「群聊思考强度」
    const view = SettingsView(viewProps({ query: '跟随部署默认' }))
    const rows = byClass(view, 'qqc-row').filter(row => row.props['data-key'] === 'groupReasoningEffort')
    expect(rows).toHaveLength(1)
  })
})

/* ------------------------------------------------------------------ *
 * 面板保存流程（hooks 模拟）
 * ------------------------------------------------------------------ */
describe('面板 — 保存流程（§4.11 / §5.6）', () => {
  it('有校验错误不提交：跳到第一个错误所在子页并聚焦该字段', async () => {
    const harness = mountPanel()
    await harness.settle()
    // 媒体页把 sttMaxSeconds 填成非法值
    navItem(harness.tree, 'media').props.onClick()
    harness.flush()
    byId(harness.tree, 'qqc-f-sttMaxSeconds').props.onChange({ target: { value: 'abc' } })
    harness.flush()
    // 回到连接页再点保存
    navItem(harness.tree, 'connection').props.onClick()
    harness.flush()
    savebarButtons(harness.tree)[1].props.onClick()
    harness.flush()
    await harness.settle()
    expect(harness.calls.updateSettings).toHaveLength(0)
    expect(harness.tree.props['data-page']).toBe('media')
    expect(focusedIds).toContain('qqc-f-sttMaxSeconds')
  })

  it('有危险项：先弹对话框，确认后才调 updateSettings', async () => {
    const harness = mountPanel()
    await harness.settle()
    gotoPage(harness, 'access')
    byId(harness.tree, 'qqc-f-allowAllUsers').props.onClick()
    harness.flush()
    expect(textOf(rowOf(harness.tree, 'allowAllUsers'))).toContain('有风险')
    savebarButtons(harness.tree)[1].props.onClick()
    harness.flush()
    expect(byRole(harness.tree, 'risk-dialog')).toHaveLength(1)
    expect(harness.calls.updateSettings).toHaveLength(0)
    // 打开时焦点到「取消」
    expect(focusedIds).toContain('qqc-risk-cancel')
    byId(harness.tree, 'qqc-risk-confirm').props.onClick()
    harness.flush()
    await harness.settle()
    expect(harness.calls.updateSettings).toHaveLength(1)
    expect(harness.calls.updateSettings[0].patch).toEqual({ allowAllUsers: true })
    expect(harness.calls.updateSettings[0].revision).toBe(1)
  })

  it('对话框取消：不提交，草稿保留', async () => {
    const harness = mountPanel()
    await harness.settle()
    gotoPage(harness, 'access')
    byId(harness.tree, 'qqc-f-allowAllUsers').props.onClick()
    harness.flush()
    savebarButtons(harness.tree)[1].props.onClick()
    harness.flush()
    byId(harness.tree, 'qqc-risk-cancel').props.onClick()
    harness.flush()
    await harness.settle()
    expect(byRole(harness.tree, 'risk-dialog')).toHaveLength(0)
    expect(harness.calls.updateSettings).toHaveLength(0)
    expect(textOf(rowOf(harness.tree, 'allowAllUsers'))).toContain('已改动')
    expect(byClass(harness.tree, 'qqc-savebar')).toHaveLength(1)
  })

  it('冲突：error 横幅 + 草稿保留；重新加载才丢弃改动', async () => {
    const harness = mountPanel({ updateResult: { ok: false, error: { code: 'onebot-settings/conflict', message: 'expectedRevision mismatch' } } })
    await harness.settle()
    gotoPage(harness, 'connection') // F3 起默认打开概览页
    byId(harness.tree, 'qqc-f-botQQ').props.onChange({ target: { value: '2564812526' } })
    harness.flush()
    savebarButtons(harness.tree)[1].props.onClick()
    harness.flush()
    await harness.settle()
    const banners = byClass(harness.tree, 'qqc-banner').filter(item => item.props['data-tone'] === 'error')
    expect(textOf(banners[0])).toContain('这期间配置在别处被改过')
    // 草稿保留
    expect(textOf(byClass(harness.tree, 'qqc-savebar')[0])).toContain('已修改 1 项')
    // 查看我的修改
    byRole(harness.tree, 'conflict-mine')[0].props.onClick()
    harness.flush()
    const rows = byClass(byRole(harness.tree, 'conflict-changes')[0], 'qqc-list-row')
    expect(rows.map(row => textOf(row))).toEqual(['连接 · 机器人 QQ 号2564812526'])
    // 重新加载 → 重拉快照 + 横幅消失 + 改动清零
    const before = harness.calls.getSettings
    byRole(harness.tree, 'conflict-reload')[0].props.onClick()
    harness.flush()
    await harness.settle()
    expect(harness.calls.getSettings).toBe(before + 1)
    expect(byRole(harness.tree, 'conflict-reload')).toHaveLength(0)
    expect(byClass(harness.tree, 'qqc-savebar')).toHaveLength(0)
  })

  it('保存成功：success 文案 → 2 秒后自动重新拉取快照 → 保存条消失', async () => {
    vi.useFakeTimers()
    const harness = mountPanel()
    await harness.settle()
    gotoPage(harness, 'connection') // F3 起默认打开概览页
    byId(harness.tree, 'qqc-f-botQQ').props.onChange({ target: { value: '2564812526' } })
    harness.flush()
    savebarButtons(harness.tree)[1].props.onClick()
    harness.flush()
    await harness.settle()
    expect(harness.calls.updateSettings).toEqual([{ patch: { botQQ: '2564812526' }, revision: 1 }])
    const bar = byClass(harness.tree, 'qqc-savebar')[0]
    expect(bar.props['data-tone']).toBe('success')
    expect(textOf(byClass(bar, 'qqc-savebar-text')[0])).toBe('已保存，插件正在原地重启…')
    const before = harness.calls.getSettings
    // 2 秒之前不重拉
    vi.advanceTimersByTime(1999)
    await harness.settle()
    expect(harness.calls.getSettings).toBe(before)
    vi.advanceTimersByTime(1)
    await harness.settle()
    expect(harness.calls.getSettings).toBe(before + 1)
    expect(byClass(harness.tree, 'qqc-savebar')).toHaveLength(0)
  })

  it('保存成功后又改草稿：撤掉「刚保存」态，2 秒后不再自动重拉（不冲掉新改动）', async () => {
    vi.useFakeTimers()
    const harness = mountPanel()
    await harness.settle()
    gotoPage(harness, 'connection') // F3 起默认打开概览页
    byId(harness.tree, 'qqc-f-botQQ').props.onChange({ target: { value: '2564812526' } })
    harness.flush()
    savebarButtons(harness.tree)[1].props.onClick()
    harness.flush()
    await harness.settle()
    expect(byClass(harness.tree, 'qqc-savebar')[0].props['data-tone']).toBe('success')
    byId(harness.tree, 'qqc-f-botQQ').props.onChange({ target: { value: '1000001' } })
    harness.flush()
    const before = harness.calls.getSettings
    vi.advanceTimersByTime(2000)
    await harness.settle()
    expect(harness.calls.getSettings).toBe(before)
    expect(textOf(byClass(harness.tree, 'qqc-savebar')[0])).toContain('已修改 1 项')
  })

  it('失败（非冲突）：error 横幅显示消息，草稿保留', async () => {
    const harness = mountPanel({ updateResult: { ok: false, error: { code: 'onebot-settings/edit-failed', message: '写入失败：配置文件被其他写入方占用' } } })
    await harness.settle()
    gotoPage(harness, 'connection') // F3 起默认打开概览页
    byId(harness.tree, 'qqc-f-botQQ').props.onChange({ target: { value: '2564812526' } })
    harness.flush()
    savebarButtons(harness.tree)[1].props.onClick()
    harness.flush()
    await harness.settle()
    const banner = byClass(harness.tree, 'qqc-banner').filter(item => item.props['data-tone'] === 'error')[0]
    expect(textOf(banner)).toContain('写入失败：配置文件被其他写入方占用')
    expect(byRole(harness.tree, 'conflict-reload')).toHaveLength(0)
    expect(textOf(byClass(harness.tree, 'qqc-savebar')[0])).toContain('已修改 1 项')
  })

  it('无改动时点保存：只提示「没有需要保存的变更」，不调 updateSettings', async () => {
    const harness = mountPanel()
    await harness.settle()
    // 保存条不出现；直接走 Ctrl+S
    harness.tree.props.onKeyDown({ key: 's', ctrlKey: true, preventDefault: () => {} })
    harness.flush()
    await harness.settle()
    expect(harness.calls.updateSettings).toHaveLength(0)
    expect(textOf(harness.tree)).toContain('没有需要保存的变更。')
  })

  it('矩阵连续点击原子合并多键patch，权限放开仍需确认后才保存', async () => {
    vi.useFakeTimers()
    const harness = mountPanel({ config: { ...SCHEMA_DEFAULTS, ownerDeny: [], capabilitiesDeny: ['qq.send.image'] } })
    await harness.settle()
    gotoPage(harness, 'capabilities')
    const row = byClass(harness.tree, 'qqc-cap-row').find(item => item.props['data-capability'] === 'qq.send.image')!
    const input = (scope: string) => walk(byClass(row, 'qqc-cap-check').find(item => item.props['data-scope'] === scope)).find(item => item.type === 'input')!
    // 同一渲染闭包里连续调用；第二次必须基于第一个functional updater后的草稿。
    input('owner').props.onChange({ target: { checked: true } })
    input('private').props.onChange({ target: { checked: true } })
    harness.flush()
    const current = byClass(harness.tree, 'qqc-cap-row').find(item => item.props['data-capability'] === 'qq.send.image')!
    const checks = walk(current).filter(item => item.type === 'input')
    expect(checks.map(item => item.props.checked)).toEqual([true, true, false])
    savebarButtons(harness.tree)[1].props.onClick()
    harness.flush()
    expect(byRole(harness.tree, 'risk-dialog')).toHaveLength(1)
    expect(harness.calls.updateSettings).toEqual([])
    byId(harness.tree, 'qqc-risk-confirm').props.onClick()
    harness.flush()
    await harness.settle()
    expect(harness.calls.updateSettings).toEqual([{ patch: { capabilitiesDeny: [], memberDeny: ['qq.send.image'] }, revision: 1 }])
  })

  it.each(['capabilities', 'overview'])('搜索期间导航直达%s会清查询，但保留草稿与只看改动', async page => {
    vi.useFakeTimers()
    const harness = mountPanel({})
    await harness.settle()
    gotoPage(harness, 'persona')
    byId(harness.tree, 'qqc-f-ownerTitle').props.onChange({ target: { value: '保留的草稿' } })
    harness.flush()
    walk(byClass(harness.tree, 'qqc-filter')[0]).find(item => item.type === 'input')!.props.onChange({ target: { checked: true } })
    byClass(harness.tree, 'qqc-search')[0].props.onChange({ target: { value: 'not-found-query' } })
    harness.flush()
    expect(byClass(harness.tree, 'qqc-search')[0].props.value).toBe('not-found-query')
    gotoPage(harness, page)
    expect(byClass(harness.tree, 'qqc-search')[0].props.value).toBe('')
    expect(walk(byClass(harness.tree, 'qqc-filter')[0]).find(item => item.type === 'input')!.props.checked).toBe(true)
    expect(byClass(harness.tree, 'qqc-savebar')).toHaveLength(1)
    gotoPage(harness, 'persona')
    expect(byId(harness.tree, 'qqc-f-ownerTitle').props.value).toBe('保留的草稿')
    expect(harness.calls.updateSettings).toEqual([])
  })

  it('矩阵改动经概览按钮/导航切页不丢草稿，还原恢复原mixed配置', async () => {
    vi.useFakeTimers()
    const harness = mountPanel({ config: { ...SCHEMA_DEFAULTS, ownerDeny: [], friendDeny: ['qq.send.image'] } })
    await harness.settle()
    byRole(harness.tree, 'overview-go-capabilities')[0].props.onClick()
    harness.flush()
    let row = byClass(harness.tree, 'qqc-cap-row').find(item => item.props['data-capability'] === 'qq.send.image')!
    const privateInput = walk(byClass(row, 'qqc-cap-check').find(item => item.props['data-scope'] === 'private')).find(item => item.type === 'input')!
    expect(privateInput.props['aria-checked']).toBe('mixed')
    privateInput.props.onChange({ target: { checked: true } })
    harness.flush()
    gotoPage(harness, 'overview')
    expect(byClass(harness.tree, 'qqc-savebar')).toHaveLength(1)
    byRole(harness.tree, 'overview-go-capabilities')[0].props.onClick()
    harness.flush()
    row = byClass(harness.tree, 'qqc-cap-row').find(item => item.props['data-capability'] === 'qq.send.image')!
    expect(row.props['data-dirty']).toBe(true)
    savebarButtons(harness.tree)[0].props.onClick()
    harness.flush()
    row = byClass(harness.tree, 'qqc-cap-row').find(item => item.props['data-capability'] === 'qq.send.image')!
    expect(byRole(row, 'capability-mixed-note')).toHaveLength(1)
    expect(byClass(harness.tree, 'qqc-savebar')).toHaveLength(0)
    expect(harness.calls.updateSettings).toEqual([])
  })

  it('矩阵保存进行中全部checkbox禁用；冲突保留草稿并支持重新加载', async () => {
    vi.useFakeTimers()
    let finish: (value: unknown) => void = () => {}
    const pending = new Promise(resolve => { finish = resolve })
    const harness = mountPanel({ updateResult: pending })
    await harness.settle()
    gotoPage(harness, 'capabilities')
    const row = byClass(harness.tree, 'qqc-cap-row').find(item => item.props['data-capability'] === 'qq.send.image')!
    walk(row).find(item => item.type === 'input')!.props.onChange({ target: { checked: false } })
    harness.flush()
    savebarButtons(harness.tree)[1].props.onClick()
    harness.flush()
    const matrix = byRole(harness.tree, 'capability-matrix')[0]
    expect(walk(matrix).filter(item => item.type === 'input').every(item => item.props.disabled === true)).toBe(true)
    finish({ ok: false, error: { code: 'onebot-settings/conflict', message: 'expectedRevision mismatch' } })
    await harness.settle()
    expect(byRole(harness.tree, 'conflict-reload')).toHaveLength(1)
    expect(byClass(harness.tree, 'qqc-cap-row').find(item => item.props['data-capability'] === 'qq.send.image')!.props['data-dirty']).toBe(true)
    byRole(harness.tree, 'conflict-reload')[0].props.onClick()
    harness.flush()
    await harness.settle()
    expect(byClass(harness.tree, 'qqc-savebar')).toHaveLength(0)
  })

  it.each([false, true])('旧权限原值不被无关保存规范化，Remote无矩阵键：ownerDeny存在=%s', async supported => {
    vi.useFakeTimers()
    const config: Record<string, unknown> = { ...SCHEMA_DEFAULTS }
    for (const key of ['capabilitiesDeny', 'ownerDeny', 'friendDeny', 'memberDeny', 'strangerDeny', 'ownerGrant', 'friendGrant', 'memberGrant', 'strangerGrant']) config[key] = ['future.capability', ' qq.send.image ', 'future.capability', '']
    if (!supported) delete config.ownerDeny
    const harness = mountPanel({ config })
    await harness.settle()
    gotoPage(harness, 'connection')
    byId(harness.tree, 'qqc-f-port').props.onChange({ target: { value: '9999' } })
    harness.flush()
    gotoPage(harness, 'diagnostics')
    byId(harness.tree, 'qqc-f-logLevel').props.onChange({ target: { value: 'debug' } })
    harness.flush()
    harness.tree.props.onKeyDown({ key: 's', ctrlKey: true, preventDefault: () => {} })
    harness.flush()
    byId(harness.tree, 'qqc-risk-confirm').props.onClick() // port风险仍按原保存流程确认。
    harness.flush()
    await harness.settle()
    expect(harness.calls.updateSettings).toEqual([{ patch: { port: 9999, logLevel: 'debug' }, revision: 1 }])
  })

  it('对话框不往 document.body 挂节点：document.body 从未被读取', async () => {
    const harness = mountPanel()
    await harness.settle()
    gotoPage(harness, 'access')
    byId(harness.tree, 'qqc-f-allowAllUsers').props.onClick()
    harness.flush()
    savebarButtons(harness.tree)[1].props.onClick()
    harness.flush()
    expect(byRole(harness.tree, 'risk-dialog')).toHaveLength(1)
    expect(bodyTouched).toBe(false)
  })
})