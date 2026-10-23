/**
 * 设置页「概览」子页的纯渲染层（《前端设计规范》§1.2 overview / §4.14）。
 *
 * 与其余子页不同，概览**不含配置键**：它展示主插件现读的运行态快照
 * （`remote.getStatus()` → `{ available, status }`）。因此它不进 `GROUPS`、
 * 不参与搜索与「只看已改动」，导航顺序上排在最前面（见 view.ts 的 NAV_PAGES）。
 *
 * 纪律：
 * - 纯函数（不持有状态、不调 hooks）：数据与回调全部由 panel.ts 传入，静态
 *   预览脚本也能直接渲染；
 * - 快照里任何字段缺失 / null 都显示「—」，绝不因为一处读不到就整页报错；
 * - 主插件没运行时（`available: false`）只加一条 info 横幅，其余子页照常可用。
 */
import type { ReactElement } from 'react'
import type { ReactLike } from './react-runtime.js'
import { h, type Translate } from './render.js'
import { format } from './logic.js'
import { zh } from './i18n.js'

/** 概览子页 id（不在 GROUPS 里；导航里恒排第一）。 */
export const OVERVIEW_PAGE_ID = 'overview'

/** 缺失字段的占位符（§4.14：任何字段缺失显示「—」而不是报错）。 */
export const OVERVIEW_MISSING = '—'

/** 概览页看到的连接状态（宽松：host 可能给 null / 缺键）。 */
export interface OverviewConnectionLike {
  connected?: unknown
  online?: unknown
  selfId?: unknown
  botQQ?: unknown
  host?: unknown
  port?: unknown
}

/** 概览页看到的一个聊天。 */
export interface OverviewChatLike {
  chatId?: unknown
  sessionId?: unknown
  title?: unknown
  workspaceAttached?: unknown
}

/** 概览页看到的记忆文件行。 */
export interface OverviewMemoryLike {
  label?: unknown
  path?: unknown
  bytes?: unknown
  maxBytes?: unknown
}

/** 概览页看到的定时任务行。 */
export interface OverviewScheduledLike {
  id?: unknown
  time?: unknown
  chatId?: unknown
  doneToday?: unknown
  nextAt?: unknown
}

/** 概览页看到的一条被关闭的能力。 */
export interface OverviewDisabledCapabilityLike {
  id?: unknown
  title?: unknown
  reason?: unknown
}

/** 概览页看到的「功能」摘要（/doctor 的能力行同源，按管理员私聊视角）。 */
export interface OverviewCapabilitiesLike {
  enabled?: unknown
  total?: unknown
  disabled?: OverviewDisabledCapabilityLike[] | null
}

/** 主插件快照的宽松投影（只声明概览真正读的字段）。 */
export interface OverviewStatusLike {
  connection?: OverviewConnectionLike | null
  sessions?: { private?: unknown; group?: unknown; list?: OverviewChatLike[] | null } | null
  today?: { sent?: unknown; passCount?: unknown } | null
  proactive?: { enabled?: unknown; doneToday?: unknown; plannedToday?: unknown; nextAt?: unknown } | null
  stickers?: { enabled?: unknown; count?: unknown; maxCount?: unknown; today?: unknown; dailyMax?: unknown } | null
  memory?: OverviewMemoryLike[] | null
  scheduled?: OverviewScheduledLike[] | null
  permissions?: { admin?: unknown; member?: unknown } | null
  capabilities?: OverviewCapabilitiesLike | null
  generatedAt?: unknown
}

/** renderOverview 的选项。 */
export interface RenderOverviewOptions {
  /** 翻译函数（缺省 zh 词条）。 */
  t?: Translate
  /** getStatus().status（主插件快照；undefined / null = 全部显示「—」）。 */
  status?: OverviewStatusLike | null
  /** getStatus().available（false = 主插件未运行 → info 横幅）。 */
  available?: boolean
  /** getStatus().error（服务在位但取数抛错）。 */
  error?: string | null
  /** 右上「刷新」/ 错误横幅的「重试」。 */
  onRefresh?: () => void
  /** 「去开启」跳转到某个子页（media）。 */
  onGoToPage?: (pageId: string) => void
}

function fallbackTranslate(key: string): string {
  return zh[key] != null ? zh[key] : key
}

