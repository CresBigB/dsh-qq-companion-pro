/**
 * 模块级可测的纯渲染函数（《前端设计规范》§4.1–§4.9）：renderGroup /
 * renderFieldRow / renderWorkspacePicker / renderSearchResults 都不依赖 hooks
 * 或副作用，第一个参数仍是 ReactImpl（与面板同款 h 写法，不用 JSX）。
 *
 * 纯函数纪律：控件状态全部由选项传入，交互全部经回调上报——这里只决定结构。
 */
import type { ReactElement } from 'react'
import { CARD_NOTES } from './fields.js'
import type { FieldMeta, OnebotField, OnebotGroup } from './fields.js'
import type { ReactLike } from './react-runtime.js'
import { zh } from './i18n.js'
import {
  coerceValue,
  format,
  formatDefaultValue,
  removeTagAt,
  tagsOf,
  unitConversion,
  unitText,
  valueEquals,
} from './logic.js'
import { highlightSegments, type FieldMatch } from './search.js'

/** createElement 的薄封装（与产物里的 h(ReactImpl, tag, props, ...children) 同形）。 */
export function h(ReactImpl: ReactLike, tag: unknown, props: unknown, ...children: unknown[]): ReactElement {
  return ReactImpl.createElement(tag, props, ...children)
}

/** 翻译函数签名（宿主 locale 注入；纯函数缺省用 zh 词条兜底）。 */
export type Translate = (key: string) => string

/** 缺省翻译：直接读 zh 词条（纯渲染函数在没有 locale 服务时仍产出中文骨架）。 */
function fallbackTranslate(key: string): string {
  return zh[key] != null ? zh[key] : key
}

/** 字段行 / 搜索结果的共用选项（回调缺省为空操作）。 */
export interface RenderFieldsOptions {
  /** 表单草稿（snapshotValueToDraft 形态）。 */
  draft?: Record<string, unknown> | null
  /** 快照生效值（判断「已改动」）。 */
  config?: Record<string, unknown> | null
  /** schema 默认值（判断「非默认」与「恢复默认」）。 */
  defaults?: Record<string, unknown> | null
  /** 翻译函数（缺省 zh）。 */
  t?: Translate
  /** 保存中：全部控件置灰。 */
  disabled?: boolean
  /** 快照 secrets 标记：密钥是否已设置（明文绝不进草稿）。 */
  secretSet?: boolean
  /** 已点「清空」：保存后将清空密钥。 */
  clearSecret?: boolean
  /** 标签列表的输入框缓冲（key → 文本）。 */
  tagInputs?: Record<string, string>
  /** 搜索高亮词（命中文字包 .qqc-mark）。 */
  highlight?: string
  /** 只看已改动：跳过既非已改动也非非默认的行。 */
  onlyChanged?: boolean
  /** (field, nextDisplayValue) => void */
  onChange?: (field: FieldMeta, next: unknown) => void
  /** (nextText) => void */
  onSecretChange?: (nextText: string) => void
  /** (nextBoolean) => void */
  onClearSecretChange?: (next: boolean) => void
  /** 恢复默认值（只改草稿）。 */
  onResetField?: (field: FieldMeta) => void
  /** 标签输入框文本变化。 */
  onTagInput?: (field: FieldMeta, text: string) => void
  /** 提交一批标签（回车 / 逗号 / 粘贴）。 */
  onTagCommit?: (field: FieldMeta, text: string) => void
  /** 删除第 index 个标签。 */
  onTagRemove?: (field: FieldMeta, index: number) => void
  /** 输入框为空时按 Backspace：删最后一项。 */
  onTagBackspace?: (field: FieldMeta) => void
  /** 字段行后追加组内附加行（connection 组 workspacePath 下方的选择器）。 */
  renderExtraRow?: (field: FieldMeta) => ReactElement | null
}

/** renderGroup 的选项（与字段行选项同形）。 */
export type RenderGroupOptions = RenderFieldsOptions

/** 控件 id（label 的 htmlFor 指向它）。 */
export function fieldControlId(key: string): string {
  return 'qqc-f-' + key
}

