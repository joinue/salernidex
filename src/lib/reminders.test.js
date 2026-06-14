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
