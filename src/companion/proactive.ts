/**
 * Proactive check-ins: wake the companion a few random times a day inside a
 * window so she can decide whether to reach out — in her owner's private chat,
 * or in a group she is allowed to speak in (the group lane uses the member
 * role, never admin). Replying the pass marker sends nothing.
 * @module dsh-qq-companion/companion/proactive
 */
import { describeError } from '../errors.js'
import { PASS_MARKER } from '../output-protocol.js'
import type { ChatActivity } from './activity.js'
import { JsonState } from './state.js'
import { dayKey, hhmm, minutesOfDay, toMinutes } from './time.js'
import type { Log } from './time.js'

export interface ProactiveConfig {
  /** Every chat she may reach out to: `private:<QQ>` / `group:<id>`. */
  targets?: readonly string[]
  /** Local window, HH:MM–HH:MM. */
  windowStart: string
  windowEnd: string
  /** Wake-ups per chat per day, picked at random in [min, max]. */
  minPerDay: number
  maxPerDay: number
  /** Minimum minutes between two wake-ups. */
  minGapMinutes: number
  /** Skip a wake-up when that chat had activity within this many minutes. */
  skipIfActiveMinutes: number
  /** Stop for the day after this many unanswered proactive messages. */
  maxUnanswered: number
}

/** One chat's wake-up plan for one day (this is what the state file stores). */
interface TargetPlan {
  day: string
  plan: number[]
  fired: number
}

/**
 * The chats a config names, in order, blanks dropped and duplicates removed.
 */
export function proactiveTargetsOf(config: Pick<ProactiveConfig, 'targets'>): string[] {
  const out: string[] = []
  for (const raw of config.targets ?? []) {
    const chatId = typeof raw === 'string' ? raw.trim() : ''
    if (chatId === '' || out.includes(chatId)) continue
    out.push(chatId)
  }
  return out
}

/** The reply that means "nothing to say this time" — never sent to QQ.
 * The literal lives in output-protocol.ts ({@link PASS_MARKER}) so the outbound
 * gate and this marker can never drift apart. */
export const PROACTIVE_PASS = PASS_MARKER

/**
 * True when a final reply is the pass marker (whitespace / brackets tolerant).
 *
 * ⚠ 判定已统一到 `output-protocol.ts` 的 `parseReplyPass`（它同时认 `[不回:原因]`，
 * 且在 `bridge.sendToChat` 的出站闸门里对所有出站文本生效）。这个函数只为兼容
 * 保留：新代码请用 parseReplyPass，别再在这里加第三种判定。
 */
export function isProactivePass(text: string): boolean {
  return /^[\s\[【（(]*不发[\s\]】）)。.!！]*$/.test(text)
}

/**
 * Pick `count` minutes-of-day in [start, end) at least `gap` apart, at
 * random. Returns fewer when the window cannot fit them.
 */
export function pickCheckinTimes(start: number, end: number, count: number, gap: number, random: () => number = Math.random): number[] {
  if (end <= start || count <= 0) return []
  const fit = Math.min(count, Math.floor((end - start - 1) / Math.max(gap, 1)) + 1)
  // Spread `fit` slots with the mandatory gaps, then share the slack at random.
  const slack = (end - start - 1) - gap * (fit - 1)
  const cuts = Array.from({ length: fit }, () => random() * slack).sort((a, b) => a - b)
  return cuts.map((c, i) => Math.floor(start + c + gap * i))
}

/** Wakes her a few random times a day inside the window (see ProactiveConfig).
 * Every chat gets its own plan, its own daily count and its own
 * stop-after-unanswered bookkeeping, so adding a group never shifts the
 * private chat's schedule. */
export class ProactiveScheduler {
  private readonly config: ProactiveConfig
  private readonly fire: (chatId: string, context: { time: string; unanswered: number; lastUserAt: number | undefined }) => Promise<void>
  private readonly activity: ChatActivity
  private readonly log: Log
  private readonly now: () => number
  private readonly random: () => number
  private readonly targets: string[]
  /** Per-chat state; a missing or stale entry means "not planned yet today". */
  private readonly plans = new Map<string, TargetPlan>()
  private timer: ReturnType<typeof setInterval> | undefined
  private readonly state: JsonState<{ targets: Record<string, TargetPlan> }>

  constructor(options: {
    config: ProactiveConfig
    activity: ChatActivity
    fire: (chatId: string, context: { time: string; unanswered: number; lastUserAt: number | undefined }) => Promise<void>
    log: Log
    now?: () => number
    random?: () => number
    /** Persist today's plans and fired counts (a restart keeps them). */
    stateFile?: string
  }) {
    this.config = options.config
    this.fire = options.fire
    this.activity = options.activity
    this.log = options.log
    this.now = options.now ?? (() => Date.now())
    this.random = options.random ?? Math.random
    this.targets = proactiveTargetsOf(options.config)
    this.state = new JsonState(options.stateFile, { label: '主动聊天状态', log: options.log })
  }