/** 数字 → 文案（缺失 = 「—」）。 */
function numberText(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : OVERVIEW_MISSING
}

/** 字节数 → 人类可读（B / KB / MB；与 /doctor 的 KB 口径一致，1 位小数）。 */
export function formatSize(bytes: unknown): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return OVERVIEW_MISSING
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / (1024 * 1024)).toFixed(2) + 'MB'
}

/** 「已用 / 上限」的展示（§4.14 的 `12.3 / 80 KB`）：单位相同时共享一次。 */
export function formatSizePair(bytes: unknown, maxBytes: unknown): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return OVERVIEW_MISSING
  const used = formatSize(bytes)
  if (typeof maxBytes !== 'number' || !Number.isFinite(maxBytes) || maxBytes < 0) return used
  const limit = formatSize(maxBytes)
  const usedUnit = used.replace(/^[\d.]+/, '')
  const limitUnit = limit.replace(/^[\d.]+/, '')
  if (usedUnit === limitUnit) return used.slice(0, used.length - usedUnit.length) + ' / ' + limit
  return used + ' / ' + limit
}

/** meter 的色调（§4.14：≥100% error、≥80% warn，其余无 tone）。 */
export function meterTone(bytes: unknown, maxBytes: unknown): 'warn' | 'error' | null {
  if (typeof bytes !== 'number' || typeof maxBytes !== 'number' || !Number.isFinite(bytes) || !Number.isFinite(maxBytes) || maxBytes <= 0) return null
  const ratio = bytes / maxBytes
  if (ratio >= 1) return 'error'
  if (ratio >= 0.8) return 'warn'
  return null
}

/** meter 填充百分比（0–100 取整；无法计算 = 0）。 */
export function meterPercent(bytes: unknown, maxBytes: unknown): number {
  if (typeof bytes !== 'number' || typeof maxBytes !== 'number' || !Number.isFinite(bytes) || !Number.isFinite(maxBytes) || maxBytes <= 0) return 0
  return Math.max(0, Math.min(100, Math.round(bytes / maxBytes * 100)))
}

/** 在线状态点（§2 页头胶囊同款配色）。 */
function connectionDotState(connection: OverviewConnectionLike | null | undefined): 'ok' | 'warn' | 'error' | 'idle' {
  if (connection == null) return 'idle'
  if (connection.connected !== true) return 'error'
  if (connection.online === true) return 'ok'
  if (connection.online === false) return 'warn'
  return 'idle'
}

/** 一格状态（.qqc-stat：标签 / 大号数值 / 副文）。 */
function stat(
  ReactImpl: ReactLike,
  options: {
    key: string
    label: string
    value: string
    sub?: string
    dot?: 'ok' | 'warn' | 'error' | 'idle'
    action?: ReactElement | null
  },
): ReactElement {
  const labelChildren: unknown[] = []
  if (options.dot !== undefined) labelChildren.push(h(ReactImpl, 'span', { className: 'qqc-dot', 'data-state': options.dot, 'aria-hidden': 'true', key: 'dot' }))
  labelChildren.push(options.label)
  const children: unknown[] = [
    h(ReactImpl, 'div', { className: 'qqc-stat-label', key: 'label' }, ...labelChildren),
    h(ReactImpl, 'div', { className: 'qqc-stat-value', key: 'value' }, options.value),
  ]
  if (options.action != null) children.push(h(ReactImpl, 'div', { className: 'qqc-stat-sub', key: 'action' }, options.action))
  else if (options.sub !== undefined && options.sub !== '') children.push(h(ReactImpl, 'div', { className: 'qqc-stat-sub', key: 'sub' }, options.sub))
  return h(ReactImpl, 'div', { className: 'qqc-stat', 'data-stat': options.key, key: 'stat-' + options.key }, ...children)
}

