export interface SelfCheckInput {
    host: string;
    accessToken: string;
    botQQ: string;
    adminUsers: readonly string[];
    dmPolicy: string;
    groupPolicy: string;
    allowFrom: readonly string[];
    groupAllowFrom: readonly string[];
    allowAllUsers: boolean;
    /** 非管理员私聊与所有群聊的新会话自动切换的宿主权限预设（'' = 不动）。 */
    memberPermission: string;
    workspacePath: string;
    adminWorkspacePath: string;
    groupMemoryDir: string;
    publicMemoryFile: string;
    scheduledPrompts: ReadonlyArray<{
        id: string;
        time: string;
        chatId: string;
        prompt: string;
    }>;
    proactiveEnabled: boolean;
    proactiveChatId: string;
    proactiveWindowStart: string;
    proactiveWindowEnd: string;
    proactiveMinPerDay: number;
    proactiveMaxPerDay: number;
    splitLines: boolean;
    splitMaxMessages: number;
    humanTypingPace?: boolean;
    typingDelayMinMs?: number;
    typingDelayMaxMs?: number;
}
/** All problems found (empty = all good). */
export declare function selfCheck(c: SelfCheckInput): string[];
