/**
 * 设置面板的静态视图层（《前端设计规范》§2 布局 / §4.10 横幅 / §4.11 保存条 /
 * §4.12 对话框 / §4.13 加载与空态 / §5.2 导航计数 / §5.4 校验 / §5.6 冲突 / §5.7 键盘）。
 *
 * 纯展示组件：不持有状态、不发请求、不调 hooks——所有状态与回调由 panel.ts
 * 传入。这样同一份视图既能给面板用，也能被 scripts/preview-client.mjs 用
 * react-dom/server 渲染成静态 HTML 做人工验收。
 */
import type { ReactElement } from 'react'
import { React } from './react-runtime.js'
import { ALL_FIELDS, DEFAULTS, GROUPS, type CardNote, type FieldMeta } from './fields.js'
import { computePatch, format, tagsOf } from './logic.js'
import { OVERVIEW_PAGE_ID, renderOverview, renderScheduledList, type OverviewStatusLike } from './overview.js'
import { searchFields } from './search.js'
import {
  h,
  renderGroup,
  renderRiskDialog,
  renderSearchResults,
  type RenderFieldsOptions,
  type Translate,
  type WorkspaceSummaryLike,
} from './render.js'
import { collectRisks, riskFieldKeys, validateDraft, type RiskEntry } from './validate.js'

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
  /** getStatus().status（概览页与页头连接胶囊的真实状态；null/缺省 = 未知）。 */
  status?: OverviewStatusLike | null
  /** getStatus().available：false = QQ 主插件未运行（概览页 info 横幅，其余子页照常可用）。 */
  statusAvailable?: boolean
  /** getStatus().error：服务在位但这一次取数失败。 */
  statusError?: string | null
  /** 重新拉取状态（概览页右上「刷新」/ 错误横幅的「重试」）。 */
  onRefreshStatus?: () => void
  /** workspace 选择器数据。 */
  workspace?: WorkspaceViewState
  /** 保存中（禁用全部输入）。 */
  busy?: boolean
  /** 保存流程状态（§4.11）：saving = 正在保存…，saved = 已保存（2 秒后自动重拉）。 */
  saveState?: 'idle' | 'saving' | 'saved'
  /** 保存冲突（§5.6）：内容区顶部 error 横幅 + 重新加载 / 查看我的修改。 */
  conflict?: boolean
  /** 冲突横幅里「查看我的修改」是否展开。 */
  conflictShowMine?: boolean
  /** 危险确认对话框的风险清单（null / 空 = 不弹）。 */
  riskDialog?: RiskEntry[] | null
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
  /** 冲突横幅的「重新加载（会丢弃未保存的修改）」。 */
  onReload?: () => void
  /** 冲突横幅的「查看我的修改」开关。 */
  onToggleMine?: () => void
  /** 危险确认对话框：取消 / 仍然保存。 */
  onRiskCancel?: () => void
  onRiskConfirm?: () => void
  /** 搜索结果里点击组标题跳转。 */
  onWorkspaceSelectedChange?: (id: string) => void
  onWorkspaceApply?: (path: unknown) => void
}

/** 键盘事件的最小结构（不引 DOM 类型，纯函数可在 Node 里调用）。 */
interface KeyboardLike {
  key: string
  target: unknown
  currentTarget: unknown
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  preventDefault(): void
}

/** 导航列表的最小结构（↑↓ 移动焦点用）。 */
interface NavListLike {
  querySelectorAll(selector: string): ArrayLike<{ focus(): void }>
}

/** 字段 key → 所属子页名（冲突清单的「子页 · 标签」用）。 */
const GROUP_TITLE_OF_KEY: Record<string, string> = {}
for (const group of GROUPS) {
  for (const field of group.fields) GROUP_TITLE_OF_KEY[field.key] = group.title
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

/** 每组里命中的键数（导航徽标与保存条共用）。 */
export function groupCounts(keys: string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const group of GROUPS) {
    let count = 0
    for (const field of group.fields) if (keys.indexOf(field.key) >= 0) count += 1
    counts[group.id] = count
  }
  return counts
}

