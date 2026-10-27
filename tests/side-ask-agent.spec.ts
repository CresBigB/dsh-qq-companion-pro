/**
 * 旁问适配器（`sideAskAgentOf`）的接线回归。
 *
 * 这一层是插件与宿主 subagents 服务的唯一接触面，之前正是在这里出错：
 * 旧代码要求 `subagents.start`（宿主 activation 服务根本没有这个方法），
 * 于是适配器永远是 undefined，功能静默退化成排队。本文件用与宿主
 * `startActivation` 同形的假实现锁住这些事实：
 *
 * - 只认 `startActivation` + `getProvider('spawn')`；缺任一即拒绝接线。
 * - 调用形状固定：provider 'spawn'、`delivery: 'caller'`（父会话不收旁问的
 *   完成通知）、prompt 里带一次性旁问的固定前缀、`agentOptions.maxTokens`。
 * - 结果只取最后一段文字并 trim；空输出按失败处理。
 * - 取消信号到达即 `dispose()`；正常结算后不再重复 dispose。
 * - 没有 `getProvider` / provider 缺席 / getProvider 抛错都不接线。
 * @module dsh-qq-companion-pro/tests/side-ask-agent
 */
import { describe, expect, it, vi } from 'vitest'

import { sideAskAgentOf } from '../src/index.js'

/** 宿主 activation 的假实现：记录 spec，结果由测试给。 */
function makeSubagents(options: {
  output?: readonly { type?: string; text?: string }[]
  provider?: unknown
  /** 结算前是否等待外部放行（用于测试取消）。 */
  hold?: boolean
  getProviderThrows?: boolean
}) {
  const calls: Array<Record<string, unknown>> = []
  const dispose = vi.fn(async () => undefined)
  let release: (() => void) | undefined
  const subagents = {
    getProvider: vi.fn((name: string) => {
      if (options.getProviderThrows === true) throw new Error('unknown provider: ' + name)
      return name === 'spawn' ? (options.provider ?? { inheritsParentContext: false }) : undefined
    }),
    startActivation: vi.fn(async (spec: Record<string, unknown>) => {
      calls.push(spec)
      const result = options.hold === true
        ? new Promise<never>(() => undefined)
        : Promise.resolve({ output: options.output ?? [{ type: 'text', text: ' 旁问答案 ' }] })
      release = () => undefined
      return { childId: 'child-1', result, dispose }
    }),
  }
  return { subagents, calls, dispose, get release() { return release } }
}

const ctxOf = (subagents: unknown): { get: (key: string) => unknown } => ({
  get: (key: string) => (key === 'subagents' ? subagents : undefined),
})

describe('sideAskAgentOf 接线条件', () => {
  it('没有 subagents 服务时不接线', () => {
    expect(sideAskAgentOf({ get: () => undefined })).toBeUndefined()
  })

  it('没有 ctx.get 时不接线（旧宿主上下文）', () => {
    expect(sideAskAgentOf({})).toBeUndefined()
  })

  it('只有 legacy start、没有 startActivation 时不接线（这正是此前的静默失效路径）', () => {
    const legacy = { start: vi.fn(), getProvider: () => ({ inheritsParentContext: true }) }
    expect(sideAskAgentOf(ctxOf(legacy))).toBeUndefined()
  })

  it('没有 spawn 提供方时不接线', () => {
    const { subagents } = makeSubagents({ provider: undefined })
    subagents.getProvider = vi.fn(() => undefined)
    expect(sideAskAgentOf(ctxOf(subagents))).toBeUndefined()
  })

  it('getProvider 抛错时不接线，异常不外泄', () => {
    const { subagents } = makeSubagents({ getProviderThrows: true })
    expect(sideAskAgentOf(ctxOf(subagents))).toBeUndefined()
  })

  it('有 startActivation + spawn 时接线', () => {
    const { subagents } = makeSubagents({})
    expect(sideAskAgentOf(ctxOf(subagents))).toBeDefined()
  })
})

