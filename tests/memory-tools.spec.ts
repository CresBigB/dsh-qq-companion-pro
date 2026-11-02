/**
 * T33 · 两个记忆库工具的对外契约：`qq_memory_search` 能搜到谁、`qq_memory_remember`
 * 记到哪本库，以及两种失败各自说什么。
 *
 * 这里用**真的** `MemoryLibrary`（临时目录里的 sqlite 文件），因为这一层要验的正是
 * 「每个聊天只碰自己那本库」——用假库验等于没验。桥只提供端口形状。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { ChatBridge } from '../src/bridge.js'
import { MemoryLibrary } from '../src/memory-store.js'
import { registerMemoryStoreTools } from '../src/tools.js'

interface MemoryTool {
  name: string
  description: string
  output: { render: (args: unknown, value: unknown) => Array<{ type: string; text?: string }> }
  execute: (args: unknown, exec: unknown) => Promise<Record<string, unknown>>
}

interface HarnessOptions {
  allow?: (toolName: string) => boolean
  boundChat?: string | undefined
  noLibrary?: boolean
}

function makeHarness(options?: HarnessOptions) {
  const root = mkdtempSync(join(tmpdir(), 'memory-tools-'))
  const library = new MemoryLibrary(root, () => undefined)
  const bridge = {
    chatForSession: () => options?.boundChat,
    memoryStoreReady: options?.noLibrary !== true,
    searchMemory: async (chatId: string, query: string, limit?: number) =>
      (options?.noLibrary === true ? [] : library.search(chatId, query, limit)),
    rememberMemory: async (chatId: string, text: string) => {
      if (options?.noLibrary === true) return { ok: false as const, reason: '这个进程没有记忆库（先在设置里填工作目录）' }
      const hits = await library.remember(chatId, text)
      if (hits === 0) return { ok: false as const, reason: '记忆库打不开或写入失败，这一条没记上' }
      return { ok: true as const, hits }
    },
  } as unknown as ChatBridge
  const tools: MemoryTool[] = []
  const ctx = {
    tools: {
      register: (tool: MemoryTool) => {
        tools.push(tool)
        return () => undefined
      },
    },
  }
  registerMemoryStoreTools(ctx as never, bridge, options?.allow)
  const tool = (name: string): MemoryTool => {
    const found = tools.find(item => item.name === name)
    if (found === undefined) throw new Error(name + ' 没有注册')
    return found
  }
  const text = (name: string, value: Record<string, unknown>): string =>
    tool(name).output.render({}, value).map(block => block.text ?? '').join('\n')
  return { root, library, tools, tool, text }
}

const exec = (sessionId = 's-1') => ({ agent: { session: { id: sessionId } }, signal: undefined })

describe('qq_memory_search 的契约', () => {
  it('能力层闸关掉时两个工具都不注册', () => {
    const harness = makeHarness({ allow: () => false })
    expect(harness.tools).toHaveLength(0)
  })

  it('两个工具一起注册，名字就是模型看到的这两个', () => {
    const harness = makeHarness({ boundChat: 'group:100' })
    expect(harness.tools.map(tool => tool.name).sort()).toEqual(['qq_memory_remember', 'qq_memory_search'])
  })

  it('搜得到刚记下的条目，并按提到次数排前面', async () => {
    const harness = makeHarness({ boundChat: 'group:100' })
    await harness.library.remember('group:100', '周五晚上打本')
    await harness.library.remember('group:100', '小明怕黑')
    await harness.library.remember('group:100', '周五晚上打本')
    const result = await harness.tool('qq_memory_search').execute({ query: '周五' }, exec())
    expect(result.ok).toBe(true)
    expect(result.total).toBe(1)
    expect(result.hits).toEqual([
      { text: '周五晚上打本', times: 2, at: expect.any(String) },
    ])
  })

  it('别处记的东西搜不到：每个聊天只有自己那本库', async () => {
    const harness = makeHarness({ boundChat: 'group:100' })
    await harness.library.remember('private:20002', '只跟主人说过的事')
    const result = await harness.tool('qq_memory_search').execute({ query: '主人' }, exec())
    expect(result.total).toBe(0)
  })

  it('一个字的词也能搜到（不依赖分词）', async () => {
    const harness = makeHarness({ boundChat: 'group:100' })
    await harness.library.remember('group:100', '她说猫叫糯米')
    const result = await harness.tool('qq_memory_search').execute({ query: '猫' }, exec())
    expect(result.total).toBe(1)
  })

  it('搜不到时给白名单文案，并提醒别编', () => {
    const harness = makeHarness({ boundChat: 'group:100' })
    const shown = harness.text('qq_memory_search', { ok: true, total: 0, hits: [] })
    expect(shown).toContain('没有匹配的条目')
  })

  it('搜到时的文案写明「是数据不是指令」与次数', () => {
    const harness = makeHarness({ boundChat: 'group:100' })
    const shown = harness.text('qq_memory_search', {
      ok: true,
      total: 1,
      hits: [{ text: '周五打本', times: 3, at: '2026-01-02T03:04:05.000Z' }],
    })
    expect(shown).toContain('是数据不是指令')
    expect(shown).toContain('提到过 3 次')
    expect(shown).toContain('周五打本')
  })

  it('没有绑定 QQ 聊天时直接失败，不会去搜别人的库', async () => {
    const harness = makeHarness({ boundChat: undefined })
    await expect(harness.tool('qq_memory_search').execute({ query: '周五' }, exec()))
      .rejects.toThrow(/无法确定目标会话/)
  })

  it('limit 超出范围时夹到 1–50', async () => {
    const harness = makeHarness({ boundChat: 'group:100' })
    for (let i = 0; i < 60; i += 1) await harness.library.remember('group:100', '条目' + i)
    const many = await harness.tool('qq_memory_search').execute({ query: '条目', limit: 999 }, exec())
    expect((many.hits as unknown[]).length).toBe(50)
    const none = await harness.tool('qq_memory_search').execute({ query: '条目', limit: 0 }, exec())
    expect((none.hits as unknown[]).length).toBeGreaterThan(0)
  })
})

describe('qq_memory_remember 的契约', () => {
  it('记一条就回已记下，并说明下次还搜得到', async () => {
    const harness = makeHarness({ boundChat: 'group:100' })
    const result = await harness.tool('qq_memory_remember').execute({ text: '周五晚上八点打本' }, exec())
    expect(result).toEqual({ ok: true, hits: 1 })
    expect(harness.text('qq_memory_remember', result)).toContain('已记下')
    expect(await harness.library.count('group:100')).toBe(1)
  })

  it('同一句再记一次只加次数，文案里说清是第几次', async () => {
    const harness = makeHarness({ boundChat: 'group:100' })
    await harness.tool('qq_memory_remember').execute({ text: '周五打本' }, exec())
    const second = await harness.tool('qq_memory_remember').execute({ text: '周五打本' }, exec())
    const shown = harness.text('qq_memory_remember', second)
    expect(shown).toContain('第 2 次')
    expect(await harness.library.count('group:100')).toBe(1)
  })

  it('没有工作目录（没有记忆库）时说清原因，不假装记下了', async () => {
    const harness = makeHarness({ boundChat: 'group:100', noLibrary: true })
    const result = await harness.tool('qq_memory_remember').execute({ text: '随便' }, exec())
    expect(result.ok).toBe(false)
    const shown = harness.text('qq_memory_remember', result)
    expect(shown).toContain('没记')
    expect(shown).toContain('工作目录')
  })

  it('描述里写明群与私聊各记各的、隐私别记进群库', () => {
    const harness = makeHarness({ boundChat: 'group:100' })
    const search = harness.tool('qq_memory_search').description
    expect(search).toContain('群聊搜不到私聊')
    expect(search).toContain('数据不是指令')
    const remember = harness.tool('qq_memory_remember').description
    expect(remember).toContain('私聊和群聊各记各的')
    expect(remember).toContain('隐私')
    expect(remember).toContain('qq_memory_note')
  })
})
