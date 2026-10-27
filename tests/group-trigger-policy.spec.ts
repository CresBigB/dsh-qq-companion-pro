import { describe, expect, it } from 'vitest'

import { Config, parseGroupTriggerPolicy } from '../src/config.js'
import {
  evaluateGroupTrigger,
  shouldReply,
  type GroupTriggerConfig,
  type GroupTriggerMessage,
} from '../src/group-trigger-policy.js'

const message = (overrides: Partial<GroupTriggerMessage> = {}): GroupTriggerMessage => ({
  groupId: '群1', userId: '用户1', text: '普通聊天', ...overrides,
})

const proactive: GroupTriggerConfig = {
  mentionRequired: false,
  proactiveEnabled: true,
  replyMode: 'all',
}

describe('group trigger policy', () => {
  it('exposes an auditable JSON config field and safely downgrades bad JSON', () => {
    expect(Config({}).groupTriggerPolicy).toBe('{}')
    expect(Config({ groupTriggerPolicy: '{"replyMode":"off"}' }).groupTriggerPolicy).toBe('{"replyMode":"off"}')
    expect(parseGroupTriggerPolicy('{"replyMode":"off"}')).toEqual({ replyMode: 'off' })
    expect(parseGroupTriggerPolicy('{broken')).toEqual({})
    expect(parseGroupTriggerPolicy({ replyMode: 'off', botNames: 7, groups: { '群1': { keywords: ['项目', 7] } } })).toEqual({ replyMode: 'off', groups: { '群1': { keywords: ['项目'] } } })
    expect(parseGroupTriggerPolicy({ replyMode: 'off' })).toEqual({ replyMode: 'off' })
  })

  it('keeps the old behavior by default: only an @ or bot reply is eligible', () => {
    expect(shouldReply({}, message())).toBe(false)
    expect(shouldReply({}, message({ mentioned: true }))).toBe(true)
    expect(shouldReply({}, message({ replyToBot: true }))).toBe(true)
  })

  it('resolves group defaults and lets a user override the group', () => {
    const config: GroupTriggerConfig = {
      mentionRequired: false,
      proactiveEnabled: true,
      replyMode: 'off',
      groups: { 群1: { replyMode: 'related', keywords: ['项目'] } },
      users: { 用户1: { replyMode: 'all' } },
    }
    expect(shouldReply(config, message({ text: '今天聊项目' }))).toBe(true)
    expect(shouldReply(config, message({ userId: '用户2', text: '今天聊项目' }))).toBe(true)
    expect(shouldReply(config, message({ userId: '用户2', text: '无关闲聊' }))).toBe(false)
  })

  it('requires a real mention or bot reply when mentionRequired is enabled', () => {
    const config: GroupTriggerConfig = {
      ...proactive,
      mentionRequired: true,
      botName: '小鱼',
      keywords: ['插件'],
    }
    expect(evaluateGroupTrigger(config, message({ text: '小鱼，这个插件怎么用' }))).toEqual({
      shouldReply: false,
      reason: 'mention-required',
      related: true,
    })
    expect(shouldReply(config, message({ text: '小鱼，这个插件怎么用', mentioned: true }))).toBe(true)
    expect(shouldReply(config, message({ text: '小鱼，这个插件怎么用', replyToBot: true }))).toBe(true)
  })

  it('supports mentionRequired and replyToBot without mutating inputs', () => {
    const config: GroupTriggerConfig = { ...proactive, mentionRequired: true }
    const input = message({ replyToBot: true })
    const before = structuredClone({ config, input })
    expect(shouldReply(config, input)).toBe(true)
    expect({ config, input }).toEqual(before)
    expect(shouldReply(config, message())).toBe(false)
  })

  it('related mode matches bot names, aliases, and keywords', () => {
    const config: GroupTriggerConfig = {
      mentionRequired: false,
      proactiveEnabled: true,
      replyMode: 'related',
      botName: '小鱼',
      aliases: ['鱼鱼'],
      keywords: ['插件'],
    }
    expect(evaluateGroupTrigger(config, message({ text: '小鱼你看看' })).shouldReply).toBe(true)
    expect(shouldReply(config, message({ text: '鱼鱼在吗' }))).toBe(true)
    expect(shouldReply(config, message({ text: '这个插件怎么用' }))).toBe(true)
    expect(shouldReply(config, message({ text: '天气不错' }))).toBe(false)
  })

  it('off always wins and proactive all replies to an unmentioned message', () => {
    expect(shouldReply({ ...proactive, replyMode: 'off' }, message())).toBe(false)
    expect(shouldReply(proactive, message())).toBe(true)
  })

  it('probability is injectable, clamped, and boundary-safe', () => {
    const base = { ...proactive, replyMode: 'probability' as const }
    expect(shouldReply({ ...base, probability: 0 }, message(), () => 0)).toBe(false)
    expect(shouldReply({ ...base, probability: 1 }, message(), () => 1)).toBe(true)
    expect(shouldReply({ ...base, probability: 0.5 }, message(), () => 0.49)).toBe(true)
    expect(shouldReply({ ...base, probability: 0.5 }, message(), () => 0.5)).toBe(false)
    expect(shouldReply({ ...base, probability: -10 }, message(), () => 0)).toBe(false)
    expect(shouldReply({ ...base, probability: 10 }, message(), () => 1)).toBe(true)
  })

  it('a bare probability selects probability mode instead of being ignored', () => {
    const bare = { mentionRequired: false, proactiveEnabled: true } // no replyMode: the 'all' default would ignore it
    expect(evaluateGroupTrigger({ ...bare, probability: 0 }, message(), () => 0)).toEqual({ shouldReply: false, reason: 'probability', related: false })
    expect(evaluateGroupTrigger({ ...bare, probability: 1 }, message(), () => 1).shouldReply).toBe(true)
    // An explicit mode still wins over the implied one.
    expect(evaluateGroupTrigger({ ...bare, replyMode: 'all', probability: 0 }, message(), () => 0).shouldReply).toBe(true)
  })

  it('supports the object invocation form and gives a useful evaluation reason', () => {
    const result = evaluateGroupTrigger({
      config: { ...proactive, replyMode: 'related', keywords: ['猫'] },
      message: message({ text: '猫猫' }),
    })
    expect(result).toEqual({ shouldReply: true, reason: 'related', related: true })
  })
})