describe('sideAskAgentOf 调用形状', () => {
  it('用 spawn + caller 投递 + 固定前缀调用，并返回 trim 后的文字', async () => {
    const { subagents, calls } = makeSubagents({ output: [{ type: 'text', text: '你好' }, { type: 'text', text: '世界' }] })
    const port = sideAskAgentOf(ctxOf(subagents))
    const parent = { id: 'parent-agent' }
    const answer = await port!.ask(parent, '现在几点了', new AbortController().signal)

    expect(answer).toBe('你好世界')
    expect(calls).toHaveLength(1)
    const spec = calls[0]!
    expect(spec.provider).toBe('spawn')
    // 父会话不该收到旁问的完成通知：这是 delivery=caller 的全部意义。
    expect(spec.delivery).toBe('caller')
    expect(spec.label).toBe('QQ 旁问')
    const request = spec.request as { parent: unknown; prompt: { type: string; text: string }[]; agentOptions?: { maxTokens?: number } }
    expect(request.parent).toBe(parent)
    expect(request.agentOptions?.maxTokens).toBe(32_000)
    expect(request.prompt).toHaveLength(1)
    expect(request.prompt[0]!.type).toBe('text')
    // 前缀固定，问题正文原样附在后面。
    expect(request.prompt[0]!.text).toContain('只输出文字')
    expect(request.prompt[0]!.text.endsWith('现在几点了')).toBe(true)
  })

  it('结果里没有文字时按失败处理，不返回空串', async () => {
    const { subagents } = makeSubagents({ output: [{ type: 'image' }] })
    const port = sideAskAgentOf(ctxOf(subagents))
    await expect(port!.ask({}, '问题', new AbortController().signal)).rejects.toThrow('no text')
  })

  it('首尾空白会被去掉，连续文字块按宿主顺序拼接', async () => {
    const { subagents } = makeSubagents({ output: [{ type: 'text', text: '  第一段' }, { type: 'text', text: '第二段  ' }] })
    const port = sideAskAgentOf(ctxOf(subagents))
    expect(await port!.ask({}, '问题', new AbortController().signal)).toBe('第一段第二段')
  })

  it('没有文字以外的块时也不拼出垃圾', async () => {
    const { subagents } = makeSubagents({ output: [{ type: 'text', text: '   ' }] })
    const port = sideAskAgentOf(ctxOf(subagents))
    await expect(port!.ask({}, '问题', new AbortController().signal)).rejects.toThrow('no text')
  })
})

