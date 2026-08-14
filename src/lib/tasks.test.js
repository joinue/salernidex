import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  isoDateIn,
  daysUntilDue,
  dueLabel,
  dueState,
  timeLabel,
  taskBucket,
  byDue,
  byUpcoming,
  priorityLabel,
  completionsFor,
  completionLog,
  capCompletionLog,
  lastCompletion,
  projectProgress,
  isProject,
  projectBucket,
  projectDate,
  projectDateSummary,
  byProjects,
  completionFields,
  skipFields,
  linkedTasksFor,
  isDeferred,
  isDeadline,
  slackDays,
  deadlineLabel,
  startLabel,
  taskTags,
  areaNames,
} from './tasks'

// Pin "now" to noon on Fri 2026-06-12 so all relative-date logic is deterministic.
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-12T12:00:00'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('projectBucket', () => {
  it('reads a completed_at as done regardless of status', () => {
    expect(projectBucket({ completed_at: '2026-06-01T00:00:00Z', project_status: 'active' })).toBe(
      'done',
    )
  })
  it('reads project_status someday', () => {
    expect(projectBucket({ project_status: 'someday' })).toBe('someday')
  })
  it('defaults a missing/active status to active', () => {
    expect(projectBucket({})).toBe('active')
    expect(projectBucket({ project_status: 'active' })).toBe('active')
  })
})

describe('projectDate', () => {
  it('prefers end_date, then due_date, then null', () => {
    expect(projectDate({ end_date: '2026-07-01', due_date: '2026-06-20' })).toBe('2026-07-01')
    expect(projectDate({ due_date: '2026-06-20' })).toBe('2026-06-20')
    expect(projectDate({})).toBeNull()
  })
})

describe('projectDateSummary', () => {
  it('reads as a range when both ends are set', () => {
    expect(projectDateSummary({ start_date: '2026-06-03', end_date: '2026-07-01' })).toBe(
      'Jun 3 → Jul 1',
    )
  })
  it('names the end it has when only one is set', () => {
    expect(projectDateSummary({ start_date: '2026-06-03' })).toBe('Starts Jun 3')
    expect(projectDateSummary({ end_date: '2026-07-01' })).toBe('Target Jul 1')
  })
  it('is null with no dates, so the caller can offer to add them', () => {
    expect(projectDateSummary({})).toBeNull()
    expect(projectDateSummary(null)).toBeNull()
  })
})

describe('byProjects', () => {
  const a = {
    title: 'Beta',
    created_at: '2026-01-01',
    updated_at: '2026-06-01',
    end_date: '2026-07-01',
  }
  const b = {
    title: 'alpha',
    created_at: '2026-05-01',
    updated_at: '2026-05-01',
    due_date: '2026-06-10',
  }
  it('name sorts case-insensitively', () => {
    expect([a, b].sort(byProjects('name')).map((p) => p.title)).toEqual(['alpha', 'Beta'])
  })
  it('due sorts soonest project-date first, undated last', () => {
    const c = { title: 'C' } // no date → last
    expect([a, c, b].sort(byProjects('due')).map((p) => p.title)).toEqual(['alpha', 'Beta', 'C'])
  })
  it('recent sorts most-recently-touched first', () => {
    expect([b, a].sort(byProjects('recent')).map((p) => p.title)).toEqual(['Beta', 'alpha'])
  })
})

describe('isoDateIn / daysUntilDue', () => {
  it('offsets from today', () => {
    expect(isoDateIn(0)).toBe('2026-06-12')
    expect(isoDateIn(1)).toBe('2026-06-13')
    expect(isoDateIn(-1)).toBe('2026-06-11')
  })
  it('counts days to a due date', () => {
    expect(daysUntilDue('2026-06-12')).toBe(0)
    expect(daysUntilDue('2026-06-15')).toBe(3)
    expect(daysUntilDue('2026-06-10')).toBe(-2)
    expect(daysUntilDue(null)).toBeNull()
  })
})

