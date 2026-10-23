import { type Log } from './time.js';
export declare const STICKER_INDEX_FILE = "index.json";
export declare const DEFAULT_STICKER_MAX_COUNT = 300;
export declare const DEFAULT_STICKER_MAX_BYTES: number;
export declare const DEFAULT_STICKER_DAILY_MAX = 20;
/** Most results one search returns. */
export declare const STICKER_SEARCH_MAX = 5;
/** How many file hashes findByFile remembers (inbound stickers are looked up
 * once per message; the same file is often quoted again). */
export declare const STICKER_HASH_CACHE_MAX = 200;
export interface Sticker {
    id: string;
    file: string;
    tags: string[];
    description: string;
    sha256: string;
    /** Chat it was saved from (private:<qq> / group:<id>). */
    from: string;
    addedAt: number;
    uses: number;
    lastUsedAt?: number;
}
export type StickerSaveResult = {
    ok: true;
    sticker: Sticker;
    merged: boolean;
} | {
    ok: false;
    reason: string;
};
/** What the library can say about a file before anyone tries to save it.
 * `too-large` is the one that matters: save() would refuse it, so the caller
 * must not nudge her to try. */
export type StickerFileShelf = {
    kind: 'known';
    sticker: Sticker;
} | {
    kind: 'new';
} | {
    kind: 'too-large';
};
export interface StickerLibraryOptions {
    dir: string;
    maxCount?: number;
    maxBytes?: number;
    dailyMax?: number;
    log?: Log;
    now?: () => number;
}
/** The image type a file's first bytes say it is, or undefined. */
export declare function sniffImage(head: Buffer): 'png' | 'jpg' | 'gif' | 'webp' | undefined;
/** Tags as stored: trimmed, short, deduplicated, at most MAX_TAGS. */
export declare function normalizeTags(tags: readonly unknown[]): string[];
export declare class StickerLibrary {
    readonly dir: string;
    private readonly maxCount;
    private readonly maxBytes;
    private readonly dailyMax;
    private readonly log;
    private readonly now;
    private readonly writer;
    private stickers;
    private nextNumber;
    /** path → content hash of the file at that path (LRU; see STICKER_HASH_CACHE_MAX). */
    private readonly hashCache;
    /** Mutations run one at a time (dedupe and numbering stay correct). */
    private queue;
    constructor(options: StickerLibraryOptions);
    /** Read index.json (missing = empty library; a corrupt file is logged and ignored). */
    load(): Promise<void>;
    get count(): number;
    /** How many were added today (local calendar day). */
    addedToday(): number;
    get(id: string): Sticker | undefined;
    /**
     * The sticker already kept with exactly this file's content, or undefined.
     * The hash uses the same algorithm as save, so a picture she kept from an
     * earlier chat is recognized when it comes in again. Missing / unreadable
     * files and anything over the per-image cap have no hash at all.
     */
    findByFile(path: string): Promise<Sticker | undefined>;
    /**
     * The three answers a received file can get: already kept (with the sticker),
     * not kept yet, or too big for the per-image cap so save() would refuse it.
     * undefined when the file cannot be read at all — then there is nothing to
     * say about it.
     */
    classifyFile(path: string): Promise<StickerFileShelf | undefined>;
    /** The file's content hash, memoized by path; undefined when the file is
     * missing, unreadable or bigger than the per-image cap. */
    private hashOf;
    private serial;
    /** Keep a picture: copy it in, or add tags to the copy already kept. */
    save(sourcePath: string, tags: readonly unknown[], description: string, from: string): Promise<StickerSaveResult>;
    private saveNow;
    /**
     * Find stickers for a mood or topic. Each query word scores on the tags
     * (whole tag 3, part of a tag 2) and the description (1); ties go to the
     * one sent less often, so the same picture does not come up every time.
     * An empty query instead shows what the shelf holds (see browse()).
     * `today` lists today's additions instead (for the nightly tidy-up).
     */
    search(query: string, options?: {
        limit?: number;
        today?: boolean;
    }): Sticker[];
    /**
     * The empty-query shelf: half the most-used pictures, the rest filled with
     * the newest ones, no duplicates, never more than limit.
     */
    private browse;
    /** The image file of one sticker (absolute path). */
    pathOf(sticker: Sticker): string;
    markUsed(id: string): Promise<void>;
    private markUsedNow;
    edit(id: string, change: {
        tags?: readonly unknown[];
        description?: string;
    }): Promise<Sticker | undefined>;
    private editNow;
    delete(id: string): Promise<boolean>;
    private deleteNow;
    /** For /doctor: total, today's additions, the caps. */
    snapshot(): {
        count: number;
        maxCount: number;
        today: number;
        dailyMax: number;
    };
    private persist;
}
