/**
 * The companion block of /doctor: is the QQ account really online, what is
 * planned for today, and how full the memory files are.
 * @module dsh-qq-companion/companion/doctor
 */
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import type { LivenessSnapshot } from '../liveness.js'
import type { SendCounterSnapshot } from './send-counter.js'
import { hhmm, minutesOfDay } from './time.js'

export interface CompanionStatusDeps {
  liveness?: () => LivenessSnapshot
  sendCounter?: () => SendCounterSnapshot
  /** 输出协议 B 档状态（/doctor 的「输出协议」行与设置页概览快照同源）。 */
  protocol?: () => ProtocolStatusView
  scheduler?: () => Array<{ id: string; time: string; firedToday: boolean }>
  proactive?: () => { remaining: string[]; firedToday: number }
  stickers?: () => { count: number; maxCount: number; today: number; dailyMax: number }
  /** 语音合成（T15）：引擎与是否可用。关闭也渲染一行——配了却不生效最容易忘。
   *  `ready` 是挂载时那次探测的结论：开了但引擎 / 模型没找到时为 false，
   *  `detail` 就是原因（这时 qq_send_tts 根本没有注册）。 */
  tts?: () => { enabled: boolean; engine: string; ready: boolean; detail: string }
  /** Memory files to size; `max` (bytes) renders a percentage. */
  memoryFiles?: Array<{ label: string; path: string; max?: number }>
  /** Root of per-group memory dirs. */
  groupMemoryDir?: string
  groupMemoryMaxBytes?: number
  now?: () => number
}

/** 输出协议 B 档的运行态视图（/doctor 与概览快照同源，纯 JSON）。 */
export interface ProtocolStatusView {
  /** protocolMode === 'on'。 */
  enabled: boolean
  /** 启用了协议的聊天（空 = 开启时对所有聊天生效）。 */
  chats: string[]
  /** 今天在协议聊天里的回复条数（成功率分母）。 */
  repliesToday: number
  /** 其中带控制块并解析成功的条数（成功率分子）。 */
  parsedToday: number
  /** 其中【控制】行 JSON 写错、整段原样发出的条数。 */
  failedToday: number
}

/** 控制块成功率（0–100 取整；没有回复时 0——分母为 0 不编造数字）。 */
export function protocolSuccessRate(view: { repliesToday: number; parsedToday: number }): number {
  const replies = Number.isFinite(view.repliesToday) && view.repliesToday > 0 ? view.repliesToday : 0
  const parsed = Number.isFinite(view.parsedToday) && view.parsedToday > 0 ? view.parsedToday : 0
  if (replies === 0) return 0
  return Math.round(Math.min(parsed, replies) / replies * 100)
}

const kb = (n: number) => (n / 1024).toFixed(1) + 'KB'

/** 文件字节数（不存在 / 读不到 = undefined）。/doctor 与设置页概览共用。 */
export async function fileSize(path: string): Promise<number | undefined> {
  try {
    return (await stat(path)).size
  } catch {
    return undefined
  }
}

/** 一个要统计大小的记忆文件（/doctor 的「记忆文件」行与概览快照同源）。 */
export interface MemoryFileSpec {
  label: string
  path: string
  /** 上限（字节）；undefined = 只报大小不报百分比。 */
  max?: number
}

/** 收集要给 /doctor 与概览快照报大小的记忆文件：公开 / 私密（调用方传入）
 *  + 每群一份 `<groupMemoryDir>/<群号>/AGENTS.md`。
 *  `groupDirUnreadable` = 群记忆目录填了但读不到（/doctor 一直为此渲染一行说明）。 */
