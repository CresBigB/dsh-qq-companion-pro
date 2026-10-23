/**
 * 客户端设置页 UI bundle 测试（F2a：《前端设计规范》§1.1 入口 / §2 布局 /
 * §3 字段元数据 / §4 组件 / §5.2 导航 / §5.3 搜索筛选 / §6 样式 / §7 词条）。
 *
 * 验证 lib/client.js（浏览器 client bundle，无法直接 import——CJS 包裹挂
 * window.__ModuleLoader__）的模块级契约：
 *   ① 语法可解析 + CJS banner/footer 形态 + externals 仅 react；
 *   ② 入口导出 inject + apply；apply 注册两个 slot（settings.section 主入口与
 *      plugins.row.config keyed slot 第二入口，后者 embedded）；
 *   ③ 10 组 102 键：分组/键序/默认值与宿主 src/settings-remote.ts 导出常量互相
 *      核对；字段类型与宿主配置 dict 的 kind 逐键对照；静态元数据 + 函数型
 *      dependsOn（§3「依赖」列逐项覆盖）；
 *   ④ Typert descriptor 与宿主服务方法面逐字对齐；
 *   ⑤ 渲染：每个键一条 .qqc-row，控件类型与字段类型一一对应，label 的 htmlFor /
 *      hint 的 aria-describedby、data-dirty / data-inactive、密钥永不回显；
 *   ⑥ 纯函数：标签输入解析、单位换算、搜索匹配与高亮切分（含 < > & 文本）；
 *   ⑦ 样式：qqc- 前缀、无任何字面色值（#xxx / rgb( / rgba( / hsl(）；
 *   ⑧ 保存语义：computePatch 的输入输出契约不变（含标签数组形态）。
 *
 * @module dsh-qq-companion-pro/tests/client-settings
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { Config } from '../src/config.js'
import {
  ALL_KEYS,
  NAMESPACE,
  REMOTE_EFFECT,
  SCHEMA_DEFAULTS,
  SECRET_KEYS,
  SETTINGS_GROUPS,
} from '../src/settings-remote.js'

const CLIENT_SOURCE = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

/** 客户端字段表的一条（lib 产物形态；§3.12 静态 + 函数型元数据）。 */
interface ClientField {
  key: string
  label: string
  type: string
  options?: string[]
  optionLabels?: Record<string, string>
  hint?: string
  section?: string
  control?: string
  unit?: string
  min?: number
  max?: number
  placeholder?: string
  dependsOnText?: string
  dependsOn?: (draft: Record<string, unknown>) => boolean
  zeroMeans?: string
}
interface ClientGroup {
  id: string
  title: string
  desc: string
  fields: ClientField[]
}

/** 极简 React 替身：createElement 产出可遍历的元素树（渲染函数模块级可测）。 */
type StubElement = { type: unknown; props: Record<string, unknown>; children: unknown[] }
const stubReact = {
  createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): StubElement {
    return {
      type,
      props: props ?? {},
      children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false && child !== true),
    }
  },
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
/** 元素树里的全部文本（HTML 安全断言用：文本节点永远是文本）。 */
function textOf(node: unknown): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node === null || typeof node !== 'object') return ''
  const element = node as StubElement
  return (element.children ?? []).map(textOf).join('')
}
/** className 是否含某个类（产物里 className 恒为字符串）。 */
function hasClass(element: StubElement, name: string): boolean {
  return String(element.props.className == null ? '' : element.props.className).split(/\s+/).indexOf(name) >= 0
}
/** 某类元素。 */
function byClass(node: unknown, name: string): StubElement[] {
  return walk(node).filter(element => hasClass(element, name))
}
/** 带某个 data-role 的元素（选择器这类没有专属类名的块）。 */
function byRole(node: unknown, role: string): StubElement[] {
  return walk(node).filter(element => element.props['data-role'] === role)
}

/** CJS 包裹装载：模拟 window.__ModuleLoader__.load + require('react') 外部表。 */
function loadClientModule(): Record<string, unknown> {
  const factories: Record<string, (request: (spec: string) => unknown) => unknown> = {}
  const globalWithWindow = globalThis as unknown as { window?: { __ModuleLoader__: unknown } }
  globalWithWindow.window = { __ModuleLoader__: { load: (entry: { id: string; factory: (request: (spec: string) => unknown) => unknown }) => { factories[entry.id] = entry.factory } } }
  // 求值 bundle 源码：new Function 体在调用时经全局 window 找到 ModuleLoader 桩完成注册。
  new Function(CLIENT_SOURCE)()
  const factory = factories['dsh-qq-companion-pro']
  if (factory === undefined) throw new Error('lib/client.js 未注册 dsh-qq-companion-pro 模块')
  return factory((spec: string) => {
    if (spec !== 'react') throw new Error(`unexpected external require: ${spec}`)
    return stubReact
  }) as Record<string, unknown>
}

const client = loadClientModule()
const descriptors = client.ONEBOT_SETTINGS_DESCRIPTORS as Array<Record<string, unknown>>
const groups = client.GROUPS as ClientGroup[]
const allFields = client.ALL_FIELDS as ClientField[]
/** schema 键集（vObject 暴露的声明键，供「schema ≡ ALL_KEYS」核对）。 */
const configSchemaKeys = (client.configSchema as { keys: readonly string[] }).keys
const patchSchemaKeys = (client.patchSchema as { keys: readonly string[] }).keys
/** 模块级共享草稿构造器。 */
const draft = client.draftFromSnapshot as (snapshot: { config: Record<string, unknown> }) => Record<string, unknown>
/** 渲染函数（bundle 导出，模块级纯函数）。 */
const renderGroup = client.renderGroup as (react: unknown, group: ClientGroup, opts?: Record<string, unknown>) => StubElement | null
const renderFieldRow = client.renderFieldRow as (react: unknown, field: ClientField, opts?: Record<string, unknown>) => StubElement
const renderPicker = client.renderWorkspacePicker as (react: unknown, opts?: Record<string, unknown>) => StubElement | null
const compute = client.computePatch as (
  draftValues: Record<string, unknown>,
  config: Record<string, unknown>,
  opts?: { secretDraft?: string; clearSecret?: boolean },
) => { patch: Record<string, unknown>; invalidKeys: string[] }
const SettingsView = client.SettingsView as (props: Record<string, unknown>) => StubElement

/** 词条翻译（测试里直接读 bundle 导出的 zh 词条，断言就看真实文案）。 */
function zhT(key: string): string {
  const dict = client.zh as Record<string, string>
  return dict[key] != null ? dict[key] : key
}

/** 渲染某组 / 全部组的默认面板（回调全部为空操作）。 */
function renderAllGroups(draftValues: Record<string, unknown>, extra: Record<string, unknown> = {}): StubElement[] {
  return groups.map(group => renderGroup(stubReact, group, Object.assign({
    draft: draftValues,
    config: SCHEMA_DEFAULTS,
    defaults: client.DEFAULTS,
    secretSet: false,
    clearSecret: false,
    t: zhT,
    onChange: () => {},
    onSecretChange: () => {},
    onClearSecretChange: () => {},
    onResetField: () => {},
    onTagInput: () => {},
    onTagCommit: () => {},
    onTagRemove: () => {},
    onTagBackspace: () => {},
  }, extra)) as StubElement)
}

/** 按 data-key 找字段行。 */
function rowOf(tree: unknown, key: string): StubElement {
  const found = walk(tree).filter(element => hasClass(element, 'qqc-row') && element.props['data-key'] === key)
  expect(found.length, `缺少 ${key} 的行`).toBe(1)
  return found[0]
}

