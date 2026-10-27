import { describe, expect, it, vi } from 'vitest'
import {
  SideAskCancelledError,
  SideAskScheduler,
} from '../src/side-ask.js'

const flush = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('SideAskScheduler', () => {
  it('requires a positive integer capacity', () => {
    expect(() => new SideAskScheduler({ concurrency: 0 })).toThrow(RangeError)
    expect(() => new SideAskScheduler({ concurrency: 1.5 })).toThrow(RangeError)
    expect(() => new SideAskScheduler({ concurrency: -1 })).toThrow(RangeError)
  })

  it('runs at most capacity and starts queued work FIFO after settlement', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const calls: string[] = []
    const scheduler = new SideAskScheduler({ concurrency: 1 })
    const a = scheduler.submit(async () => { calls.push('a'); return first.promise })
    const b = scheduler.submit(async () => { calls.push('b'); return second.promise })
    const c = scheduler.submit(async () => { calls.push('c'); return 'c' })

    expect(calls).toEqual(['a'])
    expect(a.status).toBe('running')
    expect(b.status).toBe('queued')
    expect(scheduler.snapshot()).toEqual({ running: 1, queued: 2, capacity: 1 })

    first.resolve('a')
    await flush()
    expect(calls).toEqual(['a', 'b'])
    expect(b.status).toBe('running')
    second.resolve('b')
    await expect(a.promise).resolves.toBe('a')
    await expect(b.promise).resolves.toBe('b')
    await expect(c.promise).resolves.toBe('c')
    expect(calls).toEqual(['a', 'b', 'c'])
    expect(scheduler.snapshot()).toEqual({ running: 0, queued: 0, capacity: 1 })
  })

  it('rejects overflow without executing it', async () => {
    const gate = deferred<void>()
    const scheduler = new SideAskScheduler({ concurrency: 1, overflow: 'reject' })
    const running = scheduler.submit(() => gate.promise)
    const rejected = scheduler.submit(vi.fn(() => 'never'))
    expect(rejected.status).toBe('rejected')
    expect(scheduler.snapshot()).toEqual({ running: 1, queued: 0, capacity: 1 })
    await expect(rejected.promise).rejects.toThrow('capacity is full')
    gate.resolve()
    await running.promise
  })

  it('preempts the oldest running work but waits for its executor to settle', async () => {
    const signals: AbortSignal[] = []
    const gate = deferred<void>()
    const scheduler = new SideAskScheduler({ concurrency: 1, overflow: 'preempt' })
    const old = scheduler.submit(signal => {
      signals.push(signal)
      return gate.promise
    })
    const fresh = scheduler.submit(() => 'fresh')

    expect(old.status).toBe('cancelled')
    expect(fresh.status).toBe('queued')
    expect(signals[0].aborted).toBe(true)
    expect(scheduler.snapshot()).toEqual({ running: 1, queued: 1, capacity: 1 })
    await expect(old.promise).rejects.toBeInstanceOf(SideAskCancelledError)
    gate.resolve()
    await expect(fresh.promise).resolves.toBe('fresh')
  })

  it('keeps preemption bounded when abort handlers submit reentrant work', async () => {
    const calls: string[] = []
    let reentrant!: ReturnType<SideAskScheduler['submit']>
    const gate = deferred<string>()
    const scheduler = new SideAskScheduler({ concurrency: 1, overflow: 'preempt' })
    const old = scheduler.submit(signal => {
      calls.push('old')
      signal.addEventListener('abort', () => {
        reentrant = scheduler.submit(() => {
          calls.push('reentrant')
          return 'reentrant'
        })
      })
      return gate.promise
    })
    // The preempted item rejects as soon as the replacement is submitted; the
    // handler is attached up front so the rejection is observed, not unhandled.
    const oldFailure = old.promise.catch((error: unknown) => error)
    const fresh = scheduler.submit(() => {
      calls.push('fresh')
      return 'fresh'
    })

    expect(old.status).toBe('cancelled')
    expect(fresh.status).toBe('queued')
    expect(reentrant.status).toBe('queued')
    expect(calls).toEqual(['old'])
    expect(scheduler.snapshot()).toEqual({ running: 1, queued: 2, capacity: 1 })

    gate.resolve('late')
    await expect(fresh.promise).resolves.toBe('fresh')
    await expect(reentrant.promise).resolves.toBe('reentrant')
    expect(await oldFailure).toBeInstanceOf(SideAskCancelledError)
    expect(calls).toEqual(['old', 'fresh', 'reentrant'])
    expect(scheduler.snapshot()).toEqual({ running: 0, queued: 0, capacity: 1 })
  })

  it('cancels queued work without invoking its executor', async () => {
    const gate = deferred<void>()
    const execute = vi.fn(() => 'not called')
    const scheduler = new SideAskScheduler(1)
    const running = scheduler.submit(() => gate.promise)
    const queued = scheduler.submit(execute)

    expect(queued.cancel('no longer needed')).toBe(true)
    expect(queued.cancel()).toBe(false)
    expect(queued.status).toBe('cancelled')
    expect(scheduler.snapshot()).toEqual({ running: 1, queued: 0, capacity: 1 })
    await expect(queued.promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(execute).not.toHaveBeenCalled()
    gate.resolve()
    await running.promise
  })

  it('cancels running work immediately but keeps its slot until late settlement', async () => {
    const gate = deferred<string>()
    let signal!: AbortSignal
    const scheduler = new SideAskScheduler(1)
    const running = scheduler.submit(received => { signal = received; return gate.promise })
    const queued = scheduler.submit(() => 'next')

    expect(running.cancel('user stopped')).toBe(true)
    expect(running.cancel('again')).toBe(false)
    expect(signal.aborted).toBe(true)
    expect(running.status).toBe('cancelled')
    await expect(running.promise).rejects.toMatchObject({ name: 'AbortError', message: 'user stopped' })
    expect(queued.status).toBe('queued')
    expect(scheduler.snapshot()).toEqual({ running: 1, queued: 1, capacity: 1 })
    gate.resolve('late')
    await expect(queued.promise).resolves.toBe('next')
    expect(scheduler.snapshot()).toEqual({ running: 0, queued: 0, capacity: 1 })
  })

  it('turns synchronous throws and promise rejections into terminal results', async () => {
    const scheduler = new SideAskScheduler(2)
    const thrown = scheduler.submit(() => { throw new Error('sync failure') })
    const rejected = scheduler.submit(() => Promise.reject(new Error('async failure')))
    await expect(thrown.promise).rejects.toThrow('sync failure')
    await expect(rejected.promise).rejects.toThrow('async failure')
    expect(thrown.status).toBe('rejected')
    expect(rejected.status).toBe('rejected')
    expect(scheduler.snapshot()).toEqual({ running: 0, queued: 0, capacity: 2 })
  })

  it('keeps ids stable and rejects duplicate ids', async () => {
    const scheduler = new SideAskScheduler(1)
    const one = scheduler.submit(() => 'ok', { id: 'stable-id' })
    expect(one.id).toBe('stable-id')
    await expect(one.promise).resolves.toBe('ok')
    expect(() => scheduler.submit(() => 'again', { id: 'stable-id' })).toThrow('already exists')
  })

  it('does not expose executor input in its snapshot', async () => {
    const scheduler = new SideAskScheduler(1)
    const handle = scheduler.submit(() => new Promise<void>(() => undefined))
    const snapshot = scheduler.snapshot()
    expect(snapshot).toEqual({ running: 1, queued: 0, capacity: 1 })
    expect(JSON.stringify(snapshot)).not.toContain(handle.id)
    expect(JSON.stringify(snapshot)).not.toContain('executor')
    handle.cancel()
    await expect(handle.promise).rejects.toBeInstanceOf(SideAskCancelledError)
  })
})
