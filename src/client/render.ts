/**
 * 模块级可测的纯渲染函数：renderGroup 不依赖 hooks/副作用，第一个参数仍是
 * ReactImpl（与面板同款 h 写法，不用 JSX）。
 */
import type { ReactElement } from 'react'
import type { OnebotField, OnebotGroup } from './fields.js'
import type { ReactLike } from './react-runtime.js'

/** createElement 的薄封装（与产物里的 h(ReactImpl, tag, props, ...children) 同形）。 */
export function h(ReactImpl: ReactLike, tag: unknown, props: unknown, ...children: unknown[]): ReactElement {
  return ReactImpl.createElement(tag, props, ...children)
}

/** renderGroup 的选项（回调缺省为空函数，disabled 缺省为 false）。 */
export interface RenderGroupOptions {
  /** 表单草稿（snapshotValueToDraft 形态）。 */
  draft?: Record<string, unknown> | null
  /** 与 schema 默认值不同的键数组（W6「非默认」徽标）。 */
  nonDefaultKeys?: string[]
  /** (field, nextDisplayValue) => void */
  onChange?: (field: OnebotField, next: unknown) => void
  /** (nextText) => void */
  onSecretChange?: (nextText: string) => void
  /** (nextBoolean) => void */
  onClearSecretChange?: (nextChecked: boolean) => void
  /** 快照 secrets 标记：明文是否已配置。 */
  secretSet?: boolean
  /** 清除勾选态。 */
  clearSecret?: boolean
  /** 保存中：全部控件置灰。 */
  disabled?: boolean
  /** 字段行后追加组内附加行（connection 组 workspacePath 下方的「快速填入」行）。 */
  renderExtraRow?: (field: OnebotField) => ReactElement | null
}

/**
 * 渲染一个设置分组（纯函数；值全部经 snapshotValueToDraft 脱敏形态传入，
 * accessToken 明文按契约绝不进入本函数——host 快照侧已脱敏为 ''）。
 */
export function renderGroup(ReactImpl: ReactLike, group: OnebotGroup, opts?: RenderGroupOptions): ReactElement {
  const options: RenderGroupOptions = opts == null ? {} : opts
  const draft = options.draft == null ? {} : options.draft
  const nonDefaultKeys = Array.isArray(options.nonDefaultKeys) ? options.nonDefaultKeys : []
  const onChange = typeof options.onChange === 'function' ? options.onChange : () => {}
  const onSecretChange = typeof options.onSecretChange === 'function' ? options.onSecretChange : () => {}
  const onClearSecretChange = typeof options.onClearSecretChange === 'function' ? options.onClearSecretChange : () => {}
  const fieldNodes = group.fields.map(field => {
    const value = draft[field.key]
    let control: ReactElement
    if (field.type === 'boolean') {
      control = h(ReactImpl, 'label', { className: 'obx-toggle' },
        h(ReactImpl, 'input', {
          type: 'checkbox', checked: value === true, disabled: options.disabled === true,
          onChange: (event: { target: { checked: boolean } }) => { onChange(field, event.target.checked) },
        }),
        value === true ? '开' : '关')
    } else if (field.type === 'enum') {
      const options_ = field.options ?? []
      const optionLabels = field.optionLabels ?? {}
      control = h(ReactImpl, 'select', {
        className: 'obx-select', value: String(value == null ? '' : value), disabled: options.disabled === true,
        onChange: (event: { target: { value: string } }) => { onChange(field, event.target.value) },
        'aria-label': field.label,
      }, options_.map(option => h(ReactImpl, 'option', { key: option, value: option }, optionLabels[option] != null ? optionLabels[option] : option)))
    } else if (field.type === 'stringArray') {
      control = h(ReactImpl, 'textarea', {
        className: 'obx-textarea', rows: 3, value: String(value == null ? '' : value), disabled: options.disabled === true,
        placeholder: '每行一个',
        onChange: (event: { target: { value: string } }) => { onChange(field, event.target.value) },
        'aria-label': field.label,
      })
    } else if (field.type === 'secret') {
      // 密码型输入且不明文回显：value 恒为用户本次输入（初始 ''），占位符提示留空不改；
      // 已配置状态只展示脱敏徽标，绝不渲染任何明文。
      control = h(ReactImpl, 'span', { className: 'obx-control' },
        h(ReactImpl, 'input', {
          type: 'password', className: 'obx-input', value: String(value == null ? '' : value),
          placeholder: '留空 = 不修改', autoComplete: 'new-password', disabled: options.disabled === true,
          onChange: (event: { target: { value: string } }) => { onSecretChange(event.target.value) },
          'aria-label': field.label,
        }),
        h(ReactImpl, 'span', { className: 'obx-secret-badge' }, options.secretSet === true ? '已配置（脱敏，不回显）' : '未配置'),
        h(ReactImpl, 'label', { className: 'obx-toggle' },
          h(ReactImpl, 'input', {
            type: 'checkbox', checked: options.clearSecret === true, disabled: options.disabled === true,
            onChange: (event: { target: { checked: boolean } }) => { onClearSecretChange(event.target.checked) },
          }),
          '清除已保存的 AccessToken'))
    } else {
      control = h(ReactImpl, 'input', {
        type: 'text', className: 'obx-input', value: String(value == null ? '' : value), disabled: options.disabled === true,
        onChange: (event: { target: { value: string } }) => { onChange(field, event.target.value) },
        'aria-label': field.label,
      })
    }
    const nodes: Array<ReactElement | null> = [
      h(ReactImpl, 'div', { className: 'obx-field', key: field.key },
        h(ReactImpl, 'span', { className: 'obx-label' }, field.label),
        // W6「非默认」徽标：快照生效值 ≠ schema 默认值时标注，帮助一眼识别改过
        // 哪些开关；「待重启」徽标不适用本插件——保存经宿主 configEditor.edit
        // 热生效（整条 fiber 秒级原地重启），不存在键级「配置文件值≠生效值」稳态。
        nonDefaultKeys.indexOf(field.key) >= 0
          ? h(ReactImpl, 'span', { className: 'obx-badge', title: '与默认值不同' }, '非默认')
          : null,
        control,
        field.hint != null ? h(ReactImpl, 'span', { className: 'obx-hint' }, field.hint) : null),
    ]
    // 可选扩展点——字段行后追加组内附加行（connection 组 workspacePath
    // 下方的「快速填入 workspace」行由此注入；独立 class 不计入 obx-field 行数）。
    if (typeof options.renderExtraRow === 'function') {
      const extra = options.renderExtraRow(field)
      if (extra != null) nodes.push(extra)
    }
    return nodes
  })
  return h(ReactImpl, 'section', { className: 'obx-group', 'data-group': group.id },
    h(ReactImpl, 'h3', { className: 'obx-group-title' }, group.title),
    fieldNodes)
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
  /** (nextId: string) => void（选中变化） */
  onSelectedChange?: (nextId: string) => void
  /** (path: string) => void（填入回调；本函数绝不调用保存） */
  onApply?: (path: unknown) => void
}

