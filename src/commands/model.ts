/**
 * Model and environment commands: /model, /workspace and /preset.
 * @module dsh-qq-companion/commands/model
 */
import { CommandContext } from './types.js'
import { listPresets, resolveNumericSelection, safeDefaultModel } from './selection.js'
import { realpath, stat } from 'node:fs/promises'

import type { WorkspaceLike } from '../bridge.js'
import { type ChatId } from '../chat.js'

/** /model: show the current model (+ discoverable providers), or switch.
 * A bare switch retargets ONLY this chat's selection ref (it no
 * longer rewrites the deployment default — that is the explicit --default
 * form's job). */
export async function handleModelCommand(ctx: CommandContext, chatId: ChatId, arg: string): Promise<void> {
  const chat = ctx.getChat(chatId)
  const current = chat?.selectionRef?.current
    ?? safeDefaultModel(ctx)
  if (arg === '') {
    const cur = current !== undefined ? current.provider + '/' + current.model : '（未设置）'
    let out = '当前模型：' + cur
    const providerIds: string[] = []
    try {
      const providers = ctx.llmCatalog?.listProviders() ?? []
      for (const p of providers.slice(0, 6)) {
        providerIds.push(p.id)
        try {
          const models = (await ctx.llmCatalog?.listModels(p.id)) ?? []
          out += '\n' + p.id + ': ' + models.slice(0, 10).map(m => m.id).join(', ')
        } catch (error) {
          out += '\n' + p.id + ': （列表不可用）'
          ctx.log('warn', 'listModels failed for ' + p.id + ': ' + String(error))
        }
      }
    } catch (error) {
      out += '\n（模型列表不可用）'
      ctx.log('warn', 'listProviders failed: ' + String(error))
    }
    if (providerIds.length > 0) {
      // level-1 snapshot — provider ids only, capped like the display above.
      out += '\n可选来源：\n' + providerIds.map((id, i) => `${i + 1}. ${id}`).join('\n')
      out += '\n回复 /model <序号> 查看该来源的模型。'
      ctx.setPendingSelection(chatId, {
        kind: 'model',
        phase: 'providers',
        items: providerIds.map(id => ({ label: id, payload: id })),
        createdAt: Date.now(),
      })
    }
    await ctx.sendToChat(chatId, out)
    return
  }
  // a pure-numeric argument is a serial-number pick against the snapshot
  // the bare form rendered — without a live one, the original semantics below
  // run unchanged (and /model --default keeps working: it is not numeric).
  const picked = await resolveNumericSelection(ctx, chatId, 'model', arg, '/model')
  if (picked === null) return
  if (picked !== undefined) {
    if (picked.phase === 'providers') {
      // Level-1 hit: render that provider's numbered model list.
      await sendModelPickList(ctx, chatId, picked.payload)
      return
    }
    if (picked.phase === 'models' && picked.provider !== undefined) {
      // Level-2 hit: re-enter the ORIGINAL switch path below with
      // '<provider> <model>' (precheck, reply texts and scoping untouched).
      arg = picked.provider + ' ' + picked.payload
    }
  }
  const first = arg.split(/\s+/, 1)[0] ?? ''
  const toDefault = first === '--default'
  const rest = toDefault ? arg.slice(first.length).trim() : arg
  const m = /^(\S+)[\s/]+(\S+)$/.exec(rest)
  if (m === null) {
    await ctx.sendToChat(chatId, '❌ 参数不完整或无法识别。\n用法：/model <provider> <model> 切换当前会话；/model --default <provider> <model> 修改部署默认')
    return
  }
  const provider = m[1]
  const model = m[2]
  try {
    const models = (await ctx.llmCatalog?.listModels(provider)) ?? []
    if (models.length > 0 && !models.some(x => x.id === model)) {
      await ctx.sendToChat(chatId, `❌ ${provider} 下没有模型 ${model}。可用：` + models.slice(0, 10).map(x => x.id).join(', ') + '\n用法：/model <provider> <model> 切换；/model 查看序号列表')
      return
    }
  } catch (error) {
    ctx.log('debug', 'model switch precheck failed for ' + provider + ': ' + String(error))
  }
  const next = { provider, model }
  if (toDefault) {
    // Explicit --default: rewrite the deployment-wide default only.
    if (ctx.agentDefaultModel !== undefined) {
      try {
        await ctx.agentDefaultModel.saveSelection(next)
      } catch (error) {
        ctx.log('warn', 'saveSelection failed: ' + String(error))
      }
    }
    await ctx.sendToChat(chatId, `✅ 已修改部署默认模型：${provider}/${model}（下一步生效）`)
    return
  }
  // Bare switch: retarget only this chat's selection ref — never the global
  // default.
  if (chat?.selectionRef !== undefined) {
    // Keep the chat's thinking level (e.g. groupReasoningEffort) across a model switch.
    const effort = chat.selectionRef.current?.reasoningEffort
    chat.selectionRef.current = effort === undefined ? next : { ...next, reasoningEffort: effort }
  }
  await ctx.sendToChat(chatId, `✅ 已切换当前会话模型：${provider}/${model}（下一步生效）`)
}

