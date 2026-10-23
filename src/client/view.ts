/**
 * 设置面板的静态视图层（《前端设计规范》§2 布局 / §4.10 横幅 / §4.13 加载与空态）。
 *
 * 纯展示组件：不持有状态、不发请求、不调 hooks——所有状态与回调由 panel.ts
 * 传入。这样同一份视图既能给面板用，也能被 scripts/preview-client.mjs 用
 * react-dom/server 渲染成静态 HTML 做人工验收。
 */
import type { ReactElement } from 'react'
import { React } from './react-runtime.js'
import { DEFAULTS, GROUPS } from './fields.js'
import { computePatch, format } from './logic.js'
import { searchFields } from './search.js'
import {
  h,
  renderGroup,
  renderSearchResults,
  type RenderFieldsOptions,
  type Translate,
  type WorkspaceSummaryLike,
} from './render.js'

/** workspace 选择器的视图态。 */
export interface WorkspaceViewState {
  loaded: boolean
  available: boolean
  workspaces: WorkspaceSummaryLike[]
  selectedId: string
}

/** 面板视图 props。 */
export interface SettingsViewProps extends RenderFieldsOptions {
  /** 翻译函数（宿主 locale 注入）。 */
  t: Translate
  /** embedded 模式（plugins.row.config 入口）：不渲染页头。 */
  embedded?: boolean
  /** 加载中（§4.13 骨架）。 */
  loading?: boolean
  /** 加载 / 保存失败的错误文字（.qqc-banner[data-tone=error]）。 */
  error?: string | null
  /** 刚保存成功的提示（.qqc-banner[data-tone=success]）。 */
  notice?: string | null
  /** 插件条目是否激活（false → 顶部 warn 横幅）。 */
  entryActive?: boolean
  /** 当前子页 id。 */
  page: string
  /** 搜索词。 */
  query: string
  /** 只看已改动。 */
  changedOnly: boolean
  /** 头部胶囊用的 QQ 号（botQQ 生效值；空则不显示胶囊）。 */
  botQQ?: string
  /** workspace 选择器数据。 */
  workspace?: WorkspaceViewState
  /** 保存中。 */
  busy?: boolean
  /** 切子页。 */
  onPageChange?: (page: string) => void
  /** 改搜索词。 */
  onQueryChange?: (query: string) => void
  /** 改「只看已改动」。 */
  onChangedOnlyChange?: (changedOnly: boolean) => void
  /** 重新拉取快照（错误横幅的「重试」）。 */
  onRetry?: () => void
  /** 还原（丢弃草稿改动）。 */
  onSave?: () => void
  onRevert?: () => void
  /** 搜索结果里点击组标题跳转。 */
  onWorkspaceSelectedChange?: (id: string) => void
  onWorkspaceApply?: (path: unknown) => void
}

/** 键盘事件的最小结构（不引 DOM 类型，纯函数可在 Node 里调用）。 */
interface KeyboardLike {
  key: string
  target: unknown
  currentTarget: unknown
  preventDefault(): void
}

/** 导航列表的最小结构（↑↓ 移动焦点用）。 */
interface NavListLike {
  querySelectorAll(selector: string): ArrayLike<{ focus(): void }>
}

/** 模板里的 {n} 换成 <strong>N</strong>（§4.11 保存条左半）。 */
function withStrong(template: string, n: number): unknown[] {
  const marker = '{n}'
  const index = template.indexOf(marker)
  if (index < 0) return [template]
  return [
    template.slice(0, index),
    h(React, 'strong', { key: 'count' }, String(n)),
    template.slice(index + marker.length),
  ]
}

