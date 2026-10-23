/**
 * Counts what the QQ account sends (for /doctor): the last minute, the last
 * hour and today. Also counts today's「她选择不回」decisions (nothing went
 * out, but the decision is observable). Counting only — sending pace is the
 * typing pacer's job.
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
    snapshot() {
        this.rollDay();
        const now = this.now();
        this.recent = this.recent.filter(t => now - t < HOUR);
        return {
            lastMinute: this.recent.filter(t => now - t < 60_000).length,
            lastHour: this.recent.length,
            today: this.todayCount,
            passToday: this.passCount,
        };
    }
    rollDay() {
        const key = dayKey(this.now());
        if (key !== this.day) {
            this.day = key;
            this.todayCount = 0;
            this.passCount = 0;
        }
    }
}
