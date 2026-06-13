import { describe, it, expect } from 'vitest'
import { taskToIcs, recurrenceToRrule, googleCalendarUrl, outlookCalendarUrl } from './calendar'

const base = { id: 'task-1', title: 'Take out the trash', due_date: '2026-06-15' }

describe('taskToIcs', () => {
  it('emits an all-day VEVENT with an exclusive end date', () => {
    const ics = taskToIcs(base, { dtstamp: '20260613T120000Z' })
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('UID:salernidex-task-task-1@salernidex')
    expect(ics).toContain('DTSTAMP:20260613T120000Z')
    expect(ics).toContain('DTSTART;VALUE=DATE:20260615')
    expect(ics).toContain('DTEND;VALUE=DATE:20260616') // end is exclusive → +1 day
    expect(ics).toContain('SUMMARY:Take out the trash')
    expect(ics.endsWith('END:VCALENDAR')).toBe(true)
  })

  it('falls back to a single-day event and escapes text fields', () => {
    const ics = taskToIcs({ id: 't2', title: 'Pay, file; taxes', due_date: '2026-01-01', notes: 'Line one\nLine two', area: 'Home' })
    expect(ics).toContain('SUMMARY:Pay\\, file\\; taxes')
    expect(ics).toContain('DESCRIPTION:Area: Home\\nLine one\\nLine two')
  })

  it('includes an RRULE for a recurring task', () => {
    const ics = taskToIcs({ ...base, recurrence: { freq: 'weekly', weekdays: [1] } })
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO')
  })

  it('uses CRLF line endings', () => {
    expect(taskToIcs(base)).toContain('\r\n')
  })
})

describe('recurrenceToRrule', () => {
  it('returns null for one-offs', () => {
    expect(recurrenceToRrule(null)).toBe(null)
    expect(recurrenceToRrule({})).toBe(null)
  })
  it('daily with interval', () => {
    expect(recurrenceToRrule({ freq: 'daily', interval: 3 })).toBe('FREQ=DAILY;INTERVAL=3')
  })
  it('weekly on multiple days', () => {
    expect(recurrenceToRrule({ freq: 'weekly', weekdays: [1, 3] })).toBe('FREQ=WEEKLY;BYDAY=MO,WE')
  })
  it('monthly by date', () => {
    expect(recurrenceToRrule({ freq: 'monthly', monthday: 20 })).toBe('FREQ=MONTHLY;BYMONTHDAY=20')
  })
  it('monthly by last weekday', () => {
    expect(recurrenceToRrule({ freq: 'monthly', setpos: -1, weekday: 5 })).toBe('FREQ=MONTHLY;BYDAY=-1FR')
  })
  it('yearly converts the 0-indexed month to 1-indexed BYMONTH', () => {
    expect(recurrenceToRrule({ freq: 'yearly', month: 5, monthday: 12 })).toBe('FREQ=YEARLY;BYMONTH=6;BYMONTHDAY=12')
  })
})

describe('deep links', () => {
  it('google link carries an all-day span and recurrence', () => {
    const url = new URL(googleCalendarUrl({ ...base, recurrence: { freq: 'daily' } }))
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(url.searchParams.get('text')).toBe('Take out the trash')
    expect(url.searchParams.get('dates')).toBe('20260615/20260616')
    expect(url.searchParams.get('recur')).toBe('RRULE:FREQ=DAILY')
  })

  it('outlook link is an all-day event with ISO dates', () => {
    const url = new URL(outlookCalendarUrl(base))
    expect(url.searchParams.get('subject')).toBe('Take out the trash')
    expect(url.searchParams.get('startdt')).toBe('2026-06-15')
    expect(url.searchParams.get('enddt')).toBe('2026-06-16')
    expect(url.searchParams.get('allday')).toBe('true')
  })
})