export async function memoryFileSpecs(deps: {
  memoryFiles?: Array<{ label: string; path: string; max?: number }>
  groupMemoryDir?: string
  groupMemoryMaxBytes?: number
}): Promise<{ files: MemoryFileSpec[]; groupDirUnreadable: boolean }> {
  const files: MemoryFileSpec[] = []
  for (const f of deps.memoryFiles ?? []) {
    if (f.path !== '') files.push({ label: f.label, path: f.path, max: f.max })
  }
  let groupDirUnreadable = false
  if (deps.groupMemoryDir !== undefined && deps.groupMemoryDir !== '') {
    try {
      const groups = (await readdir(deps.groupMemoryDir, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort()
      for (const g of groups) files.push({ label: '群' + g, path: join(deps.groupMemoryDir, g, 'AGENTS.md'), max: deps.groupMemoryMaxBytes })
    } catch {
      groupDirUnreadable = true
    }
  }
  return { files, groupDirUnreadable }
}

function sized(label: string, bytes: number | undefined, max?: number): string {
  if (bytes === undefined) return label + ' 无'
  if (max === undefined || max <= 0) return label + ' ' + kb(bytes)
  const pct = Math.round(bytes / max * 100)
  return label + ' ' + kb(bytes) + '/' + kb(max) + '（' + pct + '%' + (pct >= 100 ? '，已满' : pct >= 80 ? '，该整理了' : '') + '）'
}

/** Render the companion lines (never throws: a failing part renders 未知). */
export async function companionStatusLines(deps: CompanionStatusDeps): Promise<string[]> {
  const now = deps.now ?? (() => Date.now())
  const lines: string[] = ['▍陪伴状态']
  const live = deps.liveness?.()
  if (live !== undefined) {
    const beat = live.lastHeartbeatAt === undefined
      ? '还没收到心跳'
      : '上次心跳 ' + Math.max(0, Math.round((now() - live.lastHeartbeatAt) / 1000)) + ' 秒前'
    const online = live.online === undefined ? '未知' : live.online ? '在线' : '⚠️ 离线'
    lines.push('QQ 账号：' + online + '（' + beat + (live.intervalMs !== undefined ? '，间隔 ' + Math.round(live.intervalMs / 1000) + ' 秒' : '') + '）')
  }
  const sent = deps.sendCounter?.()
  if (sent !== undefined) {
    // 今天不回几次也算一条可观测的决定（输出协议 A 档）。
    const passes = typeof sent.passToday === 'number' ? ' · 今天 ' + sent.passToday + ' 条不回' : ''
    lines.push('发送量：近 1 分钟 ' + sent.lastMinute + ' 条 · 近 1 小时 ' + sent.lastHour + ' 条 · 今天 ' + sent.today + ' 条' + passes)
  }
  const tasks = deps.scheduler?.() ?? []
  if (tasks.length > 0) {
    const nowMin = minutesOfDay(now())
    lines.push('定时任务：' + tasks.map(t => t.id + ' ' + t.time + (t.firedToday ? ' 今天已执行' : ' 今天待执行')).join(' · ') + '（现在 ' + hhmm(nowMin) + '）')
  }
  const p = deps.proactive?.()
  if (p !== undefined) {
    lines.push('主动聊天：今天已叫醒 ' + p.firedToday + ' 次，还剩 ' + (p.remaining.length > 0 ? p.remaining.join('、') : '无'))
  }
  const protocol = deps.protocol?.()
  if (protocol !== undefined) {
    if (!protocol.enabled) {
      lines.push('输出协议：关闭')
    } else {
      const scope = protocol.chats.length > 0 ? '（仅 ' + protocol.chats.join('、') + '）' : ''
      const rate = protocolSuccessRate(protocol)
      const failed = protocol.failedToday > 0 ? '；JSON 写错 ' + protocol.failedToday + ' 次（那几段原样发出去了）' : ''
      lines.push('输出协议：开启' + scope + '；今天 ' + protocol.repliesToday + ' 次回复里 ' + protocol.parsedToday + ' 次带控制块（成功率 ' + rate + '%）' + failed)
    }
  }
  const st = deps.stickers?.()
  if (st !== undefined) lines.push('表情包：' + st.count + '/' + st.maxCount + ' 张 · 今天新存 ' + st.today + '/' + st.dailyMax + ' 张')
  const voice = deps.tts?.()
  if (voice !== undefined) {
    // 「开了但引擎没找到」是最容易忘的一档：写清楚未就绪与原因，而不是只报引擎名。
    const detail = voice.detail === '' ? '' : '（' + voice.detail + '）'
    const state = !voice.enabled
      ? '关闭'
      : voice.ready ? voice.engine + detail : voice.engine + ' 未就绪' + detail
    lines.push('语音合成：' + state)
  }
  const files: string[] = []
  const collected = await memoryFileSpecs(deps)
  for (const f of collected.files) files.push(sized(f.label, await fileSize(f.path), f.max))
  if (collected.groupDirUnreadable) files.push('群记忆目录读不到')
  if (files.length > 0) lines.push('记忆文件：' + files.join(' · '))
  return lines
}
