import { describe, expect, it } from 'vitest'

import { selfCheck } from '../src/selfcheck.js'
import type { SelfCheckInput } from '../src/selfcheck.js'

const good: SelfCheckInput = {
  host: '127.0.0.1', accessToken: 'x', botQQ: '123450002', adminUsers: ['123450001'],
  dmPolicy: 'open', groupPolicy: 'allowlist', allowFrom: [], groupAllowFrom: ['888000001'], allowAllUsers: false,
  memberPermission: 'read-only',
  workspacePath: '', adminWorkspacePath: '', groupMemoryDir: '', publicMemoryFile: '',
  scheduledPrompts: [{ id: 'diary', time: '01:30', chatId: 'private:123450001', prompt: '写日记' }],
  privateProactiveEnabled: true, privateProactiveTargets: ['123450001'],
  privateProactiveWindowStart: '09:00', privateProactiveWindowEnd: '22:00',
  privateProactiveMinPerDay: 4, privateProactiveMaxPerDay: 6,
  groupProactiveEnabled: true, groupProactiveTargets: ['888000001'],
  groupProactiveWindowStart: '09:00', groupProactiveWindowEnd: '22:00',
  groupProactiveMinPerDay: 1, groupProactiveMaxPerDay: 2,
  splitLines: true, splitMaxMessages: 6,
}

describe('selfCheck', () => {
  it('ownerDeny同样校验未知能力，trim合法id不告警，重复未知id只报一次', () => {
    expect(selfCheck({ ...good, ownerDeny: [' qq.send.image '] })).toEqual([])
    const problems = selfCheck({ ...good, ownerDeny: [' future.id ', 'future.id'] })
    expect(problems.filter(problem => problem.includes('ownerDeny'))).toEqual([
      'ownerDeny 里的「future.id」不是已知能力 id，不会对任何人关闭功能（可用 id 见 /doctor）',
    ])
  })

  it('passes a sane config', () => {
    expect(selfCheck(good)).toEqual([])
  })

  it('自动旁问开着但宿主没给适配器时要报出来，接上了就不报', () => {
    const off = selfCheck({ ...good, sideAskEnabled: true, sideAskAvailable: true })
    expect(off.filter(problem => problem.includes('自动旁问'))).toEqual([])
    const silent = selfCheck({ ...good, sideAskEnabled: true, sideAskAvailable: false })
    expect(silent.filter(problem => problem.includes('自动旁问'))).toHaveLength(1)
    // 关闭时不提这事。
    expect(selfCheck({ ...good, sideAskEnabled: false }).filter(problem => problem.includes('自动旁问'))).toEqual([])
  })

  it('flags the settings that would silently do nothing', () => {
    const problems = selfCheck({
      ...good,
      accessToken: '', adminUsers: [], groupAllowFrom: [], adminWorkspacePath: '/no/such/dir',
      scheduledPrompts: [{ id: 'a', time: '1:30', chatId: 'qq:1', prompt: ' ' }, { id: 'a', time: '01:30', chatId: 'private:123450001', prompt: 'x' }],
      privateProactiveWindowStart: '22:00', privateProactiveWindowEnd: '09:00', privateProactiveMinPerDay: 7, splitMaxMessages: 1,
    }).join('\n')
    for (const needle of ['accessToken 为空', 'adminUsers 为空', 'groupAllowFrom 为空', 'adminWorkspacePath 目录不存在', '不是 HH:MM', '格式不对', 'prompt 为空', 'id「a」重复', '私聊主动聊天时段开始不早于结束', '私聊主动聊天：每天最少次数大于最多次数', 'splitMaxMessages ≤ 1', '不是管理员的私聊'.slice(0, 0)]) {
      expect(problems).toContain(needle)
    }
  })

  it('warns when proactive chat targets a non-admin', () => {
    expect(selfCheck({ ...good, privateProactiveTargets: ['999999'] }).join()).toContain('不是管理员：她会主动去找一个非管理员')
  })

  it('warns when both the group lane and the peek group are on', () => {
    const both = selfCheck({ ...good, groupPeekEnabled: true }).join('\n')
    expect(both).toContain('群聊主动聊天和「热闹时看一眼」同时开着')
    const onlyGroup = selfCheck({ ...good, groupProactiveEnabled: false, groupPeekEnabled: true }).join('\n')
    expect(onlyGroup).not.toContain('同时开着')
  })

  it('output protocol: a greylist without the switch, and malformed chat ids', () => {
    // 协议没开却填了灰度名单：名单不会生效。
    expect(selfCheck({ ...good, protocolChats: ['group:888000001'] }).join('\n')).toContain('protocolChats 填了 1 个聊天，但输出协议没开启')
    // 开着协议但名单里格式不对：那个聊天不会启用。
    expect(selfCheck({ ...good, protocolMode: 'on', protocolChats: ['888000001', 'group:888000001'] }).join('\n'))
      .toContain('protocolChats 里的「888000001」格式不对')
    // 正常组合不告警。
    expect(selfCheck({ ...good, protocolMode: 'on', protocolChats: ['group:888000001'] })).toEqual([])
    expect(selfCheck({ ...good, protocolMode: 'on', protocolChats: [] })).toEqual([])
  })
})

describe('selfCheck member permission', () => {
  const memberWarning = '群聊 / 非管理员私聊会继承宿主默认权限预设'

  it('warns when a non-admin can reach her and memberPermission is empty', () => {
    // 群聊可达（groupPolicy 不是 disabled）
    const groupOpen = selfCheck({ ...good, memberPermission: '' }).join('\n')
    expect(groupOpen).toContain(memberWarning)
    expect(groupOpen).toContain('建议设 memberPermission: read-only')

    // allowAllUsers：任何人都能私聊
    const allUsers = selfCheck({ ...good, memberPermission: '', allowAllUsers: true, groupPolicy: 'disabled', dmPolicy: 'open' }).join('\n')
    expect(allUsers).toContain(memberWarning)

    // dmPolicy=allowlist 且 allowFrom 里有非管理员
    const allowlisted = selfCheck({ ...good, memberPermission: '', dmPolicy: 'allowlist', allowFrom: ['123450001', '123450009'], groupPolicy: 'disabled' }).join('\n')
    expect(allowlisted).toContain(memberWarning)
  })

  it('does not warn when memberPermission is set, or when no non-admin can reach her', () => {
    expect(selfCheck(good).join('\n')).not.toContain(memberWarning)
    // 非管理员进不来：allowlist 里只有管理员，群也关掉了
    const closed = { ...good, memberPermission: '', dmPolicy: 'allowlist' as const, allowFrom: ['123450001'], groupPolicy: 'disabled' as const }
    expect(selfCheck(closed).join('\n')).not.toContain(memberWarning)
  })

  it('the allowAllUsers warning mentions the inherited permission only when memberPermission is empty', () => {
    const empty = selfCheck({ ...good, memberPermission: '', allowAllUsers: true }).join('\n')
    expect(empty).toContain('allowAllUsers 已开启：任何人都能私聊她（只适合调试），并且拿到上述权限')
    const narrowed = selfCheck({ ...good, memberPermission: 'read-only', allowAllUsers: true }).join('\n')
    expect(narrowed).toContain('allowAllUsers 已开启：任何人都能私聊她（只适合调试）')
    expect(narrowed).not.toContain('并且拿到上述权限')
  })
})
