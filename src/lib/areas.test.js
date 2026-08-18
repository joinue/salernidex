import { describe, it, expect } from 'vitest'
import {
  ALL_AREAS,
  areaById,
  areaCounts,
  areaForNewItem,
  isDefaultPrivate,
  mutedAreaIds,
  privacyForNewItem,
  reachesToday,
  resolveAreaId,
  scopeToArea,
  sortAreas,
  visibleAreas,
} from './areas'
import { moveUpdates } from './order'

const ME = 'user-me'
const THEM = 'user-them'

const area = (id, extra = {}) => ({
  id,
  name: id,
  shared: false,
  default_private: false,
  show_on_today: true,
  created_by: ME,
  created_at: '2026-01-01T00:00:00.000Z',
  ...extra,
})

describe('sortAreas', () => {
  it('ranks by sort_order, then creation', () => {
    const rows = [
      area('c', { sort_order: 2 }),
      area('a', { sort_order: 1 }),
      area('b', { sort_order: 1.5 }),
    ]
    expect(sortAreas(rows).map((a) => a.id)).toEqual(['a', 'b', 'c'])
  })

  it('sinks never-placed areas below ranked ones, oldest first', () => {
    const rows = [
      area('new', { created_at: '2026-03-01T00:00:00.000Z' }),
      area('ranked', { sort_order: 5 }),
      area('old', { created_at: '2026-02-01T00:00:00.000Z' }),
    ]
    expect(sortAreas(rows).map((a) => a.id)).toEqual(['ranked', 'old', 'new'])
  })

  it('does not mutate its input', () => {
    const rows = [area('b', { sort_order: 2 }), area('a', { sort_order: 1 })]
    sortAreas(rows)
    expect(rows.map((a) => a.id)).toEqual(['b', 'a'])
  })
})

describe('visibleAreas', () => {
  it('offers my own areas and shared ones, but not a co-member’s private area', () => {
    const rows = [
      area('mine'),
      area('theirs', { created_by: THEM }),
      area('ours', { created_by: THEM, shared: true }),
    ]
    expect(visibleAreas(rows, ME).map((a) => a.id)).toEqual(['mine', 'ours'])
  })

  it('drops archived areas', () => {
    const rows = [area('live'), area('old', { archived_at: '2026-05-01T00:00:00.000Z' })]
    expect(visibleAreas(rows, ME).map((a) => a.id)).toEqual(['live'])
  })

  it('keeps areas with no creator — backfilled and demo rows are never stranded', () => {
    expect(visibleAreas([area('orphan', { created_by: null })], ME).map((a) => a.id)).toEqual([
      'orphan',
    ])
  })

  it('returns them sorted', () => {
    const rows = [area('b', { sort_order: 2 }), area('a', { sort_order: 1 })]
    expect(visibleAreas(rows, ME).map((a) => a.id)).toEqual(['a', 'b'])
  })
})

describe('areaById', () => {
  const rows = [area('work'), area('home')]

  it('finds an area', () => {
    expect(areaById(rows, 'home')?.name).toBe('home')
  })

  it('returns null for the All sentinel, nullish, and a stale id', () => {
    expect(areaById(rows, ALL_AREAS)).toBe(null)
    expect(areaById(rows, null)).toBe(null)
    expect(areaById(rows, 'deleted')).toBe(null)
  })
})

describe('resolveAreaId', () => {
  const rows = [area('work'), area('theirs', { created_by: THEM })]

  it('keeps a selection that is still visible', () => {
    expect(resolveAreaId(rows, 'work', ME)).toBe('work')
  })

  it('falls back to All when the area is gone', () => {
    expect(resolveAreaId(rows, 'deleted', ME)).toBe(ALL_AREAS)
  })

  it('falls back to All when the area is archived out from under you', () => {
    const archived = [area('work', { archived_at: '2026-05-01T00:00:00.000Z' })]
    expect(resolveAreaId(archived, 'work', ME)).toBe(ALL_AREAS)
  })

  it('falls back when a co-member un-shares an area you were viewing', () => {
    expect(resolveAreaId(rows, 'theirs', ME)).toBe(ALL_AREAS)
  })

  it('passes All and nullish through', () => {
    expect(resolveAreaId(rows, ALL_AREAS, ME)).toBe(ALL_AREAS)
    expect(resolveAreaId(rows, null, ME)).toBe(ALL_AREAS)
  })
})