/** 说明文字 id（控件的 aria-describedby 指向它）。 */
export function fieldHintId(key: string): string {
  return 'qqc-h-' + key
}

/** 草稿里的展示值。 */
function draftOf(options: RenderFieldsOptions, field: FieldMeta): unknown {
  const draft = options.draft == null ? {} : options.draft
  return draft[field.key]
}

/** 已改动：草稿 ≠ 生效值（密钥走 清空标记 / 输入框 专用语义）。 */
export function isFieldDirty(field: FieldMeta, options: RenderFieldsOptions): boolean {
  if (field.type === 'secret') {
    if (options.clearSecret === true) return true
    return String(draftOf(options, field) == null ? '' : draftOf(options, field)) !== ''
  }
  if (options.config == null) return false
  const next = coerceValue(field, draftOf(options, field))
  if (field.type === 'number' && Number.isNaN(next)) {
    const raw = String(draftOf(options, field) == null ? '' : draftOf(options, field)).trim()
    return raw !== String(options.config[field.key] == null ? '' : options.config[field.key])
  }
  return !valueEquals(next, options.config[field.key])
}

/** 非默认：生效值 ≠ schema 默认值。 */
export function isFieldNonDefault(field: FieldMeta, options: RenderFieldsOptions): boolean {
  if (options.config == null || options.defaults == null) return false
  return !valueEquals(options.config[field.key], options.defaults[field.key])
}

/** 未生效：dependsOn 返回 false（控件仍可编辑）。 */
export function isFieldInactive(field: FieldMeta, options: RenderFieldsOptions): boolean {
  if (typeof field.dependsOn !== 'function') return false
  const draft = options.draft == null ? {} : options.draft
  return field.dependsOn(draft) === false
}

/** 「恢复默认」按钮是否出现：生效值或草稿 ≠ 默认值。 */
export function canResetField(field: FieldMeta, options: RenderFieldsOptions): boolean {
  if (options.defaults == null || field.type === 'secret') return false
  const defaultValue = options.defaults[field.key]
  const next = coerceValue(field, draftOf(options, field))
  if (field.type === 'number' && Number.isNaN(next)) {
    return String(draftOf(options, field) == null ? '' : draftOf(options, field)).trim() !== String(defaultValue)
  }
  const draftDiffers = !valueEquals(next, defaultValue)
  const configDiffers = options.config != null && !valueEquals(options.config[field.key], defaultValue)
  return draftDiffers || configDiffers
}

/** 高亮片段 → React 子节点（文本节点 + <mark class="qqc-mark">；绝不注入 HTML）。 */
function richText(ReactImpl: ReactLike, text: string, query: string | undefined): unknown[] {
  const segments = highlightSegments(text, query == null ? '' : query)
  return segments.map((segment, index) => (segment.hit
    ? h(ReactImpl, 'mark', { className: 'qqc-mark', key: 'mark-' + index }, segment.text)
    : segment.text))
}

