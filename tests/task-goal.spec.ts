import { describe, expect, it, vi } from 'vitest'
import {
  classifyAdmittedSource,
  parseTaskDirective,
  readGoalRoundSource,
  reportDueFor,
  renderGoalChangeNotice,
  renderTaskConflict,
  renderTaskCreated,
  renderTaskPaused,
  renderTaskStatus,
  TASK_DRIVER_CAVEAT,
  TASK_NO_SERVICE_NOTICE,
  TASK_PRIVATE_ONLY_NOTICE,
  TASK_ROUNDS_MAX,
  TASK_USAGE,
  type GoalViewLike,
} from '../src/task-goal.js'
import { admitGoalRound, admitUserMessage, makeCmdHarness, makeEvent } from './helpers/bridge-harness.js'

/** 一份宿主 GoalView 的最小投影（测试只关心插件读的字段）。 */
function goalView(over: Partial<GoalViewLike> = {}): GoalViewLike {
  return {
    id: 'goal-1',
    revision: 1,
    objective: '写一份季度总结',
    phase: 'active',
    activation: 'armed',
    maxGoalRounds: 5,
    roundsStarted: 0,
    ...over,
  }
}

/**
 * 假的宿主 goals 服务：只实现插件用到的 get/create/pause/resume/complete，
 * 内部维护一份当前投影并记录 create 入参（用来断言 -r 是否原样下传）。
 */
function makeFakeGoals(initial?: GoalViewLike) {
  const state: { view: GoalViewLike | undefined, failGet: boolean, failPause: boolean, disarms: number } = {
    view: initial, failGet: false, failPause: false, disarms: 0,
  }
  const createCalls: Array<{ objective: string; maxGoalRounds?: number }> = []
  const bump = (over: Partial<GoalViewLike>): GoalViewLike => {
    const next = goalView({ ...state.view, ...over, revision: (state.view?.revision ?? 0) + 1 })
    state.view = next
    return next
  }
  const service = {
    get: () => {
      if (state.failGet) throw new Error('宿主的 goals.get 挂了')
      return state.view
    },
    create: (_agent: unknown, request: { objective: string; maxGoalRounds?: number }) => {
      createCalls.push(request)
      // 不传 maxGoalRounds 时宿主用自己的 defaultMaxGoalRounds（dsh-goal 默认
      // 256，可配置）——不是 20，插件也不许替宿主假定一个数。
      state.view = goalView({ objective: request.objective, maxGoalRounds: request.maxGoalRounds ?? 256 })
      return state.view
    },
    pause: () => {
      if (state.failPause) throw new Error('宿主的 pause 挂了')
      return bump({ phase: 'paused', activation: 'disarmed' })
    },
    resume: () => bump({ phase: 'active', activation: 'armed' }),
    complete: () => bump({ phase: 'complete', activation: 'disarmed' }),
    // dsh-goal 的公开 disarm：只撤自动接力（activation），相位/revision 不变
    disarm: () => {
      state.disarms += 1
      if (state.view === undefined) return undefined
      return bump({ activation: 'disarmed' })
    },
  }
  return { service, state, createCalls }
}

type CmdHarness = Awaited<ReturnType<typeof makeCmdHarness>>

/** 打开的出站文案（一个 send_msg 帧一行字符串）。 */
const replies = (h: CmdHarness): string[] =>
  h.outbound.filter(f => f.action === 'send_msg').map(f => JSON.stringify(f.params))

/** 一条出站帧里的全部文字段（按发出顺序拼接）。 */
const sentText = (raw: string): string =>
  (JSON.parse(raw) as { message: Array<{ type: string; data: { text?: string } }> })
    .message.filter(seg => seg.type === 'text').map(seg => String(seg.data.text ?? '')).join('')

/** 私聊对话的 chat 状态（bridge 的 chats 是私有 getter，测试照旧伸手）。 */
const chatOf = (h: CmdHarness, sessionId: string): Record<string, unknown> => {
  const bridge = h.bridge as unknown as {
    chats: Map<string, { chatId: string, sessionId: string, activeTurnRole: string, taskGoal?: unknown }>
    bySession: Map<string, string>
  }
  const chatId = bridge.bySession.get(sessionId)
  expect(chatId).toBeDefined()
  return bridge.chats.get(chatId!) as unknown as Record<string, unknown>
}

/** 建好会话并等到第一条消息落地（/task 需要既有 chat 又有 session）。 */
async function readyHarness(opts: { goals?: () => unknown, taskEveryRounds?: number, allowAllUsers?: boolean } = {}): Promise<{ h: CmdHarness, sessionId: string }> {
  const h = await makeCmdHarness(opts)
  h.sendText('你好')
  await vi.waitFor(() => expect(h.captured.followups).toHaveLength(1))
  const sessionId = h.sessionIds[0]!
  // 第一条 QQ dispatch 仍排在 pendingTurns 里（等它的 `user/message` 接纳）。
  // 自动目标轮的 turn/start 从 member 起步，只有接纳事件能抬身份——这正是
  // D1/D2 要验证的失败闭合起点，因此不再空跑回合去清队列。
  return { h, sessionId }
}

/** 发一条 /task 命令并等到对应回执出现。 */
async function sendTask(h: CmdHarness, command: string, until: string): Promise<void> {
  h.sendText(command)
  await vi.waitFor(() => {
    expect(replies(h).some(text => text.includes(until))).toBe(true)
  })
}

/**
 * 跑一个「自动目标轮」，严格按宿主真实顺序：
 * turn/start → user/message（带 goal 来源的接纳事件）→ assistant 文本 → turn/end。
 *
 * 注意这里**不再**发 `agent/pre-step`：宿主的 pre-step 只是提案，被 reject /
 * 未采纳的提案永远走不到接纳事件（T16 D2）。回合身份与目标轮识别只认
 * `user/message`。
 */
function runGoalRound(h: CmdHarness, sessionId: string, round: number, opts: { turn?: number, goalId?: string, revision?: number, text?: string } = {}): void {
  const turn = opts.turn ?? round
  const text = opts.text ?? '第 ' + round + ' 轮的实际产出'
  const emit = (type: string, data: unknown) => {
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent(type, data) as never)
  }
  emit('turn/start', { turn })
  admitGoalRound(h, sessionId, { goalId: opts.goalId ?? 'goal-1', revision: opts.revision ?? 1, round })
  emit('assistant/message', { turn, step: 1, message: { role: 'assistant', id: 'goal-' + turn, content: [{ type: 'text', text }] } })
  emit('turn/end', { turn, reason: { kind: 'completed' } })
}

