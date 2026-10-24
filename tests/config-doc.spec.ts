/**
 * docs/CONFIG.md is generated from the config schema; this fails when the
 * schema changed and the doc was not regenerated (npm run docs:config).
 * @module dsh-qq-companion/tests/config-doc
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { Config } from '../src/config.js'

describe('docs/CONFIG.md', () => {
  it('matches the config schema', async () => {
    // @ts-expect-error plain .mjs script without type declarations
    const { renderConfigDoc } = await import('../scripts/gen-config-doc.mjs') as { renderConfigDoc(config: unknown): string }
    const doc = readFileSync(join(import.meta.dirname, '..', 'docs', 'CONFIG.md'), 'utf8')
    expect(doc).toBe(renderConfigDoc(Config))
  })

  it('taskEveryRounds 至少 1（不该允许「静默到永不回传」）', () => {
    // schemastery 的 schema 实例本身可调用：schema(value) = 归一化后的配置
    const parse = Config as unknown as (value: Record<string, unknown>) => { taskEveryRounds: number }
    expect(parse({}).taskEveryRounds).toBe(1)
    expect(() => parse({ taskEveryRounds: 0 })).toThrow()
    expect(() => parse({ taskEveryRounds: -3 })).toThrow()
    expect(parse({ taskEveryRounds: 2 }).taskEveryRounds).toBe(2)
  })
})
