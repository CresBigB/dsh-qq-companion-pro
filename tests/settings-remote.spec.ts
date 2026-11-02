/**
 * onebotSettings Typert Remote 服务测试。
 *
 * 三步主链路（PLAN 验收）：
 *   ① 写设置（updateSettings 合并写入 dsh-onebot 覆盖行）；
 *   ② 读快照（getSettings 返回的 revision 随已提交变更递增）；
 *   ③ 非法 revision 拒写（RemoteError onebot-settings/conflict，不落盘不递增）。
 *
 * 宿主 configEditor 以最小契约替身模拟（entries()/edit() 的持久化语义对齐
 * dsh-config-editor/lib/index.js:63-123：change(current, inherited) → next 作
 * 为覆盖行写 patch 文档、等价继承层时整行删除、成功后 entry.options.config
 * 更新；真实宿主侧的文件锁/原子写/失败回滚由宿主保证，此处只验证 Remote 的
 * 合并、revision、脱敏与校验行为）。
 * §3/§3.1/§4。
 * @module dsh-qq-companion/tests/settings-remote
 */
import { isDeepStrictEqual } from 'node:util'

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'

import {
  ALL_KEYS,
  ENTRY_ID,
  EXCLUDED_KEYS,
  NAMESPACE,
  OnebotSettingsService,
  SCHEMA_DEFAULTS,
  SETTINGS_GROUPS,
  createOnebotSettingsMethods,
  createRevisionState,
  getSettings,
  listWorkspaces,
  updateSettings,
  validatePatch,
} from '../src/settings-remote.js'
import { Config } from '../src/config.js'
import type { WorkspaceRegistryLike } from '../src/bridge.js'

/** configEditor 最小替身：rows = profile patch 中 dsh-onebot 的覆盖行文档。 */
class FakeConfigEditor {
  /** 模拟 profile patch 文档中的覆盖行（含持久层落盘断言目标）。 */
  rows: Array<{ id: string; config: Record<string, unknown> }> = []
  writeCount = 0
  /** edit 调用总数（含失败）——「失败不重试」断言用。 */
  editCalls = 0
  failNextEdit: Error | null = null
  /** 模拟宿主「原子写已落盘 → reconcile 失败 → 逐字节还原 → rethrow」
   *。 */
  rollbackSimulate = false
  entry: {
    options: { id: string; name: string; config: Record<string, unknown> }
    fiber: { state: number } | undefined
  }

  constructor(config: Record<string, unknown> = {}) {
    this.entry = { options: { id: ENTRY_ID, name: '/tmp/deploy/dsh-onebot/lib/index.js', config: { ...config } }, fiber: { state: 2 } }
  }

  entries() {
    return [this.entry]
  }