describe('dueLabel / dueState', () => {
  it('labels relative dates', () => {
    expect(dueLabel('2026-06-12')).toBe('Today')
    expect(dueLabel('2026-06-13')).toBe('Tomorrow')
    expect(dueLabel('2026-06-10')).toBe('2d overdue')
    expect(dueLabel(null)).toBeNull()
  })
  it('classifies state', () => {
    expect(dueState('2026-06-11')).toBe('overdue')
    expect(dueState('2026-06-12')).toBe('today')
    expect(dueState('2026-06-13')).toBe('tomorrow')
    expect(dueState('2026-07-01')).toBe('upcoming')
    expect(dueState(null)).toBe('none')
  })
  it('appends a time of day when the task is timed', () => {
    expect(dueLabel('2026-06-12', '15:00')).toBe('Today, 3 PM')
    expect(dueLabel('2026-06-13', '09:30')).toBe('Tomorrow, 9:30 AM')
    expect(dueLabel('2026-06-10', '20:00')).toBe('2d overdue, 8 PM')
    expect(dueLabel('2026-06-12', null)).toBe('Today') // all-day unchanged
  })
})

describe('timeLabel', () => {
  it('drops :00 on the hour and handles am/pm + midnight/noon', () => {
    expect(timeLabel('15:00')).toBe('3 PM')
    expect(timeLabel('09:30')).toBe('9:30 AM')
    expect(timeLabel('00:00')).toBe('12 AM')
    expect(timeLabel('12:00')).toBe('12 PM')
    expect(timeLabel('00:05')).toBe('12:05 AM')
    expect(timeLabel(null)).toBeNull()
    expect(timeLabel('')).toBeNull()
  })
})

describe('priorityLabel', () => {
  it('names the levels, defaulting unknown/0 to None', () => {
    expect(priorityLabel(0)).toBe('None')
    expect(priorityLabel(1)).toBe('Low')
    expect(priorityLabel(2)).toBe('Medium')
    expect(priorityLabel(3)).toBe('High')
    expect(priorityLabel(undefined)).toBe('None')
  })
})

describe('byDue', () => {
  it('orders by date first, undated last', () => {
    const ids = [
      { id: 'late', due_date: '2026-06-20', created_at: '1' },
      { id: 'soon', due_date: '2026-06-13', created_at: '1' },
      { id: 'none', due_date: null, created_at: '1' },
    ]
      .sort(byDue)
      .map((t) => t.id)
    expect(ids).toEqual(['soon', 'late', 'none'])
  })
  it('on the same date: all-day first, then earliest time, then higher priority', () => {
    const ids = [
      { id: 'three-pm', due_date: '2026-06-12', due_time: '15:00', created_at: '1' },
      { id: 'nine-am', due_date: '2026-06-12', due_time: '09:00', created_at: '1' },
      { id: 'all-day', due_date: '2026-06-12', due_time: null, created_at: '1' },
    ]
      .sort(byDue)
      .map((t) => t.id)
    expect(ids).toEqual(['all-day', 'nine-am', 'three-pm'])
  })
  it('breaks a full tie by higher priority', () => {
    const ids = [
      { id: 'low', due_date: '2026-06-12', priority: 1, created_at: '1' },
      { id: 'high', due_date: '2026-06-12', priority: 3, created_at: '1' },
    ]
      .sort(byDue)
      .map((t) => t.id)
    expect(ids).toEqual(['high', 'low'])
  })
})

describe('byUpcoming', () => {
  it('keys a deferred task on its start date, not its nearer due date', () => {
    // "soon-due" is due in 2 days but doesn't start for 2 weeks, so it should sit
    // below "starts-first", which wakes up tomorrow.
    const ids = [
      { id: 'soon-due', start_date: '2026-06-26', due_date: '2026-06-14', created_at: '1' },
      { id: 'starts-first', start_date: '2026-06-13', due_date: '2026-06-20', created_at: '1' },
    ]
      .sort(byUpcoming)
      .map((t) => t.id)
    expect(ids).toEqual(['starts-first', 'soon-due'])
  })
  it('falls back to due date for non-deferred tasks', () => {
    const ids = [
      { id: 'late', due_date: '2026-06-20', created_at: '1' },
      { id: 'soon', due_date: '2026-06-14', created_at: '1' },
    ]
      .sort(byUpcoming)
      .map((t) => t.id)
    expect(ids).toEqual(['soon', 'late'])
  })
})