/** 构造行内控件（不含单位 / 恢复默认按钮）。 */
function controlOf(ReactImpl: ReactLike, field: FieldMeta, options: RenderFieldsOptions, t: Translate, describedBy?: string): ReactElement {
  const value = draftOf(options, field)
  const disabled = options.disabled === true
  const id = fieldControlId(field.key)
  const onChange = typeof options.onChange === 'function' ? options.onChange : () => {}

  if (field.type === 'boolean') {
    const on = value === true
    return h(ReactImpl, 'button', {
      className: 'qqc-switch',
      type: 'button',
      role: 'switch',
      id: id,
      'aria-checked': on,
      'aria-describedby': describedBy,
      disabled: disabled,
      onClick: () => { onChange(field, !on) },
    })
  }

  if (field.type === 'enum') {
    const enumOptions = Array.isArray(field.options) ? field.options : []
    const optionLabels = field.optionLabels == null ? {} : field.optionLabels
    return h(ReactImpl, 'select', {
      className: 'qqc-select',
      id: id,
      value: String(value == null ? '' : value),
      disabled: disabled,
      'aria-describedby': describedBy,
      onChange: (event: { target: { value: string } }) => { onChange(field, event.target.value) },
    }, enumOptions.map(option => {
      const label = optionLabels[option] != null ? optionLabels[option] : (option === '' ? t('select.followDefault') : option)
      return h(ReactImpl, 'option', { key: option, value: option }, label)
    }))
  }

  if (field.type === 'stringArray') {
    const tags = tagsOf(value)
    const buffer = options.tagInputs != null && options.tagInputs[field.key] != null ? options.tagInputs[field.key] : ''
    const onTagInput = typeof options.onTagInput === 'function' ? options.onTagInput : () => {}
    const onTagCommit = typeof options.onTagCommit === 'function' ? options.onTagCommit : () => {}
    const onTagRemove = typeof options.onTagRemove === 'function' ? options.onTagRemove : () => {}
    const onTagBackspace = typeof options.onTagBackspace === 'function' ? options.onTagBackspace : () => {}
    return h(ReactImpl, 'div', { className: 'qqc-tags' },
      tags.map((tag, index) => h(ReactImpl, 'span', { className: 'qqc-tag', key: tag },
        h(ReactImpl, 'span', { className: 'qqc-tag-text' }, tag),
        h(ReactImpl, 'button', {
          className: 'qqc-tag-x',
          type: 'button',
          'aria-label': format(t('tags.remove'), { item: tag }),
          disabled: disabled,
          onClick: () => { onTagRemove(field, index) },
        }, '×'))),
      h(ReactImpl, 'input', {
        className: 'qqc-tags-input',
        type: 'text',
        id: id,
        value: buffer,
        disabled: disabled,
        placeholder: tags.length === 0 ? t('tags.placeholder') : '',
        'aria-label': field.label,
        'aria-describedby': describedBy,
        spellCheck: false,
        onChange: (event: { target: { value: string } }) => { onTagInput(field, event.target.value) },
        onKeyDown: (event: {
          key: string
          preventDefault(): void
          currentTarget: { value: string }
        }) => {
          if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
            event.preventDefault()
            const text = String(event.currentTarget.value == null ? '' : event.currentTarget.value)
            if (text.trim() !== '') onTagCommit(field, text)
            return
          }
          if (event.key === 'Backspace' && String(event.currentTarget.value == null ? '' : event.currentTarget.value) === '') {
            event.preventDefault()
            onTagBackspace(field)
          }
        },
        onPaste: (event: { preventDefault(): void; clipboardData: { getData(kind: string): string } | null }) => {
          const text = event.clipboardData != null ? String(event.clipboardData.getData('text')) : ''
          if (/[\r\n,，]/.test(text)) {
            event.preventDefault()
            onTagCommit(field, text)
          }
        },
      }))
  }

  if (field.type === 'secret') {
    const text = String(value == null ? '' : value)
    const onSecretChange = typeof options.onSecretChange === 'function' ? options.onSecretChange : () => {}
    const onClearSecretChange = typeof options.onClearSecretChange === 'function' ? options.onClearSecretChange : () => {}
    const set = options.secretSet === true && options.clearSecret !== true
    return h(ReactImpl, 'div', { className: 'qqc-control-line' },
      h(ReactImpl, 'span', { className: 'qqc-dot', 'data-state': set ? 'ok' : 'idle', 'aria-hidden': 'true' }),
      h(ReactImpl, 'span', { className: 'qqc-secret-state' }, set ? t('secret.set') : t('secret.unset')),
      h(ReactImpl, 'input', {
        className: 'qqc-input',
        type: 'password',
        id: id,
        value: text,
        disabled: disabled || options.clearSecret === true,
        placeholder: t('secret.placeholder'),
        autoComplete: 'new-password',
        'aria-describedby': describedBy,
        onChange: (event: { target: { value: string } }) => { onSecretChange(event.target.value) },
      }),
      h(ReactImpl, 'button', {
        className: 'qqc-btn qqc-btn--sm',
        type: 'button',
        'data-variant': 'ghost',
        disabled: disabled,
        onClick: () => { onClearSecretChange(options.clearSecret !== true) },
      }, options.clearSecret === true ? t('secret.undoClear') : t('secret.clear')))
  }

  // string / number / path / time / time24 —— 一律 type=text（§4.3 / §4.4）
  const kind = field.control != null ? field.control : (field.type === 'number' ? 'number' : 'text')
  return h(ReactImpl, 'input', {
    className: 'qqc-input',
    'data-kind': kind,
    type: 'text',
    inputMode: field.type === 'number' ? 'numeric' : undefined,
    id: id,
    value: String(value == null ? '' : value),
    disabled: disabled,
    placeholder: field.placeholder != null ? field.placeholder : (kind === 'time' || kind === 'time24' ? 'HH:MM' : undefined),
    spellCheck: field.control === 'path' ? false : undefined,
    autoComplete: field.control === 'path' ? 'off' : undefined,
    'aria-describedby': describedBy,
    onChange: (event: { target: { value: string } }) => { onChange(field, event.target.value) },
  })
}

