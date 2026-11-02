/** 功能权限页：源码内存bundle，纯视图/保存换算回归，不写lib或真实profile。 */
import { describe, expect, it } from 'vitest'
import { CAPABILITIES, type CapabilityId } from '../src/capabilities.js'
import { MATRIX_KEYS, setMatrixState, type MatrixScope } from '../src/capability-matrix.js'
import { SCHEMA_DEFAULTS } from '../src/settings-remote.js'
import { loadClientSource } from './client-bundle.js'

type Element = { type: unknown; props: Record<string, any>; children: unknown[] }
const react = {
  createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): Element {
    return { type, props: props ?? {}, children: children.flat(Infinity).filter(child => child != null && child !== false) }
  },
}
function walk(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(walk)
  if (node == null || typeof node !== 'object') return []
  const element = node as Element
  return [element, ...(element.children ?? []).flatMap(walk)]
}
function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join('')
  if (node == null || typeof node === 'boolean') return ''
  return typeof node === 'object' ? ((node as Element).children ?? []).map(text).join('') : String(node)
}
function byClass(node: unknown, name: string): Element[] {
  return walk(node).filter(element => String(element.props.className ?? '').split(/\s+/).includes(name))
}
function byRole(node: unknown, role: string): Element[] {
  return walk(node).filter(element => element.props['data-role'] === role)
}
function check(row: unknown, scope: MatrixScope): Element {
  const label = byClass(row, 'qqc-cap-check').find(element => element.props['data-scope'] === scope)
  expect(label).toBeDefined()
  return walk(label).find(element => element.type === 'input')!
}
const client = loadClientSource(react)
const zh = client.zh as Record<string, string>
const en = client.en as Record<string, string>
const t = (key: string) => zh[key] ?? key
const draftFromSnapshot = client.draftFromSnapshot as (snapshot: { config: Record<string, unknown> }) => Record<string, unknown>
const computePatch = client.computePatch as (draft: Record<string, unknown>, config: Record<string, unknown>) => { patch: Record<string, unknown> }
const matrix = client.renderCapabilityMatrix as (react: unknown, options: Record<string, unknown>) => Element
const view = client.SettingsView as (props: Record<string, unknown>) => Element
const matching = client.matchingCapabilities as (options: Record<string, unknown>) => Array<{ id: CapabilityId }>
const dependencyNotes = client.capabilityDependencyNotes as (capability: unknown, draft: Record<string, unknown>, t: (key: string) => string) => { missing: boolean; notes: string[] }
function config(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...SCHEMA_DEFAULTS, ownerDeny: [], ...overrides }
}
function render(overrides: Record<string, unknown> = {}): Element {
  const current = config()
  return matrix(react, { t, config: current, draft: draftFromSnapshot({ config: current }), ...overrides })
}
function props(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const current = config()
  return { t, page: 'capabilities', config: current, draft: draftFromSnapshot({ config: current }), ...overrides }
}

