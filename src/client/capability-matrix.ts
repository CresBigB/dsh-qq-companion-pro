/** 功能矩阵纯视图：能力信息与许可计算分别来自注册表和共享 helper。 */
import type { ReactElement } from 'react'
import { CAPABILITIES, type CapabilityDef, type CapabilityId } from '../capabilities.js'
import { getMatrixState, MATRIX_KEYS, type MatrixScope } from '../capability-matrix.js'
import type { ReactLike } from './react-runtime.js'
import { h, type Translate } from './render.js'
import { tagsOf } from './logic.js'
import { highlightSegments, normalizeQuery } from './search.js'

export const CAPABILITIES_PAGE_ID = 'capabilities'
export const MATRIX_SCOPES: readonly MatrixScope[] = ['owner', 'private', 'group']

export interface CapabilityMatrixOptions {
  t: Translate
  draft: Record<string, unknown>
  config: Record<string, unknown>
  query?: string
  changedOnly?: boolean
  disabled?: boolean
  onMatrixChange?: (id: CapabilityId, scope: MatrixScope, enabled: boolean) => void
}

/** 按能力比较9个规则中的成员关系；不会把一个大列表的改动标到所有行上。 */
export function capabilityRowChanged(draft: Readonly<Record<string, unknown>>, config: Readonly<Record<string, unknown>>, id: CapabilityId): boolean {
  return MATRIX_KEYS.some(key => tagsOf(draft[key]).includes(id) !== tagsOf(config[key]).includes(id))
}

export function matchingCapabilities(options: Pick<CapabilityMatrixOptions, 'draft' | 'config' | 'query' | 'changedOnly'>): readonly CapabilityDef[] {
  const query = normalizeQuery(options.query)
  return CAPABILITIES.filter(capability => {
    if (options.changedOnly === true && !capabilityRowChanged(options.draft, options.config, capability.id)) return false
    return query === '' || [capability.title, capability.id, capability.describe, ...capability.tools].some(text => text.toLowerCase().includes(query))
  })
}

/** 仅报告配置条件，绝不在浏览器假装已经检查过文件或TTS引擎。 */
export function capabilityDependencyNotes(capability: CapabilityDef, draft: Readonly<Record<string, unknown>>, t: Translate): { missing: boolean; notes: string[] } {
  const text = (key: string) => typeof draft[key] === 'string' ? draft[key].trim() : ''
  let missing = false
  const notes: string[] = []
  for (const dependency of capability.deps ?? []) {
    if (dependency === 'stickerLib' && text('stickerDir') === '') {
      missing = true
      notes.push(t('capabilities.dep.stickerLib'))
    } else if (dependency === 'memoryNote' && text('groupMemoryDir') === '' && text('publicMemoryFile') === '') {
      missing = true
      notes.push(t('capabilities.dep.memoryNote'))
    } else if (dependency === 'tts') {
      // sherpa可从默认目录发现模型；配置层不把空模型路径误判为不可用。
      const engineConfigured = draft.ttsEngine !== 'command' || text('ttsCommand') !== ''
      if (draft.ttsEnabled !== true || !engineConfigured) {
        missing = true
        notes.push(t('capabilities.dep.tts'))
      }
      notes.push(t('capabilities.dep.ttsRuntime'))
    }
  }
  return { missing, notes }
}

function highlighted(ReactImpl: ReactLike, text: string, query?: string): unknown[] {
  return highlightSegments(text, query).map((segment, index) => segment.hit
    ? h(ReactImpl, 'mark', { className: 'qqc-mark', key: index }, segment.text)
    : segment.text)
}

/** 原生checkbox的mixed状态需写DOM属性；仅作用于React交付的本控件。 */
function mixedRef(mixed: boolean): (node: { indeterminate: boolean } | null) => void {
  return node => { if (node != null) node.indeterminate = mixed }
}