/** 子页导航（§5.2）：当前项 aria-current=page，右侧显示已改动计数，↑↓ 移动焦点。 */
function renderNav(props: SettingsViewProps, dirtyKeys: string[]): ReactElement {
  const t = props.t
  const onPageChange = typeof props.onPageChange === 'function' ? props.onPageChange : () => {}
  const onQueryChange = typeof props.onQueryChange === 'function' ? props.onQueryChange : () => {}
  const onChangedOnlyChange = typeof props.onChangedOnlyChange === 'function' ? props.onChangedOnlyChange : () => {}
  const countOf = (groupId: string): number => {
    const group = GROUPS.find(item => item.id === groupId)
    if (group == null) return 0
    let count = 0
    for (const field of group.fields) if (dirtyKeys.indexOf(field.key) >= 0) count += 1
    return count
  }
  return h(React, 'aside', { className: 'qqc-nav' },
    h(React, 'div', { className: 'qqc-nav-tools' },
      h(React, 'input', {
        className: 'qqc-search',
        type: 'search',
        value: props.query,
        placeholder: t('search.placeholder'),
        'aria-label': t('search.placeholder'),
        onChange: (event: { target: { value: string } }) => { onQueryChange(event.target.value) },
      }),
      h(React, 'label', { className: 'qqc-filter' },
        h(React, 'input', {
          type: 'checkbox',
          checked: props.changedOnly === true,
          onChange: (event: { target: { checked: boolean } }) => { onChangedOnlyChange(event.target.checked) },
        }),
        t('filter.changed'))),
    h(React, 'div', {
      className: 'qqc-nav-list',
      role: 'list',
      onKeyDown: (event: KeyboardLike) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        const list = event.currentTarget as NavListLike | null
        if (list == null || typeof list.querySelectorAll !== 'function') return
        const items = Array.prototype.slice.call(list.querySelectorAll('.qqc-nav-item')) as Array<{ focus(): void }>
        if (items.length === 0) return
        let index = -1
        for (let i = 0; i < items.length; i += 1) {
          if (items[i] === event.target) index = i
        }
        if (index < 0) index = 0
        event.preventDefault()
        const next = event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length
        items[next].focus()
      },
    }, GROUPS.map(group => {
      const count = countOf(group.id)
      return h(React, 'button', {
        className: 'qqc-nav-item',
        type: 'button',
        key: group.id,
        'data-page': group.id,
        'aria-current': props.page === group.id ? 'page' : undefined,
        onClick: () => { onPageChange(group.id) },
      },
        h(React, 'span', { className: 'qqc-nav-label' }, group.title),
        count > 0 ? h(React, 'span', { className: 'qqc-count' }, String(count)) : null)
    })))
}

/** 页头（§2.1）：标题 + 副标题 + 右侧连接胶囊（F2a 只有 idle 点 + 生效的 QQ 号）。 */
function renderHeader(props: SettingsViewProps): ReactElement {
  const t = props.t
  const botQQ = props.botQQ == null ? '' : String(props.botQQ)
  return h(React, 'header', { className: 'qqc-header' },
    h(React, 'div', { className: 'qqc-header-text' },
      h(React, 'h2', { className: 'qqc-title' }, t('settings.title')),
      h(React, 'p', { className: 'qqc-subtitle' }, t('settings.desc'))),
    botQQ === '' ? null : h(React, 'span', { className: 'qqc-conn' },
      h(React, 'span', { className: 'qqc-dot', 'data-state': 'idle', 'aria-hidden': 'true' }),
      format(t('conn.qq'), { qq: botQQ })))
}

/** 横幅（§4.10）。 */
function banner(tone: 'error' | 'warn' | 'success', key: string, title: string | null, text: string | null, actions: unknown[]): ReactElement {
  return h(React, 'div', { className: 'qqc-banner', 'data-tone': tone, key: key },
    h(React, 'div', { className: 'qqc-banner-body' },
      title == null ? null : h(React, 'p', { className: 'qqc-banner-title' }, title),
      text == null ? null : h(React, 'p', { className: 'qqc-banner-text' }, text)),
    actions.length === 0 ? null : h(React, 'div', { className: 'qqc-banner-actions' }, actions))
}

/** 加载骨架（§4.13）：3 张高度 120 / 88 / 152。 */
function renderSkeletons(): ReactElement {
  return h(React, 'div', { className: 'qqc-main' },
    [120, 88, 152].map(height => h(React, 'div', {
      className: 'qqc-skeleton',
      key: 'skeleton-' + height,
      style: { height: height + 'px' },
    })))
}

/** 保存条（§4.11 的最小版：N 项 + 还原 + 保存）。 */
function renderSavebar(props: SettingsViewProps, changeCount: number): ReactElement | null {
  if (changeCount === 0) return null
  const t = props.t
  const busy = props.busy === true
  const onSave = typeof props.onSave === 'function' ? props.onSave : () => {}
  const onRevert = typeof props.onRevert === 'function' ? props.onRevert : () => {}
  return h(React, 'div', { className: 'qqc-savebar', 'data-role': 'savebar', key: 'savebar' },
    h(React, 'div', { className: 'qqc-savebar-text' }, ...withStrong(t('save.summary'), changeCount)),
    h(React, 'button', {
      className: 'qqc-btn',
      type: 'button',
      'data-variant': 'ghost',
      disabled: busy,
      onClick: () => { onRevert() },
    }, t('save.revert')),
    h(React, 'button', {
      className: 'qqc-btn',
      type: 'button',
      'data-variant': 'primary',
      disabled: busy,
      onClick: () => { onSave() },
    }, busy ? t('save.saving') : t('save.submit')))
}

/** 草稿里与生效值有差异的键（含非法数字——它们同样需要被保存流程拦下）。 */
export function changeKeys(draft: Record<string, unknown> | null, config: Record<string, unknown> | null, clearSecret?: boolean): string[] {
  const computed = computePatch(draft == null ? {} : draft, config == null ? {} : config, {
    secretDraft: draft == null ? '' : String(draft.accessToken == null ? '' : draft.accessToken),
    clearSecret: clearSecret === true,
  })
  const keys = Object.keys(computed.patch)
  for (const key of computed.invalidKeys) if (keys.indexOf(key) < 0) keys.push(key)
  return keys
}

