import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildActivityFeed, activityDayLabel, changes, groupByDay } from './activity'

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
  it('credits the person behind the event that won, not the one who touched the item first', () => {
    const feed = buildActivityFeed({
      ...base,
      listItems: [
        {
          id: 'li1',
          list_id: 'l1',
          text: 'Milk',
          created_at: '2026-06-08T00:00:00Z',
          created_by: 'u-marc',
          checked_at: '2026-06-11T00:00:00Z',
          checked_by: 'u-wife',
        },
      ],
    })
    expect(feed[0]).toMatchObject({ kind: 'list', action: 'checked', by: 'u-wife' })
  })
  it('credits the adder when adding is the most recent thing that happened', () => {
    const feed = buildActivityFeed({
      ...base,
      listItems: [
        {
          id: 'li1',
          list_id: 'l1',
          text: 'Grout sealer',
          created_at: '2026-06-08T00:00:00Z',
          created_by: 'u-wife',
        },
      ],
    })
    expect(feed.find((e) => e.kind === 'list')).toMatchObject({ action: 'added', by: 'u-wife' })
  })
  it('leaves `by` null on rows predating the actor columns, rather than guessing', () => {
    // base's list item carries neither created_by nor checked_by.
    expect(buildActivityFeed(base).find((e) => e.kind === 'list').by).toBe(null)
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

describe('buildActivityFeed — habit check-ins', () => {
  const habits = [
    { id: 'h1', name: 'Run', polarity: 'build', measure: 'binary' },
    { id: 'gone', name: 'Old', deleted_at: '2026-01-01' },
  ]
  const habitEntries = [
    { id: 'e1', habit_id: 'h1', date: '2026-06-10', value: 1, updated_at: '2026-06-10T07:00:00Z' },
    // rest day — a real action, but not a record of anything done
    {
      id: 'e2',
      habit_id: 'h1',
      date: '2026-06-11',
      value: 0,
      skipped: true,
      updated_at: '2026-06-11T07:00:00Z',
    },
    // orphan: the habit was deleted out from under it
    {
      id: 'e3',
      habit_id: 'gone',
      date: '2026-06-11',
      value: 1,
      updated_at: '2026-06-11T08:00:00Z',
    },
    // no such habit at all
    {
      id: 'e4',
      habit_id: 'ghost',
      date: '2026-06-11',
      value: 1,
      updated_at: '2026-06-11T09:00:00Z',
    },
  ]

  it('includes logged days and drops rest days, deleted and orphaned habits', () => {
    const feed = buildActivityFeed({ habits, habitEntries })
    expect(feed).toHaveLength(1)
    expect(feed[0]).toMatchObject({ kind: 'habit', ts: '2026-06-10T07:00:00Z', value: 1 })
    expect(feed[0].habit.name).toBe('Run')
  })

  it('sorts by when it was logged, not the day it is for', () => {
    // Backfilled yesterday's run this morning: it should land above a check-off
    // that happened last night.
    const feed = buildActivityFeed({
      habits,
      habitEntries: [
        {
          id: 'late',
          habit_id: 'h1',
          date: '2026-06-09',
          value: 1,
          updated_at: '2026-06-11T09:00:00Z',
        },
      ],
      lists: [{ id: 'l1', name: 'Groceries' }],
      listItems: [{ id: 'li1', list_id: 'l1', text: 'Milk', created_at: '2026-06-10T20:00:00Z' }],
    })
    expect(feed.map((e) => e.kind)).toEqual(['habit', 'list'])
  })

  it('falls back to created_at, then the date, when there is no updated_at', () => {
    const feed = buildActivityFeed({
      habits,
      habitEntries: [{ id: 'x', habit_id: 'h1', date: '2026-06-10', value: 1 }],
    })
    expect(feed[0].ts).toBe('2026-06-10')
  })
})

// The half of "what happened" the feed used to miss: things made and things
// changed. It only ever reported what got *finished*, so a partner adding tasks
// or rewriting a note left no trace anywhere in the app.
describe('changes', () => {
  const at = (iso) => new Date(iso).toISOString()
  const row = (over = {}) => ({
    id: 't1',
    title: 'A thing',
    created_at: at('2026-06-10T09:00:00Z'),
    updated_at: at('2026-06-10T09:00:00Z'),
    created_by: 'm1',
    ...over,
  })

  it('reads a row written once as made, and a later write as edited', () => {
    const out = changes({
      tasks: [
        row({ id: 'new' }),
        row({ id: 'old', updated_at: at('2026-06-12T15:00:00Z'), updated_by: 'm2' }),
      ],
    })
    const byId = Object.fromEntries(out.map((e) => [e.id, e]))
    expect(byId.new.action).toBe('added')
    expect(byId.old.action).toBe('edited')
    // The actor is whoever did the thing being reported, not whoever made it.
    expect(byId.old.by).toBe('m2')
    expect(byId.new.by).toBe('m1')
  })

  // completed_at moves updated_at, and the completion already has its own row.
  it('does not report a check-off twice', () => {
    const done = at('2026-06-11T10:00:00Z')
    expect(changes({ tasks: [row({ completed_at: done, updated_at: done })] })).toHaveLength(0)
  })

  it('names what kind of thing it was, so reminders are not called tasks', () => {
    const out = changes({
      tasks: [
        row({ id: 'a' }),
        row({ id: 'b', is_project: true }),
        row({ id: 'c', is_reminder: true }),
      ],
    })
    expect(out.map((e) => e.entity).sort()).toEqual(['project', 'reminder', 'task'])
  })

  it('leaves out headings and deleted notes — neither is something anyone did', () => {
    expect(changes({ tasks: [row({ is_heading: true })] })).toHaveLength(0)
    expect(changes({ notes: [row({ deleted_at: at('2026-06-11T00:00:00Z') })] })).toHaveLength(0)
  })

  // A project template makes a project plus its steps in one tap, and an import
  // lands hundreds at once. Without this the feed is one line per row.
  it('collapses a burst of creates by one person, on one day, into a single line', () => {
    const out = changes({
      tasks: Array.from({ length: 8 }, (_, i) => row({ id: `t${i}` })),
    })
    expect(out).toHaveLength(1)
    expect(out[0].count).toBe(8)
    // Nothing to open — the row goes to that kind's index instead.
    expect(out[0].id).toBeNull()
  })

  it('keeps a couple of creates as themselves, since the titles are the point', () => {
    const out = changes({ tasks: [row({ id: 'a' }), row({ id: 'b' })] })
    expect(out).toHaveLength(2)
    expect(out.every((e) => e.title === 'A thing')).toBe(true)
  })

  it('splits a burst by person and by day rather than lumping the household', () => {
    const mine = Array.from({ length: 4 }, (_, i) => row({ id: `a${i}` }))
    const theirs = Array.from({ length: 4 }, (_, i) => row({ id: `b${i}`, created_by: 'm2' }))
    const later = Array.from({ length: 4 }, (_, i) =>
      row({
        id: `c${i}`,
        created_at: at('2026-06-12T09:00:00Z'),
        updated_at: at('2026-06-12T09:00:00Z'),
      }),
    )
    const out = changes({ tasks: [...mine, ...theirs, ...later] })
    expect(out).toHaveLength(3)
    expect(out.every((e) => e.count === 4)).toBe(true)
  })

  it('never collapses edits — three notes edited are three things to know', () => {
    const edits = Array.from({ length: 5 }, (_, i) =>
      row({ id: `n${i}`, updated_at: at('2026-06-12T15:00:00Z') }),
    )
    expect(changes({ notes: edits })).toHaveLength(5)
  })
})
