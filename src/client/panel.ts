/**
 * QQ Bot 设置面板组件（hooks 全在这一层；控件树来自 render.ts 的纯函数）。
 */
import { React } from './react-runtime.js'
import { ALL_FIELDS, DEFAULTS, GROUPS } from './fields.js'
import {
  computePatch,
  draftFromDefaults,
  draftFromSnapshot,
  fillWorkspacePath,
  format,
  isConflictError,
  messageOf,
  unwrap,
  valueEquals,
  type RemoteResultLike,
} from './logic.js'
import { h, renderGroup, renderWorkspacePicker, type RenderGroupOptions, type WorkspaceSummaryLike } from './render.js'

/** 宿主快照（OnebotSettingsSnapshot；accessToken 已脱敏为 ''）。 */
export interface OnebotSettingsSnapshot {
  revision: number
  entryActive: boolean
  config: Record<string, unknown>
  secrets: Array<{ path: string[]; set: boolean }>
  groups: Record<string, string[]>
  effect: string
}

/** `remote.onebotSettings` 的服务面（挂载后的 Remote API）。 */
export interface OnebotSettingsRemoteLike {
  getSettings(): Promise<RemoteResultLike>
  updateSettings(patch: Record<string, unknown>, expectedRevision: number): Promise<RemoteResultLike>
  listWorkspaces(): Promise<RemoteResultLike>
}

/** 面板 props（t 为宿主注入的翻译函数，语言切换自动重渲染）。 */
export interface OnebotSettingsPanelProps {
  t: (key: string) => string
  remote: OnebotSettingsRemoteLike
}

/** 「快速填入 workspace」的数据态。 */
interface WorkspaceState {
  loaded: boolean
  available: boolean
  workspaces: WorkspaceSummaryLike[]
  selectedId: string
}

/**
 * QQ Bot 设置面板。
 * @param props t 为宿主注入的翻译函数（locale: NS，语言切换自动重渲染）；
 *        remote 为挂载后的 `remote.onebotSettings` API。
 */