/** 六格状态（§4.14）。 */
function statsOf(ReactImpl: ReactLike, t: Translate, status: OverviewStatusLike | null, options: RenderOverviewOptions): ReactElement {
  const connection = status == null ? null : status.connection ?? null
  const sessions = status == null ? null : status.sessions ?? null
  const today = status == null ? null : status.today ?? null
  const proactive = status == null ? null : status.proactive ?? null
  const stickers = status == null ? null : status.stickers ?? null
  const scheduled = status == null || !Array.isArray(status.scheduled) ? null : status.scheduled

  const connectionValue = connection == null
    ? OVERVIEW_MISSING
    : connection.connected !== true
      ? t('conn.disconnected')
      : connection.online === true
        ? t('overview.online')
        : connection.online === false
          ? t('overview.offlineNow')
          : t('overview.unknown')
  const connectionId = connection == null
    ? OVERVIEW_MISSING
    : String(connection.selfId !== undefined && connection.selfId !== '' ? connection.selfId : (connection.botQQ !== undefined && connection.botQQ !== '' ? connection.botQQ : '')) || OVERVIEW_MISSING

  const sessionValue = sessions == null
    ? OVERVIEW_MISSING
    : format(t('overview.sessionCounts'), { dm: numberText(sessions.private), group: numberText(sessions.group) })

  const proactiveValue = proactive == null
    ? OVERVIEW_MISSING
    : proactive.enabled === false
      ? t('overview.off')
      : format(t('overview.checkins'), { done: numberText(proactive.doneToday), planned: numberText(proactive.plannedToday) })
  const proactiveSub = proactive != null && typeof proactive.nextAt === 'string' && proactive.nextAt !== ''
    ? format(t('overview.nextAt'), { time: proactive.nextAt })
    : ''

  const stickersOff = stickers != null && stickers.enabled === false
  const stickersValue = stickers == null
    ? OVERVIEW_MISSING
    : stickersOff
      ? t('overview.off')
      : format(t('overview.stickerLibrary'), { n: numberText(stickers.count), max: numberText(stickers.maxCount) })
  const stickersSub = stickers == null || stickersOff
    ? ''
    : format(t('overview.stickerToday'), { n: numberText(stickers.today), max: numberText(stickers.dailyMax) })
  const enableButton = stickersOff
    ? h(ReactImpl, 'button', {
      className: 'qqc-link',
      type: 'button',
      'data-role': 'overview-go-media',
      key: 'go-media',
      onClick: () => { if (typeof options.onGoToPage === 'function') options.onGoToPage('media') },
    }, t('overview.goEnable'))
    : null

  let nextSchedule = ''
  if (scheduled != null) {
    for (const task of scheduled) {
      if (task == null || typeof task.nextAt !== 'string' || task.nextAt === '') continue
      if (nextSchedule === '' || task.nextAt < nextSchedule) nextSchedule = task.nextAt
    }
  }
  const scheduledValue = scheduled == null
    ? OVERVIEW_MISSING
    : format(t('overview.scheduledCount'), { n: String(scheduled.length) })
  const scheduledSub = nextSchedule === '' ? '' : format(t('overview.nextAt'), { time: nextSchedule })

  // 「今天」格的副文：发送量之后接一条「今天 N 条不回」（她选择不回也是可观测的决定）。
  const todayPassSub = today != null && typeof today.passCount === 'number'
    ? ' · ' + format(t('overview.passToday'), { n: numberText(today.passCount) })
    : ''
  const todaySub = t('overview.sentUnit') + todayPassSub

  return h(ReactImpl, 'div', { className: 'qqc-stats', 'data-role': 'overview-stats', key: 'stats' },
    stat(ReactImpl, { key: 'connection', label: t('overview.connection'), value: connectionValue, sub: connectionId, dot: connectionDotState(connection) }),
    stat(ReactImpl, { key: 'sessions', label: t('overview.sessions'), value: sessionValue }),
    stat(ReactImpl, { key: 'today', label: t('overview.today'), value: today == null ? OVERVIEW_MISSING : numberText(today.sent), sub: todaySub }),
    stat(ReactImpl, { key: 'proactive', label: t('overview.proactive'), value: proactiveValue, sub: proactiveSub }),
    stat(ReactImpl, { key: 'stickers', label: t('overview.stickers'), value: stickersValue, sub: stickersSub, action: enableButton }),
    stat(ReactImpl, { key: 'scheduled', label: t('overview.scheduled'), value: scheduledValue, sub: scheduledSub }))
}