describe('taskBucket', () => {
  it('buckets by due state, with no-date → someday', () => {
    expect(taskBucket({ due_date: '2026-06-11' })).toBe('overdue')
    expect(taskBucket({ due_date: '2026-06-12' })).toBe('today')
    expect(taskBucket({ due_date: '2026-06-13' })).toBe('upcoming') // tomorrow folds into upcoming
    expect(taskBucket({ due_date: null })).toBe('someday')
  })
  it('a deferred task waits under Upcoming, even if its due date is today/overdue', () => {
    expect(taskBucket({ due_date: '2026-06-12', start_date: '2026-06-20' })).toBe('upcoming')
    expect(taskBucket({ due_date: '2026-06-10', start_date: '2026-06-20' })).toBe('upcoming')
    // a start date in the past no longer defers — falls back to due-date bucketing
    expect(taskBucket({ due_date: '2026-06-12', start_date: '2026-06-01' })).toBe('today')
  })
})

describe('deadlines (due_kind "by")', () => {
  const by = (over) => ({ due_kind: 'by', ...over })

  it('isDeadline needs both the flag and a date', () => {
    expect(isDeadline(by({ due_date: '2026-06-20' }))).toBe(true)
    expect(isDeadline(by({ due_date: null }))).toBe(false)
    expect(isDeadline({ due_date: '2026-06-20' })).toBe(false) // default 'on'
    expect(isDeadline({ due_date: '2026-06-20', due_kind: 'on' })).toBe(false)
  })

  it('files a future deadline under Anytime instead of Upcoming', () => {
    expect(taskBucket(by({ due_date: '2026-06-20' }))).toBe('anytime')
    expect(taskBucket({ due_date: '2026-06-20' })).toBe('upcoming')
  })

  it('stops being flexible once the date arrives — then it is just due', () => {
    expect(taskBucket(by({ due_date: '2026-06-12' }))).toBe('today')
    expect(taskBucket(by({ due_date: '2026-06-11' }))).toBe('overdue')
  })

  it('a deferred deadline still waits — it has not started yet', () => {
    expect(taskBucket(by({ due_date: '2026-06-20', start_date: '2026-06-18' }))).toBe('upcoming')
  })

  it('a deadline with no date is Someday, same as any undated task', () => {
    expect(taskBucket(by({ due_date: null }))).toBe('someday')
  })

  it('slackDays counts the room left, and only for deadlines', () => {
    expect(slackDays(by({ due_date: '2026-06-19' }))).toBe(7)
    expect(slackDays(by({ due_date: '2026-06-10' }))).toBe(-2)
    expect(slackDays({ due_date: '2026-06-19' })).toBeNull()
  })

  it('deadlineLabel reads as remaining room, not as a day to show up', () => {
    expect(deadlineLabel('2026-06-16')).toBe('4d left')
    expect(deadlineLabel('2026-06-13')).toBe('1d left')
    expect(deadlineLabel('2026-06-12')).toBe('Due today')
    expect(deadlineLabel('2026-06-10')).toBe('2d overdue')
    expect(deadlineLabel(null)).toBeNull()
  })

  it('switches to a date past a week out, where dueLabel switches too', () => {
    expect(deadlineLabel('2026-06-19')).toBe('7d left') // last day of the window
    expect(deadlineLabel('2026-06-20')).toBe('by Jun 20')
    expect(deadlineLabel('2026-07-04')).toBe('by Jul 4')
  })

  it('appends a time of day when one is set, like dueLabel', () => {
    expect(deadlineLabel('2026-06-16', '15:00')).toBe('4d left, 3 PM')
  })
})

