/**
 * T10b 护栏：guide 的「跟不同的人怎么说话」是正面文案，不是一叠禁令。
 *
 * 三类断言，都是防回归的硬门槛：
 * 1. 配比：禁令类句子 **不增加**、正面类句子 **至少 +2**（改造前基线已量在常量里）；
 * 2. 禁词：怼 / 敷衍 / 懒得 / 关我 / 随便你 只允许出现在带否定的句子里；
 * 3. 边界：5 条安全边界换成正面的写法之后，仍然一条不少地留在文案里；
 * 4. 数值：服从度 / 亲密度取自关系矩阵配置，配置变了文案跟着变。
 * @module dsh-qq-companion/tests/guide-manner
 */
import { describe, expect, it } from 'vitest'

import { buildCompanionGuide, type CompanionGuideConfig } from '../src/companion/index.js'

const config: CompanionGuideConfig = {
  ownerTitle: '主人', adminUsers: ['10001'],
  friendUsers: ['20002', '20003'],
  memberObedience: 0.2, friendObedience: 0.5, friendIntimacy: 0.6,
  publicMemoryFile: '/m/AGENTS.md', publicMemoryMaxBytes: 16384,
  adminWorkspacePath: '/m/private', privateMemoryMaxBytes: 24576,
  groupMemoryDir: '/m/groups', groupMemoryMaxBytes: 10240,
  privateResetDays: 5, groupResetDays: 1, idleResetHours: 168,
  groupContextLines: 15, groupNameTriggers: ['大肥鱼', '肥鱼'], groupFollowupSeconds: 180, groupPeekEnabled: true,
  privateProactiveEnabled: true, privateProactiveWindowStart: '09:00', privateProactiveWindowEnd: '22:00', privateProactiveMaxUnanswered: 2,
  groupProactiveEnabled: false, groupProactiveWindowStart: '09:00', groupProactiveWindowEnd: '22:00', groupProactiveMaxUnanswered: 1,
  stickerDir: '/m/stickers', diaryTime: '01:30',
}

const AUDIENCES = ['owner', 'group', 'other'] as const

/** 禁令类关键词：句子里出现任何一个就算“禁令句”。 */
const NEG = /禁止|不能|不得|不准|不许|仅|只有/
/** 正面类关键词：句子里出现任何一个就算“正面句”。 */
const POS = /可以|能|愿意|帮|软|好听|亲近/
/** 禁词：只准出现在带否定的句子里。 */
const BANNED = ['怼', '敷衍', '懒得', '关我', '随便你']
const NEGATION = /不要|不能|别|不许|不准|不得|禁止/

/** 改造前的配比基线（T10b 动手之前实测，见报告）。 */
const BASELINE: Record<(typeof AUDIENCES)[number], { neg: number; negLines: number; pos: number }> = {
  owner: { neg: 4, negLines: 4, pos: 2 },
  group: { neg: 4, negLines: 4, pos: 4 },
  other: { neg: 0, negLines: 0, pos: 2 },
}

function sentences(text: string): string[] {
  return text.split(/[。！？\n]/).map(s => s.trim()).filter(s => s !== '')
}

/** 一句话同时带禁令词时只算禁令句，不算正面句——否则“不能被叫成主人”会被两边各算一次。 */
function ratio(text: string): { neg: number; negLines: number; pos: number; lines: number; sentences: number } {
  const all = sentences(text)
  const neg = all.filter(s => NEG.test(s))
  return {
    neg: neg.length,
    negLines: text.split('\n').filter(l => NEG.test(l)).length,
    pos: all.filter(s => POS.test(s) && !NEG.test(s)).length,
    lines: text.split('\n').filter(l => l.trim() !== '').length,
    sentences: all.length,
  }
}

/** 取包含某个关键词的那一行。 */
function lineWith(text: string, keyword: string): string {
  const hit = text.split('\n').find(l => l.includes(keyword))
  expect(hit, '应当有一行提到「' + keyword + '」').toBeDefined()
  return hit as string
}