/** 「记忆用量」卡片（§4.14：名称 + 路径 + meter + 大小）。 */
function memoryCard(ReactImpl: ReactLike, t: Translate, status: OverviewStatusLike | null): ReactElement {
  const files = status == null || !Array.isArray(status.memory) ? null : status.memory
  const rows: ReactElement[] = []
  for (const file of files ?? []) {
    if (file == null) continue
    const label = typeof file.label === 'string' && file.label !== '' ? file.label : OVERVIEW_MISSING
    const path = typeof file.path === 'string' ? file.path : ''
    const tone = meterTone(file.bytes, file.maxBytes)
    const sizeText = typeof file.bytes === 'number'
      ? formatSizePair(file.bytes, file.maxBytes)
      : OVERVIEW_MISSING
    const meterProps: Record<string, unknown> = { className: 'qqc-meter', key: 'meter' }
    const fillProps: Record<string, unknown> = {
      className: 'qqc-meter-fill',
      style: { width: meterPercent(file.bytes, file.maxBytes) + '%' },
    }
    if (tone != null) fillProps['data-tone'] = tone
    rows.push(h(ReactImpl, 'li', { className: 'qqc-list-row', key: 'memory-' + rows.length, 'data-key': path },
      h(ReactImpl, 'div', { className: 'qqc-row-meta' },
        h(ReactImpl, 'span', { className: 'qqc-label' }, label),
        h(ReactImpl, 'span', { className: 'qqc-list-path', title: path }, path)),
      h(ReactImpl, 'span', { className: 'qqc-unit' }, sizeText),
      h(ReactImpl, 'div', meterProps, h(ReactImpl, 'div', fillProps))))
  }
  const body: unknown[] = files == null || rows.length === 0
    ? [h(ReactImpl, 'div', { className: 'qqc-empty', key: 'empty' }, t('overview.noMemory'))]
    : [h(ReactImpl, 'ul', { className: 'qqc-list', key: 'list' }, rows)]
  return h(ReactImpl, 'section', { className: 'qqc-card', 'data-section': t('overview.memory'), 'data-role': 'overview-memory', key: 'memory-card' },
    h(ReactImpl, 'div', { className: 'qqc-card-head' },
      h(ReactImpl, 'h3', { className: 'qqc-card-title' }, t('overview.memory'))),
    ...body)
}

/** 「定时任务」卡片（§3.8 / §4.14：id · 时间 · 目标会话 · 今天是否已执行）。 */
export function renderScheduledList(ReactImpl: ReactLike, options: { tasks?: OverviewScheduledLike[] | null; t?: Translate }): ReactElement[] {
  const t: Translate = options != null && typeof options.t === 'function' ? options.t : fallbackTranslate
  const tasks = options == null || !Array.isArray(options.tasks) ? null : options.tasks
  if (tasks == null || tasks.length === 0) {
    return [h(ReactImpl, 'div', { className: 'qqc-empty', key: 'scheduled-empty', 'data-role': 'overview-scheduled-empty' }, t('overview.noScheduled'))]
  }
  const rows: ReactElement[] = []
  for (const task of tasks) {
    if (task == null) continue
    const id = typeof task.id === 'string' && task.id !== '' ? task.id : OVERVIEW_MISSING
    const time = typeof task.time === 'string' && task.time !== '' ? task.time : OVERVIEW_MISSING
    const chatId = typeof task.chatId === 'string' && task.chatId !== '' ? task.chatId : OVERVIEW_MISSING
    const done = task.doneToday === true
    rows.push(h(ReactImpl, 'li', { className: 'qqc-list-row', key: 'task-' + rows.length, 'data-key': id },
      h(ReactImpl, 'div', { className: 'qqc-row-meta' },
        h(ReactImpl, 'span', { className: 'qqc-label' }, id + ' · ' + time),
        h(ReactImpl, 'span', { className: 'qqc-list-path', title: chatId }, chatId)),
      h(ReactImpl, 'span', { className: 'qqc-unit' }, done ? t('overview.doneToday') : t('overview.pendingToday'))))
  }
  return [h(ReactImpl, 'ul', { className: 'qqc-list', key: 'scheduled-list' }, rows)]
}

function scheduledCard(ReactImpl: ReactLike, t: Translate, status: OverviewStatusLike | null): ReactElement {
  const tasks = status == null || !Array.isArray(status.scheduled) ? null : status.scheduled
  return h(ReactImpl, 'section', { className: 'qqc-card', 'data-section': t('overview.scheduled'), 'data-role': 'overview-scheduled', key: 'scheduled-card' },
    h(ReactImpl, 'div', { className: 'qqc-card-head' },
      h(ReactImpl, 'h3', { className: 'qqc-card-title' }, t('overview.scheduled'))),
    ...renderScheduledList(ReactImpl, { tasks, t }))
}

