import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildActivityFeed, activityDayLabel, groupByDay } from './activity'

describe('buildActivityFeed', () => {
  const base = {
    people: [
      { id: 'p1', name: 'Marc' },
      { id: 'gone', name: 'X', deleted_at: '2026-01-01' },
    ],
    interactions: [
      { id: 'i1', person_id: 'p1', occurred_at: '2026-06-10T00:00:00Z' },
      { id: 'i2', person_id: 'gone', occurred_at: '2026-06-11T00:00:00Z' }, // dropped: deleted person
    ],
    completions: [
      { id: 'c1', task_id: 't1', completed_at: '2026-06-09T00:00:00Z', completed_by: 'm-1' },
      { id: 'c2', task_id: 'ghost', completed_at: '2026-06-12T00:00:00Z' }, // dropped: no such task
    ],
    tasks: [{ id: 't1', title: 'Dishes' }],
    lists: [{ id: 'l1', name: 'Groceries' }],
    listItems: [
      {
        id: 'li1',
        list_id: 'l1',
        text: 'Milk',
        created_at: '2026-06-08T00:00:00Z',
        checked_at: '2026-06-11T00:00:00Z',
      },
    ],
  }
  it('merges newest-first and drops orphaned/deleted rows', () => {
    const feed = buildActivityFeed(base)
    expect(feed.map((e) => e.kind)).toEqual(['list', 'interaction', 'completion'])
    // list collapses to its newest item event (the 6-11 check-off)
    expect(feed[0]).toMatchObject({ kind: 'list', action: 'checked', ts: '2026-06-11T00:00:00Z' })
  })
  it('a list with no timestamped items produces no row (documented behavior)', () => {
    const feed = buildActivityFeed({
      ...base,
      listItems: [{ id: 'x', list_id: 'l1', text: 'Eggs', created_at: null }],
    })
    expect(feed.some((e) => e.kind === 'list')).toBe(false)
  })
  it('tolerates entirely empty input', () => {
    expect(buildActivityFeed({})).toEqual([])
  })
})

describe('activityDayLabel / groupByDay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-12T12:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('labels recent days relatively', () => {
    expect(activityDayLabel('2026-06-12T08:00:00')).toBe('Today')
    expect(activityDayLabel('2026-06-11T08:00:00')).toBe('Yesterday')
  })
  it('groups a sorted feed into contiguous day sections', () => {
    const entries = [
      { ts: '2026-06-12T10:00:00' },
      { ts: '2026-06-12T09:00:00' },
      { ts: '2026-06-11T09:00:00' },
    ]
    const groups = groupByDay(entries)
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday'])
    expect(groups[0].items).toHaveLength(2)
  })
})
