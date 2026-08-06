import { describe, it, expect } from 'vitest'
import { buildAttention, badgeCount } from './reminders'
import { isoDateIn } from './tasks'

// Minimal data shell — only the fields buildAttention reads. Lists are the
// focus here; people/tasks/dates stay empty so nothing else competes.
const base = { people: [], tasks: [], interactions: [], keyDates: [], lists: [] }
const prefs = { tasks: true, lists: true, nudges: true, dates: true }

const list = (over = {}) => ({
  id: 'l1',
  name: 'Groceries',
  privacy_level: 'family_shared',
  ...over,
})

describe('buildAttention — list kind', () => {
  it('surfaces a list due today as urgency "today"', () => {
    const items = buildAttention({ ...base, lists: [list({ due_date: isoDateIn(0) })] }, prefs)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'list', key: 'list:l1', urgency: 'today' })
    expect(items[0].list.name).toBe('Groceries')
  })

  it('surfaces a list due in the past as urgency "overdue"', () => {
    const items = buildAttention({ ...base, lists: [list({ due_date: isoDateIn(-2) })] }, prefs)
    expect(items.map((i) => i.urgency)).toEqual(['overdue'])
  })

  it('ignores a list due in the future', () => {
    const items = buildAttention({ ...base, lists: [list({ due_date: isoDateIn(3) })] }, prefs)
    expect(items).toHaveLength(0)
  })

  it('ignores a list with no due date', () => {
    const items = buildAttention({ ...base, lists: [list({ due_date: null })] }, prefs)
    expect(items).toHaveLength(0)
  })

  it('respects the lists pref being off', () => {
    const data = { ...base, lists: [list({ due_date: isoDateIn(0) })] }
    expect(buildAttention(data, { ...prefs, lists: false })).toHaveLength(0)
  })

  it('honors a per-member snooze on the list key', () => {
    const data = { ...base, lists: [list({ due_date: isoDateIn(0) })] }
    const snoozes = [{ member_id: 'm1', target_key: 'list:l1', until: null }]
    expect(buildAttention(data, prefs, snoozes, 'm1')).toHaveLength(0)
  })

  it('counts due lists toward the badge', () => {
    const items = buildAttention({ ...base, lists: [list({ due_date: isoDateIn(-1) })] }, prefs)
    expect(badgeCount(items)).toBe(1)
  })
})

describe('buildAttention — nudges are soft', () => {
  // A contact well past their keep-in-touch cadence: surfaces as a check-in.
  const person = (over = {}) => ({ id: 'p1', name: 'Sam', keep_in_touch_days: 30, ...over })

  it('surfaces a drifting contact as a soft nudge', () => {
    const items = buildAttention({ ...base, people: [person()] }, prefs)
    expect(items).toMatchObject([{ kind: 'nudge', key: 'nudge:p1', urgency: 'soft' }])
  })

  it('keeps soft nudges out of the red badge', () => {
    const items = buildAttention({ ...base, people: [person()] }, prefs)
    expect(badgeCount(items)).toBe(0)
  })
})

describe('buildAttention — projects vs tasks', () => {
  const task = (over = {}) => ({ id: 't', title: 'A', assignee: 'anyone', priority: 0, ...over })

  it('keeps a plain top-level task due today', () => {
    const items = buildAttention({ ...base, tasks: [task({ due_date: isoDateIn(0) })] }, prefs)
    expect(items.map((i) => i.key)).toEqual(['task:t'])
    expect(items[0].project).toBeNull()
  })

  it('does NOT surface the project container itself, even when due today', () => {
    const tasks = [task({ id: 'p', is_project: true, due_date: isoDateIn(0) })]
    expect(buildAttention({ ...base, tasks }, prefs)).toHaveLength(0)
  })

  it('surfaces a dated project subtask, tagged with its project for the breadcrumb', () => {
    const tasks = [
      task({ id: 'p', title: 'Italy trip', is_project: true }),
      task({ id: 's', title: 'Confirm car', parent_id: 'p', due_date: isoDateIn(0) }),
    ]
    const items = buildAttention({ ...base, tasks }, prefs)
    expect(items.map((i) => i.key)).toEqual(['task:s'])
    expect(items[0].project.title).toBe('Italy trip')
  })

  it('ignores a project subtask with no due date of its own', () => {
    const tasks = [
      task({ id: 'p', is_project: true }),
      task({ id: 's', parent_id: 'p', due_date: null }),
    ]
    expect(buildAttention({ ...base, tasks }, prefs)).toHaveLength(0)
  })

  it('ignores a dated subtask whose parent is a plain task (not a project)', () => {
    const tasks = [
      task({ id: 'pt', is_project: false }),
      task({ id: 's', parent_id: 'pt', due_date: isoDateIn(0) }),
    ]
    expect(buildAttention({ ...base, tasks }, prefs)).toHaveLength(0)
  })
})

