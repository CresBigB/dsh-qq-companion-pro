export interface SendCounterSnapshot {
    lastMinute: number;
    lastHour: number;
    today: number;
    /** 今天「她选择不回」的次数（不算发送，只是让这个决定可观测）。 */
    passToday: number;
}
export declare class SendCounter {
    private readonly now;
    private recent;
    private day;
    private todayCount;
    private passCount;
    constructor(options?: {
        now?: () => number;
    });
    /** One message went out. */
    record(): void;
    /** One「这次不回」decision — nothing was sent, so 发送量 不变，只记次数。 */
    recordPass(): void;
    snapshot(): SendCounterSnapshot;
    private rollDay;
}