  /** Restore today's plans from the state file (a restart mid-day keeps the
   * remaining slots and the counts instead of drawing a fresh day). */
  async load(): Promise<void> {
    const stored = await this.state.load() as unknown
    if (typeof stored !== 'object' || stored === null) return
    const record = stored as Record<string, unknown>
    const box = typeof record.targets === 'object' && record.targets !== null
      ? record.targets as Record<string, unknown>
      : undefined
    // Older state files kept one plan in the root object and never named the
    // chat, so it can only be adopted when exactly one chat is configured.
    const legacy = this.targets.length === 1 && Array.isArray(record.plan) ? record : undefined
    const today = dayKey(this.now())
    const nowMin = minutesOfDay(this.now())
    for (const [index, chatId] of this.targets.entries()) {
      const plan = this.readPlan(box?.[chatId] ?? (index === 0 ? legacy : undefined))
      if (plan === undefined || plan.day !== today) continue
      // Slots missed by more than half an hour while dsh was down are dropped
      // (a restart should not open with a stale "just thinking of you").
      plan.plan = plan.plan.filter(m => m >= nowMin - 30)
      this.plans.set(chatId, plan)
      this.log('info', '恢复今天的主动聊天计划：' + chatId + ' 剩 ' + (plan.plan.map(hhmm).join('、') || '无') + '，已叫醒 ' + plan.fired + ' 次')
    }
  }

  /** Snapshot for /doctor (summed over every chat). */
  snapshot(): { day: string; remaining: string[]; firedToday: number } {
    const first = this.targets.length > 0 ? this.plans.get(this.targets[0]!)?.day : undefined
    let firedToday = 0
    for (const plan of this.plans.values()) firedToday += plan.fired
    return { day: first ?? '', remaining: this.remaining(), firedToday }
  }

  /** Read one stored plan, tolerating an older or corrupt shape. */
  private readPlan(raw: unknown): TargetPlan | undefined {
    if (typeof raw !== 'object' || raw === null) return undefined
    const record = raw as Record<string, unknown>
    if (typeof record.day !== 'string' || !Array.isArray(record.plan)) return undefined
    return {
      day: record.day,
      plan: record.plan.filter((m): m is number => typeof m === 'number' && Number.isFinite(m)),
      fired: typeof record.fired === 'number' ? record.fired : 0,
    }
  }

  private persist(): void {
    void this.state.save(() => ({ targets: Object.fromEntries(this.plans) }))
  }

  start(intervalMs = 30_000): void {
    if (this.timer !== undefined) return
    this.timer = setInterval(() => { void this.tick() }, intervalMs)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
  }

  /** Today's remaining wake-up times as HH:MM (chat-prefixed when several
   * chats are configured, so /task never shows two indistinguishable slots). */
  remaining(): string[] {
    for (const chatId of this.targets) this.ensurePlan(chatId)
    const labelled = this.targets.length > 1
    return this.targets.flatMap(chatId => {
      const plan = this.plans.get(chatId)
      if (plan === undefined) return []
      return plan.plan.map(minute => labelled ? chatId + ' ' + hhmm(minute) : hhmm(minute))
    })
  }

  /** Wake her right now in every configured chat (the /task checkin test hook):
   * the hard rules still apply except the time plan. */
  async fireNow(): Promise<void> {
    for (const chatId of this.targets) {
      this.ensurePlan(chatId)
      const unanswered = Math.max(0, this.activity.botLinesSinceUser(chatId) - 1)
      await this.fire(chatId, {
        time: hhmm(minutesOfDay(this.now())),
        unanswered,
        lastUserAt: this.activity.lastAt(chatId),
      })
    }
  }

  /** One check over every chat (exported for tests). */
  async tick(): Promise<void> {
    const nowMin = minutesOfDay(this.now())
    for (const chatId of this.targets) {
      const plan = this.ensurePlan(chatId)
      if (plan.plan.length === 0 || plan.plan[0]! > nowMin) continue
      // Fire the earliest due slot; any older missed slots are dropped.
      while (plan.plan.length > 1 && plan.plan[1]! <= nowMin) plan.plan.shift()
      plan.plan.shift()
      this.persist()
      const c = this.config
      const lastUserAt = this.activity.lastAt(chatId)
      if (lastUserAt !== undefined && this.now() - lastUserAt < c.skipIfActiveMinutes * 60_000) {
        this.log('info', '主动聊天跳过：' + chatId + ' 刚在聊天')
        continue
      }
      // Her normal reply to the last message is 1; each unanswered proactive
      // message adds one.
      const unanswered = Math.max(0, this.activity.botLinesSinceUser(chatId) - 1)
      if (unanswered >= c.maxUnanswered) {
        this.log('info', '主动聊天今天停止：' + chatId + ' 已有 ' + unanswered + ' 条主动消息没回')
        plan.plan = []
        this.persist()
        continue
      }
      const time = hhmm(nowMin)
      try {
        await this.fire(chatId, { time, unanswered, lastUserAt })
        plan.fired += 1
        this.persist()
        this.log('info', '主动聊天：已叫醒 ' + chatId + '（' + time + '，今天第 ' + plan.fired + ' 次）')
      } catch (error) {
        this.log('warn', '主动聊天失败: ' + describeError(error))
      }
    }
  }

  private ensurePlan(chatId: string): TargetPlan {
    const today = dayKey(this.now())
    const known = this.plans.get(chatId)
    if (known !== undefined && known.day === today) return known
    const c = this.config
    const span = Math.max(0, c.maxPerDay - c.minPerDay)
    const count = c.minPerDay + Math.floor(this.random() * (span + 1))
    const nowMin = minutesOfDay(this.now())
    // A restart mid-day plans only the rest of today's window.
    const start = Math.max(toMinutes(c.windowStart), nowMin + 1)
    const plan: TargetPlan = {
      day: today,
      plan: pickCheckinTimes(start, toMinutes(c.windowEnd), count, c.minGapMinutes, this.random),
      fired: 0,
    }
    this.plans.set(chatId, plan)
    this.persist()
    this.log('info', '今天的主动聊天时间（' + chatId + '）：' + (plan.plan.map(hhmm).join('、') || '（无）'))
    return plan
  }
}