/**
 * 渲染一个字段行（§4.1）：左 label + key + hint（stack 行控件在说明下方），右控件。
 * 数据属性：data-dirty / data-inactive（data-invalid 的实时校验属 F2b）。
 */
export function renderFieldRow(ReactImpl: ReactLike, field: FieldMeta, opts?: RenderFieldsOptions): ReactElement {
  const options: RenderFieldsOptions = opts == null ? {} : opts
  const t: Translate = typeof options.t === 'function' ? options.t : fallbackTranslate
  const dirty = isFieldDirty(field, options)
  const nonDefault = isFieldNonDefault(field, options)
  const inactive = isFieldInactive(field, options)
  const willClear = field.type === 'secret' && options.clearSecret === true
  const stack = field.type === 'stringArray'

  const badges: Array<ReactElement | null> = []
  if (dirty) badges.push(h(ReactImpl, 'span', { className: 'qqc-badge', 'data-tone': 'brand', key: 'badge-dirty' }, t('badge.dirty')))
  if (nonDefault) badges.push(h(ReactImpl, 'span', { className: 'qqc-badge', key: 'badge-non-default' }, t('badge.nonDefault')))
  if (inactive) badges.push(h(ReactImpl, 'span', { className: 'qqc-badge', key: 'badge-inactive' }, t('badge.inactive')))
  if (willClear) badges.push(h(ReactImpl, 'span', { className: 'qqc-badge', 'data-tone': 'warn', key: 'badge-will-clear' }, t('badge.willClear')))

  const hintNodes: Array<ReactElement | null> = []
  const hasHint = field.hint != null && field.hint !== ''
  if (hasHint) {
    hintNodes.push(h(ReactImpl, 'p', { className: 'qqc-hint', id: fieldHintId(field.key) },
      ...richText(ReactImpl, field.hint == null ? '' : field.hint, options.highlight)))
  }
  const hasInactiveNote = inactive && field.dependsOnText != null
  if (hasInactiveNote) {
    hintNodes.push(h(ReactImpl, 'p', {
      className: 'qqc-hint',
      id: hasHint ? undefined : fieldHintId(field.key),
    }, field.dependsOnText))
  }
  // 只有确实渲染了说明段落时才挂 aria-describedby（避免指向不存在的 id）。
  const describedBy = hasHint || hasInactiveNote ? fieldHintId(field.key) : undefined

  const control = controlOf(ReactImpl, field, options, t, describedBy)
  const unitTextValue = field.type === 'number' ? unitText(field, draftOf(options, field)) : ''
  const unit = unitTextValue === '' ? null : h(ReactImpl, 'span', { className: 'qqc-unit' }, unitTextValue)
  const resetButton = canResetField(field, options) && typeof options.onResetField === 'function'
    ? h(ReactImpl, 'button', {
      className: 'qqc-btn qqc-btn--icon',
      type: 'button',
      'data-variant': 'ghost',
      'aria-label': format(t('field.resetDefault'), { value: formatDefaultValue(field, options.defaults == null ? '' : options.defaults[field.key]) }),
      title: format(t('field.resetDefault'), { value: formatDefaultValue(field, options.defaults == null ? '' : options.defaults[field.key]) }),
      disabled: options.disabled === true,
      onClick: () => { if (typeof options.onResetField === 'function') options.onResetField(field) },
    }, '↺')
    : null

  let controlNode: ReactElement
  if (field.type === 'boolean') {
    const on = draftOf(options, field) === true
    controlNode = h(ReactImpl, 'div', { className: 'qqc-control' },
      h(ReactImpl, 'div', { className: 'qqc-switch-line' },
        control,
        h(ReactImpl, 'span', { className: 'qqc-switch-text' }, on ? t('switch.on') : t('switch.off')),
        resetButton))
  } else if (field.type === 'stringArray') {
    controlNode = h(ReactImpl, 'div', { className: 'qqc-control' },
      h(ReactImpl, 'div', { className: 'qqc-control-line' },
        h(ReactImpl, 'div', { style: { flex: '1 1 auto', minWidth: 0 } }, control),
        resetButton))
  } else if (field.type === 'secret') {
    controlNode = h(ReactImpl, 'div', { className: 'qqc-control' }, control)
  } else {
    controlNode = h(ReactImpl, 'div', { className: 'qqc-control' },
      h(ReactImpl, 'div', { className: 'qqc-control-line' }, control, unit, resetButton))
  }

  const props: Record<string, unknown> = {
    className: stack ? 'qqc-row qqc-row--stack' : 'qqc-row',
    'data-key': field.key,
    key: field.key,
  }
  if (dirty) props['data-dirty'] = 'true'
  if (inactive) props['data-inactive'] = 'true'

  return h(ReactImpl, 'div', props,
    h(ReactImpl, 'div', { className: 'qqc-row-meta' },
      h(ReactImpl, 'label', { className: 'qqc-label', htmlFor: fieldControlId(field.key) },
        ...richText(ReactImpl, field.label, options.highlight),
        ...badges),
      h(ReactImpl, 'div', { className: 'qqc-key' }, ...richText(ReactImpl, field.key, options.highlight)),
      ...hintNodes),
    controlNode)
}

