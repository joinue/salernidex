// Tests for the server-side habit schedule port. These deliberately mirror the
// cases in src/lib/habits.test.js — if the two implementations ever disagree
// about what a "good day" or a scheduled day is, one of these fails.

import { describe, it, expect } from 'vitest'
import {
  ruleOccursOn,
  habitSuccess,
  habitScheduledOn,
  weekStartOf,
  weekSuccessCount,
  habitDueToday,
} from './habitSchedule.ts'

const habit = (over = {}) => ({ id: 'h', name: 'H', polarity: 'build', ...over })
const entry = (date, over = {}) => ({ habit_id: 'h', date, value: 0, skipped: false, ...over })

describe('habitSuccess', () => {
  it('build: value >= target (default 1)', () => {
    expect(habitSuccess(habit(), 1)).toBe(true)
    expect(habitSuccess(habit(), 0)).toBe(false)
    expect(habitSuccess(habit({ target: 3 }), 2)).toBe(false)
  })

  it('limit: value <= target (default 0 = abstinence)', () => {
    expect(habitSuccess(habit({ polarity: 'limit' }), 0)).toBe(true)
    expect(habitSuccess(habit({ polarity: 'limit' }), 1)).toBe(false)
    expect(habitSuccess(habit({ polarity: 'limit', target: 2 }), 2)).toBe(true)
  })

  it('track has no notion of success', () => {
    expect(habitSuccess(habit({ polarity: 'track' }), 5)).toBe(null)
  })
})

describe('habitScheduledOn', () => {
  it('empty active_days means every day', () => {
    expect(habitScheduledOn(habit({ active_days: [] }), '2026-06-10')).toBe(true)
  })

  it('respects specific weekdays (0=Sun..6=Sat)', () => {
    const h = habit({ active_days: [1, 3, 5] }) // Mon/Wed/Fri
    expect(habitScheduledOn(h, '2026-06-10')).toBe(true) // Wednesday
    expect(habitScheduledOn(h, '2026-06-11')).toBe(false) // Thursday
  })

  it('weekly mode is scheduled every day', () => {
    expect(habitScheduledOn(habit({ weekly_target: 3, active_days: [1] }), '2026-06-11')).toBe(true)
  })

  it('an rrule overrides the weekday set', () => {
    const h = habit({ rrule: { freq: 'daily', interval: 2, anchor: '2026-06-10' } })
    expect(habitScheduledOn(h, '2026-06-10')).toBe(true)
    expect(habitScheduledOn(h, '2026-06-11')).toBe(false)
    expect(habitScheduledOn(h, '2026-06-12')).toBe(true)
  })
})

describe('ruleOccursOn', () => {
  it('every-2-days lands on the anchored phase only', () => {
    const r = { freq: 'daily', interval: 2, anchor: '2026-06-01' }
    expect(ruleOccursOn(r, '2026-06-03')).toBe(true)
    expect(ruleOccursOn(r, '2026-06-04')).toBe(false)
    expect(ruleOccursOn(r, '2026-05-31')).toBe(false) // before the anchor
  })

  it('every-2-weeks on Tuesdays', () => {
    const r = { freq: 'weekly', interval: 2, weekdays: [2], anchor: '2026-06-02' }
    expect(ruleOccursOn(r, '2026-06-02')).toBe(true)
    expect(ruleOccursOn(r, '2026-06-09')).toBe(false)
    expect(ruleOccursOn(r, '2026-06-16')).toBe(true)
  })

  it('monthly by date, clamped to short months', () => {
    const r = { freq: 'monthly', monthday: 31, anchor: '2026-01-31' }
    expect(ruleOccursOn(r, '2026-01-31')).toBe(true)
    expect(ruleOccursOn(r, '2026-02-28')).toBe(true) // clamped
    expect(ruleOccursOn(r, '2026-03-30')).toBe(false)
  })

  it('monthly by weekday position (2nd Tuesday, last Friday)', () => {
    expect(
      ruleOccursOn({ freq: 'monthly', setpos: 2, weekday: 2, anchor: '2026-06-01' }, '2026-06-09'),
    ).toBe(true)
    expect(
      ruleOccursOn({ freq: 'monthly', setpos: -1, weekday: 5, anchor: '2026-06-01' }, '2026-06-26'),
    ).toBe(true)
  })

  it('yearly on a month/day', () => {
    const r = { freq: 'yearly', month: 5, monthday: 10, anchor: '2025-06-10' }
    expect(ruleOccursOn(r, '2026-06-10')).toBe(true)
    expect(ruleOccursOn(r, '2026-06-11')).toBe(false)
  })

  it('honors until and exdates', () => {
    const r = { freq: 'daily', anchor: '2026-06-01', until: '2026-06-05' }
    expect(ruleOccursOn(r, '2026-06-06')).toBe(false)
    expect(ruleOccursOn({ ...r, until: undefined, exdates: ['2026-06-03'] }, '2026-06-03')).toBe(
      false,
    )
  })
})