export function OnebotSettingsPanel(props: OnebotSettingsPanelProps) {
  const t = props.t
  const remote = props.remote
  const [snapshot, setSnapshot] = React.useState<OnebotSettingsSnapshot | null>(null)
  const [draft, setDraft] = React.useState<Record<string, unknown> | null>(null)
  const [secretDraft, setSecretDraft] = React.useState('')
  const [clearSecret, setClearSecret] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState('')
  // 「快速填入 workspace」数据态——面板打开时（挂载 effect）对
  // remote.listWorkspaces() 现拉一次，不缓存跨会话的陈旧列表。
  const [workspace, setWorkspace] = React.useState<WorkspaceState>({ loaded: false, available: false, workspaces: [], selectedId: '' })

  /** 接受新快照：草稿按快照重置（accessToken 明文绝不进入草稿）。 */
  const accept = (next: OnebotSettingsSnapshot) => {
    setSnapshot(next)
    setDraft(draftFromSnapshot(next))
  }

  React.useEffect(() => {
    let alive = true
    void remote.getSettings().then(result => {
      if (!alive) return
      accept(unwrap(result) as OnebotSettingsSnapshot)
    }).catch((cause: unknown) => {
      if (alive) setError(messageOf(cause))
    })
    // 辅助查询独立拉取——失败（含 RPC 异常）降级为 unavailable 提示行，
    // 绝不阻塞/污染 getSettings 主链路与错误横幅。
    void Promise.resolve().then(() => remote.listWorkspaces()).then(result => {
      if (!alive) return
      const value = unwrap(result) as { available?: boolean; workspaces?: WorkspaceSummaryLike[] } | null
      setWorkspace({
        loaded: true,
        available: value != null && value.available === true,
        workspaces: value != null && Array.isArray(value.workspaces) ? value.workspaces : [],
        selectedId: '',
      })
    }).catch(() => {
      if (alive) setWorkspace({ loaded: true, available: false, workspaces: [], selectedId: '' })
    })
    return () => { alive = false }
  }, [remote])

  const refetch = () => {
    void remote.getSettings().then(result => {
      accept(unwrap(result) as OnebotSettingsSnapshot)
      setError(null)
      setNotice('')
    }).catch((cause: unknown) => {
      setError(messageOf(cause))
    })
  }

  /** 保存统一通道：updateSettings(patch, expectedRevision)；冲突时提示并重拉快照。 */
  const save = () => {
    if (busy || snapshot == null || draft == null) return
    setError(null)
    setNotice('')
    const computed = computePatch(draft, snapshot.config, { secretDraft: secretDraft, clearSecret: clearSecret })
    if (computed.invalidKeys.length > 0) {
      const labels = computed.invalidKeys.map(key => {
        const field = ALL_FIELDS.find(item => item.key === key)
        return field != null ? field.label : key
      })
      setError(format(t('save.badNumber'), { keys: labels.join('、') }))
      return
    }
    if (Object.keys(computed.patch).length === 0) {
      setNotice(t('save.noChanges'))
      return
    }
    setBusy(true)
    void Promise.resolve().then(() => remote.updateSettings(computed.patch, snapshot.revision)).then(result => {
      accept(unwrap(result) as OnebotSettingsSnapshot)
      setNotice(t('save.done')) // 生效方式提示：热生效、插件秒级重启、桥重连
      setClearSecret(false)
      setSecretDraft('')
    }).catch((cause: unknown) => {
      if (isConflictError(cause)) {
        // revision 不一致 → 提示并重拉快照，用户核对后重放
        setError(t('conflict.title'))
        refetch()
      } else {
        setError(messageOf(cause))
      }
    }).finally(() => {
      setBusy(false)
    })
  }

  if (snapshot === null || draft === null) {
    return h(React, 'div', { className: 'obx-panel' },
      h(React, 'p', { className: 'obx-hint' }, t('settings.loading')),
      error === null ? null : h(React, 'div', { className: 'obx-error', role: 'alert' }, t('status.error') + '：' + error))
  }

  let secretSet = false
  if (Array.isArray(snapshot.secrets)) {
    for (const secretEntry of snapshot.secrets) {
      if (secretEntry != null && Array.isArray(secretEntry.path) && secretEntry.path.indexOf('accessToken') >= 0 && secretEntry.set === true) secretSet = true
    }
  }
  if (clearSecret === true) secretSet = false // 勾选清除后按“将清空”展示

  // W6「非默认」徽标数据源：快照生效值 vs schema 默认值（DEFAULTS），
  // 反映已保存状态；草稿未保存的改动不打徽标。
  const nonDefaultKeys: string[] = []
  if (snapshot.config != null) {
    for (const field of ALL_FIELDS) {
      if (valueEquals(snapshot.config[field.key], DEFAULTS[field.key]) === false) nonDefaultKeys.push(field.key)
    }
  }

  const changeHandlers: RenderGroupOptions = {
    disabled: busy,
    secretSet: secretSet,
    clearSecret: clearSecret,
    nonDefaultKeys: nonDefaultKeys,
    draft: draft,
    // workspacePath 字段行下方的「快速填入 workspace」行（独立于
    // obx-field 行；onApply 只写草稿不保存——保存仍走 save() 显式通道）。
    renderExtraRow: field => {
      if (field.key !== 'workspacePath') return null
      return renderWorkspacePicker(React, {
        loaded: workspace.loaded,
        available: workspace.available,
        workspaces: workspace.workspaces,
        selectedId: workspace.selectedId,
        disabled: busy,
        onSelectedChange: (nextId: string) => {
          setWorkspace(Object.assign({}, workspace, { selectedId: nextId }))
        },
        onApply: (path: unknown) => {
          setDraft(fillWorkspacePath(draft, path))
        },
      })
    },
    onChange: (field, nextValue) => {
      setDraft(Object.assign({}, draft, { [field.key]: nextValue }))
    },
    onSecretChange: (nextText: string) => {
      setSecretDraft(nextText)
      setDraft(Object.assign({}, draft, { accessToken: nextText }))
    },
    onClearSecretChange: (nextChecked: boolean) => {
      setClearSecret(nextChecked)
    },
  }

  return h(React, 'div', { className: 'obx-panel' },
    h(React, 'h2', { className: 'obx-title' }, t('settings.title')),
    h(React, 'p', { className: 'obx-desc' }, t('settings.desc')),
    h(React, 'div', { className: 'obx-toolbar' },
      h(React, 'span', { className: 'obx-meta' }, t('revision.label') + ' ' + String(snapshot.revision)),
      snapshot.entryActive === true ? null : h(React, 'span', { className: 'obx-meta obx-warn' }, t('effect.entryInactive')),
      h(React, 'span', { className: 'obx-spacer' }),
      h(React, 'button', { className: 'obx-btn', type: 'button', disabled: busy, onClick: refetch }, t('settings.reload')),
      h(React, 'button', { className: 'obx-btn', type: 'button', disabled: busy, onClick: () => { setDraft(draftFromDefaults()) } }, t('settings.reset')),
      h(React, 'button', { className: 'obx-btn primary', type: 'button', disabled: busy, onClick: save }, busy ? t('save.saving') : t('save.submit'))),
    h(React, 'div', { className: 'obx-effect' }, t('effect.hint')),
    GROUPS.map(group => renderGroup(React, group, changeHandlers)),
    error === null ? null : h(React, 'div', { className: 'obx-error', role: 'alert' }, t('status.error') + '：' + error),
    notice === '' ? null : h(React, 'p', { className: 'obx-notice' }, notice))
}