/**
 * 定时任务表（T25：结构化列表控件）的客户端测试。
 *
 * 覆盖：
 *   ① 渲染：有两条任务时逐行回显时间/目标/短名/内容/两个开关；空列表给引导文案；
 *   ② 交互：添加一条（默认 id p3、时间 09:00）、编辑内容只改该行、删除只去掉该行；
 *   ③ 保存路径：多一条时 patch 只有 scheduledPrompts；没改动时 patch 为空；
 *      半成品行（目标还是空的）**不会被 coerce 悄悄丢掉**，而是由 validateDraft 拦住；
 *   ④ 旧宿主兼容：快照里没有 scheduledPrompts 时整块只读。
 *
 * 客户端从源码内存构建（`tests/client-bundle.ts`），不读共享 lib 产物。
 *
 * @module dsh-qq-companion-pro/tests/client-schedule-list
 */
import { buildClientSource } from './client-bundle.js'

import { describe, expect, it } from 'vitest'

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
function rowOf(tree: unknown, key: string): StubElement {
  const found = walk(tree).filter(element => hasClass(element, 'qqc-row') && element.props['data-key'] === key)
  expect(found.length, `缺少 ${key} 的行`).toBe(1)
  return found[0]
}

/** CJS 包裹装载（与宿主装载协议一致，只注入 react）。 */
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
  if (factory === undefined) throw new Error('客户端 bundle 未注册 dsh-qq-companion-pro 模块')
  return factory((spec: string) => {
    if (spec !== 'react') throw new Error(`unexpected external require: ${spec}`)
    return reactImpl
  }) as Record<string, unknown>
}

const client = loadClient({ createElement: createElementStub })
const DEFAULTS = client.DEFAULTS as Record<string, unknown>
const SettingsView = client.SettingsView as (props: Record<string, unknown>) => StubElement
const draftFromSnapshot = client.draftFromSnapshot as (snapshot: { config: Record<string, unknown> }) => Record<string, unknown>
const computePatch = client.computePatch as (
  draft: Record<string, unknown>,
  config: Record<string, unknown>,
  opts?: { secretDraft?: string; clearSecret?: boolean },
) => { patch: Record<string, unknown>; invalidKeys: string[] }
const validateDraft = client.validateDraft as (draft: Record<string, unknown>) => Record<string, string>
const zh = client.zh as Record<string, string>

type Entry = { id: string; time: string; chatId: string; prompt: string; includeTodayLog: boolean; includeGroupLogs: boolean }

const ENTRIES: Entry[] = [
  { id: 'p1', time: '09:00', chatId: 'private:10001', prompt: '写日记', includeTodayLog: false, includeGroupLogs: false },
  { id: 'p2', time: '21:30', chatId: 'group:20001', prompt: '总结群聊', includeTodayLog: true, includeGroupLogs: true },
]

