/**
 * Session titles: the pure template renderer, the best-effort titleSession
 * write, and the registry wiring that names a created / resumed session.
 * @module dsh-qq-companion/tests/session-title
 */
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Session } from '@deepseek-ai/dsh-session'

import { ChatRegistry } from '../src/registry.js'
import type { RegistryDeps } from '../src/registry.js'
import { MAX_TITLE_BYTES, renderSessionTitle, titleSession } from '../src/session-title.js'
import type { SessionTitleLike } from '../src/session-title.js'

/** A fixed local reference time: 2026-10-23 14:05 (month/day/time are read in
 * the local timezone, so building it from local parts keeps the test stable). */
const AT = new Date(2026, 9, 23, 14, 5)

/** A session stub: only the id and the header createdAt matter to the title code. */
function fakeSession(id: string, createdAt?: number): Session {
  return { id, header: createdAt === undefined ? { cwd: process.cwd() } : { cwd: process.cwd(), createdAt } } as unknown as Session
}

describe('renderSessionTitle', () => {
  it('renders the default template for a private chat', () => {
    expect(renderSessionTitle('{kind} {target} · {date}', { kind: 'private', target: '10001', at: AT }))
      .toBe('QQ私聊 10001 · 10-23')
  })

  it('renders the default template for a group chat', () => {
    expect(renderSessionTitle('{kind} {target} · {date}', { kind: 'group', target: '20001', at: AT }))
      .toBe('QQ群 20001 · 10-23')
  })

  it('substitutes every placeholder, zero-padded date/time', () => {
    const early = new Date(2026, 0, 3, 9, 5)
    expect(renderSessionTitle('{kind}|{target}|{nickname}|{date}|{time}', {
      kind: 'private', target: '10001', nickname: '小明', at: early,
    })).toBe('QQ私聊|10001|小明|01-03|09:05')
  })

  it('sanitizes the nickname (control chars, markup, 32 code points)', () => {
    // sanitizeNickname strips controls/markup and collapses whitespace runs.
    expect(renderSessionTitle('{nickname}', { kind: 'private', target: '1', nickname: ' <b>\n小明  ', at: AT }))
      .toBe('b小明')
    expect(renderSessionTitle('{nickname}', { kind: 'private', target: '1', nickname: '小   明', at: AT }))
      .toBe('小 明')
    // sanitizeNickname caps the nickname at 32 code points (an ASCII run keeps
    // the total under the 80-byte title budget, so only the cap is visible).
    expect(renderSessionTitle('{nickname}', { kind: 'private', target: '1', nickname: 'a'.repeat(40), at: AT }))
      .toBe('a'.repeat(32))
  })

  it('leaves {nickname} empty in groups', () => {
    expect(renderSessionTitle('{kind} {nickname}', { kind: 'group', target: '20001', nickname: '小明', at: AT }))
      .toBe('QQ群')
  })

  it('keeps unknown placeholders verbatim', () => {
    expect(renderSessionTitle('{kind} {nope} {target}', { kind: 'private', target: '42', at: AT }))
      .toBe('QQ私聊 {nope} 42')
    // An empty braces pair is neither a placeholder nor a bracket remnant.
    expect(renderSessionTitle('{kind} {x} {y}', { kind: 'group', target: '7', at: AT })).toBe('QQ群 {x} {y}')
  })

  it('drops separators and empty brackets an empty placeholder left behind', () => {
    expect(renderSessionTitle('{kind} · {nickname}', { kind: 'private', target: '42', nickname: '', at: AT }))
      .toBe('QQ私聊')
    expect(renderSessionTitle('{kind}（{nickname}）', { kind: 'private', target: '42', at: AT })).toBe('QQ私聊')
    expect(renderSessionTitle('{nickname} - {kind}', { kind: 'group', target: '42', at: AT })).toBe('QQ群')
    // A placeholder with nothing before or after it renders the bare value.
    expect(renderSessionTitle('{nickname}', { kind: 'private', target: '42', nickname: '', at: AT })).toBe('')
  })

  it('collapses whitespace runs and trims the ends', () => {
    expect(renderSessionTitle('  {kind}    {target}  ', { kind: 'private', target: '42', at: AT }))
      .toBe('QQ私聊 42')
  })

  it('truncates to the host byte budget without splitting a multi-byte character', () => {
    // 20 CJK chars (60 bytes) + 5 emoji (20 bytes) = exactly the budget.
    const exact = '中'.repeat(20) + '😀'.repeat(5)
    expect(renderSessionTitle(exact, { kind: 'group', target: '1', at: AT })).toBe(exact)
    // One char over budget: the last character is dropped whole, never halved.
    const over = '中'.repeat(20) + '😀'.repeat(6)
    const truncated = renderSessionTitle(over, { kind: 'group', target: '1', at: AT })
    expect(truncated).toBe('中'.repeat(20) + '😀'.repeat(5))
    expect(Buffer.byteLength(truncated, 'utf8')).toBeLessThanOrEqual(MAX_TITLE_BYTES)
    // Long CJK text: 30 chars = 90 bytes → 26 chars = 78 bytes.
    expect(renderSessionTitle('群'.repeat(30), { kind: 'group', target: '1', at: AT })).toBe('群'.repeat(26))
  })

  it('returns an empty title for a blank template', () => {
    expect(renderSessionTitle('', { kind: 'private', target: '42', at: AT })).toBe('')
    expect(renderSessionTitle('   ', { kind: 'private', target: '42', at: AT })).toBe('')
  })
})

