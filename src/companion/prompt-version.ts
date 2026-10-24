/**
 * Prompt versions: a short fingerprint of what a chat's system prompt is made
 * of (the persona text, that chat's companion guide, the plugin version).
 * dsh does not replace a live session's system prompt when it changes — it
 * appends the new one and keeps sending the old one too — so a chat whose
 * fingerprint moved on starts a fresh session at its next message.
 * @module dsh-qq-companion/companion/prompt-version
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

/**
 * The persona text of a profile patch file: every `prefix: |` block (the
 * presets' persona), in file order. '' when the file cannot be read.
 */
export function personaBlocks(patchFile: string): string {
  let lines: string[]
  try {
    lines = readFileSync(patchFile, 'utf8').split('\n')
  } catch {
    return ''
  }
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)prefix: \|/.exec(lines[i])
    if (m === null) continue
    const base = m[1].length
    for (i++; i < lines.length; i++) {
      const line = lines[i]
      if (line.trim() !== '' && line.length - line.trimStart().length <= base) { i--; break }
      out.push(line)
    }
  }
  return out.join('\n')
}

/** A short fingerprint of the given parts. */
export function promptFingerprint(...parts: string[]): string {
  const hash = createHash('sha256')
  for (const part of parts) hash.update(part).update('\u0000')
  return hash.digest('hex').slice(0, 16)
}

/**
 * A chat's prompt version: everything its system prompt is made of — the
 * plugin version, the persona text, that chat's companion guide, and the QQ
 * platform section (src/prompt.ts). The platform section is part of it since
 * T7 because its tool sentences are generated from the capability registry:
 * flipping `capabilitiesDeny`（或四个 grant / 三个按关系 deny，按关系不同）changes the
 * prompt, and dsh would otherwise keep sending the stale one beside the new one.
 *
 * ⚠ Every part must be byte-stable for a given state. Anything that varies
 * per call (a timestamp, a Map iteration of a random order, ...) would start a
 * new session on every single message.
 */
export function chatPromptVersion(input: {
  /** Plugin version. */
  version: string
  /** The profile's persona text. */
  persona: string
  /** The companion guide of this chat. */
  guide: string
  /** The platform section of this chat ('' = not computed yet). */
  platform?: string
}): string {
  return promptFingerprint(input.version, input.persona, input.guide, input.platform ?? '')
}