describe('defer (start dates)', () => {
  it('isDeferred is true only while the start date is in the future', () => {
    expect(isDeferred({ start_date: '2026-06-20' })).toBe(true)
    expect(isDeferred({ start_date: '2026-06-12' })).toBe(false) // today = actionable
    expect(isDeferred({ start_date: '2026-06-01' })).toBe(false)
    expect(isDeferred({ start_date: null })).toBe(false)
    expect(isDeferred({})).toBe(false)
  })
  it('startLabel reads "Starts …" while deferred, null otherwise', () => {
    expect(startLabel({ start_date: '2026-06-13' })).toBe('Starts Tomorrow')
    expect(startLabel({ start_date: '2026-06-17' })).toBe('Starts in 5d')
    expect(startLabel({ start_date: '2026-06-01' })).toBeNull()
  })
})

describe('taskTags', () => {
  it('returns the distinct tags in use, alphabetical', () => {
    const tasks = [
      { tags: ['home', 'errand'] },
      { tags: ['errand'] },
      { tags: [] },
      { tags: ['Work'] },
      {},
    ]
    expect(taskTags(tasks)).toEqual(['errand', 'home', 'Work'])
  })
})

describe('areaNames', () => {
  it('returns the distinct areas in use, alphabetical, trimmed', () => {
    const tasks = [
      { area: 'Work' },
      { area: ' Work ' }, // same area, sloppy entry — must not fragment
      { area: 'home' },
      { area: '   ' }, // whitespace-only reads as no area
      { area: null },
      {},
    ]
    expect(areaNames(tasks)).toEqual(['home', 'Work'])
  })
})

describe('completions helpers', () => {
  const comps = [
    { id: 'c1', task_id: 't1', completed_at: '2026-06-01T00:00:00Z' },
    { id: 'c2', task_id: 't1', completed_at: '2026-06-05T00:00:00Z' },
    { id: 'c3', task_id: 't2', completed_at: '2026-06-03T00:00:00Z' },
  ]
  it('completionsFor returns a task’s completions newest-first', () => {
    expect(completionsFor('t1', comps).map((c) => c.id)).toEqual(['c2', 'c1'])
  })
  it('lastCompletion returns the most recent or null', () => {
    expect(lastCompletion('t1', comps).id).toBe('c2')
    expect(lastCompletion('nope', comps)).toBeNull()
  })
})

describe('project helpers', () => {
  const all = [
    { id: 'p', is_project: true },
    { id: 's1', parent_id: 'p', completed_at: '2026-06-01' },
    { id: 's2', parent_id: 'p' },
    { id: 'h', parent_id: 'p', is_heading: true }, // headings don't count as work
    { id: 'solo' },
  ]
  it('projectProgress counts real subtasks only', () => {
    expect(projectProgress('p', all)).toEqual({ done: 1, total: 2 })
    expect(projectProgress('solo', all)).toBeNull()
  })
  it('isProject keys only on the explicit flag, not on having subtasks', () => {
    expect(isProject({ id: 'p', is_project: true })).toBe(true)
    // a plain task with subtasks is NOT a project — it stays an inline checklist
    expect(isProject({ id: 'x' })).toBe(false)
    expect(isProject({ id: 'solo' })).toBe(false)
  })
})

describe('linkedTasksFor', () => {
  const tasks = [
    { id: 'a', title: 'A', due_date: '2026-06-20', created_at: '1' },
    { id: 'b', title: 'B', due_date: '2026-06-15', created_at: '1' },
    { id: 'c', title: 'C done', completed_at: '2026-06-10', created_at: '1' },
    { id: 'h', title: 'Heading', is_heading: true, created_at: '1' },
    { id: 'z', title: 'Unlinked', created_at: '1' },
  ]
  const links = [
    { task_id: 'a', entity_type: 'person', entity_id: 'p1' },
    { task_id: 'b', entity_type: 'person', entity_id: 'p1' },
    { task_id: 'c', entity_type: 'person', entity_id: 'p1' },
    { task_id: 'h', entity_type: 'person', entity_id: 'p1' },
    { task_id: 'a', entity_type: 'organization', entity_id: 'o1' },
  ]

  it('returns linked tasks, open soonest-due first then completed, dropping headings', () => {
    expect(linkedTasksFor('person', 'p1', tasks, links).map((t) => t.id)).toEqual(['b', 'a', 'c'])
  })
  it('scopes by entity type and id', () => {
    expect(linkedTasksFor('organization', 'o1', tasks, links).map((t) => t.id)).toEqual(['a'])
    expect(linkedTasksFor('person', 'nobody', tasks, links)).toEqual([])
  })
  it('tolerates missing taskLinks', () => {
    expect(linkedTasksFor('person', 'p1', tasks, undefined)).toEqual([])
  })
})

