/**
 * 定时任务（scheduledPrompts）的纯校验与规范化：设置页与 host 远端共用的同一套规则。
 *
 * 单独成模块的原因：这张表以前只在 cordis.patch.yml 里手写，设置页只读展示；
 * 现在两端都要校验它，规则必须只有一份，否则「页面放过了、后端拒了」会成为
 * 一类难查的保存失败。本文件不依赖 node，也不依赖 React。
 */

/** 一条定时任务（设置页与 host 共用的形状）。 */
export interface ScheduledPromptEntry {
  /** 短名字：`/task <id>` 用它手动触发，也是「今天是否已执行」的键。 */
  id: string
  /** 本地时间 HH:MM（24 小时制）。 */
  time: string
  /** 目标会话：`private:<QQ号>` 或 `group:<群号>`。 */
  chatId: string
  /** 投递内容。 */
  prompt: string
  /** 是否附上今天的宿主日志摘要。 */
  includeTodayLog: boolean
  /** 是否附上各群最近的聊天日志。 */
  includeGroupLogs: boolean
}

/** 24 小时制 HH:MM。 */
export const SCHEDULE_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/** 目标会话前缀（与 `private:` / `group:` chatId 约定一致）。 */
export const SCHEDULE_TARGET_PATTERN = /^(private|group):[^\s:]+$/

const ID_MAX = 64
const TARGET_MAX = 128
const PROMPT_MAX = 4000

function textOf(raw: unknown): string {
  return typeof raw === 'string' ? raw : ''
}

function flagOf(raw: unknown): boolean {
  return raw === true
}

/**
 * 一条原始记录 → 规范条目；无法修复（缺 id/时间/目标/内容，或格式不对）时返回 undefined。
 * 未知字段一律丢弃：设置页只认这 6 个字段，手写 yml 里的旧笔误不该原样写回。
 */
export function normalizeScheduledPrompt(raw: unknown): ScheduledPromptEntry | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const record = raw as Record<string, unknown>
  const id = textOf(record.id).trim()
  const time = textOf(record.time).trim()
  const chatId = textOf(record.chatId).trim()
  const prompt = textOf(record.prompt).trim()
  if (id === '' || id.length > ID_MAX) return undefined
  if (!SCHEDULE_TIME_PATTERN.test(time)) return undefined
  if (chatId === '' || chatId.length > TARGET_MAX || !SCHEDULE_TARGET_PATTERN.test(chatId)) return undefined
  if (prompt === '' || prompt.length > PROMPT_MAX) return undefined
  return { id, time, chatId, prompt, includeTodayLog: flagOf(record.includeTodayLog), includeGroupLogs: flagOf(record.includeGroupLogs) }
}

/** 草稿/快照 → 条目数组（丢掉修不好的项；非数组 → 空数组）。 */
export function scheduledPromptEntriesOf(raw: unknown): ScheduledPromptEntry[] {
  if (!Array.isArray(raw)) return []
  const entries: ScheduledPromptEntry[] = []
  for (const item of raw) {
    const entry = normalizeScheduledPrompt(item)
    if (entry !== undefined) entries.push(entry)
  }
  return entries
}

/**
 * 严格校验（保存路径用）：任何一条不合格都报告具体位置与原因，不做静默丢弃。
 * 返回的 entries 已规范化（含默认布尔、已 trim、已丢未知字段）。
 */
export function validateScheduledPrompts(raw: unknown): { entries: ScheduledPromptEntry[]; issues: string[] } {
  if (!Array.isArray(raw)) return { entries: [], issues: ['scheduledPrompts 必须是定时任务数组'] }
  const entries: ScheduledPromptEntry[] = []
  const issues: string[] = []
  const seen = new Set<string>()
  raw.forEach((item, index) => {
    const at = '第 ' + String(index + 1) + ' 条'
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      issues.push(at + '：必须是对象')
      return
    }
    const record = item as Record<string, unknown>
    const id = textOf(record.id).trim()
    const time = textOf(record.time).trim()
    const chatId = textOf(record.chatId).trim()
    const prompt = textOf(record.prompt).trim()
    let ok = true
    if (id === '') {
      issues.push(at + '：id 不能为空（短名字，/task 用它触发，也用于记录今天是否执行）')
      ok = false
    } else if (id.length > ID_MAX) {
      issues.push(at + '：id 最多 ' + String(ID_MAX) + ' 个字符')
      ok = false
    } else if (seen.has(id)) {
      issues.push(at + '：id "' + id + '" 与前面重复')
      ok = false
    }
    if (!SCHEDULE_TIME_PATTERN.test(time)) {
      issues.push(at + '：时间要写成 HH:MM（24 小时制，例如 09:30）')
      ok = false
    }
    if (chatId === '' || chatId.length > TARGET_MAX || !SCHEDULE_TARGET_PATTERN.test(chatId)) {
      issues.push(at + '：目标会话要写成 private:<QQ号> 或 group:<群号>')
      ok = false
    }
    if (prompt === '') {
      issues.push(at + '：内容不能为空')
      ok = false
    } else if (prompt.length > PROMPT_MAX) {
      issues.push(at + '：内容最多 ' + String(PROMPT_MAX) + ' 个字符')
      ok = false
    }
    const record0 = record
    if (record0.includeTodayLog !== undefined && typeof record0.includeTodayLog !== 'boolean') {
      issues.push(at + '：includeTodayLog 必须是布尔值')
      ok = false
    }
    if (record0.includeGroupLogs !== undefined && typeof record0.includeGroupLogs !== 'boolean') {
      issues.push(at + '：includeGroupLogs 必须是布尔值')
      ok = false
    }
    if (!ok) return
    seen.add(id)
    entries.push({ id, time, chatId, prompt, includeTodayLog: flagOf(record0.includeTodayLog), includeGroupLogs: flagOf(record0.includeGroupLogs) })
  })
  return { entries, issues }
}

/** 新条目的默认 id：p1、p2……跳过已占用的。 */
export function nextScheduleId(entries: readonly { id: string }[]): string {
  const taken = new Set(entries.map(entry => entry.id))
  let index = 1
  while (taken.has('p' + String(index))) index += 1
  return 'p' + String(index)
}

/** 一条空条目（「+ 添加一条」用）。 */
export function emptyScheduledPrompt(entries: readonly { id: string }[], time = '09:00'): ScheduledPromptEntry {
  return { id: nextScheduleId(entries), time, chatId: '', prompt: '', includeTodayLog: false, includeGroupLogs: false }
}
