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
    const ics = taskToIcs({
      id: 't2',
      title: 'Pay, file; taxes',
      due_date: '2026-01-01',
      notes: 'Line one\nLine two',
      area: 'Home',
    })
    expect(ics).toContain('SUMMARY:Pay\\, file\\; taxes')
    expect(ics).toContain('DESCRIPTION:Area: Home\\nLine one\\nLine two')
  })

  it('includes an RRULE for a recurring task', () => {
    const ics = taskToIcs({ ...base, recurrence: { freq: 'weekly', weekdays: [1] } })
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO')
  })

  it('emits skipped occurrences as EXDATE (all-day uses VALUE=DATE)', () => {
    const ics = taskToIcs({
      ...base,
      recurrence: { freq: 'weekly', weekdays: [1], exdates: ['2026-06-22', '2026-06-29'] },
    })
    expect(ics).toContain('EXDATE;VALUE=DATE:20260622,20260629')
  })

  it('a timed task emits EXDATE with the matching time of day', () => {
    const ics = taskToIcs({
      ...base,
      due_time: '15:00',
      recurrence: { freq: 'weekly', weekdays: [1], exdates: ['2026-06-22'] },
    })
    expect(ics).toContain('EXDATE:20260622T150000')
  })

  it('uses CRLF line endings', () => {
    expect(taskToIcs(base)).toContain('\r\n')
  })

  it('emits a timed 1-hour VEVENT (floating local time) when due_time is set', () => {
    const ics = taskToIcs({ ...base, due_time: '15:00' })
    expect(ics).toContain('DTSTART:20260615T150000')
    expect(ics).toContain('DTEND:20260615T160000')
    expect(ics).not.toContain('VALUE=DATE')
  })

  it('names the parent project so a subtask reads on its own', () => {
    const ics = taskToIcs({ ...base, title: 'Book the flights', parent_title: 'Japan trip' })
    expect(ics).toContain('DESCRIPTION:Part of: Japan trip')
  })
})

describe('projects export their date range', () => {
  const project = {
    id: 'p1',
    title: 'Kitchen reno',
    is_project: true,
    start_date: '2026-06-01',
    end_date: '2026-06-30',
  }

  it('spans start_date → end_date, with an exclusive end', () => {
    const ics = taskToIcs(project)
    expect(ics).toContain('DTSTART;VALUE=DATE:20260601')
    expect(ics).toContain('DTEND;VALUE=DATE:20260701') // day after the target
  })

  it('carries the range onto the deep links', () => {
    expect(new URL(googleCalendarUrl(project)).searchParams.get('dates')).toBe('20260601/20260701')
    const o = new URL(outlookCalendarUrl(project))
    expect(o.searchParams.get('startdt')).toBe('2026-06-01')
    expect(o.searchParams.get('enddt')).toBe('2026-07-01')
    expect(o.searchParams.get('allday')).toBe('true')
  })

  it('collapses to a single day when only one end of the range is set', () => {
    const target = taskToIcs({ ...project, start_date: null })
    expect(target).toContain('DTSTART;VALUE=DATE:20260630')
    expect(target).toContain('DTEND;VALUE=DATE:20260701')
    const start = taskToIcs({ ...project, end_date: null })
    expect(start).toContain('DTSTART;VALUE=DATE:20260601')
    expect(start).toContain('DTEND;VALUE=DATE:20260602')
  })

  it('never emits an end before the start, however the row was written', () => {
    const ics = taskToIcs({ ...project, start_date: '2026-06-30', end_date: '2026-06-01' })
    expect(ics).toContain('DTSTART;VALUE=DATE:20260630')
    expect(ics).toContain('DTEND;VALUE=DATE:20260701')
  })

  it('the range outranks due_date and due_time — Start/Target are date-only', () => {
    const ics = taskToIcs({ ...project, due_date: '2026-12-25', due_time: '15:00' })
    expect(ics).toContain('DTSTART;VALUE=DATE:20260601')
    expect(ics).not.toContain('T150000')
  })

  it('a project with no range still exports from its due date', () => {
    const ics = taskToIcs({ ...project, start_date: null, end_date: null, due_date: '2026-06-15' })
    expect(ics).toContain('DTSTART;VALUE=DATE:20260615')
    expect(ics).toContain('DTEND;VALUE=DATE:20260616')
  })

  it("leaves a plain task's start_date alone — there it means 'not before'", () => {
    const ics = taskToIcs({ ...base, start_date: '2026-01-01' })
    expect(ics).toContain('DTSTART;VALUE=DATE:20260615') // the due date, not the defer date
    expect(ics).toContain('DTEND;VALUE=DATE:20260616')
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
    expect(recurrenceToRrule({ freq: 'monthly', setpos: -1, weekday: 5 })).toBe(
      'FREQ=MONTHLY;BYDAY=-1FR',
    )
  })
  it('yearly converts the 0-indexed month to 1-indexed BYMONTH', () => {
    expect(recurrenceToRrule({ freq: 'yearly', month: 5, monthday: 12 })).toBe(
      'FREQ=YEARLY;BYMONTH=6;BYMONTHDAY=12',
    )
  })
  it('appends UNTIL (compact DATE form) when the rule has an end date', () => {
    expect(recurrenceToRrule({ freq: 'daily', until: '2026-08-31' })).toBe(
      'FREQ=DAILY;UNTIL=20260831',
    )
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

  it('a timed task produces timed spans on the deep links', () => {
    const g = new URL(googleCalendarUrl({ ...base, due_time: '15:00' }))
    expect(g.searchParams.get('dates')).toBe('20260615T150000/20260615T160000')
    const o = new URL(outlookCalendarUrl({ ...base, due_time: '15:00' }))
    expect(o.searchParams.get('startdt')).toBe('2026-06-15T15:00:00')
    expect(o.searchParams.get('enddt')).toBe('2026-06-15T16:00:00')
    expect(o.searchParams.get('allday')).toBe('false')
  })
})
