/**
 * BTW-style bounded concurrency for side-ask work.
 *
 * The scheduler deliberately keeps the public surface small: callers submit an
 * AbortSignal-aware executor and receive a handle for observing/cancelling it.
 */

export type SideAskStatus = 'queued' | 'running' | 'fulfilled' | 'rejected' | 'cancelled'
export type SideAskOverflow = 'queue' | 'reject' | 'preempt'

export type SideAskExecutor<T> = (signal: AbortSignal) => T | PromiseLike<T>

export interface SideAskSchedulerOptions {
  concurrency: number
  overflow?: SideAskOverflow
  /** Alias for overflow, useful when configuring the module from a policy. */
  strategy?: SideAskOverflow
}

export interface SideAskSubmitOptions {
  /** Optional caller-supplied id. It must be unique for this scheduler. */
  id?: string
}

export interface SideAskSnapshot {
  running: number
  queued: number
  capacity: number
}

export class SideAskCancelledError extends Error {
  constructor(reason = 'Side ask cancelled') {
    super(reason)
    this.name = 'AbortError'
  }
}

export interface SideAskHandle<T> {
  readonly id: string
  readonly promise: Promise<T>
  readonly status: SideAskStatus
  cancel(reason?: string): boolean
}

type MutableHandle<T> = SideAskHandle<T> & {
  readonly controller: AbortController
  readonly execute: SideAskExecutor<T>
  settled: boolean
  started: boolean
  executorSettled: boolean
  finalStatus: SideAskStatus
  resolve(value: T | PromiseLike<T>): void
  reject(reason?: unknown): void
}

export class SideAskScheduler {
  readonly #capacity: number
  readonly #overflow: SideAskOverflow
  #nextId = 1
  #ids = new Set<string>()
  #running = new Set<MutableHandle<unknown>>()
  #queue: MutableHandle<unknown>[] = []
  #preempting = 0

  constructor(options: SideAskSchedulerOptions | number) {
    const normalized = typeof options === 'number' ? { concurrency: options } : options
    if (!Number.isInteger(normalized.concurrency) || normalized.concurrency < 1) {
      throw new RangeError('SideAskScheduler concurrency must be an integer >= 1')
    }
    this.#capacity = normalized.concurrency
    this.#overflow = normalized.overflow ?? normalized.strategy ?? 'queue'
  }

  submit<T>(execute: SideAskExecutor<T>, options?: SideAskSubmitOptions): SideAskHandle<T> {
    if (typeof execute !== 'function') throw new TypeError('SideAskScheduler executor must be a function')
    let id = options?.id
    if (id === undefined) {
      do id = `side-ask-${this.#nextId++}`
      while (this.#ids.has(id))
    } else if (this.#ids.has(id)) {
      throw new Error(`Side ask id already exists: ${id}`)
    }
    this.#ids.add(id)

    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
    const item = {
      id,
      promise,
      get status(): SideAskStatus {
        if (item.settled) return item.finalStatus
        return item.started ? 'running' : 'queued'
      },
      cancel: (reason?: string): boolean => this.#cancel(item, reason),
      controller: new AbortController(),
      execute,
      settled: false,
      started: false,
       executorSettled: false,
      finalStatus: 'queued' as SideAskStatus,
      resolve,
      reject,
    } as MutableHandle<T>

    if (this.#preempting > 0) {
      // A synchronous abort listener may submit work while a preempted slot is
      // being replaced. Keep that reentrant work behind the replacement.
      this.#queue.push(item)
    } else if (this.#running.size < this.#capacity) {
      this.#start(item)
    } else if (this.#overflow === 'queue') {
      this.#queue.push(item)
    } else if (this.#overflow === 'preempt') {
      const victim = this.#running.values().next().value as MutableHandle<unknown> | undefined
      if (victim) {
        this.#preempting++
        try {
          this.#cancel(victim, 'Preempted by a newer side ask', false)
          // The victim's slot is not released synchronously: its abort handlers
          // may submit reentrant work, which lands at the queue tail. The
          // replacement therefore goes to the head so it starts before that work.
          if (this.#running.size < this.#capacity) this.#start(item)
          else this.#queue.unshift(item)
        } finally {
          this.#preempting--
          this.#drain()
        }
      } else {
        this.#queue.push(item)
      }
    } else {
      item.settled = true
      item.finalStatus = 'rejected'
      reject(new Error('Side ask concurrency capacity is full'))
    }
    return item
  }

  snapshot(): SideAskSnapshot {
    return { running: this.#running.size, queued: this.#queue.length, capacity: this.#capacity }
  }

  #start(item: MutableHandle<unknown>): void {
    if (item.settled) return
    item.started = true
    this.#running.add(item)
    let result: unknown
    try {
      result = item.execute(item.controller.signal)
    } catch (error) {
      this.#finish(item, 'rejected', undefined, error)
      return
    }
    Promise.resolve(result).then(
      value => this.#finish(item, 'fulfilled', value),
      error => this.#finish(item, 'rejected', undefined, error),
    )
  }

  #finish(item: MutableHandle<unknown>, status: 'fulfilled' | 'rejected', value?: unknown, error?: unknown): void {
    if (item.executorSettled) return
    item.executorSettled = true
    this.#running.delete(item)
    if (item.settled) {
      this.#drain()
      return
    }
    item.settled = true
    item.finalStatus = status
    if (status === 'fulfilled') item.resolve(value)
    else item.reject(error)
    this.#drain()
  }

  #cancel(item: MutableHandle<unknown>, reason?: string, drain = true): boolean {
    if (item.settled) return false
    item.settled = true
    item.finalStatus = 'cancelled'
    if (item.started) {
      item.controller.abort(reason)
    } else {
      const index = this.#queue.indexOf(item)
      if (index >= 0) this.#queue.splice(index, 1)
    }
    item.reject(new SideAskCancelledError(reason))
    if (drain) this.#drain()
    return true
  }

  #drain(): void {
    if (this.#preempting > 0) return
    while (this.#running.size < this.#capacity && this.#queue.length > 0) {
      const next = this.#queue.shift()!
      if (!next.settled) this.#start(next)
    }
  }
}

export default SideAskScheduler

