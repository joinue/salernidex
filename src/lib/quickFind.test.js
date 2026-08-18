import { describe, it, expect } from 'vitest'
import { buildIndex, searchIndex, groupResults, TYPE_LABELS } from './quickFind'

// Quick Find's real contract isn't the ranking — it's coverage. A destination
// the index doesn't know about is a page ⌘K silently pretends doesn't exist,
// and nothing else in the app fails when that happens. Habits, Notes and
// Projects were all missing this way, so these tests pin the register.

const data = {
  people: [
    { id: 'p1', name: 'Ana Reyes', tags: ['climbing'] },
    { id: 'p2', name: 'Gone', deleted_at: '2026-01-01' },
  ],
  orgs: [{ id: 'o1', name: 'Northwind Instruments', type: 'Vendor' }],
  groups: [{ id: 'g1', name: 'Climbing crew', any_tags: ['climbing'] }],
  tasks: [
    { id: 't1', title: 'Take out the bins' },
    { id: 't2', title: 'Kitchen remodel', is_project: true },
    { id: 't3', title: 'Structure', is_heading: true },
    { id: 't4', title: 'Already done', completed_at: '2026-06-01' },
  ],
  lists: [{ id: 'l1', name: 'Groceries', icon: '🛒' }],
  listItems: [{ id: 'i1', list_id: 'l1', text: 'Oat milk' }],
  notes: [{ id: 'n1', title: 'Trip planning', body: '<p>book the cabin</p>', tags: [] }],
  habits: [
    { id: 'h1', name: 'Morning run', unit: 'miles', active_days: [] },
    { id: 'h2', name: 'Retired habit', active_days: [], archived_at: '2026-05-01' },
  ],
  sharedHabits: [{ id: 'h3', name: 'Rita reading', active_days: [] }],
  affiliations: [],
}

const find = (q) => searchIndex(buildIndex(data), q)
const first = (q) => find(q)[0]

describe('buildIndex — coverage', () => {
  it('indexes every entity type the app can open', () => {
    const types = new Set(buildIndex(data).map((e) => e.type))
    for (const type of ['person', 'project', 'task', 'list', 'note', 'habit', 'org', 'group'])
      expect(types).toContain(type)
  })

  it('offers every index page as a destination', () => {
    const routes = buildIndex(data)
      .filter((e) => e.type === 'nav')
      .map((e) => e.route)
    // '' is Today. Every other index screen in the shell belongs here.
    for (const route of [
      '',
      'tasks',
      'projects',
      'lists',
      'notes',
      'habits',
      'people',
      'activity',
      'relationships',
      'orgs',
      'groups',
      'import',
      'settings',
    ])
      expect(routes).toContain(route)
  })

  it('offers a create action for everything the ➕ can make', () => {
    const actions = buildIndex(data)
      .filter((e) => e.type === 'action')
      .map((e) => e.action)
    expect(actions).toEqual(
      expect.arrayContaining([
        'person',
        'task',
        'note',
        'list',
        'habit',
        'org',
        'group',
        'relationship',
      ]),
    )
  })

  it('gives every indexed type a section label', () => {
    for (const type of new Set(buildIndex(data).map((e) => e.type)))
      expect(TYPE_LABELS[type]).toBeTruthy()
  })

  it('leaves out what has no page to land on', () => {
    const ids = buildIndex(data).map((e) => e.id)
    expect(ids).not.toContain('p2') // deleted person
    expect(ids).not.toContain('t3') // heading — structure, not a destination
    expect(ids).not.toContain('t4') // completed task
  })
})

describe('buildIndex — habits', () => {
  it('finds a habit by name', () => {
    expect(first('morning run')).toMatchObject({ type: 'habit', id: 'h1' })
  })

  it('includes a housemate’s shared habit, which has a page of its own', () => {
    expect(first('rita reading')).toMatchObject({ type: 'habit', id: 'h3' })
  })

  it('keeps an archived habit findable and says so', () => {
    const hit = first('retired habit')
    expect(hit).toMatchObject({ type: 'habit', id: 'h2' })
    expect(hit.sub).toMatch(/^Archived/)
  })

  it('describes a live habit by its cadence', () => {
    expect(first('morning run').sub).toBe('Daily')
  })
})

describe('searchIndex / groupResults', () => {
  it('requires every query word to match somewhere', () => {
    expect(find('ana reyes')).toHaveLength(1)
    expect(find('ana nonsense')).toHaveLength(0)
  })

  it('finds a list by what is on it', () => {
    expect(first('oat milk')).toMatchObject({ type: 'list', id: 'l1' })
  })

  it('finds a note by its body', () => {
    expect(first('cabin')).toMatchObject({ type: 'note', id: 'n1' })
  })

  it('groups hits into labeled sections without exceeding the caps', () => {
    const sections = groupResults(find('a'), { perType: 2, max: 4 })
    expect(sections.every((s) => s.label)).toBe(true)
    expect(sections.every((s) => s.items.length <= 2)).toBe(true)
    expect(sections.flatMap((s) => s.items).length).toBeLessThanOrEqual(4)
  })

  it('returns nothing for an empty query', () => {
    expect(find('   ')).toEqual([])
  })
})

// Search never narrows to the active lens (§3.6), which only works if a result
// from another area can say where it came from. Without this the global search
// reads as a broken filter.
describe('buildIndex — areas on results', () => {
  const filed = {
    ...data,
    areas: [{ id: 'a-work', name: 'Work', icon: '💼', color: '#48f' }],
    tasks: [{ id: 't1', title: 'Take out the bins', area_id: 'a-work' }],
    lists: [{ id: 'l1', name: 'Groceries', area_id: 'a-work' }],
    notes: [{ id: 'n1', title: 'Trip planning', body: '', tags: [], area_id: 'a-work' }],
  }

  it('names the area on every entity that can be filed in one', () => {
    const byId = new Map(buildIndex(filed).map((e) => [e.id, e]))
    for (const id of ['t1', 'l1', 'n1']) expect(byId.get(id).area.name).toBe('Work')
  })

  it('leaves the area off things that carry none', () => {
    const byId = new Map(buildIndex(filed).map((e) => [e.id, e]))
    expect(byId.get('p1').area).toBeUndefined()
    expect(byId.get('h1').area).toBeUndefined()
  })

  it('survives a household with no areas at all', () => {
    const byId = new Map(buildIndex(data).map((e) => [e.id, e]))
    expect(byId.get('t1').area).toBeNull()
  })

  it('drops an area_id pointing at an area that is gone', () => {
    const stale = { ...filed, areas: [] }
    const byId = new Map(buildIndex(stale).map((e) => [e.id, e]))
    expect(byId.get('t1').area).toBeNull()
  })
})
