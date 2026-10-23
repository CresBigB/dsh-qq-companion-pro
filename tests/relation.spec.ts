/**
 * T10a · 关系矩阵机制层（src/relation.ts）：关系判定、调参、绸标格式与剥标签。
 *
 * 这一层只做机制：判定单一来源（主人 > 好友 > 群友 / 陌生人）、四段绸标的
 * 逐字格式、以及解析端（预览 / 活动记录 / sanitize）剥绸标的公共入口。
 * guide 的语气文案是 T10b 的事，这里一个字都不涉及。
 * @module dsh-qq-companion-pro/tests/relation
 */
import { describe, expect, it } from 'vitest'

import {
  RELATION_DEFAULTS,
  classifyRelation,
  describeRelation,
  relationBanner,
  relationProfile,
  stripRelationPrefix,
  type Relation,
} from '../src/relation.js'

/** 判定名单小工具。 */
function policy(adminUsers: string[], friendUsers: string[] = []) {
  return { adminUsers, friendUsers }
}

describe('classifyRelation — 单一判定来源，主人 > 好友 > 群友 / 陌生人', () => {
  const names = policy(['10001'], ['20002'])

  it('四种关系各自落位：群聊里不是主人的是群友，非管理员私聊的是陌生人', () => {
    expect(classifyRelation({ userId: '10001', chatKind: 'private', policy: names })).toBe('owner')
    expect(classifyRelation({ userId: '10001', chatKind: 'group', policy: names })).toBe('owner')
    expect(classifyRelation({ userId: '20002', chatKind: 'private', policy: names })).toBe('friend')
    expect(classifyRelation({ userId: '20002', chatKind: 'group', policy: names })).toBe('friend')
    expect(classifyRelation({ userId: '30003', chatKind: 'group', policy: names })).toBe('groupMember')
    expect(classifyRelation({ userId: '30003', chatKind: 'private', policy: names })).toBe('stranger')
  })

  it('优先级：同时在主人与好友名单里算主人（adminUsers 先判）', () => {
    const both = policy(['10001'], ['10001'])
    expect(classifyRelation({ userId: '10001', chatKind: 'private', policy: both })).toBe('owner')
    expect(classifyRelation({ userId: '10001', chatKind: 'group', policy: both })).toBe('owner')
  })

  it('空名单：群里是群友、私聊是陌生人（不会凭聊天类型造出主人）', () => {
    for (const chatKind of ['private', 'group'] as const) {
      expect(classifyRelation({ userId: '10001', chatKind, policy: policy([]) })).toBe(chatKind === 'group' ? 'groupMember' : 'stranger')
    }
  })
})

describe('relationProfile — 主人写死，其余取配置', () => {
  it('默认值：主人的语气/服从/亲密/可指挥固定，好友与群友/陌生人取三个配置的默认', () => {
    expect(relationProfile('owner')).toEqual({ tone: 'soft', obedience: 0.9, intimacy: 0.9, canCommand: true })
    expect(relationProfile('friend')).toEqual({ tone: 'teasing', obedience: 0.5, intimacy: 0.6, canCommand: false })
    expect(relationProfile('groupMember')).toEqual({ tone: 'neutral', obedience: 0.2, intimacy: 0.2, canCommand: false })
    expect(relationProfile('stranger')).toEqual({ tone: 'neutral', obedience: 0.2, intimacy: 0.1, canCommand: false })
    // 默认值与 RELATION_DEFAULTS 同源（config schema 的默认值必须对上）。
    expect(RELATION_DEFAULTS).toEqual({ memberObedience: 0.2, friendObedience: 0.5, friendIntimacy: 0.6 })
  })

  it('配置覆盖：friendObedience / friendIntimacy / memberObedience 各自生效，主人的值不受影响', () => {
    const config = { friendObedience: 0.7, friendIntimacy: 0.3, memberObedience: 0.8 }
    expect(relationProfile('friend', config)).toEqual({ tone: 'teasing', obedience: 0.7, intimacy: 0.3, canCommand: false })
    expect(relationProfile('groupMember', config)).toEqual({ tone: 'neutral', obedience: 0.8, intimacy: 0.2, canCommand: false })
    expect(relationProfile('stranger', config)).toEqual({ tone: 'neutral', obedience: 0.8, intimacy: 0.1, canCommand: false })
    expect(relationProfile('owner', config)).toEqual({ tone: 'soft', obedience: 0.9, intimacy: 0.9, canCommand: true })
  })

  it('memberObedience 边界 0 / 1：群友与陌生人都照搬，绸标仍是一位小数', () => {
    for (const value of [0, 1]) {
      expect(relationProfile('groupMember', { memberObedience: value }).obedience).toBe(value)
      expect(relationProfile('stranger', { memberObedience: value }).obedience).toBe(value)
      const banner = describeRelation(relationProfile('stranger', { memberObedience: value }), 'stranger')
      expect(banner).toBe('[关系:陌生人｜语气中性｜服从' + value.toFixed(1) + '｜亲密0.1｜不可指挥]')
    }
    // 0 不等于「不听人话」：语气与亲密都不因服从度改变。
    expect(relationProfile('groupMember', { memberObedience: 0 }).tone).toBe('neutral')
    expect(relationProfile('groupMember', { memberObedience: 0 }).canCommand).toBe(false)
  })
})