export function renderCapabilityMatrix(ReactImpl: ReactLike, options: CapabilityMatrixOptions): ReactElement {
  const { t, draft, config } = options
  const supported = Array.isArray(config.ownerDeny)
  const rows = matchingCapabilities(options)
  return h(ReactImpl, 'section', { className: 'qqc-card qqc-cap-matrix', 'data-role': 'capability-matrix' },
    h(ReactImpl, 'div', { className: 'qqc-card-head' },
      h(ReactImpl, 'h3', { className: 'qqc-card-title' }, t('capabilities.title')),
      h(ReactImpl, 'p', { className: 'qqc-card-desc' }, t('capabilities.scopeNote')),
      h(ReactImpl, 'p', { className: 'qqc-card-desc' }, t('capabilities.guardNote')),
      h(ReactImpl, 'p', { className: 'qqc-card-desc' }, t('capabilities.globalNote')),
      supported ? null : h(ReactImpl, 'p', { className: 'qqc-cap-upgrade', role: 'status' }, t('capabilities.restartRequired'))),
    h(ReactImpl, 'div', { className: 'qqc-cap-head', 'aria-hidden': true },
      h(ReactImpl, 'span', null, t('capabilities.function')),
      MATRIX_SCOPES.map(scope => h(ReactImpl, 'span', { key: scope }, t('capabilities.scope.' + scope)))),
    rows.length === 0 ? h(ReactImpl, 'div', { className: 'qqc-empty' }, t('capabilities.empty')) : rows.map(capability => {
      const dependency = capabilityDependencyNotes(capability, draft, t)
      const changed = capabilityRowChanged(draft, config, capability.id)
      const mixed = getMatrixState(draft, capability.id, 'private') === 'mixed'
      const noteId = 'qqc-cap-note-' + capability.id
      return h(ReactImpl, 'div', {
        className: 'qqc-cap-row', key: capability.id, 'data-capability': capability.id,
        'data-dirty': changed || undefined, 'data-needs-config': dependency.missing || undefined,
      },
        h(ReactImpl, 'div', { className: 'qqc-cap-meta' },
          h(ReactImpl, 'div', { className: 'qqc-cap-title' },
            ...highlighted(ReactImpl, capability.title, options.query),
            dependency.missing ? h(ReactImpl, 'span', { className: 'qqc-badge' }, t('capabilities.needsConfig')) : null,
            changed ? h(ReactImpl, 'span', { className: 'qqc-badge', 'data-tone': 'brand' }, t('badge.dirty')) : null),
          h(ReactImpl, 'div', { className: 'qqc-cap-tools' }, capability.tools.map(tool => h(ReactImpl, 'code', { key: tool }, ...highlighted(ReactImpl, tool, options.query)))),
          h(ReactImpl, 'p', { className: 'qqc-cap-desc' }, ...highlighted(ReactImpl, capability.describe, options.query)),
          h(ReactImpl, 'div', { id: noteId, className: 'qqc-cap-notes' },
            dependency.notes.map((note, index) => h(ReactImpl, 'p', { key: index }, note)),
            mixed ? h(ReactImpl, 'p', { 'data-role': 'capability-mixed-note' }, t('capabilities.mixedNote')) : null)),
        MATRIX_SCOPES.map(scope => {
          const state = getMatrixState(draft, capability.id, scope)
          return h(ReactImpl, 'label', { className: 'qqc-cap-check', key: scope, 'data-scope': scope },
            h(ReactImpl, 'input', {
              type: 'checkbox', checked: state === 'on', ref: mixedRef(state === 'mixed'),
              'aria-checked': state === 'mixed' ? 'mixed' : state === 'on',
              'aria-label': capability.title + ' · ' + t('capabilities.scope.' + scope),
              'aria-describedby': noteId, 'data-state': state,
              disabled: options.disabled === true || !supported,
              onChange: (event: { target: { checked: boolean } }) => {
                if (options.disabled === true || !supported) return
                options.onMatrixChange?.(capability.id, scope, event.target.checked)
              },
            }),
            h(ReactImpl, 'span', { className: 'qqc-cap-scope' }, t('capabilities.scope.' + scope)))
        }))
    }))
}