describe('功能矩阵 — 完整注册表与scope语义', () => {
  it('完整21能力纵向渲染，所有工具名与描述来自唯一注册表，恰好63个checkbox', () => {
    const tree = render()
    const rows = byClass(tree, 'qqc-cap-row')
    expect(CAPABILITIES).toHaveLength(21)
    expect(rows.map(row => row.props['data-capability'])).toEqual(CAPABILITIES.map(item => item.id))
    expect(walk(tree).filter(element => element.type === 'input' && element.props.type === 'checkbox')).toHaveLength(63)
    for (const capability of CAPABILITIES) {
      const row = rows.find(item => item.props['data-capability'] === capability.id)!
      expect(text(row)).toContain(capability.title)
      expect(text(row)).toContain(capability.describe)
      expect(walk(row).filter(element => element.type === 'code').map(text)).toEqual([...capability.tools])
      for (const scope of ['owner', 'private', 'group'] as const) {
        expect(check(row, scope).props['aria-label']).toContain(capability.title)
        expect(check(row, scope).props['aria-label']).toContain(t('capabilities.scope.' + scope))
      }
    }
    expect(rows.every(row => check(row, 'owner').props.checked === true)).toBe(true)
    expect(text(tree)).toContain(t('capabilities.scopeNote'))
    expect(text(tree)).toContain(t('capabilities.guardNote'))
    expect(text(tree)).toContain(t('capabilities.globalNote'))
  })

  it('好友/陌生人旧配置不同显示mixed+indeterminate；不点击不发patch', () => {
    const current = config({ friendDeny: ['qq.send.image'] })
    const calls: unknown[] = []
    const tree = render({ config: current, draft: draftFromSnapshot({ config: current }), onMatrixChange: (...args: unknown[]) => calls.push(args) })
    const row = byClass(tree, 'qqc-cap-row').find(item => item.props['data-capability'] === 'qq.send.image')!
    const input = check(row, 'private')
    expect(input.props['aria-checked']).toBe('mixed')
    expect(input.props['data-state']).toBe('mixed')
    const node = { indeterminate: false }
    input.props.ref(node)
    expect(node.indeterminate).toBe(true)
    expect(byRole(row, 'capability-mixed-note')).toHaveLength(1)
    expect(calls).toEqual([])
    expect(computePatch(draftFromSnapshot({ config: current }), current).patch).toEqual({})
    input.props.onChange({ target: { checked: true } })
    expect(calls).toEqual([['qq.send.image', 'private', true]])
  })

  it('依赖缺失灰态并提示需要配置，但仍允许预授权；TTS不能由stickerDir冒充ready', () => {
    const tree = render({ draft: draftFromSnapshot({ config: config({ stickerDir: 'E:/stickers', ttsEnabled: false }) }) })
    const tts = byClass(tree, 'qqc-cap-row').find(row => row.props['data-capability'] === 'qq.voice.tts')!
    expect(tts.props['data-needs-config']).toBe(true)
    expect(text(tts)).toContain(t('capabilities.needsConfig'))
    expect(text(tts)).toContain(t('capabilities.dep.ttsRuntime'))
    expect(check(tts, 'owner').props.disabled).toBe(false)
    const ttsDef = CAPABILITIES.find(item => item.id === 'qq.voice.tts')!
    const sherpa = dependencyNotes(ttsDef, config({ ttsEnabled: true, ttsEngine: 'sherpa-onnx', ttsModel: '' }), t)
    expect(sherpa.missing).toBe(false) // 空模型路径可从默认目录发现，不在浏览器检查引擎。
    expect(sherpa.notes).toContain(t('capabilities.dep.ttsRuntime'))
    expect(dependencyNotes(ttsDef, config({ ttsEnabled: true, ttsEngine: 'command', ttsCommand: '' }), t).missing).toBe(true)
    const memory = CAPABILITIES.find(item => item.id === 'qq.memory.note')!
    expect(dependencyNotes(memory, config({ publicMemoryFile: '', groupMemoryDir: '' }), t).missing).toBe(true)
    expect(dependencyNotes(memory, config({ publicMemoryFile: 'public.md', groupMemoryDir: '' }), t).missing).toBe(false)
  })

  it('busy禁用全部60项，并防止桩或程序绕过disabled触发回调', () => {
    const calls: unknown[] = []
    const tree = render({ disabled: true, onMatrixChange: (...args: unknown[]) => calls.push(args) })
    const inputs = walk(tree).filter(element => element.type === 'input')
    expect(inputs).toHaveLength(63)
    for (const input of inputs) {
      expect(input.props.disabled).toBe(true)
      input.props.onChange({ target: { checked: false } })
    }
    expect(calls).toEqual([])
  })
})

describe('功能页 — 导航、筛选与保存条集成', () => {
  it('概览后第一子页为capabilities，主视图仅矩阵，高级9键默认折叠', () => {
    const tree = view(props())
    const nav = byClass(tree, 'qqc-nav-item')
    expect(nav.slice(0, 2).map(item => item.props['data-page'])).toEqual(['overview', 'capabilities'])
    expect(byRole(tree, 'capability-matrix')).toHaveLength(1)
    const details = byClass(tree, 'qqc-cap-advanced')[0]
    expect(details.type).toBe('details')
    expect(details.props.open).toBeUndefined()
    expect(byClass(details, 'qqc-row').map(item => item.props['data-key'])).toEqual([...MATRIX_KEYS])
    expect(byClass(tree, 'qqc-page-title').map(text)).toContain(t('capabilities.title'))
  })

  it('概览功能卡与左导航均直达capabilities且只发切页事件', () => {
    const pages: string[] = []
    const tree = view(props({ page: 'overview', onPageChange: (id: string) => pages.push(id) }))
    const button = byRole(tree, 'overview-go-capabilities')[0]
    expect(text(button)).toBe(t('overview.manageCapabilities'))
    button.props.onClick()
    byClass(tree, 'qqc-nav-item').find(item => item.props['data-page'] === 'capabilities')!.props.onClick()
    expect(pages).toEqual(['capabilities', 'capabilities'])
  })

  it('查询能匹配title、tool、id、describe；不会显示9个原始列表替代结果', () => {
    for (const capability of CAPABILITIES) {
      for (const query of [capability.title, capability.id, ...capability.tools, capability.describe]) {
        expect(matching({ draft: {}, config: {}, query }).map(item => item.id), query).toContain(capability.id)
      }
    }
    const tree = view(props({ query: 'qq_send_image' }))
    expect(byClass(tree, 'qqc-cap-row').map(item => item.props['data-capability'])).toEqual(['qq.send.image'])
    expect(byClass(tree, 'qqc-row')).toHaveLength(0)
  })

  it('只看已改动逐能力比较；一个列表变化不把全部能力视为已改动，导航按行计数', () => {
    const current = config()
    const draft = draftFromSnapshot({ config: current })
    draft.memberDeny = ['qq.send.image', 'qq.send.voice']
    expect(matching({ draft, config: current, changedOnly: true }).map(item => item.id)).toEqual(['qq.send.image', 'qq.send.voice'])
    const tree = view(props({ draft, config: current, changedOnly: true }))
    expect(byClass(tree, 'qqc-cap-row')).toHaveLength(2)
    const nav = byClass(tree, 'qqc-nav-item').find(item => item.props['data-page'] === 'capabilities')!
    expect(byClass(nav, 'qqc-count').map(text)).toEqual(['2'])
    expect(byClass(tree, 'qqc-savebar')).toHaveLength(1)
    const searched = view(props({ draft, config: current, changedOnly: true, query: 'qq_send_image' }))
    expect(byClass(searched, 'qqc-cap-row')).toHaveLength(1)
  })

  it('搜索空结果仍保留保存/还原；Ctrl+S沿用根节点而不装全局监听', () => {
    const current = config()
    const draft = draftFromSnapshot({ config: current })
    draft.ownerDeny = ['qq.send.image']
    let saves = 0
    const tree = view(props({ draft, config: current, query: 'no-matching-capability', onSave: () => saves++ }))
    expect(byClass(tree, 'qqc-empty')).toHaveLength(1)
    expect(byClass(tree, 'qqc-savebar')).toHaveLength(1)
    let prevented = false
    tree.props.onKeyDown({ key: 's', ctrlKey: true, preventDefault: () => { prevented = true } })
    expect(saves).toBe(1)
    expect(prevented).toBe(true)
  })

  it('中英文新增词条保持一致，功能页样式仅宿主令牌且含小屏三等分和focus-visible', () => {
    for (const key of Object.keys(zh).filter(key => key.startsWith('capabilities.') || key === 'overview.manageCapabilities' || key === 'risk.capabilityGrant')) {
      expect(en[key], key).toBeTruthy()
    }
    const css = client.CSS as string
    expect(css).toContain('grid-template-columns:minmax(0,1fr) repeat(3,76px)')
    expect(css).toContain('@container qqc (max-width:640px)')
    expect(css).toContain('.qqc-cap-meta{grid-column:1/-1}')
    expect(css).toContain('.qqc-cap-check input:focus-visible')
    expect(css).toContain('min-width:32px;min-height:32px')
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i)
  })
})