describe('weekStartOf / weekSuccessCount', () => {
  it('weeks start on Monday', () => {
    expect(weekStartOf('2026-06-10')).toBe('2026-06-08') // Wed → Mon
    expect(weekStartOf('2026-06-08')).toBe('2026-06-08') // Mon → itself
    expect(weekStartOf('2026-06-14')).toBe('2026-06-08') // Sun → the Mon before
  })

  it('counts success days so far this week, ignoring rest days', () => {
    const h = habit({ weekly_target: 3 })
    const entries = [
      entry('2026-06-08', { value: 1 }),
      entry('2026-06-09', { value: 1, skipped: true }), // rest day, not a success
      entry('2026-06-10', { value: 1 }),
    ]
    expect(weekSuccessCount(h, entries, '2026-06-10')).toBe(2)
  })

  it('does not count days past today', () => {
    const h = habit({ weekly_target: 3 })
    const entries = [entry('2026-06-08', { value: 1 }), entry('2026-06-12', { value: 1 })]
    expect(weekSuccessCount(h, entries, '2026-06-10')).toBe(1)
  })
})

describe('habitDueToday', () => {
  it('build: due until the target is met', () => {
    const h = habit({ target: 2 })
    expect(habitDueToday(h, [], '2026-06-10')).toBe(true)
    expect(habitDueToday(h, [entry('2026-06-10', { value: 1 })], '2026-06-10')).toBe(true)
    expect(habitDueToday(h, [entry('2026-06-10', { value: 2 })], '2026-06-10')).toBe(false)
  })

  it('a rest day is never nudged', () => {
    const h = habit()
    expect(habitDueToday(h, [entry('2026-06-10', { skipped: true })], '2026-06-10')).toBe(false)
  })

  it('off-days are never nudged', () => {
    const h = habit({ active_days: [1, 3, 5] })
    expect(habitDueToday(h, [], '2026-06-11')).toBe(false) // Thursday
    expect(habitDueToday(h, [], '2026-06-10')).toBe(true) // Wednesday
  })

  it('an rrule habit is only nudged on an occurrence', () => {
    const h = habit({ rrule: { freq: 'daily', interval: 3, anchor: '2026-06-10' } })
    expect(habitDueToday(h, [], '2026-06-10')).toBe(true)
    expect(habitDueToday(h, [], '2026-06-11')).toBe(false)
    expect(habitDueToday(h, [], '2026-06-13')).toBe(true)
  })

  it('weekly: stops once the week target is hit', () => {
    const h = habit({ weekly_target: 2 })
    const done = [entry('2026-06-08', { value: 1 }), entry('2026-06-09', { value: 1 })]
    expect(habitDueToday(h, done, '2026-06-10')).toBe(false)
    expect(habitDueToday(h, done.slice(0, 1), '2026-06-10')).toBe(true)
  })

  it('weekly + limit uses the limit rule, not a bare value >= target', () => {
    // Regression: the old inline port compared `value >= target` for every
    // polarity, so a limit habit's clean days never counted toward the weekly
    // target and it nudged forever. A limit habit is satisfied by default.
    const h = habit({ polarity: 'limit', target: 1, weekly_target: 3 })
    expect(habitDueToday(h, [], '2026-06-10')).toBe(false)
    // …and a day over the cap does not count toward the week.
    const over = ['2026-06-08', '2026-06-09', '2026-06-10'].map((d) => entry(d, { value: 5 }))
    expect(habitDueToday(h, over, '2026-06-10')).toBe(true)
  })

  it('limit and track habits are always worth a log prompt on a scheduled day', () => {
    expect(habitDueToday(habit({ polarity: 'limit', target: 2 }), [], '2026-06-10')).toBe(true)
    expect(habitDueToday(habit({ polarity: 'track' }), [], '2026-06-10')).toBe(true)
  })
})
