import { describe, expect, it } from 'vitest'
import { ALL_CAPABILITY_IDS, chatViewOf, resolveCapabilities } from '../src/capabilities.js'
import { RELATIONS } from '../src/relation.js'
import { makeCmdHarness } from './helpers/bridge-harness.js'

const allDeps = ['memoryNote', 'stickerLib', 'tts'] as const

describe('管理员独立功能开关', () => {
  it('resolve入口默认全开，ownerDeny只关管理员且压过兼容ownerGrant', () => {
    for (const id of ALL_CAPABILITY_IDS) {
      const config = { ownerDeny: [` ${id} `], ownerGrant: [id] }
      for (const relation of RELATIONS) {
        const baseline = resolveCapabilities({ config: {}, deps: allDeps, chat: chatViewOf(relation) })
        const resolved = resolveCapabilities({ config, deps: allDeps, chat: chatViewOf(relation) })
        if (relation === 'owner') {
          expect(baseline.enabled.has(id)).toBe(true)
          expect(resolved.enabled.has(id)).toBe(false)
          expect(resolved.why(id)).toBe('主人关系 deny（ownerDeny）已关闭')
        } else expect([...resolved.enabled]).toEqual([...baseline.enabled])
      }
    }
  })

  it('global deny与缺依赖仍优先于ownerDeny，群聊里的管理员仍走member档', () => {
    const config = { capabilitiesDeny: ['qq.send.image'], ownerDeny: ['qq.send.image', 'qq.voice.tts'] }
    const owner = resolveCapabilities({ config, deps: [], chat: chatViewOf('owner') })
    expect(owner.why('qq.send.image')).toBe('已在 capabilitiesDeny 里关闭')
    expect(owner.why('qq.voice.tts')).toContain('语音合成没开')
    expect(resolveCapabilities({ config: { ownerDeny: ['qq.send.image'] }, deps: allDeps, chat: { kind: 'group', relation: 'owner' } }).enabled.has('qq.send.image')).toBe(true)
  })

  for (const relation of RELATIONS) {
    it(`真bridge透传ownerDeny：${relation}工具注册及摘要正确`, async () => {
      const h = await makeCmdHarness({ allowAllUsers: true, friendUsers: ['20002'], ownerDeny: ['qq.send.image'], ownerGrant: ['qq.send.image'] })
      try {
        if (relation === 'owner') h.sendText('hi')
        else if (relation === 'friend') h.sendTextAs('hi', 20002)
        else if (relation === 'stranger') h.sendTextAs('hi', 30003)
        else h.sendGroupTextAs('hi', 10001)
        await expect.poll(() => h.captured.channelTools.length, { timeout: 15_000 }).toBeGreaterThan(0)
        expect(h.captured.channelTools.includes('qq_send_image')).toBe(relation !== 'owner')
        const summary = h.bridge.capabilitySummary()
        expect(summary.disabled.find(item => item.id === 'qq.send.image')?.reason).toBe('主人关系 deny（ownerDeny）已关闭')
        // 夹具无TTS、记忆与表情包依赖，共4项依赖关闭；另减ownerDeny这一项。
        expect(summary.byRelation.owner).toBe(ALL_CAPABILITY_IDS.length - 5)
      } finally {
        h.client.close()
      }
    })
  }
})