function configWith(entries: Entry[]): Record<string, unknown> {
  return Object.assign({}, SCHEMA_DEFAULTS, { scheduledPrompts: entries.map(entry => Object.assign({}, entry)) })
}
function draftWith(entries: Entry[]): Record<string, unknown> {
  return draftFromSnapshot({ config: configWith(entries) })
}
function viewProps(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const config = configWith(ENTRIES)
  return Object.assign({
    t: (key: string) => (zh[key] != null ? zh[key] : key),
    page: 'conversation',
    query: '',
    changedOnly: false,
    draft: draftWith(ENTRIES),
    config: config,
    botQQ: '10002',
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

describe('定时任务表：渲染', () => {
  it('逐行回显时间、目标、短名、内容和两个开关', () => {
    const tree = SettingsView(viewProps())
    const row = rowOf(tree, 'scheduledPrompts')
    expect(byClass(row, 'qqc-sched-row')).toHaveLength(2)
    expect(byClass(row, 'qqc-sched-time').map(element => element.props.value)).toEqual(['09:00', '21:30'])
    expect(byClass(row, 'qqc-sched-target').map(element => element.props.value))
      .toEqual(['private:10001', 'group:20001'])
    expect(byClass(row, 'qqc-sched-id').map(element => element.props.value)).toEqual(['p1', 'p2'])
    expect(byClass(row, 'qqc-sched-prompt').map(element => String(element.props.value))).toEqual(['写日记', '总结群聊'])
    const boxes = byClass(row, 'qqc-sched-flag').flatMap(label => walk(label).filter(element => element.props.type === 'checkbox'))
    expect(boxes.map(box => box.props.checked)).toEqual([false, false, true, true])
  })

  it('空列表显示引导文案，并保留添加按钮', () => {
    const tree = SettingsView(viewProps({ draft: draftWith([]) }))
    const row = rowOf(tree, 'scheduledPrompts')
    expect(byClass(row, 'qqc-sched-row')).toHaveLength(0)
    expect(textOf(byClass(row, 'qqc-sched-empty')[0])).toBe(zh['schedule.empty'])
    expect(byClass(row, 'qqc-sched-add')).toHaveLength(1)
  })

  it('旧宿主快照里没有这个键时整块只读', () => {
    const config = configWith([])
    delete config.scheduledPrompts
    const tree = SettingsView(viewProps({ config, draft: draftWith([]) }))
    const row = rowOf(tree, 'scheduledPrompts')
    expect(byClass(row, 'qqc-sched-add')[0].props.disabled).toBe(true)
  })
})

describe('定时任务表：交互', () => {
  /** 收集 onChange(field, next) 的值。 */
  function collect(): { calls: Array<{ key: string; next: Entry[] }>; handler: (field: { key: string }, next: unknown) => void } {
    const calls: Array<{ key: string; next: Entry[] }> = []
    return {
      calls,
      handler: (field: { key: string }, next: unknown) => { calls.push({ key: field.key, next: next as Entry[] }) },
    }
  }

  it('添加一条：默认 id 顺延、时间 09:00、内容为空', () => {
    const { calls, handler } = collect()
    const tree = SettingsView(viewProps({ onChange: handler }))
    byClass(rowOf(tree, 'scheduledPrompts'), 'qqc-sched-add')[0].props.onClick()
    expect(calls).toHaveLength(1)
    expect(calls[0].key).toBe('scheduledPrompts')
    expect(calls[0].next).toHaveLength(3)
    expect(calls[0].next[2]).toEqual({ id: 'p3', time: '09:00', chatId: '', prompt: '', includeTodayLog: false, includeGroupLogs: false })
  })

  it('编辑内容只改该行，其他行原样带回去', () => {
    const { calls, handler } = collect()
    const tree = SettingsView(viewProps({ onChange: handler }))
    byClass(rowOf(tree, 'scheduledPrompts'), 'qqc-sched-prompt')[1].props.onChange({ target: { value: '今晚只回一句话' } })
    expect(calls).toHaveLength(1)
    expect(calls[0].next[1].prompt).toBe('今晚只回一句话')
    expect(calls[0].next[0].prompt).toBe('写日记')
  })

  it('改时间与勾选开关都只动该行', () => {
    const { calls, handler } = collect()
    const tree = SettingsView(viewProps({ onChange: handler }))
    const row = rowOf(tree, 'scheduledPrompts')
    byClass(row, 'qqc-sched-time')[0].props.onChange({ target: { value: '07:05' } })
    expect(calls[0].next[0].time).toBe('07:05')
    expect(calls[0].next[1].time).toBe('21:30')
    byClass(row, 'qqc-sched-flag')[0].children[0].props.onChange({ target: { checked: true } })
    expect(calls[1].next[0].includeTodayLog).toBe(true)
  })

  it('删除只去掉该行', () => {
    const { calls, handler } = collect()
    const tree = SettingsView(viewProps({ onChange: handler }))
    byClass(rowOf(tree, 'scheduledPrompts'), 'qqc-sched-remove')[0].props.onClick()
    expect(calls[0].next.map(entry => entry.id)).toEqual(['p2'])
  })
})

describe('定时任务表：保存与校验', () => {
  it('加一条时 patch 只出 scheduledPrompts', () => {
    const config = configWith(ENTRIES)
    const draft = draftWith(ENTRIES)
    ;(draft.scheduledPrompts as Entry[]).push({ id: 'p3', time: '13:00', chatId: 'private:10001', prompt: '午间提醒', includeTodayLog: false, includeGroupLogs: false })
    const result = computePatch(draft, config)
    expect(Object.keys(result.patch)).toEqual(['scheduledPrompts'])
    expect(result.invalidKeys).toEqual([])
  })

  it('没有改动时 patch 为空（形态往返不失真）', () => {
    expect(computePatch(draftWith(ENTRIES), configWith(ENTRIES)).patch).toEqual({})
  })

  it('半成品行不会被悄悄丢掉：patch 保留它，validateDraft 拦住保存', () => {
    const draft = draftWith(ENTRIES)
    ;(draft.scheduledPrompts as Entry[]).push({ id: 'p3', time: '13:00', chatId: '', prompt: '', includeTodayLog: false, includeGroupLogs: false })
    const result = computePatch(draft, configWith(ENTRIES))
    expect((result.patch.scheduledPrompts as Entry[])).toHaveLength(3)
    const errors = validateDraft(draft)
    expect(errors.scheduledPrompts).toContain('第 3 条')
    expect(errors.scheduledPrompts).toContain('目标会话要写成 private:<QQ号> 或 group:<群号>')
  })

  it('坏时间与重复 id 都报在错误文案里', () => {
    const bad = draftWith([])
    bad.scheduledPrompts = [
      { id: 'p1', time: '9:5', chatId: 'private:10001', prompt: 'a', includeTodayLog: false, includeGroupLogs: false },
      { id: 'p1', time: '10:00', chatId: 'group:1', prompt: 'b', includeTodayLog: false, includeGroupLogs: false },
    ]
    const errors = validateDraft(bad)
    expect(errors.scheduledPrompts).toContain('时间要写成 HH:MM')
  })

  it('合法列表不报错、DEFAULTS 是空数组', () => {
    expect(validateDraft(draftWith(ENTRIES)).scheduledPrompts).toBeUndefined()
    expect(DEFAULTS.scheduledPrompts).toEqual([])
  })
})
