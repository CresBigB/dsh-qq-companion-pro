import type { LivenessSnapshot } from '../liveness.js';
import type { SendCounterSnapshot } from './send-counter.js';
export interface CompanionStatusDeps {
    liveness?: () => LivenessSnapshot;
    sendCounter?: () => SendCounterSnapshot;
    scheduler?: () => Array<{
        id: string;
        time: string;
        firedToday: boolean;
    }>;
    proactive?: () => {
        remaining: string[];
        firedToday: number;
    };
    stickers?: () => {
        count: number;
        maxCount: number;
        today: number;
        dailyMax: number;
    };
    /** Memory files to size; `max` (bytes) renders a percentage. */
    memoryFiles?: Array<{
        label: string;
        path: string;
        max?: number;
    }>;
    /** Root of per-group memory dirs. */
    groupMemoryDir?: string;
    groupMemoryMaxBytes?: number;
    now?: () => number;
}
/** 文件字节数（不存在 / 读不到 = undefined）。/doctor 与设置页概览共用。 */
export declare function fileSize(path: string): Promise<number | undefined>;
/** 一个要统计大小的记忆文件（/doctor 的「记忆文件」行与概览快照同源）。 */
export interface MemoryFileSpec {
    label: string;
    path: string;
    /** 上限（字节）；undefined = 只报大小不报百分比。 */
    max?: number;
}
/** 收集要给 /doctor 与概览快照报大小的记忆文件：公开 / 私密（调用方传入）
 *  + 每群一份 `<groupMemoryDir>/<群号>/AGENTS.md`。
 *  `groupDirUnreadable` = 群记忆目录填了但读不到（/doctor 一直为此渲染一行说明）。 */
export declare function memoryFileSpecs(deps: {
    memoryFiles?: Array<{
        label: string;
        path: string;
        max?: number;
    }>;
    groupMemoryDir?: string;
    groupMemoryMaxBytes?: number;
}): Promise<{
    files: MemoryFileSpec[];
    groupDirUnreadable: boolean;
}>;
/** Render the companion lines (never throws: a failing part renders 未知). */
export declare function companionStatusLines(deps: CompanionStatusDeps): Promise<string[]>;
