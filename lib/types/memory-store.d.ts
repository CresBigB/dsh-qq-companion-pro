/** Subdirectory of the workspace root that holds every chat's library. */
export declare const MEMORY_DIR_NAME = "memorys";
/** How many rows a search returns at most. */
export declare const MEMORY_SEARCH_LIMIT = 10;
/** Longest note kept in the index (the markdown file caps at 200 as well). */
export declare const MEMORY_NOTE_MAX_CHARS = 400;
/** One indexed note. */
export interface MemoryHit {
    text: string;
    createdAt: string;
    updatedAt: string;
    hits: number;
}
/** Log sink shared with the rest of the plugin. */
export type MemoryLog = (level: 'info' | 'warn' | 'error' | 'debug', message: string) => void;
/**
 * The root that holds the per-chat libraries, or `''` when memory search is off.
 * Derived from the workspace so users do not have to configure another path.
 */
export declare function memoryStoreRootOf(config: {
    workspacePath?: string;
}): string;
/** The library file name for a chat: just the QQ number / group number. */
export declare function memoryLibraryName(chatId: string): string;
/**
 * Per-chat note index. One SQLite file per chat, opened lazily and kept open
 * for the process lifetime (the host never hot-reloads a single chat).
 */
export declare class MemoryLibrary {
    private readonly open;
    private readonly root;
    private readonly log;
    constructor(root: string, log?: MemoryLog);
    /** Where the library of one chat lives (also used by tests and diagnostics). */
    pathOf(chatId: string): string;
    /**
     * Open (and initialize) one chat's library.
     *
     * Order matters: the directory is created *before* SQLite opens the file,
     * otherwise the very first note on a fresh machine fails with
     * `unable to open database file` — which is what happened in the field when
     * the directory did not exist yet. A failed open is **not** cached: the next
     * call retries, so deleting or repairing the folder does not need a restart.
     */
    private library;
    /**
     * Index one note for one chat. Repeating the same note only bumps its hit
     * counter and timestamp — that is what makes「按出现频率与日期排序」work.
     */
    remember(chatId: string, text: string, now?: number): Promise<number>;
    /** Fuzzy search inside one chat: LIKE handles 1–2 character Chinese queries,
     *  which SQLite's trigram tokenizer cannot match at all. */
    search(chatId: string, query: string, limit?: number): Promise<MemoryHit[]>;
    /** Most-recently-touched notes of one chat. */
    recent(chatId: string, limit?: number): Promise<MemoryHit[]>;
    /** How many notes one chat has indexed (0 when the library is unusable). */
    count(chatId: string): Promise<number>;
    /** Close every open library (plugin dispose). */
    close(): void;
}
