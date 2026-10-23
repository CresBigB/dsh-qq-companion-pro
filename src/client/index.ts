/**
 * 客户端 bundle 入口（设置页）。
 *
 * 宿主装载契约：CJS 包裹里的 `inject`（宿主客户端服务名数组）与
 * `apply(ctx) => disposer`；面板经
 * `ctx.slots.inject('settings.section', () => ctx.slots.register({name,id,order,label,locale,icon}, render))`
 * 注册主入口，另以 keyed slot `plugins.row.config`（key = `<package>#dsh-onebot`）
 * 注册插件详情页的第二入口（同一面板，embedded 模式不渲染页头）；
 * 数据通道是 Typert Remote（`ctx.remote.$mount(ONEBOT_SETTINGS_REMOTE)` 后
 * `ctx.get('remote.onebotSettings')`），所有读写经 Remote 调宿主侧；概览子页
 * （overview）的状态来自新增的只读方法 `getStatus()`（主插件挂在 cordis 上的
 * qqCompanionStatus 服务）。
 */
import { React } from './react-runtime.js'
import { NS, PLUGIN_ID, REMOTE_NS, SECOND_ENTRY_KEY, SECOND_ENTRY_SLOT, SLOT_ID, SLOT_ORDER } from './constants.js'
import { CSS } from './styles.js'
import { en, zh } from './i18n.js'
import { ONEBOT_SETTINGS_REMOTE } from './schema.js'
import { OnebotSettingsPanel } from './panel.js'

/** 宿主客户端 ctx（只声明本 bundle 实际用到的那几个服务）。 */
export interface ClientContext {
  /** 声明式副作用：返回 disposer，随插件卸载回收。 */
  effect(fn: () => (() => void) | void, label?: string): unknown
  /** locale 服务：注册词条 / 绑定命名空间拿到 t。 */
  locale: {
    register(namespace: string, dictionaries: { zh: Record<string, string>; en: Record<string, string> }): (() => void) | void
    bind(namespace: string): (key: string) => string
  }
  /** remote 服务：挂载 Typert Remote descriptor 清单。 */
  remote: { $mount(descriptor: unknown): Promise<() => void> }
  /** 取命名空间服务（如 `remote.onebotSettings`）。 */
  get(name: string): unknown
  /** slot 服务：注入并注册设置页 section / 插件详情页配置入口。 */
  slots: {
    inject(name: string, factory: () => unknown): void
    register(definition: Record<string, unknown>, render: (props: Record<string, unknown>) => unknown): unknown
  }
}

/** 宿主客户端服务名（inject）。 */
export const inject = ['slots', 'locale', 'remote']

/** 缺省翻译：宿主没注入 t 时退回 zh 词条（第二入口不带 locale 元数据）。 */
function fallbackTranslate(key: string): string {
  return zh[key] != null ? zh[key] : key
}

/**
 * 第二入口的渲染函数：宿主按 `view` 区分两种投影——
 *   · `view: 'summary'`：插件条目那一行的说明文字（只渲染一句简介，不挂表单）；
 *   · `view: 'page'`（或缺省）：插件详情页里的配置表单，同一面板以 embedded 模式渲染。
 */
function panelRender(remote: unknown, embedded: boolean) {
  return (props: Record<string, unknown>) => {
    const hostProps = props == null ? {} : props
    const t = typeof hostProps.t === 'function' ? hostProps.t : fallbackTranslate
    if (hostProps.view === 'summary') {
      return (React.createElement as (type: unknown, props: unknown, ...children: unknown[]) => unknown)(
        'span',
        { className: 'qqc-summary' },
        t('settings.desc'),
      )
    }
    return (React.createElement as (type: unknown, props: unknown) => unknown)(
      OnebotSettingsPanel,
      Object.assign({}, hostProps, { remote: remote, embedded: embedded, t: t }),
    )
  }
}

/**
 * 客户端入口：注入样式与词条、挂载 Typert Remote、注册设置面板（两个入口）。
 * @returns 卸载函数（只回收 Remote 挂载；样式/词条/slot 注册由宿主
 *          ctx.effect 与 slot 生命周期回收）。
 */
export async function apply(ctx: ClientContext): Promise<() => void> {
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = PLUGIN_ID
    tag.textContent = CSS
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, 'onebot-settings: style')

  ctx.effect(() => ctx.locale.register(NS, { zh: zh, en: en }), 'onebot-settings: dictionaries')
  const t = ctx.locale.bind(NS)

  // namespace 是独立 Cordis 服务：必须挂载后 ctx.get() 获取，
  // 直接读 ctx.remote.onebotSettings 会要求预先注入并死锁。
  const disposeRemote = await ctx.remote.$mount(ONEBOT_SETTINGS_REMOTE)
  const remote = ctx.get('remote.' + REMOTE_NS)
  if (remote === undefined) throw new Error('onebot-settings Remote 挂载后不可用')

  ctx.slots.inject('settings.section', () => ctx.slots.register(
    // label 是 thunk：nav 行每次渲染读取，locale 切换后自动跟随。
    { name: 'settings.section', id: SLOT_ID, order: SLOT_ORDER, label: () => t('settings.nav'), locale: NS, icon: 'settings' },
    (props: Record<string, unknown>) => {
      const hostProps = props == null ? {} : props
      return (React.createElement as (type: unknown, props: unknown) => unknown)(
        OnebotSettingsPanel,
        Object.assign({}, hostProps, { remote: remote }),
      )
    },
  ))

  // 第二入口（§1.1）：插件详情页里 `dsh-onebot` 那一行的「配置」按钮。
  // keyed slot 的注册参数只有 key；同一面板以 embedded 模式渲染（不渲染页头）。
  ctx.slots.inject(SECOND_ENTRY_SLOT, () => ctx.slots.register(
    { name: SECOND_ENTRY_SLOT, key: SECOND_ENTRY_KEY },
    panelRender(remote, true),
  ))

  return () => { void disposeRemote() }
}

export { ONEBOT_SETTINGS_REMOTE, ONEBOT_SETTINGS_DESCRIPTORS, configSchema, patchSchema, statusResultSchema } from './schema.js'
export { CSS } from './styles.js'
export { en, zh } from './i18n.js'
export {
  OVERVIEW_MISSING,
  OVERVIEW_PAGE_ID,
  formatSize,
  formatSizePair,
  meterPercent,
  meterTone,
  renderOverview,
  renderScheduledList,
} from './overview.js'
export { ALL_FIELDS, DEFAULTS, GROUP_KEYS, GROUPS } from './fields.js'
export {
  appendTags,
  coerceValue,
  computePatch,
  draftFromDefaults,
  draftFromSnapshot,
  fillWorkspacePath,
  formatDefaultValue,
  isConflictError,
  parseTagInput,
  removeTagAt,
  snapshotValueToDraft,
  tagsOf,
  unitConversion,
  unitLabel,
  unitText,
  unwrap,
  valueEquals,
} from './logic.js'
export { groupMatches, highlightSegments, matchField, normalizeQuery, searchFields } from './search.js'
export { collectRisks, riskFieldKeys, validateDraft } from './validate.js'
export { fieldControlId, fieldErrorId, fieldHintId, groupCards, renderFieldRow, renderGroup, renderRiskDialog, renderSearchResults, renderWorkspacePicker } from './render.js'
export { OnebotSettingsPanel } from './panel.js'
export { SettingsView, changeKeys, groupCounts } from './view.js'
export { SECOND_ENTRY_KEY, SECOND_ENTRY_SLOT, SLOT_ID, SLOT_ORDER } from './constants.js'