describe('task-goal 纯函数', () => {
  it('parseTaskDirective 只认尾部的 -r N，正文里的 -r 原样保留', () => {
    expect(parseTaskDirective('写报告 -r 3')).toEqual({ ok: true, objective: '写报告', maxGoalRounds: 3 })
    expect(parseTaskDirective('  写报告   -r   12  ')).toEqual({ ok: true, objective: '写报告', maxGoalRounds: 12 })
    // 正文中间的 -r 不是参数（只有末尾的 -r <数字> 才是；中文 token 说明
    // 句子还在继续，整个串都是目标正文）
    expect(parseTaskDirective('把 -r 参数写进报告，再核对一遍')).toEqual({ ok: true, objective: '把 -r 参数写进报告，再核对一遍' })
    expect(parseTaskDirective('写报告 -r 参数')).toEqual({ ok: true, objective: '写报告 -r 参数' })
    // 尾部的 `-r` 后面跟着一个 ASCII 单 token 就是参数位：写法坏掉（NaN /
    // abc / 5x / 2.5 / -2）一律拒错，绝不静默当正文（否则非法轮数照样
    // create 目标——T16 D7）
    expect(parseTaskDirective('写报告 -r abc').ok).toBe(false)
    expect(parseTaskDirective('写报告 -r NaN').ok).toBe(false)
    expect(parseTaskDirective('写报告 -r 5x').ok).toBe(false)
    expect(parseTaskDirective('写报告')).toEqual({ ok: true, objective: '写报告' })
  })

  it('parseTaskDirective 拒绝非法轮数与空目标（调用方据此不创建目标）', () => {
    expect(parseTaskDirective('').ok).toBe(false)
    expect(parseTaskDirective('-r 3').ok).toBe(false)
    expect(parseTaskDirective('写报告 -r').ok).toBe(false)
    expect(parseTaskDirective('写报告 -r 0').ok).toBe(false)
    expect(parseTaskDirective('写报告 -r -2').ok).toBe(false)
    expect(parseTaskDirective('写报告 -r 2.5').ok).toBe(false)
    expect(parseTaskDirective('写报告 -r ' + String(TASK_ROUNDS_MAX + 1)).ok).toBe(false)
    expect(parseTaskDirective('写报告 -r ' + String(TASK_ROUNDS_MAX)).ok).toBe(true)
  })

  it('readGoalRoundSource 只接受宿主 driver 的真实目标轮来源', () => {
    expect(readGoalRoundSource({ kind: 'goal', goalId: 'g', revision: 2, round: 1 }))
      .toEqual({ kind: 'goal', goalId: 'g', revision: 2, round: 1 })
    // QQ 入站 / web 输入 / 残缺字段 / round 0 一律失败闭合
    expect(readGoalRoundSource({ kind: 'private', goalId: 'g', revision: 2, round: 1 })).toBeUndefined()
    expect(readGoalRoundSource({ kind: 'goal', goalId: '', revision: 2, round: 1 })).toBeUndefined()
    expect(readGoalRoundSource({ kind: 'goal', goalId: 'g', revision: 2.5, round: 1 })).toBeUndefined()
    expect(readGoalRoundSource({ kind: 'goal', goalId: 'g', revision: 2, round: 0 })).toBeUndefined()
    expect(readGoalRoundSource({ kind: 'goal', goalId: 'g', revision: 2 })).toBeUndefined()
    expect(readGoalRoundSource(undefined)).toBeUndefined()
    expect(readGoalRoundSource('goal')).toBeUndefined()
  })

  it('reportDueFor：1 逐轮、N 每 N 轮加最后一轮、0 只在最后一轮', () => {
    expect(reportDueFor(1, 1, 5)).toBe(true)
    expect(reportDueFor(4, 1, 5)).toBe(true)
    expect(reportDueFor(1, 3, 6)).toBe(false)
    expect(reportDueFor(3, 3, 6)).toBe(true)
    expect(reportDueFor(5, 3, 6)).toBe(false)
    expect(reportDueFor(6, 3, 6)).toBe(true)
    expect(reportDueFor(4, 0, 6)).toBe(false)
    expect(reportDueFor(6, 0, 6)).toBe(true)
    expect(reportDueFor(5, 3, 4)).toBe(true)
  })

  it('用法文案不替宿主假定默认预算（宿主 defaultMaxGoalRounds 不是 20）', () => {
    // 预算由宿主的 defaultMaxGoalRounds 决定（dsh-goal 默认 256 且可配置），
    // 插件只能说自己那层 1～200 的显式上限，不许写成「默认 20 轮」。
    expect(TASK_USAGE).not.toContain('20 轮')
    expect(TASK_USAGE).toContain('宿主')
    expect(TASK_USAGE).toContain('默认预算')
    expect(TASK_USAGE).toContain('以创建回执为准')
    expect(TASK_USAGE).toContain('1～' + TASK_ROUNDS_MAX)
  })

  it('渲染：创建回执带轮次预算与部署前提；状态区分授权/未授权', () => {
    const created = renderTaskCreated(goalView())
    expect(created).toContain('🎯 长任务已创建：写一份季度总结')
    expect(created).toContain('第 0/5 轮')
    // 回执里的预算就是宿主当前投影给的数，不是插件写死的
    expect(renderTaskCreated(goalView({ maxGoalRounds: 256 }))).toContain('第 0/256 轮')
    expect(created).toContain(TASK_DRIVER_CAVEAT)
    expect(renderTaskStatus(goalView({ roundsStarted: 2 }))).toContain('自动接力：已授权')
    expect(renderTaskStatus(goalView({ activation: 'disarmed', phase: 'paused' }))).toContain('未授权（/task resume 重新授权）')
    expect(renderTaskStatus(goalView({ phase: 'blocked', blockedReason: { code: 'x', message: '缺凭证' } }))).toContain('阻塞原因：缺凭证')
    expect(renderTaskConflict(goalView())).toContain('不会覆盖它')
    expect(renderTaskPaused(goalView())).toContain('目标保留')
  })

  it('生命周期通知：create 不重复播报，complete 不夸大工作内容', () => {
    expect(renderGoalChangeNotice('create', goalView())).toBeUndefined()
    expect(renderGoalChangeNotice('complete', goalView({ phase: 'complete', roundsStarted: 4 })))
      .toBe('✅ 长任务已完成（共 4 轮）。')
    expect(renderGoalChangeNotice('block', goalView({ phase: 'blocked' }))).toContain('宿主未给出原因')
    expect(renderGoalChangeNotice('clear', undefined)).toContain('授权一并撤销')
    expect(renderGoalChangeNotice('edit', goalView())).toBeUndefined()
  })
})

