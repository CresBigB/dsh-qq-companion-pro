import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MEMORY_DIR_NAME, MemoryLibrary, memoryLibraryName, memoryStoreRootOf } from '../src/memory-store.js'
import { handleMemoryCommand } from '../src/commands/memory.js'
import type { ChatId } from '../src/chat.js'
import type { CommandContext } from '../src/commands/types.js'

const dirs: string[] = []
function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qq-memory-'))
  dirs.push(dir)
  return dir
}

const libraries: MemoryLibrary[] = []
function tempLibrary(): MemoryLibrary {
  const library = new MemoryLibrary(tempRoot())
  libraries.push(library)
  return library
}

afterEach(() => {
  for (const library of libraries.splice(0)) library.close()
})

describe('memory library paths', () => {
  it('lives under the workspace and names the file after the number', () => {
    expect(memoryStoreRootOf({ workspacePath: 'D:\\work' })).toBe(join('D:\\work', MEMORY_DIR_NAME))
    expect(memoryStoreRootOf({})).toBe('')
    expect(memoryStoreRootOf({ workspacePath: '   ' })).toBe('')
    expect(memoryLibraryName('group:643561596')).toBe('643561596')
    expect(memoryLibraryName('private:2824149798')).toBe('2824149798')
    // 非数字字符被剔掉，避免路径穿越
    expect(memoryLibraryName('group:../../etc/passwd')).toBe('etcpasswd')
    expect(memoryLibraryName('group:')).toBe('unknown')
  })

  it('one file per chat, in the same directory', () => {
    const library = tempLibrary()
    const a = library.pathOf('group:1')
    const b = library.pathOf('private:2')
    expect(a).not.toBe(b)
    expect(a.endsWith('1.db')).toBe(true)
    expect(a.slice(0, a.lastIndexOf('\\'))).toBe(b.slice(0, b.lastIndexOf('\\')))
  })
})

describe('memory library notes', () => {
  it('counts repeats of the same note as hits instead of new rows', async () => {
    const library = tempLibrary()
    await library.remember('group:1', '她喜欢猫', 1000)
    await library.remember('group:1', '她喜欢猫', 2000)
    await library.remember('group:1', '  她喜欢猫  ', 3000)
    expect(await library.count('group:1')).toBe(1)
    const hits = await library.search('group:1', '猫')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.hits).toBe(3)
    expect(hits[0]?.updatedAt.startsWith('1970-01-01T00:00:03')).toBe(true)
  })

  it('keeps each chat isolated', async () => {
    const library = tempLibrary()
    await library.remember('group:1', '群一号的秘密', 1000)
    await library.remember('private:2', '私聊里的事', 1000)
    expect(await library.count('group:1')).toBe(1)
    expect(await library.count('private:2')).toBe(1)
    expect((await library.search('group:1', '私聊')).length).toBe(0)
    expect((await library.search('private:2', '秘密')).length).toBe(0)
  })

  it('matches one and two character Chinese queries (LIKE, not trigram)', async () => {
    const library = tempLibrary()
    await library.remember('group:1', '她昨天说了雨', 1000)
    expect((await library.search('group:1', '雨')).length).toBe(1)
    expect((await library.search('group:1', '昨天')).length).toBe(1)
    expect((await library.search('group:1', '雪')).length).toBe(0)
    expect(await library.search('group:1', '')).toEqual([])
  })

  it('orders by hit count, then by recency', async () => {
    const library = tempLibrary()
    await library.remember('group:1', '常提到的', 1000)
    await library.remember('group:1', '常提到的', 2000)
    await library.remember('group:1', '只提过一次但更新', 5000)
    const hits = await library.search('group:1', '提')
    expect(hits.map(hit => hit.text)).toEqual(['常提到的', '只提过一次但更新'])
    expect(await library.recent('group:1')).toHaveLength(2)
    expect((await library.recent('group:1'))[0]?.text).toBe('只提过一次但更新')
  })

  it('ignores empty and overlong notes safely', async () => {
    const library = tempLibrary()
    await library.remember('group:1', '   ', 1000)
    expect(await library.count('group:1')).toBe(0)
    await library.remember('group:1', '字'.repeat(900), 1000)
    const hits = await library.recent('group:1')
    expect(hits).toHaveLength(1)
    expect(Array.from(hits[0]?.text ?? '').length).toBe(400)
  })
})

describe('/memory command', () => {
  function context(searchMemory?: CommandContext['searchMemory']): { ctx: CommandContext; sent: string[] } {
    const sent: string[] = []
    const ctx = {
      sendToChat: async (_chatId: ChatId, text: string) => {
        sent.push(text)
        return []
      },
      log: () => undefined,
      isAdmin: () => true,
      getChat: () => undefined,
      hasChat: () => false,
      ...(searchMemory === undefined ? {} : { searchMemory }),
    } as unknown as CommandContext
    return { ctx, sent }
  }

  it('explains when the library is not enabled', async () => {
    const { ctx, sent } = context()
    await handleMemoryCommand(ctx, 'group:1' as ChatId, '猫')
    expect(sent[0]).toContain('记忆库没有启用')
  })

  it('prints the usage when no keyword is given', async () => {
    const { ctx, sent } = context(async () => [])
    await handleMemoryCommand(ctx, 'group:1' as ChatId, '   ')
    expect(sent[0]).toContain('/memory <关键词>')
  })

  it('says so when nothing matches', async () => {
    const { ctx, sent } = context(async () => [])
    await handleMemoryCommand(ctx, 'group:1' as ChatId, '猫')
    expect(sent[0]).toContain('没有匹配「猫」')
  })

  it('lists hits with hit count and date', async () => {
    let seen: { chatId: string; query: string } | undefined
    const { ctx, sent } = context(async (chatId, query) => {
      seen = { chatId, query }
      return [{ text: '她喜欢猫', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', hits: 3 }]
    })
    await handleMemoryCommand(ctx, 'group:1' as ChatId, ' 猫 ')
    expect(seen).toEqual({ chatId: 'group:1', query: '猫' })
    expect(sent[0]).toContain('找到 1 条')
    expect(sent[0]).toContain('她喜欢猫（3 次，最近 2026-01-02）')
  })
})