describe('scopeToArea', () => {
  const rows = [
    { id: '1', area_id: 'work' },
    { id: '2', area_id: 'home' },
    { id: '3', area_id: null },
    { id: '4' },
  ]

  it('separates the area’s rows from the unfiled ones', () => {
    const { scoped, unfiled } = scopeToArea(rows, 'work')
    expect(scoped.map((r) => r.id)).toEqual(['1'])
    expect(unfiled.map((r) => r.id)).toEqual(['3', '4'])
  })

  it('never leaks another area’s rows into either bucket', () => {
    const { scoped, unfiled } = scopeToArea(rows, 'work')
    expect([...scoped, ...unfiled].map((r) => r.id)).not.toContain('2')
  })

  it('puts everything in scoped under All, with nothing unfiled to distinguish', () => {
    const { scoped, unfiled } = scopeToArea(rows, ALL_AREAS)
    expect(scoped).toHaveLength(4)
    expect(unfiled).toEqual([])
  })

  it('treats nullish as All', () => {
    expect(scopeToArea(rows, null).scoped).toHaveLength(4)
  })
})

describe('areaForNewItem', () => {
  it('files into the active lens', () => {
    expect(areaForNewItem('work')).toBe('work')
  })

  it('files nowhere under All rather than guessing', () => {
    expect(areaForNewItem(ALL_AREAS)).toBe(null)
    expect(areaForNewItem(null)).toBe(null)
  })
})

describe('isDefaultPrivate', () => {
  it('applies on an unshared area', () => {
    expect(isDefaultPrivate(area('work', { default_private: true }))).toBe(true)
  })

  it('is ignored once the area is shared — a shared private-by-default area is a contradiction', () => {
    expect(isDefaultPrivate(area('home', { default_private: true, shared: true }))).toBe(false)
  })

  it('is false when unset, and safe on no area at all', () => {
    expect(isDefaultPrivate(area('work'))).toBe(false)
    expect(isDefaultPrivate(null)).toBe(false)
  })
})

describe('privacyForNewItem', () => {
  it('makes a new item private when the area says so', () => {
    expect(privacyForNewItem(area('work', { default_private: true }), 'shared')).toBe('private')
  })

  // A fallthrough, not an override — and this is why the column is a boolean:
  // the non-private default differs by entity, so the caller keeps its own.
  it('otherwise hands back the caller’s own default, whatever it is', () => {
    expect(privacyForNewItem(area('home'), 'shared')).toBe('shared')
    expect(privacyForNewItem(area('home'), 'family_shared')).toBe('family_shared')
  })

  it('ignores default_private once the area is shared', () => {
    const a = area('home', { default_private: true, shared: true })
    expect(privacyForNewItem(a, 'family_shared')).toBe('family_shared')
  })

  it('is safe with no area at all — an unfiled item just uses the default', () => {
    expect(privacyForNewItem(null, 'shared')).toBe('shared')
  })
})