describe('/task 长任务命令', () => {
  it('没有 goals 服务时如实说用不了，不买账「创建成功」', async () => {
    const { h } = await readyHarness()
    await sendTask(h, '/task 写报告', '没有 goals 服务')
    expect(replies(h).some(text => text.includes(TASK_NO_SERVICE_NOTICE))).toBe(true)
  })

  it('群聊里拒绝长任务（会继承主人权限）', async () => {
    const fake = makeFakeGoals()
    const h = await makeCmdHarness({ goals: () => fake.service } as never)
    h.sendGroupTextAs('/task 写报告', 10001)
    await vi.waitFor(() => expect(replies(h).some(text => text.includes(TASK_PRIVATE_ONLY_NOTICE))).toBe(true))
    expect(fake.createCalls).toHaveLength(0)
  })

  it('创建：目标与 -r 原样下传，回执带预算，进程内建立授权绑定', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写一份季度总结 -r 4', '长任务已创建')
    expect(fake.createCalls).toEqual([{ objective: '写一份季度总结', maxGoalRounds: 4 }])
    const created = replies(h).find(text => text.includes('长任务已创建'))!
    expect(created).toContain('写一份季度总结')
    expect(created).toContain('第 0/4 轮')
    const chat = chatOf(h, sessionId)
    expect(chat.taskGoal).toMatchObject({ goalId: 'goal-1', sessionId, grantedRole: 'admin' })
  })

  it('不传 -r：把预算交给宿主默认值，回执报宿主真实给的数', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告', '长任务已创建')
    // 插件不下传 maxGoalRounds（tag 缺省），宿主自己的 defaultMaxGoalRounds 说了算
    expect(fake.createCalls[0]).toEqual({ objective: '写报告' })
    const created = replies(h).find(text => text.includes('长任务已创建'))!
    expect(created).toContain('第 0/256 轮')
    expect(created).not.toContain('第 0/20 轮')
    expect(chatOf(h, sessionId).taskGoal).toMatchObject({ goalId: 'goal-1', sessionId, grantedRole: 'admin' })
  })

  it('已有未完成目标时只报告不覆盖', async () => {
    const fake = makeFakeGoals()
    const { h } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 第一件事', '长任务已创建')
    await sendTask(h, '/task 第二件事', '已经有长任务了')
    expect(fake.createCalls).toHaveLength(1)
    expect(fake.createCalls[0]!.objective).toBe('第一件事')
  })

  it('status / stop / resume 以宿主当前投影为准', async () => {
    const fake = makeFakeGoals()
    const { h } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告 -r 2', '长任务已创建')
    await sendTask(h, '/task status', '自动接力：已授权')
    await sendTask(h, '/task stop', '长任务已暂停')
    expect(fake.state.view?.phase).toBe('paused')
    await sendTask(h, '/task resume', '长任务已恢复')
    expect(fake.state.view?.phase).toBe('active')
  })

  it('旧定时任务命名空间不变：空参仍是定时任务列表', async () => {
    const { h } = await readyHarness()
    h.sendText('/task')
    await vi.waitFor(() => expect(replies(h).some(text => text.includes('定时任务') || text.includes('没有'))).toBe(true))
    expect(replies(h).some(text => text.includes('长任务：'))).toBe(false)
  })

  it('还没有会话时提示先建立会话', async () => {
    const fake = makeFakeGoals()
    const h = await makeCmdHarness({ goals: () => fake.service })
    h.sendText('/task 写报告')
    await vi.waitFor(() => expect(replies(h).some(text => text.includes('先发一条消息建立会话'))).toBe(true))
    expect(fake.createCalls).toHaveLength(0)
  })

  it('status 以宿主最新 revision 为准，并刷新进程内绑定（CAS 重读）', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告', '长任务已创建')
    // 宿主侧（CLI/Web）改过目标：插件手里的 revision 已经陈旧
    fake.state.view = goalView({ objective: '写报告的修订版', revision: 7, roundsStarted: 3 })
    await sendTask(h, '/task status', 'revision 7')
    expect(replies(h).some(text => text.includes('写报告的修订版'))).toBe(true)
    expect(chatOf(h, sessionId).taskGoal).toMatchObject({ revision: 7, roundsStarted: 3 })
  })

  it('重启后未重新授权的目标：status 如实说「尚未授权」，不冒充自动接力', async () => {
    // 宿主里已有目标（进程重启后宿主日志会恢复它），但插件这边没有绑定
    const fake = makeFakeGoals(goalView({ objective: '重启前的目标' }))
    const { h } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task status', '插件尚未授权它自动接力')
    expect(replies(h).some(text => text.includes('重启前的目标'))).toBe(true)
  })
})

describe('自动目标轮：角色提升与回传节奏', () => {
  it('只有真实接纳的 goal 来源才把本回合角色提升为 admin', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告', '长任务已创建')
    // 失败闭合的起点：turn/start 不猜任何身份。
    h.ctx.emit('session/event', { id: sessionId } as never, makeEvent('turn/start', { turn: 1 }))
    expect(chatOf(h, sessionId).activeTurnRole).toBe('member')
    // 宿主的 `user/message` 接纳事件带来 goal 来源 → 抬身份并认领目标轮。
    admitGoalRound(h, sessionId, { goalId: 'goal-1', revision: 1, round: 1 })
    expect(chatOf(h, sessionId).activeTurnRole).toBe('admin')
    expect(chatOf(h, sessionId).taskGoalTurn).toMatchObject({ goalId: 'goal-1', round: 1, reportDue: true })
  })

  it('pre-step 提案不抬身份：旧钩子已不再监听（被拒绝的提案污染不了后续）', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告', '长任务已创建')
    h.ctx.emit('session/event', { id: sessionId } as never, makeEvent('turn/start', { turn: 1 }))
    // 即便 pre-step 里写着 goal 来源，也可能随后被 reject/replace —— 不能当事实。
    h.ctx.emit('agent/pre-step' as never, {
      agent: { id: sessionId },
      messages: [{ source: { kind: 'goal', goalId: 'goal-1', revision: 1, round: 1 } }],
      turn: 1,
    } as never, (async () => ({ kind: 'reject' })) as never)
    expect(chatOf(h, sessionId).activeTurnRole).toBe('member')
    expect(chatOf(h, sessionId).taskGoalTurn).toBeUndefined()
  })

  it('目标 id / revision 对不上时保持 member（不按「有活动目标」放宽）', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告', '长任务已创建')
    h.ctx.emit('session/event', { id: sessionId } as never, makeEvent('turn/start', { turn: 1 }))
    admitGoalRound(h, sessionId, { goalId: 'goal-1', revision: 99, round: 1 })
    expect(chatOf(h, sessionId).activeTurnRole).toBe('member')
    expect(chatOf(h, sessionId).taskGoalTurn).toBeUndefined()
  })

  it('D1：无关 Web 轮与目标轮都不消费排队 QQ 的 admin 身份，QQ 自己那轮仍是 admin', async () => {
    const fake = makeFakeGoals()
    // readyHarness 里的『你好』就是管理员 10001 发的：它的 admin 身份正排在
    // pendingTurns 里等接纳。
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告', '长任务已创建')
    // ① 无关 Web 输入：id 对不上任何 dispatch → member，且不消费队列。
    h.ctx.emit('session/event', { id: sessionId } as never, makeEvent('turn/start', { turn: 1 }))
    h.ctx.emit('session/event', { id: sessionId } as never, makeEvent('user/message', {
      role: 'user', id: 'web-input-1', content: [{ type: 'text', text: '网页里问一句' }],
    }))
    expect(chatOf(h, sessionId).activeTurnRole).toBe('member')
    expect(chatOf(h, sessionId).activeTurnMessageId).toBeUndefined()
    h.ctx.emit('session/event', { id: sessionId } as never, makeEvent('turn/end', { turn: 1, reason: { kind: 'completed' } }))
    // ② 自动目标轮：也不消费 QQ 队列（它有自己的 goal 来源）。
    h.ctx.emit('session/event', { id: sessionId } as never, makeEvent('turn/start', { turn: 2 }))
    admitGoalRound(h, sessionId, { goalId: 'goal-1', revision: 1, round: 1 })
    expect(chatOf(h, sessionId).taskGoalTurn).toBeDefined()
    h.ctx.emit('session/event', { id: sessionId } as never, makeEvent('turn/end', { turn: 2, reason: { kind: 'completed' } }))
    // ③ QQ 自己那条终于被接纳：admin + 触发消息 id 都回来了。
    h.ctx.emit('session/event', { id: sessionId } as never, makeEvent('turn/start', { turn: 3 }))
    expect(chatOf(h, sessionId).activeTurnRole).toBe('member')
    admitUserMessage(h, sessionId, { index: 0 })
    expect(chatOf(h, sessionId).activeTurnRole).toBe('admin')
    // 那条排队身份被**这一条**接纳消费掉了：队列清空，不会留给下一轮
    expect((chatOf(h, sessionId).pendingTurns as unknown[]).length).toBe(0)
  })

  it('taskEveryRounds=3 但目标在这一轮结束：收尾那轮照样回传文字', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service, taskEveryRounds: 3 })
    await sendTask(h, '/task 写报告', '长任务已创建')
    const emit = (type: string, data: unknown) => {
      h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent(type, data) as never)
    }
    emit('turn/start', { turn: 50 })
    // 宿主的自动轮进来：第 2 轮（3 的倍数以外的轮次，本来应该静默）
    admitGoalRound(h, sessionId, { goalId: 'goal-1', revision: 1, round: 2 })
    emit('assistant/message', {
      turn: 50,
      step: 1,
      message: { role: 'assistant', id: 'goal-50', content: [{ type: 'text', text: '报告写完了，收尾说明在这里。' }] },
    })
    // 这一轮里她把宿主目标标成完成
    fake.state.view = goalView({ objective: '写报告', phase: 'complete', roundsStarted: 2 })
    emit('turn/end', { turn: 50, reason: { kind: 'completed' } })
    await vi.waitFor(() => expect(replies(h).some(text => text.includes('报告写完了'))).toBe(true))
    // 收尾轮走统一输出协议入口：轮次前缀是解析后单独拼的一行 header
    expect(replies(h).some(text => text.includes('长任务 · 第 2/'))).toBe(true)
  })

  it('taskEveryRounds=3：第 1 轮静默、第 3 轮回传当轮真实文字', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service, taskEveryRounds: 3 })
    await sendTask(h, '/task 写报告 -r 6', '长任务已创建')
    const before = replies(h).length
    runGoalRound(h, sessionId, 1, { turn: 11, text: '第 1 轮的产出' })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(replies(h).slice(before).some(text => text.includes('第 1 轮的产出'))).toBe(false)
    runGoalRound(h, sessionId, 3, { turn: 13, text: '第 3 轮的产出' })
    await vi.waitFor(() => expect(replies(h).some(text => text.includes('第 3 轮的产出'))).toBe(true))
    const sent = replies(h).find(text => text.includes('第 3 轮的产出'))!
    expect(sent).toContain('长任务 · 第 3/')
    // 回传的是当轮原文，不带「汇总/总结」这类冒充
    expect(sent).not.toContain('汇总')
    expect(sent).not.toContain('总结')
  })

  it('默认 taskEveryRounds=1：每轮都回传，且轮次前缀单独成行', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告 -r 3', '长任务已创建')
    runGoalRound(h, sessionId, 1, { turn: 21, text: '第一步产出' })
    await vi.waitFor(() => expect(replies(h).some(text => text.includes('第一步产出'))).toBe(true))
    const sent = replies(h).find(text => text.includes('第一步产出'))!
    // 前缀是 header 行，模型原文另起一行（不再拼进正文，D6）
    expect(sent).toContain('长任务 · 第 1/')
    expect(sentText(sent).split('\n').at(-1)).toBe('第一步产出')
  })

  it('第 2 轮仍有管理员工具权限（多轮自动驱动模拟）', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告 -r 4', '长任务已创建')
    runGoalRound(h, sessionId, 1, { turn: 31, text: '第一轮' })
    expect(h.bridge.canEditFiles(sessionId)).toBe(true)
    runGoalRound(h, sessionId, 2, { turn: 32, text: '第二轮' })
    expect(h.bridge.canEditFiles(sessionId)).toBe(true)
    // 一次 create 不会额外 followup 首轮（避免与驱动器的队列重复）
    expect(h.captured.followups.filter(f => f.text.includes('写报告'))).toHaveLength(0)
  })

  it('暂停后即使还有目标轮灌进来也不提升角色（失败闭合）', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告', '长任务已创建')
    await sendTask(h, '/task stop', '长任务已暂停')
    h.ctx.emit('session/event', { id: sessionId } as never, makeEvent('turn/start', { turn: 41 }))
    admitGoalRound(h, sessionId, { goalId: 'goal-1', revision: 1, round: 2 })
    expect(chatOf(h, sessionId).activeTurnRole).toBe('member')
    expect(chatOf(h, sessionId).taskGoalTurn).toBeUndefined()
  })
})

