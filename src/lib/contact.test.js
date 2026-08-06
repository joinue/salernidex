import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  lastInteraction,
  daysSince,
  relativeTime,
  upcomingBirthday,
  followUp,
  followUpLabel,
  upcomingDates,
} from './contact'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-12T12:00:00'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('lastInteraction', () => {
  const ints = [
    { id: 'a', person_id: 'p1', occurred_at: '2026-06-01T00:00:00Z' },
    { id: 'b', person_id: 'p1', occurred_at: '2026-06-10T00:00:00Z' },
    { id: 'c', person_id: 'p2', occurred_at: '2026-06-11T00:00:00Z' },
  ]
  it('returns the most recent for a person, or null', () => {
    expect(lastInteraction('p1', ints).id).toBe('b')
    expect(lastInteraction('nobody', ints)).toBeNull()
  })
})

describe('daysSince / relativeTime', () => {
  it('counts days and labels them', () => {
    expect(daysSince(null)).toBeNull()
    expect(relativeTime('2026-06-12T09:00:00')).toBe('today')
    expect(relativeTime('2026-06-11T09:00:00')).toBe('yesterday')
    expect(relativeTime('2026-06-08T09:00:00')).toBe('4d ago')
    expect(relativeTime('2026-05-29T09:00:00')).toBe('2w ago')
    expect(relativeTime('2026-03-01T09:00:00')).toBe('3mo ago')
    expect(relativeTime('2024-06-01T09:00:00')).toBe('2y ago')
  })
})

describe('upcomingBirthday', () => {
  it('finds a birthday inside the window and computes the age', () => {
    const b = upcomingBirthday({ birthday: '1990-06-20' }, 30)
    expect(b.daysUntil).toBe(8)
    expect(b.turning).toBe(36)
  })
  it('rolls to next year when this year’s already passed', () => {
    const b = upcomingBirthday({ birthday: '1990-06-01' }, 400)
    expect(b.date.getFullYear()).toBe(2027)
  })
  it('returns null outside the window or with no birthday', () => {
    expect(upcomingBirthday({ birthday: '1990-12-25' }, 30)).toBeNull()
    expect(upcomingBirthday({}, 30)).toBeNull()
  })
  it('handles an unknown birth year (no age)', () => {
    expect(upcomingBirthday({ birthday: '2000-06-15' }, 30).turning).toBe(26)
  })
})

describe('followUp', () => {
  it('null when no cadence', () => {
    expect(followUp({ keep_in_touch_days: 0 }, '2026-06-01')).toBeNull()
  })
  it('never when cadence set but nothing logged', () => {
    expect(followUp({ keep_in_touch_days: 30 }, null)).toEqual({ state: 'never', cadence: 30 })
  })
  it('overdue vs ok', () => {
    expect(followUp({ keep_in_touch_days: 7 }, '2026-06-01')).toMatchObject({ state: 'overdue' })
    expect(followUp({ keep_in_touch_days: 30 }, '2026-06-10')).toMatchObject({ state: 'ok' })
  })
})

describe('followUpLabel', () => {
  const label = (person, last) => followUpLabel(followUp(person, last))
  it('null when there is no cadence to be due against', () => {
    expect(followUpLabel(null)).toBeNull()
  })
  it('flags a cadence with nothing logged', () => {
    expect(label({ keep_in_touch_days: 30 }, null)).toMatchObject({
      text: 'No touchpoint logged yet',
      urgent: true,
    })
  })
  it('counts the overdue days, and says "today" at exactly the cadence', () => {
    expect(label({ keep_in_touch_days: 7 }, '2026-06-01T09:00:00').text).toBe('Overdue by 4 days')
    expect(label({ keep_in_touch_days: 7 }, '2026-06-05T09:00:00').text).toBe(
      'Due to reach out today',
    )
  })
  it('counts down inside the window, and is not urgent there', () => {
    expect(label({ keep_in_touch_days: 30 }, '2026-06-10T09:00:00')).toMatchObject({
      text: 'Due in 28 days',
      urgent: false,
    })
    expect(label({ keep_in_touch_days: 3 }, '2026-06-10T09:00:00').text).toBe('Reach out tomorrow')
  })
})

describe('upcomingDates', () => {
  const people = [
    { id: 'p1', birthday: '1990-06-20', deleted_at: null },
    { id: 'p2', birthday: null, deleted_at: null },
  ]
  const keyDates = [
    { id: 'k1', person_id: 'p1', date: '2015-06-15', annual: true, label: 'Anniversary' },
    { id: 'k2', person_id: 'p2', date: '2020-01-01', annual: false, label: 'Past one-off' },
  ]
  it('merges birthdays + annual key dates, soonest first, with years counted', () => {
    const out = upcomingDates(people, keyDates, 30)
    expect(out.map((e) => e.label)).toEqual(['Anniversary', 'Birthday']) // 6-15 before 6-20
    const anniv = out.find((e) => e.kind === 'keydate')
    expect(anniv.years).toBe(11) // 2026 - 2015
  })
  it('drops past one-off key dates', () => {
    const out = upcomingDates(people, keyDates, 30)
    expect(out.some((e) => e.label === 'Past one-off')).toBe(false)
  })
})
