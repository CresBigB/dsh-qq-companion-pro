/**
 * Counts what the QQ account sends (for /doctor): the last minute, the last
 * hour and today. Also counts today's「她选择不回」decisions (nothing went
 * out, but the decision is observable) and the 输出协议 B 档 parse statistics
 * (replies in protocol-enabled chats / control blocks parsed / JSON mistakes).
 * Counting only — sending pace is the typing pacer's job.
 * @module dsh-qq-companion/companion/send-counter
 */
import { dayKey } from './time.js'

export interface SendCounterSnapshot {
  lastMinute: number
  lastHour: number
  today: number
  /** 今天「她选择不回」的次数（不算发送，只是让这个决定可观测）。 */
  passToday: number
  /** 今天在「启用输出协议的聊天」里的最终回复条数（成功率的分母；插件自己的
   *  提示语不计，任何真的写了控制块的出站文本也计入）。 */
  protocolReplies: number
  /** 其中解析出控制块的条数（成功率的分子）。 */
  protocolParsed: number
  /** 其中写了【控制】但 JSON 解析失败的条数（那一段原样发出去了）。 */
  protocolFailed: number
}

const HOUR = 3_600_000

export class SendCounter {
  private readonly now: () => number
  private recent: number[] = []
  private day = ''
  private todayCount = 0
  private passCount = 0
  private protocolReplyCount = 0
  private protocolParsedCount = 0
  private protocolFailedCount = 0

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? (() => Date.now())
  }

  /** One message went out. */
  record(): void {
    this.rollDay()
    const now = this.now()
    this.recent = this.recent.filter(t => now - t < HOUR)
    this.recent.push(now)
    this.todayCount += 1
  }

  /** One「这次不回」decision — nothing was sent, so 发送量 不变，只记次数。 */
  recordPass(): void {
    this.rollDay()
    this.passCount += 1
  }

  /** 一条最终回复发生在「启用输出协议的聊天」里（成功率的分母）。 */
  recordProtocolReply(): void {
    this.rollDay()
    this.protocolReplyCount += 1
  }

  /** 其中解析出了控制块。 */
  recordProtocolParsed(): void {
    this.rollDay()
    this.protocolParsedCount += 1
  }

  /** 其中写了【控制】但 JSON 写错（整段原样发出）。 */
  recordProtocolFailed(): void {
    this.rollDay()
    this.protocolFailedCount += 1
  }

  snapshot(): SendCounterSnapshot {
    this.rollDay()
    const now = this.now()
    this.recent = this.recent.filter(t => now - t < HOUR)
    return {
      lastMinute: this.recent.filter(t => now - t < 60_000).length,
      lastHour: this.recent.length,
      today: this.todayCount,
      passToday: this.passCount,
      protocolReplies: this.protocolReplyCount,
      protocolParsed: this.protocolParsedCount,
      protocolFailed: this.protocolFailedCount,
    }
  }

  private rollDay(): void {
    const key = dayKey(this.now())
    if (key !== this.day) {
      this.day = key
      this.todayCount = 0
      this.passCount = 0
      this.protocolReplyCount = 0
      this.protocolParsedCount = 0
      this.protocolFailedCount = 0
    }
  }
}