/** A recording sessionTitle stub. */
function makeService(options: {
  title?: string
  noGet?: boolean
  renameThrows?: boolean
  getThrows?: boolean
} = {}): { service: SessionTitleLike; renames: Array<{ sessionId: string; title: string }> } {
  const renames: Array<{ sessionId: string; title: string }> = []
  const service: SessionTitleLike = {
    ...(options.noGet === true
      ? {}
      : {
        get: (session: Session) => {
          if (options.getThrows === true) throw new Error('fold failed')
          return options.title === undefined ? undefined : { title: options.title }
        },
      }),
    rename: (session: Session, title: string) => {
      if (options.renameThrows === true) throw new Error('session "' + String(session.id) + '" is not live in this store')
      renames.push({ sessionId: String(session.id), title })
      return { title }
    },
  }
  return { service, renames }
}

describe('titleSession', () => {
  it('names a created session and returns the title', () => {
    const { service, renames } = makeService()
    const applied = titleSession({
      service,
      session: fakeSession('onebot-private-10001', AT.getTime()),
      chatId: 'private:10001',
      mode: 'create',
      template: '{kind} {target} · {date}',
      nickname: '小明',
    })
    expect(applied).toBe('QQ私聊 10001 · 10-23')
    expect(renames).toEqual([{ sessionId: 'onebot-private-10001', title: 'QQ私聊 10001 · 10-23' }])
  })

  it('leaves an existing title alone on resume', () => {
    const { service, renames } = makeService({ title: '我自己改的' })
    const applied = titleSession({
      service,
      session: fakeSession('onebot-private-10001'),
      chatId: 'private:10001',
      mode: 'resume',
      template: '{kind} {target}',
    })
    expect(applied).toBeUndefined()
    expect(renames).toEqual([])
  })

  it('backfills an untitled resumed session', () => {
    const { service, renames } = makeService()
    titleSession({
      service,
      session: fakeSession('onebot-group-20001'),
      chatId: 'group:20001',
      mode: 'resume',
      template: '{kind} {target}',
    })
    expect(renames).toEqual([{ sessionId: 'onebot-group-20001', title: 'QQ群 20001' }])
  })

  it('backfills on resume when the service has no get()', () => {
    const { service, renames } = makeService({ noGet: true })
    titleSession({
      service,
      session: fakeSession('onebot-group-20001'),
      chatId: 'group:20001',
      mode: 'resume',
      template: '{kind} {target}',
    })
    expect(renames).toHaveLength(1)
  })

  it('never renames with a blank template', () => {
    const { service, renames } = makeService()
    for (const template of ['', '   ', undefined]) {
      titleSession({ service, session: fakeSession('onebot-private-1'), chatId: 'private:1', mode: 'create', template })
    }
    expect(renames).toEqual([])
  })

  it('does nothing (and does not throw) without the host service', () => {
    expect(titleSession({
      service: undefined,
      session: fakeSession('onebot-private-1'),
      chatId: 'private:1',
      mode: 'create',
      template: '{kind} {target}',
    })).toBeUndefined()
  })

  it('only logs when rename throws (session not live)', () => {
    const { service } = makeService({ renameThrows: true })
    const log = vi.fn()
    expect(titleSession({
      service,
      session: fakeSession('onebot-private-10001'),
      chatId: 'private:10001',
      mode: 'create',
      template: '{kind} {target}',
      log,
    })).toBeUndefined()
    expect(log).toHaveBeenCalledTimes(1)
    const [level, message] = log.mock.calls[0] as [string, string]
    expect(level).toBe('warn')
    expect(message).toContain('private:10001')
    expect(message).toContain('not live in this store')
  })

  it('only logs when get() throws on resume', () => {
    const { service, renames } = makeService({ getThrows: true })
    const log = vi.fn()
    expect(titleSession({
      service,
      session: fakeSession('onebot-private-1'),
      chatId: 'private:1',
      mode: 'resume',
      template: '{kind} {target}',
      log,
    })).toBeUndefined()
    expect(renames).toEqual([])
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0][0])).toBe('warn')
    expect(String(log.mock.calls[0][1])).toContain('private:1')
  })
})

