/**
 * 定时任务（scheduledPrompts）的纯校验与规范化：设置页与 host 远端共用的同一套规则。
 *
 * 单独成模块的原因：这张表以前只在 cordis.patch.yml 里手写，设置页只读展示；
 * 现在两端都要校验它，规则必须只有一份，否则「页面放过了、后端拒了」会成为
 * 一类难查的保存失败。本文件不依赖 node，也不依赖 React。
 */
/** 一条定时任务（设置页与 host 共用的形状）。 */
export interface ScheduledPromptEntry {
    /** 短名字：`/task <id>` 用它手动触发，也是「今天是否已执行」的键。 */
    id: string;
    /** 本地时间 HH:MM（24 小时制）。 */
    time: string;
    /** 目标会话：`private:<QQ号>` 或 `group:<群号>`。 */
    chatId: string;
    /** 投递内容。 */
    prompt: string;
    /** 是否附上今天的宿主日志摘要。 */
    includeTodayLog: boolean;
    /** 是否附上各群最近的聊天日志。 */
    includeGroupLogs: boolean;
}
/** 24 小时制 HH:MM。 */
export declare const SCHEDULE_TIME_PATTERN: RegExp;
/** 目标会话前缀（与 `private:` / `group:` chatId 约定一致）。 */
export declare const SCHEDULE_TARGET_PATTERN: RegExp;
/**
 * 一条原始记录 → 规范条目；无法修复（缺 id/时间/目标/内容，或格式不对）时返回 undefined。
 * 未知字段一律丢弃：设置页只认这 6 个字段，手写 yml 里的旧笔误不该原样写回。
 */
export declare function normalizeScheduledPrompt(raw: unknown): ScheduledPromptEntry | undefined;
/** 草稿/快照 → 条目数组（丢掉修不好的项；非数组 → 空数组）。 */
export declare function scheduledPromptEntriesOf(raw: unknown): ScheduledPromptEntry[];
/**
 * 严格校验（保存路径用）：任何一条不合格都报告具体位置与原因，不做静默丢弃。
 * 返回的 entries 已规范化（含默认布尔、已 trim、已丢未知字段）。
 */
export declare function validateScheduledPrompts(raw: unknown): {
    entries: ScheduledPromptEntry[];
    issues: string[];
};
/** 新条目的默认 id：p1、p2……跳过已占用的。 */
export declare function nextScheduleId(entries: readonly {
    id: string;
}[]): string;
/** 一条空条目（「+ 添加一条」用）。 */
export declare function emptyScheduledPrompt(entries: readonly {
    id: string;
}[], time?: string): ScheduledPromptEntry;
