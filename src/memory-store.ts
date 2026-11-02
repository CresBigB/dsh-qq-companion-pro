/**
 * T31: one SQLite library per QQ number / group, under `<总工作区>/memorys`.
 *
 * Why per number instead of one big library: `~/.dsh` and the workspace are
 * shared with other profiles and plugins, and a single library means one
 * malformed row or one accidental query can leak another chat's notes. A file
 * per chat isolates the blast radius and makes "delete this chat's memory" a
 * file deletion instead of a delete statement.
 *
 * The schema is deliberately tiny (notes + a hit counter) so it stays a
 * *searchable index* of the same notes that already go into the markdown
 * memory files — the markdown stays the source of truth the model reads, this
 * is the fast lookup ("她以前说过什么") that plain file reads cannot answer.
 *
 * Runtime: `node:sqlite` ships with Node 22.5+ / the desktop host's Node 24.
 * It is a host-only module — the client bundle never imports this file.
 * @module dsh-qq-companion/memory-store
 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { describeError } from './errors.js'

/** Subdirectory of the workspace root that holds every chat's library. */
export const MEMORY_DIR_NAME = 'memorys'
/** How many rows a search returns at most. */
export const MEMORY_SEARCH_LIMIT = 10
/** Longest note kept in the index (the markdown file caps at 200 as well). */
export const MEMORY_NOTE_MAX_CHARS = 400

/** One indexed note. */
export interface MemoryHit {
  text: string
  createdAt: string
  updatedAt: string
  hits: number
}

/** Log sink shared with the rest of the plugin. */
export type MemoryLog = (level: 'info' | 'warn' | 'error' | 'debug', message: string) => void

/**
 * The root that holds the per-chat libraries, or `''` when memory search is off.
 * Derived from the workspace so users do not have to configure another path.
 */
export function memoryStoreRootOf(config: { workspacePath?: string }): string {
  const workspace = config.workspacePath ?? ''
  if (workspace.trim() === '') return ''
  return join(workspace, MEMORY_DIR_NAME)
}

/** The library file name for a chat: just the QQ number / group number. */
export function memoryLibraryName(chatId: string): string {
  const bare = chatId.replace(/^(?:private|group):/i, '').trim()
  const safe = bare.replace(/[^0-9A-Za-z_-]/g, '')
  return safe === '' ? 'unknown' : safe
}

/** Normalized form used as the primary key, so the same note counts as a hit. */
function normalizeNote(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}