/**
 * 子页导航（§5.2）：当前项 aria-current=page，右侧显示计数——有校验错误显示红色
 * 计数（优先于改动计数），否则显示品牌色改动计数，都没有则不显示；↑↓ 移动焦点。
 * 「概览」恒排第一（§1.2）：它不含配置键，所以永远没有改动 / 错误计数。
 */
function renderNav(props: SettingsViewProps, dirtyKeys: string[], invalid: Record<string, string>): ReactElement {
  const t = props.t
  const onPageChange = typeof props.onPageChange === 'function' ? props.onPageChange : () => {}
  const onQueryChange = typeof props.onQueryChange === 'function' ? props.onQueryChange : () => {}
  const onChangedOnlyChange = typeof props.onChangedOnlyChange === 'function' ? props.onChangedOnlyChange : () => {}
  const dirtyCounts = groupCounts(dirtyKeys)
  const errorCounts = groupCounts(Object.keys(invalid))
  const pages: Array<{ id: string; title: string }> = [
    { id: OVERVIEW_PAGE_ID, title: t('overview.title') },
    ...GROUPS.map(group => ({ id: group.id, title: group.title })),
  ]
  const badgeOf = (groupId: string): ReactElement | null => {
    const errorCount = errorCounts[groupId] == null ? 0 : errorCounts[groupId]
    if (errorCount > 0) return h(React, 'span', { className: 'qqc-count', 'data-tone': 'error' }, String(errorCount))
    const dirtyCount = dirtyCounts[groupId] == null ? 0 : dirtyCounts[groupId]
    if (dirtyCount > 0) return h(React, 'span', { className: 'qqc-count' }, String(dirtyCount))
    return null
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
    }, pages.map(page => {
      return h(React, 'button', {
        className: 'qqc-nav-item',
        type: 'button',
        key: page.id,
        'data-page': page.id,
        'aria-current': props.page === page.id ? 'page' : undefined,
        onClick: () => { onPageChange(page.id) },
      },
        h(React, 'span', { className: 'qqc-nav-label' }, page.title),
        badgeOf(page.id))
    })))
}

/**
 * 页头（§2.1）：标题 + 副标题 + 右侧连接胶囊。
 * 胶囊用**真实状态**（F3）：ok=已连接且 QQ 在线、warn=已连接但 QQ 离线、
 * error=未连接、idle=未知（没有状态快照时保持旧的「QQ 号 …」形态）。
 */