/**
 * 渲染 workspacePath 字段下方的「快速填入 workspace」行（纯函数）。
 * 数据来自面板打开时对 remote.listWorkspaces() 的一次现拉（不缓存陈旧列表）。
 * 三态：
 *   - loaded !== true（拉取中/未拉取）→ 不渲染；
 *   - available !== true 或列表为空 → 隐藏下拉与按钮，仅渲染一行说明
 *     （可直接输入路径，不阻塞手输）；
 *   - 正常 → select（选项 = path（N 会话），value = id，避免同名 path 冲突）
 *     + 「填入」按钮：仅把选中 path 写进输入框当前值（onApply → fillWorkspacePath），
 *     不自动保存。
 */
export function renderWorkspacePicker(
  ReactImpl: ReactLike,
  opts?: RenderWorkspacePickerOptions,
): ReactElement | null {
  const options: RenderWorkspacePickerOptions = opts == null ? {} : opts
  if (options.loaded !== true) return null
  const workspaces = Array.isArray(options.workspaces) ? options.workspaces : []
  if (options.available !== true || workspaces.length === 0) {
    return h(ReactImpl, 'p', { className: 'obx-hint obx-workspace-empty' },
      options.available === true
        ? '暂无 workspace 记录，可直接输入路径。'
        : '无法获取 workspace 列表（宿主未提供 workspace 注册表），可直接输入路径。')
  }
  const selectedId = typeof options.selectedId === 'string' ? options.selectedId : ''
  let selected: WorkspaceSummaryLike | null = null
  for (const workspace of workspaces) {
    if (workspace != null && String(workspace.id) === selectedId) selected = workspace
  }
  const disabled = options.disabled === true
  return h(ReactImpl, 'div', { className: 'obx-workspace-row', 'data-role': 'workspace-picker' },
    h(ReactImpl, 'span', { className: 'obx-label' }, '快速填入 workspace'),
    h(ReactImpl, 'select', {
      className: 'obx-select', value: selectedId, disabled: disabled,
      'aria-label': '快速填入 workspace',
      title: '列出宿主 workspace 注册表中的工作区；选中后点「填入」写入上方路径输入框（只填值，保存仍走「保存设置」按钮）',
      onChange: (event: { target: { value: string } }) => {
        const onSelectedChange = options.onSelectedChange
        if (typeof onSelectedChange === 'function') onSelectedChange(event.target.value)
      },
    },
      h(ReactImpl, 'option', { key: '', value: '' }, '选择 workspace…'),
      workspaces.map(workspace => {
        const label = String(workspace.path == null ? '' : workspace.path) + '（' + String(workspace.sessionCount == null ? 0 : workspace.sessionCount) + ' 会话）'
        return h(ReactImpl, 'option', { key: String(workspace.id), value: String(workspace.id) }, label)
      })),
    h(ReactImpl, 'button', {
      className: 'obx-btn', type: 'button', disabled: disabled || selected == null,
      onClick: () => {
        const onApply = options.onApply
        if (selected != null && typeof onApply === 'function') onApply(selected.path)
      },
    }, '填入'),
    h(ReactImpl, 'span', { className: 'obx-hint' }, '选中后点「填入」仅写入上方输入框；需点「保存设置」才会保存（对新会话生效，已设 /workspace 覆盖的会话不受影响）。'))
}