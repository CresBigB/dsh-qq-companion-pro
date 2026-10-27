/**
 * BTW-style bounded concurrency for side-ask work.
 *
 * The scheduler deliberately keeps the public surface small: callers submit an
 * AbortSignal-aware executor and receive a handle for observing/cancelling it.
 */
export type SideAskStatus = 'queued' | 'running' | 'fulfilled' | 'rejected' | 'cancelled';
export type SideAskOverflow = 'queue' | 'reject' | 'preempt';
export type SideAskExecutor<T> = (signal: AbortSignal) => T | PromiseLike<T>;
export interface SideAskSchedulerOptions {
    concurrency: number;
    overflow?: SideAskOverflow;
    /** Alias for overflow, useful when configuring the module from a policy. */
    strategy?: SideAskOverflow;
}
export interface SideAskSubmitOptions {
    /** Optional caller-supplied id. It must be unique for this scheduler. */
    id?: string;
}
export interface SideAskSnapshot {
    running: number;
    queued: number;
    capacity: number;
}
export declare class SideAskCancelledError extends Error {
    constructor(reason?: string);
}
export interface SideAskHandle<T> {
    readonly id: string;
    readonly promise: Promise<T>;
    readonly status: SideAskStatus;
    cancel(reason?: string): boolean;
}
export declare class SideAskScheduler {
    #private;
    constructor(options: SideAskSchedulerOptions | number);
    submit<T>(execute: SideAskExecutor<T>, options?: SideAskSubmitOptions): SideAskHandle<T>;
    snapshot(): SideAskSnapshot;
}
export default SideAskScheduler;
