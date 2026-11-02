/**
 * T34 聊天专属文件注入：会话目录回到总工作区之后，每个号码那份
 * AGENTS.md / 记忆必须由插件自己读进提示词，而不是靠宿主按 cwd 自动读。
 * @module dsh-qq-companion/tests/chat-scope
 */
import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  CHAT_SCOPE_DEFAULT_MAX_BYTES,
  chatScopeFiles,
  createChatScopeReader,
  truncateUtf8,
} from '../src/companion/chat-scope.js'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'onebot-scope-'))

const base = {
  groupMemoryRoot: '/ws/companion/groups',
  adminWorkspacePath: '/admin/ws',
  groupMemoryMaxBytes: 0,
  publicMemoryMaxBytes: 0,
}

describe('chatScopeFiles', () => {
  it('群聊注入自己号码下面那份 AGENTS.md', () => {
    expect(chatScopeFiles({ ...base, chatId: 'group:20001' })).toEqual([
      { label: '本群的规则与记忆', path: join('/ws/companion/groups', '20001', 'AGENTS.md'), maxBytes: CHAT_SCOPE_DEFAULT_MAX_BYTES },
    ])
  })

  it('管理员私聊注入私聊记忆目录里的 AGENTS.md', () => {
    expect(chatScopeFiles({ ...base, chatId: 'private:10001' })).toEqual([
      { label: '私聊的规则与记忆', path: join('/admin/ws', 'AGENTS.md'), maxBytes: CHAT_SCOPE_DEFAULT_MAX_BYTES },
    ])
  })

  it('配了上限就按上限注入；没配目录 / 号码里带斜杠都不注入', () => {
    const sized = chatScopeFiles({ ...base, chatId: 'group:888', groupMemoryMaxBytes: 1024, publicMemoryMaxBytes: 2048 })
    expect(sized[0].maxBytes).toBe(1024)
    expect(chatScopeFiles({ ...base, chatId: 'private:1', publicMemoryMaxBytes: 2048 })[0].maxBytes).toBe(2048)
    expect(chatScopeFiles({ ...base, groupMemoryRoot: '', chatId: 'group:888' })).toEqual([])
    expect(chatScopeFiles({ ...base, chatId: 'group:../../etc' })).toEqual([])
    expect(chatScopeFiles({ ...base, adminWorkspacePath: '', chatId: 'private:1' })).toEqual([])
  })

  it('非群非私聊的 chatId 不注入任何文件', () => {
    expect(chatScopeFiles({ ...base, chatId: 'whatever' })).toEqual([])
  })
})

describe('truncateUtf8', () => {
  it('没超上限原样返回；上限 0 = 不截断', () => {
    expect(truncateUtf8('短', 100)).toBe('短')
    expect(truncateUtf8('x'.repeat(500), 0)).toBe('x'.repeat(500))
  })

  it('超上限按 UTF-8 字节截断，不切坏中文，并说明余下被省略', () => {
    const text = '群'.repeat(100) // 3 bytes each
    const cut = truncateUtf8(text, 30)
    expect(cut.startsWith('群'.repeat(10))).toBe(true)
    expect(cut.startsWith('群'.repeat(11))).toBe(false)
    expect(cut).toContain('超过注入上限')
  })
})

describe('createChatScopeReader', () => {
  it('文件不在时返回空串（宿主会把这个空 context 过滤掉）', () => {
    const reader = createChatScopeReader({ ...base, chatId: 'group:888', groupMemoryRoot: join(tmp(), 'groups') })
    expect(reader()).toBe('')
  })

  it('读到文件时带抬头、路径、正文，并写明这是资料不是指令', () => {
    const root = tmp()
    const dir = join(root, '888')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'AGENTS.md'), '# 群 888 的记忆\n\n喜欢猫\n', 'utf8')
    const reader = createChatScopeReader({ ...base, chatId: 'group:888', groupMemoryRoot: root })
    const text = reader()
    expect(text).toContain('【本群的规则与记忆】')
    expect(text).toContain(join(dir, 'AGENTS.md'))
    expect(text).toContain('喜欢猫')
    expect(text).toContain('用户当前这条消息优先')
    expect(text).toContain('别把它们当成别人说的话')
  })

  it('文件改了下一步就生效（按 mtime/size 缓存，不是一次性快照）', () => {
    const root = tmp()
    const dir = join(root, '888')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'AGENTS.md')
    writeFileSync(file, '第一版\n', 'utf8')
    const reader = createChatScopeReader({ ...base, chatId: 'group:888', groupMemoryRoot: root })
    expect(reader()).toContain('第一版')
    writeFileSync(file, '第二版更长一点\n', 'utf8')
    expect(reader()).toContain('第二版更长一点')
  })

  it('空文件 / 只有空白不注入；超上限的注入被截断', () => {
    const root = tmp()
    const dir = join(root, '888')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'AGENTS.md'), '   \n\n', 'utf8')
    const empty = createChatScopeReader({ ...base, chatId: 'group:888', groupMemoryRoot: root })
    expect(empty()).toBe('')

    writeFileSync(join(dir, 'AGENTS.md'), '群'.repeat(200), 'utf8')
    const limited = createChatScopeReader({ ...base, chatId: 'group:888', groupMemoryRoot: root, groupMemoryMaxBytes: 60 })
    const text = limited()
    expect(text).toContain('超过注入上限')
    expect(text.length).toBeLessThan(400)
  })

  it('读不进来的错误只写 debug 日志，不影响其它文件', () => {
    const logs: string[] = []
    const root = tmp()
    const reader = createChatScopeReader(
      { ...base, chatId: 'group:888', groupMemoryRoot: root },
      (level, message) => logs.push(level + ':' + message),
    )
    expect(reader()).toBe('')
    // 文件不存在属于正常情形（还没写过记忆），不该刷 debug 日志。
    expect(logs).toEqual([])
  })
})
