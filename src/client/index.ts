/**
 * 客户端 bundle 入口（设置页）。
 *
 * 宿主装载契约：CJS 包裹里的 `inject`（宿主客户端服务名数组）与
 * `apply(ctx) => disposer`；面板经
 * `ctx.slots.inject('settings.section', () => ctx.slots.register({name,id,order,label,locale,icon}, render))`
 * 注册；数据通道是 Typert Remote（`ctx.remote.$mount(ONEBOT_SETTINGS_REMOTE)`
 * 后 `ctx.get('remote.onebotSettings')`），所有读写经 Remote 调宿主侧。
 */
import { React } from './react-runtime.js'
import { NS, PLUGIN_ID, REMOTE_NS, SLOT_ID, SLOT_ORDER } from './constants.js'
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
  /** slot 服务：注入并注册设置页 section。 */
  slots: {
    inject(name: string, factory: () => unknown): void
    register(definition: Record<string, unknown>, render: (props: Record<string, unknown>) => unknown): unknown
  }
}

/** 宿主客户端服务名（inject）。 */
export const inject = ['slots', 'locale', 'remote']

/**
 * 客户端入口：注入样式与词条、挂载 Typert Remote、注册设置面板。
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
    (props: Record<string, unknown>) => (React.createElement as (type: unknown, props: unknown) => unknown)(
      OnebotSettingsPanel,
      Object.assign({}, props, { remote: remote }),
    ),
  ))

  return () => { void disposeRemote() }
}

export { ONEBOT_SETTINGS_REMOTE, ONEBOT_SETTINGS_DESCRIPTORS } from './schema.js'
export { ALL_FIELDS, DEFAULTS, GROUP_KEYS, GROUPS } from './fields.js'
export {
  coerceValue,
  computePatch,
  draftFromSnapshot,
  fillWorkspacePath,
  isConflictError,
  snapshotValueToDraft,
  unwrap,
} from './logic.js'
export { renderGroup, renderWorkspacePicker } from './render.js'
export { OnebotSettingsPanel } from './panel.js'