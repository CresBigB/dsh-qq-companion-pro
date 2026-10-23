/**
 * 搜索与高亮切分（《前端设计规范》§5.3）——纯函数，模块级可测。
 *
 * 安全约定：高亮只做**文本切分**，返回可渲染片段数组；视图层把片段拼成
 * React 文本节点 / <mark> 元素，绝不使用 dangerouslySetInnerHTML——
 * 含 `<` `>` `&` 的文本原样作为文本节点渲染，不会被当成 HTML。
 */
import { GROUPS, type FieldMeta, type GroupMeta } from './fields.js'

/** 一个字段的命中记录。 */
export interface FieldMatch {
  /** 所属子页 id。 */
  groupId: string
  /** 子页名（组标题）。 */
  groupTitle: string
  /** 字段定义。 */
  field: FieldMeta
  /** 命中了哪些信息维度（label / key / hint / 子页名 / 卡片名）。 */
  hits: string[]
}

/** 一段切分结果：hit=true 的片段在视图里包 <mark class="qqc-mark">。 */
export interface TextSegment {
  text: string
  hit: boolean
}

/** 归一化查询词（去首尾空格 + 小写；空串 = 不搜索）。 */
export function normalizeQuery(query: unknown): string {
  return String(query == null ? '' : query).trim().toLowerCase()
}

/** 文本是否包含查询词（不区分大小写；中文直接包含匹配）。 */
function includesNeedle(text: string, needle: string): boolean {
  if (needle === '') return false
  return text.toLowerCase().indexOf(needle) >= 0
}

/** 单个字段是否命中，命中时返回维度名数组（空数组 = 未命中）。 */
export function matchField(field: FieldMeta, group: Pick<GroupMeta, 'title'>, query: unknown): string[] {
  const needle = normalizeQuery(query)
  if (needle === '') return []
  const hits: string[] = []
  if (includesNeedle(field.label, needle)) hits.push('label')
  if (includesNeedle(field.key, needle)) hits.push('key')
  if (field.hint != null && includesNeedle(field.hint, needle)) hits.push('hint')
  if (includesNeedle(group.title, needle)) hits.push('group')
  if (includesNeedle(field.section, needle)) hits.push('section')
  // 下拉选项的可见文案也算匹配范围（§5.3 + F2b）：用户可能只记得选项名。
  if (field.optionLabels != null) {
    for (const optionLabel of Object.values(field.optionLabels)) {
      if (includesNeedle(String(optionLabel), needle)) {
        hits.push('option')
        break
      }
    }
  }
  return hits
}

/**
 * 在全部子页里检索（顺序 = 子页顺序 = 键序，便于按子页分组渲染）。
 * @param query 用户输入（空串 → 空结果）
 * @param groups 检索范围（缺省 GROUPS）
 */
export function searchFields(query: unknown, groups?: GroupMeta[]): FieldMatch[] {
  const source = Array.isArray(groups) ? groups : GROUPS
  const out: FieldMatch[] = []
  for (const group of source) {
    for (const field of group.fields) {
      const hits = matchField(field, group, query)
      if (hits.length === 0) continue
      out.push({ groupId: group.id, groupTitle: group.title, field: field, hits: hits })
    }
  }
  return out
}

/** 按子页分组（保持子页顺序；组内保持键序）。 */
export function groupMatches(matches: FieldMatch[]): Array<{ groupId: string; groupTitle: string; matches: FieldMatch[] }> {
  const order: string[] = []
  const buckets: Record<string, FieldMatch[]> = {}
  for (const match of matches) {
    if (buckets[match.groupId] === undefined) {
      buckets[match.groupId] = []
      order.push(match.groupId)
    }
    buckets[match.groupId].push(match)
  }
  return order.map(groupId => ({
    groupId: groupId,
    groupTitle: buckets[groupId][0].groupTitle,
    matches: buckets[groupId],
  }))
}

/**
 * 把文本按查询词切成片段（不区分大小写；保序、不丢字）。
 * 拼接所有片段的 text 必然等于原文——视图层据此安全渲染高亮。
 */
export function highlightSegments(text: unknown, query: unknown): TextSegment[] {
  const source = String(text == null ? '' : text)
  const needle = normalizeQuery(query)
  if (source === '') return []
  if (needle === '') return [{ text: source, hit: false }]
  const lowerSource = source.toLowerCase()
  const segments: TextSegment[] = []
  let cursor = 0
  while (cursor < source.length) {
    const found = lowerSource.indexOf(needle, cursor)
    if (found < 0) {
      segments.push({ text: source.slice(cursor), hit: false })
      break
    }
    if (found > cursor) segments.push({ text: source.slice(cursor, found), hit: false })
    segments.push({ text: source.slice(found, found + needle.length), hit: true })
    cursor = found + needle.length
  }
  return segments
}