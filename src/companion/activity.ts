/**
 * Per-chat activity record: last user activity (idle clock), session start
 * (age-based renewal), the last few lines (the handoff recap fed into a
 * fresh session) and today's transcript excerpt (the nightly diary input).
 * Persisted in mediaDir/chat-activity.json so restarts keep the clocks.
 * @module dsh-qq-companion/companion/activity
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describeError } from '../errors.js'
import { SerialFileWriter } from '../persist.js'
import { boundaryDay, hhmm, minutesOfDay } from './time.js'
import type { Log } from './time.js'

/** Activity file name, under mediaDir. */
export const CHAT_ACTIVITY_FILE = 'chat-activity.json'
/** Lines kept for the idle-reset handoff recap. */
export const HANDOFF_LINES = 8
/** Characters kept per handoff / today line. */
export const LINE_MAX_CHARS = 200
/** Today's lines handed to a fresh session at most (so a session renewed
 * mid-day still knows what was said earlier that day). */
export const HANDOFF_TODAY_LINES = 40
/** Lines kept in today's excerpt per chat (the diary input). */
export const TODAY_MAX_LINES = 200
/** Lines per group in the nightly group excerpt (keeps the diary turn cheap). */
export const GROUP_TODAY_MAX_LINES = 80

export interface ActivityLine {
  /** Epoch ms. */
  t: number
  /** user = 对方说的；bot = 她说的（算台词）；system = 记录她自己的决定
   * （例如「这次选择不回」），不是一句台词，不进 bot 统计。 */
  who: 'user' | 'bot' | 'system'
  /** Sender label for user lines (nickname), empty for the bot. */
  name?: string
  text: string
}

interface ChatRecord {
  lastAt: number
  /** When the chat's current session began (age-based resets). */
  sessionStartedAt?: number
  /** The prompt version the current session started with (absent = unknown). */
  prompt?: string
  recent: ActivityLine[]
  today: ActivityLine[]
}

const clip = (text: string): string => {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim())
  return chars.length > LINE_MAX_CHARS ? chars.slice(0, LINE_MAX_CHARS).join('') + '…' : chars.join('')
}

export class ChatActivity {
  private readonly file: string
  private readonly log: Log
  private readonly now: () => number
  private chats: Record<string, ChatRecord> = {}
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private saveChain: Promise<void> = Promise.resolve()
  private readonly writer: SerialFileWriter
  private readonly promptVersion: ((chatId: string) => string) | undefined

