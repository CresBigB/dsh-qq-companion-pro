/**
 * Deprecated config alias tests: the renamed fields
 * inboundImageMaxPx / outboundImageMaxBytes / inboundFileMaxBytes keep their
 * old names as deprecated schemastery aliases for one release, and the old
 * single-lane proactive keys fold into the private/group lanes. Paths covered:
 * legacy only (fallback + warn), new only (no warn), both (new wins + warn),
 * the neither-set default path and legacy-key type validation.
 * @module dsh-qq-companion/tests/config-alias
 */
import { describe, expect, it, vi } from 'vitest'

import { Config, resolveDeprecatedConfig } from '../src/index.js'

describe('deprecated config aliases', () => {
  it('falls back to legacy names when only they are configured, warning once per name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const config = resolveDeprecatedConfig(Config({
      imageMaxSize: 1024,
      maxImageBytes: 111,
      maxInboundFileBytes: 222,
    }))
    expect(config.inboundImageMaxPx).toBe(1024)
    expect(config.outboundImageMaxBytes).toBe(111)
    expect(config.inboundFileMaxBytes).toBe(222)
    // The legacy keys are consumed and never leak into the effective config.
    expect('imageMaxSize' in config).toBe(false)
    expect('maxImageBytes' in config).toBe(false)
    expect('maxInboundFileBytes' in config).toBe(false)
    expect(warn).toHaveBeenCalledTimes(3)
    expect(warn.mock.calls.map(call => String(call[0]))).toEqual([
      expect.stringContaining('"imageMaxSize"'),
      expect.stringContaining('"maxImageBytes"'),
      expect.stringContaining('"maxInboundFileBytes"'),
    ])
    warn.mockRestore()
  })

  it('keeps new-name config untouched and silent', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const config = resolveDeprecatedConfig(Config({
      inboundImageMaxPx: 1024,
      outboundImageMaxBytes: 111,
      inboundFileMaxBytes: 222,
    }))
    expect(config.inboundImageMaxPx).toBe(1024)
    expect(config.outboundImageMaxBytes).toBe(111)
    expect(config.inboundFileMaxBytes).toBe(222)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('prefers the new name when both are configured and still warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const config = resolveDeprecatedConfig(Config({
      imageMaxSize: 1024,
      inboundImageMaxPx: 3000,
      maxImageBytes: 111,
      outboundImageMaxBytes: 5_000_000,
      maxInboundFileBytes: 222,
      inboundFileMaxBytes: 444,
    }))
    expect(config.inboundImageMaxPx).toBe(3000)
    expect(config.outboundImageMaxBytes).toBe(5_000_000)
    expect(config.inboundFileMaxBytes).toBe(444)
    expect(warn).toHaveBeenCalledTimes(3)
    warn.mockRestore()
  })

  it('leaves schema defaults in place without warnings when neither name is set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const config = resolveDeprecatedConfig(Config({}))
    expect(config.inboundImageMaxPx).toBe(2048)
    expect(config.outboundImageMaxBytes).toBe(Config({}).outboundImageMaxBytes)
    expect(config.inboundFileMaxBytes).toBe(20 * 1024 * 1024)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('still type-validates legacy values at the schemastery layer', () => {
    expect(() => Config({ imageMaxSize: 'not-a-number' })).toThrow()
    expect(() => Config({ maxInboundFileBytes: true })).toThrow()
  })

  it('falls back to legacy when the new name sits exactly at its default value', () => {
    // The default comparison sees only the effective new value, so a new name
    // explicitly set to its default still loses to the legacy value (warned).
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const config = resolveDeprecatedConfig(Config({
      imageMaxSize: 4096,
      inboundImageMaxPx: 2048,
    }))
    expect(config.inboundImageMaxPx).toBe(4096)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe('deprecated proactiveChatId (removed from the settings page)', () => {
  it('folds a legacy private target into privateProactiveTargets and drops the old key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const config = resolveDeprecatedConfig(Config({ proactiveChatId: 'private:123450001' }))
    expect(config.privateProactiveTargets).toEqual(['123450001'])
    expect(config.groupProactiveTargets).toEqual([])
    expect('proactiveChatId' in config).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('"proactiveChatId"')
    warn.mockRestore()
  })

  it('sends a legacy group target to the group lane', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const config = resolveDeprecatedConfig(Config({ proactiveChatId: 'group:888000001' }))
    expect(config.privateProactiveTargets).toEqual([])
    expect(config.groupProactiveTargets).toEqual(['888000001'])
    warn.mockRestore()
  })

  it('keeps new lists intact and de-duplicates the legacy value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const config = resolveDeprecatedConfig(Config({
      proactiveChatId: 'private:123450001',
      privateProactiveTargets: ['123450001', '123450002'],
    }))
    expect(config.privateProactiveTargets).toEqual(['123450001', '123450002'])
    warn.mockRestore()
  })

  it('stays silent when no legacy proactive key is present', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const absent = resolveDeprecatedConfig(Config({}))
    expect(absent.privateProactiveTargets).toEqual([])
    expect(absent.groupProactiveTargets).toEqual([])
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('still type-validates the legacy value at the schema layer', () => {
    expect(() => Config({ proactiveChatId: 5 })).toThrow()
  })
})

