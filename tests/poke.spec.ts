import { describe, expect, it } from 'vitest'

import type { OneBotEvent } from '../src/connection.js'
import { POKE_TEXT, parsePokeNotice, pokeMessageEvent } from '../src/poke.js'
import { makeCmdHarness } from './helpers/bridge-harness.js'

/** OneBot 11 poke notice 的常见写法（NapCat）。 */
function pokeEvent(extra: Record<string, unknown> = {}): OneBotEvent {
  return {
    post_type: 'notice',
    notice_type: 'notify',
    sub_type: 'poke',
    user_id: 10001,
    target_id: 10002,
    ...extra,
  } as OneBotEvent
}

describe('parsePokeNotice', () => {
  it('reads a private poke (no group_id)', () => {
    expect(parsePokeNotice(pokeEvent())).toEqual({
      kind: 'private',
      userId: '10001',
      groupId: '',
      targetId: '10002',
    })
  })

  it('reads a group poke and keeps the group id', () => {
    expect(parsePokeNotice(pokeEvent({ group_id: 643561596 }))).toEqual({
      kind: 'group',
      userId: '10001',
      groupId: '643561596',
      targetId: '10002',
    })
  })

  it('accepts the notice_type="poke" spelling too', () => {
    const event = pokeEvent({ notice_type: 'poke', sub_type: undefined })
    expect(parsePokeNotice(event)?.targetId).toBe('10002')
  })

  it('ignores other notices, other sub types, and pokes without both ids', () => {
    expect(parsePokeNotice({ post_type: 'notice', notice_type: 'group_increase' } as OneBotEvent)).toBeNull()
    expect(parsePokeNotice(pokeEvent({ sub_type: 'honor' }))).toBeNull()
    expect(parsePokeNotice(pokeEvent({ target_id: undefined }))).toBeNull()
    expect(parsePokeNotice(pokeEvent({ user_id: undefined }))).toBeNull()
    expect(parsePokeNotice({ post_type: 'message', message_type: 'private' } as OneBotEvent)).toBeNull()
  })

  it('stringifies numeric ids and trims string ones', () => {
    expect(parsePokeNotice(pokeEvent({ user_id: ' 10001 ', target_id: 10002 }))).toMatchObject({
      userId: '10001',
      targetId: '10002',
    })
  })
})

describe('pokeMessageEvent', () => {
  it('builds a private message event without a group id', () => {
    const event = pokeMessageEvent({ kind: 'private', userId: '10001', groupId: '', targetId: '10002' })
    expect(event).toMatchObject({
      post_type: 'message',
      message_type: 'private',
      user_id: '10001',
      raw_message: POKE_TEXT,
    })
    expect(event.group_id).toBeUndefined()
    expect(event.message).toEqual([{ type: 'text', data: { text: POKE_TEXT } }])
  })

  it('keeps the group id for a group poke', () => {
    const event = pokeMessageEvent({ kind: 'group', userId: '10001', groupId: '888', targetId: '10002' })
    expect(event).toMatchObject({ message_type: 'group', group_id: '888' })
  })
})

describe('the bridge answers a poke like a message', () => {
  it('dispatches one turn for a private poke aimed at her', async () => {
    const h = await makeCmdHarness()
    await h.bridge.handlePoke(pokeEvent())
    expect(h.captured.followups).toHaveLength(1)
    expect(h.captured.followups[0]?.text).toContain(POKE_TEXT)
  })

  it('stays silent when the poke was aimed at somebody else', async () => {
    const h = await makeCmdHarness()
    await h.bridge.handlePoke(pokeEvent({ target_id: 99999 }))
    expect(h.captured.followups).toHaveLength(0)
  })

  it('stays silent when she poked herself (user_id === target_id)', async () => {
    const h = await makeCmdHarness()
    await h.bridge.handlePoke(pokeEvent({ user_id: 10002, target_id: 10002 }))
    expect(h.captured.followups).toHaveLength(0)
  })

  it('honours the poke switch', async () => {
    const h = await makeCmdHarness({ pokeReplyEnabled: false })
    await h.bridge.handlePoke(pokeEvent())
    expect(h.captured.followups).toHaveLength(0)
  })

  it('treats a group poke as an @ even when a mention is required', async () => {
    const h = await makeCmdHarness({ requireMention: true })
    await h.bridge.handlePoke(pokeEvent({ group_id: 643561596 }))
    expect(h.captured.followups).toHaveLength(1)
    expect(h.captured.followups[0]?.text).toContain(POKE_TEXT)
  })

  it('stays silent for a group poke aimed at another member', async () => {
    const h = await makeCmdHarness({ requireMention: true })
    await h.bridge.handlePoke(pokeEvent({ group_id: 643561596, target_id: 55555 }))
    expect(h.captured.followups).toHaveLength(0)
  })

  it('still respects the group allowlist (a poke is not a bypass)', async () => {
    const h = await makeCmdHarness({ groupPolicy: 'allowlist', groupAllowFrom: ['999'] })
    await h.bridge.handlePoke(pokeEvent({ group_id: 643561596 }))
    expect(h.captured.followups).toHaveLength(0)
  })
})
