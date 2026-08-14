// Anti-drift guard: runs the server port and the client original side by side
// over two years of dates and asserts they never disagree.
//
// habitSchedule.ts is a hand port of src/lib/habits.js + the occursOn half of
// src/lib/recurrence.js, because the Edge Function can't import the browser
// app's modules. Ports rot silently — a limit habit's weekly count was already
// wrong here before this file existed. Unit tests in habitSchedule.test.ts pin
// the behavior; this one pins the *agreement*, which is the property that
// actually matters. Vitest only: Deno never loads test files, so the deployed
// bundle is unaffected.

import { describe, it, expect } from 'vitest'
import { occursOn } from '../../../src/lib/recurrence.js'
import { isScheduled, entryMap, weekCount, toISODate, isSuccess } from '../../../src/lib/habits.js'
import {
  ruleOccursOn,
  habitScheduledOn,
  habitSuccess,
  weekSuccessCount,
  weekStartOf,
} from './habitSchedule.ts'

const RULES = [
  { freq: 'daily', interval: 1, anchor: '2026-01-01' },
  { freq: 'daily', interval: 3, anchor: '2026-01-01' },
  { freq: 'weekly', interval: 1, weekdays: [1, 3, 5], anchor: '2026-01-05' },
  { freq: 'weekly', interval: 2, weekdays: [2], anchor: '2026-01-06' },
  { freq: 'monthly', interval: 1, monthday: 15, anchor: '2026-01-15' },
  { freq: 'monthly', interval: 1, monthday: 31, anchor: '2026-01-31' }, // month-length clamp
  { freq: 'monthly', interval: 2, setpos: 2, weekday: 2, anchor: '2026-01-01' },
  { freq: 'monthly', interval: 1, setpos: -1, weekday: 5, anchor: '2026-01-01' },
  { freq: 'yearly', interval: 1, month: 5, monthday: 10, anchor: '2025-06-10' },
  { freq: 'daily', interval: 1, anchor: '2026-01-01', until: '2026-03-01' },
  { freq: 'daily', interval: 1, anchor: '2026-01-01', exdates: ['2026-02-14', '2026-02-15'] },
]

// Every day of 2026–2027, as local Dates + their ISO strings.
const DAYS = (() => {
  const out = []
  const d = new Date(2026, 0, 1)
  for (let i = 0; i < 730; i++) {
    out.push({ date: new Date(d), iso: toISODate(d) })
    d.setDate(d.getDate() + 1)
  }
  return out
})()

describe('rrule: server port vs lib/recurrence.js', () => {
  for (const rule of RULES) {
    const name = `${rule.freq}/${rule.interval}${rule.setpos ? ` setpos ${rule.setpos}` : ''}${
      rule.until ? ' +until' : ''
    }${rule.exdates ? ' +exdates' : ''}`
    it(`agrees on every day for ${name}`, () => {
      const disagreements = DAYS.filter(
        ({ iso }) => occursOn(rule, iso) !== ruleOccursOn(rule as never, iso),
      ).map(({ iso }) => iso)
      expect(disagreements).toEqual([])
    })
  }
})

describe('scheduling: server port vs lib/habits.js', () => {
  const HABITS = [
    { id: 'h', name: 'H', polarity: 'build', target: 1, active_days: [] },
    { id: 'h', name: 'H', polarity: 'build', target: 1, active_days: [1, 3, 5] },
    { id: 'h', name: 'H', polarity: 'build', target: 1, active_days: [0, 6] },
    { id: 'h', name: 'H', polarity: 'build', target: 2, weekly_target: 3 },
    { id: 'h', name: 'H', polarity: 'limit', target: 1, weekly_target: 3 },
    { id: 'h', name: 'H', polarity: 'limit', target: 0, active_days: [] },
    { id: 'h', name: 'H', polarity: 'track', active_days: [2, 4] },
    ...RULES.map((rrule) => ({ id: 'h', name: 'H', polarity: 'build', target: 1, rrule })),
  ]

  for (const [i, h] of HABITS.entries()) {
    it(`isScheduled agrees for habit ${i}`, () => {
      const disagreements = DAYS.filter(
        ({ date, iso }) => isScheduled(h, date) !== habitScheduledOn(h as never, iso),
      ).map(({ iso }) => iso)
      expect(disagreements).toEqual([])
    })
  }

  it('isSuccess agrees across polarities and values', () => {
    for (const h of HABITS) {
      for (const v of [0, 1, 2, 3, 10]) {
        expect(habitSuccess(h as never, v)).toBe(isSuccess(h, v))
      }
    }
  })
})

describe('weekly counting: server port vs lib/habits.js', () => {
  // A month of assorted logs — some hits, some misses, one rest day.
  const entries = DAYS.slice(0, 60).map(({ iso }, i) => ({
    habit_id: 'h',
    date: iso,
    value: i % 3 === 0 ? 2 : i % 3 === 1 ? 0 : 1,
    skipped: i % 11 === 0,
  }))
  const map = entryMap(entries)

  const WEEKLY = [
    { id: 'h', name: 'H', polarity: 'build', target: 1, weekly_target: 3 },
    { id: 'h', name: 'H', polarity: 'build', target: 2, weekly_target: 5 },
    { id: 'h', name: 'H', polarity: 'limit', target: 1, weekly_target: 3 },
    { id: 'h', name: 'H', polarity: 'limit', target: 0, weekly_target: 2 },
  ]

  for (const [i, h] of WEEKLY.entries()) {
    it(`weekCount agrees every day for habit ${i} (${h.polarity})`, () => {
      const disagreements = []
      for (const { date, iso } of DAYS.slice(0, 60)) {
        const monday = new Date(date)
        monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
        // Both sides must also agree on where the week starts.
        expect(weekStartOf(iso)).toBe(toISODate(monday))
        const client = weekCount(h, map, monday, date)
        const server = weekSuccessCount(h as never, entries, iso)
        if (client !== server) disagreements.push(`${iso}: client=${client} server=${server}`)
      }
      expect(disagreements).toEqual([])
    })
  }
})
