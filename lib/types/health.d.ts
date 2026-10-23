import type { FailureRefRecord } from './ref.js';
import { type CapabilitySummary } from './capabilities.js';
/** How many recent ok:false events the report lists. */
export declare const HEALTH_RECENT_FAILURES = 5;
export interface HealthDeps {
    /** The plugin media dir (artifact source + archive destination). */
    mediaDir: string;
    /** Connection snapshot. */
    connection: {
        connected: boolean;
        selfId: string;
    };
    /** Listen address for the connection line. */
    transport: {
        host: string;
        port: number;
    };
    /** Bind-retry counter (defensive read of the
     * connection's internal state; undefined fields render as 未知). */
    retryState: {
        reverseRetryAttempts?: number;
    };
    /** Dedup window snapshot. */
    dedup: {
        entries: number;
        windowSeconds: number;
    };
    /** /doctor 权限行：管理员私聊与其他会话各自自动切换的宿主权限预设
     * （'' = 宿主默认预设）；absent = 报告省略该行。 */
    permissions?: {
        admin: string;
        member: string;
    };
    /** /doctor 能力行（`capabilitySummary()`，按管理员私聊视角）；
     *  absent = 报告省略该行。 */
    capabilities?: () => CapabilitySummary;
    /** /doctor 群管理写操作提示行（T13）：非主人档真的开了这两个能力时返回一行
     *  警告，空串 = 不提。absent = 报告省略该行。 */
    groupWriteWarning?: () => string;
    /** Write-gate snapshot. */
    /** The already-redacted config snapshot (see redactSnapshot). */
    configSnapshot: Record<string, unknown>;
    /** Secret VALUES to scrub from every packed artifact (e.g. accessToken). */
    secrets?: readonly string[];
    /** How many recent ok:false events to include (default HEALTH_RECENT_FAILURES). */
    recentFailures?: number;
    /** the recent fault references (resolved live by the bridge);
     * absent = the report omits the reference section. */
    failureRefs?: () => FailureRefRecord[];
    /** the reference stamped into the exported archive file name
     * (explicit /doctor export argument, or the latest recorded fault). */
    triggerRef?: string;
    /** Extra report lines from the companion features (QQ liveness, plans,
     * memory sizes); absent = no companion section. */
    companion?: () => Promise<string[]>;
    log(level: 'info' | 'warn', message: string): void;
}
/** Redact a config snapshot: secret-looking keys become 已配置/未配置, nested
 * objects are walked. Returns a new object (never mutates the input). */
export declare function redactSnapshot(config: Record<string, unknown>): Record<string, unknown>;
/** The secret scrub applied to every packed text artifact. */
export declare function scrubSecrets(text: string, secrets: readonly string[]): string;
/** One-line-per-artifact file size summary helper (human readable). */
export declare function formatBytes(size: number): string;
/** Render the /doctor health summary (plain text, one ▍ block). */
export declare function healthReport(deps: HealthDeps): Promise<string>;
interface TraceLine {
    ts: number;
    traceId: string;
    stage: string;
    ok: boolean;
    reason?: string;
    data?: {
        ref?: unknown;
    };
}
/** The most recent ok:false trace events (file order, newest last). */
export declare function recentFailures(file: string, count: number): Promise<TraceLine[]>;
/** Export the diagnostics archive; returns the archive path. */
export declare function exportDiagnostics(deps: HealthDeps): Promise<string>;
/** CRC-32 (IEEE 0xEDB88320, as required by the ZIP APPENDIX format). */
export declare function crc32(buf: Buffer): number;
/** Pack entries into a ZIP archive (method=stored, UTF-8 names). */
export declare function buildZip(entries: Array<{
    name: string;
    data: Buffer;
}>): Buffer;
export {};
