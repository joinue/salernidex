import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  isoDateIn, daysUntilDue, dueLabel, dueState, taskBucket,
  completionsFor, lastCompletion, projectProgress, isProject, completionFields,
  linkedTasksFor,
} from './tasks'

// Pin "now" to noon on Fri 2026-06-12 so all relative-date logic is deterministic.
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-12T12:00:00')) })
afterEach(() => { vi.useRealTimers() })

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
})

describe('taskBucket', () => {
  it('buckets by due state, with no-date → someday', () => {
    expect(taskBucket({ due_date: '2026-06-11' })).toBe('overdue')
    expect(taskBucket({ due_date: '2026-06-12' })).toBe('today')
    expect(taskBucket({ due_date: '2026-06-13' })).toBe('upcoming') // tomorrow folds into upcoming
    expect(taskBucket({ due_date: null })).toBe('someday')
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
  it('isProject is true when flagged or has children', () => {
    expect(isProject({ id: 'p', is_project: true }, all)).toBe(true)
    expect(isProject({ id: 'x' }, [{ id: 'k', parent_id: 'x' }])).toBe(true)
    expect(isProject({ id: 'solo' }, all)).toBe(false)
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
    const f = completionFields({ id: 't', recurrence: { freq: 'weekly', weekdays: [1], anchor: '2026-06-12' } }, true)
    expect(f).toEqual({ due_date: '2026-06-15', completed_at: null }) // next Monday
  })
})