/** A recording agent registry for the registry-level cases. */
function makeAgents(createdAt: number = AT.getTime()) {
  const agentFor = (sessionId: string) => ({
    session: { id: sessionId, header: { cwd: process.cwd(), createdAt } },
    status: 'idle' as const,
    whenIdle: async () => undefined,
  })
  return {
    create: vi.fn(async (options: { sessionId: string }) => ({
      agent: agentFor(String(options.sessionId)),
      dispose: vi.fn(async () => undefined),
    })),
    resume: vi.fn(async (options: { resumeSessionId: string }) => ({
      agent: agentFor(String(options.resumeSessionId)),
      dispose: vi.fn(async () => undefined),
    })),
  }
}

/** Minimal RegistryDeps for the create/resume title wiring. */
function makeDeps(overrides: {
  agents?: unknown
  sessionTitle?: () => SessionTitleLike | undefined
  mediaDir?: string
  config?: Partial<RegistryDeps['config']>
  log?: (level: 'info' | 'warn' | 'error' | 'debug', message: string) => void
} = {}): RegistryDeps {
  return {
    agents: (overrides.agents ?? makeAgents()) as never,
    sessions: { flush: vi.fn(async () => undefined) } as never,
    sessionPersistence: undefined,
    workspaceRegistry: undefined,
    agentPresets: undefined,
    ...(overrides.sessionTitle !== undefined ? { sessionTitle: overrides.sessionTitle } : {}),
    defaultModel: undefined,
    config: {
      mediaDir: overrides.mediaDir ?? mkdtempSync(join(tmpdir(), 'onebot-title-')),
      workspacePath: '',
      agentPreset: '',
      restrictedMemberPrefix: false,
      maxImageBytes: 8 * 1024 * 1024,
      maxVoiceBytes: 15 * 1024 * 1024,
      maxFileBytes: 20 * 1024 * 1024,
      sessionTitleTemplate: '{kind} {target} · {date}',
      ...overrides.config,
    },
    log: (level, message) => overrides.log?.(level, message),
    isStopping: () => false,
    onChatRemoved: () => undefined,
    installChannelScope: () => undefined,
  }
}

