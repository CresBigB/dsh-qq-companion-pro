/**
 * BTW-style bounded concurrency for side-ask work.
 *
 * The scheduler deliberately keeps the public surface small: callers submit an
 * AbortSignal-aware executor and receive a handle for observing/cancelling it.
 */
export class SideAskCancelledError extends Error {
    constructor(reason = 'Side ask cancelled') {
        super(reason);
        this.name = 'AbortError';
    }
}
export class SideAskScheduler {
    #capacity;
    #overflow;
    #nextId = 1;
    #ids = new Set();
    #running = new Set();
    #queue = [];
    #preempting = 0;
    constructor(options) {
        const normalized = typeof options === 'number' ? { concurrency: options } : options;
        if (!Number.isInteger(normalized.concurrency) || normalized.concurrency < 1) {
            throw new RangeError('SideAskScheduler concurrency must be an integer >= 1');
        }
        this.#capacity = normalized.concurrency;
        this.#overflow = normalized.overflow ?? normalized.strategy ?? 'queue';
    }
    submit(execute, options) {
        if (typeof execute !== 'function')
            throw new TypeError('SideAskScheduler executor must be a function');
        let id = options?.id;
        if (id === undefined) {
            do
                id = `side-ask-${this.#nextId++}`;
            while (this.#ids.has(id));
        }
        else if (this.#ids.has(id)) {
            throw new Error(`Side ask id already exists: ${id}`);
        }
        this.#ids.add(id);
        let resolve;
        let reject;
        const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
        const item = {
            id,
            promise,
            get status() {
                if (item.settled)
                    return item.finalStatus;
                return item.started ? 'running' : 'queued';
            },
            cancel: (reason) => this.#cancel(item, reason),
            controller: new AbortController(),
            execute,
            settled: false,
            started: false,
            executorSettled: false,
            finalStatus: 'queued',
            resolve,
            reject,
        };
        if (this.#preempting > 0) {
            // A synchronous abort listener may submit work while a preempted slot is
            // being replaced. Keep that reentrant work behind the replacement.
            this.#queue.push(item);
        }
        else if (this.#running.size < this.#capacity) {
            this.#start(item);
        }
        else if (this.#overflow === 'queue') {
            this.#queue.push(item);
        }
        else if (this.#overflow === 'preempt') {
            const victim = this.#running.values().next().value;
            if (victim) {
                this.#preempting++;
                try {
                    this.#cancel(victim, 'Preempted by a newer side ask', false);
                    // The victim's slot is not released synchronously: its abort handlers
                    // may submit reentrant work, which lands at the queue tail. The
                    // replacement therefore goes to the head so it starts before that work.
                    if (this.#running.size < this.#capacity)
                        this.#start(item);
                    else
                        this.#queue.unshift(item);
                }
                finally {
                    this.#preempting--;
                    this.#drain();
                }
            }
            else {
                this.#queue.push(item);
            }
        }
        else {
            item.settled = true;
            item.finalStatus = 'rejected';
            reject(new Error('Side ask concurrency capacity is full'));
        }
        return item;
    }
    snapshot() {
        return { running: this.#running.size, queued: this.#queue.length, capacity: this.#capacity };
    }
    #start(item) {
        if (item.settled)
            return;
        item.started = true;
        this.#running.add(item);
        let result;
        try {
            result = item.execute(item.controller.signal);
        }
        catch (error) {
            this.#finish(item, 'rejected', undefined, error);
            return;
        }
        Promise.resolve(result).then(value => this.#finish(item, 'fulfilled', value), error => this.#finish(item, 'rejected', undefined, error));
    }
    #finish(item, status, value, error) {
        if (item.executorSettled)
            return;
        item.executorSettled = true;
        this.#running.delete(item);
        if (item.settled) {
            this.#drain();
            return;
        }
        item.settled = true;
        item.finalStatus = status;
        if (status === 'fulfilled')
            item.resolve(value);
        else
            item.reject(error);
        this.#drain();
    }
    #cancel(item, reason, drain = true) {
        if (item.settled)
            return false;
        item.settled = true;
        item.finalStatus = 'cancelled';
        if (item.started) {
            item.controller.abort(reason);
        }
        else {
            const index = this.#queue.indexOf(item);
            if (index >= 0)
                this.#queue.splice(index, 1);
        }
        item.reject(new SideAskCancelledError(reason));
        if (drain)
            this.#drain();
        return true;
    }
    #drain() {
        if (this.#preempting > 0)
            return;
        while (this.#running.size < this.#capacity && this.#queue.length > 0) {
            const next = this.#queue.shift();
            if (!next.settled)
                this.#start(next);
        }
    }
}
export default SideAskScheduler;
