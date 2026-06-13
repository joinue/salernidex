import { describe, it, expect } from 'vitest'
import { nextOccurrence, describeRecurrence } from './recurrence'

// Reference weekdays used below (verified): 2026-06-12 Fri, 2026-06-15 Mon,
// 2026-01-31 Sat, 2026-02-28 Sat, 2026-03-01 Sun, 2026-11-30 Mon.

describe('nextOccurrence — daily', () => {
  it('every day, exclusive, returns the next day', () => {
    expect(nextOccurrence({ freq: 'daily', interval: 1, anchor: '2026-06-12' }, '2026-06-12')).toBe('2026-06-13')
  })
  it('every day, inclusive, returns the same day', () => {
    expect(nextOccurrence({ freq: 'daily', interval: 1, anchor: '2026-06-12' }, '2026-06-12', { inclusive: true })).toBe('2026-06-12')
  })
  it('every 3 days is phased off the anchor', () => {
    expect(nextOccurrence({ freq: 'daily', interval: 3, anchor: '2026-06-12' }, '2026-06-12')).toBe('2026-06-15')
    expect(nextOccurrence({ freq: 'daily', interval: 3, anchor: '2026-06-12' }, '2026-06-13')).toBe('2026-06-15')
  })
})

describe('nextOccurrence — weekly', () => {
  it('every Monday from a Friday', () => {
    expect(nextOccurrence({ freq: 'weekly', interval: 1, weekdays: [1], anchor: '2026-06-12' }, '2026-06-12')).toBe('2026-06-15')
  })
  it('multiple weekdays returns the nearest', () => {
    // Mon + Thu (1,4); from Fri 6-12 → Mon 6-15
    expect(nextOccurrence({ freq: 'weekly', interval: 1, weekdays: [1, 4], anchor: '2026-06-12' }, '2026-06-12')).toBe('2026-06-15')
  })
  it('every 2 weeks stays phased to the anchor week', () => {
    // anchor Mon 6-15; the following Monday (6-22) is an off week, 6-29 is on
    const rule = { freq: 'weekly', interval: 2, weekdays: [1], anchor: '2026-06-15' }
    expect(nextOccurrence(rule, '2026-06-15')).toBe('2026-06-29')
  })
})

describe('nextOccurrence — monthly', () => {
  it('by month-day', () => {
    expect(nextOccurrence({ freq: 'monthly', interval: 1, monthday: 1, anchor: '2026-06-12' }, '2026-06-12')).toBe('2026-07-01')
  })
  it('clamps the 31st to a short month', () => {
    // every month on the 31st; Sept has 30 days → falls on the 30th
    expect(nextOccurrence({ freq: 'monthly', interval: 1, monthday: 31, anchor: '2026-08-31' }, '2026-09-01')).toBe('2026-09-30')
  })
  it('by nth weekday (first Monday)', () => {
    expect(nextOccurrence({ freq: 'monthly', interval: 1, setpos: 1, weekday: 1, anchor: '2026-06-12' }, '2026-06-12')).toBe('2026-07-06')
  })
  it('by last weekday (last Monday of Nov 2026 = 11-30)', () => {
    expect(nextOccurrence({ freq: 'monthly', interval: 1, setpos: -1, weekday: 1, anchor: '2026-11-01' }, '2026-11-02')).toBe('2026-11-30')
  })
})

describe('nextOccurrence — yearly', () => {
  it('returns the same-year date when still ahead', () => {
    expect(nextOccurrence({ freq: 'yearly', interval: 1, month: 11, monthday: 25, anchor: '2026-01-01' }, '2026-06-12')).toBe('2026-12-25')
  })
  it('rolls to next year when passed', () => {
    expect(nextOccurrence({ freq: 'yearly', interval: 1, month: 0, monthday: 1, anchor: '2026-01-01' }, '2026-06-12')).toBe('2027-01-01')
  })
})

describe('nextOccurrence — safety', () => {
  it('returns null (not a hang) for an empty rule', () => {
    expect(nextOccurrence(null, '2026-06-12')).toBeNull()
    expect(nextOccurrence({}, '2026-06-12')).toBeNull()
  })
  it('a pathological interval resolves fast and stays bounded', () => {
    const t0 = Date.now()
    // interval 99999: matches() never lines up daily within the capped horizon → null,
    // but it must return quickly rather than spinning ~37M iterations.
    const res = nextOccurrence({ freq: 'daily', interval: 99999, anchor: '2026-06-12' }, '2027-01-01')
    expect(Date.now() - t0).toBeLessThan(500)
    expect(res === null || typeof res === 'string').toBe(true)
  })
})

describe('describeRecurrence', () => {
  it('labels common rules', () => {
    expect(describeRecurrence(null)).toBe('One-off')
    expect(describeRecurrence({ freq: 'daily', interval: 1 })).toBe('Every day')
    expect(describeRecurrence({ freq: 'weekly', interval: 1, weekdays: [1] })).toBe('Every Mon')
    expect(describeRecurrence({ freq: 'weekly', interval: 2, weekdays: [2] })).toBe('Every 2 weeks on Tue')
    expect(describeRecurrence({ freq: 'monthly', interval: 1, monthday: 20 })).toBe('Monthly on the 20th')
  })
})