describe('completionFields', () => {
  it('a one-off completion just stamps completed_at', () => {
    const f = completionFields({ id: 't' }, true)
    expect(f.completed_at).not.toBeNull()
    expect(completionFields({ id: 't' }, false)).toEqual({ completed_at: null })
  })
  it('a recurring task rolls forward instead of closing', () => {
    const f = completionFields(
      { id: 't', recurrence: { freq: 'weekly', weekdays: [1], anchor: '2026-06-12' } },
      true,
    )
    expect(f).toEqual({ due_date: '2026-06-15', completed_at: null }) // next Monday
  })
  it('a recurring task whose series has ended (until passed) closes like a one-off', () => {
    // "now" is 2026-06-12; until 2026-06-01 is in the past → no next occurrence
    const f = completionFields(
      {
        id: 't',
        recurrence: { freq: 'weekly', weekdays: [1], anchor: '2026-06-12', until: '2026-06-01' },
      },
      true,
    )
    expect(f.due_date).toBeUndefined()
    expect(f.completed_at).not.toBeNull()
  })

  // "now" is frozen at 2026-06-12 by the suite's fake timers.
  it('an after-completion task counts from today, not from a calendar grid', () => {
    const f = completionFields(
      { id: 't', recurrence: { freq: 'daily', interval: 5, mode: 'after_completion' } },
      true,
    )
    expect(f).toEqual({
      due_date: '2026-06-17',
      recurrence: { freq: 'daily', interval: 5, mode: 'after_completion' },
      completed_at: null,
    })
  })
  it('an after-completion task with a count tallies its completions', () => {
    const rule = { freq: 'daily', interval: 1, mode: 'after_completion', count: 2 }
    const first = completionFields({ id: 't', recurrence: rule }, true)
    expect(first.due_date).toBe('2026-06-13')
    expect(first.recurrence.done_count).toBe(1)
    // Second check-off spends the last slot, so the task closes for good.
    const second = completionFields({ id: 't', recurrence: first.recurrence }, true)
    expect(second.due_date).toBeUndefined()
    expect(second.completed_at).not.toBeNull()
  })
})

describe('skipFields', () => {
  it('an after-completion skip restarts the clock without spending a count', () => {
    const rule = { freq: 'daily', interval: 4, mode: 'after_completion', count: 3, done_count: 1 }
    const f = skipFields({ id: 't', due_date: '2026-06-12', recurrence: rule })
    expect(f).toEqual({ due_date: '2026-06-16', completed_at: null })
    expect(f.recurrence).toBeUndefined() // tally untouched — a skip isn't a completion
  })
})