function renderHeader(props: SettingsViewProps): ReactElement {
  const t = props.t
  const botQQ = props.botQQ == null ? '' : String(props.botQQ)
  const status = props.status == null ? null : props.status
  const connection = status == null || status.connection == null ? null : status.connection
  const selfId = connection == null || connection.selfId == null ? '' : String(connection.selfId)
  const id = selfId !== '' ? selfId : botQQ
  let state: 'ok' | 'warn' | 'error' | 'idle' = 'idle'
  let label = ''
  if (connection == null) {
    // 没有状态（主插件未运行 / 还没拉到）：保持 F2a 的形态。
    if (botQQ !== '') label = format(t('conn.qq'), { qq: botQQ })
  } else if (connection.connected !== true) {
    state = 'error'
    label = t('conn.disconnected')
  } else if (connection.online === true) {
    state = 'ok'
    label = format(t('conn.withId'), { state: t('conn.online'), id: id !== '' ? id : '—' })
  } else if (connection.online === false) {
    state = 'warn'
    label = format(t('conn.withId'), { state: t('conn.offline'), id: id !== '' ? id : '—' })
  } else {
    state = 'idle'
    label = format(t('conn.withId'), { state: t('conn.unknown'), id: id !== '' ? id : '—' })
  }
  return h(React, 'header', { className: 'qqc-header' },
    h(React, 'div', { className: 'qqc-header-text' },
      h(React, 'h2', { className: 'qqc-title' }, t('settings.title')),
      h(React, 'p', { className: 'qqc-subtitle' }, t('settings.desc'))),
    label === '' ? null : h(React, 'span', { className: 'qqc-conn' },
      h(React, 'span', { className: 'qqc-dot', 'data-state': state, 'aria-hidden': 'true' }),
      label))
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
function skeletonCards(): ReactElement[] {
  return [120, 88, 152].map(height => h(React, 'div', {
    className: 'qqc-skeleton',
    key: 'skeleton-' + height,
    style: { height: height + 'px' },
  }))
}

/** 草稿值的展示文案（冲突清单的「我的值」）。 */
function draftValueText(field: FieldMeta, raw: unknown, props: SettingsViewProps): string {
  const t = props.t
  if (field.type === 'secret') return t('conflict.secretValue') // 密钥只显示「已修改」，不回显值
  if (field.type === 'boolean') return raw === true ? t('switch.on') : t('switch.off')
  if (field.type === 'stringArray') {
    const list = tagsOf(raw)
    return list.length === 0 ? t('conflict.emptyValue') : list.join('、')
  }
  const text = String(raw == null ? '' : raw)
  return text === '' ? t('conflict.emptyValue') : text
}

/** 冲突横幅展开后的「我的修改」清单：子页 · 标签 · 我的值（§5.6）。 */
function renderConflictChanges(props: SettingsViewProps, dirtyKeys: string[]): ReactElement {
  const draft = props.draft == null ? {} : props.draft
  const rows: ReactElement[] = []
  for (const field of ALL_FIELDS) {
    if (dirtyKeys.indexOf(field.key) < 0) continue
    const groupTitle = GROUP_TITLE_OF_KEY[field.key] == null ? '' : GROUP_TITLE_OF_KEY[field.key]
    rows.push(h(React, 'li', { className: 'qqc-list-row', key: field.key, 'data-key': field.key },
      h(React, 'span', { className: 'qqc-change-path' }, (groupTitle === '' ? '' : groupTitle + ' · ') + field.label),
      h(React, 'span', { className: 'qqc-change-value' }, draftValueText(field, draft[field.key], props))))
  }
  return h(React, 'div', { className: 'qqc-conflict', 'data-role': 'conflict-changes', key: 'conflict-changes' },
    h(React, 'ul', { className: 'qqc-list' }, rows))
}

/**
 * 冲突横幅（§5.6）：保存撞上 revision 冲突时出现在内容区顶部——error 横幅 +
 * 「重新加载（会丢弃未保存的修改）」+「查看我的修改」（展开列出改动键）。
 */
function conflictNodes(props: SettingsViewProps, dirtyKeys: string[]): ReactElement[] {
  if (props.conflict !== true) return []
  const t = props.t
  const actions = [
    h(React, 'button', {
      className: 'qqc-btn qqc-btn--sm',
      type: 'button',
      key: 'reload',
      'data-role': 'conflict-reload',
      onClick: () => { if (typeof props.onReload === 'function') props.onReload() },
    }, t('conflict.reload')),
    h(React, 'button', {
      className: 'qqc-btn qqc-btn--sm',
      type: 'button',
      'data-variant': 'ghost',
      key: 'mine',
      'data-role': 'conflict-mine',
      onClick: () => { if (typeof props.onToggleMine === 'function') props.onToggleMine() },
    }, props.conflictShowMine === true ? t('conflict.hideMine') : t('conflict.showMine')),
  ]
  const nodes = [banner('error', 'banner-conflict', t('conflict.title'), t('conflict.text'), actions)]
  if (props.conflictShowMine === true) nodes.push(renderConflictChanges(props, dirtyKeys))
  return nodes
}

/**
 * 保存条（§4.11 完整版）：
 * - 出现条件：存在改动，或刚保存（saved）；
 * - 左：`已修改 N 项 · 连接 2 · 媒体与语音 1`（子页名可点跳转）；有校验错误时
 *   改为 `有 N 项填写有误`（error 色）；
 * - 右：还原 + 保存（保存中「正在保存…」并禁用；有错误时保存禁用）；
 * - 保存成功：success 文案「已保存，插件正在原地重启…」（2 秒后由面板重新拉取）。
 */
function renderSavebar(props: SettingsViewProps, dirtyKeys: string[], invalid: Record<string, string>): ReactElement | null {
  const t = props.t
  const saved = props.saveState === 'saved'
  const saving = props.busy === true || props.saveState === 'saving'
  if (!saved && dirtyKeys.length === 0) return null
  const invalidCount = Object.keys(invalid).length
  const onSave = typeof props.onSave === 'function' ? props.onSave : () => {}
  const onRevert = typeof props.onRevert === 'function' ? props.onRevert : () => {}
  const onPageChange = typeof props.onPageChange === 'function' ? props.onPageChange : () => {}

  const text: unknown[] = []
  if (saved) {
    text.push(t('save.done'))
  } else if (invalidCount > 0) {
    text.push(...withStrong(t('save.invalid'), invalidCount))
  } else {
    text.push(...withStrong(t('save.summary'), dirtyKeys.length))
    const counts = groupCounts(dirtyKeys)
    for (const group of GROUPS) {
      const count = counts[group.id] == null ? 0 : counts[group.id]
      if (count <= 0) continue
      text.push(' · ')
      text.push(h(React, 'button', {
        className: 'qqc-link',
        type: 'button',
        key: 'savebar-group-' + group.id,
        'data-group': group.id,
        onClick: () => { onPageChange(group.id) },
      }, group.title))
      text.push(' ' + count)
    }
  }

  const barProps: Record<string, unknown> = { className: 'qqc-savebar', 'data-role': 'savebar', key: 'savebar' }
  if (saved) barProps['data-tone'] = 'success'
  else if (invalidCount > 0) barProps['data-tone'] = 'error'

  const actions: unknown[] = saved ? [] : [
    h(React, 'button', {
      className: 'qqc-btn',
      type: 'button',
      'data-variant': 'ghost',
      key: 'revert',
      disabled: saving,
      onClick: () => { onRevert() },
    }, t('save.revert')),
    h(React, 'button', {
      className: 'qqc-btn',
      type: 'button',
      'data-variant': 'primary',
      key: 'submit',
      disabled: saving || invalidCount > 0,
      onClick: () => { onSave() },
    }, saving ? t('save.saving') : t('save.submit')),
  ]

  return h(React, 'div', barProps, h(React, 'div', { className: 'qqc-savebar-text' }, ...text), ...actions)
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
    // §3.8：主动聊天页的「定时任务」只读卡片——F3 起用 getStatus() 的真实列表
    // （快照缺席时退回空态说明），提示文案仍指向 cordis.patch.yml 的 scheduledPrompts。
    renderCardNote: (note: CardNote) => {
      if (note.mode !== 'card' || note.section !== '定时任务') return null
      const tasks = props.status == null || props.status.scheduled == null ? null : props.status.scheduled
      return h(React, 'section', {
        className: 'qqc-card',
        'data-section': note.section,
        'data-role': 'proactive-scheduled',
        key: 'note-' + note.section,
      },
        h(React, 'div', { className: 'qqc-card-head' },
          h(React, 'h3', { className: 'qqc-card-title' }, note.section),
          h(React, 'p', { className: 'qqc-card-desc' }, note.text)),
        ...renderScheduledList(React, { tasks: tasks, t: props.t }))
    },
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
  const loading = props.loading === true
  const dirtyKeys = loading ? [] : changeKeys(draft, config, props.clearSecret)
  // §5.4 实时校验：每次渲染都按草稿算一遍（纯函数，102 键的代价可以忽略）。
  const invalid = loading ? {} : validateDraft(draft, t)
  const risks = loading ? [] : collectRisks(draft, config, { clearSecret: props.clearSecret })
  const riskKeys = riskFieldKeys(risks)
  const onlyChanged = props.changedOnly === true
  const query = props.query == null ? '' : props.query
  const searching = query.trim() !== ''
  const conflictTop = loading ? [] : conflictNodes(props, dirtyKeys)

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
  if (loading) {
    content = h(React, 'div', { className: 'qqc-main' }, ...conflictTop, skeletonCards())
  } else if (searching) {
    const matches = searchFields(query)
    if (matches.length === 0) {
      content = h(React, 'div', { className: 'qqc-main' },
        ...conflictTop,
        h(React, 'div', { className: 'qqc-empty' }, format(t('search.empty'), { q: query.trim() })))
    } else {
      const resultGroups = renderSearchResults(React, matches, Object.assign(
        fieldOptions(props, { highlight: query, onlyChanged: false, invalid: invalid, riskKeys: riskKeys }),
        { onOpenGroup: (groupId: string) => { if (typeof props.onPageChange === 'function') props.onPageChange(groupId) } },
      ))
      content = h(React, 'div', { className: 'qqc-main' },
        ...conflictTop,
        h(React, 'p', { className: 'qqc-page-title', key: 'search-title' }, t('search.results')),
        resultGroups)
    }
  } else if (props.page === OVERVIEW_PAGE_ID) {
    // §1.2 / §4.14：概览子页不含配置键，也不受搜索与「只看已改动」影响
    // （搜索非空时上面已切到搜索结果）；内容全部来自 getStatus() 的快照。
    const overviewNodes = renderOverview(React, {
      t: t,
      status: props.status,
      available: props.statusAvailable !== false,
      error: props.statusError,
      onRefresh: props.onRefreshStatus,
      onGoToPage: (pageId: string) => { if (typeof props.onPageChange === 'function') props.onPageChange(pageId) },
    })
    content = h(React, 'div', { className: 'qqc-main' },
      ...conflictTop,
      ...overviewNodes,
      renderSavebar(props, dirtyKeys, invalid))
  } else {
    const group = GROUPS.find(item => item.id === props.page) != null
      ? GROUPS[GROUPS.findIndex(item => item.id === props.page)]
      : GROUPS[0]
    // 卡片是 .qqc-main 的直接 flex 子项（§6.2 的 16px 间距由 .qqc-main 提供）。
    const cards = renderGroup(React, group, fieldOptions(props, { invalid: invalid, riskKeys: riskKeys }))
    const mainChildren: unknown[] = [
      ...conflictTop,
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
    mainChildren.push(renderSavebar(props, dirtyKeys, invalid))
    content = h(React, 'div', { className: 'qqc-main' }, mainChildren)
  }

  return h(React, 'div', {
    className: 'qqc-root',
    'data-embedded': props.embedded === true ? 'true' : undefined,
    'data-page': props.page,
    // §5.7：Ctrl/⌘+S = 保存。监听挂在**面板根节点**上（不注册全局 window 监听），
    // 焦点在面板内时按键冒泡到这里。
    onKeyDown: (event: KeyboardLike) => {
      if (event.key !== 's' && event.key !== 'S') return
      if (event.ctrlKey !== true && event.metaKey !== true) return
      event.preventDefault()
      if (props.busy === true || props.saveState === 'saving') return
      if (props.riskDialog != null && props.riskDialog.length > 0) return // 等对话框结论
      if (typeof props.onSave === 'function') props.onSave()
    },
  },
    props.embedded === true ? null : renderHeader(props),
    // §6.2 没有给横幅容器定义规则：这里只用内联排布（等间距 8px）把多条横幅叠起来。
    banners.length === 0 ? null : h(React, 'div', { className: 'qqc-banners', style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' } }, banners),
    h(React, 'div', { className: 'qqc-body' }, renderNav(props, dirtyKeys, invalid), content),
    // §4.12：危险确认对话框挂在面板根节点内（覆盖层 position:fixed），绝不挂 document.body。
    props.riskDialog != null && props.riskDialog.length > 0
      ? renderRiskDialog(React, { risks: props.riskDialog, t: t, onCancel: props.onRiskCancel, onConfirm: props.onRiskConfirm })
      : null)
}