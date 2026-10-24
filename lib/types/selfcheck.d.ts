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
    /** 只对好友 / 群聊 / 陌生人关掉的能力 id（T11 r1；未知 id 同样告警）。 */
    friendDeny?: readonly string[];
    memberDeny?: readonly string[];
    strangerDeny?: readonly string[];
    /** 额外给好友 / 群聊 / 陌生人开放的能力 id（未知 id 同样告警：写错了开不出任何东西）。 */
    friendGrant?: readonly string[];
    memberGrant?: readonly string[];
    strangerGrant?: readonly string[];
    /** 额外给主人私聊开放的能力 id（T14 r2；未知 id 同样告警）。 */
    ownerGrant?: readonly string[];
    /** 输出协议 B 档总开关（'on' / 缺省 off）。 */
    protocolMode?: 'off' | 'on';
    /** 输出协议的灰度聊天名单（空 = 开启时对所有聊天生效）。 */
    protocolChats?: readonly string[];
    /** 语音合成（T15）：开启但引擎没配好时，工具照常出现、一调用就报错。 */
    ttsEnabled?: boolean;
    ttsEngine?: 'command' | 'sherpa-onnx';
    ttsCommand?: string;
    ttsArgs?: readonly string[];
    ttsModel?: string;
    ttsMaxChars?: number;
    ttsTimeoutMs?: number;
}
/** All problems found (empty = all good). */
export declare function selfCheck(c: SelfCheckInput): string[];
