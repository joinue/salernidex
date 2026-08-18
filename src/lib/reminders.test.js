import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  HORIZON_DAYS,
  ROSTER_DAYS,
  contactDates,
  groupReminders,
  isReminder,
  newReminderFields,
  reminderWhen,
  suggestsContactDate,
  undatedReminders,
  upcomingReminders,
} from './reminders'

// Noon on Fri 2026-06-12, like tasks.test.js — the date helpers read the real
// clock, so pinning it is how this stays deterministic.
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-12T12:00:00'))
})
afterEach(() => {
  vi.useRealTimers()
})

const on = (iso, over = {}) => ({ id: iso, title: `Thing ${iso}`, due_date: iso, ...over })

describe('isReminder / newReminderFields', () => {
  it('reads the flag, not the shape', () => {
    expect(isReminder({ is_reminder: true })).toBe(true)
    expect(isReminder({ due_date: '2026-06-12' })).toBe(false)
    expect(isReminder(null)).toBe(false)
  })

  it('starts a reminder that can be shared and never has slack', () => {
    const f = newReminderFields({ due_date: '2026-06-20' })
    expect(f.is_reminder).toBe(true)
    // 'on' the day, never 'by' it: a deadline claims there's work with room to
    // do it in, and a reminder has neither.
    expect(f.due_kind).toBe('on')
    expect(f.assignee).toBe('anyone')
    expect(f.privacy_level).toBe('shared')
    expect(f.due_date).toBe('2026-06-20')
  })
})

describe('upcomingReminders', () => {
  const people = [
    { id: 'p1', name: 'Ada Lovelace', birthday: '1990-06-15' },
    { id: 'p2', name: 'Gone Person', birthday: '1990-06-16', deleted_at: '2026-01-01' },
  ]

  it('merges stored reminders with dates derived from contacts, soonest first', () => {
    const items = upcomingReminders({
      reminders: [on('2026-06-20'), on('2026-06-13')],
      people,
    })
    expect(items.map((i) => i.daysUntil)).toEqual([1, 3, 8])
    expect(items.map((i) => i.kind)).toEqual(['stored', 'derived', 'stored'])
  })

  it('names a birthday the way you would say it', () => {
    const [item] = upcomingReminders({ reminders: [], people: [people[0]] })
    expect(item.title).toBe('Ada Lovelace turns 36')
    expect(item.kind).toBe('derived')
    expect(item.key).toBe('b-p1')
  })

  it("leaves a deleted contact's birthday out", () => {
    const items = upcomingReminders({ reminders: [], people })
    expect(items.map((i) => i.key)).not.toContain('b-p2')
  })

  it('keeps an unacknowledged reminder that has already passed', () => {
    const items = upcomingReminders({ reminders: [on('2026-06-10')], people: [] })
    expect(items[0].daysUntil).toBe(-2)
  })

  it('drops acknowledged ones unless asked for them', () => {
    const done = [on('2026-06-13', { completed_at: '2026-06-12T09:00:00Z' })]
    expect(upcomingReminders({ reminders: done, people: [] })).toHaveLength(0)
    expect(upcomingReminders({ reminders: done, people: [] }, { includeDone: true })).toHaveLength(
      1,
    )
  })

  it('stops at the horizon, but keeps the undated', () => {
    const far = on('2026-09-01') // ~81 days out
    const undated = { id: 'u', title: 'Renew the passport', due_date: null }
    const items = upcomingReminders({ reminders: [far, undated], people: [] })
    expect(items.map((i) => i.title)).toEqual(['Renew the passport'])
    expect(HORIZON_DAYS).toBe(30)
  })

  it('sorts the undated to the end rather than the front', () => {
    const items = upcomingReminders({
      reminders: [{ id: 'u', title: 'Someday', due_date: null }, on('2026-06-13')],
      people: [],
    })
    expect(items.map((i) => i.title)).toEqual(['Thing 2026-06-13', 'Someday'])
  })
})

