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
  barFor,
  deepLinkPath,
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

  // Settings and Import / Export are routes but not destinations: they sit
  // behind the account avatar, top right, with the theme and Logout. Rare and
  // destructive things belong in the corner hardest to reach by accident — at the
  // foot of the drawer they had the easiest spot on the screen instead.
  it('leaves account business out of the destination list', () => {
    expect([...ids]).not.toContain('settings')
    expect([...ids]).not.toContain('import')
    // Still routes, though — the menu navigates to them.
    expect(KNOWN_ROUTES).toContain('settings')
    expect(KNOWN_ROUTES).toContain('import')
  })

  it('gives the red attention badge to exactly one destination', () => {
    expect(DESTINATIONS.filter((d) => d.badge).map((d) => d.id)).toEqual(['today'])
  })

  it('groups every destination, in sidebar order, losing none', () => {
    const groups = destinationGroups()
    expect(groups.map((g) => g.label)).toEqual([null, 'Contacts'])
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
    for (const list of [DETAIL_ROUTES, BARLESS_ROUTES]) {
      for (const route of list) expect(KNOWN_ROUTES).toContain(route)
    }
  })

  // A barless page has no create either, since the create lives in the bar. So
  // every one of them needs its own way out — a NavBar back, or its own button.
  // Nothing here may be a top-level browsing screen.
  it('never leaves a barless page without a route out', () => {
    for (const route of BARLESS_ROUTES) {
      expect(BAR, `${route} has both a bar and an exemption`).not.toHaveProperty(route)
    }
  })
})

describe('deepLinkPath', () => {
  it('recognises a link to one specific thing', () => {
    expect(deepLinkPath('#/list/l1')).toBe('list/l1')
    expect(deepLinkPath('#/task/t1')).toBe('task/t1')
    expect(deepLinkPath('#/note/n1')).toBe('note/n1')
    // The leading slash is optional in the wild; both forms are real hashes.
    expect(deepLinkPath('#task/t1')).toBe('task/t1')
  })

  it('ignores a bare route, which is not worth overriding a sign-in landing', () => {
    expect(deepLinkPath('#/lists')).toBe(null)
    expect(deepLinkPath('#/')).toBe(null)
    expect(deepLinkPath('')).toBe(null)
    expect(deepLinkPath(null)).toBe(null)
  })

  it('ignores a route the app does not have', () => {
    expect(deepLinkPath('#/wat/x1')).toBe(null)
  })

  it('is not fooled by the auth tokens that replace the hash', () => {
    // The exact thing this exists to survive: Supabase returns from an email
    // link on `#access_token=…`, and splitting that on '/' would otherwise
    // produce a "route" that gets stashed and later restored as garbage.
    expect(deepLinkPath('#access_token=abc123&type=recovery&expires_in=3600')).toBe(null)
    expect(deepLinkPath('#/access_token=abc123')).toBe(null)
  })
})
