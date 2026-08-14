import { describe, it, expect } from 'vitest'
import { boardDates, boardHabits, boardMeals, boardShopping, boardTasks, buildBoard } from './board'
import { isoDateIn } from './tasks'

const task = (over = {}) => ({
  id: 't',
  title: 'Task',
  due_date: isoDateIn(0),
  completed_at: null,
  ...over,
})

describe('boardTasks', () => {
  it('keeps what is due today or overdue', () => {
    const out = boardTasks([
      task({ id: 'today', due_date: isoDateIn(0) }),
      task({ id: 'late', due_date: isoDateIn(-2) }),
      task({ id: 'tomorrow', due_date: isoDateIn(1) }),
      task({ id: 'undated', due_date: null }),
    ])
    expect(out.map((t) => t.id)).toEqual(['late', 'today'])
  })

  it('drops private rows — the board hangs where anyone can read it', () => {
    const out = boardTasks([task({ id: 'open' }), task({ id: 'secret', privacy_level: 'private' })])
    expect(out.map((t) => t.id)).toEqual(['open'])
  })

  it('drops completed, headings and project containers', () => {
    const out = boardTasks([
      task({ id: 'done', completed_at: '2026-08-13T00:00:00Z' }),
      task({ id: 'heading', is_heading: true }),
      task({ id: 'project', is_project: true }),
      task({ id: 'real' }),
    ])
    expect(out.map((t) => t.id)).toEqual(['real'])
  })

  it('leaves a deferred task parked even when its due date has landed', () => {
    // taskBucket puts start_date in the future above everything else.
    const out = boardTasks([task({ id: 'parked', start_date: isoDateIn(3) })])
    expect(out).toEqual([])
  })

  it('is household scope — someone else’s task still shows', () => {
    const out = boardTasks([task({ id: 'hers', assignee: 'm-2' })])
    expect(out.map((t) => t.id)).toEqual(['hers'])
  })

  it('puts overdue above today, oldest first', () => {
    const out = boardTasks([
      task({ id: 'today', due_date: isoDateIn(0) }),
      task({ id: 'late-1', due_date: isoDateIn(-1) }),
      task({ id: 'late-5', due_date: isoDateIn(-5) }),
    ])
    expect(out.map((t) => t.id)).toEqual(['late-5', 'late-1', 'today'])
  })
})

describe('boardMeals', () => {
  const lists = [
    { id: 'mp', kind: 'meal_plan' },
    { id: 'std', kind: 'standard' },
  ]

  it("returns tonight's meals from every meal plan", () => {
    const items = [
      { id: 'a', list_id: 'mp', text: 'Tacos', on_date: '2026-08-13' },
      { id: 'b', list_id: 'mp', text: 'Curry', on_date: '2026-08-14' },
      { id: 'c', list_id: 'std', text: 'Not a meal', on_date: '2026-08-13' },
    ]
    expect(boardMeals(lists, items, '2026-08-13').map((i) => i.text)).toEqual(['Tacos'])
  })

  it('skips a private meal plan', () => {
    const items = [{ id: 'a', list_id: 'mp', text: 'Tacos', on_date: '2026-08-13' }]
    const priv = [{ id: 'mp', kind: 'meal_plan', privacy_level: 'private' }]
    expect(boardMeals(priv, items, '2026-08-13')).toEqual([])
  })

  it('skips a meal already made', () => {
    const items = [
      { id: 'a', list_id: 'mp', text: 'Tacos', on_date: '2026-08-13', checked_at: '2026-08-13' },
    ]
    expect(boardMeals(lists, items, '2026-08-13')).toEqual([])
  })
})

describe('boardShopping', () => {
  it('groups open items by grocery list and drops empty ones', () => {
    const lists = [
      { id: 'g1', kind: 'grocery', name: 'Groceries' },
      { id: 'g2', kind: 'grocery', name: 'Costco' },
      { id: 's', kind: 'standard', name: 'Packing' },
    ]
    const items = [
      { id: '1', list_id: 'g1', text: 'Milk' },
      { id: '2', list_id: 'g1', text: 'Eggs', checked_at: '2026-08-13' },
      { id: '3', list_id: 's', text: 'Socks' },
    ]
    const out = boardShopping(lists, items)
    expect(out).toHaveLength(1)
    expect(out[0].list.name).toBe('Groceries')
    expect(out[0].items.map((i) => i.text)).toEqual(['Milk'])
  })

  it('drops a private grocery list', () => {
    const lists = [{ id: 'g', kind: 'grocery', privacy_level: 'private' }]
    expect(boardShopping(lists, [{ id: '1', list_id: 'g', text: 'Milk' }])).toEqual([])
  })
})

describe('boardDates', () => {
  it('excludes deleted and private people', () => {
    const soon = isoDateIn(3)
    const [, m, d] = soon.split('-')
    const people = [
      { id: 'p1', name: 'Ana', birthday: `1990-${m}-${d}` },
      { id: 'p2', name: 'Ghost', birthday: `1990-${m}-${d}`, deleted_at: '2026-01-01' },
      { id: 'p3', name: 'Hidden', birthday: `1990-${m}-${d}`, privacy_level: 'private' },
    ]
    expect(boardDates(people, []).map((e) => e.person.name)).toEqual(['Ana'])
  })
})

describe('boardHabits', () => {
  it('shows ONLY habits explicitly shared — an unshared one is private', () => {
    const mine = [
      { id: 'h1', name: 'Walk 8k', shared: true },
      { id: 'h2', name: 'Alcohol-free' }, // never on a kitchen screen
      { id: 'h3', name: 'Mood (1–5)', shared: false },
    ]
    expect(boardHabits(mine, []).map((h) => h.name)).toEqual(['Walk 8k'])
  })

  it('includes another member’s shared habits — the board is household scope', () => {
    const out = boardHabits(
      [{ id: 'a', name: 'Mine', shared: true }],
      [{ id: 'b', name: 'Theirs', shared: true }],
    )
    expect(out.map((h) => h.name)).toEqual(['Mine', 'Theirs'])
  })

  it('tolerates missing arrays', () => {
    expect(boardHabits()).toEqual([])
  })
})

describe('buildBoard', () => {
  it('reports empty when every card is', () => {
    const board = buildBoard(
      { tasks: [], lists: [], listItems: [], people: [], keyDates: [], habits: [] },
      '2026-08-13',
    )
    expect(board.empty).toBe(true)
  })

  it('is not empty once anything lands, and applies the habit sharing rule', () => {
    const board = buildBoard(
      {
        tasks: [],
        lists: [],
        listItems: [],
        people: [],
        keyDates: [],
        habits: [
          { id: 'h1', name: 'Walk', shared: true },
          { id: 'h2', name: 'Journal' },
        ],
        sharedHabits: [{ id: 'h3', name: 'Their run', shared: true }],
      },
      '2026-08-13',
    )
    expect(board.empty).toBe(false)
    expect(board.habits.map((h) => h.name)).toEqual(['Walk', 'Their run'])
  })
})