  constructor(options: { mediaDir: string; log: Log; now?: () => number; promptVersion?: (chatId: string) => string }) {
    this.file = join(options.mediaDir, CHAT_ACTIVITY_FILE)
    this.log = options.log
    this.writer = new SerialFileWriter(this.file, { label: '聊天活动记录', log: (level, message) => this.log(level, message) })
    this.now = options.now ?? (() => Date.now())
    this.promptVersion = options.promptVersion
  }

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8')) as Record<string, Partial<ChatRecord>>
      for (const [chatId, rec] of Object.entries(raw)) {
        if (typeof rec?.lastAt !== 'number') continue
        this.chats[chatId] = {
          lastAt: rec.lastAt,
          // Records from before age-based resets start counting now.
          sessionStartedAt: typeof rec.sessionStartedAt === 'number' ? rec.sessionStartedAt : this.now(),
          recent: Array.isArray(rec.recent) ? rec.recent.slice(-HANDOFF_LINES) : [],
          today: Array.isArray(rec.today) ? rec.today.slice(-TODAY_MAX_LINES) : [],
          ...(typeof rec.prompt === 'string' ? { prompt: rec.prompt } : {}),
        }
      }
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') this.log('warn', '聊天活动记录读取失败，从空开始: ' + describeError(error))
    }
  }

  /** Last user activity time for a chat (undefined = never seen). */
  lastAt(chatId: string): number | undefined {
    return this.chats[chatId]?.lastAt
  }

  /** Whether the chat has been idle longer than `hours` (never-seen = no). */
  isIdle(chatId: string, hours: number): boolean {
    const last = this.lastAt(chatId)
    return hours > 0 && last !== undefined && this.now() - last > hours * 3_600_000
  }

  /** Record one line. User lines also move the idle clock. */
  record(chatId: string, who: 'user' | 'bot', text: string, name = ''): void {
    const body = clip(text)
    if (body === '') return
    const rec = this.chats[chatId] ?? (this.chats[chatId] = { lastAt: this.now(), sessionStartedAt: this.now(), recent: [], today: [], ...this.promptOf(chatId) })
    const line: ActivityLine = { t: this.now(), who, text: body, ...(name !== '' ? { name } : {}) }
    this.pushLine(rec, line)
    if (who === 'user') rec.lastAt = this.now()
    this.scheduleSave()
  }

  /**
   * 记一条「她这次选择不回」（输出协议 A 档）：进 recent 与 today，让下次交接
   * 与当天的日记知道她刚没回；**不塑造成她说了一句话**（who='system'），因此
   * 不计入 bot 台词统计（{@link botLinesSinceUser}），也不移动空闲时钟。
   * 从没见过的聊天没有可交接的上下文，直接不记（日志/计数/trace 仍在）。
   */
  recordPass(chatId: string, reason = ''): void {
    const rec = this.chats[chatId]
    if (rec === undefined) return
    const text = reason === '' ? '（这次选择不回：没说原因）' : '（这次选择不回：' + reason + '）'
    this.pushLine(rec, { t: this.now(), who: 'system', text: clip(text) })
    this.scheduleSave()
  }

  /** Append one line to recent + today, trimming both to their caps. */
  private pushLine(rec: ChatRecord, line: ActivityLine): void {
    rec.recent.push(line)
    if (rec.recent.length > HANDOFF_LINES) rec.recent.splice(0, rec.recent.length - HANDOFF_LINES)
    rec.today.push(line)
    if (rec.today.length > TODAY_MAX_LINES) rec.today.splice(0, rec.today.length - TODAY_MAX_LINES)
  }

  /** Mark that the chat's session starts now (/new, idle or age reset). */
  markSessionStart(chatId: string): void {
    const rec = this.chats[chatId]
    if (rec === undefined) return
    rec.sessionStartedAt = this.now()
    Object.assign(rec, this.promptOf(chatId))
    this.scheduleSave()
  }

  /** The current prompt version as a record field (none without a version source). */
  private promptOf(chatId: string): { prompt?: string } {
    return this.promptVersion !== undefined ? { prompt: this.promptVersion(chatId) } : {}
  }

  /** Whether the chat's session started under a different prompt version
   * than the current one (a session from before versions were recorded
   * counts as different). Never-seen chats are not stale. */
  promptStale(chatId: string): boolean {
    const rec = this.chats[chatId]
    return this.promptVersion !== undefined && rec !== undefined && rec.prompt !== this.promptVersion(chatId)
  }

  /** How many 04:00 day boundaries the current session has crossed
   * (0 = started today; never-seen chats = 0). */
  sessionDaysCrossed(chatId: string): number {
    const started = this.chats[chatId]?.sessionStartedAt
    if (started === undefined) return 0
    return boundaryDay(this.now()) - boundaryDay(started)
  }

  /** How many of her replies came after the chat's last user line (an
   * unanswered proactive message makes this ≥ 2). 只有 who='bot' 算台词：
   * 「这次选择不回」的 system 行不占这个计数。 */
  botLinesSinceUser(chatId: string): number {
    const lines = this.chats[chatId]?.today ?? []
    let count = 0
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].who !== 'bot') break
      count += 1
    }
    return count
  }

  /** The handoff recap text for a fresh session ('' = nothing to hand off). */
  handoff(chatId: string): string {
    const lines = this.chats[chatId]?.recent ?? []
    if (lines.length === 0) return ''
    return lines.map(l => speakerPrefix(l) + l.text).join('\n')
  }

  /** The handoff for a fresh session: today's lines (at most
   * HANDOFF_TODAY_LINES, with times) when there are any — not yet taken by
   * the diary — else the last few lines. '' = nothing to hand off. */
  handoffRecap(chatId: string): { text: string; today: boolean } {
    const rec = this.chats[chatId]
    if (rec === undefined) return { text: '', today: false }
    if (rec.today.length > 0) return { text: formatTranscript(rec.today.slice(-HANDOFF_TODAY_LINES)), today: true }
    return { text: this.handoff(chatId), today: false }
  }

  /** Today's excerpt for a chat (diary input), then optionally cleared. */
  takeToday(chatId: string, clear: boolean): ActivityLine[] {
    const rec = this.chats[chatId]
    if (rec === undefined) return []
    const lines = [...rec.today]
    if (clear) {
      rec.today = []
      this.scheduleSave()
    }
    return lines
  }

  /** Today's excerpt of every group chat that has one (diary input), each
   * trimmed to its last `maxLines`, then optionally cleared. */
  takeTodayGroups(maxLines: number, clear: boolean): Array<{ chatId: string; lines: ActivityLine[] }> {
    const out: Array<{ chatId: string; lines: ActivityLine[] }> = []
    for (const [chatId, rec] of Object.entries(this.chats)) {
      if (!chatId.startsWith('group:') || rec.today.length === 0) continue
      out.push({ chatId, lines: rec.today.slice(-maxLines) })
      if (clear) rec.today = []
    }
    if (clear && out.length > 0) this.scheduleSave()
    return out
  }

  /** Flush pending writes (stop / tests). */
  async flush(): Promise<void> {
    if (this.saveTimer !== undefined) {
      clearTimeout(this.saveTimer)
      this.saveTimer = undefined
      this.writeNow()
    }
    await this.saveChain
  }

  private scheduleSave(): void {
    if (this.saveTimer !== undefined) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined
      this.writeNow()
    }, 2_000)
    this.saveTimer.unref?.()
  }

  private writeNow(): void {
    this.saveChain = this.writer.write(() => JSON.stringify(this.chats))
  }

}

/** Format today's excerpt for the diary prompt. */
export function formatTranscript(lines: readonly ActivityLine[]): string {
  return lines.map(l => '[' + hhmm(minutesOfDay(l.t)) + '] ' + speakerPrefix(l) + l.text).join('\n')
}

/** The speaker prefix of one line: '你：' for her, the nickname for a user,
 * '' for a system record (its text already reads as a parenthetical). */
function speakerPrefix(line: ActivityLine): string {
  if (line.who === 'bot') return '你：'
  if (line.who === 'system') return ''
  return (line.name ?? '对方') + '：'
}