describe('长任务轮的出站：D3 / D5 / D6 / D4', () => {
  const toolCall = (name: string, args: unknown) => ({ type: 'tool-call', name, arguments: JSON.stringify(args) })

  it('D3：过程步（带工具调用）不算最终文字，也不伪造「无文字回复」', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告 -r 5', '长任务已创建')
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('turn/start', { turn: 60 }))
    admitGoalRound(h, sessionId, { goalId: 'goal-1', revision: 1, round: 1 })
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('assistant/message', {
      turn: 60,
      step: 1,
      message: { role: 'assistant', id: 's1', content: [{ type: 'text', text: '我先读一下目录' }, toolCall('read_file', { path: 'a.md' })] },
    }))
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('assistant/message', {
      turn: 60,
      step: 2,
      message: { role: 'assistant', id: 's2', content: [{ type: 'text', text: '第二步过程碎片' }, toolCall('run_shell', { command: 'ls' })] },
    }))
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('turn/end', { turn: 60, reason: { kind: 'completed' } }))
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(replies(h).some(text => text.includes('我先读一下目录'))).toBe(false)
    expect(replies(h).some(text => text.includes('第二步过程碎片'))).toBe(false)
    // 不拿「（无文字回复）」之类兜底冒充模型说过的话
    expect(replies(h).some(text => text.includes('无文字'))).toBe(false)
  })

  it('D3：同一条 message 被重复投递（流式/usage 重发）只回传一次，且只回传最终那条', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告 -r 5', '长任务已创建')
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('turn/start', { turn: 70 }))
    admitGoalRound(h, sessionId, { goalId: 'goal-1', revision: 1, round: 1 })
    for (let i = 0; i < 3; i += 1) {
      h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('assistant/message', {
        turn: 70, step: 1, message: { role: 'assistant', id: 'dup-1', content: [{ type: 'text', text: '唯一一句结论' }] },
      }))
    }
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('turn/end', { turn: 70, reason: { kind: 'completed' } }))
    await vi.waitFor(() => expect(replies(h).some(text => text.includes('唯一一句结论'))).toBe(true))
    expect(replies(h).filter(text => text.includes('唯一一句结论'))).toHaveLength(1)
  })

  it('D5：按节奏静默文字的那一轮，也把宿主提问卡发出来', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service, taskEveryRounds: 99 })
    await sendTask(h, '/task 写报告 -r 6', '长任务已创建')
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('turn/start', { turn: 80 }))
    admitGoalRound(h, sessionId, { goalId: 'goal-1', revision: 1, round: 1 })
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('assistant/message', {
      turn: 80,
      step: 1,
      message: {
        role: 'assistant',
        id: 'q1',
        content: [toolCall('ask_user_question', {
          questions: [{ header: '范围', question: '报告写多长？', options: [{ label: '三页' }, { label: '十页' }] }],
        })],
      },
    }))
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('turn/end', { turn: 80, reason: { kind: 'completed' } }))
    await vi.waitFor(() => expect(replies(h).some(text => text.includes('提问'))).toBe(true))
    const card = replies(h).find(text => text.includes('提问'))!
    expect(sentText(card)).toContain('报告写多长？')
    // 这一轮的文字节奏照旧静默（没有文字就不该冒出回传帧）
    expect(replies(h).some(text => text.includes('🎯 长任务 · 第 1/6 轮'))).toBe(false)
  })

  it('D6：自动目标轮里的「不回」也走统一协议（什么都不发）', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告 -r 5', '长任务已创建')
    runGoalRound(h, sessionId, 1, { turn: 90, text: '[不回]' })
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(replies(h).some(text => text.includes('[不回]'))).toBe(false)
    expect(replies(h).some(text => text.includes('🎯 长任务 · 第 1/5 轮'))).toBe(false)
  })

  it('D6：控制块 reply:false 的自动目标轮同样一条不发', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service, protocolMode: 'on' })
    await sendTask(h, '/task 写报告 -r 5', '长任务已创建')
    runGoalRound(h, sessionId, 1, { turn: 91, text: '这轮先不打扰。\n【控制】{"reply":false,"why":"没实质进展"}' })
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(replies(h).some(text => text.includes('这轮先不打扰'))).toBe(false)
    expect(replies(h).some(text => text.includes('控制'))).toBe(false)
  })

  it('D6：目标轮正文行首的 [引用:id] 仍被当作引用标记（不因轮次前缀泄漏）', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告 -r 5', '长任务已创建')
    runGoalRound(h, sessionId, 1, { turn: 92, text: '[引用:12345]\n正文在这里' })
    await vi.waitFor(() => expect(replies(h).some(text => text.includes('正文在这里'))).toBe(true))
    const sent = sentText(replies(h).find(text => text.includes('正文在这里'))!)
    // 标记必须被协议吃掉：绝不能以 `🎯 长任务 · 第 N/M 轮\n[引用:…]` 的形式泄漏到 QQ
    expect(sent).not.toContain('[引用')
    // 轮次前缀是解析后加的 header 行，正文另起一行
    expect(sent.split('\n')[0]).toContain('长任务 · 第 1/')
  })

  it('D3：同一轮里目标被 clear，也不清掉本轮的冻结状态（该轮文字照旧收尾）', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告 -r 5', '长任务已创建')
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('turn/start', { turn: 95 }))
    admitGoalRound(h, sessionId, { goalId: 'goal-1', revision: 1, round: 1 })
    // 模型在这一轮里把宿主目标清掉了（goal/changed clear）
    fake.state.view = undefined
    h.ctx.emit('goal/changed' as never, {
      agent: { id: sessionId },
      change: { operation: 'clear', ref: { id: 'goal-1', revision: 2 } },
    } as never)
    expect(chatOf(h, sessionId).taskGoalTurn).toBeDefined()
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('assistant/message', {
      turn: 95, step: 1, message: { role: 'assistant', id: 'c1', content: [{ type: 'text', text: '收尾说明：目标已完成并清除。' }] },
    }))
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('turn/end', { turn: 95, reason: { kind: 'completed' } }))
    await vi.waitFor(() => expect(replies(h).some(text => text.includes('收尾说明'))).toBe(true))
  })

  it('D4：读不到实时目标时 status 显式报错，不冒充「没有长任务」', async () => {
    const fake = makeFakeGoals()
    const { h } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告', '长任务已创建')
    fake.state.failGet = true
    await sendTask(h, '/task status', '❌ 读不到')
    const last = sentText(replies(h).at(-1)!)
    expect(last).toContain('读不到')
    expect(last).not.toContain('没有长任务')
  })

  it('D4：读不到实时目标时 /task <目标> 拒绝创建（绝不覆盖宿主里的目标）', async () => {
    const fake = makeFakeGoals()
    const { h } = await readyHarness({ goals: () => fake.service })
    fake.state.failGet = true
    await sendTask(h, '/task 写报告', '❌ 读不到')
    expect(fake.createCalls).toHaveLength(0)
  })

  it('D4：宿主在 pause 里同步重入 goal/changed 也只算自己发的（去重不能晚记）', async () => {
    const fake = makeFakeGoals()
    const { h } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告', '长任务已创建')
    const before = replies(h).length
    const original = fake.service.pause
    fake.service.pause = () => {
      const view = original()
      // 宿主在 pause **返回之前**同步重入 goal/changed（真实场景：服务内部同步派发）
      h.ctx.emit('goal/changed' as never, {
        agent: { id: (h.bridge as unknown as { bySession: Map<string, string> }).bySession.keys().next().value },
        change: { operation: 'pause', ref: { id: view.id, revision: view.revision }, goal: view },
      } as never)
      return view
    }
    await sendTask(h, '/task stop', '长任务已暂停')
    await new Promise(resolve => setTimeout(resolve, 40))
    // 自己发的暂停不该被当成外部改动播报（noteSelfGoalOp 必须早于 pause）
    expect(replies(h).slice(before).filter(text => text.includes('需要继续就 /task resume'))).toHaveLength(0)
  })

  it('D4：/stop 暂停失败时如实说「不能保证停下」并撤掉自动接力授权', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告', '长任务已创建')
    fake.state.failPause = true
    await sendTask(h, '/stop', '暂停长任务失败')
    const notice = sentText(replies(h).at(-1)!)
    expect(notice).toContain('暂停长任务失败')
    expect(notice).toMatch(/已撤销自动接力授权|无法保证自动接力已停/)
    // 兜底：用公开 disarm 撤掉自动接力 + 撤销进程内授权
    expect(fake.state.disarms).toBeGreaterThan(0)
    expect(chatOf(h, sessionId).taskGoal).toBeUndefined()
  })
})

