/**
 * QQ 陪伴设置面板组件（hooks 全在这一层；视图树在 view.ts，纯函数）。
 *
 * 数据通道：宿主 Typert Remote（`remote.onebotSettings`）——getSettings() /
 * updateSettings(patch, expectedRevision) / listWorkspaces()。
 * 保存链路：validateDraft（§5.4）→ collectRisks 危险确认（§5.5）→
 * computePatch（纯函数）→ updateSettings(patch, revision)（§5.6）。
 */
import { React } from './react-runtime.js'
import { ALL_FIELDS, DEFAULTS, GROUPS, type FieldMeta } from './fields.js'
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
import { OVERVIEW_PAGE_ID } from './overview.js'
import { renderWorkspacePicker, type Translate, type WorkspaceSummaryLike } from './render.js'
import { collectRisks, validateDraft, type RiskEntry } from './validate.js'
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
  /** 概览用的只读状态快照（F3）。旧宿主 / 旧桩可能没有这个方法——调用点已防御。 */
  getStatus?(): Promise<RemoteResultLike>
}

/** 概览状态：available=false = 主插件未运行；status=null = 还没拉到 / 取数失败。 */
interface StatusState {
  available: boolean
  status: Record<string, unknown> | null
  error: string | null
}

/** 概览自动刷新间隔（§4.14：页面可见时每 30 秒一次）。 */
export const OVERVIEW_REFRESH_MS = 30_000

/** 面板 props（t 为宿主注入的翻译函数，语言切换自动重渲染）。 */
export interface OnebotSettingsPanelProps {
  t?: (key: string) => string
  remote: OnebotSettingsRemoteLike
  /** 第二入口（plugins.row.config）：不渲染页头。 */
  embedded?: boolean
}

/** 保存条状态（§4.11）：saved 之后 2 秒自动重新拉取快照并消失。 */
type SaveState = 'idle' | 'saving' | 'saved'

/** 缺省翻译（宿主未注入 t 时兜底读 zh 词条）。 */
function fallbackT(key: string): string {
  return zh[key] != null ? zh[key] : key
}

/**
 * 按 id 聚焦一个控件（§5.6：点保存时若有错误，跳到第一个错误所在子页并聚焦该字段）。
 * 只查文档里已渲染的元素；拿不到就安静跳过（测试/非浏览器环境）。
 */