describe('权限数组旧配置原样往返和旧Host兼容', () => {
  it('九个权限键放开许可（删deny/添grant）都接危险确认，单纯收紧不弹', () => {
    const collect = client.collectRisks as (draft: Record<string, unknown>, config: Record<string, unknown>) => Array<{ messageKey: string }>
    for (const key of MATRIX_KEYS) {
      const denying = key.endsWith('Deny')
      const current = config({ [key]: denying ? ['qq.send.image'] : [] })
      const draft = draftFromSnapshot({ config: current })
      draft[key] = denying ? [] : ['qq.send.image']
      expect(collect(draft, current).map(item => item.messageKey), key).toEqual(['risk.capabilityGrant'])
      expect(collect(draftFromSnapshot({ config: current }), { ...current, [key]: denying ? [] : ['qq.send.image'] }), key).toEqual([])
    }
  })

  function legacyRules(): Record<string, unknown> {
    const rules: Record<string, unknown> = {}
    for (const key of MATRIX_KEYS) rules[key] = ['future.capability', ' qq.send.image ', 'future.capability', '']
    return rules
  }

  it.each([false, true])('旧/新Host只改port/logLevel，不夹带任何权限键：ownerDeny存在=%s', supported => {
    const current = config(legacyRules())
    if (!supported) delete current.ownerDeny
    const draft = draftFromSnapshot({ config: current })
    for (const key of MATRIX_KEYS) {
      if (key === 'ownerDeny' && !supported) continue
      expect(draft[key]).toEqual(current[key])
      expect(draft[key]).not.toBe(current[key])
    }
    draft.port = '9999'
    draft.logLevel = 'debug'
    expect(computePatch(draft, current).patch).toEqual({ port: 9999, logLevel: 'debug' })
  })

  it('矩阵操作单个id后，其余权限数组保留unknown、空白、重复项及顺序', () => {
    const current = config(legacyRules())
    const draft = draftFromSnapshot({ config: current })
    const patch = setMatrixState(draft, 'qq.send.voice', 'group', false)
    const next = { ...draft, ...patch }
    expect(computePatch(next, current).patch).toEqual(patch)
    for (const key of MATRIX_KEYS.filter(key => !(key in patch))) expect(next[key]).toEqual(current[key])
  })

  it('缺ownerDeny的旧快照禁用矩阵+高级字段并提示完整重启，不冒充新后端', () => {
    const current = config()
    delete current.ownerDeny
    const calls: unknown[] = []
    const tree = view(props({ config: current, draft: draftFromSnapshot({ config: current }), onMatrixChange: (...args: unknown[]) => calls.push(args) }))
    expect(text(tree)).toContain(t('capabilities.restartRequired'))
    const inputs = walk(byRole(tree, 'capability-matrix')[0]).filter(element => element.type === 'input')
    expect(inputs).toHaveLength(63)
    for (const input of inputs) {
      expect(input.props.disabled).toBe(true)
      input.props.onChange({ target: { checked: true } })
    }
    expect(calls).toEqual([])
    for (const input of walk(byClass(tree, 'qqc-cap-advanced')[0]).filter(element => element.type === 'input')) expect(input.props.disabled).toBe(true)
  })
})