describe('生命周期通知与授权撤销', () => {
  it('自己发的暂停不重复播报，外部改动照常播报', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告', '长任务已创建')
    await sendTask(h, '/task stop', '长任务已暂停')
    // 插件自己 pause 会触发 goal/changed，但已 noteOperation，不该重复播报
    h.ctx.emit('goal/changed' as never, {
      agent: { id: sessionId },
      change: { operation: 'pause', ref: { id: 'goal-1', revision: 2 }, goal: goalView({ phase: 'paused', activation: 'disarmed', revision: 2 }) },
    } as never)
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(replies(h).filter(text => text.includes('需要继续就 /task resume')).length).toBe(0)
    // 宿主侧（CLI/Web）完成的改动是本插件没发过的，必须播报
    h.ctx.emit('goal/changed' as never, {
      agent: { id: sessionId },
      change: { operation: 'complete', ref: { id: 'goal-1', revision: 3 }, goal: goalView({ phase: 'complete', activation: 'disarmed', revision: 3, roundsStarted: 5 }) },
    } as never)
    await vi.waitFor(() => expect(replies(h).some(text => text.includes('✅ 长任务已完成（共 5 轮）'))).toBe(true))
  })

  it('/new 撤销长任务授权（不会把旧目标带进新会话）', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告', '长任务已创建')
    expect(chatOf(h, sessionId).taskGoal).toBeDefined()
    h.sendText('/new')
    await vi.waitFor(() => expect(replies(h).some(text => text.includes('已开启新会话'))).toBe(true))
    const bridge = h.bridge as unknown as { chats: Map<string, { taskGoal?: unknown }> }
    expect(bridge.chats.get('private:10001')?.taskGoal).toBeUndefined()
  })

  it('目标在宿主里被清除：播报并撤销进程内授权', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告', '长任务已创建')
    expect(chatOf(h, sessionId).taskGoal).toBeDefined()
    h.ctx.emit('goal/changed' as never, {
      agent: { id: sessionId },
      change: { operation: 'clear', ref: { id: 'goal-1', revision: 2 } },
    } as never)
    await vi.waitFor(() => expect(replies(h).some(text => text.includes('🗑 长任务已清除'))).toBe(true))
    expect(chatOf(h, sessionId).taskGoal).toBeUndefined()
  })

  it('/stop 顺手暂停已授权的长任务（目标与进度保留）', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告', '长任务已创建')
    h.sendText('/stop')
    await vi.waitFor(() => expect(fake.state.view?.phase).toBe('paused'))
    expect(replies(h).some(text => text.includes('顺手暂停了长任务'))).toBe(true)
    expect(chatOf(h, sessionId).taskGoal).toMatchObject({ phase: 'paused' })
  })
})

