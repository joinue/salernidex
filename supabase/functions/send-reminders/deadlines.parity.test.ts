// Anti-drift guard: runs the server port and the client original side by side
// and asserts they pick the same deadlines.
//
// deadlines.ts is a hand port of the 'anytime' half of src/lib/reminders.js,
// because the Edge Function can't import the browser app's modules. Ports rot
// silently, and this one shares a constant (ANYTIME_DAYS) with the client — if
// somebody widens the in-app head start to ten days and the push still stops at
// seven, nothing fails, the notification just quietly arrives three days late.
// Unit cases below pin the behaviour; the parity block pins the *agreement*.
// Vitest only: Deno never loads test files, so the deployed bundle is
// unaffected.

import { describe, it, expect } from 'vitest'
import { buildAttention, ANYTIME_DAYS as CLIENT_DAYS } from '../../../src/lib/reminders.js'
import { isoDateIn } from '../../../src/lib/tasks.js'
import { deadlinesAhead, isoPlusDays, ANYTIME_DAYS } from './deadlines.ts'

const prefs = { tasks: true, lists: false, nudges: false, dates: false }
const base = { people: [], tasks: [], interactions: [], keyDates: [], lists: [] }

const task = (over: Record<string, unknown> = {}) => ({
  id: 't',
  title: 'A',
  assignee: 'anyone',
  priority: 0,
  due_kind: 'by',
  parent_id: null,
  completed_at: null,
  ...over,
})

describe('isoPlusDays', () => {
  it('adds days without letting a timezone shift the result', () => {
    expect(isoPlusDays('2026-06-12', 7)).toBe('2026-06-19')
    expect(isoPlusDays('2026-12-28', 7)).toBe('2027-01-04') // year roll
    expect(isoPlusDays('2026-02-25', 7)).toBe('2026-03-04') // month-length
    expect(isoPlusDays('2026-06-12', 0)).toBe('2026-06-12')
  })
})

describe('deadlinesAhead', () => {
  const today = '2026-06-12'
  const ids = (tasks: unknown[], memberId = 'm1') =>
    deadlinesAhead(tasks as never, memberId, today).map((t) => t.id)

  it('takes deadlines from tomorrow through the last day of the window', () => {
    const tasks = [
      task({ id: 'tomorrow', due_date: '2026-06-13' }),
      task({ id: 'edge', due_date: isoPlusDays(today, ANYTIME_DAYS) }),
      task({ id: 'past-edge', due_date: isoPlusDays(today, ANYTIME_DAYS + 1) }),
    ]
    expect(ids(tasks)).toEqual(['tomorrow', 'edge'])
  })

  it('leaves today and overdue to dueTasksToday — by then it is simply due', () => {
    const tasks = [
      task({ id: 'today', due_date: today }),
      task({ id: 'late', due_date: '2026-06-01' }),
    ]
    expect(ids(tasks)).toEqual([])
  })

  it('ignores plain scheduled tasks, subtasks, and finished work', () => {
    const tasks = [
      task({ id: 'on', due_date: '2026-06-15', due_kind: 'on' }),
      task({ id: 'none', due_date: '2026-06-15', due_kind: null }),
      task({ id: 'sub', due_date: '2026-06-15', parent_id: 'p' }),
      task({ id: 'done', due_date: '2026-06-15', completed_at: '2026-06-11T10:00:00Z' }),
      task({ id: 'undated', due_date: null }),
    ]
    expect(ids(tasks)).toEqual([])
  })

  it('keeps a deferred deadline parked until its start date', () => {
    expect(ids([task({ id: 'later', due_date: '2026-06-16', start_date: '2026-06-14' })])).toEqual(
      [],
    )
    expect(ids([task({ id: 'open', due_date: '2026-06-16', start_date: '2026-06-12' })])).toEqual([
      'open',
    ])
  })

  it("skips another member's task, keeps mine and anyone's", () => {
    const tasks = [
      task({ id: 'mine', due_date: '2026-06-15', assignee: 'm1' }),
      task({ id: 'hers', due_date: '2026-06-15', assignee: 'm2' }),
      task({ id: 'open', due_date: '2026-06-15', assignee: 'anyone' }),
    ]
    expect(ids(tasks)).toEqual(['mine', 'open'])
  })

  it('leads with the soonest deadline', () => {
    const tasks = [
      task({ id: 'later', due_date: '2026-06-18' }),
      task({ id: 'sooner', due_date: '2026-06-14' }),
    ]
    expect(ids(tasks)).toEqual(['sooner', 'later'])
  })
})

describe('parity with the client attention engine', () => {
  it('agrees on the window constant', () => {
    expect(ANYTIME_DAYS).toBe(CLIENT_DAYS)
  })

  // The client works off the real "today", so build fixtures relative to it and
  // hand both sides the same day.
  it('picks exactly the tasks the client files as urgency "anytime"', () => {
    const today = isoDateIn(0)
    const tasks = []
    for (let d = -2; d <= ANYTIME_DAYS + 2; d++) {
      tasks.push(task({ id: `by-${d}`, due_date: isoDateIn(d) }))
      tasks.push(task({ id: `on-${d}`, due_date: isoDateIn(d), due_kind: 'on' }))
    }
    tasks.push(task({ id: 'deferred', due_date: isoDateIn(4), start_date: isoDateIn(2) }))
    tasks.push(task({ id: 'theirs', due_date: isoDateIn(4), assignee: 'm2' }))

    const client = buildAttention({ ...base, tasks }, prefs, [], 'm1')
      .filter((i) => i.urgency === 'anytime')
      .map((i) => i.task.id)
      .sort()
    const server = deadlinesAhead(tasks as never, 'm1', today)
      .map((t) => t.id)
      .sort()

    expect(server).toEqual(client)
    expect(server.length).toBeGreaterThan(0) // guard against both sides being empty
  })
})