function focusElement(id: string): void {
  if (typeof document === 'undefined' || document == null) return
  const getter = (document as { getElementById?: (id: string) => unknown }).getElementById
  if (typeof getter !== 'function') return
  const element = getter.call(document, id) as { focus?: () => void } | null
  if (element != null && typeof element.focus === 'function') element.focus()
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
  const [saveState, setSaveState] = React.useState<SaveState>('idle')
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState('')
  // §5.6 冲突：草稿保留到用户点「重新加载」；展开「查看我的修改」是独立开关。
  const [conflict, setConflict] = React.useState(false)
  const [showMine, setShowMine] = React.useState(false)
  // §4.12 危险确认对话框的风险清单（null = 不显示）。
  const [riskDialog, setRiskDialog] = React.useState<RiskEntry[] | null>(null)
  // §5.6 有错误时跳到第一个错误字段并聚焦（渲染后由 effect 落到 DOM）。
  const [focusTarget, setFocusTarget] = React.useState<string | null>(null)
  // 当前子页（§1.2：不写 URL，记在 state；F3 起默认打开概览）。
  const [page, setPage] = React.useState(OVERVIEW_PAGE_ID)
  const [query, setQuery] = React.useState('')
  const [changedOnly, setChangedOnly] = React.useState(false)
  // 概览状态（§4.14）：页头连接胶囊与概览子页共用同一份快照。
  const [status, setStatus] = React.useState<StatusState>({ available: true, status: null, error: null })
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

  /** 重新拉取快照（重试 / 冲突后重新加载 / 保存成功 2 秒后都走这里）。 */
  const refetch = () => {
    void remote.getSettings().then(result => {
      accept(unwrap(result) as OnebotSettingsSnapshot)
      setError(null)
      setNotice('')
    }).catch((cause: unknown) => {
      setError(messageOf(cause))
    })
  }

  /**
   * 拉一次概览状态（§4.14）。三种结果：
   * - 主插件在跑 → available:true + 快照；
   * - 主插件没跑（服务缺席）→ available:false（概览页 info 横幅）；
   * - Remote 本身失败 → 也按 available:false 处理（概览绝不因此报错）。
   * 旧桩没有 getStatus 方法时静默跳过（不报错、不进状态）。
   */
  const loadStatus = () => {
    void Promise.resolve()
      .then(() => (typeof remote.getStatus === 'function' ? remote.getStatus() : null))
      .then(result => {
        if (result == null) return
        const value = unwrap(result) as { available?: unknown; status?: unknown; error?: unknown } | null
        const available = value != null && value.available === true
        const detail = value != null && value.status != null && typeof value.status === 'object'
          ? value.status as Record<string, unknown>
          : null
        const failure = value != null && typeof value.error === 'string' && value.error !== '' ? value.error : null
        setStatus({ available, status: available ? detail : null, error: failure })
      })
      .catch(() => {
        setStatus({ available: false, status: null, error: null })
      })
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

  // 概览状态：挂载时拉一次（页头胶囊也用它）；旧桩没有 getStatus 时静默跳过。
  React.useEffect(() => {
    loadStatus()
  }, [remote])

  // §4.14 自动刷新：只在概览页可见时开定时器；离开概览页 / 卸载时清除
  // （effect 的 cleanup，绝不注册全局事件监听）。
  React.useEffect(() => {
    if (page !== OVERVIEW_PAGE_ID) return
    const timer = setInterval(() => { loadStatus() }, OVERVIEW_REFRESH_MS)
    return () => { clearInterval(timer) }
  }, [page, remote])

  // 提示（保存无改动等）3 秒后自动消失（§4.10）。
  React.useEffect(() => {
    if (notice === '') return
    const timer = setTimeout(() => { setNotice('') }, 3000)
    return () => { clearTimeout(timer) }
  }, [notice])

  // §4.11 保存成功：显示 success 文案 2 秒 → 自动重新拉取快照 → 保存条消失。
  React.useEffect(() => {
    if (saveState !== 'saved') return
    const timer = setTimeout(() => {
      setSaveState('idle')
      refetch()
    }, 2000)
    return () => { clearTimeout(timer) }
  }, [saveState])

  // §4.12 对话框打开时焦点移到「取消」。
  React.useEffect(() => {
    if (riskDialog == null || riskDialog.length === 0) return
    focusElement('qqc-risk-cancel')
  }, [riskDialog])

  // §5.6 有错误时跳过子页并聚焦第一个错误字段（渲染完成后才落到 DOM）。
  React.useEffect(() => {
    if (focusTarget == null) return
    focusElement('qqc-f-' + focusTarget)
    setFocusTarget(null)
  }, [focusTarget])

  /** 真正提交：computePatch → updateSettings(patch, expectedRevision)。 */
  const commit = () => {
    if (busy || snapshot == null || draft == null) return
    const computed = computePatch(draft, snapshot.config, { secretDraft: secretDraft, clearSecret: clearSecret })
    if (computed.invalidKeys.length > 0) {
      // validateDraft 已经拦过一遍；这里是 host validatePatch 的客户端预检兜底。
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
    setSaveState('saving')
    setConflict(false)
    setShowMine(false)
    void Promise.resolve().then(() => remote.updateSettings(computed.patch, snapshot.revision)).then(result => {
      accept(unwrap(result) as OnebotSettingsSnapshot)
      setClearSecret(false)
      setSecretDraft('')
      setSaveState('saved')
    }).catch((cause: unknown) => {
      setSaveState('idle')
      // §5.6：冲突走专用横幅（草稿保留，等用户点重新加载）；其它错误直接显示消息。
      if (isConflictError(cause)) {
        setConflict(true)
        setError(null)
      } else {
        setError(messageOf(cause))
      }
    }).finally(() => {
      setBusy(false)
    })
  }

  /**
   * 保存入口（保存按钮 / Ctrl+S）：
   * 1) 先校验——有错误则跳到第一个错误所在子页并聚焦该字段，不提交；
   * 2) 有危险项 → 弹 §4.12 对话框（确认后才走 commit）；
   * 3) 否则直接提交。
   */
  const save = () => {
    if (busy || snapshot == null || draft == null) return
    setError(null)
    setNotice('')
    setRiskDialog(null)
    const invalid = validateDraft(draft, t)
    const invalidKeys = ALL_FIELDS.filter(field => invalid[field.key] != null).map(field => field.key)
    if (invalidKeys.length > 0) {
      const firstKey = invalidKeys[0]
      const group = GROUPS.find(item => item.fields.some(field => field.key === firstKey))
      if (group != null) setPage(group.id)
      setFocusTarget(firstKey)
      return
    }
    const risks = collectRisks(draft, snapshot.config, { clearSecret: clearSecret })
    if (risks.length > 0) {
      setRiskDialog(risks)
      return
    }
    commit()
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
    setRiskDialog(null)
  }

  /** 冲突横幅的「重新加载（会丢弃未保存的修改）」。 */
  const reload = () => {
    setConflict(false)
    setShowMine(false)
    setSaveState('idle')
    setError(null)
    setNotice('')
    refetch()
  }

  /** 用户又在改草稿：撤掉「刚保存」态，避免 2 秒后的自动重拉把新改动冲掉。 */
  const markEdited = () => {
    if (saveState === 'saved') setSaveState('idle')
  }

  /** 恢复单个字段的默认值（只改草稿）。 */
  const resetField = (field: FieldMeta) => {
    if (draft == null) return
    markEdited()
    setDraft(Object.assign({}, draft, { [field.key]: snapshotValueToDraft(field, DEFAULTS[field.key]) }))
  }

  const commitTags = (field: FieldMeta, text: string) => {
    if (draft == null) return
    markEdited()
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
    status: status.status,
    statusAvailable: status.available,
    statusError: status.error,
    onRefreshStatus: () => { loadStatus() },
    secretSet: secretSet,
    clearSecret: clearSecret,
    tagInputs: tagInputs,
    workspace: workspace,
    busy: busy,
    saveState: saveState,
    conflict: conflict,
    conflictShowMine: showMine,
    riskDialog: riskDialog,
    onPageChange: (next: string) => { setPage(next) },
    onQueryChange: (next: string) => { setQuery(next) },
    onChangedOnlyChange: (next: boolean) => { setChangedOnly(next) },
    onRetry: () => { refetch() },
    onSave: () => { save() },
    onRevert: () => { revert() },
    onReload: () => { reload() },
    onToggleMine: () => { setShowMine(!showMine) },
    onRiskCancel: () => { setRiskDialog(null) },
    onRiskConfirm: () => { setRiskDialog(null); commit() },
    onChange: (field: FieldMeta, next: unknown) => {
      if (draft == null) return
      markEdited()
      setDraft(Object.assign({}, draft, { [field.key]: next }))
    },
    onSecretChange: (nextText: string) => {
      markEdited()
      setSecretDraft(nextText)
      if (draft == null) return
      setDraft(Object.assign({}, draft, { accessToken: nextText }))
    },
    onClearSecretChange: (next: boolean) => {
      markEdited()
      setClearSecret(next)
    },
    onResetField: (field: FieldMeta) => { resetField(field) },
    onTagInput: (field: FieldMeta, text: string) => {
      setTagInputs(Object.assign({}, tagInputs, { [field.key]: text }))
    },
    onTagCommit: (field: FieldMeta, text: string) => { commitTags(field, text) },
    onTagRemove: (field: FieldMeta, index: number) => {
      if (draft == null) return
      markEdited()
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
          markEdited()
          setDraft(fillWorkspacePath(draft, path))
        },
      })
    },
  })
}