describe('接纳顺序（审查缺陷 1）：只有真实输入决定身份，runtime-context 不算', () => {
  /** 私聊 chat 里的授权绑定（断言角色用）。 */
  const bindingRole = (h: CmdHarness, sessionId: string): unknown =>
    (chatOf(h, sessionId).taskGoal as { grantedRole?: unknown } | undefined)?.grantedRole

  it('classifyAdmittedSource：上下文来源 / QQ producer / goal / 外部输入四分类', () => {
    // 宿主的运行时快照等：不是「谁在说话」
    expect(classifyAdmittedSource({ kind: 'runtime-context' })).toBe('context')
    expect(classifyAdmittedSource({ kind: 'runtime-context', form: 'snapshot', sections: ['cwd'] })).toBe('context')
    expect(classifyAdmittedSource({ kind: 'system-prompt' })).toBe('context')
    expect(classifyAdmittedSource({ kind: 'tool' })).toBe('context')
    // 插件自己写的 producer-owned 来源（含旧名）
    expect(classifyAdmittedSource({ kind: 'plugin:qq-companion' })).toBe('qq')
    expect(classifyAdmittedSource({ kind: 'plugin:dsh-onebot' })).toBe('qq')
    // 字段完整的 goal 才算目标轮；参数造假按外部输入失败闭合
    expect(classifyAdmittedSource({ kind: 'goal', goalId: 'goal-1', revision: 1, round: 1 })).toBe('goal')
    expect(classifyAdmittedSource({ kind: 'goal', goalId: 'goal-1' })).toBe('foreign')
    expect(classifyAdmittedSource({ kind: 'goal', goalId: 'goal-1', revision: 1, round: 0 })).toBe('foreign')
    // Web/宿主输入与未知来源
    expect(classifyAdmittedSource({ kind: 'user' })).toBe('foreign')
    expect(classifyAdmittedSource({ kind: 'user-rpc' })).toBe('foreign')
    expect(classifyAdmittedSource({ kind: '谁也没见过' })).toBe('foreign')
    expect(classifyAdmittedSource({})).toBe('foreign')
    expect(classifyAdmittedSource(undefined)).toBe('foreign')
    expect(classifyAdmittedSource('runtime-context')).toBe('foreign')
  })

  it('runtime-context 排在目标轮接纳之后也不重置身份，当轮文字照旧回传', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告 -r 3', '长任务已创建')
    const emit = (type: string, data: unknown): void => {
      h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent(type, data) as never)
    }
    emit('turn/start', { turn: 101 })
    admitGoalRound(h, sessionId, { goalId: 'goal-1', revision: 1, round: 1 })
    expect(chatOf(h, sessionId).activeTurnRole).toBe('admin')
    // 真实顺序：宿主在回合末尾还追加了一条运行时快照（user/message 带着它的来源）
    emit('user/message', {
      role: 'user',
      id: 'runtime-ctx-101',
      source: { kind: 'runtime-context', form: 'snapshot', sections: ['cwd', 'time'] },
      content: [{ type: 'text', text: 'current time: 2026-10-25T07:00:00+08:00' }],
    })
    // 身份没有被快照重置（旧实现会在这里降回 member 并清掉引用）
    expect(chatOf(h, sessionId).activeTurnRole).toBe('admin')
    expect(chatOf(h, sessionId).taskGoalTurn).toMatchObject({ goalId: 'goal-1', round: 1 })
    emit('assistant/message', {
      turn: 101,
      step: 1,
      message: { role: 'assistant', id: 'g101', content: [{ type: 'text', text: '快照之后照旧回传的文字' }] },
    })
    emit('turn/end', { turn: 101, reason: { kind: 'completed' } })
    await vi.waitFor(() => expect(replies(h).some(text => text.includes('快照之后照旧回传的文字'))).toBe(true))
    expect(replies(h).some(text => text.includes('长任务 · 第 1/3 轮'))).toBe(true)
  })

  it('runtime-context 先到、QQ 真输入后到：身份由后面那条真实输入决定', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告', '长任务已创建')
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('turn/start', { turn: 102 }))
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('user/message', {
      role: 'user',
      id: 'runtime-ctx-102',
      source: { kind: 'runtime-context', form: 'snapshot', sections: ['cwd'] },
      content: [{ type: 'text', text: 'cwd: E:\\Vibe Coding' }],
    }))
    // 快照不改身份：仍旧是 turn/start 的失败闭合起点
    expect(chatOf(h, sessionId).activeTurnRole).toBe('member')
    // 后面那条真实 QQ 输入才把身份抬上来
    admitUserMessage(h, sessionId, { index: 0 })
    expect(chatOf(h, sessionId).activeTurnRole).toBe('admin')
    expect((chatOf(h, sessionId).pendingTurns as unknown[]).length).toBe(0)
  })

  it('QQ 来源但 id 对不上（伪造/被替换的提案）→ 失败闭合，且不消费别人的排队凭据', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告', '长任务已创建')
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('turn/start', { turn: 103 }))
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('user/message', {
      role: 'user',
      id: 'forged-qq-1',
      source: { kind: 'plugin:qq-companion' },
      content: [{ type: 'text', text: '伪造的一条用户消息' }],
    }))
    expect(chatOf(h, sessionId).activeTurnRole).toBe('member')
    // 排队凭据一条没少：真正那条被接纳时仍然拿回 admin
    expect((chatOf(h, sessionId).pendingTurns as unknown[]).length).toBe(1)
    admitUserMessage(h, sessionId, { index: 0 })
    expect(chatOf(h, sessionId).activeTurnRole).toBe('admin')
  })

  it('同一条 QQ message 被重复接纳不会把刚抬起来的身份打回 member', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告', '长任务已创建')
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('turn/start', { turn: 104 }))
    admitUserMessage(h, sessionId, { index: 0 })
    expect(chatOf(h, sessionId).activeTurnRole).toBe('admin')
    // 重放/重投递：同一条 message id 再来一次
    admitUserMessage(h, sessionId, { index: 0 })
    expect(chatOf(h, sessionId).activeTurnRole).toBe('admin')
  })

  it('admin QQ 接纳后同回合又来了 Web 输入：降回 member，不再沿用 QQ 的身份', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告', '长任务已创建')
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('turn/start', { turn: 108 }))
    admitUserMessage(h, sessionId, { index: 0 })
    const chat = chatOf(h, sessionId)
    expect(chat.activeTurnRole).toBe('admin')
    expect((chat.pendingTurns as unknown[]).length).toBe(0)
    // 同一回合里宿主的 Web 输入被真正接纳：它接管了本回合
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('user/message', {
      role: 'user',
      id: 'web-input-108',
      source: { kind: 'user' },
      content: [{ type: 'text', text: '网页里插一句' }],
    }))
    expect(chat.activeTurnRole).toBe('member')
    // 旧引用一起清掉（本 harness 的入站事件没有 message_id，引用本来就为空，
    // 这里断言的是「不残留」）：Web 轮绝不能继承 QQ 那一轮的引用目标。
    expect(chat.activeTurnMessageId).toBeUndefined()
    expect(chat.taskGoalTurn).toBeUndefined()
    // 授权绑定留着（回合被接管 ≠ 撤销长任务）
    expect(bindingRole(h, sessionId)).toBe('admin')
  })

  it('同一回合中途来了非授权真实输入：停掉目标轮沉默，过期目标文字一条不发', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告 -r 5', '长任务已创建')
    const emit = (type: string, data: unknown): void => {
      h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent(type, data) as never)
    }
    emit('turn/start', { turn: 105 })
    admitGoalRound(h, sessionId, { goalId: 'goal-1', revision: 1, round: 1 })
    emit('assistant/message', {
      turn: 105,
      step: 1,
      message: { role: 'assistant', id: 'g105', content: [{ type: 'text', text: '这是目标轮的旧文字' }] },
    })
    // 同回合里又灌进一条外部输入（Web/宿主）：它接管了这个回合
    emit('user/message', {
      role: 'user',
      id: 'web-input-105',
      source: { kind: 'user' },
      content: [{ type: 'text', text: '网页里插一句' }],
    })
    expect(chatOf(h, sessionId).activeTurnRole).toBe('member')
    expect(chatOf(h, sessionId).activeTurnMessageId).toBeUndefined()
    expect(chatOf(h, sessionId).taskGoalTurn).toBeUndefined()
    expect(chatOf(h, sessionId).taskGoalText).toBe('')
    emit('turn/end', { turn: 105, reason: { kind: 'completed' } })
    await new Promise(resolve => setTimeout(resolve, 40))
    // 过期目标文本绝不按长任务回传出去
    expect(replies(h).some(text => text.includes('这是目标轮的旧文字'))).toBe(false)
    expect(replies(h).some(text => text.includes('长任务 · 第 1/'))).toBe(false)
    // 授权本身留着：回合被接管不等于长任务被撤销
    expect(bindingRole(h, sessionId)).toBe('admin')
  })

  it('授权绑定缺失时的 goal 来源（宿主里有目标但没 /task 授权）→ member', async () => {
    const fake = makeFakeGoals(goalView({ objective: '重启前的目标' }))
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('turn/start', { turn: 106 }))
    admitGoalRound(h, sessionId, { goalId: 'goal-1', revision: 1, round: 1 })
    expect(chatOf(h, sessionId).activeTurnRole).toBe('member')
    expect(chatOf(h, sessionId).taskGoalTurn).toBeUndefined()
  })

  it('goal 来源字段造假（缺 revision）→ 失败闭合，不抬身份', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告', '长任务已创建')
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('turn/start', { turn: 107 }))
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('user/message', {
      role: 'user',
      id: 'forged-goal-107',
      source: { kind: 'goal', goalId: 'goal-1' },
      content: [{ type: 'text', text: '<goal_round>' }],
    }))
    expect(chatOf(h, sessionId).activeTurnRole).toBe('member')
    expect(chatOf(h, sessionId).taskGoalTurn).toBeUndefined()
  })
})