/** level-2 model list for one provider: renders the numbered models and
 * snapshots them (phase 'models') so the next `/model <序号>` hits the
 * original per-chat switch path with '<provider> <model>'. */
export async function sendModelPickList(ctx: CommandContext, chatId: ChatId, provider: string): Promise<void> {
  let models
  try {
    models = (await ctx.llmCatalog?.listModels(provider)) ?? []
  } catch (error) {
    ctx.log('warn', 'listModels failed for ' + provider + ': ' + String(error))
    await ctx.sendToChat(chatId, `❌ 无法列出 ${provider} 的模型，请重新执行 /model 查看。`)
    return
  }
  const shown = models.slice(0, 10)
  if (shown.length === 0) {
    await ctx.sendToChat(chatId, `（${provider} 下没有可用模型，请重新执行 /model 查看。）`)
    return
  }
  ctx.setPendingSelection(chatId, {
    kind: 'model',
    phase: 'models',
    provider,
    items: shown.map(m => ({ label: m.id, payload: m.id })),
    createdAt: Date.now(),
  })
  await ctx.sendToChat(chatId, `模型列表（${provider}）：\n` + shown.map((m, i) => `${i + 1}. ${m.id}`).join('\n') + '\n回复 /model <序号> 切换当前会话模型。')
}