/** 一个子页按卡片（section）切片，保持键序。 */
export function groupCards(group: OnebotGroup): Array<{ section: string; fields: FieldMeta[] }> {
  const cards: Array<{ section: string; fields: FieldMeta[] }> = []
  for (const field of group.fields) {
    const last = cards.length === 0 ? undefined : cards[cards.length - 1]
    if (last != null && last.section === field.section) last.fields.push(field)
    else cards.push({ section: field.section, fields: [field] })
  }
  return cards
}

/** 行是否可见（只看已改动：只留已改动 / 非默认的行）。 */
function rowVisible(field: FieldMeta, options: RenderFieldsOptions): boolean {
  if (options.onlyChanged !== true) return true
  return isFieldDirty(field, options) || isFieldNonDefault(field, options)
}

/**
 * 渲染一个子页（纯函数）：返回该子页的卡片数组（按卡片分组的字段行）。
 * 卡片作为 .qqc-main 的直接 flex 子项获得 16px 间距（§6.2 没有给包裹层定义规则）；
 * 只看已改动时空卡片整张隐藏，全部为空返回空数组（调用方显示 .qqc-empty）。
 */
export function renderGroup(ReactImpl: ReactLike, group: OnebotGroup, opts?: RenderGroupOptions): ReactElement[] {
  const options: RenderGroupOptions = opts == null ? {} : opts
  const t: Translate = typeof options.t === 'function' ? options.t : fallbackTranslate
  const notes = options.onlyChanged === true ? [] : (CARD_NOTES[group.id] == null ? [] : CARD_NOTES[group.id])
  const cards: Array<ReactElement | null> = []
  for (const card of groupCards(group)) {
    const rows: Array<ReactElement | null> = []
    for (const field of card.fields) {
      if (!rowVisible(field, options)) continue
      rows.push(renderFieldRow(ReactImpl, field, options))
      if (typeof options.renderExtraRow === 'function') {
        const extra = options.renderExtraRow(field)
        if (extra != null) rows.push(extra)
      }
    }
    if (rows.length === 0) continue // 空卡片整张隐藏
    const children: unknown[] = [
      h(ReactImpl, 'div', { className: 'qqc-card-head', key: 'head-' + card.section },
        h(ReactImpl, 'h3', { className: 'qqc-card-title' }, ...richText(ReactImpl, card.section, options.highlight))),
      rows,
    ]
    // §3.9：语音转写卡片底部的纠错表说明
    for (const note of notes) {
      if (note.mode !== 'foot' || note.section !== card.section) continue
      children.push(h(ReactImpl, 'div', { className: 'qqc-card-foot', key: 'foot-' + note.section }, note.text))
    }
    cards.push(h(ReactImpl, 'section', {
      className: 'qqc-card',
      'data-section': card.section,
      key: card.section,
    }, children))
  }
  // §3.8：定时任务只读卡片（F3 之前只给一句去 patch 里编辑的提示）
  for (const note of notes) {
    if (note.mode !== 'card') continue
    cards.push(h(ReactImpl, 'section', {
      className: 'qqc-card',
      'data-section': note.section,
      key: 'note-' + note.section,
    },
      h(ReactImpl, 'div', { className: 'qqc-card-head' },
        h(ReactImpl, 'h3', { className: 'qqc-card-title' }, note.section),
        h(ReactImpl, 'p', { className: 'qqc-card-desc' }, note.text))))
  }
  if (cards.length === 0) return []
  return cards as ReactElement[]
}

