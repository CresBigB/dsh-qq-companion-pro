/** {@link buildPlatformPrompt} 的入参。 */
export interface PlatformPromptInput {
    /** 是否提醒「[受限用户:仅问答]」前缀的语义（restrictedMemberPrefix）。 */
    restrictedMembers: boolean;
    /** 这个聊天实际启用的能力 id（resolveCapabilities 的结果；顺序无关）。 */
    enabledCapabilityIds: readonly string[];
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