  async edit(entry: { options: { id: string; config: Record<string, unknown> } }, change: (current: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>) {
    this.editCalls += 1
    if (this.rollbackSimulate) {
      const before = structuredClone(entry.options.config)
      const next = change({ ...entry.options.config }, {})
      entry.options.config = structuredClone(next) // 步 14：原子写已替换文件
      entry.options.config = structuredClone(before) // 步 15 失败：宿主 L127 逐字节还原
      throw new Error('reconcile failed: dsh-onebot entry did not activate')
    }
    if (this.failNextEdit) {
      const error = this.failNextEdit
      this.failNextEdit = null
      throw error
    }
    this.writeCount += 1
    const next = change({ ...entry.options.config }, {})
    const index = this.rows.findLastIndex((row) => row.id === entry.options.id)
    if (isDeepStrictEqual(next, {})) {
      if (index >= 0) this.rows.splice(index, 1) // 等价继承层 → 覆盖行整行删除
    } else if (index >= 0) {
      this.rows[index] = { id: entry.options.id, config: structuredClone(next) }
    } else {
      this.rows.push({ id: entry.options.id, config: structuredClone(next) })
    }
    entry.options.config = structuredClone(next) // reconcile 已应用的运行态
  }
}

function errorCode(error: unknown): string {
  return (error as { code?: string }).code ?? ''
}

/** descriptor 参数名单（全 positional 断言用）：解构/默认值/rest 都会破坏逐字匹配。 */
function parameterNames(fn: Function): string[] {
  const text = fn.toString()
  const head = text.slice(0, text.indexOf(')') + 1)
  const inner = head.slice(head.indexOf('(') + 1, -1).trim()
  return inner === '' ? [] : inner.split(',').map((part) => part.trim())
}

describe('设置页覆盖清单 — 146 键自检（后端新增键忘了上页会在这里失败）', () => {
  const schemaKeys = Object.keys((Config as unknown as { dict: Record<string, unknown> }).dict)

  it('排除列表与上页键不重叠：ALL_KEYS ∩ EXCLUDED_KEYS = ∅', () => {
    for (const key of EXCLUDED_KEYS) expect(ALL_KEYS).not.toContain(key)
  })

  it('Config.dict 的键 − 排除列表 = ALL_KEYS（161 − 15 = 146）', () => {
    const onPage = schemaKeys.filter((key) => !EXCLUDED_KEYS.includes(key))
    expect([...onPage].sort()).toEqual([...ALL_KEYS].sort())
    expect(schemaKeys).toHaveLength(161)
    expect(ALL_KEYS).toHaveLength(146)
    expect(schemaKeys.filter(key => EXCLUDED_KEYS.includes(key))).toHaveLength(15)
  })

  it('ALL_KEYS 不重不漏：跨分组与分组内都无重复，每个子页都至少有一个键', () => {
    expect(new Set(ALL_KEYS).size).toBe(ALL_KEYS.length)
    for (const keys of Object.values(SETTINGS_GROUPS)) {
      expect(keys.length).toBeGreaterThan(0)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('每个上页键都被 kindOf 识别（不支持的键会在模块加载时抛错，此处核对默认值可读）', () => {
    for (const key of ALL_KEYS) expect(Object.hasOwn(SCHEMA_DEFAULTS, key)).toBe(true)
    // 反向：不上页的 5 个键不进 SCHEMA_DEFAULTS（sttReplacements 是 dict、scheduledPrompts 是对象数组）
    for (const key of EXCLUDED_KEYS) expect(Object.hasOwn(SCHEMA_DEFAULTS, key)).toBe(false)
  })
})

describe('onebotSettings remote — 三步主链路（写设置 → revision 递增 → 非法 revision 拒写）', () => {
  it('step 0: getSettings 返回基线快照（revision 0、schema 默认值、脱敏、分组、effect）', () => {
    const editor = new FakeConfigEditor()
    const state = createRevisionState()
    const snapshot = getSettings(editor, state)
    expect(snapshot.revision).toBe(0)
    expect(snapshot.entryActive).toBe(true)
    expect(Object.keys(snapshot.config).sort()).toEqual([...ALL_KEYS].sort())
    expect(snapshot.config.requireMention).toBe(SCHEMA_DEFAULTS.requireMention)
    expect(snapshot.config.port).toBe(SCHEMA_DEFAULTS.port)
    expect(snapshot.config.interimRecallMs).toBe(SCHEMA_DEFAULTS.interimRecallMs)
    expect(snapshot.config.accessToken).toBe('') // 未配置：脱敏位空
    expect(snapshot.secrets).toEqual([{ path: ['accessToken'], set: false }])
    expect(snapshot.groups).toEqual(SETTINGS_GROUPS)
    expect(snapshot.effect).toBe('restart')
    // 无变更的重复读不递增。
    expect(getSettings(editor, state).revision).toBe(0)
  })

  it('step 1: updateSettings 合并写入覆盖行并递增 revision', async () => {
    const editor = new FakeConfigEditor({ host: '127.0.0.1', port: 18643 }) // 现网手改键保持不动
    const state = createRevisionState()
    expect(getSettings(editor, state).revision).toBe(0)

    const written = await updateSettings(editor, state, { requireMention: false, port: 20001 })
    expect(written.revision).toBe(1) // ② 读快照 revision 递增
    expect(written.config.requireMention).toBe(false)
    expect(written.config.port).toBe(20001)
    expect(editor.writeCount).toBe(1)
    // 持久层断言：覆盖行出现对应键（等价 的 profile patch dsh-onebot 行）。
    expect(editor.rows).toHaveLength(1)
    expect(editor.rows[0].id).toBe(ENTRY_ID)
    expect(editor.rows[0].config.requireMention).toBe(false)
    expect(editor.rows[0].config.port).toBe(20001)
    expect(editor.rows[0].config.host).toBe('127.0.0.1') // 非本次写入的原键保留

    // 重复读稳定在同一 revision；下一次读侧观察不再递增。
    expect(getSettings(editor, state).revision).toBe(1)
  })

  it('step 2: 非法 expectedRevision 拒写（conflict，不落盘、revision 不变），正确 revision 可重放', async () => {
    const editor = new FakeConfigEditor()
    const state = createRevisionState()
    await updateSettings(editor, state, { requireMention: false })

    let caught: unknown
    try {
      await updateSettings(editor, state, { requireMention: true }, 0) // ③ 过期 revision
    } catch (error) {
      caught = error
    }
    expect(errorCode(caught)).toBe('onebot-settings/conflict')
    expect((caught as { details?: { expected: number; actual: number } }).details).toEqual({ expected: 0, actual: 1 })
    expect(editor.writeCount).toBe(1) // 拒写不落盘
    expect(editor.rows[0].config.requireMention).toBe(false) // 覆盖行原值未动
    expect(getSettings(editor, state).revision).toBe(1) // 拒写不递增

    // 客户端按 取新快照后以正确 revision 重放。
    const replayed = await updateSettings(editor, state, { requireMention: true }, 1)
    expect(replayed.revision).toBe(2)
    expect(replayed.config.requireMention).toBe(true)
  })
})

describe('onebotSettings remote — revision/no-op/失败路径', () => {
  it('no-op（合并结果与当前生效 config 全等）不写盘、不递增', async () => {
    const editor = new FakeConfigEditor()
    const state = createRevisionState()
    await updateSettings(editor, state, { port: 20001 })
    const before = getSettings(editor, state).revision
    const writes = editor.writeCount

    const noop = await updateSettings(editor, state, { port: 20001 })
    expect(noop.revision).toBe(before)
    expect(editor.writeCount).toBe(writes)
  })

  it('edit 失败（宿主侧校验/激活失败回滚）归一为 onebot-settings/edit-failed，revision 不递增、运行态不变', async () => {
    const editor = new FakeConfigEditor()
    const state = createRevisionState()
    await updateSettings(editor, state, { port: 20001 })
    const before = getSettings(editor, state).revision
    editor.failNextEdit = new Error('Configuration plugin is no longer active')

    await expect(updateSettings(editor, state, { requireMention: false })).rejects.toMatchObject({
      code: 'onebot-settings/edit-failed',
      message: expect.stringContaining('插件当前未激活'),
    })
    expect(getSettings(editor, state).revision).toBe(before)
    expect(editor.entry.options.config.requireMention).toBeUndefined() // 无半态
  })

  it('外部来源的已提交变更（手改 patch / 宿主原生设置页）同样使读侧 revision 递增', () => {
    const editor = new FakeConfigEditor()
    const state = createRevisionState()
    expect(getSettings(editor, state).revision).toBe(0)
    // 模拟 HMR 应用了外部手改（不经本 Remote）。
    editor.entry.options.config = { ...editor.entry.options.config, interimRecallMs: 60_000 }
    expect(getSettings(editor, state).revision).toBe(1)
  })
})

describe('onebotSettings remote — 输入校验与脱敏', () => {
  it('未知键 / 类型不符 / 非 object patch 整单拒绝且不落盘不递增', async () => {
    const editor = new FakeConfigEditor()
    const state = createRevisionState()
    const before = getSettings(editor, state).revision
    const writes = editor.writeCount

    // mediaDir 等旧外来键现已上页；这里用真正不在白名单里的键验证整单拒绝。
    for (const patch of [{ notASetting: 1 }, { port: '20001' }, { mode: 'both' }, { allowFrom: '12345' }, 'port=1', null]) {
      await expect(updateSettings(editor, state, patch)).rejects.toMatchObject({ code: 'onebot-settings/bad-request' })
    }
    expect(editor.writeCount).toBe(writes)
    expect(getSettings(editor, state).revision).toBe(before)
  })

  it('accessToken 快照脱敏不回显明文；明文仅落持久层；空串 = 清空', async () => {
    const editor = new FakeConfigEditor()
    const state = createRevisionState()
    const baseline = getSettings(editor, state)
    expect(baseline.secrets).toEqual([{ path: ['accessToken'], set: false }])

    const written = await updateSettings(editor, state, { accessToken: 'super-secret' }, baseline.revision)
    expect(written.config.accessToken).toBe('') // 快照脱敏：不回显明文
    expect(written.secrets).toEqual([{ path: ['accessToken'], set: true }])
    expect(editor.rows[0].config.accessToken).toBe('super-secret') // 持久层明文（宿主既有管道行为）
    expect(JSON.stringify(written)).not.toContain('super-secret')

    const cleared = await updateSettings(editor, state, { accessToken: '' }, written.revision)
    expect(cleared.config.accessToken).toBe('')
    expect(cleared.secrets).toEqual([{ path: ['accessToken'], set: false }])
    expect(editor.rows[0].config.accessToken).toBe('')
  })
})

describe('onebotSettings remote — descriptor 契约与降级形态', () => {
  it('descriptor 方法全 positional：getSettings() / updateSettings(patch, expectedRevision)', async () => {
    const editor = new FakeConfigEditor()
    const methods = createOnebotSettingsMethods(editor)
    expect(parameterNames(methods.getSettings)).toEqual([])
    expect(parameterNames(methods.updateSettings)).toEqual(['patch', 'expectedRevision'])

    // 真实 cordis 根 Context 上实例化 typert 服务（类方法面 = descriptor 面）。
    const ctx = new Context()
    ctx.reflect.provide('configEditor', editor)
    const service = new OnebotSettingsService(ctx)
    expect(service.name).toBe(NAMESPACE)
    expect(parameterNames(service.getSettings)).toEqual([])
    expect(parameterNames(service.updateSettings)).toEqual(['patch', 'expectedRevision'])
    expect(await service.updateSettings({ botQQ: '10001' })).toMatchObject({ revision: 1, config: { botQQ: '10001' } })
    expect(await service.getSettings()).toMatchObject({ revision: 1 })
  })

  it('createOnebotSettingsMethods 与 descriptor 方法共享同一实现语义', async () => {
    const editor = new FakeConfigEditor()
    const methods = createOnebotSettingsMethods(editor)
    const first = await methods.updateSettings({ botQQ: '10001' })
    expect(first.revision).toBe(1)
    expect(await methods.getSettings()).toMatchObject({ revision: 1, config: { botQQ: '10001' } })
  })

  it('dsh-onebot 条目不存在时显式报错（no-entry），不得静默', async () => {
    const empty = { entries: () => [], edit: async () => undefined }
    expect(() => getSettings(empty, createRevisionState())).toThrow(ENTRY_ID)
    await expect(updateSettings(empty, createRevisionState(), { port: 1 })).rejects.toMatchObject({
      code: 'onebot-settings/no-entry',
    })
  })

  it('条目失活（fiber 缺失/非 active）在快照中如实标记 entryActive=false', () => {
    const editor = new FakeConfigEditor()
    editor.entry.fiber = undefined
    expect(getSettings(editor, createRevisionState()).entryActive).toBe(false)
  })
})

describe('onebotSettings remote — 白名单扩展', () => {
  const NEW_BOOLEAN_KEYS = ['actionAuditEnabled', 'traceEnabled'] as const
  /** 期望默认值（摘自 src/index.ts schema：actionAuditEnabled/injectDryRun 默认开，其余默认关）。 */
  const NEW_DEFAULTS: Record<string, boolean> = {
    actionAuditEnabled: true,
    traceEnabled: false,
  }

  it('新键入快照：默认值正确、落在 diagnostics 组、计入 ALL_KEYS', () => {
    const editor = new FakeConfigEditor()
    const snapshot = getSettings(editor, createRevisionState())
    expect(ALL_KEYS).toHaveLength(Object.values(SETTINGS_GROUPS).flat().length)
    expect(snapshot.groups.diagnostics).toEqual([...SETTINGS_GROUPS.diagnostics])
    for (const key of NEW_BOOLEAN_KEYS) {
      expect(SETTINGS_GROUPS.diagnostics).toContain(key)
      expect(snapshot.config[key]).toBe(NEW_DEFAULTS[key])
    }
  })

  it('新键布尔写入进入覆盖行并递增 revision；与既有键混合 patch 一次写完成', async () => {
    const editor = new FakeConfigEditor()
    const state = createRevisionState()
    const written = await updateSettings(editor, state, { traceEnabled: true, actionAuditEnabled: false, port: 20001 })
    expect(written.revision).toBe(1)
    expect(written.config.traceEnabled).toBe(true)
    expect(written.config.actionAuditEnabled).toBe(false)
    expect(editor.writeCount).toBe(1)
    expect(editor.rows[0].config.traceEnabled).toBe(true)
    expect(editor.rows[0].config.actionAuditEnabled).toBe(false)
  })

  it('新键非布尔值拒写（bad-request，edit 零调用、revision 不变）', async () => {
    const editor = new FakeConfigEditor()
    const state = createRevisionState()
    const before = getSettings(editor, state).revision
    const writes = editor.editCalls

    for (const [key, value] of [
      ['actionAuditEnabled', 'yes'],
      ['traceEnabled', 1],
      ['traceEnabled', null],
      ['actionAuditEnabled', ['true']],
    ] as const) {
      await expect(updateSettings(editor, state, { [key]: value })).rejects.toMatchObject({ code: 'onebot-settings/bad-request' })
    }
    expect(editor.editCalls).toBe(writes) // 拒写绝不触达宿主 edit
    expect(getSettings(editor, state).revision).toBe(before)
  })
})

describe('onebotSettings remote — 失败守卫（configEditor 失败场景：归一 + 零补偿写）', () => {
  it('锁冲突（宿主文件锁超时）归一为中文 edit-failed：不重试、不补偿写、revision 不递增', async () => {
    const editor = new FakeConfigEditor({ host: '127.0.0.1' })
    const state = createRevisionState()
    const baseline = getSettings(editor, state)
    editor.failNextEdit = new Error('atomic-write: timed out waiting for the writer lock at /dsh/profiles/web/package.json.lock')

    await expect(updateSettings(editor, state, { traceEnabled: true })).rejects.toMatchObject({
      code: 'onebot-settings/edit-failed',
      message: expect.stringContaining('文件锁'),
      details: { hostMessage: expect.stringContaining('writer lock') },
    })
    expect(editor.editCalls).toBe(1) // 单次调用，插件侧无重试
    expect(editor.rows).toHaveLength(0) // 无补偿写：覆盖行保持失败前形态
    const after = getSettings(editor, state)
    expect(after.revision).toBe(baseline.revision)
    expect(after.config).toEqual(baseline.config) // 逐键等于写前生效值
  })

  it('校验拒绝（宿主 schema/resolveConfig 失败）归一转发，原覆盖行逐键不动', async () => {
    const editor = new FakeConfigEditor({ port: 8643 })
    const state = createRevisionState()
    const baseline = getSettings(editor, state)
    editor.failNextEdit = new Error('Invalid config: expected port to be a number in range')

    await expect(updateSettings(editor, state, { port: 20001, requireMention: false })).rejects.toMatchObject({
      code: 'onebot-settings/edit-failed',
      message: expect.stringContaining('宿主 configEditor 拒绝'),
    })
    expect(editor.rows).toHaveLength(0)
    expect(editor.entry.options.config).toEqual({ port: 8643 }) // 原覆盖行不动
    expect(getSettings(editor, state)).toMatchObject({ revision: baseline.revision })
  })

  it('激活失败回滚（写后 reconcile 失败 → 宿主还原）→ 快照恢复旧值、revision 不递增、无半态', async () => {
    const editor = new FakeConfigEditor()
    const state = createRevisionState()
    const baseline = getSettings(editor, state)
    editor.rollbackSimulate = true

    await expect(updateSettings(editor, state, { traceEnabled: true, actionAuditEnabled: false })).rejects.toMatchObject({
      code: 'onebot-settings/edit-failed',
      message: expect.stringContaining('写入失败'),
    })
    const after = getSettings(editor, state)
    expect(after.revision).toBe(baseline.revision) // 回滚后指纹与写前一致 → 不递增
    expect(after.config).toEqual(baseline.config) // 逐键还原，无半态（新键无残留）
    expect(editor.entry.options.config.traceEnabled).toBeUndefined()
  })
})

describe('onebotSettings remote — workspacePath 白名单扩展（connection 组 27 键）', () => {
  it('workspacePath 入快照：默认值 \'\'、connection 组键序追加、ALL_KEYS 26→27', () => {
    const snapshot = getSettings(new FakeConfigEditor(), createRevisionState())
    expect(ALL_KEYS).toHaveLength(Object.values(SETTINGS_GROUPS).flat().length)
    expect(SCHEMA_DEFAULTS.workspacePath).toBe('')
    expect(SETTINGS_GROUPS.connection).toEqual(['host', 'port', 'accessToken', 'botQQ', 'workspacePath', 'sessionCwdMode', 'attachWorkspaceMode'])
    expect(snapshot.groups.connection).toEqual(SETTINGS_GROUPS.connection)
    expect(snapshot.config.workspacePath).toBe('')
  })

  it('workspacePath 写入走字符串通道：进覆盖行并递增 revision；非字符串拒写 bad-request 且 edit 零调用', async () => {
    const editor = new FakeConfigEditor({ botQQ: '10001' })
    const state = createRevisionState()
    const written = await updateSettings(editor, state, { workspacePath: '/vol2/ws/alpha' })
    expect(written.revision).toBe(1)
    expect(written.config.workspacePath).toBe('/vol2/ws/alpha')
    expect(editor.writeCount).toBe(1)
    expect(editor.rows[0].config.workspacePath).toBe('/vol2/ws/alpha')
    expect(editor.rows[0].config.botQQ).toBe('10001') // 非本次写入的原键保留

    const writes = editor.editCalls
    for (const value of [123, null, ['/vol2/ws/alpha'], true]) {
      await expect(updateSettings(editor, state, { workspacePath: value })).rejects.toMatchObject({
        code: 'onebot-settings/bad-request',
      })
    }
    expect(editor.editCalls).toBe(writes) // 拒写绝不触达宿主 edit
    expect(getSettings(editor, state).revision).toBe(1)
  })

  it('拒写语义不变：workspacePath patch 携过期 expectedRevision 仍 conflict、不落盘不递增', async () => {
    const editor = new FakeConfigEditor()
    const state = createRevisionState()
    const baseline = await updateSettings(editor, state, { workspacePath: '/a' })
    expect(baseline.revision).toBe(1)

    await expect(updateSettings(editor, state, { workspacePath: '/b' }, 0)).rejects.toMatchObject({
      code: 'onebot-settings/conflict',
    })
    expect(editor.writeCount).toBe(1)
    expect(editor.rows[0].config.workspacePath).toBe('/a')
    expect(getSettings(editor, state).revision).toBe(1)
  })
})

describe('onebotSettings remote — listWorkspaces（workspace 注册表只读查询：正常 + 缺席降级）', () => {
  const fakeRegistry = {
    list: () => [
      { id: 'ws-1', path: '/vol2/ws/alpha', sessionIds: ['s1', 's2', 's3'] },
      { id: 'ws-2', path: '/vol2/ws/beta', sessionIds: [] },
    ],
  } as unknown as WorkspaceRegistryLike

  it('正常态：list() 映射为 {id, path, sessionCount}（sessionCount=sessionIds 长度），available=true', () => {
    expect(listWorkspaces(fakeRegistry)).toEqual({
      available: true,
      workspaces: [
        { id: 'ws-1', path: '/vol2/ws/alpha', sessionCount: 3 },
        { id: 'ws-2', path: '/vol2/ws/beta', sessionCount: 0 },
      ],
    })
  })

  it('降级态：registry 缺席（undefined）/ 形状不符 / list() 抛错 → available=false 空列表，绝不抛错', () => {
    expect(listWorkspaces(undefined)).toEqual({ available: false, workspaces: [] })
    expect(listWorkspaces({} as unknown as WorkspaceRegistryLike)).toEqual({ available: false, workspaces: [] })
    const broken = { list: () => { throw new Error('workspace storage unavailable') } } as unknown as WorkspaceRegistryLike
    expect(listWorkspaces(broken)).toEqual({ available: false, workspaces: [] })
  })

  it('descriptor 方法全 positional：listWorkspaces() 0 参；createOnebotSettingsMethods 注入 registry 两态', async () => {
    const withRegistry = createOnebotSettingsMethods(new FakeConfigEditor(), undefined, fakeRegistry)
    expect(parameterNames(withRegistry.listWorkspaces)).toEqual([])
    expect(await withRegistry.listWorkspaces()).toMatchObject({ available: true })
    const withoutRegistry = createOnebotSettingsMethods(new FakeConfigEditor())
    expect(await withoutRegistry.listWorkspaces()).toEqual({ available: false, workspaces: [] })
  })

  it('服务面接线：ctx 提供 workspaceRegistry → service.listWorkspaces() 正常；缺席 → 降级 unavailable（服务照常可用）', async () => {
    const editor = new FakeConfigEditor()

    const ctxWith = new Context()
    ctxWith.reflect.provide('configEditor', editor)
    ctxWith.reflect.provide('workspaceRegistry', fakeRegistry)
    const serviceWith = new OnebotSettingsService(ctxWith)
    await expect(serviceWith.listWorkspaces()).resolves.toEqual({
      available: true,
      workspaces: [
        { id: 'ws-1', path: '/vol2/ws/alpha', sessionCount: 3 },
        { id: 'ws-2', path: '/vol2/ws/beta', sessionCount: 0 },
      ],
    })
    // 主链路不受辅助查询影响。
    expect(await serviceWith.getSettings()).toMatchObject({ revision: 0 })

    const ctxWithout = new Context()
    ctxWithout.reflect.provide('configEditor', editor)
    const serviceWithout = new OnebotSettingsService(ctxWithout)
    await expect(serviceWithout.listWorkspaces()).resolves.toEqual({ available: false, workspaces: [] })
    await expect(serviceWithout.updateSettings({ workspacePath: '/vol2/ws/beta' })).resolves.toMatchObject({
      revision: 1,
      config: { workspacePath: '/vol2/ws/beta' },
    })
  })
})

describe('onebotSettings remote — P1/newMessagePolicy 白名单扩展（conversation 子页首位）', () => {
  it("newMessagePolicy 入快照：默认 'queue'、落在 conversation 组「忙的时候」卡片首位", () => {
    const snapshot = getSettings(new FakeConfigEditor(), createRevisionState())
    expect(ALL_KEYS).toHaveLength(Object.values(SETTINGS_GROUPS).flat().length)
    expect(SCHEMA_DEFAULTS.newMessagePolicy).toBe('queue')
    const conversation = [...SETTINGS_GROUPS.conversation]
    expect(conversation.slice(0, 3)).toEqual(['newMessagePolicy', 'autoSteerPolicy', 'deferredTimeoutMs'])
    expect(snapshot.groups.conversation).toEqual(conversation)
    expect(snapshot.config.newMessagePolicy).toBe('queue')
    expect(snapshot.effect).toBe('restart') // 与全部 125 键同粒度：热重启生效
  })

  it('newMessagePolicy 写入走枚举通道：\'steer\' 合法进覆盖行并递增 revision；非法值拒写 bad-request 且 edit 零调用', async () => {
    const editor = new FakeConfigEditor()
    const state = createRevisionState()
    const written = await updateSettings(editor, state, { newMessagePolicy: 'steer' })
    expect(written.revision).toBe(1)
    expect(written.config.newMessagePolicy).toBe('steer')
    expect(editor.writeCount).toBe(1)
    expect(editor.rows[0].config.newMessagePolicy).toBe('steer')

    const writes = editor.editCalls
    for (const value of ['intercept', 'QUEUE', 1, null, true]) {
      await expect(updateSettings(editor, state, { newMessagePolicy: value })).rejects.toMatchObject({
        code: 'onebot-settings/bad-request',
      })
    }
    expect(editor.editCalls).toBe(writes) // 拒写绝不触达宿主 edit
    expect(getSettings(editor, state).revision).toBe(1)
    expect(getSettings(editor, state).config.newMessagePolicy).toBe('steer') // 拒写不改生效值
  })

  it('no-op 语义不变：写回当前生效值 \'queue\' 不递增 revision、零落盘', async () => {
    const editor = new FakeConfigEditor({ newMessagePolicy: 'queue' })
    const state = createRevisionState()
    const written = await updateSettings(editor, state, { newMessagePolicy: 'queue' })
    expect(written.revision).toBe(0)
    expect(editor.writeCount).toBe(0)
    expect(editor.rows).toHaveLength(0)
  })
})

describe('onebotSettings remote — autoSteerPolicy 白名单扩展（conversation 组，用户裁决 2026-10-12）', () => {
  it("autoSteerPolicy 入快照：默认 'admin'、紧跟 newMessagePolicy（conversation 组第 2 位）", () => {
    const snapshot = getSettings(new FakeConfigEditor(), createRevisionState())
    expect(ALL_KEYS).toHaveLength(Object.values(SETTINGS_GROUPS).flat().length)
    expect(SCHEMA_DEFAULTS.autoSteerPolicy).toBe('admin')
    const conversation = [...SETTINGS_GROUPS.conversation]
    expect(conversation.indexOf('autoSteerPolicy')).toBe(conversation.indexOf('newMessagePolicy') + 1)
    expect(snapshot.groups.conversation).toEqual(conversation)
    expect(snapshot.config.autoSteerPolicy).toBe('admin')
    expect(snapshot.effect).toBe('restart') // 与全部 125 键同粒度：热重启生效
  })

  it('autoSteerPolicy 写入走枚举通道：\'all\' 合法进覆盖行并递增 revision；非法值拒写 bad-request 且 edit 零调用', async () => {
    const editor = new FakeConfigEditor()
    const state = createRevisionState()
    const written = await updateSettings(editor, state, { autoSteerPolicy: 'all' })
    expect(written.revision).toBe(1)
    expect(written.config.autoSteerPolicy).toBe('all')
    expect(editor.writeCount).toBe(1)
    expect(editor.rows[0].config.autoSteerPolicy).toBe('all')

    const writes = editor.editCalls
    for (const value of ['admin ', 'ADMIN', 'member', 1, null, true]) {
      await expect(updateSettings(editor, state, { autoSteerPolicy: value })).rejects.toMatchObject({
        code: 'onebot-settings/bad-request',
      })
    }
    expect(editor.editCalls).toBe(writes) // 拒写绝不触达宿主 edit
    expect(getSettings(editor, state).revision).toBe(1)
    expect(getSettings(editor, state).config.autoSteerPolicy).toBe('all') // 拒写不改生效值
  })

  it('no-op 语义不变：写回当前生效值 \'admin\' 不递增 revision、零落盘', async () => {
    const editor = new FakeConfigEditor({ autoSteerPolicy: 'admin' })
    const state = createRevisionState()
    const written = await updateSettings(editor, state, { autoSteerPolicy: 'admin' })
    expect(written.revision).toBe(0)
    expect(editor.writeCount).toBe(0)
    expect(editor.rows).toHaveLength(0)
  })
})

describe('onebotSettings remote — deferredTimeoutMs 白名单扩展（conversation 组「忙的时候」卡片）', () => {
  it('deferredTimeoutMs 入快照：默认 600000、紧跟 autoSteerPolicy（conversation 组第 3 位）', () => {
    const snapshot = getSettings(new FakeConfigEditor(), createRevisionState())
    expect(ALL_KEYS).toHaveLength(Object.values(SETTINGS_GROUPS).flat().length)
    expect(SCHEMA_DEFAULTS.deferredTimeoutMs).toBe(600_000)
    const conversation = [...SETTINGS_GROUPS.conversation]
    expect(conversation.indexOf('deferredTimeoutMs')).toBe(conversation.indexOf('autoSteerPolicy') + 1)
    expect(snapshot.groups.conversation).toEqual(conversation)
    expect(snapshot.config.deferredTimeoutMs).toBe(600_000)
    expect(snapshot.effect).toBe('restart') // 与全部 125 键同粒度：热重启生效
  })

  it('deferredTimeoutMs 写入走数字通道（≥0）：合法值进覆盖行并递增 revision；非法值拒写 bad-request 且 edit 零调用', async () => {
    const editor = new FakeConfigEditor()
    const state = createRevisionState()
    const written = await updateSettings(editor, state, { deferredTimeoutMs: 300_000 })
    expect(written.revision).toBe(1)
    expect(written.config.deferredTimeoutMs).toBe(300_000)
    expect(editor.writeCount).toBe(1)
    expect(editor.rows[0].config.deferredTimeoutMs).toBe(300_000)

    const writes = editor.editCalls
    for (const value of [-1, '600000', null, true, Number.NaN]) {
      await expect(updateSettings(editor, state, { deferredTimeoutMs: value })).rejects.toMatchObject({
        code: 'onebot-settings/bad-request',
      })
    }
    expect(editor.editCalls).toBe(writes) // 拒写绝不触达宿主 edit
    expect(getSettings(editor, state).revision).toBe(1)
    expect(getSettings(editor, state).config.deferredTimeoutMs).toBe(300_000) // 拒写不改生效值
  })
})

describe('onebotSettings remote — 独立功能矩阵', () => {
  it('capabilities首组九键固定，access不再包含权限键，ownerDeny默认空', () => {
    const keys = ['capabilitiesDeny', 'ownerDeny', 'friendDeny', 'memberDeny', 'strangerDeny', 'ownerGrant', 'friendGrant', 'memberGrant', 'strangerGrant']
    const snapshot = getSettings(new FakeConfigEditor(), createRevisionState())
    expect(Object.keys(SETTINGS_GROUPS)[0]).toBe('capabilities')
    expect(SETTINGS_GROUPS.capabilities).toEqual(keys)
    expect(snapshot.groups.capabilities).toEqual(keys)
    expect(SETTINGS_GROUPS.access.filter(key => keys.includes(key))).toEqual([])
    expect(SCHEMA_DEFAULTS.ownerDeny).toEqual([])
    expect(snapshot.config.ownerDeny).toEqual([])
  })

  it('ownerDeny字符串数组可写；错误类型整单拒绝不落盘、不变revision', async () => {
    const editor = new FakeConfigEditor()
    const state = createRevisionState()
    const next = await updateSettings(editor, state, { ownerDeny: ['qq.send.image', ' future.id '] })
    expect(next.config.ownerDeny).toEqual(['qq.send.image', ' future.id '])
    expect(editor.rows[0].config.ownerDeny).toEqual(['qq.send.image', ' future.id '])
    const calls = editor.editCalls
    for (const invalid of ['qq.send.image', [1], ['qq.send.image', null], null, true]) {
      await expect(updateSettings(editor, state, { ownerDeny: invalid })).rejects.toMatchObject({ code: 'onebot-settings/bad-request' })
    }
    expect(editor.editCalls).toBe(calls)
    expect(getSettings(editor, state).revision).toBe(1)
    expect(getSettings(editor, state).config.ownerDeny).toEqual(['qq.send.image', ' future.id '])
  })
})

describe('onebotSettings remote — 表情包 4 键（media 子页「表情包库」卡片，用户待办 4）', () => {
  /** 规范 §1.2 的 11 个子页顺序（overview 不含配置键、不进 SETTINGS_GROUPS）。 */
  const GROUP_ORDER = ['capabilities', 'connection', 'private', 'group', 'access', 'persona', 'messaging', 'conversation', 'memory', 'media', 'diagnostics']

  it('十一个分组按规范顺序排列；表情包 4 键是 media 组前四位，stickerDir 默认空、单张上限默认 4MB', () => {
    const snapshot = getSettings(new FakeConfigEditor(), createRevisionState())
    expect(Object.keys(SETTINGS_GROUPS)).toEqual(GROUP_ORDER)
    expect([...SETTINGS_GROUPS.media].slice(0, 4)).toEqual(['stickerDir', 'stickerMaxCount', 'stickerMaxBytes', 'stickerDailyMax'])
    expect(snapshot.groups.media).toEqual([...SETTINGS_GROUPS.media])
    expect(ALL_KEYS).toHaveLength(Object.values(SETTINGS_GROUPS).flat().length)
    // kindOf 认得这 4 个键的类型（字符串 1 个 + 数字 3 个），不支持的会在模块加载时抛错。
    expect(SCHEMA_DEFAULTS.stickerDir).toBe('')
    expect(SCHEMA_DEFAULTS.stickerMaxCount).toBe(300)
    expect(SCHEMA_DEFAULTS.stickerMaxBytes).toBe(4 * 1024 * 1024)
    expect(SCHEMA_DEFAULTS.stickerDailyMax).toBe(20)
    expect(snapshot.config.stickerDir).toBe('')
    expect(snapshot.config.stickerMaxBytes).toBe(4 * 1024 * 1024)
  })

  it('四个键按各自通道写入（字符串 / 数字 ≥0）；非法值整单拒写且 edit 零调用', async () => {
    const editor = new FakeConfigEditor()
    const state = createRevisionState()
    const written = await updateSettings(editor, state, {
      stickerDir: 'E:\\To DeepSeek\\companion\\stickers', stickerMaxCount: 500, stickerMaxBytes: 8 * 1024 * 1024, stickerDailyMax: 0,
    })
    expect(written.revision).toBe(1)
    expect(written.config.stickerDir).toBe('E:\\To DeepSeek\\companion\\stickers')
    expect(written.config.stickerDailyMax).toBe(0) // 0 = 不再新存（当天额度用完的语义）
    expect(editor.rows[0].config).toMatchObject({ stickerMaxCount: 500, stickerMaxBytes: 8 * 1024 * 1024 })

    const writes = editor.editCalls
    for (const patch of [{ stickerDir: 42 }, { stickerMaxBytes: -1 }, { stickerMaxCount: '300' }, { stickerDailyMax: null }]) {
      await expect(updateSettings(editor, state, patch)).rejects.toMatchObject({ code: 'onebot-settings/bad-request' })
    }
    expect(editor.editCalls).toBe(writes)
    expect(getSettings(editor, state).config.stickerMaxCount).toBe(500) // 拒写不改生效值
  })
})

describe('onebotSettings remote — groupAutoQuote 白名单扩展（group 子页「回复方式」卡片，用户待办 8）', () => {
  it("groupAutoQuote 入快照：默认 'off'、落在 group 组「回复方式」位置", () => {
    const snapshot = getSettings(new FakeConfigEditor(), createRevisionState())
    expect(ALL_KEYS).toHaveLength(Object.values(SETTINGS_GROUPS).flat().length)
    expect(SCHEMA_DEFAULTS.groupAutoQuote).toBe('off')
    const group = [...SETTINGS_GROUPS.group]
    expect(group[9]).toBe('groupAutoQuote') // 「谁能用群/回复方式/怎么叫她」9 键之后
    expect(snapshot.groups.group).toEqual(group)
    expect(snapshot.config.groupAutoQuote).toBe('off')
    expect(snapshot.effect).toBe('restart') // 与全部 125 键同粒度：热重启生效
  })

  it("groupAutoQuote 写入走枚举通道：'busy'/'always' 合法进覆盖行并递增 revision；非法值拒写 bad-request 且 edit 零调用", async () => {
    const editor = new FakeConfigEditor()
    const state = createRevisionState()
    const written = await updateSettings(editor, state, { groupAutoQuote: 'busy' })
    expect(written.revision).toBe(1)
    expect(written.config.groupAutoQuote).toBe('busy')
    expect(editor.writeCount).toBe(1)
    expect(editor.rows[0].config.groupAutoQuote).toBe('busy')

    const writes = editor.editCalls
    for (const value of ['off ', 'ON', 'true', 1, null, true]) {
      await expect(updateSettings(editor, state, { groupAutoQuote: value })).rejects.toMatchObject({
        code: 'onebot-settings/bad-request',
      })
    }
    expect(editor.editCalls).toBe(writes) // 拒写绝不触达宿主 edit
    expect(getSettings(editor, state).revision).toBe(1)
    expect(getSettings(editor, state).config.groupAutoQuote).toBe('busy') // 拒写不改生效值
  })
})

describe('onebotSettings remote — taskEveryRounds 下限 1（validatePatch 与宿主 Config 一致）', () => {
  it('默认 1、落在 conversation 组第 5 位', () => {
    const snapshot = getSettings(new FakeConfigEditor(), createRevisionState())
    expect(SCHEMA_DEFAULTS.taskEveryRounds).toBe(1)
    expect(snapshot.config.taskEveryRounds).toBe(1)
    expect(SETTINGS_GROUPS.conversation.indexOf('taskEveryRounds')).toBe(4)
  })

  it('0 与负数整单拒写 bad-request 且 edit 零调用；1 / 2 正常写入并递增 revision', async () => {
    const editor = new FakeConfigEditor()
    const state = createRevisionState()
    const written = await updateSettings(editor, state, { taskEveryRounds: 2 })
    expect(written.revision).toBe(1)
    expect(written.config.taskEveryRounds).toBe(2)
    expect(editor.writeCount).toBe(1)
    expect(editor.rows[0].config.taskEveryRounds).toBe(2)

    const writes = editor.editCalls
    for (const value of [0, -1, '3', null, true, Number.NaN]) {
      await expect(updateSettings(editor, state, { taskEveryRounds: value })).rejects.toMatchObject({
        code: 'onebot-settings/bad-request',
      })
    }
    expect(editor.editCalls).toBe(writes) // 拒写绝不触达宿主 edit
    expect(getSettings(editor, state).revision).toBe(1)
    expect(getSettings(editor, state).config.taskEveryRounds).toBe(2) // 拒写不改生效值

    // 其它数字键的 0 语义不受影响（0 = 关闭，仍是合法值）。
    const restored = await updateSettings(editor, state, { taskEveryRounds: 1, deferredTimeoutMs: 0 })
    expect(restored.config.taskEveryRounds).toBe(1)
    expect(restored.config.deferredTimeoutMs).toBe(0)
  })

  it('validatePatch 单键校验：0 报 ≥1，1 / 2 放行', () => {
    expect(() => validatePatch({ taskEveryRounds: 0 })).toThrow(/taskEveryRounds 必须是 ≥1 的有限数字/)
    expect(validatePatch({ taskEveryRounds: 1 })).toEqual({ taskEveryRounds: 1 })
    expect(validatePatch({ taskEveryRounds: 2 })).toEqual({ taskEveryRounds: 2 })
    expect(validatePatch({ deferredTimeoutMs: 0 })).toEqual({ deferredTimeoutMs: 0 })
  })
})
