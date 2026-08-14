import { describe, it, expect } from 'vitest'
import { browserTimeZone, isPlausibleZone } from './timezone'

describe('isPlausibleZone', () => {
  // Mirrors the check constraint in migration 0036. If these two ever disagree,
  // a signup fails on a preference write, which is a bad trade for a nicety.
  it('accepts IANA names', () => {
    for (const tz of ['America/Phoenix', 'Europe/Berlin', 'UTC', 'Asia/Ho_Chi_Minh']) {
      expect(isPlausibleZone(tz)).toBe(true)
    }
  })

  it('accepts the awkward-but-real names', () => {
    // Real zones carrying the characters the constraint has to allow.
    for (const tz of ['Etc/GMT+7', 'America/Argentina/Buenos_Aires', 'America/Port-au-Prince']) {
      expect(isPlausibleZone(tz)).toBe(true)
    }
  })

  it('rejects what would fail the column constraint', () => {
    for (const bad of ['', ' ', '/Nope', '7Zone', null, undefined, 42, {}]) {
      expect(isPlausibleZone(bad)).toBe(false)
    }
  })
})

describe('browserTimeZone', () => {
  it('returns a zone this runtime can actually format with', () => {
    const tz = browserTimeZone()
    expect(tz).toBeTruthy()
    // The contract that matters downstream: whatever comes back must be usable
    // as an Intl timeZone, since send-reminders renders the member's day with it.
    expect(() => new Intl.DateTimeFormat('en-CA', { timeZone: tz })).not.toThrow()
    expect(isPlausibleZone(tz)).toBe(true)
  })

  it('gives a name, not a fixed-offset abbreviation', () => {
    // 'EST' would resolve but never spring forward — a member stamped with one
    // would be an hour off for half the year.
    expect(['EST', 'PST', 'CST', 'MST']).not.toContain(browserTimeZone())
  })
})