/** SettingsView 的默认 props。 */
function viewProps(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const config = Object.assign({}, SCHEMA_DEFAULTS)
  return Object.assign({
    t: zhT,
    page: 'connection',
    query: '',
    changedOnly: false,
    draft: draft({ config: config }),
    config: config,
    botQQ: '2564812526',
    secretSet: true,
    clearSecret: false,
    tagInputs: {},
    workspace: { loaded: false, available: false, workspaces: [], selectedId: '' },
    busy: false,
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

describe('客户端 bundle — 装载契约（CJS 包裹 / externals / 入口导出）', () => {
  it('语法可解析：new Function 直接解析 lib/client.js 全文', () => {
    expect(() => new Function(CLIENT_SOURCE)).not.toThrow()
  })

  it('CJS 包裹形态：banner window.__ModuleLoader__.load({id, factory:(require)=>{ + footer return module.exports', () => {
    expect(CLIENT_SOURCE).toContain('window.__ModuleLoader__.load({')
    expect(CLIENT_SOURCE).toContain('id: "dsh-qq-companion-pro",')
    expect(CLIENT_SOURCE).toContain('factory: (require) => {')
    expect(CLIENT_SOURCE.trimEnd().endsWith('return module.exports;\n\t}\n});')).toBe(true)
  })

  it('externals 仅 react：文件内全部 require 调用都指向 react', () => {
    const requireCalls = CLIENT_SOURCE.match(/require\s*\(/g) ?? []
    const reactCalls = CLIENT_SOURCE.match(/require\s*\(\s*["']react["']\s*\)/g) ?? []
    expect(reactCalls.length).toBe(requireCalls.length)
    expect(requireCalls.length).toBeGreaterThan(0)
  })

  it('入口导出 inject（宿主客户端服务名数组）+ apply(ctx) + 面板与视图组件', () => {
    expect(client.inject).toEqual(['slots', 'locale', 'remote'])
    expect(typeof client.apply).toBe('function')
    expect(typeof client.OnebotSettingsPanel).toBe('function')
    expect(typeof client.SettingsView).toBe('function')
  })

  it('导出符号不少于 18 个（§8.1 契约：纯函数一个都不能少）', () => {
    const names = [
      'inject', 'apply', 'ONEBOT_SETTINGS_REMOTE', 'ONEBOT_SETTINGS_DESCRIPTORS', 'GROUPS', 'ALL_FIELDS',
      'DEFAULTS', 'GROUP_KEYS', 'computePatch', 'coerceValue', 'snapshotValueToDraft', 'draftFromSnapshot',
      'fillWorkspacePath', 'renderWorkspacePicker', 'isConflictError', 'unwrap', 'renderGroup', 'OnebotSettingsPanel',
    ]
    for (const name of names) expect(client[name], `缺少导出 ${name}`).toBeDefined()
    expect(Object.keys(client).length).toBeGreaterThanOrEqual(18)
  })

  it('除 react 外无运行时依赖：源码不引用 node: / @deepseek-ai 模块', () => {
    expect(CLIENT_SOURCE).not.toMatch(/require\s*\(\s*["'](node:|@deepseek-ai\/|schemastery)/)
    expect(CLIENT_SOURCE).not.toMatch(/\bimport\s/)
  })
})

describe('客户端 bundle — 两个入口的 slot 注册参数（§1.1）', () => {
  /** 假 ctx：记录 effect / register 调用，供 apply 契约核对。 */
  function fakeContext() {
    const registered: Array<{ name: string; definition: Record<string, unknown>; render: (props: Record<string, unknown>) => unknown }> = []
    const styles: Array<{ dataset: Record<string, string>; textContent: string; removed: boolean }> = []
    const appended: unknown[] = []
    const documents = {
      createElement() {
        const node = {
          dataset: {} as Record<string, string>,
          textContent: '',
          removed: false,
          remove() { node.removed = true },
        }
        styles.push(node)
        return node
      },
      head: { appendChild(node: unknown) { appended.push(node) } },
    }
    ;(globalThis as unknown as { document: unknown }).document = documents
    const remoteApi = {
      getSettings: async () => ({ ok: true, value: { revision: 1, entryActive: true, config: SCHEMA_DEFAULTS, secrets: [], groups: SETTINGS_GROUPS, effect: REMOTE_EFFECT } }),
      updateSettings: async () => ({ ok: true, value: {} }),
      listWorkspaces: async () => ({ ok: true, value: { available: false, workspaces: [] } }),
    }
    const disposers: Array<() => void> = []
    const ctx = {
      effect(fn: () => (() => void) | void) {
        const disposer = fn()
        if (typeof disposer === 'function') disposers.push(disposer)
        return disposer
      },
      locale: {
        register: () => () => {},
        bind: () => (key: string) => key,
      },
      remote: { $mount: async () => () => {} },
      get: () => remoteApi,
      slots: {
        inject(_name: string, factory: () => unknown) { factory() },
        register(definition: Record<string, unknown>, render: (props: Record<string, unknown>) => unknown) {
          registered.push({ name: String(definition.name), definition, render })
          return definition
        },
      },
    }
    return { ctx, registered, styles, appended, disposers, remoteApi }
  }

  it('主入口 settings.section：id/order/icon/label/locale 齐备，渲染主面板（非 embedded）', async () => {
    const fake = fakeContext()
    await (client.apply as (ctx: unknown) => Promise<() => void>)(fake.ctx)
    const main = fake.registered.find(entry => entry.name === 'settings.section')
    expect(main).toBeDefined()
    expect(main!.definition.id).toBe('onebot-settings')
    expect(main!.definition.order).toBe(18)
    expect(main!.definition.icon).toBe('settings')
    expect((main!.definition.label as () => string)()).toBe('settings.nav') // 假 ctx 的 bind 是恒等函数
    expect(typeof main!.definition.locale).toBe('string')
    const element = main!.render({}) as StubElement
    expect(element.props.remote).toBe(fake.remoteApi)
    expect(element.props.embedded).toBeUndefined()
  })

  it('第二入口 plugins.row.config：只带 key，key = <PLUGIN_ID>#dsh-onebot，渲染同一面板且 embedded=true', async () => {
    const fake = fakeContext()
    await (client.apply as (ctx: unknown) => Promise<() => void>)(fake.ctx)
    const second = fake.registered.find(entry => entry.name === 'plugins.row.config')
    expect(second).toBeDefined()
    expect(second!.definition).toEqual({ name: 'plugins.row.config', key: 'dsh-qq-companion-pro#dsh-onebot' })
    const element = second!.render({}) as StubElement
    expect(element.props.embedded).toBe(true) // 同一面板，embedded 模式
    expect(element.props.remote).toBe(fake.remoteApi)
    expect(typeof element.props.t).toBe('function') // 宿主没注入 t 时回退 zh 词条
  })

  it('第二入口的 view=summary 只渲染一行简介（不在插件列表行里塞整块表单）', async () => {
    const fake = fakeContext()
    await (client.apply as (ctx: unknown) => Promise<() => void>)(fake.ctx)
    const second = fake.registered.find(entry => entry.name === 'plugins.row.config')!
    const summary = second.render({ view: 'summary' }) as StubElement
    expect(summary.type).toBe('span')
    expect(hasClass(summary, 'qqc-summary')).toBe(true)
    expect(textOf(summary)).toContain('cordis.patch.yml')
    expect(walk(summary).filter(element => hasClass(element, 'qqc-row'))).toHaveLength(0)
    // view=page 才给完整面板（embedded）
    const page = second.render({ view: 'page' }) as StubElement
    expect(page.props.embedded).toBe(true)
  })

  it('样式经 ctx.effect 注入 <style data-plugin>，卸载即移除；不碰 document.body', async () => {
    const fake = fakeContext()
    const dispose = await (client.apply as (ctx: unknown) => Promise<() => void>)(fake.ctx)
    expect(fake.styles).toHaveLength(1)
    expect(fake.styles[0].dataset.plugin).toBe('dsh-qq-companion-pro')
    expect(fake.styles[0].textContent).toContain('.qqc-root')
    expect(fake.appended).toHaveLength(1)
    for (const disposer of fake.disposers) disposer()
    expect(fake.styles[0].removed).toBe(true)
    // 只往 head 挂 style，绝不往 body 挂节点。
    expect(JSON.stringify(Object.keys((globalThis as unknown as { document: Record<string, unknown> }).document))).not.toContain('body')
    expect(typeof dispose).toBe('function')
  })
})

describe('客户端 bundle — descriptor 契约核对（与 src/settings-remote.js 逐字对齐）', () => {
  it('namespace/service = onebotSettings，与宿主 NAMESPACE 常量一致', () => {
    expect(client.ONEBOT_SETTINGS_REMOTE).toEqual({ package: 'dsh-qq-companion-pro', descriptors })
    for (const descriptor of descriptors) {
      expect(descriptor.namespace).toBe(NAMESPACE)
      expect(descriptor.service).toBe(NAMESPACE)
      expect(descriptor.method).toBeTypeOf('string')
      expect(descriptor.id).toBe(`dsh-qq-companion-pro#${NAMESPACE}/${String(descriptor.method)}`)
    }
  })

  it('方法集逐字对齐：getSettings() 0 参；updateSettings(patch, expectedRevision)；listWorkspaces() / getStatus() 0 参，全 positional', () => {
    expect(descriptors.map((descriptor) => descriptor.method)).toEqual(['getSettings', 'updateSettings', 'listWorkspaces', 'getStatus'])
    const getSettings = descriptors[0] as { parameters: Array<unknown>; result: { schema: { parse(value: unknown): unknown } } }
    expect(getSettings.parameters).toEqual([])
    const updateSettings = descriptors[1] as { parameters: Array<{ name: string }>; result: { schema: { parse(value: unknown): unknown } } }
    expect(updateSettings.parameters.map((parameter) => parameter.name)).toEqual(['patch', 'expectedRevision'])
    const listWorkspaces = descriptors[2] as { parameters: Array<unknown>; result: { typeSymbol: string; schema: { parse(value: unknown): unknown } } }
    expect(listWorkspaces.parameters).toEqual([])
    expect(listWorkspaces.result.typeSymbol).toBe('WorkspaceListResult')
    expect(listWorkspaces.result.schema.parse({ available: true, workspaces: [{ id: 'ws-1', path: '/tmp/ws', sessionCount: 2 }] })).toEqual({
      available: true,
      workspaces: [{ id: 'ws-1', path: '/tmp/ws', sessionCount: 2 }],
    })
    expect(listWorkspaces.result.schema.parse({ available: false, workspaces: [] })).toEqual({ available: false, workspaces: [] })
    // getStatus 是 F3 追加的第四个方法：0 参只读查询。
    const getStatus = descriptors[3] as { parameters: Array<unknown>; result: { typeSymbol: string; schema: { parse(value: unknown): { status?: Record<string, unknown> } } } }
    expect(getStatus.parameters).toEqual([])
    expect(getStatus.result.typeSymbol).toBe('CompanionStatusResult')
  })

  it('getStatus result codec 宽松接受缺失字段（概览缺失显示「—」，不因一处缺键整页报错）', () => {
    const getStatus = descriptors[3] as { result: { schema: { parse(value: unknown): { available: boolean; status?: Record<string, unknown> } } } }
    // 主插件未运行：只有 available:false。
    expect(getStatus.result.schema.parse({ available: false })).toMatchObject({ available: false })
    // 部分字段取数失败（null / 缺键）照常放行。
    const partial = getStatus.result.schema.parse({
      available: true,
      status: { connection: { connected: true, online: null }, today: { sent: 3 }, memory: [{ label: '公开', path: '/tmp/AGENTS.md', bytes: null, maxBytes: 6144 }] },
    })
    expect(partial.status?.today).toMatchObject({ sent: 3 })
    expect((partial.status?.connection as Record<string, unknown>).connected).toBe(true)
    expect((partial.status?.connection as Record<string, unknown>).online).toBeUndefined() // null → 缺席（客户端显示「—」）
    // 服务在位但取数抛错。
    expect(getStatus.result.schema.parse({ available: true, error: '读取失败' })).toMatchObject({ available: true, error: '读取失败' })
    // 完整快照原样通过。
    const full = getStatus.result.schema.parse({
      available: true,
      status: {
        connection: { connected: true, online: true, selfId: '2564812526', botQQ: '2564812526', host: '127.0.0.1', port: 8643 },
        sessions: { private: 1, group: 2, list: [{ chatId: 'private:1', sessionId: 's1', workspaceAttached: false }] },
        today: { sent: 12 },
        proactive: { enabled: true, doneToday: 1, plannedToday: 4, nextAt: '15:30' },
        stickers: { enabled: true, count: 10, maxCount: 300, today: 2, dailyMax: 20 },
        memory: [{ label: '公开', path: '/tmp/AGENTS.md', bytes: 2048, maxBytes: 6144 }],
        scheduled: [{ id: 'diary', time: '23:00', chatId: 'private:1', doneToday: false, nextAt: '23:00' }],
        permissions: { admin: 'danger-full-access', member: 'read-only' },
        generatedAt: 1700000000000,
      },
    })
    expect((full.status?.sessions as { private: number }).private).toBe(1)
    expect((full.status?.scheduled as unknown[]).length).toBe(1)
    expect((full.status?.generatedAt as number)).toBe(1700000000000)
  })

  it('result codec 可解析宿主形态快照', () => {
    const getSettings = descriptors[0] as { result: { schema: { parse(value: unknown): unknown } } }
    const config: Record<string, unknown> = { ...SCHEMA_DEFAULTS }
    config.accessToken = '' // 宿主 buildSnapshot 脱敏约定：快照 accessToken 恒 ''
    const snapshot = {
      revision: 3,
      entryActive: true,
      config,
      secrets: SECRET_KEYS.map((key) => ({ path: [key], set: typeof SCHEMA_DEFAULTS[key] === 'string' && (SCHEMA_DEFAULTS[key] as string).length > 0 })),
      groups: SETTINGS_GROUPS,
      effect: REMOTE_EFFECT,
    }
    const parsed = getSettings.result.schema.parse(snapshot) as typeof snapshot
    expect(parsed.config.accessToken).toBe('')
    expect(parsed.config.workspacePath).toBe('')
    expect(parsed.effect).toBe(REMOTE_EFFECT)
  })

  it('result codec 拒绝缺键/多 effect 快照（严格 codec，防宿主契约漂移静默通过）', () => {
    const getSettings = descriptors[0] as { result: { schema: { parse(value: unknown): unknown } } }
    const config: Record<string, unknown> = { ...SCHEMA_DEFAULTS }
    delete config.port
    expect(() => getSettings.result.schema.parse({ revision: 0, entryActive: true, config, secrets: [], groups: SETTINGS_GROUPS, effect: 'restart' })).toThrow()
    expect(() => getSettings.result.schema.parse({ revision: 0, entryActive: true, config: SCHEMA_DEFAULTS, secrets: [], groups: SETTINGS_GROUPS, effect: 'none' })).toThrow()
  })

  it('updateSettings patch codec 接受任意子集、拒绝非法枚举值', () => {
    const updateSettings = descriptors[1] as { parameters: Array<{ codec: { schema: { parse(value: unknown): unknown } } }> }
    const patchCodec = updateSettings.parameters[0].codec.schema
    expect(patchCodec.parse({ port: 1234 })).toEqual({ port: 1234 })
    expect(patchCodec.parse({ adminUsers: ['10000'], unknownCommand: 'passthrough' })).toEqual({ adminUsers: ['10000'], unknownCommand: 'passthrough' })
    expect(patchCodec.parse({ workspacePath: '/tmp/ws' })).toEqual({ workspacePath: '/tmp/ws' })
    expect(() => patchCodec.parse({ dmPolicy: 'invalid' })).toThrow()
  })
})

describe('客户端 bundle — 分组、键集、默认值与 host 一致', () => {
  /** 规范 §1.2 的子页顺序（不含 overview：它不承载配置键，F3 才加）。 */
  const GROUP_ORDER = ['connection', 'access', 'persona', 'messaging', 'conversation', 'group', 'memory', 'proactive', 'media', 'diagnostics']

  it('分组 id 顺序 = 规范 §1.2 的 10 个子页（显式钉住导航顺序）', () => {
    expect(groups.map((group) => group.id)).toEqual(GROUP_ORDER)
    expect(Object.keys(SETTINGS_GROUPS)).toEqual(GROUP_ORDER)
  })

  it('分组与键序与 host SETTINGS_GROUPS 同构（客户端 ↔ 宿主对照，不写死键列表）', () => {
    expect(client.GROUP_KEYS).toEqual(SETTINGS_GROUPS)
    for (const group of groups) expect(group.fields.map((field) => field.key)).toEqual([...SETTINGS_GROUPS[group.id]])
    expect(allFields.map((field) => field.key)).toEqual([...ALL_KEYS])
    expect(allFields).toHaveLength(ALL_KEYS.length)
    expect(ALL_KEYS).toHaveLength(102)
  })

  it('默认值逐字对齐 host SCHEMA_DEFAULTS，且全量覆盖 102 键（恢复默认值唯一来源）', () => {
    expect(client.DEFAULTS).toEqual(SCHEMA_DEFAULTS)
    expect(Object.keys(client.DEFAULTS as Record<string, unknown>).sort()).toEqual([...ALL_KEYS].sort())
  })

  it('字段 type 与宿主配置 dict 的 kind 逐键对照（union→enum、array→stringArray、string→secret 仅 accessToken）', () => {
    const dict = (Config as unknown as { dict: Record<string, { type: string; list?: Array<{ value?: unknown }> }> }).dict
    for (const field of allFields) {
      const spec = dict[field.key]
      expect(spec, `宿主配置缺少 ${field.key}`).toBeTruthy()
      if (field.type === 'enum') {
        expect(spec.type).toBe('union')
        expect(field.options).toEqual((spec.list ?? []).map((item) => String(item.value)))
      } else if (field.type === 'stringArray') {
        expect(spec.type).toBe('array')
      } else if (field.type === 'secret') {
        expect(spec.type).toBe('string')
      } else {
        expect(spec.type).toBe(field.type)
      }
    }
  })

  it('default 形态与字段类型一致；枚举字段选项覆盖默认值，optionLabels 覆盖全部选项', () => {
    const defaults = client.DEFAULTS as Record<string, unknown>
    for (const field of allFields) {
      const fallback = defaults[field.key]
      if (field.type === 'boolean') expect(typeof fallback).toBe('boolean')
      else if (field.type === 'number') expect(typeof fallback).toBe('number')
      else if (field.type === 'enum') {
        expect(field.options ?? []).toContain(fallback)
        expect(Object.keys(field.optionLabels ?? {}).sort()).toEqual([...(field.options ?? [])].sort())
        for (const label of Object.values(field.optionLabels ?? {})) expect(label.trim()).not.toBe('')
      } else if (field.type === 'stringArray') expect(Array.isArray(fallback)).toBe(true)
      else expect(typeof fallback).toBe('string')
    }
    // dmPolicy 的 open 选项文案按 §3.2 改写（旧文案「开放」误导：open 实际只放管理员）。
    const dmPolicy = allFields.find((field) => field.key === 'dmPolicy')!
    expect(dmPolicy.optionLabels?.open).toContain('仅管理员')
    expect(dmPolicy.optionLabels?.open).toContain('允许所有用户')
    expect(dmPolicy.optionLabels?.disabled).toBe('不接私聊')
  })

  it('每组有 §1.2 的中文名称与一句话说明；每个字段有卡片名和中文标签', () => {
    expect(groups.map((group) => group.title)).toEqual(['连接', '谁能找她', '她', '说话方式', '会话与任务', '群聊', '记忆', '主动聊天', '媒体与语音', '诊断'])
    for (const group of groups) {
      expect(group.desc.length).toBeGreaterThan(8)
      for (const field of group.fields) {
        expect(field.label).toMatch(/\p{Script=Han}/u)
        expect(typeof field.section).toBe('string')
        expect(field.section).not.toBe('')
      }
    }
    // 同页同 section 的字段必须是连续的一段（渲染按组内顺序切卡片）。
    for (const group of groups) {
      const seen = new Set<string>()
      let previous = ''
      for (const field of group.fields) {
        if (field.section === previous) continue
        expect(seen.has(field.section), `${group.id} 的卡片「${field.section}」不连续`).toBe(false)
        seen.add(field.section)
        previous = field.section
      }
    }
  })

  it('hint 不再带「（配置键 xxx）」尾巴（键名改由统一的 .qqc-key 展示）', () => {
    for (const field of allFields) {
      if (field.hint === undefined) continue
      expect(field.hint).not.toContain('（配置键')
      expect(field.hint.trim()).not.toBe('')
    }
  })

  it('数字字段带 §3.12 的区间：port 1–65535，其余 min 0 且不设上限；单位只取规范枚举', () => {
    const UNITS = ['ms', 's', 'min', 'h', 'day', 'byte', 'px', 'char', 'count', 'perDay', 'perMin']
    const CONTROLS = ['path', 'time', 'time24']
    for (const field of allFields) {
      if (field.type === 'number') {
        if (field.key === 'port') {
          expect(field.min).toBe(1)
          expect(field.max).toBe(65535)
        } else {
          expect(field.min).toBe(0)
          expect(field.max).toBeUndefined()
        }
      } else {
        expect(field.min).toBeUndefined()
        expect(field.max).toBeUndefined()
      }
      if (field.unit !== undefined) expect(UNITS).toContain(field.unit)
      if (field.control !== undefined) expect(CONTROLS).toContain(field.control)
    }
    // 时间类控件按规范落位（窗口开始 HH:MM，结束允许 24:00）。
    const fieldOf = (key: string) => allFields.find((field) => field.key === key)!
    expect(fieldOf('groupPeekWindowStart').control).toBe('time')
    expect(fieldOf('groupPeekWindowEnd').control).toBe('time24')
    expect(fieldOf('proactiveWindowStart').control).toBe('time')
    expect(fieldOf('proactiveWindowEnd').control).toBe('time')
    expect(fieldOf('proactiveChatId').placeholder).toBe('private:QQ号')
    for (const field of allFields) {
      if (field.dependsOnText === undefined) continue
      expect(field.dependsOnText).toContain('仅在')
    }
  })

  it('configSchema / patchSchema 的键集 ≡ ALL_KEYS（快照多返的键会被静默丢弃，靠这条守住）', () => {
    expect([...configSchemaKeys].sort()).toEqual([...ALL_KEYS].sort())
    expect([...patchSchemaKeys].sort()).toEqual([...ALL_KEYS].sort())
    expect(configSchemaKeys).toHaveLength(102)
    expect(patchSchemaKeys).toHaveLength(102)
  })

  it('accessToken 是唯一 secret 字段（脱敏约定：密码型输入 + 不明文回显）', () => {
    const secretFields = allFields.filter((field) => field.type === 'secret')
    expect(secretFields.map((field) => field.key)).toEqual([...SECRET_KEYS])
  })
})

describe('字段元数据 — dependsOn 覆盖规范 §3「依赖」列的每一项', () => {
  /** 规范 §3 依赖列 → 每个键的「生效 / 未生效」草稿。 */
  const CASES: Array<{ keys: string[]; on: Record<string, unknown>; off: Record<string, unknown> }> = [
    { keys: ['allowFrom'], on: { dmPolicy: 'allowlist' }, off: { dmPolicy: 'open' } },
    { keys: ['groupAllowFrom'], on: { groupPolicy: 'allowlist' }, off: { groupPolicy: 'open' } },
    { keys: ['splitMaxMessages', 'groupSplitLines'], on: { splitLines: true }, off: { splitLines: false } },
    { keys: ['typingDelayPerCharMs', 'typingDelayMinMs', 'typingDelayMaxMs'], on: { humanTypingPace: true }, off: { humanTypingPace: false, splitLines: false } },
    { keys: ['cardFooter', 'fontFiles', 'fontFamilies'], on: { textImageThreshold: '200' }, off: { textImageThreshold: '0' } },
    { keys: ['interimRecall'], on: { interimMessages: true }, off: { interimMessages: false } },
    { keys: ['interimRecallMs'], on: { interimMessages: true, interimRecall: true }, off: { interimMessages: true, interimRecall: false } },
    { keys: ['autoSteerPolicy'], on: { newMessagePolicy: 'steer' }, off: { newMessagePolicy: 'queue' } },
    { keys: ['publicMemoryMaxBytes'], on: { publicMemoryFile: 'E:\\m\\AGENTS.md' }, off: { publicMemoryFile: '' } },
    { keys: ['groupMemoryMaxBytes'], on: { groupMemoryDir: 'E:\\m\\groups' }, off: { groupMemoryDir: '' } },
    { keys: ['stickerMaxCount', 'stickerMaxBytes', 'stickerDailyMax'], on: { stickerDir: 'E:\\stickers' }, off: { stickerDir: '' } },
    { keys: ['groupPeekGapMinutes', 'groupPeekMinMessages', 'groupPeekQuietMinutes', 'groupPeekWindowStart', 'groupPeekWindowEnd'], on: { groupPeekEnabled: true }, off: { groupPeekEnabled: false } },
    { keys: ['proactiveChatId', 'proactiveWindowStart', 'proactiveWindowEnd', 'proactiveMinPerDay', 'proactiveMaxPerDay', 'proactiveMinGapMinutes', 'proactiveSkipIfActiveMinutes', 'proactiveMaxUnanswered'], on: { proactiveEnabled: true }, off: { proactiveEnabled: false } },
    { keys: ['sttEngine', 'sttModel', 'sttLanguage', 'sttMaxSeconds', 'sttTimeoutMs'], on: { sttEnabled: true }, off: { sttEnabled: false } },
    { keys: ['sttCommand', 'sttArgs'], on: { sttEnabled: true, sttEngine: 'command' }, off: { sttEnabled: true, sttEngine: 'auto' } },
    { keys: ['traceLevel'], on: { traceEnabled: true }, off: { traceEnabled: false } },
  ]

  const draftWith = (overrides: Record<string, unknown>): Record<string, unknown> => Object.assign(draft({ config: SCHEMA_DEFAULTS }), overrides)

  it('规范依赖列的每个键都有 dependsOn，且生效/未生效两侧都返回正确布尔', () => {
    for (const item of CASES) {
      for (const key of item.keys) {
        const field = allFields.find(candidate => candidate.key === key)
        expect(field, `缺少字段 ${key}`).toBeTruthy()
        expect(typeof field!.dependsOn, `${key} 缺少 dependsOn`).toBe('function')
        expect(field!.dependsOn!(draftWith(item.on)), `${key} 在依赖满足时应生效`).toBe(true)
        expect(field!.dependsOn!(draftWith(item.off)), `${key} 在依赖不满足时应未生效`).toBe(false)
      }
    }
  })

  it('依赖列的键都带 dependsOnText；带 dependsOn 的键都有说明；反之亦然', () => {
    for (const field of allFields) {
      if (field.dependsOnText !== undefined) expect(typeof field.dependsOn, `${field.key} 有说明但没 dependsOn`).toBe('function')
      if (typeof field.dependsOn === 'function') expect(field.dependsOnText, `${field.key} 有 dependsOn 但没说明`).toBeTruthy()
    }
  })

  it('sttEngine 为 custom 时也算自定义命令（§3.9 的 command/custom 两档）', () => {
    const field = allFields.find(candidate => candidate.key === 'sttCommand')!
    expect(field.dependsOn!(draftWith({ sttEnabled: true, sttEngine: 'custom' }))).toBe(true)
    expect(field.dependsOn!(draftWith({ sttEnabled: false, sttEngine: 'custom' }))).toBe(false)
  })

  it('「未生效」字段仍可编辑：草稿值原样渲染进控件（不是禁用）', () => {
    const field = allFields.find(candidate => candidate.key === 'stickerMaxCount')!
    const values = draftWith({ stickerDir: '', stickerMaxCount: '123' })
    const row = renderFieldRow(stubReact, field, { draft: values, config: SCHEMA_DEFAULTS, defaults: client.DEFAULTS })
    expect(row.props['data-inactive']).toBe('true')
    const input = byClass(row, 'qqc-input')[0]
    expect(input.props.value).toBe('123')
    expect(input.props.disabled).not.toBe(true)
    expect(textOf(row)).toContain('未生效')
    expect(textOf(row)).toContain('仅在填了表情包库目录时生效')
  })
})

describe('客户端 bundle — 字段行渲染（§4.1–§4.9）', () => {
  it('每个键都有且只有一条 .qqc-row，含 label（htmlFor）/ key / hint（aria-describedby）', () => {
    const trees = renderAllGroups(draft({ config: SCHEMA_DEFAULTS }))
    const rows = trees.flatMap(tree => byClass(tree, 'qqc-row'))
    expect(rows).toHaveLength(ALL_KEYS.length)
    for (const field of allFields) {
      const row = rowOf(trees, field.key)
      const label = byClass(row, 'qqc-label')[0]
      expect(label.props.htmlFor).toBe('qqc-f-' + field.key)
      expect(textOf(byClass(row, 'qqc-key')[0])).toBe(field.key)
      if (field.hint !== undefined) {
        const hint = byClass(row, 'qqc-hint')[0]
        expect(hint.props.id).toBe('qqc-h-' + field.key)
        expect(textOf(hint)).toBe(field.hint)
      }
      // 控件都指向说明（存在 hint 时）
      const targets = walk(row).filter(element => element.props['aria-describedby'] != null)
      for (const target of targets) expect(target.props['aria-describedby']).toBe('qqc-h-' + field.key)
    }
  })

  it('控件类型与字段类型一一对应（boolean=switch / enum=select / stringArray=tags / secret=password / 其余=input）', () => {
    const trees = renderAllGroups(draft({ config: SCHEMA_DEFAULTS }))
    for (const field of allFields) {
      const row = rowOf(trees, field.key)
      const elements = walk(row)
      const id = 'qqc-f-' + field.key
      if (field.type === 'boolean') {
        const switches = elements.filter(element => element.type === 'button' && element.props.role === 'switch')
        expect(switches, `${field.key} 缺 role=switch`).toHaveLength(1)
        expect(switches[0].props.id).toBe(id)
        expect(typeof switches[0].props['aria-checked']).toBe('boolean')
        expect(elements.filter(element => element.type === 'input' && element.props.type === 'checkbox')).toHaveLength(0)
      } else if (field.type === 'enum') {
        const select = elements.filter(element => element.type === 'select')
        expect(select, `${field.key} 缺下拉`).toHaveLength(1)
        expect(select[0].props.id).toBe(id)
        const options = (select[0].children as StubElement[]).map(option => option.props.value)
        expect(options).toEqual(field.options ?? [])
        for (const option of select[0].children as StubElement[]) {
          const label = field.optionLabels?.[String(option.props.value)]
          if (label != null) expect(textOf(option)).toBe(label)
        }
      } else if (field.type === 'stringArray') {
        expect(byClass(row, 'qqc-tags'), `${field.key} 缺标签列表`).toHaveLength(1)
        const input = byClass(row, 'qqc-tags-input')
        expect(input, `${field.key} 缺标签输入框`).toHaveLength(1)
        expect(input[0].props.id).toBe(id)
        // 标签列表行用 .qqc-row--stack（控件在说明下方）
        expect(hasClass(row, 'qqc-row--stack')).toBe(true)
      } else if (field.type === 'secret') {
        const password = elements.filter(element => element.type === 'input' && element.props.type === 'password')
        expect(password, `${field.key} 缺密码框`).toHaveLength(1)
        expect(password[0].props.id).toBe(id)
        expect(password[0].props.value).toBe('')
        expect(byClass(row, 'qqc-tags')).toHaveLength(0)
      } else {
        const inputs = elements.filter(element => element.type === 'input')
        expect(inputs, `${field.key} 缺文本输入`).toHaveLength(1)
        expect(inputs[0].props.type).toBe('text') // 数字也是文本框（§4.3）
        expect(inputs[0].props.id).toBe(id)
        if (field.type === 'number') expect(inputs[0].props.inputMode).toBe('numeric')
        if (field.control === 'path') {
          expect(inputs[0].props['data-kind']).toBe('path')
          expect(inputs[0].props.spellCheck).toBe(false)
        }
        if (field.control === 'time' || field.control === 'time24') expect(inputs[0].props.placeholder).toBe('HH:MM')
        if (field.placeholder != null) expect(inputs[0].props.placeholder).toBe(field.placeholder)
      }
    }
  })

  it('草稿 ≠ 生效值 → data-dirty 竖条 + 「已改动」徽标；相等则都没有', () => {
    const values = draft({ config: SCHEMA_DEFAULTS })
    const clean = rowOf(renderAllGroups(values), 'port')
    expect(clean.props['data-dirty']).toBeUndefined()
    expect(textOf(clean)).not.toContain('已改动')

    const dirtyValues = draft({ config: SCHEMA_DEFAULTS })
    dirtyValues.port = '9999'
    const dirty = rowOf(renderAllGroups(dirtyValues), 'port')
    expect(dirty.props['data-dirty']).toBe('true')
    expect(textOf(dirty)).toContain('已改动')
  })

  it('生效值 ≠ 默认值 → 「非默认」徽标（快照生效值对照 DEFAULTS）', () => {
    const config = Object.assign({}, SCHEMA_DEFAULTS, { traceEnabled: true, rateLimitPerMinute: 60 })
    const trees = groups.map(group => renderGroup(stubReact, group, {
      draft: draft({ config: config }),
      config: config,
      defaults: client.DEFAULTS,
      t: zhT,
    }))
    const badged = trees.flatMap(tree => byClass(tree as StubElement, 'qqc-row'))
      .filter(row => textOf(row).includes('非默认'))
      .map(row => row.props['data-key'])
    expect(badged.sort()).toEqual(['rateLimitPerMinute', 'traceEnabled'])
    // 默认全空时一个徽标都没有
    expect(renderAllGroups(draft({ config: SCHEMA_DEFAULTS })).some(tree => textOf(tree).includes('非默认'))).toBe(false)
  })

  it('徽标顺序：已改动（brand）→ 非默认（中性）→ 未生效（中性）', () => {
    const config = Object.assign({}, SCHEMA_DEFAULTS, { stickerDir: '' })
    const values = draft({ config: config })
    values.stickerMaxCount = '999' // 已改动 + 依赖未满足
    const row = renderFieldRow(stubReact, allFields.find(field => field.key === 'stickerMaxCount')!, { draft: values, config: config, defaults: client.DEFAULTS })
    const badges = byClass(row, 'qqc-badge').map(badge => textOf(badge))
    expect(badges).toEqual(['已改动', '未生效'])
    expect(byClass(row, 'qqc-badge')[0].props['data-tone']).toBe('brand')
    expect(byClass(row, 'qqc-badge')[1].props['data-tone']).toBeUndefined()
  })

  it('「恢复默认」是图标按钮：aria-label/title 显示默认值，点击只调 onResetField', () => {
    const values = draft({ config: SCHEMA_DEFAULTS })
    values.port = '9999'
    const resets: string[] = []
    const row = renderFieldRow(stubReact, allFields.find(field => field.key === 'port')!, {
      draft: values,
      config: SCHEMA_DEFAULTS,
      defaults: client.DEFAULTS,
      t: zhT,
      onResetField: (field: ClientField) => { resets.push(field.key) },
    })
    const button = byClass(row, 'qqc-btn--icon')[0]
    expect(button.props['aria-label']).toBe('恢复默认值（8643）')
    expect(button.props.title).toBe('恢复默认值（8643）')
    button.props.onClick()
    expect(resets).toEqual(['port'])
    // 已经等于默认值时按钮不出现
    const cleanRow = renderFieldRow(stubReact, allFields.find(field => field.key === 'port')!, {
      draft: draft({ config: SCHEMA_DEFAULTS }), config: SCHEMA_DEFAULTS, defaults: client.DEFAULTS, onResetField: () => {},
    })
    expect(byClass(cleanRow, 'qqc-btn--icon')).toHaveLength(0)
  })

  it('数字控件右侧显示单位，值可换算时追加换算（ms → 分钟；byte → MB）', () => {
    const values = draft({ config: SCHEMA_DEFAULTS })
    const trees = renderAllGroups(values)
    expect(textOf(byClass(rowOf(trees, 'interimRecallMs'), 'qqc-unit')[0])).toBe('毫秒 = 1.5 分钟')
    expect(textOf(byClass(rowOf(trees, 'stickerMaxBytes'), 'qqc-unit')[0])).toBe('字节 = 4 MB')
    expect(textOf(byClass(rowOf(trees, 'typingDelayPerCharMs'), 'qqc-unit')[0])).toBe('毫秒')
    // 0 且语义为关闭/不限：只显示「= 关闭」/「= 不限」
    const zeroValues = draft({ config: SCHEMA_DEFAULTS })
    zeroValues.rateLimitPerMinute = '0'
    zeroValues.dedupWindowSeconds = '0'
    const zeroTrees = renderAllGroups(zeroValues)
    expect(textOf(byClass(rowOf(zeroTrees, 'rateLimitPerMinute'), 'qqc-unit')[0])).toBe('= 不限')
    expect(textOf(byClass(rowOf(zeroTrees, 'dedupWindowSeconds'), 'qqc-unit')[0])).toBe('= 关闭')
  })

  it('开关用 role=switch（不是原生 checkbox），右侧跟「开」/「关」文字', () => {
    const values = draft({ config: SCHEMA_DEFAULTS })
    const row = renderFieldRow(stubReact, allFields.find(field => field.key === 'traceEnabled')!, {
      draft: values, config: SCHEMA_DEFAULTS, defaults: client.DEFAULTS, t: zhT,
    })
    const button = byClass(row, 'qqc-switch')[0]
    expect(button.type).toBe('button')
    expect(button.props.role).toBe('switch')
    expect(button.props['aria-checked']).toBe(false)
    expect(textOf(byClass(row, 'qqc-switch-text')[0])).toBe('关')
  })

  it('路径控件等宽且关掉拼写检查；时间控件用文本框 + HH:MM 占位（不用原生 time）', () => {
    const trees = renderAllGroups(draft({ config: SCHEMA_DEFAULTS }))
    const pathInput = byClass(rowOf(trees, 'workspacePath'), 'qqc-input')[0]
    expect(pathInput.props['data-kind']).toBe('path')
    expect(pathInput.props.spellCheck).toBe(false)
    expect(pathInput.props.type).toBe('text')
    const timeInput = byClass(rowOf(trees, 'groupPeekWindowStart'), 'qqc-input')[0]
    expect(timeInput.props.type).toBe('text')
    expect(timeInput.props['data-kind']).toBe('time')
    expect(timeInput.props.placeholder).toBe('HH:MM')
    expect(byClass(rowOf(trees, 'groupPeekWindowEnd'), 'qqc-input')[0].props['data-kind']).toBe('time24')
  })
})

describe('密钥控件（§4.6）— 永不回显明文', () => {
  it('已设置：状态点 data-state=ok + 「已设置」+ 密码框 value 恒空，树里不含明文', () => {
    const snapshotConfig = Object.assign({}, SCHEMA_DEFAULTS, { accessToken: 'super-secret-token' })
    const redacted = draft({ config: snapshotConfig })
    expect(redacted.accessToken).toBe('') // draftFromSnapshot 脱敏：明文绝不进入草稿
    const trees = renderAllGroups(redacted, { secretSet: true })
    const row = rowOf(trees, 'accessToken')
    expect(byClass(row, 'qqc-dot')[0].props['data-state']).toBe('ok')
    expect(textOf(row)).toContain('已设置')
    const password = walk(row).find(element => element.props.type === 'password')!
    expect(password.props.value).toBe('')
    expect(JSON.stringify(trees)).not.toContain('super-secret-token')
  })

  it('未设置：状态点 data-state=idle + 「未设置」', () => {
    const trees = renderAllGroups(draft({ config: SCHEMA_DEFAULTS }), { secretSet: false })
    const row = rowOf(trees, 'accessToken')
    expect(byClass(row, 'qqc-dot')[0].props['data-state']).toBe('idle')
    expect(textOf(row)).toContain('未设置')
    expect(textOf(row)).toContain('留空 = 不修改')
  })

  it('点「清空」→ 按钮变「撤销清空」+ warn 徽标「保存后将清空」+ 输入框禁用；再点回退', () => {
    const changes: boolean[] = []
    const trees = renderAllGroups(draft({ config: SCHEMA_DEFAULTS }), {
      secretSet: true,
      clearSecret: true,
      onClearSecretChange: (next: boolean) => { changes.push(next) },
      t: zhT,
    })
    const row = rowOf(trees, 'accessToken')
    expect(textOf(row)).toContain('撤销清空')
    expect(textOf(row)).toContain('保存后将清空')
    const willClear = byClass(row, 'qqc-badge').filter(badge => textOf(badge) === '保存后将清空')
    expect(willClear).toHaveLength(1)
    expect(willClear[0].props['data-tone']).toBe('warn')
    const password = walk(row).find(element => element.props.type === 'password')!
    expect(password.props.disabled).toBe(true)
    const button = byClass(row, 'qqc-btn--sm')[0]
    button.props.onClick()
    expect(changes).toEqual([false])

    const cleared = renderAllGroups(draft({ config: SCHEMA_DEFAULTS }), {
      secretSet: true,
      clearSecret: false,
      onClearSecretChange: (next: boolean) => { changes.push(next) },
      t: zhT,
    })
    byClass(rowOf(cleared, 'accessToken'), 'qqc-btn--sm')[0].props.onClick()
    expect(changes).toEqual([false, true])
  })
})

describe('标签列表控件（§4.5）— 回车 / 逗号 / 粘贴 / Backspace', () => {
  const adminField = () => allFields.find(field => field.key === 'adminUsers')!

  it('已有值渲染为 .qqc-tag + × 删除按钮（aria-label=删除 xxx）', () => {
    const values = draft({ config: SCHEMA_DEFAULTS })
    values.adminUsers = ['10001', '10002']
    const removed: Array<[string, number]> = []
    const row = renderFieldRow(stubReact, adminField(), {
      draft: values,
      config: SCHEMA_DEFAULTS,
      defaults: client.DEFAULTS,
      t: zhT,
      onTagRemove: (field: ClientField, index: number) => { removed.push([field.key, index]) },
    })
    const tags = byClass(row, 'qqc-tag')
    expect(tags).toHaveLength(2)
    expect(textOf(tags[0])).toContain('10001')
    const buttons = byClass(row, 'qqc-tag-x')
    expect(buttons[0].props['aria-label']).toBe('删除 10001')
    buttons[1].props.onClick()
    expect(removed).toEqual([['adminUsers', 1]])
  })

  it('回车提交、逗号提交、空输入 Backspace 删最后一项、粘贴含换行的文本拆分提交', () => {
    const commits: string[] = []
    const backspaces: string[] = []
    const row = renderFieldRow(stubReact, adminField(), {
      draft: draft({ config: SCHEMA_DEFAULTS }),
      config: SCHEMA_DEFAULTS,
      defaults: client.DEFAULTS,
      tagInputs: { adminUsers: '123' },
      onTagCommit: (field: ClientField, text: string) => { commits.push(text) },
      onTagBackspace: (field: ClientField) => { backspaces.push(field.key) },
    })
    const input = byClass(row, 'qqc-tags-input')[0]
    let prevented = 0
    const event = (key: string, value: string) => ({
      key,
      currentTarget: { value },
      preventDefault: () => { prevented += 1 },
    })
    input.props.onKeyDown(event('Enter', '123'))
    input.props.onKeyDown(event(',', '456'))
    input.props.onKeyDown(event('Enter', '   ')) // 空串不提交
    expect(commits).toEqual(['123', '456'])
    input.props.onKeyDown(event('Backspace', ''))
    expect(backspaces).toEqual(['adminUsers'])
    expect(prevented).toBe(4) // 回车 / 逗号 / 空回车 / 空输入 Backspace 都拦默认行为
    // 非空输入上的 Backspace 交给浏览器（不删标签）
    input.props.onKeyDown(event('Backspace', 'abc'))
    expect(backspaces).toEqual(['adminUsers'])
    // 粘贴含换行/逗号的文本 → 一次性提交，由纯函数拆分
    let pastePrevented = false
    input.props.onPaste({ clipboardData: { getData: () => 'a,b\nc' }, preventDefault: () => { pastePrevented = true } })
    expect(commits).toEqual(['123', '456', 'a,b\nc'])
    expect(pastePrevented).toBe(true)
    // 粘贴单值不拦截（交给普通输入）
    input.props.onPaste({ clipboardData: { getData: () => 'single' }, preventDefault: () => { pastePrevented = true } })
    expect(commits).toHaveLength(3)
  })

  it('纯函数：parseTagInput 支持回车 / 逗号 / 中文逗号、trim、去空、保序去重', () => {
    const parseTagInput = client.parseTagInput as (text: unknown) => string[]
    expect(parseTagInput('a,b\nc')).toEqual(['a', 'b', 'c'])
    expect(parseTagInput('  a , , b \n\n c ')).toEqual(['a', 'b', 'c'])
    expect(parseTagInput('a\na,b,a')).toEqual(['a', 'b'])
    expect(parseTagInput('a，b')).toEqual(['a', 'b'])
    expect(parseTagInput('')).toEqual([])
    expect(parseTagInput(null)).toEqual([])
    expect(parseTagInput('   ')).toEqual([])
  })

  it('纯函数：appendTags 追加去重、removeTagAt 删除指定项且不改入参', () => {
    const appendTags = client.appendTags as (list: unknown, text: unknown) => string[]
    const removeTagAt = client.removeTagAt as (list: unknown, index: number) => string[]
    expect(appendTags(['a'], 'b,c')).toEqual(['a', 'b', 'c'])
    expect(appendTags(['a'], 'a,b')).toEqual(['a', 'b'])
    expect(appendTags([], ' a , a ')).toEqual(['a'])
    const base = ['a', 'b', 'c']
    expect(removeTagAt(base, 1)).toEqual(['a', 'c'])
    expect(base).toEqual(['a', 'b', 'c']) // 入参未被就地修改
    expect(removeTagAt(base, 99)).toEqual(['a', 'b', 'c'])
    expect(removeTagAt(base, -1)).toEqual(['a', 'b', 'c'])
  })

  it('草稿内部形态是数组，但 computePatch 同时接受数组与旧文本形态（契约不变）', () => {
    const values = draft({ config: SCHEMA_DEFAULTS })
    expect(Array.isArray(values.adminUsers)).toBe(true)
    values.adminUsers = ['10000', '20000']
    expect(compute(values, SCHEMA_DEFAULTS).patch.adminUsers).toEqual(['10000', '20000'])
    values.adminUsers = ' 10000 \n\n 20000 \n'
    expect(compute(values, SCHEMA_DEFAULTS).patch.adminUsers).toEqual(['10000', '20000'])
  })
})

describe('单位换算纯函数（§4.3）', () => {
  const conversion = client.unitConversion as (field: Record<string, unknown>, raw: unknown) => string
  const unitTextOf = client.unitText as (field: Record<string, unknown>, raw: unknown) => string
  const unitLabel = client.unitLabel as (unit?: string) => string

  it('ms：超 1000 显示秒，超 60000 显示分钟（1 位小数、去尾 .0）', () => {
    expect(conversion({ unit: 'ms' }, '90000')).toBe('= 1.5 分钟')
    expect(conversion({ unit: 'ms' }, 60000)).toBe('= 1 分钟')
    expect(conversion({ unit: 'ms' }, 1500)).toBe('= 1.5 秒')
    expect(conversion({ unit: 'ms' }, 80)).toBe('')
    expect(conversion({ unit: 'ms' }, 'abc')).toBe('')
  })

  it('byte 按 1024 进制换算 KB / MB；s/min/h 到 60/60/24 进位', () => {
    expect(conversion({ unit: 'byte' }, 4194304)).toBe('= 4 MB')
    expect(conversion({ unit: 'byte' }, 6144)).toBe('= 6 KB')
    expect(conversion({ unit: 'byte' }, 512)).toBe('')
    expect(conversion({ unit: 's' }, 90)).toBe('= 1.5 分钟')
    expect(conversion({ unit: 'min' }, 90)).toBe('= 1.5 小时')
    expect(conversion({ unit: 'h' }, 30)).toBe('= 1.3 天')
    expect(conversion({ unit: 'day' }, 365)).toBe('')
  })

  it('0 且语义为关闭/不限 → 「= 关闭」/「= 不限」；无单位无换算', () => {
    expect(conversion({ unit: 'byte', zeroMeans: '不限' }, 0)).toBe('= 不限')
    expect(conversion({ unit: 'ms', zeroMeans: '关闭' }, '0')).toBe('= 关闭')
    expect(conversion({ unit: 'byte', zeroMeans: '不限' }, 1)).toBe('')
    expect(conversion({}, 0)).toBe('')
  })

  it('unitText 组合单位与换算；0 值语义优先只显示换算', () => {
    expect(unitTextOf({ unit: 'byte' }, 4194304)).toBe('字节 = 4 MB')
    expect(unitTextOf({ unit: 'byte', zeroMeans: '不限' }, 0)).toBe('= 不限')
    expect(unitTextOf({ unit: 'ms' }, 80)).toBe('毫秒')
    expect(unitTextOf({}, 80)).toBe('')
    expect(unitLabel('perMin')).toBe('条/分钟')
    expect(unitLabel(undefined)).toBe('')
  })

  it('字段表上的 zeroMeans 与 hint 的「0 = 关闭 / 不限」语义一致', () => {
    const fieldOf = (key: string) => allFields.find(field => field.key === key)!
    expect(fieldOf('rateLimitPerMinute').zeroMeans).toBe('不限')
    expect(fieldOf('inboundFileMaxBytes').zeroMeans).toBe('不限')
    expect(fieldOf('dedupWindowSeconds').zeroMeans).toBe('关闭')
    expect(fieldOf('deferredTimeoutMs').zeroMeans).toBe('关闭')
    expect(fieldOf('idleResetHours').zeroMeans).toBe('关闭')
    expect(fieldOf('textImageThreshold').zeroMeans).toBe('关闭')
    // 有单位的数字字段才能换算；零值语义只出现在「0 = 关/不限」的字段上
    for (const field of allFields) {
      if (field.zeroMeans === undefined) continue
      expect(field.type).toBe('number')
      expect(['关闭', '不限']).toContain(field.zeroMeans)
    }
  })
})

describe('搜索与高亮切分纯函数（§5.3）', () => {
  const searchFields = client.searchFields as (query: unknown, groups?: ClientGroup[]) => Array<{ groupId: string; groupTitle: string; field: ClientField; hits: string[] }>
  const highlightSegments = client.highlightSegments as (text: unknown, query: unknown) => Array<{ text: string; hit: boolean }>
  const normalizeQuery = client.normalizeQuery as (query: unknown) => string

  it('匹配 label / key / hint / 子页名 / 卡片名（不区分大小写，中文直接包含）', () => {
    expect(normalizeQuery('  表情 ')).toBe('表情')
    // label 命中
    expect(searchFields('表情包库目录').map(match => match.field.key)).toEqual(['stickerDir'])
    // key 命中
    expect(searchFields('stickerDir').map(match => match.field.key)).toEqual(['stickerDir'])
    expect(searchFields('STICKERDIR').map(match => match.field.key)).toEqual(['stickerDir'])
    // hint 命中
    expect(searchFields('风控').map(match => match.field.key)).toContain('groupSplitLines')
    // 子页名命中（「群聊」是子页名，也是多个卡片名）
    const groupHits = searchFields('群聊')
    expect(groupHits.some(match => match.groupId === 'group')).toBe(true)
    expect(groupHits.filter(match => match.hits.indexOf('group') >= 0).length).toBeGreaterThan(0)
    // 卡片名命中
    expect(searchFields('热闹时看一眼').every(match => match.field.section === '热闹时看一眼' || match.field.key === 'groupPeekEnabled')).toBe(true)
  })

  it('搜索「表情」命中表情包卡片 4 键并带卡片名维度；空查询返回空结果', () => {
    const matches = searchFields('表情')
    expect(matches.map(match => match.field.key)).toEqual(['stickerDir', 'stickerMaxCount', 'stickerMaxBytes', 'stickerDailyMax'])
    expect(matches[1].hits).toContain('section')
    expect(searchFields('')).toEqual([])
    expect(searchFields('   ')).toEqual([])
    expect(searchFields('没有这个设置项')).toEqual([])
  })

  it('高亮切分保序不丢字：拼接结果恒等于原文', () => {
    const segments = highlightSegments('表情包库目录', '表情')
    expect(segments).toEqual([
      { text: '表情', hit: true },
      { text: '包库目录', hit: false },
    ])
    for (const sample of ['aAa bbb AAA', '表情', '', 'x']) {
      const parts = highlightSegments(sample, 'a')
      expect(parts.map(part => part.text).join('')).toBe(sample)
    }
    expect(highlightSegments('abc', '')).toEqual([{ text: 'abc', hit: false }])
    expect(highlightSegments('', 'a')).toEqual([])
  })

  it('含 < > & 的文本切分后仍是文本（不会被当成 HTML）', () => {
    const segments = highlightSegments('<b>&amp; 配置</b>', '配')
    expect(segments.map(part => part.text).join('')).toBe('<b>&amp; 配置</b>')
    const marked = segments.filter(part => part.hit).map(part => part.text)
    expect(marked).toEqual(['配'])
    // bundle 里没有任何 dangerouslySetInnerHTML（高亮一律用 React 元素拼接）
    expect(CLIENT_SOURCE).not.toContain('dangerouslySetInnerHTML')
  })

  it('渲染层的 <mark class="qqc-mark"> 包住命中片段，其余文本原样作为文本节点', () => {
    const field: ClientField = { key: 'x', label: '<b>配置</b>', type: 'string', section: '<i>卡片</i>' }
    const row = renderFieldRow(stubReact, field, { draft: { x: '' }, highlight: '配' })
    const marks = byClass(row, 'qqc-mark')
    expect(marks).toHaveLength(1)
    expect(textOf(marks[0])).toBe('配')
    // 标签里的 <b> 是文本节点，不是元素：树里不存在 type='b' 的元素
    expect(walk(row).some(element => element.type === 'b' || element.type === 'i')).toBe(false)
    expect(textOf(byClass(row, 'qqc-label')[0])).toBe('<b>配置</b>')
  })
})

describe('样式与词条（§6 / §7）', () => {
  it('bundle 里没有任何字面色值（#xxx / rgb( / rgba( / hsl(）', () => {
    expect(CLIENT_SOURCE.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull()
    expect(CLIENT_SOURCE.match(/\brgba?\(/g)).toBeNull()
    expect(CLIENT_SOURCE.match(/\bhsla?\(/g)).toBeNull()
  })

  it('样式全部挂在 qqc- 类名上（旧 obx- 样式已删除），并包含 §6.2 的关键选择器', () => {
    const css = client.CSS as string
    expect(css).not.toContain('obx-')
    expect(CLIENT_SOURCE).not.toContain('"obx-')
    expect(CLIENT_SOURCE).not.toContain('obx-panel')
    for (const selector of [
      '.qqc-root{', '.qqc-header', '.qqc-body', '.qqc-nav-item[aria-current=page]', '.qqc-row[data-dirty]',
      '.qqc-row[data-inactive]', '.qqc-switch[aria-checked=true]', '.qqc-tags', '.qqc-btn[data-variant=primary]',
      '.qqc-savebar', '.qqc-banner[data-tone=error]', '.qqc-empty', '.qqc-mark', '@container qqc (max-width:720px)',
      '.qqc-root[data-embedded] .qqc-header{display:none}',
    ]) {
      expect(css, `样式缺少 ${selector}`).toContain(selector)
    }
    // 颜色只用宿主令牌
    expect(css).toContain('var(--dsw-alias-brand-primary)')
    expect(css).toContain('color-mix(in srgb,')
  })

  it('词条：zh / en key 集一致，导航文案改为「QQ 陪伴」，旧骨架词条已删除', () => {
    const zh = client.zh as Record<string, string>
    const en = client.en as Record<string, string>
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
    expect(zh['settings.nav']).toBe('QQ 陪伴')
    expect(en['settings.nav']).toBe('QQ Companion')
    expect(zh['settings.title']).toBe('QQ 陪伴')
    for (const stale of ['settings.loading', 'settings.reload', 'settings.reset', 'effect.hint', 'effect.entryInactive', 'status.error', 'revision.label']) {
      expect(zh[stale], `旧词条 ${stale} 应删除`).toBeUndefined()
    }
    // §7 里本任务用到的骨架文案都在
    for (const key of [
      'settings.desc', 'search.placeholder', 'search.results', 'search.empty', 'filter.changed', 'filter.empty',
      'badge.dirty', 'badge.nonDefault', 'badge.inactive', 'badge.willClear', 'field.resetDefault',
      'secret.set', 'secret.unset', 'secret.placeholder', 'secret.clear', 'secret.undoClear',
      'tags.placeholder', 'tags.remove', 'switch.on', 'switch.off', 'workspace.fill', 'workspace.choose',
      'save.summary', 'save.revert', 'save.submit', 'save.saving', 'save.done', 'load.error', 'load.retry', 'entry.inactive',
    ]) {
      expect(zh[key], `缺少词条 ${key}`).toBeTruthy()
      expect(en[key], `缺少英文词条 ${key}`).toBeTruthy()
    }
  })
})

describe('子页视图（§2 布局 / §4.13 加载与空态 / §5.3 筛选）', () => {
  it('根节点 .qqc-root + 页头（标题 / 副标题 / idle 状态胶囊）', () => {
    const view = SettingsView(viewProps())
    expect(hasClass(view, 'qqc-root')).toBe(true)
    expect(view.props['data-embedded']).toBeUndefined()
    const header = byClass(view, 'qqc-header')[0]
    expect(header).toBeDefined()
    expect(textOf(byClass(header, 'qqc-title')[0])).toBe('QQ 陪伴')
    expect(textOf(byClass(header, 'qqc-subtitle')[0])).toContain('cordis.patch.yml')
    const dot = byClass(header, 'qqc-dot')[0]
    expect(dot.props['data-state']).toBe('idle')
    expect(textOf(byClass(header, 'qqc-conn')[0])).toBe('QQ 号 2564812526')
  })

  it('botQQ 未配置时不显示连接胶囊', () => {
    const view = SettingsView(viewProps({ botQQ: '' }))
    expect(byClass(view, 'qqc-conn')).toHaveLength(0)
  })

  it('主体两栏：左导航（搜索 + 只看已改动 + 概览 + 10 个子页），右内容（标题 / 副标题 / 卡片）', () => {
    const view = SettingsView(viewProps())
    const body = byClass(view, 'qqc-body')[0]
    const nav = byClass(body, 'qqc-nav')[0]
    expect(byClass(nav, 'qqc-search')).toHaveLength(1)
    expect(byClass(nav, 'qqc-filter')).toHaveLength(1)
    const items = byClass(nav, 'qqc-nav-item')
    // §1.2：概览恒排第一（不含配置键），其余 10 个子页即 SETTINGS_GROUPS 的分组。
    expect(items).toHaveLength(11)
    expect(items.map(item => item.props['data-page'])).toEqual(['overview', ...groups.map(group => group.id)])
    expect(items.map(item => textOf(byClass(item, 'qqc-nav-label')[0]))).toEqual(['概览', ...groups.map(group => group.title)])
    const main = byClass(body, 'qqc-main')[0]
    expect(textOf(byClass(main, 'qqc-page-title')[0])).toBe('连接')
    expect(textOf(byClass(main, 'qqc-page-desc')[0])).toBe(groups[0].desc)
    const cards = byClass(main, 'qqc-card')
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.map(card => card.props['data-section'])).toEqual(['NapCat 连接', '工作区'])
    expect(byClass(main, 'qqc-card-title').map(title => textOf(title))).toEqual(['NapCat 连接', '工作区'])
  })

  it('当前子页 aria-current=page；其它子页没有；点击导航项切页', () => {
    const changes: string[] = []
    const view = SettingsView(viewProps({ page: 'memory', onPageChange: (next: string) => { changes.push(next) } }))
    const items = byClass(view, 'qqc-nav-item')
    const current = items.filter(item => item.props['aria-current'] === 'page')
    expect(current).toHaveLength(1)
    expect(current[0].props['data-page']).toBe('memory')
    // 首项是「概览」（§1.2：导航顺序第一）。
    expect(items[0].props['data-page']).toBe('overview')
    items[1].props.onClick()
    expect(changes).toEqual(['connection'])
  })

  it('导航项右侧显示该子页的已改动计数（没有改动则不显示）', () => {
    const values = draft({ config: SCHEMA_DEFAULTS })
    values.port = '9999'
    values.port = '9998'
    values.host = '10.0.0.1'
    const view = SettingsView(viewProps({ draft: values }))
    const items = byClass(view, 'qqc-nav-item')
    const connectionItem = items.find(item => item.props['data-page'] === 'connection')!
    expect(textOf(byClass(connectionItem, 'qqc-count')[0])).toBe('2')
    const memoryItem = items.find(item => item.props['data-page'] === 'memory')!
    expect(byClass(memoryItem, 'qqc-count')).toHaveLength(0)
  })

  it('导航列表 ↑↓ 移动焦点（Enter/Space 由按钮原生处理）', () => {
    const view = SettingsView(viewProps())
    const list = byClass(view, 'qqc-nav-list')[0]
    const focused: number[] = []
    const items = [0, 1, 2].map(index => ({ focus() { focused.push(index) } }))
    let prevented = 0
    const fire = (key: string, from: number) => list.props.onKeyDown({
      key,
      target: items[from],
      currentTarget: { querySelectorAll: () => items },
      preventDefault: () => { prevented += 1 },
    })
    fire('ArrowDown', 0)
    fire('ArrowDown', 2)
    fire('ArrowUp', 0)
    fire('Enter', 1)
    expect(focused).toEqual([1, 0, 2])
    expect(prevented).toBe(3) // Enter 不拦截
  })

  it('加载中显示 3 张骨架（高度 120 / 88 / 152），不渲染内容卡片', () => {
    const view = SettingsView(viewProps({ loading: true, draft: null, config: null }))
    const skeletons = byClass(view, 'qqc-skeleton')
    expect(skeletons).toHaveLength(3)
    expect(skeletons.map(item => (item.props.style as Record<string, string>).height)).toEqual(['120px', '88px', '152px'])
    expect(byClass(view, 'qqc-card')).toHaveLength(0)
  })

  it('加载失败：error 横幅 + 「重试」按钮可回调', () => {
    let retried = 0
    const view = SettingsView(viewProps({ error: '连接中断', draft: null, config: null, onRetry: () => { retried += 1 } }))
    const banner = byClass(view, 'qqc-banner')[0]
    expect(banner.props['data-tone']).toBe('error')
    expect(textOf(banner)).toContain('加载设置失败')
    expect(textOf(banner)).toContain('连接中断')
    const retry = walk(banner).find(element => element.type === 'button')!
    retry.props.onClick()
    expect(retried).toBe(1)
  })

  it('插件条目未激活：顶部 warn 横幅', () => {
    const view = SettingsView(viewProps({ entryActive: false }))
    const warn = byClass(view, 'qqc-banner').find(banner => banner.props['data-tone'] === 'warn')!
    expect(warn).toBeDefined()
    expect(textOf(warn)).toContain('未激活')
  })

  it('embedded 模式：不渲染页头，根节点带 data-embedded', () => {
    const view = SettingsView(viewProps({ embedded: true }))
    expect(view.props['data-embedded']).toBe('true')
    expect(byClass(view, 'qqc-header')).toHaveLength(0)
    expect(byClass(view, 'qqc-nav-item')).toHaveLength(11) // 导航照常（概览 + 10 个子页）
  })

  it('保存条：有改动才出现，显示「已修改 N 项」+ 还原 + 保存', () => {
    const clean = SettingsView(viewProps())
    expect(byClass(clean, 'qqc-savebar')).toHaveLength(0)

    const values = draft({ config: SCHEMA_DEFAULTS })
    values.port = '9999'
    const events: string[] = []
    const pages: string[] = []
    const view = SettingsView(viewProps({
      draft: values,
      onSave: () => { events.push('save') },
      onRevert: () => { events.push('revert') },
      onPageChange: (next: string) => { pages.push(next) },
    }))
    const savebar = byClass(view, 'qqc-savebar')[0]
    expect(textOf(savebar)).toContain('已修改')
    // §4.11 完整版：总数 + 按子页统计（子页名是可点跳转的链接按钮）
    expect(textOf(byClass(savebar, 'qqc-savebar-text')[0])).toBe('已修改 1 项 · 连接 1')
    expect(byClass(savebar, 'qqc-savebar-text')[0].children.some(child => (child as StubElement).type === 'strong')).toBe(true)
    const groupLinks = byClass(savebar, 'qqc-link')
    expect(groupLinks.map(link => textOf(link))).toEqual(['连接'])
    groupLinks[0].props.onClick()
    expect(pages).toEqual(['connection'])
    const buttons = walk(savebar).filter(element => element.type === 'button' && !hasClass(element, 'qqc-link'))
    expect(buttons.map(button => textOf(button))).toEqual(['还原', '保存'])
    expect(buttons[1].props['data-variant']).toBe('primary')
    buttons[0].props.onClick()
    buttons[1].props.onClick()
    expect(events).toEqual(['revert', 'save'])
  })

  it('保存中：按钮文案变「正在保存…」并禁用', () => {
    const values = draft({ config: SCHEMA_DEFAULTS })
    values.port = '9999'
    const view = SettingsView(viewProps({ draft: values, busy: true }))
    const buttons = walk(byClass(view, 'qqc-savebar')[0]).filter(element => element.type === 'button' && !hasClass(element, 'qqc-link'))
    expect(textOf(buttons[1])).toBe('正在保存…')
    expect(buttons[1].props.disabled).toBe(true)
    expect(buttons[0].props.disabled).toBe(true)
  })

  it('搜索：按子页分组的结果、组标题可点击跳转、命中文字高亮、空态', () => {
    const changes: string[] = []
    const view = SettingsView(viewProps({ query: '表情', onPageChange: (next: string) => { changes.push(next) } }))
    expect(textOf(byClass(view, 'qqc-page-title')[0])).toBe('搜索结果')
    const resultGroups = byClass(view, 'qqc-result-group')
    expect(resultGroups).toHaveLength(1)
    expect(resultGroups[0].props['data-group']).toBe('media')
    expect(byClass(resultGroups[0], 'qqc-row')).toHaveLength(4)
    const marks = byClass(resultGroups[0], 'qqc-mark')
    expect(marks.length).toBeGreaterThan(0)
    expect(marks.every(mark => textOf(mark) === '表情')).toBe(true)
    const link = byClass(resultGroups[0], 'qqc-link')[0]
    expect(textOf(link)).toBe('媒体与语音')
    link.props.onClick()
    expect(changes).toEqual(['media'])
    // 无结果 → 空态
    const empty = SettingsView(viewProps({ query: '不存在的设置项' }))
    expect(byClass(empty, 'qqc-empty')).toHaveLength(1)
    expect(textOf(byClass(empty, 'qqc-empty')[0])).toContain('没有匹配')
    expect(textOf(byClass(empty, 'qqc-empty')[0])).toContain('不存在的设置项')
  })

  it('「只看已改动」：只留已改动 / 非默认的行，空卡片整张隐藏，全页为空显示空态', () => {
    // 全默认 → 整页空态
    const emptyView = SettingsView(viewProps({ changedOnly: true, page: 'diagnostics' }))
    expect(byClass(emptyView, 'qqc-empty')).toHaveLength(1)
    expect(textOf(byClass(emptyView, 'qqc-empty')[0])).toBe('这一页都是默认值')

    // connection 有一条改动 → 只渲染那一行，所在卡片保留、其它卡片隐藏
    const values = draft({ config: SCHEMA_DEFAULTS })
    values.port = '9999'
    const view = SettingsView(viewProps({ changedOnly: true, draft: values, page: 'connection' }))
    const cards = byClass(view, 'qqc-card')
    expect(cards).toHaveLength(1)
    expect(cards[0].props['data-section']).toBe('NapCat 连接')
    const rows = byClass(view, 'qqc-row').filter(row => row.props['data-key'] != null)
    expect(rows.map(row => row.props['data-key'])).toEqual(['port'])
  })

  it('只看已改动但生效值非默认时，该行也算「已改动」可见', () => {
    const config = Object.assign({}, SCHEMA_DEFAULTS, { logLevel: 'debug' })
    const view = SettingsView(viewProps({ changedOnly: true, page: 'diagnostics', config: config, draft: draft({ config: config }) }))
    const rows = byClass(view, 'qqc-row').filter(row => row.props['data-key'] != null)
    expect(rows.map(row => row.props['data-key'])).toEqual(['logLevel'])
  })
})

describe('workspace 选择器（§4.8）— 三态语义', () => {
  const fillWorkspacePath = client.fillWorkspacePath as (draft: Record<string, unknown>, path: string) => Record<string, unknown>

  function pickerOpts(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      loaded: true,
      available: true,
      workspaces: [
        { id: 'ws-1', path: '/vol2/ws/alpha', sessionCount: 3 },
        { id: 'ws-2', path: '/vol2/ws/beta', sessionCount: 0 },
      ],
      selectedId: '',
      disabled: false,
      t: zhT,
      onSelectedChange: () => {},
      onApply: () => {},
      ...overrides,
    }
  }

  it('未拉取不渲染；registry 缺席 / 列表为空只渲染一句说明（无下拉与按钮）', () => {
    expect(renderPicker(stubReact, pickerOpts({ loaded: false }))).toBeNull()
    const unavailable = renderPicker(stubReact, pickerOpts({ available: false, workspaces: [] }))!
    expect(textOf(unavailable)).toContain('无法获取 workspace 列表')
    expect(walk(unavailable).filter(element => element.type === 'select' || element.type === 'button')).toHaveLength(0)
    const empty = renderPicker(stubReact, pickerOpts({ available: true, workspaces: [] }))!
    expect(textOf(empty)).toContain('暂无 workspace 记录')
    expect(walk(empty).filter(element => element.type === 'select' || element.type === 'button')).toHaveLength(0)
  })

  it('正常态：select（value=id，label=path（N 会话））+「填入」按钮；未选中禁用', () => {
    const node = renderPicker(stubReact, pickerOpts())!
    expect(node.props['data-role']).toBe('workspace-picker')
    const select = walk(node).find(element => element.type === 'select')!
    expect(select.props['aria-label']).toBe('快速填入 workspace')
    const options = (select.children as StubElement[]).map(option => option.props.value)
    expect(options).toEqual(['', 'ws-1', 'ws-2'])
    expect((select.children as StubElement[]).map(option => textOf(option))).toEqual(['选择已有工作区…', '/vol2/ws/alpha（3 会话）', '/vol2/ws/beta（0 会话）'])
    const button = walk(node).find(element => element.type === 'button')!
    expect(button.props.disabled).toBe(true)
    expect(textOf(button)).toBe('填入')
    const selected = renderPicker(stubReact, pickerOpts({ selectedId: 'ws-1' }))!
    expect(walk(selected).find(element => element.type === 'button')!.props.disabled).toBe(false)
    expect(textOf(selected)).toContain('保存后才对新会话生效')
  })

  it('「填入」只调 onApply(选中 path)，不碰其它回调；面板接线 onApply=setDraft(fillWorkspacePath(...))', () => {
    const applied: unknown[] = []
    const selectedChanges: unknown[] = []
    const node = renderPicker(stubReact, pickerOpts({
      selectedId: 'ws-2',
      onApply: (path: string) => { applied.push(path) },
      onSelectedChange: (id: string) => { selectedChanges.push(id) },
    }))!
    walk(node).find(element => element.type === 'button')!.props.onClick()
    expect(applied).toEqual(['/vol2/ws/beta'])
    expect(selectedChanges).toEqual([])
    // 面板源码接线钉住：onApply 唯一动作是写草稿（fillWorkspacePath），结构上无保存调用。
    expect(CLIENT_SOURCE).toContain('setDraft(fillWorkspacePath(draft, path))')
    const base = draft({ config: SCHEMA_DEFAULTS })
    base.botQQ = '10001'
    const filled = fillWorkspacePath(base, '/vol2/ws/alpha')
    expect(filled).toEqual({ ...base, workspacePath: '/vol2/ws/alpha' })
    expect(base.workspacePath).toBe('')
    expect(filled).not.toBe(base)
    expect(fillWorkspacePath(base, undefined as unknown as string).workspacePath).toBe('')
  })

  it('renderGroup 经 renderExtraRow 把选择器挂在 workspacePath 行之后；字段行计数不变', () => {
    const connection = groups.find(group => group.id === 'connection')!
    const render = (opts: Record<string, unknown>) => renderGroup(stubReact, connection, Object.assign({
      draft: draft({ config: SCHEMA_DEFAULTS }),
      config: SCHEMA_DEFAULTS,
      defaults: client.DEFAULTS,
      t: zhT,
    }, opts)) as StubElement[]
    expect(byRole(render({}), 'workspace-picker')).toHaveLength(0)
    const withPicker = render({
      renderExtraRow: (field: ClientField) => field.key === 'workspacePath' ? renderPicker(stubReact, pickerOpts({ selectedId: 'ws-1' })) : null,
    })
    // 卡片是 .qqc-main 的直接子项（每组 2 张卡片：NapCat 连接 / 工作区）
    expect(withPicker).toHaveLength(2)
    expect(byClass(withPicker, 'qqc-row').filter(row => row.props['data-key'] != null)).toHaveLength(connection.fields.length)
    expect(byRole(withPicker, 'workspace-picker')).toHaveLength(1)
    // 选择器正好在 workspacePath 行之后（同一张卡片里、attachWorkspaceMode 之前）
    const card = byClass(withPicker, 'qqc-card').find(item => item.props['data-section'] === '工作区')!
    const order = walk(card)
      .map(element => String(element.props['data-key'] == null ? (element.props['data-role'] == null ? '' : element.props['data-role']) : element.props['data-key']))
      .filter(key => key !== '')
    expect(order).toEqual(['workspacePath', 'workspace-picker', 'attachWorkspaceMode'])
  })

  it('填入后仍走显式保存通道：computePatch 只产出 workspacePath 键', () => {
    const base = draft({ config: SCHEMA_DEFAULTS })
    const filled = fillWorkspacePath(base, '/vol2/ws/alpha')
    expect(compute(filled, SCHEMA_DEFAULTS).patch).toEqual({ workspacePath: '/vol2/ws/alpha' })
    expect(compute(fillWorkspacePath(base, ''), SCHEMA_DEFAULTS).patch).toEqual({})
  })
})

describe('客户端 bundle — 保存语义（updateSettings(patch, expectedRevision) 入参构造）', () => {
  it('仅下发与生效值有差异的键（102 键任意子集）', () => {
    const values = draft({ config: SCHEMA_DEFAULTS })
    values.port = '9999'
    values.dmPolicy = 'allowlist'
    values.groupAllowFrom = ['111', '222']
    const { patch, invalidKeys } = compute(values, SCHEMA_DEFAULTS)
    expect(invalidKeys).toEqual([])
    expect(patch).toEqual({ port: 9999, dmPolicy: 'allowlist', groupAllowFrom: ['111', '222'] })
  })

  it('无差异时 patch 为空对象（no-op 短路，host 不递增 revision）', () => {
    const values = draft({ config: SCHEMA_DEFAULTS })
    const { patch } = compute(values, SCHEMA_DEFAULTS, { secretDraft: '', clearSecret: false })
    expect(patch).toEqual({})
  })

  it('accessToken 三态：留空 = 不修改；输入 = 明文写入；清空 = 下发空串', () => {
    const values = draft({ config: SCHEMA_DEFAULTS })
    expect(compute(values, SCHEMA_DEFAULTS, { secretDraft: '', clearSecret: false }).patch.accessToken).toBeUndefined()
    expect(compute(values, SCHEMA_DEFAULTS, { secretDraft: 'new-token', clearSecret: false }).patch.accessToken).toBe('new-token')
    expect(compute(values, SCHEMA_DEFAULTS, { secretDraft: '', clearSecret: true }).patch.accessToken).toBe('')
  })

  it('数字字段非法输入不进 patch 且单独报告（host validatePatch 二次校验兜底）', () => {
    const values = draft({ config: SCHEMA_DEFAULTS })
    values.interimRecallMs = 'abc'
    values.rateLimitPerMinute = '45'
    const { patch, invalidKeys } = compute(values, SCHEMA_DEFAULTS)
    expect(invalidKeys).toEqual(['interimRecallMs'])
    expect(patch).toEqual({ rateLimitPerMinute: 45 })
    expect(patch.interimRecallMs).toBeUndefined()
  })

  it('数字文本按数字写入（不变成字符串）', () => {
    const values = draft({ config: SCHEMA_DEFAULTS })
    values.port = '9999'
    const { patch } = compute(values, SCHEMA_DEFAULTS)
    expect(patch.port).toBe(9999)
    expect(typeof patch.port).toBe('number')
  })
})

describe('诊断子页 — 7 键（日志级别 / 审计 / 追踪 / 去重 / 出站审计）', () => {
  const diagnosticsGroup = groups.find((group) => group.id === 'diagnostics')!

  it('键集与键序逐字对齐 host SETTINGS_GROUPS.diagnostics（不写死键列表）', () => {
    expect(diagnosticsGroup.fields.map((field) => field.key)).toEqual([...SETTINGS_GROUPS.diagnostics])
    expect(diagnosticsGroup.title).toBe('诊断')
  })

  it('每个键：中文标签且 hint 不带配置键名尾巴；label 与 §3.10 一致', () => {
    for (const field of diagnosticsGroup.fields) {
      expect(field.label).toMatch(/\p{Script=Han}/u)
      if (field.hint !== undefined) expect(field.hint).not.toContain('（配置键')
    }
    expect(diagnosticsGroup.fields.map((field) => field.label)).toEqual([
      '控制台日志级别',
      '工具发送审计',
      '决策追踪（trace）',
      '追踪级别',
      '消息去重窗口',
      '忽略自己发出的消息',
      '出站敏感内容正则',
    ])
  })

  it('诊断键默认值与 host SCHEMA_DEFAULTS 一致；布尔键走 switch、traceLevel 依赖 traceEnabled', () => {
    const defaults = client.DEFAULTS as Record<string, unknown>
    expect(defaults.actionAuditEnabled).toBe(true)
    expect(defaults.traceEnabled).toBe(false)
    expect(defaults.logLevel).toBe('info')
    expect(defaults.dedupWindowSeconds).toBe(300)
    expect(defaults.ignoreSelf).toBe(true)
    expect(client.DEFAULTS).toEqual(SCHEMA_DEFAULTS)

    const values = draft({ config: SCHEMA_DEFAULTS })
    values.traceEnabled = true
    values.actionAuditEnabled = false
    expect(compute(values, SCHEMA_DEFAULTS).patch).toEqual({ traceEnabled: true, actionAuditEnabled: false })
    const traceLevel = diagnosticsGroup.fields.find(field => field.key === 'traceLevel')!
    expect(traceLevel.dependsOn!(draft({ config: Object.assign({}, SCHEMA_DEFAULTS, { traceEnabled: true }) }))).toBe(true)
    expect(traceLevel.dependsOn!(draft({ config: SCHEMA_DEFAULTS }))).toBe(false)
    const updateSettings = descriptors[1] as { parameters: Array<{ codec: { schema: { parse(value: unknown): unknown } } }> }
    const patchCodec = updateSettings.parameters[0].codec.schema
    expect(patchCodec.parse({ actionAuditEnabled: false, traceEnabled: true })).toEqual({ actionAuditEnabled: false, traceEnabled: true })
    expect(() => patchCodec.parse({ traceEnabled: 'yes' })).toThrow()
    expect(() => patchCodec.parse({ logLevel: 'verbose' })).toThrow()
  })
})

describe('媒体与语音子页 — 表情包卡片 4 键（留空 = 关闭 的语义）', () => {
  const mediaGroup = groups.find((group) => group.id === 'media')!
  const stickerFields = mediaGroup.fields.filter((field) => field.section === '表情包库')

  it('表情包卡片是子页第一张卡片，4 键顺序对齐 host SETTINGS_GROUPS.media 前四位', () => {
    expect(stickerFields.map((field) => field.key)).toEqual(['stickerDir', 'stickerMaxCount', 'stickerMaxBytes', 'stickerDailyMax'])
    expect([...SETTINGS_GROUPS.media].slice(0, 4)).toEqual(stickerFields.map((field) => field.key))
    expect(mediaGroup.fields[0].section).toBe('表情包库')
  })

  it('stickerDir 写明留空=关闭与目录示例；stickerMaxBytes 单位是字节、依赖目录', () => {
    const dir = stickerFields.find((field) => field.key === 'stickerDir')!
    expect(dir.type).toBe('string')
    expect(dir.control).toBe('path')
    expect(dir.hint).toContain('留空 = 关闭')
    expect(dir.hint).toContain('stickers')
    const defaults = client.DEFAULTS as Record<string, unknown>
    expect(defaults.stickerDir).toBe('')
    expect(defaults.stickerMaxBytes).toBe(4 * 1024 * 1024)
    const bytes = stickerFields.find((field) => field.key === 'stickerMaxBytes')!
    expect(bytes.type).toBe('number')
    expect(bytes.unit).toBe('byte')
    for (const field of stickerFields) {
      expect(field.label).toMatch(/\p{Script=Han}/u)
      if (field.key !== 'stickerDir') expect(field.dependsOnText).toContain('表情包库目录')
    }
    const updateSettings = descriptors[1] as { parameters: Array<{ codec: { schema: { parse(value: unknown): unknown } } }> }
    expect(updateSettings.parameters[0].codec.schema.parse({ stickerDir: 'E:\\stickers', stickerMaxBytes: 4194304 })).toEqual({ stickerDir: 'E:\\stickers', stickerMaxBytes: 4194304 })
  })
})

describe('卡片上的固定说明（§3.8 定时任务 / §3.9 纠错表）', () => {
  const groupOf = (id: string) => groups.find(group => group.id === id)!

  it('语音转写卡片底部说明 sttReplacements 去哪里编辑', () => {
    const tree = renderGroup(stubReact, groupOf('media'), {
      draft: draft({ config: SCHEMA_DEFAULTS }),
      config: SCHEMA_DEFAULTS,
      defaults: client.DEFAULTS,
      t: zhT,
    })!
    const foot = byClass(tree, 'qqc-card-foot')
    expect(foot).toHaveLength(1)
    expect(textOf(foot[0])).toContain('sttReplacements')
    // 说明挂在「语音转写」卡片里，不是新卡片
    const card = byClass(tree, 'qqc-card').find(item => item.props['data-section'] === '语音转写')!
    expect(byClass(card, 'qqc-card-foot')).toHaveLength(1)
  })

  it('定时任务是一张只读卡片（F3 之前给去 cordis.patch.yml 编辑的提示）', () => {
    const tree = renderGroup(stubReact, groupOf('proactive'), {
      draft: draft({ config: SCHEMA_DEFAULTS }),
      config: SCHEMA_DEFAULTS,
      defaults: client.DEFAULTS,
      t: zhT,
    })!
    const sections = byClass(tree, 'qqc-card').map(card => card.props['data-section'])
    expect(sections).toContain('定时任务')
    expect(textOf(tree)).toContain('scheduledPrompts')
  })

  it('「只看已改动」过滤时不显示这些只读说明', () => {
    const values = draft({ config: SCHEMA_DEFAULTS })
    values.stickerDir = 'E:\\stickers'
    const tree = renderGroup(stubReact, groupOf('media'), {
      draft: values,
      config: SCHEMA_DEFAULTS,
      defaults: client.DEFAULTS,
      onlyChanged: true,
      t: zhT,
    })!
    expect(byClass(tree, 'qqc-card-foot')).toHaveLength(0)
    expect(byClass(tree, 'qqc-row').filter(row => row.props['data-key'] != null)).toHaveLength(1)
  })
})

describe('失败守卫（客户端侧）— host edit-failed 中文错误可渲染且不误判为冲突', () => {
  const unwrap = client.unwrap as (result: unknown) => unknown
  const isConflictError = client.isConflictError as (cause: unknown) => boolean

  it('unwrap({ok:false}) 保留 code 与中文 message（面板错误横幅直接可渲染）', () => {
    const rendered = '写入失败：配置文件被其他写入方占用（等待文件锁超时），本次修改未落盘，请稍后重试'
    let caught: unknown
    try {
      unwrap({ ok: false, error: { code: 'onebot-settings/edit-failed', message: rendered } })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toBe(rendered)
    expect((caught as { code?: string }).code).toBe('onebot-settings/edit-failed')
  })

  it('edit-failed 不匹配冲突通道（isConflictError=false）', () => {
    const cause = { code: 'onebot-settings/edit-failed', message: '写入失败：宿主 configEditor 拒绝了本次修改' }
    expect(isConflictError(cause)).toBe(false)
    expect(isConflictError({ code: 'onebot-settings/conflict', message: 'expectedRevision mismatch' })).toBe(true)
  })
})

describe('changeKeys — 保存条 / 导航计数的数据源', () => {
  const changeKeys = client.changeKeys as (draft: Record<string, unknown> | null, config: Record<string, unknown> | null, clearSecret?: boolean) => string[]

  it('默认草稿没有改动键；改值后出现；非法数字也算改动（保存要被拦下）', () => {
    const clean = draft({ config: SCHEMA_DEFAULTS })
    expect(changeKeys(clean, SCHEMA_DEFAULTS)).toEqual([])
    const values = draft({ config: SCHEMA_DEFAULTS })
    values.port = '9999'
    values.interimRecallMs = 'abc'
    const keys = changeKeys(values, SCHEMA_DEFAULTS)
    expect(keys.sort()).toEqual(['interimRecallMs', 'port'])
  })

  it('清空密钥算一条改动（patch 里 accessToken = ""）', () => {
    expect(changeKeys(draft({ config: SCHEMA_DEFAULTS }), SCHEMA_DEFAULTS, true)).toEqual(['accessToken'])
  })
})