describe('buildAttention — whose tasks reach Today', () => {
  const task = (over = {}) => ({
    id: 't',
    title: 'A',
    assignee: 'anyone',
    priority: 0,
    due_date: isoDateIn(0),
    ...over,
  })
  const keys = (tasks, memberId, opts) =>
    buildAttention({ ...base, tasks }, prefs, [], memberId, Date.now(), opts).map((i) => i.key)

  it('keeps my own tasks and anything left open to anyone', () => {
    const tasks = [
      task({ id: 'mine', assignee: 'm1' }),
      task({ id: 'open', assignee: 'anyone' }),
      task({ id: 'none', assignee: null }),
    ]
    expect(keys(tasks, 'm1')).toEqual(['task:mine', 'task:open', 'task:none'])
  })

  it("drops another member's task — it's theirs, not yours", () => {
    expect(keys([task({ id: 'hers', assignee: 'm2' })], 'm1')).toEqual([])
  })

  it('taskScope "all" opts back into the whole household', () => {
    const tasks = [task({ id: 'hers', assignee: 'm2' })]
    expect(keys(tasks, 'm1', { taskScope: 'all' })).toEqual(['task:hers'])
  })

  it('without a member id (demo/no session) nothing is filtered out', () => {
    expect(keys([task({ id: 'hers', assignee: 'm2' })], null)).toEqual(['task:hers'])
  })

  it("a project step with no assignee of its own inherits the project's owner", () => {
    const tasks = [
      task({ id: 'p', is_project: true, assignee: 'm2', due_date: null }),
      task({ id: 's', parent_id: 'p', assignee: null }),
    ]
    expect(keys(tasks, 'm1')).toEqual([]) // her project, her step
    expect(keys(tasks, 'm2')).toEqual(['task:s'])
  })

  it('a project step assigned to me stays mine, whoever owns the project', () => {
    const tasks = [
      task({ id: 'p', is_project: true, assignee: 'm2', due_date: null }),
      task({ id: 's', parent_id: 'p', assignee: 'm1' }),
    ]
    expect(keys(tasks, 'm1')).toEqual(['task:s'])
  })

  // Regression: without a normalizer the legacy labels match no member id, so
  // every task filters out and Today comes up completely empty. Caught in the
  // demo, where most seed rows still carry 'me' / 'either'.
  it('resolves legacy me/partner/either labels through the injected normalizer', () => {
    const normalizeAssignee = (v) =>
      !v || v === 'either' || v === 'anyone'
        ? 'anyone'
        : v === 'me'
          ? 'm1'
          : v === 'partner'
            ? 'm2'
            : v
    const tasks = [
      task({ id: 'legacy-mine', assignee: 'me' }),
      task({ id: 'legacy-open', assignee: 'either' }),
      task({ id: 'legacy-hers', assignee: 'partner' }),
    ]
    expect(keys(tasks, 'm1', { normalizeAssignee })).toEqual([
      'task:legacy-mine',
      'task:legacy-open',
    ])
  })

  it('the badge counts the same scoped set the list shows', () => {
    const tasks = [task({ id: 'mine', assignee: 'm1' }), task({ id: 'hers', assignee: 'm2' })]
    const items = buildAttention({ ...base, tasks }, prefs, [], 'm1')
    expect(badgeCount(items)).toBe(1)
  })
})
