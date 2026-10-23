/**
 * Counts what the QQ account sends (for /doctor): the last minute, the last
 * hour and today. Also counts today's「她选择不回」decisions (nothing went
 * out, but the decision is observable) and the 输出协议 B 档 parse statistics
 * (replies in protocol-enabled chats / control blocks parsed / JSON mistakes).
 * Counting only — sending pace is the typing pacer's job.
 * @module dsh-qq-companion/companion/send-counter
 */
import { dayKey } from './time.js';
const HOUR = 3_600_000;
export class SendCounter {
    now;
    recent = [];
    day = '';
    todayCount = 0;
    passCount = 0;
    protocolReplyCount = 0;
    protocolParsedCount = 0;
    protocolFailedCount = 0;
    constructor(options = {}) {
        this.now = options.now ?? (() => Date.now());
    }
    /** One message went out. */
    record() {
        this.rollDay();
        const now = this.now();
        this.recent = this.recent.filter(t => now - t < HOUR);
        this.recent.push(now);
        this.todayCount += 1;
    }
    /** One「这次不回」decision — nothing was sent, so 发送量 不变，只记次数。 */
    recordPass() {
        this.rollDay();
        this.passCount += 1;
    }
    /** 一条最终回复发生在「启用输出协议的聊天」里（成功率的分母）。 */
    recordProtocolReply() {
        this.rollDay();
        this.protocolReplyCount += 1;
    }
    /** 其中解析出了控制块。 */
    recordProtocolParsed() {
        this.rollDay();
        this.protocolParsedCount += 1;
    }
    /** 其中写了【控制】但 JSON 写错（整段原样发出）。 */
    recordProtocolFailed() {
        this.rollDay();
        this.protocolFailedCount += 1;
    }
    snapshot() {
        this.rollDay();
        const now = this.now();
        this.recent = this.recent.filter(t => now - t < HOUR);
        return {
            lastMinute: this.recent.filter(t => now - t < 60_000).length,
            lastHour: this.recent.length,
            today: this.todayCount,
            passToday: this.passCount,
            protocolReplies: this.protocolReplyCount,
            protocolParsed: this.protocolParsedCount,
            protocolFailed: this.protocolFailedCount,
        };
    }
    rollDay() {
        const key = dayKey(this.now());
        if (key !== this.day) {
            this.day = key;
            this.todayCount = 0;
            this.passCount = 0;
            this.protocolReplyCount = 0;
            this.protocolParsedCount = 0;
            this.protocolFailedCount = 0;
        }
    }
}