describe('describeRelation — 四段绸标逐字固定（全角｜、数值一位小数）', () => {
  it('四种关系的完整绸标逐字', () => {
    const banner = (id: Relation): string => describeRelation(relationProfile(id), id)
    expect(banner('owner')).toBe('[关系:主人｜语气亲切｜服从0.9｜亲密0.9｜可指挥]')
    expect(banner('friend')).toBe('[关系:好友｜语气打趣｜服从0.5｜亲密0.6｜不可指挥]')
    expect(banner('groupMember')).toBe('[关系:群友｜语气中性｜服从0.2｜亲密0.2｜不可指挥]')
    expect(banner('stranger')).toBe('[关系:陌生人｜语气中性｜服从0.2｜亲密0.1｜不可指挥]')
  })

  it('四段全在、分隔符全角｜、方括号闭合（格式不随数值变）', () => {
    const text = describeRelation({ tone: 'teasing', obedience: 1, intimacy: 0, canCommand: false }, 'friend')
    expect(text).toBe('[关系:好友｜语气打趣｜服从1.0｜亲密0.0｜不可指挥]')
    expect(text.split('｜')).toHaveLength(5)
    expect(text.startsWith('[关系:')).toBe(true)
    expect(text.endsWith(']')).toBe(true)
  })
})

describe('relationBanner — 判定 + 调参 + 绸标一步到位', () => {
  it('按发送者与聊天类型给出对应绸标', () => {
    const names = policy(['10001'], ['20002'])
    expect(relationBanner({ userId: '10001', chatKind: 'private', policy: names })).toBe('[关系:主人｜语气亲切｜服从0.9｜亲密0.9｜可指挥]')
    expect(relationBanner({ userId: '20002', chatKind: 'group', policy: names })).toBe('[关系:好友｜语气打趣｜服从0.5｜亲密0.6｜不可指挥]')
    expect(relationBanner({ userId: '30003', chatKind: 'group', policy: names })).toBe('[关系:群友｜语气中性｜服从0.2｜亲密0.2｜不可指挥]')
    expect(relationBanner({ userId: '30003', chatKind: 'private', policy: names })).toBe('[关系:陌生人｜语气中性｜服从0.2｜亲密0.1｜不可指挥]')
  })

  it('配置覆盖透传到绸标', () => {
    const banner = relationBanner(
      { userId: '30003', chatKind: 'group', policy: policy([], []) },
      { memberObedience: 1, friendObedience: 0.1, friendIntimacy: 0.9 },
    )
    expect(banner).toBe('[关系:群友｜语气中性｜服从1.0｜亲密0.2｜不可指挥]')
  })
})

describe('stripRelationPrefix — 只剥开头绸标（新格式 + 历史格式）', () => {
  it('剥新绸标（含尾随空格）', () => {
    expect(stripRelationPrefix('[关系:群友｜语气中性｜服从0.2｜亲密0.2｜不可指挥] [10:01 小王(20003)] 你好'))
      .toBe('[10:01 小王(20003)] 你好')
    expect(stripRelationPrefix('[关系:主人｜语气亲切｜服从0.9｜亲密0.9｜可指挥] 正文')).toBe('正文')
  })

  it('历史会话的 [受限用户:仅问答] 照样剥（兼容）', () => {
    expect(stripRelationPrefix('[受限用户:仅问答] [10:01 小王(20003)] 你好')).toBe('[10:01 小王(20003)] 你好')
    expect(stripRelationPrefix('[受限用户:仅问答] 正文')).toBe('正文')
  })

  it('不在开头 / 没有绸标时一个字都不动', () => {
    expect(stripRelationPrefix('正文 [关系:群友｜语气中性｜服从0.2｜亲密0.2｜不可指挥]')).toBe('正文 [关系:群友｜语气中性｜服从0.2｜亲密0.2｜不可指挥]')
    expect(stripRelationPrefix('<user_message qq="1">正文</user_message>')).toBe('<user_message qq="1">正文</user_message>')
    expect(stripRelationPrefix('')).toBe('')
  })
})