/** 「会话」卡片（每行：标题或 chatId + 是否已归入工作区；未归入给 /workspace attach 提示）。 */
function sessionsCard(ReactImpl: ReactLike, t: Translate, status: OverviewStatusLike | null): ReactElement {
  const list = status == null || status.sessions == null || !Array.isArray(status.sessions.list) ? null : status.sessions.list
  const rows: ReactElement[] = []
  for (const chat of list ?? []) {
    if (chat == null) continue
    const chatId = typeof chat.chatId === 'string' && chat.chatId !== '' ? chat.chatId : OVERVIEW_MISSING
    const title = typeof chat.title === 'string' && chat.title !== '' ? chat.title : chatId
    const attached = chat.workspaceAttached
    const attachedText = attached === true ? t('overview.attached') : attached === false ? t('overview.notAttached') : OVERVIEW_MISSING
    const children: unknown[] = [
      h(ReactImpl, 'div', { className: 'qqc-row-meta', key: 'meta' },
        h(ReactImpl, 'span', { className: 'qqc-label', title: chatId }, title),
        h(ReactImpl, 'span', { className: 'qqc-list-path', title: chatId }, chatId)),
      h(ReactImpl, 'span', { className: 'qqc-unit', key: 'attached', 'data-attached': attached === true ? 'true' : attached === false ? 'false' : 'unknown' }, attachedText),
    ]
    if (attached === false) {
      children.push(h(ReactImpl, 'div', { className: 'qqc-hint', key: 'hint', style: { gridColumn: '1 / -1' } }, t('overview.attachHint')))
    }
    rows.push(h(ReactImpl, 'li', { className: 'qqc-list-row', key: 'session-' + rows.length, 'data-key': chatId }, ...children))
  }
  const body: unknown[] = list == null || rows.length === 0
    ? [h(ReactImpl, 'div', { className: 'qqc-empty', key: 'empty' }, t('overview.noSessions'))]
    : [h(ReactImpl, 'ul', { className: 'qqc-list', key: 'list' }, rows)]
  return h(ReactImpl, 'section', { className: 'qqc-card', 'data-section': t('overview.sessionsCard'), 'data-role': 'overview-sessions', key: 'sessions-card' },
    h(ReactImpl, 'div', { className: 'qqc-card-head' },
      h(ReactImpl, 'h3', { className: 'qqc-card-title' }, t('overview.sessionsCard'))),
    ...body)
}

/**
 * 「功能」卡片（T6 能力开关）：已开 N / 共 M，加列出被关闭的能力（id（中文名）+ 原因）。
 * 快照里没有 capabilities（主插件未提供 / 取数失败）= 显示「—」，与其余卡片同一纪律。
 */
function capabilitiesCard(ReactImpl: ReactLike, t: Translate, status: OverviewStatusLike | null): ReactElement {
  const summary = status == null || status.capabilities == null ? null : status.capabilities
  const disabled = summary == null || !Array.isArray(summary.disabled) ? [] : summary.disabled
  const rows: ReactElement[] = []
  for (const item of disabled) {
    if (item == null) continue
    const id = typeof item.id === 'string' && item.id !== '' ? item.id : OVERVIEW_MISSING
    const title = typeof item.title === 'string' && item.title !== '' ? item.title : ''
    const reason = typeof item.reason === 'string' && item.reason !== '' ? item.reason : OVERVIEW_MISSING
    rows.push(h(ReactImpl, 'li', { className: 'qqc-list-row', key: 'capability-' + rows.length, 'data-key': id },
      h(ReactImpl, 'div', { className: 'qqc-row-meta' },
        h(ReactImpl, 'span', { className: 'qqc-label', title: id }, title === '' ? id : id + '（' + title + '）'),
        h(ReactImpl, 'span', { className: 'qqc-list-path', title: reason }, reason)),
      h(ReactImpl, 'span', { className: 'qqc-unit', key: 'state' }, t('overview.off'))))
  }
  const body: unknown[] = summary == null
    ? [h(ReactImpl, 'div', { className: 'qqc-empty', key: 'missing' }, OVERVIEW_MISSING)]
    : [
      h(ReactImpl, 'div', { className: 'qqc-hint', key: 'count', 'data-role': 'overview-capabilities-count' },
        format(t('overview.capabilitiesCount'), { on: numberText(summary.enabled), total: numberText(summary.total) })
        + ' · ' + t('overview.capabilitiesHint')),
      ...(rows.length === 0
        ? [h(ReactImpl, 'div', { className: 'qqc-empty', key: 'all-on', 'data-role': 'overview-capabilities-all-on' }, t('overview.capabilitiesAllOn'))]
        : [h(ReactImpl, 'ul', { className: 'qqc-list', key: 'list' }, rows)]),
    ]
  return h(ReactImpl, 'section', { className: 'qqc-card', 'data-section': t('overview.capabilities'), 'data-role': 'overview-capabilities', key: 'capabilities-card' },
    h(ReactImpl, 'div', { className: 'qqc-card-head' },
      h(ReactImpl, 'h3', { className: 'qqc-card-title' }, t('overview.capabilities'))),
    ...body)
}