// The rest of the year's contact dates, which is what makes the note at the
// foot of the page checkable: before this, a household whose next birthday was
// in August read "birthdays come from your contacts" against an empty screen.
describe('contactDates', () => {
  const people = [
    { id: 'p1', name: 'Ada Lovelace', birthday: '1990-06-15' }, // 3 days out
    { id: 'p2', name: 'Grace Hopper', birthday: '1906-12-09' }, // ~180 days out
    { id: 'p3', name: 'Gone Person', birthday: '1990-11-01', deleted_at: '2026-01-01' },
  ]
  const keyDates = [
    { id: 'k1', person_id: 'p1', date: '2015-09-04', annual: true, label: 'Wedding' },
  ]

  it('is the dates past the horizon, so nothing is listed twice on one page', () => {
    const roster = contactDates({ people, keyDates })
    expect(roster.map((i) => i.key)).toEqual(['k-k1', 'b-p2'])
    expect(roster.every((i) => i.daysUntil > HORIZON_DAYS)).toBe(true)
    expect(ROSTER_DAYS).toBe(365)
  })

  it("leaves an archived contact's dates out, here as everywhere else", () => {
    expect(contactDates({ people, keyDates }).map((i) => i.key)).not.toContain('b-p3')
  })

  it('drops the floor on request, which is how the page asks "any on file at all?"', () => {
    const all = contactDates({ people, keyDates }, { after: -1 })
    expect(all.map((i) => i.key)).toEqual(['b-p1', 'k-k1', 'b-p2'])
    expect(contactDates({ people: [], keyDates: [] }, { after: -1 })).toEqual([])
  })

  it('reads as a calendar date, because "in 84d" is not a date anyone can use', () => {
    const [wedding] = contactDates({ people, keyDates })
    expect(reminderWhen(wedding)).toBe('Sep 4')
    expect(wedding.title).toBe('Ada Lovelace · Wedding')
  })
})

describe('reminderWhen', () => {
  it('says when, not how late', () => {
    expect(reminderWhen({ daysUntil: 0, dateIso: '2026-06-12' })).toBe('Today')
    expect(reminderWhen({ daysUntil: 1, dateIso: '2026-06-13' })).toBe('Tomorrow')
    expect(reminderWhen({ daysUntil: 3, dateIso: '2026-06-15' })).toBe('in 3d')
    expect(reminderWhen({ daysUntil: -2, dateIso: '2026-06-10' })).toBe('2d ago')
    expect(reminderWhen({ daysUntil: null, dateIso: null })).toBe('No date')
  })

  it('handles a derived entry, which carries days but no date', () => {
    expect(reminderWhen({ daysUntil: 0, dateIso: null })).toBe('Today')
    expect(reminderWhen({ daysUntil: 12, dateIso: null })).toBe('in 12d')
  })
})

describe('groupReminders', () => {
  it('splits into the sections the page shows', () => {
    const g = groupReminders([
      { key: 'a', daysUntil: -1 },
      { key: 'b', daysUntil: 0 },
      { key: 'c', daysUntil: 4 },
      { key: 'd', daysUntil: 20 },
      { key: 'e', daysUntil: null },
    ])
    expect(g.overdue.map((i) => i.key)).toEqual(['a'])
    expect(g.today.map((i) => i.key)).toEqual(['b'])
    expect(g.soon.map((i) => i.key)).toEqual(['c'])
    expect(g.later.map((i) => i.key)).toEqual(['d'])
    expect(g.undated.map((i) => i.key)).toEqual(['e'])
  })
})

describe('undatedReminders', () => {
  it('is the open ones with nothing on the calendar yet', () => {
    const rows = [
      { id: 'a', due_date: null },
      { id: 'b', due_date: '2026-06-20' },
      { id: 'c', due_date: null, completed_at: 'x' },
    ]
    expect(undatedReminders(rows).map((r) => r.id)).toEqual(['a'])
  })
})

// The nudge toward filing a date on the contact, so a birthday can't exist in
// two places and drift.
describe('suggestsContactDate', () => {
  const people = [
    { id: 'p1', name: 'Ada Lovelace' },
    { id: 'p2', name: 'Bo Zhang' },
  ]

  it('spots a named person plus date-shaped language', () => {
    expect(suggestsContactDate("Ada's birthday", people)).toMatchObject({
      kind: 'birthday',
      person: { id: 'p1' },
    })
    expect(suggestsContactDate('Bo anniversary dinner', people)).toMatchObject({
      kind: 'keydate',
      person: { id: 'p2' },
    })
  })

  it('stays quiet without the date language, so ordinary reminders are left alone', () => {
    expect(suggestsContactDate('Call Ada back', people)).toBeNull()
    expect(suggestsContactDate('Ada is picking up the parcel', people)).toBeNull()
  })

  it('stays quiet without a name it recognises', () => {
    expect(suggestsContactDate('Birthday party on the 4th', people)).toBeNull()
    expect(suggestsContactDate('', people)).toBeNull()
  })

  it('needs the whole name, not a fragment of another word', () => {
    // "Adam" must not match "Ada".
    expect(suggestsContactDate("Adamson's birthday", people)).toBeNull()
  })
})
