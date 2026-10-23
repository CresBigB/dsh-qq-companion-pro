/**
 * The persona text of a profile patch file: every `prefix: |` block (the
 * presets' persona), in file order. '' when the file cannot be read.
 */
export declare function personaBlocks(patchFile: string): string;
/** A short fingerprint of the given parts. */
export declare function promptFingerprint(...parts: string[]): string;
/**
 * A chat's prompt version: everything its system prompt is made of — the
 * plugin version, the persona text, that chat's companion guide, and the QQ
 * platform section (src/prompt.ts). The platform section is part of it since
 * T7 because its tool sentences are generated from the capability registry:
 * flipping `capabilitiesDeny`（或 T11 的三个 grant，按关系不同）changes the
 * prompt, and dsh would otherwise keep sending the stale one beside the new one.
 *
 * ⚠ Every part must be byte-stable for a given state. Anything that varies
 * per call (a timestamp, a Map iteration of a random order, ...) would start a
 * new session on every single message.
 */
export declare function chatPromptVersion(input: {
    /** Plugin version. */
    version: string;
    /** The profile's persona text. */
    persona: string;
    /** The companion guide of this chat. */
    guide: string;
    /** The platform section of this chat ('' = not computed yet). */
    platform?: string;
}): string;