/** /workspace: show current cwd, list workspaces, or switch directory. */
export async function handleWorkspaceCommand(ctx: CommandContext, chatId: ChatId, arg: string): Promise<void> {
  if (arg === '') {
    const cwd = ctx.effectiveCwd(chatId)
    let suffix = ''
    let workspace: WorkspaceLike | undefined
    try {
      workspace = await ctx.workspaceRegistry?.resolveByPath(cwd)
      suffix = workspace !== undefined ? `（工作区 ${workspace.id}，${workspace.sessionIds.length} 个会话）` : '（无 workspace 记录）'
    } catch (error) {
      ctx.log('debug', 'resolveByPath failed: ' + String(error))
    }
    // 归入状态：宿主按工作区分组网页会话列表，所以这里直接问工作区的
    // sessionIds 是否已经包含当前会话（不是靠猜 effectiveCwd）。
    const sessionId = ctx.getChat(chatId)?.sessionId
    let attachLine: string
    if (sessionId === undefined) {
      attachLine = '归入状态：（当前没有活跃会话，下一条消息建会话时会自动归入）'
    } else if (workspace !== undefined && workspace.sessionIds.includes(sessionId)) {
      attachLine = '归入状态：✅ 已归入工作区 ' + workspace.id
    } else {
      attachLine = '归入状态：❌ 未归入工作区（发 /workspace attach 立即挂上）'
    }
    let out = `当前工作目录：${cwd} ${suffix}\n` + attachLine + '\n用法：/workspace <目录路径> 切换；/workspace list 列出全部；/workspace attach 归入工作区'
    // snapshot the numbered list — a following `/workspace <序号>` switches
    // without re-typing the path (payload = the exact path; lazy 5-min TTL).
    try {
      const list = ctx.workspaceRegistry?.list() ?? []
      if (list.length > 0) {
        let cwdReal = cwd
        try {
          cwdReal = await realpath(cwd)
        } catch {
          // marker comparison falls back to the raw cwd
        }
        out += '\n工作区列表：\n' + list.map((w, i) => `${i + 1}. ${w.path}（${w.sessionIds.length} 会话）${w.path === cwd || w.path === cwdReal ? ' ← 当前' : ''}`).join('\n')
        out += '\n回复 /workspace <序号> 切换。'
        ctx.setPendingSelection(chatId, {
          kind: 'workspace',
          items: list.map(w => ({ label: w.path, payload: w.path })),
          createdAt: Date.now(),
        })
      }
    } catch (error) {
      ctx.log('debug', 'workspace list failed: ' + String(error))
    }
    await ctx.sendToChat(chatId, out)
    return
  }
  if (arg === 'attach') {
    await handleWorkspaceAttachCommand(ctx, chatId)
    return
  }
  if (arg === 'list') {
    try {
      const list = ctx.workspaceRegistry?.list() ?? []
      if (list.length === 0) {
        await ctx.sendToChat(chatId, '（没有任何 workspace 记录）')
        return
      }
      await ctx.sendToChat(chatId, list.map(w => `${w.id}  ${w.path}（${w.sessionIds.length} 会话）`).join('\n'))
    } catch (error) {
      ctx.log('debug', 'workspace list failed: ' + String(error))
      await ctx.sendToChat(chatId, '❌ 无法列出工作区。\n发 /workspace 查看当前工作目录。')
    }
    return
  }
  // a pure-numeric argument is a serial-number pick against the snapshot
  // above — without a live one it keeps the original path semantics below.
  const picked = await resolveNumericSelection(ctx, chatId, 'workspace', arg, '/workspace')
  if (picked === null) return
  if (picked !== undefined) arg = picked.payload
  try {
    const path = await realpath(arg)
    const s = await stat(path)
    if (!s.isDirectory()) {
      await ctx.sendToChat(chatId, `❌ 不是目录：${arg}\n发 /workspace 查看编号列表，或发 /workspace list 查看全部。`)
      return
    }
    const hadChat = ctx.hasChat(chatId)
    ctx.setChatWorkspacePath(chatId, path)
    if (hadChat) {
      // Retire the current agent: its session cwd is frozen at creation, so
      // the next message re-creates the session under the new directory.
      await ctx.resetChat(chatId)
    }
    await ctx.sendToChat(chatId, `✅ 工作区已切换：${path}\n下一条消息将使用新工作区（新会话）。`)
    ctx.log('info', 'workspace switch for ' + chatId + ' -> ' + path)
  } catch (error) {
    ctx.log('debug', 'workspace switch failed: ' + String(error))
    await ctx.sendToChat(chatId, `❌ 目录无效或不可访问：${arg}\n发 /workspace 查看编号列表，或发 /workspace list 查看全部。`)
  }
}

/** /workspace attach: 立即给当前聊天的 live 会话重跑一次「归入工作区」。
 * 插件只在建会话/恢复会话时归入，运行中在网页上新增的工作区要等重启才会
 * 被认领——这个子命令就是手动补挂的入口（模式 existing 下也允许为该聊天
 * 自己的目录新建工作区；模式 off 时直接提示已关闭）。 */