describe('completionLog', () => {
  // "now" is Fri 2026-06-12 noon (see beforeEach).
  it('groups check-offs by local day, newest first', () => {
    const tasks = [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ]
    const completions = [
      { id: 'c1', task_id: 'a', completed_at: '2026-06-12T09:00:00', completed_by: 'm1' },
      { id: 'c2', task_id: 'b', completed_at: '2026-06-11T20:00:00', completed_by: null },
    ]
    const log = completionLog(tasks, completions)
    expect(log.map((g) => g.label)).toEqual(['Today', 'Yesterday'])
    expect(log[0].events[0].id).toBe('c1')
    expect(log[0].events[0].completedBy).toBe('m1')
  })

  it('includes recurring check-offs even though the task rolled forward', () => {
    // The task carries no completed_at (it advanced), but its log entry remains.
    const tasks = [{ id: 'r', title: 'Trash', recurrence: { freq: 'weekly' }, completed_at: null }]
    const completions = [{ id: 'c1', task_id: 'r', completed_at: '2026-06-12T08:00:00' }]
    const log = completionLog(tasks, completions)
    expect(log[0].events[0].task.id).toBe('r')
  })

  it('does not double-count a one-off that has both completed_at and a log entry', () => {
    const tasks = [{ id: 'o', title: 'One-off', completed_at: '2026-06-12T10:00:00' }]
    const completions = [{ id: 'c1', task_id: 'o', completed_at: '2026-06-12T10:00:00' }]
    const log = completionLog(tasks, completions)
    expect(log[0].events).toHaveLength(1)
    expect(log[0].events[0].id).toBe('c1')
  })

  it('folds in legacy one-offs that predate the completion log', () => {
    const tasks = [{ id: 'o', title: 'Old', completed_at: '2026-06-12T10:00:00' }]
    const log = completionLog(tasks, [])
    expect(log[0].events[0].task.id).toBe('o')
  })

  it('excludes subtasks and honors the keep filter', () => {
    const tasks = [
      { id: 's', title: 'Sub', parent_id: 'p', completed_at: '2026-06-12T10:00:00' },
      { id: 'a', title: 'A', area: 'Home', completed_at: '2026-06-12T11:00:00' },
      { id: 'b', title: 'B', area: 'Work', completed_at: '2026-06-12T11:00:00' },
    ]
    const log = completionLog(tasks, [], (t) => t.area === 'Home')
    const ids = log.flatMap((g) => g.events.map((e) => e.task.id))
    expect(ids).toEqual(['a'])
  })
})

describe('capCompletionLog', () => {
  // "now" is Fri 2026-06-12 noon (see beforeEach).
  const event = (day) => ({ id: `${day}`, completedAt: `${day}T10:00:00` })
  const group = (day, n) => ({
    day,
    label: day,
    events: Array.from({ length: n }, (_, i) => event(`${day}#${i}`)),
  })

  it('drops days older than the window and counts them as omitted', () => {
    const log = [group('2026-06-12', 1), group('2026-05-20', 1)] // 23 days ago
    const { groups, omitted } = capCompletionLog(log, { withinDays: 14, max: 30 })
    expect(groups).toHaveLength(1)
    expect(groups[0].day).toBe('2026-06-12')
    expect(omitted).toBe(1)
  })

  it('caps total events at max, splitting a group and reporting the remainder', () => {
    const log = [group('2026-06-12', 20), group('2026-06-11', 20)]
    const { groups, omitted } = capCompletionLog(log, { withinDays: 14, max: 30 })
    expect(groups[0].events).toHaveLength(20)
    expect(groups[1].events).toHaveLength(10) // 30 - 20
    expect(omitted).toBe(10)
  })

  it('returns everything untrimmed when under both limits', () => {
    const log = [group('2026-06-12', 3)]
    const { groups, omitted } = capCompletionLog(log, { withinDays: 14, max: 30 })
    expect(groups).toEqual(log)
    expect(omitted).toBe(0)
  })
})

describe('skipFields', () => {
  it('records the skipped date in exdates and rolls to the next occurrence', () => {
    const f = skipFields({
      id: 't',
      due_date: '2026-06-15',
      recurrence: { freq: 'weekly', weekdays: [1], anchor: '2026-06-15' },
    })
    expect(f.recurrence.exdates).toEqual(['2026-06-15'])
    expect(f.due_date).toBe('2026-06-22') // following Monday
    expect(f.completed_at).toBeNull()
  })
  it('closes the task when skipping the final occurrence', () => {
    const f = skipFields({
      id: 't',
      due_date: '2026-06-15',
      recurrence: { freq: 'weekly', weekdays: [1], anchor: '2026-06-15', until: '2026-06-20' },
    })
    expect(f.recurrence.exdates).toEqual(['2026-06-15'])
    expect(f.due_date).toBeUndefined()
    expect(f.completed_at).not.toBeNull()
  })
  it('returns null for a non-recurring or undated task', () => {
    expect(skipFields({ id: 't', due_date: '2026-06-15' })).toBeNull()
    expect(skipFields({ id: 't', recurrence: { freq: 'daily' } })).toBeNull()
  })
})