describe('guide 的「跟不同的人怎么说话」：正面文案', () => {
  it('三份 audience 都有这一节，人群按 audience 取舍', () => {
    const owner = buildCompanionGuide(config, 'owner')
    const group = buildCompanionGuide(config, 'group')
    const other = buildCompanionGuide(config, 'other')
    for (const g of [owner, group, other]) expect(g).toContain('### 跟不同的人怎么说话')
    // 主人只在私聊和群里出现；好友与陌生人在群里和其它私聊里出现
    expect(owner).toContain('可以撒娇')
    expect(other).not.toContain('可以撒娇')
    expect(group).toContain('好友（QQ 20002、20003）')
    expect(other).toContain('好友（QQ 20002、20003）')
    expect(owner).not.toContain('好友（QQ')
    // 群友和陌生人只在群里合称，其它私聊里只有陌生人
    expect(group).toContain('群友和陌生人')
    expect(other).toContain('陌生人：客气但不冷淡')
    expect(other).not.toContain('群友和陌生人')
  })

  it('正面说法的要点逐条到位：撒娇与“怎么才能做成”、好友不越位、帮到哪一步、不骂人不装死、服从度不是态度', () => {
    const group = buildCompanionGuide(config, 'group')
    // 主人：可以放松、撒娇、顶两句再软下来；先想怎么才能做成
    const ownerLine = lineWith(group, '可以撒娇')
    expect(ownerLine).toContain('顶两句')
    expect(ownerLine).toContain('软下来')
    expect(ownerLine).toContain('怎么才能做成')
    // 好友：可以打趣，但不等同于主人
    const friendLine = lineWith(group, '好友（QQ 20002')
    expect(friendLine).toContain('可以打趣')
    expect(friendLine).toContain('不等同于主人')
    // 群友 / 陌生人：客气但不冷淡，做不到要说清哪一步
    const memberLine = lineWith(group, '群友和陌生人')
    expect(memberLine).toContain('客气但不冷淡')
    expect(memberLine).toContain('能帮的就帮')
    expect(memberLine).toContain('哪儿做不到')
    expect(memberLine).toContain('能帮到哪一步')
    // 所有人：不骂人、不人身攻击、不阴阳怪气、不装死；没必要回时按平台规则
    const common = lineWith(group, '跟谁说话都一样')
    for (const w of ['不骂人', '不人身攻击', '不阴阳怪气', '不装死']) expect(common).toContain(w)
    expect(common).toContain('[不发]')
    // 服从度：说清“想不想听”和“能不能做”不是一回事，0 也能好好说话
    const obedience = lineWith(group, '服从度')
    expect(obedience).toContain('不是态度')
    expect(obedience).toContain('不等于可以越界')
    expect(obedience).toContain('服从度是 0 也照样能好好说话')
  })

  it('配比：禁令类句子不增加，正面类句子至少 +2（三份 audience 各量一遍）', () => {
    for (const audience of AUDIENCES) {
      const now = ratio(buildCompanionGuide(config, audience))
      const before = BASELINE[audience]
      expect(now.neg, audience + ' 的禁令句数：' + now.neg + ' > 基线 ' + before.neg).toBeLessThanOrEqual(before.neg)
      expect(now.negLines, audience + ' 的禁令行数：' + now.negLines + ' > 基线 ' + before.negLines).toBeLessThanOrEqual(before.negLines)
      expect(now.pos, audience + ' 的正面句数：' + now.pos + ' < 基线 ' + before.pos + ' + 2').toBeGreaterThanOrEqual(before.pos + 2)
    }
  })

  it('禁词只出现在否定句里：怼 / 敷衍 / 懒得 / 关我 / 随便你', () => {
    for (const audience of AUDIENCES) {
      const text = buildCompanionGuide(config, audience)
      for (const s of sentences(text)) {
        const hit = BANNED.filter(w => s.includes(w))
        if (hit.length === 0) continue
        expect(NEGATION.test(s), '禁词「' + hit.join('、') + '」出现在没有否定的句子里：' + s).toBe(true)
      }
    }
  })

  it('五条安全边界换成正面写法之后一条不少', () => {
    const owner = buildCompanionGuide(config, 'owner')
    const group = buildCompanionGuide(config, 'group')
    const other = buildCompanionGuide(config, 'other')
    // 1) 群里不是主人的人不能被叫成主人、不能用亲密称呼
    expect(group).toContain('不能被叫成')
    expect(group).toContain('不能用亲密称呼')
    // 2) 群记忆不记主人隐私 / 别人隐私
    const note = lineWith(group, '群记忆可以记')
    expect(note).toContain('不能记')
    expect(note).toContain('隐私')
    // 3) 群里读不到主人的私密记忆和日记
    expect(group).toContain('私密记忆')
    expect(group).toContain('读不到')
    // 4) 改标签、删表情包只有主人能用（非主人那两份连提都不提）
    expect(owner).toContain('qq_sticker_delete')
    expect(owner).toContain('只有主人自己发起的这一轮')
    expect(group).not.toContain('qq_sticker_delete')
    expect(other).not.toContain('qq_sticker_delete')
    // 5) 跨群不串话：每个群只知道自己群里的事
    const cross = lineWith(group, '每个群只知道自己群里的事')
    expect(cross).toContain('不往外说')
    expect(cross).toContain('不能提')
    // 公开记忆里不进主人的私事
    expect(owner).toContain('绝对不能写进去')
  })

  it('服从度 / 亲密度取自关系矩阵配置：改配置，这一节的说法跟着改', () => {
    const pick = (g: string, key: string): string => lineWith(g, key)
    const member0 = pick(buildCompanionGuide({ ...config, memberObedience: 0 }, 'group'), '服从度')
    const member1 = pick(buildCompanionGuide({ ...config, memberObedience: 1 }, 'group'), '服从度')
    expect(member0).toContain('陌生人 0.0')
    expect(member1).toContain('陌生人 1.0')
    expect(member0).not.toBe(member1)
    // 其它私聊那份同样跟着变
    expect(pick(buildCompanionGuide({ ...config, memberObedience: 0 }, 'other'), '服从度')).toContain('陌生人 0.0')

    const friend0 = pick(buildCompanionGuide({ ...config, friendObedience: 0 }, 'group'), '服从度')
    const friend1 = pick(buildCompanionGuide({ ...config, friendObedience: 1 }, 'group'), '服从度')
    expect(friend0).toContain('好友 0.0')
    expect(friend1).toContain('好友 1.0')

    const close = pick(buildCompanionGuide({ ...config, friendIntimacy: 0.9 }, 'group'), '亲密度')
    const far = pick(buildCompanionGuide({ ...config, friendIntimacy: 0.1 }, 'group'), '亲密度')
    expect(close).toContain('亲密度 0.9')
    expect(far).toContain('亲密度 0.1')

    // 不给关系矩阵配置时退回 relation.ts 的默认值，不写死也能生成
    const fallback = pick(buildCompanionGuide({ ...config, memberObedience: undefined, friendObedience: undefined, friendIntimacy: undefined }, 'group'), '服从度')
    expect(fallback).toContain('好友 0.5')
    expect(fallback).toContain('陌生人 0.2')
  })

  it('这一节自己压得住长度：三份都不超过 7 行，guide 总行数不超过改造前 + 15', () => {
    const BEFORE_LINES = { owner: 21, group: 25, other: 12 }
    for (const audience of AUDIENCES) {
      const g = buildCompanionGuide(config, audience)
      const section = g.slice(g.indexOf('### 跟不同的人怎么说话'), g.indexOf('\n### ', g.indexOf('### 跟不同的人怎么说话') + 1))
      expect(section.split('\n').filter(l => l.trim() !== '').length, audience + ' 的这一节太长了').toBeLessThanOrEqual(7)
      expect(ratio(g).lines).toBeLessThanOrEqual(BEFORE_LINES[audience] + 15)
    }
  })
})