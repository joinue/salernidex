import { describe, it, expect } from 'vitest'
import { parseTaskInput, titleFrom, quickTaskFields } from './taskParse'

const TODAY = '2026-06-12' // Friday, fixed so date math is deterministic
const MEMBERS = [
  { id: 'm-1', name: 'Marc' },
  { id: 'm-2', name: 'Rita' },
]
const p = (text) => parseTaskInput(text, { today: TODAY, members: MEMBERS })

const base = new Date(2026, 5, 12)
const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const plusDays = (n) => iso(new Date(2026, 5, 12 + n))
const coming = (dow) => plusDays((dow - base.getDay() + 7) % 7)

describe('due dates', () => {
  it('tomorrow', () => {
    const r = p('buy milk tomorrow')
    expect(r.title).toBe('buy milk')
    expect(r.due_date).toBe(plusDays(1))
    expect(r.recurrence).toBeNull()
  })
  it('this <weekday>', () => {
    expect(p('call mom this friday').due_date).toBe(coming(5))
  })
  it('month name + day', () => {
    expect(p('submit report june 20').due_date.slice(5)).toBe('06-20')
  })
  it('"on the 1st" rolls forward when passed', () => {
    expect(p('pay water bill on the 1st').due_date).toBe('2026-07-01')
  })
  it('in N weeks', () => {
    expect(p('finish deck in 2 weeks').due_date).toBe(plusDays(14))
  })
  it('slash date', () => {
    expect(p('review pr 6/20').due_date.slice(5)).toBe('06-20')
  })
})

describe('recurrence', () => {
  it('weekly by weekday', () => {
    const r = p('take the trash out every monday')
    expect(r.title).toBe('take the trash out')
    expect(r.recurrence).toMatchObject({ freq: 'weekly', weekdays: [1] })
  })
  it('every other weekday → fortnightly', () => {
    expect(p('trash bins every other tuesday').recurrence).toMatchObject({
      freq: 'weekly',
      interval: 2,
      weekdays: [2],
    })
  })
  it('every other multiple weekdays', () => {
    expect(p('gym every other monday and thursday').recurrence.weekdays).toEqual([1, 4])
  })
  it('daily interval', () => {
    expect(p('water plants every 3 days').recurrence).toMatchObject({ freq: 'daily', interval: 3 })
  })
  it('every other day', () => {
    expect(p('meds every other day').recurrence).toMatchObject({ freq: 'daily', interval: 2 })
  })
  it('every weekday', () => {
    expect(p('standup every weekday').recurrence.weekdays).toEqual([1, 2, 3, 4, 5])
  })
  it('monthly on the Nth', () => {
    expect(p('pay rent every month on the 1st').recurrence).toMatchObject({
      freq: 'monthly',
      monthday: 1,
    })
  })
  it('nth weekday of the month', () => {
    expect(p('board meeting first monday of the month').recurrence).toMatchObject({
      freq: 'monthly',
      setpos: 1,
      weekday: 1,
    })
  })
  it('yearly', () => {
    expect(p('renew passport every year').recurrence.freq).toBe('yearly')
  })
})

describe('assignee', () => {
  it('matches a member by first name', () => {
    const r = p('grab coffee for Marc')
    expect(r.assignee).toBe('m-1')
    expect(r.title).toBe('grab coffee')
  })
  it('leaves non-members in the title', () => {
    const r = p('buy gift for dad')
    expect(r.assignee).toBeNull()
    expect(r.title).toBe('buy gift for dad')
  })
})

describe('no-op + safety', () => {
  it('plain title is untouched', () => {
    const r = p('buy milk')
    expect(r.title).toBe('buy milk')
    expect(r.due_date).toBeNull()
    expect(r.tokens).toHaveLength(0)
  })
  it('does not misread a quantity range as a date', () => {
    const r = p('buy 2-4 apples')
    expect(r.due_date).toBeNull()
    expect(r.title).toBe('buy 2-4 apples')
  })
  it('clamps an absurd interval to <= 999', () => {
    expect(p('water plants every 99999 days').recurrence.interval).toBe(999)
  })
})

describe('titleFrom — dismissing a parsed token', () => {
  it('keeps the phrase for a dropped token', () => {
    const r = p('pay rent every month on the 1st')
    expect(r.title).toBe('pay rent')
    expect(
      titleFrom(
        'pay rent every month on the 1st',
        r.tokens.filter((t) => t.type !== 'repeat'),
      ),
    ).toBe('pay rent every month on the 1st')
  })
  it('drops only the dismissed token from a multi-token line', () => {
    const r = p('call mom friday for Rita')
    expect(
      titleFrom(
        'call mom friday for Rita',
        r.tokens.filter((t) => t.type !== 'who'),
      ),
    ).toBe('call mom for Rita')
  })
})

describe('time of day', () => {
  it('parses "at 3pm" into a 24h due_time and a time token', () => {
    const r = p('call dentist at 3pm')
    expect(r.title).toBe('call dentist')
    expect(r.due_time).toBe('15:00')
    expect(r.tokens.find((t) => t.type === 'time')?.label).toBe('3 PM')
  })
  it('parses minutes and am, and a 24h colon time', () => {
    expect(p('standup at 9:30am').due_time).toBe('09:30')
    expect(p('deploy at 15:00').due_time).toBe('15:00')
  })
  it('handles noon and midnight', () => {
    expect(p('lunch at 12pm').due_time).toBe('12:00')
    expect(p('backup at 12am').due_time).toBe('00:00')
  })
  it('combines a date and a time', () => {
    const r = p('dinner tomorrow at 7pm')
    expect(r.due_date).toBe(plusDays(1))
    expect(r.due_time).toBe('19:00')
  })
  it('does not read a bare hour or "at the 1st" as a time', () => {
    expect(p('buy 2 apples').due_time).toBeNull()
    expect(p('rent on the 1st').due_time).toBeNull()
    expect(p('meet at home').due_time).toBeNull()
  })
})

describe('quickTaskFields (inline quick-add payload)', () => {
  const q = (text) => quickTaskFields(text, { today: TODAY, members: MEMBERS })

  it('applies every parsed token to a ready-to-save payload', () => {
    const f = q('call dentist tomorrow at 3pm for Marc')
    expect(f.title).toBe('call dentist')
    expect(f.due_date).toBe(plusDays(1))
    expect(f.due_time).toBe('15:00')
    expect(f.assignee).toBe('m-1')
    expect(f.recurrence).toBeNull()
  })

  it('defaults assignee to "anyone" and dates to null for a bare title', () => {
    const f = q('water the plants')
    expect(f).toMatchObject({
      title: 'water the plants',
      assignee: 'anyone',
      due_date: null,
      due_time: null,
      recurrence: null,
    })
  })

  it('seeds a recurring task with no explicit date from its first occurrence', () => {
    const f = q('trash out every Monday')
    expect(f.recurrence).toBeTruthy()
    expect(f.due_date).toBe(coming(1)) // next Monday on/after today
  })

  it('pins a timed task with no date to today', () => {
    const f = q('standup at 9am')
    expect(f.due_date).toBe(TODAY)
    expect(f.due_time).toBe('09:00')
  })

  it('drops a stray time when no date survives (never holds a time alone)', () => {
    // "meet at home" parses no time, so the payload stays dateless + timeless.
    const f = q('meet at home')
    expect(f.due_date).toBeNull()
    expect(f.due_time).toBeNull()
  })
})