describe('deprecated single-lane proactive keys (split into private/group lanes)', () => {
  const silence = (): ReturnType<typeof vi.spyOn> => vi.spyOn(console, 'warn').mockImplementation(() => undefined)

  it('turns the old master switch into both lanes being on', () => {
    const warn = silence()
    const config = resolveDeprecatedConfig(Config({ proactiveEnabled: true }))
    expect(config.privateProactiveEnabled).toBe(true)
    expect(config.groupProactiveEnabled).toBe(true)
    expect('proactiveEnabled' in config).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('"proactiveEnabled"')
    warn.mockRestore()
  })

  it('folds window, skip and unanswered into both lanes, but pace only into the private lane', () => {
    const warn = silence()
    const config = resolveDeprecatedConfig(Config({
      proactiveWindowStart: '08:30',
      proactiveWindowEnd: '23:30',
      proactiveSkipIfActiveMinutes: 45,
      proactiveMaxUnanswered: 3,
      proactiveMinPerDay: 2,
      proactiveMaxPerDay: 9,
      proactiveMinGapMinutes: 60,
    }))
    expect(config.privateProactiveWindowStart).toBe('08:30')
    expect(config.groupProactiveWindowStart).toBe('08:30')
    expect(config.privateProactiveWindowEnd).toBe('23:30')
    expect(config.groupProactiveWindowEnd).toBe('23:30')
    expect(config.privateProactiveSkipIfActiveMinutes).toBe(45)
    expect(config.groupProactiveSkipIfActiveMinutes).toBe(45)
    expect(config.privateProactiveMaxUnanswered).toBe(3)
    expect(config.groupProactiveMaxUnanswered).toBe(3)
    expect(config.privateProactiveMinPerDay).toBe(2)
    expect(config.privateProactiveMaxPerDay).toBe(9)
    expect(config.privateProactiveMinGapMinutes).toBe(60)
    // 群车道保留自己更保守的默认节奏。
    expect(config.groupProactiveMinPerDay).toBe(1)
    expect(config.groupProactiveMaxPerDay).toBe(2)
    expect(config.groupProactiveMinGapMinutes).toBe(120)
    for (const key of ['proactiveWindowStart', 'proactiveMinPerDay', 'proactiveMaxPerDay']) {
      expect(key in config).toBe(false)
    }
    warn.mockRestore()
  })

  it('moves the old target lists into their lanes and strips prefixes', () => {
    const warn = silence()
    const config = resolveDeprecatedConfig(Config({
      proactivePrivateTargets: ['123450001', '123450002'],
      proactiveGroupTargets: ['group:888000001'],
    }))
    expect(config.privateProactiveTargets).toEqual(['123450001', '123450002'])
    expect(config.groupProactiveTargets).toEqual(['888000001'])
    expect('proactivePrivateTargets' in config).toBe(false)
    expect('proactiveGroupTargets' in config).toBe(false)
    warn.mockRestore()
  })

  it('lets an explicitly configured lane win over the legacy value', () => {
    const warn = silence()
    const config = resolveDeprecatedConfig(Config({
      proactiveWindowStart: '08:00',
      privateProactiveWindowStart: '10:00',
      privateProactiveMinPerDay: 3,
      proactiveMinPerDay: 7,
    }))
    expect(config.privateProactiveWindowStart).toBe('10:00')
    expect(config.groupProactiveWindowStart).toBe('08:00')
    expect(config.privateProactiveMinPerDay).toBe(3)
    warn.mockRestore()
  })
})