/**
 * 渲染搜索结果（§5.3）：按子页分组，组标题是可点击的跳转链接。
 * 返回结果组数组（每组是一条 .qqc-result-group，作为 .qqc-main 的直接子项）。
 * @param matches searchFields 的结果（已按子页 / 键序排好）
 */
export function renderSearchResults(
  ReactImpl: ReactLike,
  matches: FieldMatch[],
  opts?: RenderFieldsOptions & { onOpenGroup?: (groupId: string) => void },
): ReactElement[] {
  const options: RenderFieldsOptions & { onOpenGroup?: (groupId: string) => void } = opts == null ? {} : opts
  const t: Translate = typeof options.t === 'function' ? options.t : fallbackTranslate
  const groups: string[] = []
  const buckets: Record<string, FieldMatch[]> = {}
  for (const match of matches) {
    if (buckets[match.groupId] === undefined) {
      buckets[match.groupId] = []
      groups.push(match.groupId)
    }
    buckets[match.groupId].push(match)
  }
  const onOpenGroup = typeof options.onOpenGroup === 'function' ? options.onOpenGroup : () => {}
  return groups.map(groupId => {
    const bucket = buckets[groupId]
    return h(ReactImpl, 'section', { className: 'qqc-result-group', key: groupId, 'data-group': groupId },
      h(ReactImpl, 'div', { className: 'qqc-result-head' },
        h(ReactImpl, 'button', {
          className: 'qqc-link',
          type: 'button',
          onClick: () => { onOpenGroup(groupId) },
        }, ...richText(ReactImpl, bucket[0].groupTitle, options.highlight)),
        h(ReactImpl, 'span', null, format(t('search.count'), { n: bucket.length }))),
      bucket.map(match => renderFieldRow(ReactImpl, match.field, options)))
  })
}

/** workspace 摘要（host listWorkspaces().workspaces 的一项）。 */
export interface WorkspaceSummaryLike {
  id: unknown
  path?: unknown
  sessionCount?: unknown
}

