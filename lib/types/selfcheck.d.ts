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
    /** 全局关闭的能力 id（未知 id 在这里告警：写错了不会关掉任何东西）。 */
    capabilitiesDeny?: readonly string[];
    /** 输出协议 B 档总开关（'on' / 缺省 off）。 */
    protocolMode?: 'off' | 'on';
    /** 输出协议的灰度聊天名单（空 = 开启时对所有聊天生效）。 */
    protocolChats?: readonly string[];
}
/** All problems found (empty = all good). */
export declare function selfCheck(c: SelfCheckInput): string[];