describe('QQ 真实输入接管目标轮：退出自动轮冻结，按普通 QQ 回合回传', () => {
  /** 一条带真实 message_id 的 QQ 私聊入站：排队凭据的 triggerId 就从它来。 */
  const sendPrivateWithId = (h: CmdHarness, text: string, userId: number, messageId: number): void => {
    h.client.send(JSON.stringify({
      post_type: 'message',
      message_type: 'private',
      user_id: userId,
      self_id: 10002,
      message_id: messageId,
      message: [{ type: 'text', data: { text } }],
      raw_message: text,
      sender: { user_id: userId, nickname: '用户' + userId },
    }))
  }

  /**
   * 把某人从管理员名单里摘掉（等价于设置页里改配置）：此后的入站按 member 记账。
   * 长任务只能建在管理员私聊里，所以「同一个 chat 里进来一条 member 的真实 QQ
   * 输入」在真实部署里只有这一条路径——这个 chat 的主人先建了长任务，随后把自己
   * 从管理员名单里去掉（同时开了「允许所有人私聊」，否则他的私聊会被白名单挡掉）。
   */
  const demote = (h: CmdHarness, userId: string): void => {
    const policy = (h.bridge as unknown as { deps: { policy: { adminUsers: string[] } } }).deps.policy
    const at = policy.adminUsers.indexOf(userId)
    if (at >= 0) policy.adminUsers.splice(at, 1)
  }

  it('member 的真实 QQ 消息接管：新的最终答复按普通 QQ 回传，旧目标文字一条不发', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({
      goals: () => fake.service,
      taskEveryRounds: 3,
      allowAllUsers: true,
    })
    await sendTask(h, '/task 写报告 -r 6', '长任务已创建')
    const emit = (type: string, data: unknown): void => {
      h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent(type, data) as never)
    }
    emit('turn/start', { turn: 111 })
    admitGoalRound(h, sessionId, { goalId: 'goal-1', revision: 1, round: 1 })
    expect(chatOf(h, sessionId).taskGoalTurn).toMatchObject({ goalId: 'goal-1', round: 1 })
    // 目标轮的过程候选：冻结进 taskGoalText，不出站
    emit('assistant/message', {
      turn: 111,
      step: 1,
      message: { role: 'assistant', id: 'g111', content: [{ type: 'text', text: '这是目标轮的旧文字' }] },
    })
    expect(chatOf(h, sessionId).taskGoalText).toBe('这是目标轮的旧文字')

    // 真实 QQ 输入：入站 → 插件建 user message（producer + 真实 message_id）→ 排队
    demote(h, '10001')
    sendPrivateWithId(h, '顺便问一句天气', 10001, 5555)
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(2))
    const queuedId = h.captured.followups[1]?.id
    // 宿主在同一个回合里把这条 QQ 消息接纳进来（turn/start 之后才到的真实输入）
    admitUserMessage(h, sessionId, { index: 1 })

    const chat = chatOf(h, sessionId)
    // 身份归这条 QQ：member（不是目标轮借来的 admin），引用指向它自己
    expect(chat.activeTurnRole).toBe('member')
    expect(chat.activeTurnMessageId).toBe('5555')
    // 旧自动轮的冻结已经退出：不会再走 goal 分支攒/吞文字
    expect(chat.taskGoalTurn).toBeUndefined()
    expect(chat.taskGoalText).toBe('')
    expect(chat.taskGoalLastMessageId).toBeUndefined()
    // 该 QQ 的排队凭据被这一条真实输入消费掉，别人的一条没少
    const queued = chat.pendingTurns as Array<{ messageId: string; role: string }>
    expect(queued.some(entry => entry.messageId === queuedId)).toBe(false)
    expect(queued).toHaveLength(1)

    // taskEveryRounds=3 且这一轮不是回传轮：换了身份之后照样按普通 QQ 回传
    emit('assistant/message', {
      turn: 111,
      step: 2,
      message: { role: 'assistant', id: 'g112', content: [{ type: 'text', text: '今天晴，出门记得带伞' }] },
    })
    emit('turn/end', { turn: 111, reason: { kind: 'completed' } })
    await vi.waitFor(() => expect(replies(h).some(text => text.includes('今天晴，出门记得带伞'))).toBe(true))
    // 被接管之后那条旧目标文字、以及任何长任务轮次前缀，都不许再发
    expect(replies(h).some(text => text.includes('这是目标轮的旧文字'))).toBe(false)
    expect(replies(h).some(text => text.includes('长任务 · 第'))).toBe(false)
    // 回合被接管 ≠ 撤销长任务：授权绑定还在
    expect(chat.taskGoal).toMatchObject({ goalId: 'goal-1', grantedRole: 'admin' })
  })

  it('合法 admin 的 QQ 消息接管：同样退出冻结，自己授予的 admin 不被 runtime-context 撤掉', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service, taskEveryRounds: 3 })
    await sendTask(h, '/task 写报告 -r 6', '长任务已创建')
    const emit = (type: string, data: unknown): void => {
      h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent(type, data) as never)
    }
    emit('turn/start', { turn: 112 })
    admitGoalRound(h, sessionId, { goalId: 'goal-1', revision: 1, round: 1 })
    emit('assistant/message', {
      turn: 112,
      step: 1,
      message: { role: 'assistant', id: 'g113', content: [{ type: 'text', text: '这一轮目标的过程文字' }] },
    })
    sendPrivateWithId(h, '我插一句', 10001, 6666)
    await vi.waitFor(() => expect(h.captured.followups).toHaveLength(2))
    admitUserMessage(h, sessionId, { index: 1 })

    const chat = chatOf(h, sessionId)
    expect(chat.taskGoalTurn).toBeUndefined()
    expect(chat.taskGoalText).toBe('')
    // 管理员身份是这条 QQ 自己的，不是目标轮借的：工具权限照样在
    expect(chat.activeTurnRole).toBe('admin')
    expect(chat.activeTurnMessageId).toBe('6666')
    expect(h.bridge.canEditFiles(sessionId)).toBe(true)
    // 宿主随后的运行时快照不能把身份撤掉，也不能复活目标轮冻结
    emit('user/message', {
      role: 'user',
      id: 'runtime-ctx-112',
      source: { kind: 'runtime-context', form: 'snapshot', sections: ['cwd', 'time'] },
      content: [{ type: 'text', text: 'current time: 2026-10-25T08:00:00+08:00' }],
    })
    expect(chat.activeTurnRole).toBe('admin')
    expect(chat.activeTurnMessageId).toBe('6666')
    expect(chat.taskGoalTurn).toBeUndefined()

    emit('assistant/message', {
      turn: 112,
      step: 2,
      message: { role: 'assistant', id: 'g114', content: [{ type: 'text', text: '插话后的答复' }] },
    })
    emit('turn/end', { turn: 112, reason: { kind: 'completed' } })
    await vi.waitFor(() => expect(replies(h).some(text => text.includes('插话后的答复'))).toBe(true))
    expect(replies(h).some(text => text.includes('这一轮目标的过程文字'))).toBe(false)
    expect(replies(h).some(text => text.includes('长任务 · 第'))).toBe(false)
    expect(chat.taskGoal).toMatchObject({ goalId: 'goal-1', grantedRole: 'admin' })
  })
})