/** A media dir already holding a chat→session mapping (the resume source). */
async function mappingDir(chatId: string, sessionId: string): Promise<string> {
  const mediaDir = mkdtempSync(join(tmpdir(), 'onebot-title-'))
  await writeFile(join(mediaDir, 'chat-sessions.json'), JSON.stringify({ [chatId]: sessionId }, null, 2), 'utf8')
  return mediaDir
}

describe('ChatRegistry session titles', () => {
  it('names a newly created private session from the template', async () => {
    const { service, renames } = makeService()
    const registry = new ChatRegistry(makeDeps({ sessionTitle: () => service }))
    const chat = await registry.ensureChat('private:10001', '小明')
    expect(String(chat.sessionId)).toBe('onebot-private-10001')
    expect(renames).toEqual([{ sessionId: 'onebot-private-10001', title: 'QQ私聊 10001 · 10-23' }])
    await registry.stop()
  })

  it('names a newly created group session with the group label', async () => {
    const { service, renames } = makeService()
    const registry = new ChatRegistry(makeDeps({ sessionTitle: () => service }))
    await registry.ensureChat('group:888', '')
    expect(renames).toEqual([{ sessionId: 'onebot-group-888', title: 'QQ群 888 · 10-23' }])
    await registry.stop()
  })

  it('backfills an untitled session on resume', async () => {
    const mediaDir = await mappingDir('private:10001', 'onebot-private-10001')
    const { service, renames } = makeService()
    const registry = new ChatRegistry(makeDeps({ sessionTitle: () => service, mediaDir }))
    await registry.loadMapping()
    expect(registry.chats.size).toBe(1)
    expect(renames).toEqual([{ sessionId: 'onebot-private-10001', title: 'QQ私聊 10001 · 10-23' }])
    await registry.stop()
  })

  it('keeps a session title the user already changed on resume', async () => {
    const mediaDir = await mappingDir('private:10001', 'onebot-private-10001')
    const { service, renames } = makeService({ title: '我自己改的会话名' })
    const registry = new ChatRegistry(makeDeps({ sessionTitle: () => service, mediaDir }))
    await registry.loadMapping()
    expect(registry.chats.size).toBe(1)
    expect(renames).toEqual([])
    await registry.stop()
  })

  it('never titles anything when the template is blank', async () => {
    const mediaDir = await mappingDir('private:10001', 'onebot-private-10001')
    const { service, renames } = makeService()
    const registry = new ChatRegistry(makeDeps({
      sessionTitle: () => service,
      mediaDir,
      config: { sessionTitleTemplate: '' },
    }))
    await registry.loadMapping()
    await registry.ensureChat('private:10002', '小红')
    expect(renames).toEqual([])
    await registry.stop()
  })

  it('creates the session normally with no sessionTitle service', async () => {
    const registry = new ChatRegistry(makeDeps())
    const chat = await registry.ensureChat('private:10001', '小明')
    expect(String(chat.sessionId)).toBe('onebot-private-10001')
    expect(registry.chats.size).toBe(1)
    await registry.stop()
  })

  it('a throwing rename only logs and never blocks the session', async () => {
    const { service } = makeService({ renameThrows: true })
    const log = vi.fn()
    const registry = new ChatRegistry(makeDeps({ sessionTitle: () => service, log }))
    const chat = await registry.ensureChat('private:10001', '小明')
    expect(String(chat.sessionId)).toBe('onebot-private-10001')
    expect(registry.chats.size).toBe(1)
    expect(log).toHaveBeenCalled()
    const warnings = log.mock.calls.filter(call => call[0] === 'warn').map(call => String(call[1]))
    expect(warnings.some(line => line.includes('private:10001'))).toBe(true)
    await registry.stop()
  })

  it('an unavailable service getter is tolerated on resume too', async () => {
    const mediaDir = await mappingDir('private:10001', 'onebot-private-10001')
    const registry = new ChatRegistry(makeDeps({ sessionTitle: () => undefined, mediaDir }))
    await registry.loadMapping()
    expect(registry.chats.size).toBe(1)
    await registry.stop()
  })
})