/** ISO stamp trimmed to seconds (enough for ordering, shorter on disk). */
function stamp(now: number): string {
  return new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

interface OpenLibrary {
  db: InstanceType<typeof DatabaseSync>
  ready: boolean
}

/**
 * Per-chat note index. One SQLite file per chat, opened lazily and kept open
 * for the process lifetime (the host never hot-reloads a single chat).
 */
export class MemoryLibrary {
  private readonly open = new Map<string, OpenLibrary>()
  private readonly root: string
  private readonly log: MemoryLog

  constructor(root: string, log: MemoryLog = () => undefined) {
    this.root = root
    this.log = log
  }

  /** Where the library of one chat lives (also used by tests and diagnostics). */
  pathOf(chatId: string): string {
    return join(this.root, memoryLibraryName(chatId) + '.db')
  }

  private async library(chatId: string): Promise<OpenLibrary | undefined> {
    const name = memoryLibraryName(chatId)
    const cached = this.open.get(name)
    if (cached !== undefined) return cached
    const entry: OpenLibrary = { db: new DatabaseSync(this.pathOf(chatId)), ready: false }
    try {
      await mkdir(this.root, { recursive: true })
      entry.db.exec(
        'CREATE TABLE IF NOT EXISTS notes ('
        + 'norm TEXT PRIMARY KEY, '
        + 'text TEXT NOT NULL, '
        + 'created_at TEXT NOT NULL, '
        + 'updated_at TEXT NOT NULL, '
        + 'hits INTEGER NOT NULL DEFAULT 1)',
      )
      entry.db.exec('CREATE INDEX IF NOT EXISTS notes_by_hits ON notes (hits DESC, updated_at DESC)')
      entry.ready = true
    } catch (error) {
      this.log('warn', '记忆库打不开（' + name + '）：' + describeError(error))
      this.open.set(name, entry)
      return entry
    }
    this.open.set(name, entry)
    return entry
  }

  /**
   * Index one note for one chat. Repeating the same note only bumps its hit
   * counter and timestamp — that is what makes「按出现频率与日期排序」work.
   */
  async remember(chatId: string, text: string, now: number = Date.now()): Promise<void> {
    const body = text.replace(/\s+/g, ' ').trim()
    if (body === '') return
    const clipped = Array.from(body).length > MEMORY_NOTE_MAX_CHARS
      ? Array.from(body).slice(0, MEMORY_NOTE_MAX_CHARS).join('')
      : body
    const entry = await this.library(chatId)
    if (entry === undefined || !entry.ready) return
    try {
      const when = stamp(now)
      entry.db.prepare(
        'INSERT INTO notes (norm, text, created_at, updated_at, hits) VALUES (?, ?, ?, ?, 1) '
        + 'ON CONFLICT(norm) DO UPDATE SET hits = hits + 1, updated_at = excluded.updated_at',
      ).run(normalizeNote(clipped), clipped, when, when)
    } catch (error) {
      this.log('warn', '记忆库写入失败：' + describeError(error))
    }
  }

  /** Fuzzy search inside one chat: LIKE handles 1–2 character Chinese queries,
   *  which SQLite's trigram tokenizer cannot match at all. */
  async search(chatId: string, query: string, limit: number = MEMORY_SEARCH_LIMIT): Promise<MemoryHit[]> {
    const needle = query.replace(/\s+/g, ' ').trim()
    if (needle === '') return []
    const entry = await this.library(chatId)
    if (entry === undefined || !entry.ready) return []
    try {
      const rows = entry.db.prepare(
        'SELECT text, created_at, updated_at, hits FROM notes WHERE text LIKE ? '
        + 'ORDER BY hits DESC, updated_at DESC LIMIT ?',
      ).all('%' + needle + '%', Math.max(1, Math.min(50, Math.floor(limit)))) as unknown as Array<Record<string, unknown>>
      return rows.map(row => ({
        text: String(row.text ?? ''),
        createdAt: String(row.created_at ?? ''),
        updatedAt: String(row.updated_at ?? ''),
        hits: Number(row.hits ?? 0),
      }))
    } catch (error) {
      this.log('warn', '记忆库搜索失败：' + describeError(error))
      return []
    }
  }

  /** Most-recently-touched notes of one chat. */
  async recent(chatId: string, limit: number = MEMORY_SEARCH_LIMIT): Promise<MemoryHit[]> {
    const entry = await this.library(chatId)
    if (entry === undefined || !entry.ready) return []
    try {
      const rows = entry.db.prepare(
        'SELECT text, created_at, updated_at, hits FROM notes ORDER BY updated_at DESC LIMIT ?',
      ).all(Math.max(1, Math.min(50, Math.floor(limit)))) as unknown as Array<Record<string, unknown>>
      return rows.map(row => ({
        text: String(row.text ?? ''),
        createdAt: String(row.created_at ?? ''),
        updatedAt: String(row.updated_at ?? ''),
        hits: Number(row.hits ?? 0),
      }))
    } catch (error) {
      this.log('warn', '记忆库读取失败：' + describeError(error))
      return []
    }
  }

  /** How many notes one chat has indexed (0 when the library is unusable). */
  async count(chatId: string): Promise<number> {
    const entry = await this.library(chatId)
    if (entry === undefined || !entry.ready) return 0
    try {
      const row = entry.db.prepare('SELECT COUNT(*) AS n FROM notes').get() as unknown as Record<string, unknown> | undefined
      return Number(row?.n ?? 0)
    } catch (error) {
      this.log('warn', '记忆库计数失败：' + describeError(error))
      return 0
    }
  }

  /** Close every open library (plugin dispose). */
  close(): void {
    for (const entry of this.open.values()) {
      try {
        entry.db.close()
      } catch (error) {
        this.log('debug', '记忆库关闭失败：' + describeError(error))
      }
    }
    this.open.clear()
  }
}
