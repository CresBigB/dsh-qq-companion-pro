import { describe, expect, it } from 'vitest'
import { ALL_CAPABILITY_IDS, CAPABILITIES, chatViewOf, resolveCapabilities, type CapabilityId } from '../src/capabilities.js'
import { getMatrixState, MATRIX_KEYS, setMatrixState, type MatrixScope } from '../src/capability-matrix.js'
import { RELATIONS } from '../src/relation.js'

const allDeps = ['memoryNote', 'memoryStore', 'stickerLib', 'tts'] as const
const scopes: MatrixScope[] = ['owner', 'private', 'group']
const relations = { owner: ['owner'], private: ['friend', 'stranger'], group: ['groupMember'] } as const

describe('配置许可矩阵', () => {
  it('九键顺序固定，管理员默认全部授权，非管理员原默认不变', () => {
    expect(MATRIX_KEYS).toEqual(['capabilitiesDeny', 'ownerDeny', 'friendDeny', 'memberDeny', 'strangerDeny', 'ownerGrant', 'friendGrant', 'memberGrant', 'strangerGrant'])
    for (const capability of CAPABILITIES) {
      expect(getMatrixState({}, capability.id, 'owner')).toBe('on')
      expect(getMatrixState({}, capability.id, 'private')).toBe(capability.memberDefault ? 'on' : 'off')
      expect(getMatrixState({}, capability.id, 'group')).toBe(capability.groupDefault ? 'on' : 'off')
    }
  })

  it('私聊聚合好友和陌生人，不同显示 mixed，关闭后统一 off', () => {
    const config = { friendGrant: ['qq.interact.poke'], strangerDeny: ['qq.send.image'] }
    expect(getMatrixState(config, 'qq.interact.poke', 'private')).toBe('mixed')
    expect(getMatrixState(config, 'qq.send.image', 'private')).toBe('mixed')
    const patch = setMatrixState(config, 'qq.interact.poke', 'private', false)
    expect(patch).toEqual({ friendDeny: ['qq.interact.poke'], strangerDeny: ['qq.send.image', 'qq.interact.poke'], friendGrant: [] })
    expect(getMatrixState({ ...config, ...patch }, 'qq.interact.poke', 'private')).toBe('off')
  })

  it('配置许可不混淆运行时依赖，TTS 许可开但无引擎真实关闭', () => {
    expect(getMatrixState({}, 'qq.voice.tts', 'owner')).toBe('on')
    expect(resolveCapabilities({ config: {}, deps: [], chat: chatViewOf('owner') }).enabled.has('qq.voice.tts')).toBe(false)
  })

  it('trim匹配目标、删除重复目标但保留其他未知原值及顺序，不修改输入', () => {
    const config = Object.freeze({
      ownerDeny: Object.freeze([' future.id ', ' qq.send.image ', 'qq.send.image', '', 'qq.send.voice']),
      ownerGrant: Object.freeze([' unknown.grant ', ' qq.send.image ', 'qq.send.image', '']),
      friendDeny: Object.freeze([' keep.unknown ']),
    })
    const before = JSON.stringify(config)
    expect(setMatrixState(config, 'qq.send.image', 'owner', true)).toEqual({ ownerDeny: [' future.id ', '', 'qq.send.voice'] })
    expect(setMatrixState(config, 'qq.send.image', 'owner', false)).toEqual({ ownerGrant: [' unknown.grant ', ''] })
    expect(JSON.stringify(config)).toBe(before)
  })

  it('幂等最小patch：默认开不制造grant，已关闭不重复deny', () => {
    expect(setMatrixState({}, 'qq.send.image', 'owner', true)).toEqual({})
    expect(setMatrixState({ ownerDeny: [' qq.send.image '] }, 'qq.send.image', 'owner', false)).toEqual({})
    expect(setMatrixState({}, 'qq.interact.poke', 'private', true)).toEqual({ friendGrant: ['qq.interact.poke'], strangerGrant: ['qq.interact.poke'] })
  })

  for (const scope of scopes) {
    it(`${scope}普通更新只影响目标scope，全部能力开启/关闭可往返`, () => {
      for (const id of ALL_CAPABILITY_IDS) {
        const closed = setMatrixState({}, id, scope, false)
        expect(getMatrixState(closed, id, scope)).toBe('off')
        for (const other of scopes.filter(value => value !== scope)) {
          expect(getMatrixState(closed, id, other)).toBe(getMatrixState({}, id, other))
        }
        const open = { ...closed, ...setMatrixState(closed, id, scope, true) }
        expect(getMatrixState(open, id, scope)).toBe('on')
        expect(setMatrixState(open, id, scope, true)).toEqual({})
      }
    })

    it(`${scope}解除globaldeny不复活未选关系，旧grant也无法绕过`, () => {
      for (const id of ALL_CAPABILITY_IDS) {
        const config = {
          capabilitiesDeny: [' future.global ', ` ${id} `, id],
          ownerGrant: [id], friendGrant: [id], memberGrant: [id], strangerGrant: [id],
        }
        const snapshot = JSON.stringify(config)
        const patch = setMatrixState(config, id, scope, true)
        expect(patch.capabilitiesDeny).toEqual([' future.global '])
        const next = { ...config, ...patch }
        for (const relation of RELATIONS) {
          const selected = (relations[scope] as readonly string[]).includes(relation)
          expect(resolveCapabilities({ config: next, deps: allDeps, chat: chatViewOf(relation) }).enabled.has(id), `${scope}/${relation}/${id}`).toBe(selected)
        }
        expect(JSON.stringify(config)).toBe(snapshot)
      }
    })
  }

  it('未知能力与未知scope fail-closed no-op', () => {
    const unknown = 'future.id' as CapabilityId
    expect(getMatrixState({}, unknown, 'owner')).toBe('off')
    expect(setMatrixState({ capabilitiesDeny: ['future.id'] }, unknown, 'owner', true)).toEqual({})
    expect(getMatrixState({}, 'qq.send.image', 'other' as MatrixScope)).toBe('off')
    expect(setMatrixState({}, 'qq.send.image', 'other' as MatrixScope, true)).toEqual({})
  })
})