describe('mutedAreaIds / reachesToday', () => {
  it('collects the areas switched off Today', () => {
    const muted = mutedAreaIds([area('work', { show_on_today: false }), area('home')])
    expect([...muted]).toEqual(['work'])
  })

  // The safe direction for a rule that HIDES things: a row predating 0040, or
  // one written by a client that never learned the column, still reaches Today.
  it('treats a missing show_on_today as "reaches Today"', () => {
    const a = area('legacy')
    delete a.show_on_today
    expect(mutedAreaIds([a]).size).toBe(0)
  })

  it('hides a row filed in a muted area', () => {
    const muted = mutedAreaIds([area('work', { show_on_today: false })])
    expect(reachesToday({ area_id: 'work' }, muted)).toBe(false)
    expect(reachesToday({ area_id: 'home' }, muted)).toBe(true)
  })

  it('never hides an unfiled row — it has no area to be silenced by', () => {
    const muted = mutedAreaIds([area('work', { show_on_today: false })])
    expect(reachesToday({ area_id: null }, muted)).toBe(true)
    expect(reachesToday({}, muted)).toBe(true)
  })

  it('is a no-op when nothing is muted', () => {
    expect(reachesToday({ area_id: 'work' }, new Set())).toBe(true)
    expect(reachesToday({ area_id: 'work' }, undefined)).toBe(true)
  })
})

describe('areaCounts', () => {
  it('tallies per area and ignores unfiled rows', () => {
    const counts = areaCounts([
      { area_id: 'work' },
      { area_id: 'work' },
      { area_id: 'home' },
      { area_id: null },
      {},
    ])
    expect(counts.get('work')).toBe(2)
    expect(counts.get('home')).toBe(1)
    expect(counts.size).toBe(2)
  })

  it('is empty for no rows', () => {
    expect(areaCounts().size).toBe(0)
  })
})

// The Areas manager drags rows through visibleAreas → moveUpdates →
// reorderAreas. Each half is covered on its own; this pins the composition,
// because "I dragged it and it went back" is the failure people report and
// neither half's tests would catch a seam between them.
describe('dragging an area to a new rank', () => {
  // Mirrors useData.reorderAreas applying its updates to local state.
  const apply = (areas, updates) => {
    const byId = new Map(updates.map((u) => [u.id, u.sort_order]))
    return areas.map((a) => (byId.has(a.id) ? { ...a, sort_order: byId.get(a.id) } : a))
  }
  const drag = (areas, from, to) => {
    const shown = visibleAreas(areas, ME)
    return visibleAreas(apply(areas, moveUpdates(shown, from, to)), ME).map((a) => a.id)
  }
  const dated = (id, n, extra) => area(id, { created_at: `2026-01-0${n}T00:00:00.000Z`, ...extra })

  // Every area AreaForm creates starts unranked (addArea stamps sort_order
  // null), so the very first drag anyone performs takes the normalize path.
  it('places the row on a list that was never manually ordered', () => {
    const areas = [dated('a', 1), dated('b', 2), dated('c', 3)]
    expect(drag(areas, 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('places the row on an already-ranked list, in both directions', () => {
    const areas = [
      dated('a', 1, { sort_order: 1 }),
      dated('b', 2, { sort_order: 2 }),
      dated('c', 3, { sort_order: 3 }),
    ]
    expect(drag(areas, 2, 0)).toEqual(['c', 'a', 'b'])
    expect(drag(areas, 0, 2)).toEqual(['b', 'c', 'a'])
  })

  // The manager hides archived areas but they keep their ranks, so a normalize
  // pass over the visible ones can hand out numbers an archived row already
  // holds. Unarchiving must not then reshuffle what you arranged.
  it('is not disturbed by an archived area holding a rank', () => {
    const areas = [
      dated('a', 1, { sort_order: 1 }),
      dated('b', 2, { sort_order: 2, archived_at: '2026-02-01T00:00:00.000Z' }),
      dated('c', 3, { sort_order: 3 }),
    ]
    expect(drag(areas, 1, 0)).toEqual(['c', 'a'])
  })

  // A shared area someone else made is offered to you and is draggable like
  // any other — the rank is the household's, not its author's.
  it('places a shared area made by someone else', () => {
    const areas = [dated('a', 1), dated('b', 2, { created_by: THEM, shared: true }), dated('c', 3)]
    expect(drag(areas, 0, 2)).toEqual(['b', 'c', 'a'])
  })
})