/** renderWorkspacePicker 的选项。 */
export interface RenderWorkspacePickerOptions {
  /** host listWorkspaces().workspaces */
  workspaces?: WorkspaceSummaryLike[]
  /** host listWorkspaces().available */
  available?: boolean
  /** 面板打开后拉取是否已完成 */
  loaded?: boolean
  /** 当前选中的 workspace id（'' = 未选） */
  selectedId?: string
  /** 保存中：下拉与按钮置灰 */
  disabled?: boolean
  /** 翻译函数（缺省 zh）。 */
  t?: Translate
  /** (nextId: string) => void（选中变化） */
  onSelectedChange?: (nextId: string) => void
  /** (path: unknown) => void（填入回调；本函数绝不调用保存） */
  onApply?: (path: unknown) => void
}

/**
 * 渲染 workspacePath 字段下方的「快速填入 workspace」行（纯函数，§4.8）。
 * 三态：
 *   - loaded !== true（拉取中/未拉取）→ 不渲染；
 *   - available !== true 或列表为空 → 只渲染一行说明（可直接手输路径）；
 *   - 正常 → select（选项 = path（N 会话），value = id）+「填入」按钮：
 *     仅把选中 path 写进草稿（onApply → fillWorkspacePath），不自动保存。
 */
export function renderWorkspacePicker(
  ReactImpl: ReactLike,
  opts?: RenderWorkspacePickerOptions,
): ReactElement | null {
  const options: RenderWorkspacePickerOptions = opts == null ? {} : opts
  const t: Translate = typeof options.t === 'function' ? options.t : fallbackTranslate
  if (options.loaded !== true) return null
  const workspaces = Array.isArray(options.workspaces) ? options.workspaces : []
  if (options.available !== true || workspaces.length === 0) {
    return h(ReactImpl, 'p', { className: 'qqc-hint', 'data-role': 'workspace-picker-empty' },
      options.available === true ? t('workspace.empty') : t('workspace.unavailable'))
  }
  const selectedId = typeof options.selectedId === 'string' ? options.selectedId : ''
  let selected: WorkspaceSummaryLike | null = null
  for (const workspace of workspaces) {
    if (workspace != null && String(workspace.id) === selectedId) selected = workspace
  }
  const disabled = options.disabled === true
  return h(ReactImpl, 'div', {
    className: 'qqc-row qqc-row--stack',
    'data-role': 'workspace-picker',
    key: 'workspace-picker',
  },
    h(ReactImpl, 'div', { className: 'qqc-row-meta' },
      h(ReactImpl, 'p', { className: 'qqc-label' }, t('workspace.title'))),
    h(ReactImpl, 'div', { className: 'qqc-control' },
      h(ReactImpl, 'div', { className: 'qqc-control-line' },
        h(ReactImpl, 'select', {
          className: 'qqc-select',
          value: selectedId,
          disabled: disabled,
          'aria-label': t('workspace.title'),
          onChange: (event: { target: { value: string } }) => {
            const onSelectedChange = options.onSelectedChange
            if (typeof onSelectedChange === 'function') onSelectedChange(event.target.value)
          },
        },
          h(ReactImpl, 'option', { key: '', value: '' }, t('workspace.choose')),
          workspaces.map(workspace => {
            const label = String(workspace.path == null ? '' : workspace.path) + '（' + String(workspace.sessionCount == null ? 0 : workspace.sessionCount) + ' 会话）'
            return h(ReactImpl, 'option', { key: String(workspace.id), value: String(workspace.id) }, label)
          })),
        h(ReactImpl, 'button', {
          className: 'qqc-btn',
          type: 'button',
          disabled: disabled || selected == null,
          onClick: () => {
            const onApply = options.onApply
            if (selected != null && typeof onApply === 'function') onApply(selected.path)
          },
        }, t('workspace.fill'))),
      h(ReactImpl, 'p', { className: 'qqc-hint' }, t('workspace.note'))))
}

/** 便捷：标签列表的删除（面板与测试共用同一份纯函数）。 */
export function dropTag(list: unknown, index: number): string[] {
  return removeTagAt(list, index)
}

/** 便捷：数字控件的单位换算（面板与测试共用同一份纯函数）。 */
export function conversionOf(field: OnebotField, value: unknown): string {
  return unitConversion(field, value)
}