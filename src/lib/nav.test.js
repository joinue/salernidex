import { describe, it, expect } from 'vitest'
import {
  ACTION,
  BAR,
  BARLESS_ROUTES,
  DESTINATIONS,
  DETAIL_ROUTES,
  INSIGHTS,
  KNOWN_ROUTES,
  MENU,
  NO_FAB_ROUTES,
  NO_TABBAR_ROUTES,
  barFor,
  destinationGroups,
} from './nav'

const ids = new Set(DESTINATIONS.map((d) => d.id))

describe('destinations', () => {
  it('has unique ids and a label + icon for every one', () => {
    expect(ids.size).toBe(DESTINATIONS.length)
    for (const d of DESTINATIONS) {
      expect(d.label, d.id).toBeTruthy()
      expect(d.icon, d.id).toBeTruthy()
    }
  })

  it('names a real route, unless it is still pending', () => {
    for (const d of DESTINATIONS) {
      if (d.pending) continue
      expect(KNOWN_ROUTES, d.id).toContain(d.id)
    }
  })

  it('gives the red attention badge to exactly one destination', () => {
    expect(DESTINATIONS.filter((d) => d.badge).map((d) => d.id)).toEqual(['today'])
  })

  it('groups every destination, in sidebar order, losing none', () => {
    const groups = destinationGroups()
    expect(groups.map((g) => g.label)).toEqual([null, 'Contacts', 'System'])
    expect(groups.flatMap((g) => g.items)).toEqual(DESTINATIONS)
  })
})

// The rules the bar is built on. They exist as tests because the last bar went
// four features without being revisited, and nothing failed when it drifted.
describe('bottom bar', () => {
  const rows = Object.entries(BAR)

  it('gives every route either a bar or an explicit exemption', () => {
    for (const route of KNOWN_ROUTES) {
      // The kitchen display renders before the shell — it has no chrome at all.
      if (route === 'board') continue
      const listed = route in BAR || BARLESS_ROUTES.includes(route)
      expect(listed, `${route} is in neither BAR nor BARLESS_ROUTES`).toBe(true)
    }
  })

  it('never both places and exempts the same route', () => {
    for (const route of BARLESS_ROUTES) expect(BAR, route).not.toHaveProperty(route)
  })

  it('is five slots wide everywhere, with the action dead centre', () => {
    for (const [route, slots] of rows) {
      expect(slots.length, route).toBe(5)
      expect(slots[2], route).toBe(ACTION)
    }
  })

  it('opens with Today and closes with the menu, on every page', () => {
    for (const [route, slots] of rows) {
      expect(slots[0], route).toBe('today')
      expect(slots[4], route).toBe(MENU)
    }
  })

  it('never offers a page a link to itself, except Today marking where you are', () => {
    for (const [route, slots] of rows) {
      const links = slots.slice(1).filter((s) => s !== ACTION && s !== MENU)
      expect(links, route).not.toContain(route)
    }
  })

  it('only ever places a real destination', () => {
    for (const [route, slots] of rows) {
      for (const slot of slots) {
        if (slot === ACTION || slot === MENU || slot === INSIGHTS) continue
        expect(ids.has(slot), `${route}: unknown destination "${slot}"`).toBe(true)
      }
    }
  })

  // The one that makes a contextual bar usable: Lists is always the fourth
  // thing, Tasks is always the second. Without it you have to read the bar
  // before every tap, which is most of what a fixed bar was buying you.
  it('keeps every destination in the same slot wherever it appears', () => {
    const seen = new Map()
    for (const [route, slots] of rows) {
      slots.forEach((slot, i) => {
        if (slot === ACTION || slot === MENU) return
        if (!seen.has(slot)) return seen.set(slot, { i, route })
        const first = seen.get(slot)
        expect(
          i,
          `"${slot}" sits at slot ${i + 1} on ${route} but slot ${first.i + 1} on ${first.route}`,
        ).toBe(first.i)
      })
    }
  })

  it('resolves a bar per route, and null for the pages that opt out', () => {
    expect(barFor('tasks')).toBe(BAR.tasks)
    expect(barFor('project')).toBeNull()
    expect(barFor('note')).toBeNull()
    // An unknown hash lands on Today, so its chrome should too.
    expect(barFor('nonsense')).toBe(BAR.today)
    expect(barFor(undefined)).toBeNull()
  })
})

// The icon names live here and the components live in components/shell — the
// price of keeping this module out of the view layer. This is what keeps that
// price at zero.
describe('icons', () => {
  it('has a component for every icon a destination names', async () => {
    const { NAV_ICONS } = await import('../components/shell/navIcons')
    for (const d of DESTINATIONS) {
      expect(NAV_ICONS[d.icon], `${d.id} names a missing icon "${d.icon}"`).toBeTruthy()
    }
  })
})

describe('route lists', () => {
  it('only names known routes', () => {
    for (const list of [DETAIL_ROUTES, NO_FAB_ROUTES, NO_TABBAR_ROUTES, BARLESS_ROUTES]) {
      for (const route of list) expect(KNOWN_ROUTES).toContain(route)
    }
  })

  it('hides the bar wherever it hides the tabs', () => {
    for (const route of NO_TABBAR_ROUTES) expect(BARLESS_ROUTES).toContain(route)
  })
})
