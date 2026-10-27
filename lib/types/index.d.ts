/**
 * dsh-qq-companion-pro: a QQ (OneBot 11 / NapCat) chat channel for DeepSeek Harness.
 *
 * Mounts inside the dsh host process: a reverse-WebSocket server NapCat dials
 * into, one Agent per QQ chat, inbound images/voice handled for the model
 * (local speech-to-text when enabled), outbound replies split at line breaks,
 * [[qq_forward]] merged forwards, allowlist/mention access control, and a set
 * of qq_* tools for media and NapCat APIs.
 * @module dsh-qq-companion
 */
import type { Context as CordisContext } from '@deepseek-ai/cordis';
import type SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import type ToolRuntime from '@deepseek-ai/dsh-tools';
import type { AgentRegistry } from '@deepseek-ai/dsh-agent';
import type { SessionStore } from '@deepseek-ai/dsh-session';
import type { ModelSelection } from '@deepseek-ai/dsh-agent';
import type Z from '@deepseek-ai/schemastery';
import type { OneBotEvent } from './connection.js';
import type { SideAskAgentPort } from './bridge.js';
type Context = CordisContext & {
    tools: ToolRuntime;
    systemPrompt: SystemPrompt;
    agents: AgentRegistry;
    sessions: SessionStore;
    agentDefaultModel: {
        currentSelection(): ModelSelection | undefined;
        saveSelection(next: ModelSelection): Promise<void>;
    };
    agentPresets: {
        readonly defaultId: string;
        resolve(id?: string): Promise<{
            id: string;
        }>;
        mount(agentCtx: unknown, id?: string): Promise<{
            id: string;
        }>;
    };
    sessionPersistence: {
        /** dsh-session-persistence 0.1.6 `stat`: the stored snapshot, or
         * undefined when the id owns no durable log (the retired `inspect`
         * convenience no longer exists on the host service). */
        stat(id: string): Promise<object | undefined>;
        /** /session list previews: open a stored session read-only (never takes
         * write ownership), read the header + a small event prefix, then close. */
        open(id: string, access: 'read'): Promise<{
            header: {
                createdAt?: number;
                agentPreset?: string;
            };
            read(offset?: number, length?: number): Promise<{
                events: readonly {
                    type?: string;
                    data?: {
                        agentPreset?: string;
                        source?: {
                            kind?: string;
                        };
                        content?: readonly {
                            type?: string;
                            text?: string;
                        }[];
                    };
                }[];
            }>;
            close(): Promise<void>;
        }>;
    };
    workspaceRegistry: {
        resolveByPath(path: string): Promise<{
            id: string;
            path: string;
            sessionIds: readonly string[];
            attachSession(sessionId: string): Promise<void>;
        } | undefined>;
        create(path: string, title?: string): Promise<{
            id: string;
            path: string;
            sessionIds: readonly string[];
            attachSession(sessionId: string): Promise<void>;
        }>;
        list(): Array<{
            id: string;
            path: string;
            sessionIds: readonly string[];
        }>;
    };
    commands: {
        execute(agent: unknown, line: string, submittedAttachments: readonly unknown[], signal: AbortSignal): Promise<{
            kind?: string;
            text?: string;
            result?: {
                kind?: string;
                text?: string;
            };
        }>;
    };
    subagents?: {
        getProvider(name: string): {
            inheritsParentContext?: boolean;
            capabilities?: {
                agentOptions?: boolean;
            };
        } | undefined;
        startActivation?(spec: {
            provider: string;
            label: string;
            request: {
                parent: unknown;
                prompt: readonly {
                    type: 'text';
                    text: string;
                }[];
                agentOptions?: {
                    maxTokens?: number;
                };
            };
            signal?: AbortSignal;
            delivery?: 'parent' | 'caller';
        }): Promise<{
            childId: string;
            result: Promise<{
                output?: readonly {
                    type?: string;
                    text?: string;
                }[];
                stopReason?: string;
            }>;
            dispose(): Promise<void>;
        }>;
    };
};
export declare const name = "dsh-qq-companion-pro";
export declare const inject: string[];
/** Plugin configuration (validated by schemastery); see config.ts. */
export type Config = import('./config.js').Config;
export declare const Config: Z<Config>;
export declare const defaultMediaDir: typeof import("./config.js").defaultMediaDir, dshHome: typeof import("./config.js").dshHome, resolveDeprecatedConfig: typeof import("./config.js").resolveDeprecatedConfig, parseGroupTriggerPolicy: typeof import("./config.js").parseGroupTriggerPolicy;
/** Log a meta event; periodic heartbeat events are silenced to keep the log readable. */
export declare function logMetaEvent(selfId: string, event: OneBotEvent, minLevel?: Config['logLevel']): void;
/** 「accessToken 还没配」判定：schema 默认就是空串（config.ts 的
 *  `accessToken: z.string().role('secret').default('')`），纯空白同样视为没配
 *  ——连接层只拒绝 `=== ''`，一份只由空格组成的 token 能通过它的检查但连不上
 *  任何东西。非字符串（旧配置/手写 YAML 的 null）一并按未配置处理。 */
export declare function isAccessTokenUnconfigured(token: unknown): boolean;
/** 「等待配置」态的挂载：accessToken 缺失/纯空白时的**正常**状态，不是错误。
 *
 *  为什么不能照常启动：OneBotConnection.start() 对空 token 直接抛
 *  `reverse mode requires a non-empty accessToken`（安全校验，保留不动），
 *  抛在 apply 里会让本插件 fiber 变成 failed；而宿主 configEditor.edit 只对
 *  `fiber.state === 2`（active）的条目写配置 —— fiber 一 failed，设置页就再也
 *  存不进 token，用户只能手改 profile YAML 救场（部署后「设置不能保存」的死锁）。
 *
 *  所以这里停在等待配置：fiber 保持 active，**不建 OneBotConnection**（不监听
 *  端口、不连 NapCat），不初始化 bridge / 调度器 / 媒体 IO / 会话，也不伪造
 *  online；只挂只读状态服务让设置页概览显示「未连接」。填好 token 保存后宿主
 *  按新配置重启本条目，走下面的正常启动路径。 */
export declare function mountWaitingForAccessToken(ctx: Context, config: Config): void;
/** 惰性读服务需要的最小上下文形状：只有 `get`。 */
export interface ServiceReader {
    get?: (key: string) => unknown;
}
/** Build the BTW-style side-answer seam from the optional host subagents service.
 *
 * 用的是宿主公开的 `startActivation`（provider `spawn`，`delivery: 'caller'`）：
 * - spawn 提供方 `inheritsParentContext === false`，子级不复制父会话历史，
 *   因此不会像 fork 那样每条旁问都给会话库添一份前缀副本；
 * - `delivery: 'caller'` 由调用方自己收结果，不向父会话投递完成通知，
 *   主任务不会被旁问的结算消息打断；
 * - 子级按父级的 preset 组装（工具同父级），所以提示词明确要求只作答；
 *   真正需要收窄工具时由 profile 的 preset 决定，插件不伪造这个边界。
 * 拿不到 subagents/spawn 时返回 undefined，调用方退回排队/插话。 */
export declare function sideAskAgentOf(ctx: ServiceReader): SideAskAgentPort | undefined;
/** Mount the plugin. */
export declare function apply(ctx: Context, config: Config): void;
export {};
