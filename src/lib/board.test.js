import { describe, it, expect } from 'vitest'
import {
  boardDates,
  boardHabits,
  boardLists,
  boardMeals,
  boardReminders,
  boardTasks,
  boardUnscheduled,
  buildBoard,
} from './board'
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

describe('boardLists', () => {
  it('groups open items per list and drops the ones with nothing on them', () => {
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
    const out = boardLists(lists, items)
    expect(out.map((g) => g.list.name)).toEqual(['Groceries', 'Packing'])
    expect(out[0].items.map((i) => i.text)).toEqual(['Milk'])
  })

  // The gap this function was widened to close: a household checklist that
  // isn't groceries is still a household checklist.
  it('includes a standard list, not just grocery', () => {
    const out = boardLists(
      [{ id: 's', kind: 'standard', name: 'Hardware store' }],
      [{ id: '1', list_id: 's', text: 'Hinges' }],
    )
    expect(out.map((g) => g.list.name)).toEqual(['Hardware store'])
  })

  it('excludes a meal plan (Dinner already shows it) and a collection (never done)', () => {
    const lists = [
      { id: 'm', kind: 'meal_plan', name: 'This week' },
      { id: 'c', kind: 'collection', name: 'Favourite restaurants' },
    ]
    const items = [
      { id: '1', list_id: 'm', text: 'Tacos' },
      { id: '2', list_id: 'c', text: 'The Ivy' },
    ]
    expect(boardLists(lists, items)).toEqual([])
  })

  it('drops headings and a private list', () => {
    expect(
      boardLists(
        [{ id: 'g', kind: 'grocery', privacy_level: 'private' }],
        [{ id: '1', list_id: 'g', text: 'Milk' }],
      ),
    ).toEqual([])
    expect(
      boardLists(
        [{ id: 'g', kind: 'grocery', name: 'Groceries' }],
        [{ id: '1', list_id: 'g', text: 'Dairy', is_heading: true }],
      ),
    ).toEqual([])
  })
})

describe('boardUnscheduled', () => {
  const chore = (over = {}) => ({
    id: 'u',
    title: 'Fix the gate',
    due_date: null,
    completed_at: null,
    assignee: 'm-2',
    ...over,
  })

  it('keeps undated work that has a name against it', () => {
    expect(boardUnscheduled([chore()]).map((t) => t.id)).toEqual(['u'])
  })

  it('drops unassigned undated work — that is a Tasks-page problem', () => {
    const out = boardUnscheduled([
      chore({ id: 'mine', assignee: 'm-1' }),
      chore({ id: 'nobody', assignee: 'anyone' }),
      chore({ id: 'null', assignee: null }),
    ])
    expect(out.map((t) => t.id)).toEqual(['mine'])
  })

  it('leaves dated work to boardTasks, so nothing appears on two cards', () => {
    const out = boardUnscheduled([
      chore({ id: 'today', due_date: isoDateIn(0) }),
      chore({ id: 'late', due_date: isoDateIn(-2) }),
      chore({ id: 'undated' }),
    ])
    expect(out.map((t) => t.id)).toEqual(['undated'])
  })

  it('drops deferred, private, completed, headings and containers', () => {
    const out = boardUnscheduled([
      chore({ id: 'parked', start_date: isoDateIn(3) }),
      chore({ id: 'secret', privacy_level: 'private' }),
      chore({ id: 'done', completed_at: '2026-08-13' }),
      chore({ id: 'heading', is_heading: true }),
      chore({ id: 'project', is_project: true }),
      chore({ id: 'real' }),
    ])
    expect(out.map((t) => t.id)).toEqual(['real'])
  })
})

describe('boardReminders', () => {
  const rem = (over = {}) => ({
    id: 'r',
    title: 'Bins go out',
    due_date: isoDateIn(0),
    completed_at: null,
    is_reminder: true,
    ...over,
  })

  it('shows reminders due today and ones already past, soonest last', () => {
    const out = boardReminders([
      rem({ id: 'today', due_date: isoDateIn(0) }),
      rem({ id: 'late', due_date: isoDateIn(-2) }),
    ])
    expect(out.map((r) => r.source.id)).toEqual(['late', 'today'])
  })

  it('does not look ahead — tomorrow is not the board’s business', () => {
    expect(boardReminders([rem({ due_date: isoDateIn(1) })])).toEqual([])
  })

  it('drops done, private and undated reminders', () => {
    const out = boardReminders([
      rem({ id: 'done', completed_at: '2026-08-13' }),
      rem({ id: 'secret', privacy_level: 'private' }),
      rem({ id: 'someday', due_date: null }),
      rem({ id: 'real' }),
    ])
    expect(out.map((r) => r.source.id)).toEqual(['real'])
  })

  // Birthdays reach the board through boardDates. If they came through here as
  // well, every birthday would be on two cards at once.
  it('carries no derived contact dates', () => {
    const out = boardReminders([])
    expect(out).toEqual([])
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
