/**
 * QQ 陪伴设置面板组件（hooks 全在这一层；视图树在 view.ts，纯函数）。
 *
 * 数据通道：宿主 Typert Remote（`remote.onebotSettings`）——getSettings() /
 * updateSettings(patch, expectedRevision) / listWorkspaces()。
 * 保存链路不变：computePatch（纯函数）→ updateSettings(patch, revision)。
 */
import { React } from './react-runtime.js'
import { ALL_FIELDS, DEFAULTS, type FieldMeta } from './fields.js'
import { zh } from './i18n.js'
import {
  appendTags,
  computePatch,
  draftFromSnapshot,
  fillWorkspacePath,
  format,
  isConflictError,
  messageOf,
  removeTagAt,
  snapshotValueToDraft,
  tagsOf,
  unwrap,
  type RemoteResultLike,
} from './logic.js'
import { renderWorkspacePicker, type Translate, type WorkspaceSummaryLike } from './render.js'
import { SettingsView, type WorkspaceViewState } from './view.js'

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
  t?: (key: string) => string
  remote: OnebotSettingsRemoteLike
  /** 第二入口（plugins.row.config）：不渲染页头。 */
  embedded?: boolean
}

/** 缺省翻译（宿主未注入 t 时兜底读 zh 词条）。 */
function fallbackT(key: string): string {
  return zh[key] != null ? zh[key] : key
}

/**
 * QQ 设置面板（有状态容器）。
 * @param props t 为宿主的翻译函数；remote 为挂载后的 `remote.onebotSettings`；
 *        embedded=true 时按第二入口（插件详情页）渲染，不显示页头。
 */
