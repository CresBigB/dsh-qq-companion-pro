import type Z from '@deepseek-ai/schemastery';
import type { AccessPolicyConfig } from './chat.js';
import type { ScheduledPrompt } from './companion/index.js';
/** Plugin configuration (validated by schemastery). */
export interface Config {
    host: string;
    port: number;
    accessToken: string;
    botQQ: string;
    requireMention: boolean;
    /** Unknown slash-command handling: intercept（默认）=拦截并给建议；passthrough=透传给模型。 */
    unknownCommand: 'intercept' | 'passthrough';
    /** 任务运行中的新消息处理策略：queue=排队（默认）；steer=插话进当前任务。 */
    newMessagePolicy: 'queue' | 'steer';
    /** steer 模式下自动插话资格：admin=仅管理员（默认）；all=不限。 */
    autoSteerPolicy: 'admin' | 'all';
    /** 等待模型回复超时阈值（毫秒）——超时后登记补发跟踪、回合完成后向原聊天补发最终文字；0=关闭。 */
    deferredTimeoutMs: number;
    dmPolicy: 'open' | 'allowlist' | 'disabled';
    groupPolicy: 'open' | 'allowlist' | 'disabled';
    allowFrom: string[];
    groupAllowFrom: string[];
    adminUsers: string[];
    allowAllUsers: boolean;
    autoAcceptAdminRequests: boolean;
    autoAllowInvitedGroups: boolean;
    ownerTitle: string;
    /** 好友名单（QQ 号）：比群友亲近，但不等同于主人。 */
    friendUsers: string[];
    /** 非主人（群友 / 陌生人）的服从度 0–1。 */
    memberObedience: number;
    /** 好友的服从度 0–1。 */
    friendObedience: number;
    /** 好友的亲密度 0–1。 */
    friendIntimacy: number;
    ignoreSelf: boolean;
    interimMessages: boolean;
    /** Per-interim auto-recall delay (ms) from each interim's send completion. */
    interimRecallMs: number;
    /** interim recall degrade switch (false = send-only interims). */
    interimRecall: boolean;
    sendErrorNotice: boolean;
    /** Per-chat per-minute sliding-window cap for normal (non-command) messages; 0 disables. */
    rateLimitPerMinute: number;
    restrictedMemberPrefix: boolean;
    sensitivePatterns: string[];
    mediaDir: string;
    tempTtlHours: number;
    outboundImageMaxBytes: number;
    maxVoiceBytes: number;
    maxFileBytes: number;
    inboundImageMaxPx: number;
    /** @deprecated alias of inboundImageMaxPx; honored for one release. */
    imageMaxSize?: number;
    /** @deprecated alias of outboundImageMaxBytes; honored for one release. */
    maxImageBytes?: number;
    sttEnabled: boolean;
    sttEngine: 'auto' | 'sherpa-onnx' | 'whisper-cpp' | 'command' | 'openai' | 'custom';
    sttCommand: string;
    sttArgs: string[];
    sttModel: string;
    sttTimeoutMs: number;
    sttLanguage: string;
    sttMaxSeconds: number;
    sttReplacements: Record<string, string>;
    textImageThreshold: number;
    cardFooter: string;
    splitLines: boolean;
    splitMaxMessages: number;
    groupSplitLines: boolean;
    humanTypingPace: boolean;
    typingDelayPerCharMs: number;
    typingDelayMinMs: number;
    typingDelayMaxMs: number;
    fontFiles: string[];
    fontFamilies: string[];
    agentPreset: string;
    adminPreset: string;
    adminPermission: string;
    /** 非管理员私聊与所有群聊的新会话自动切换的宿主权限预设（空 = 不动）。 */
    memberPermission: string;
    /** 全局关闭的能力 id（见 src/capabilities.ts；主人私聊也关）。 */
    capabilitiesDeny: string[];
    /** 只不给好友（friendUsers 里的人）用的能力 id（其他三档照常）。 */
    friendDeny: string[];
    /** 只不给群聊用的能力 id（所有群成员；群里主人发言也按群友档）。 */
    memberDeny: string[];
    /** 只不给陌生私聊（不在好友名单里的非管理员）用的能力 id。 */
    strangerDeny: string[];
    /** 额外给好友（friendUsers 里的人）开放的能力 id（默认关闭、单独给好友开）。 */
    friendGrant: string[];
    /** 额外给群聊（所有群成员；群里主人发言也按群友档）开放的能力 id。 */
    memberGrant: string[];
    /** 额外给陌生私聊（不在好友名单里的非管理员）开放的能力 id。 */
    strangerGrant: string[];
    adminWorkspacePath: string;
    idleResetHours: number;
    /** Automatic session-title template for new (and untitled resumed) QQ
     * sessions; '' = no automatic naming. */
    sessionTitleTemplate: string;
    publicMemoryFile: string;
    scheduledPrompts: ScheduledPrompt[];
    publicMemoryMaxBytes: number;
    groupMemoryDir: string;
    groupMemoryMaxBytes: number;
    stickerDir: string;
    stickerMaxCount: number;
    stickerMaxBytes: number;
    stickerDailyMax: number;
    privateResetDays: number;
    groupResetDays: number;
    privateMemoryMaxBytes: number;
    memoryNoteDenyWords: string[];
    privateSessionKeepDays: number;
    groupSessionKeepDays: number;
    proactiveEnabled: boolean;
    proactiveChatId: string;
    proactiveWindowStart: string;
    proactiveWindowEnd: string;
    proactiveMinPerDay: number;
    proactiveMaxPerDay: number;
    proactiveMinGapMinutes: number;
    proactiveSkipIfActiveMinutes: number;
    proactiveMaxUnanswered: number;
    workspacePath: string;
    /** QQ 会话怎么归入 DSH 工作区：existing 只归入已存在的（另为 workspacePath 建一个）；
     *  auto 连群/私聊各自的工作目录也建；off 完全不碰工作区。 */
    attachWorkspaceMode: 'existing' | 'auto' | 'off';
    inboundFileMaxBytes: number;
    /** @deprecated alias of inboundFileMaxBytes; honored for one release. */
    maxInboundFileBytes?: number;
    /** chats idle longer than this many days are evicted (0 disables). */
    chatIdleEvictDays: number;
    groupReasoningEffort: '' | 'off' | 'low' | 'high' | 'max';
    groupContextLines: number;
    groupNameTriggers: string[];
    groupFollowupSeconds: number;
    groupPeekEnabled: boolean;
    groupPeekGapMinutes: number;
    groupPeekMinMessages: number;
    groupPeekQuietMinutes: number;
    groupPeekWindowStart: string;
    groupPeekWindowEnd: string;
    /** 群里回复时是否自动引用叫她的那条消息：off（默认，不自动）/ busy（中间有别人插话时才引用）/ always（总是引用）。 */
    groupAutoQuote: 'off' | 'busy' | 'always';
    /** 输出协议 B 档总开关：on = 模型可以在回复最后一行写【控制】{json} 精确控制
     *  是否回应 / 分几条发 / 引用哪条；默认 off（不解析、零行为变化）。 */
    protocolMode: 'off' | 'on';
    /** 只在哪些聊天启用输出协议（private:QQ号 / group:群号）；空 = 开启时对所有聊天生效。 */
    protocolChats: string[];
    /** Escape hatch: skip the download private-address check (local reverse proxy). */
    allowPrivateHosts: boolean;
    /** inbound (chatId, message_id) dedup window in seconds; 0 disables. */
    dedupWindowSeconds: number;
    /** tool-send audit jsonl (mediaDir/qq-actions.log). */
    actionAuditEnabled: boolean;
    /** decision-trace jsonl (mediaDir/qq-trace.jsonl); default off — no
     * file, no behavior difference. */
    traceEnabled: boolean;
    /** trace level; 'warn' records only ok:false (rejected/failed/dropped) events. */
    traceLevel: 'debug' | 'warn';
    /** Console log gate: messages below this level are dropped (debug < info < warn < error). */
    logLevel: 'debug' | 'info' | 'warn' | 'error';
}
/** Default media dir: <dsh-home>/media/onebot (dsh-home = $DSH_HOME or ~/.dsh). */
export declare function defaultMediaDir(): string;
/** The dsh data home ($DSH_HOME or ~/.dsh); source of the .agent-presets dir. */
export declare function dshHome(): string;
export declare const Config: Z<Config>;
/** Map deprecated config names onto their renamed fields: a legacy value is
 * honored only while the new name still sits at its schema default (the new
 * name wins when both are configured), each legacy use warns once, and the
 * legacy keys never leak into the effective config. */
export declare function resolveDeprecatedConfig(config: Config): Config;
/** Resolve env-var fallbacks into the effective access policy. */
export declare function resolvePolicy(config: Config): AccessPolicyConfig;