export async function handleWorkspaceAttachCommand(ctx: CommandContext, chatId: ChatId): Promise<void> {
  const outcome = await ctx.attachChatToWorkspace(chatId, { allowCreate: true })
  if (outcome.ok) {
    await ctx.sendToChat(chatId, `✅ 已归入工作区 ${outcome.path}（${outcome.created ? '新建' : '已有'}）`)
    return
  }
  const path = outcome.path ?? ctx.effectiveCwd(chatId)
  switch (outcome.reason) {
    case 'off':
      await ctx.sendToChat(chatId, '❌ 会话归入工作区已关闭（attachWorkspaceMode=off）。\n把设置页「会话归入工作区」改成「只归入已有的」或「自动为每个聊天建」后再发 /workspace attach。')
      return
    case 'no-registry':
      await ctx.sendToChat(chatId, '❌ 当前宿主没有提供 workspaceRegistry 服务，无法归入工作区。\n在 DSH 网页里打开一次工作区再试。')
      return
    case 'no-session':
      await ctx.sendToChat(chatId, '当前聊天还没有活跃会话；下一条消息建会话时会自动归入工作区。')
      return
    case 'no-cwd':
      await ctx.sendToChat(chatId, '❌ 会话没有记录工作目录，无法归入工作区。\n发 /new 重建会话后再试。')
      return
    case 'foreign-cwd':
      await ctx.sendToChat(chatId, `❌ ${path} 不是这个聊天当前应用的目录（应为 ${ctx.effectiveCwd(chatId)}），没有为它新建工作区。\n发 /workspace 查看当前目录。`)
      return
    case 'no-workspace':
      await ctx.sendToChat(chatId, `❌ 没有工作区认领 ${path}，也没能新建。\n发 /workspace 查看当前目录；或在设置页把「会话归入工作区」设为「自动为每个聊天建」。`)
      return
    default:
      await ctx.sendToChat(chatId, `❌ 归入工作区失败：${outcome.message ?? '未知错误'}\n稍后再发一次 /workspace attach 即可重试。`)
      return
  }
}

/** /preset: show available agent presets and the current one, or switch. */
export async function handlePresetCommand(ctx: CommandContext, chatId: ChatId, arg: string): Promise<void> {
  const listed = await listPresets(ctx)
  if (arg.trim() === '') {
    const current = ctx.presetOverride(chatId)
      ?? await ctx.resolvePresetId(chatId)
      ?? ctx.agentPresets?.defaultId
    let out = '当前预设：' + (current ?? '（未记录）') + (ctx.hasPresetOverride(chatId) ? '（/preset 覆盖）' : '')
    if (listed.length > 0) {
      out += '\n可用预设：\n' + listed.map((s, i) => `${i + 1}. ${s}`).join('\n')
      // snapshot — payload is the preset id (listPresets renders `id（name）`;
      // ids are directory names, so the first fullwidth paren splits them off).
      ctx.setPendingSelection(chatId, {
        kind: 'preset',
        items: listed.map(s => ({ label: s, payload: s.split('（')[0] })),
        createdAt: Date.now(),
      })
    }
    out += '\n用法：/preset <id> 切换（重建会话）；/preset 查看'
    if (listed.length > 0) out += '\n回复 /preset <序号> 切换。'
    await ctx.sendToChat(chatId, out)
    return
  }
  // a pure-numeric argument is a serial-number pick against the snapshot
  // above — without a live one it keeps the original <id> semantics below.
  const picked = await resolveNumericSelection(ctx, chatId, 'preset', arg, '/preset')
  if (picked === null) return
  if (picked !== undefined) arg = picked.payload
  const id = arg.trim()
  if (ctx.agentPresets === undefined) {
    await ctx.sendToChat(chatId, '❌ 当前宿主未提供 agentPresets 服务。')
    return
  }
  let resolvedId: string
  try {
    const preset = await ctx.agentPresets.resolve(id)
    resolvedId = preset.id
  } catch (error) {
    ctx.log('debug', 'preset resolve failed: ' + String(error))
    await ctx.sendToChat(chatId, '❌ 预设不存在：' + id + (listed.length > 0 ? '\n可用：' + listed.join(', ') : '\n（未枚举到可用预设列表）') + '\n用法：/preset <id|序号> 切换（重建会话）；发 /preset 查看当前与可用列表。')
    return
  }
  ctx.setPresetOverride(chatId, resolvedId)
  if (ctx.hasChat(chatId)) {
    await ctx.resetChat(chatId)
  }
  ctx.log('info', 'preset switch for ' + chatId + ' -> ' + resolvedId)
  await ctx.sendToChat(chatId, `✅ 预设已切换：${resolvedId}\n下一条消息将重建会话并按新预设运行。`)
}