export function OnebotSettingsPanel(props: OnebotSettingsPanelProps) {
  const t: Translate = typeof props.t === 'function' ? props.t : fallbackT
  const remote = props.remote
  const embedded = props.embedded === true
  const [snapshot, setSnapshot] = React.useState<OnebotSettingsSnapshot | null>(null)
  const [draft, setDraft] = React.useState<Record<string, unknown> | null>(null)
  const [secretDraft, setSecretDraft] = React.useState('')
  const [clearSecret, setClearSecret] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState('')
  // 当前子页（§1.2：不写 URL，记在 state；F3 之前默认 connection）。
  const [page, setPage] = React.useState('connection')
  const [query, setQuery] = React.useState('')
  const [changedOnly, setChangedOnly] = React.useState(false)
  // 标签列表的输入框缓冲（key → 未提交的文本）。
  const [tagInputs, setTagInputs] = React.useState<Record<string, string>>({})
  // 「快速填入 workspace」数据态——面板打开时（挂载 effect）现拉一次。
  const [workspace, setWorkspace] = React.useState<WorkspaceViewState>({ loaded: false, available: false, workspaces: [], selectedId: '' })

  /** 接受新快照：草稿按快照重置（accessToken 明文绝不进入草稿）。 */
  const accept = (next: OnebotSettingsSnapshot) => {
    setSnapshot(next)
    setDraft(draftFromSnapshot(next))
    setTagInputs({})
  }

  React.useEffect(() => {
    let alive = true
    void remote.getSettings().then(result => {
      if (!alive) return
      accept(unwrap(result) as OnebotSettingsSnapshot)
      setError(null)
    }).catch((cause: unknown) => {
      if (alive) setError(messageOf(cause))
    })
    // 辅助查询独立拉取——失败（含 RPC 异常）降级为说明行，绝不阻塞主链路。
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

  // 保存成功的提示 3 秒后自动消失（§4.10）。
  React.useEffect(() => {
    if (notice === '') return
    const timer = setTimeout(() => { setNotice('') }, 3000)
    return () => { clearTimeout(timer) }
  }, [notice])

  const refetch = () => {
    void remote.getSettings().then(result => {
      accept(unwrap(result) as OnebotSettingsSnapshot)
      setError(null)
      setNotice('')
    }).catch((cause: unknown) => {
      setError(messageOf(cause))
    })
  }

  /** 保存统一通道：updateSettings(patch, expectedRevision)。 */
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
      setNotice(t('save.done'))
      setClearSecret(false)
      setSecretDraft('')
    }).catch((cause: unknown) => {
      // 冲突（§5.6）与其它错误都用错误横幅；草稿保留，重试由用户决定（F2b 补完整流程）。
      if (isConflictError(cause)) setError(t('conflict.title'))
      else setError(messageOf(cause))
    }).finally(() => {
      setBusy(false)
    })
  }

  /** 还原：丢弃全部草稿改动。 */
  const revert = () => {
    if (snapshot == null) return
    setDraft(draftFromSnapshot(snapshot))
    setSecretDraft('')
    setClearSecret(false)
    setTagInputs({})
    setError(null)
    setNotice('')
  }

  /** 恢复单个字段的默认值（只改草稿）。 */
  const resetField = (field: FieldMeta) => {
    if (draft == null) return
    setDraft(Object.assign({}, draft, { [field.key]: snapshotValueToDraft(field, DEFAULTS[field.key]) }))
  }

  const commitTags = (field: FieldMeta, text: string) => {
    if (draft == null) return
    setDraft(Object.assign({}, draft, { [field.key]: appendTags(tagsOf(draft[field.key]), text) }))
    setTagInputs(Object.assign({}, tagInputs, { [field.key]: '' }))
  }

  const backspaceTags = (field: FieldMeta) => {
    if (draft == null) return
    const current = tagsOf(draft[field.key])
    if (current.length === 0) return
    setDraft(Object.assign({}, draft, { [field.key]: removeTagAt(current, current.length - 1) }))
  }

  let secretSet = false
  if (snapshot != null && Array.isArray(snapshot.secrets)) {
    for (const secretEntry of snapshot.secrets) {
      if (secretEntry != null && Array.isArray(secretEntry.path) && secretEntry.path.indexOf('accessToken') >= 0 && secretEntry.set === true) secretSet = true
    }
  }
  const config = snapshot == null ? null : snapshot.config
  const botQQ = config == null || config.botQQ == null ? '' : String(config.botQQ)

  return React.createElement(SettingsView, {
    t: t,
    embedded: embedded,
    loading: draft == null,
    error: error,
    notice: notice === '' ? null : notice,
    entryActive: snapshot == null ? true : snapshot.entryActive === true,
    page: page,
    query: query,
    changedOnly: changedOnly,
    draft: draft,
    config: config,
    botQQ: botQQ,
    secretSet: secretSet,
    clearSecret: clearSecret,
    tagInputs: tagInputs,
    workspace: workspace,
    busy: busy,
    onPageChange: (next: string) => { setPage(next) },
    onQueryChange: (next: string) => { setQuery(next) },
    onChangedOnlyChange: (next: boolean) => { setChangedOnly(next) },
    onRetry: () => { refetch() },
    onSave: () => { save() },
    onRevert: () => { revert() },
    onChange: (field: FieldMeta, next: unknown) => {
      if (draft == null) return
      setDraft(Object.assign({}, draft, { [field.key]: next }))
    },
    onSecretChange: (nextText: string) => {
      setSecretDraft(nextText)
      if (draft == null) return
      setDraft(Object.assign({}, draft, { accessToken: nextText }))
    },
    onClearSecretChange: (next: boolean) => { setClearSecret(next) },
    onResetField: (field: FieldMeta) => { resetField(field) },
    onTagInput: (field: FieldMeta, text: string) => {
      setTagInputs(Object.assign({}, tagInputs, { [field.key]: text }))
    },
    onTagCommit: (field: FieldMeta, text: string) => { commitTags(field, text) },
    onTagRemove: (field: FieldMeta, index: number) => {
      if (draft == null) return
      setDraft(Object.assign({}, draft, { [field.key]: removeTagAt(tagsOf(draft[field.key]), index) }))
    },
    onTagBackspace: (field: FieldMeta) => { backspaceTags(field) },
    renderExtraRow: (field: FieldMeta) => {
      if (field.key !== 'workspacePath') return null
      return renderWorkspacePicker(React, {
        loaded: workspace.loaded,
        available: workspace.available,
        workspaces: workspace.workspaces,
        selectedId: workspace.selectedId,
        disabled: busy,
        t: t,
        onSelectedChange: (nextId: string) => {
          setWorkspace(Object.assign({}, workspace, { selectedId: nextId }))
        },
        onApply: (path: unknown) => {
          setDraft(fillWorkspacePath(draft, path))
        },
      })
    },
  })
}