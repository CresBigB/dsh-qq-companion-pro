/** 一份要注入的聊天专属文件。 */
export interface ChatScopeFile {
    /** 注入文案里的抬头（例如「本群的规则与记忆」）。 */
    label: string;
    /** 文件绝对路径。 */
    path: string;
    /** 最多注入多少字节（超出截断）。 */
    maxBytes: number;
}
/** 决定「这个聊天要注入哪些文件」所需的配置（都是设置页里已有的项）。 */
export interface ChatScopeInput {
    chatId: string;
    /** 每群记忆目录（= `<总工作区>/companion/groups`，由 groupMemoryRootOf 算好）。 */
    groupMemoryRoot: string;
    /** 管理员私聊的记忆目录（私聊 AGENTS.md 所在）。 */
    adminWorkspacePath: string;
    /** 每群记忆上限（字节，0 = 不限制）。 */
    groupMemoryMaxBytes: number;
    /** 私聊记忆上限（字节，0 = 不限制）。 */
    publicMemoryMaxBytes: number;
}
/** 默认的单文件注入上限：没配上限时也别把整个文件灌进上下文。 */
export declare const CHAT_SCOPE_DEFAULT_MAX_BYTES: number;
/** 这个聊天要注入的文件清单；顺序 = 注入顺序（越靠后越靠近问题）。 */
export declare function chatScopeFiles(input: ChatScopeInput): ChatScopeFile[];
/** 按字节上限截断，并明确告诉模型余下内容被省略了。 */
export declare function truncateUtf8(text: string, maxBytes: number): string;
/**
 * 做一次「读取这个聊天专属文件」的函数。返回的函数每次调用都检查 mtime/size，
 * 文件没变就走缓存；文件不存在返回空串。
 */
export declare function createChatScopeReader(input: ChatScopeInput, log?: (level: 'info' | 'warn' | 'error' | 'debug', message: string) => void): () => string;