describe('sideAskAgentOf 主会话背景', () => {
  const userEvent = (text: string) => ({ type: 'user/message', seq: 0, data: { role: 'user', content: [{ type: 'text', text }] } })
  const botEvent = (text: string) => ({ type: 'assistant/message', seq: 1, data: { message: { role: 'assistant', content: [{ type: 'text', text }] } } })
  const parentOf = (events: readonly unknown[]) => ({ id: 'parent-agent', session: { snapshotEvents: () => events } })
  const promptTextOf = (calls: Array<Record<string, unknown>>, index = 0): string => {
    const request = calls[index]!.request as { prompt: { text: string }[] }
    return request.prompt[0]!.text
  }

  it('把主会话最近的对话当背景带过去，问题仍在最后', async () => {
    const { subagents, calls } = makeSubagents({})
    const port = sideAskAgentOf(ctxOf(subagents))
    const parent = parentOf([userEvent('帮我把季度报告整理一下'), botEvent('好的，我先读一下原始数据。')])
    await port!.ask(parent, '现在进度到哪了', new AbortController().signal)

    const text = promptTextOf(calls)
    expect(text).toContain('用户：帮我把季度报告整理一下')
    expect(text).toContain('她：好的，我先读一下原始数据。')
    expect(text.indexOf('用户：帮我把季度报告整理一下')).toBeLessThan(text.indexOf('现在进度到哪了'))
    // 问题永远在最后：身份前缀在最前。
    expect(text.endsWith('现在进度到哪了')).toBe(true)
    expect(text.startsWith('你是一次性的旁问专家')).toBe(true)
  })

  it('预算为 0 时不带任何背景，只发这一条问题', async () => {
    const { subagents, calls } = makeSubagents({})
    const port = sideAskAgentOf(ctxOf(subagents), 0)
    await port!.ask(parentOf([userEvent('帮我整理报告'), botEvent('好的')]), '现在几点了', new AbortController().signal)

    const text = promptTextOf(calls)
    expect(text).not.toContain('帮我把季度报告')
    expect(text).not.toContain('帮我整理报告')
    expect(text).not.toContain('以下是主会话最近的对话')
    expect(text.endsWith('现在几点了')).toBe(true)
  })

  it('预算装不下更早的消息时只保留最近的那几条', async () => {
    const { subagents, calls } = makeSubagents({})
    const port = sideAskAgentOf(ctxOf(subagents), 12)
    const long = '这是一段很长很长的历史，长到预算装不下它'
    await port!.ask(parentOf([userEvent(long), botEvent('收到')]), '继续', new AbortController().signal)

    const text = promptTextOf(calls)
    expect(text).not.toContain(long)
    expect(text).toContain('她：收到')
  })

  it('只投影文字块：工具块、空文本都不进背景', async () => {
    const { subagents, calls } = makeSubagents({})
    const port = sideAskAgentOf(ctxOf(subagents))
    const parent = parentOf([
      { type: 'user/message', seq: 0, data: { role: 'user', content: [{ type: 'text', text: '读这个文件' }] } },
      { type: 'assistant/message', seq: 1, data: { message: { role: 'assistant', content: [{ type: 'tool-call', name: 'read_file' }] } } },
      { type: 'tool/result', seq: 2, data: { message: { role: 'tool', content: [{ type: 'text', text: 'SECRET-FILE-BODY' }] } } },
      { type: 'assistant/message', seq: 3, data: { message: { role: 'assistant', content: [{ type: 'text', text: '  ' }] } } },
    ])
    await port!.ask(parent, '看的怎么样了', new AbortController().signal)

    const text = promptTextOf(calls)
    expect(text).toContain('用户：读这个文件')
    expect(text).not.toContain('SECRET-FILE-BODY')
    expect(text).not.toContain('tool-call')
  })

  it('父会话读不到日志时照旧回答：没有 session、抛错都只是不带背景', async () => {
    const { subagents, calls } = makeSubagents({})
    const port = sideAskAgentOf(ctxOf(subagents))
    await port!.ask({ id: 'no-session' }, '问题一', new AbortController().signal)
    await port!.ask({ id: 'boom', session: { snapshotEvents: () => { throw new Error('session closed') } } }, '问题二', new AbortController().signal)

    expect(calls).toHaveLength(2)
    expect(promptTextOf(calls, 0)).toContain('问题一')
    expect(promptTextOf(calls, 1)).toContain('问题二')
    expect(promptTextOf(calls, 1)).not.toContain('以下是主会话最近的对话')
  })

  it('单条超长历史会被截断，不会一条吃掉整个预算', async () => {
    const { subagents, calls } = makeSubagents({})
    const port = sideAskAgentOf(ctxOf(subagents), 4000)
    await port!.ask(parentOf([userEvent('啊'.repeat(3000))]), '说重点', new AbortController().signal)

    const text = promptTextOf(calls)
    expect(text).toContain('…')
    expect(text.length).toBeLessThan(2000)
  })
})

describe('sideAskAgentOf 取消', () => {
  it('运行中取消会 dispose 该 activation', async () => {
    const { subagents, dispose } = makeSubagents({ hold: true })
    const port = sideAskAgentOf(ctxOf(subagents))
    const controller = new AbortController()
    const pending = port!.ask({}, '问题', controller.signal)
    pending.catch(() => undefined)
    // 等 startActivation 落地（microtask）。
    await vi.waitFor(() => { expect(subagents.startActivation).toHaveBeenCalled() })
    expect(dispose).not.toHaveBeenCalled()
    controller.abort()
    await vi.waitFor(() => { expect(dispose).toHaveBeenCalledTimes(1) })
  })

  it('已经取消的信号不会让调用卡住：仍会 dispose 并等结果', async () => {
    const { subagents, dispose } = makeSubagents({ hold: true })
    const port = sideAskAgentOf(ctxOf(subagents))
    const controller = new AbortController()
    controller.abort()
    const pending = port!.ask({}, '问题', controller.signal)
    pending.catch(() => undefined)
    await vi.waitFor(() => { expect(dispose).toHaveBeenCalledTimes(1) })
  })
})