/** 字段回调集合（视图 → 面板）。 */
function fieldOptions(props: SettingsViewProps, extra: Partial<RenderFieldsOptions>): RenderFieldsOptions {
  return {
    draft: props.draft,
    config: props.config,
    defaults: DEFAULTS,
    t: props.t,
    disabled: props.busy === true,
    secretSet: props.secretSet,
    clearSecret: props.clearSecret,
    tagInputs: props.tagInputs,
    highlight: props.highlight,
    onlyChanged: props.changedOnly === true,
    onChange: props.onChange,
    onSecretChange: props.onSecretChange,
    onClearSecretChange: props.onClearSecretChange,
    onResetField: props.onResetField,
    onTagInput: props.onTagInput,
    onTagCommit: props.onTagCommit,
    onTagRemove: props.onTagRemove,
    onTagBackspace: props.onTagBackspace,
    renderExtraRow: props.renderExtraRow,
    ...extra,
  }
}

/**
 * 设置面板视图。
 * @returns 根节点 .qqc-root（容器查询作用域；embedded 时跳过页头）
 */
export function SettingsView(props: SettingsViewProps): ReactElement {
  const t = props.t
  const draft = props.draft == null ? {} : props.draft
  const config = props.config == null ? {} : props.config
  const dirtyKeys = props.loading === true ? [] : changeKeys(draft, config, props.clearSecret)
  const onlyChanged = props.changedOnly === true
  const query = props.query == null ? '' : props.query
  const searching = query.trim() !== ''

  const banners: ReactElement[] = []
  if (props.error != null && props.error !== '') {
    banners.push(banner('error', 'banner-error', t('load.error'), props.error, [
      h(React, 'button', {
        className: 'qqc-btn qqc-btn--sm',
        type: 'button',
        key: 'retry',
        onClick: () => { if (typeof props.onRetry === 'function') props.onRetry() },
      }, t('load.retry')),
    ]))
  }
  if (props.notice != null && props.notice !== '') {
    banners.push(banner('success', 'banner-success', null, props.notice, []))
  }
  if (props.entryActive === false) {
    banners.push(banner('warn', 'banner-inactive', null, t('entry.inactive'), []))
  }

  let content: ReactElement
  if (props.loading === true) {
    content = renderSkeletons()
  } else if (searching) {
    const matches = searchFields(query)
    if (matches.length === 0) {
      content = h(React, 'div', { className: 'qqc-main' },
        h(React, 'div', { className: 'qqc-empty' }, format(t('search.empty'), { q: query.trim() })))
    } else {
      const resultGroups = renderSearchResults(React, matches, Object.assign(
        fieldOptions(props, { highlight: query, onlyChanged: false }),
        { onOpenGroup: (groupId: string) => { if (typeof props.onPageChange === 'function') props.onPageChange(groupId) } },
      ))
      content = h(React, 'div', { className: 'qqc-main' },
        [h(React, 'p', { className: 'qqc-page-title', key: 'search-title' }, t('search.results')), resultGroups])
    }
  } else {
    const group = GROUPS.find(item => item.id === props.page) != null
      ? GROUPS[GROUPS.findIndex(item => item.id === props.page)]
      : GROUPS[0]
    // 卡片是 .qqc-main 的直接 flex 子项（§6.2 的 16px 间距由 .qqc-main 提供）。
    const cards = renderGroup(React, group, fieldOptions(props, {}))
    const mainChildren: unknown[] = [
      h(React, 'div', { className: 'qqc-page-head', key: 'page-head' },
        h(React, 'div', { className: 'qqc-page-head-text' },
          h(React, 'h3', { className: 'qqc-page-title' }, group.title),
          h(React, 'p', { className: 'qqc-page-desc' }, group.desc))),
    ]
    if (cards.length === 0) {
      mainChildren.push(h(React, 'div', { className: 'qqc-empty', key: 'empty' }, t('filter.empty')))
    } else {
      mainChildren.push(cards)
    }
    mainChildren.push(renderSavebar(props, dirtyKeys.length))
    content = h(React, 'div', { className: 'qqc-main' }, mainChildren)
  }

  return h(React, 'div', {
    className: 'qqc-root',
    'data-embedded': props.embedded === true ? 'true' : undefined,
    'data-page': props.page,
  },
    props.embedded === true ? null : renderHeader(props),
    // §6.2 没有给横幅容器定义规则：这里只用内联排布（等间距 8px）把多条横幅叠起来。
    banners.length === 0 ? null : h(React, 'div', { className: 'qqc-banners', style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' } }, banners),
    h(React, 'div', { className: 'qqc-body' }, renderNav(props, dirtyKeys), content))
}