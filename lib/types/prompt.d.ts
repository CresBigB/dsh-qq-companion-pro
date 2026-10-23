/** {@link buildPlatformPrompt} 的入参。 */
export interface PlatformPromptInput {
    /** 是否提醒「[关系:…]」关系绸标的语义（restrictedMemberPrefix：非管理员
     *  消息前的关系绸标开关）。 */
    restrictedMembers: boolean;
    /** 这个聊天实际启用的能力 id（resolveCapabilities 的结果；顺序无关）。 */
    enabledCapabilityIds: readonly string[];
    /** 这个聊天是否启用输出协议 B 档（bridge.protocolEnabledFor）。**缺席/false 时
     *  平台段一个字都不多**——这是「未启用 = 零行为变化」的前提，也会让平台段
     *  指纹在开启/关闭之间自然变化（预期行为）。 */
    protocol?: boolean;
}
/**
 * 已启用能力的「工具 → 用法」句子，一行一个能力（顺序 = 注册表顺序）。
 *
 * 工具名、中文短名、说明全部来自 CAPABILITIES；**未启用的能力一个字都不出现**。
 * 返回空数组 = 这个聊天没有任何可用能力（调用方据此整段不写）。
 * @param enabledCapabilityIds - 启用的能力 id（来自 resolveCapabilities().enabled）。
 * @returns 每个启用的能力一行。
 */
export declare function capabilityPromptLines(enabledCapabilityIds: readonly string[]): string[];
/**
 * Build the platform-guidance section text.
 * @param input - restricted-member mode plus the capabilities enabled for this chat.
 * @returns the section text.
 */
export declare function buildPlatformPrompt(input: PlatformPromptInput): string;