/**
 * 概览子页的完整内容（作为 `.qqc-main` 的直接子项返回）：
 * 页头（标题 / 副标题 / 右上「刷新」）→ 横幅（不可用 / 取数错误）→ 六格状态
 * →「记忆用量」→「定时任务」→「会话」→「功能」。
 */
export function renderOverview(ReactImpl: ReactLike, opts?: RenderOverviewOptions): ReactElement[] {
  const options: RenderOverviewOptions = opts == null ? {} : opts
  const t: Translate = typeof options.t === 'function' ? options.t : fallbackTranslate
  const available = options.available !== false
  // 主插件没运行：所有状态格显示「—」（status 一律视为缺席）。
  const status = available ? (options.status == null ? null : options.status) : null
  const onRefresh = typeof options.onRefresh === 'function' ? options.onRefresh : () => {}

  const nodes: ReactElement[] = [
    h(ReactImpl, 'div', { className: 'qqc-page-head', key: 'page-head' },
      h(ReactImpl, 'div', { className: 'qqc-page-head-text' },
        h(ReactImpl, 'h3', { className: 'qqc-page-title' }, t('overview.title')),
        h(ReactImpl, 'p', { className: 'qqc-page-desc' }, t('overview.desc'))),
      h(ReactImpl, 'button', {
        className: 'qqc-btn qqc-btn--sm',
        type: 'button',
        'data-role': 'overview-refresh',
        key: 'refresh',
        onClick: () => { onRefresh() },
      }, t('overview.refresh'))),
  ]

  if (!available) {
    nodes.push(h(ReactImpl, 'div', {
      className: 'qqc-banner',
      'data-tone': 'info',
      'data-role': 'overview-unavailable',
      key: 'unavailable',
    },
      h(ReactImpl, 'div', { className: 'qqc-banner-body' },
        h(ReactImpl, 'p', { className: 'qqc-banner-title' }, t('overview.unavailable')))))
  } else if (options.error != null && options.error !== '') {
    nodes.push(h(ReactImpl, 'div', {
      className: 'qqc-banner',
      'data-tone': 'error',
      'data-role': 'overview-error',
      key: 'overview-error',
    },
      h(ReactImpl, 'div', { className: 'qqc-banner-body' },
        h(ReactImpl, 'p', { className: 'qqc-banner-title' }, t('overview.errorTitle')),
        h(ReactImpl, 'p', { className: 'qqc-banner-text' }, options.error)),
      h(ReactImpl, 'div', { className: 'qqc-banner-actions' },
        h(ReactImpl, 'button', {
          className: 'qqc-btn qqc-btn--sm',
          type: 'button',
          key: 'retry',
          onClick: () => { onRefresh() },
        }, t('load.retry')))))
  }

  nodes.push(statsOf(ReactImpl, t, status, options))
  nodes.push(memoryCard(ReactImpl, t, status))
  nodes.push(scheduledCard(ReactImpl, t, status))
  nodes.push(sessionsCard(ReactImpl, t, status))
  nodes.push(capabilitiesCard(ReactImpl, t, status))
  return nodes
}