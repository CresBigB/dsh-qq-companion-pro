export interface SendCounterSnapshot {
    lastMinute: number;
    lastHour: number;
    today: number;
    /** 今天「她选择不回」的次数（不算发送，只是让这个决定可观测）。 */
    passToday: number;
    /** 今天在「启用输出协议的聊天」里的最终回复条数（成功率的分母；插件自己的
     *  提示语不计，任何真的写了控制块的出站文本也计入）。 */
    protocolReplies: number;
    /** 其中解析出控制块的条数（成功率的分子）。 */
    protocolParsed: number;
    /** 其中写了【控制】但 JSON 解析失败的条数（那一段原样发出去了）。 */
    protocolFailed: number;
}
export declare class SendCounter {
    private readonly now;
    private recent;
    private day;
    private todayCount;
    private passCount;
    private protocolReplyCount;
    private protocolParsedCount;
    private protocolFailedCount;
    constructor(options?: {
        now?: () => number;
    });
    /** One message went out. */
    record(): void;
    /** One「这次不回」decision — nothing was sent, so 发送量 不变，只记次数。 */
    recordPass(): void;
    /** 一条最终回复发生在「启用输出协议的聊天」里（成功率的分母）。 */
    recordProtocolReply(): void;
    /** 其中解析出了控制块。 */
    recordProtocolParsed(): void;
    /** 其中写了【控制】但 JSON 写错（整段原样发出）。 */
    recordProtocolFailed(): void;
    snapshot(): SendCounterSnapshot;
    private rollDay;
}