describe('授权撤销（审查缺陷 3）：/task stop 与 /task status 当场撤授权', () => {
  const grantedRole = (h: CmdHarness, sessionId: string): unknown =>
    (chatOf(h, sessionId).taskGoal as { grantedRole?: unknown } | undefined)?.grantedRole

  it('/task stop 显式把进程内授权降回 member（不依赖异步 goal/changed）', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告', '长任务已创建')
    expect(grantedRole(h, sessionId)).toBe('admin')
    // 这条测试里宿主**不会**派发 goal/changed：撤销只能由命令层自己完成
    await sendTask(h, '/task stop', '长任务已暂停')
    expect(grantedRole(h, sessionId)).toBe('member')
  })

  it('/task status 发现宿主里已不在接续状态 → 撤授权，外部 resume 也复活不了', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    await sendTask(h, '/task 写报告', '长任务已创建')
    // 宿主侧（CLI/Web）暂停了；这一轮**不发** goal/changed（模拟通知没到插件）。
    // revision 保持 1 是刻意的：把「相位/激活」和「revision 对不上」两个原因分开。
    fake.state.view = goalView({ phase: 'paused', activation: 'disarmed' })
    // 等到**这一条** status 回执（'🎯 长任务：' 只在 renderTaskStatus 里出现；
    // 单写 '长任务' 会被上一步的「长任务已创建」抢先匹配，导致断言跑在命令之前）。
    await sendTask(h, '/task status', '🎯 长任务：')
    expect(grantedRole(h, sessionId)).toBe('member')
    // 伙伴侧随后又把它 resume 成 active+armed：旧的管理员授权不能复活
    fake.state.view = goalView({ phase: 'active', activation: 'armed' })
    h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent('turn/start', { turn: 111 }))
    admitGoalRound(h, sessionId, { goalId: 'goal-1', revision: 1, round: 2 })
    expect(chatOf(h, sessionId).activeTurnRole).toBe('member')
    // 只有管理员重新 /task resume 才拿回 admin
    await sendTask(h, '/task resume', '长任务已恢复')
    expect(grantedRole(h, sessionId)).toBe('admin')
  })
})

describe('同回合混排（审查缺陷 3 补强）：被撤权的目标轮绝不继承同回合 QQ 管理员的身份', () => {
  const grantedRole = (h: CmdHarness, sessionId: string): unknown =>
    (chatOf(h, sessionId).taskGoal as { grantedRole?: unknown } | undefined)?.grantedRole

  it('绑定 member + 外部 resume（没有 /task resume）→ 同回合先接纳 admin QQ 再接纳合法目标轮：角色仍是 member、不能编辑文件', async () => {
    const fake = makeFakeGoals()
    const { h, sessionId } = await readyHarness({ goals: () => fake.service })
    const emit = (type: string, data: unknown): void => {
      h.ctx.emit('session/event' as never, { id: sessionId } as never, makeEvent(type, data) as never)
    }

    // ① 管理员 /task 建目标（授权 admin），随后 /task stop 当场降回 member
    //    （目标和进度都保留；暂停把 revision 从 1 抬到 2）。
    await sendTask(h, '/task 写报告', '长任务已创建')
    expect(grantedRole(h, sessionId)).toBe('admin')
    await sendTask(h, '/task stop', '长任务已暂停')
    expect(grantedRole(h, sessionId)).toBe('member')

    // ② 外部（CLI/Web）把目标 resume 成 active+armed：绑定相位回到接续状态，
    //    但**没有**管理员 /task resume，grantedRole 必须还是 member。
    fake.state.view = goalView({ phase: 'active', activation: 'armed', revision: 3 })
    // 注意：goal/changed 是 ctx 上的事件（不是 session/event 的一种），直接 emit。
    h.ctx.emit('goal/changed' as never, {
      agent: { id: sessionId },
      change: { operation: 'resume', ref: { id: 'goal-1', revision: 3 }, goal: fake.state.view },
    } as never)
    await vi.waitFor(() => expect(chatOf(h, sessionId).taskGoal).toMatchObject({ phase: 'active', activation: 'armed' }))
    expect(grantedRole(h, sessionId)).toBe('member')

    // ③ 同一回合里先接纳一条**精确对账**的管理员 QQ 输入：admin 身份落位。
    emit('turn/start', { turn: 121 })
    admitUserMessage(h, sessionId, { index: 0 })
    const chat = chatOf(h, sessionId)
    expect(chat.activeTurnRole).toBe('admin')
    expect((chat.pendingTurns as unknown[]).length).toBe(0)

    // ④ 紧接着接纳一条**完全合法**的目标轮来源（goalId/revision 对得上、
    //    目标 active+armed）：它是本回合最后一个真实输入，身份必须按绑定的
    //    「本进程内授权」落成 member —— 旧实现只抬不降，会继承上一条 QQ 的 admin。
    admitGoalRound(h, sessionId, { goalId: 'goal-1', revision: 3, round: 2 })
    expect(chat.activeTurnRole).toBe('member')
    expect(h.bridge.canEditFiles(sessionId)).toBe(false)
    // 目标轮照旧认领（角色是 member ≠ 这一轮不算目标轮）……
    expect(chat.taskGoalTurn).toMatchObject({ goalId: 'goal-1', round: 2 })
    // ……但同回合那条 QQ 的引用目标不会继承到目标轮上
    expect(chat.activeTurnMessageId).toBeUndefined()
    // 降权 ≠ 撤销目标：绑定还在，只是角色是 member
    expect(chat.taskGoal).toMatchObject({ goalId: 'goal-1', grantedRole: 'member' })

    // ⑤ 对照：管理员明确 /task resume 重新授权后，随后的自动目标轮才是 admin
    await sendTask(h, '/task resume', '长任务已恢复')
    expect(grantedRole(h, sessionId)).toBe('admin')
    const reGranted = chatOf(h, sessionId).taskGoal as { revision?: number }
    expect(reGranted.revision).toBe(4)
    emit('turn/start', { turn: 122 })
    admitGoalRound(h, sessionId, { goalId: 'goal-1', revision: 4, round: 3 })
    expect(chatOf(h, sessionId).activeTurnRole).toBe('admin')
    expect(h.bridge.canEditFiles(sessionId)).toBe(true)
  })
})