import { describe, it, expect } from 'vitest'
import {
  PRESENCE_TTL_MS,
  SHOPPING,
  applySignal,
  canAnnounce,
  clearMember,
  isFresh,
  shoppedLists,
  shoppersOf,
  shoppingLabel,
  shoppingSignal,
} from './presence'

const T0 = 1_700_000_000_000
const sig = (over = {}) => ({
  kind: SHOPPING,
  memberId: 'm-2',
  name: 'Sam',
  listId: 'l1',
  done: 3,
  total: 12,
  at: T0,
  ...over,
})

describe('isFresh', () => {
  it('believes a signal inside the window', () => {
    expect(isFresh(sig(), T0 + 1000)).toBe(true)
  })

  it('lets a signal expire rather than waiting to be told it ended', () => {
    // A broadcast dies with the tab that sent it, so there may be no goodbye at
    // all. Freshness is derived on read for exactly that reason.
    expect(isFresh(sig(), T0 + PRESENCE_TTL_MS)).toBe(false)
    expect(isFresh(sig(), T0 + PRESENCE_TTL_MS + 60000)).toBe(false)
  })

  it('refuses a signal from a clock far enough ahead to never expire', () => {
    expect(isFresh(sig({ at: T0 + PRESENCE_TTL_MS * 3 }), T0)).toBe(false)
  })

  it('is false for nothing at all', () => {
    expect(isFresh(null, T0)).toBe(false)
    expect(isFresh({}, T0)).toBe(false)
  })
})

describe('applySignal', () => {
  it('keeps one signal per member, newest wins', () => {
    // You can only be in one shop at a time.
    const a = applySignal({}, sig())
    const b = applySignal(a, sig({ listId: 'l2', at: T0 + 1000 }))
    expect(Object.keys(b)).toEqual(['m-2'])
    expect(b['m-2'].listId).toBe('l2')
  })

  it('ignores a beat that arrives out of order', () => {
    const a = applySignal({}, sig({ at: T0 + 5000 }))
    const b = applySignal(a, sig({ at: T0, listId: 'stale' }))
    expect(b['m-2'].listId).toBe('l1')
  })

  it('returns the same state when a repeat changes nothing', () => {
    // A heartbeat that says what we already know must not re-render every row
    // on the page.
    const a = applySignal({}, sig())
    expect(applySignal(a, sig())).toBe(a)
  })

  it('takes a new state when the progress moves', () => {
    const a = applySignal({}, sig())
    const b = applySignal(a, sig({ done: 4 }))
    expect(b).not.toBe(a)
    expect(b['m-2'].done).toBe(4)
  })

  it('ignores junk', () => {
    const a = { 'm-2': sig() }
    expect(applySignal(a, null)).toBe(a)
    expect(applySignal(a, { memberId: 'm-3' })).toBe(a) // no timestamp
  })
})

describe('clearMember', () => {
  it('removes them', () => {
    const a = applySignal({}, sig())
    expect(clearMember(a, 'm-2')).toEqual({})
  })

  it('is a no-op for somebody who was not there', () => {
    const a = applySignal({}, sig())
    expect(clearMember(a, 'm-9')).toBe(a)
    expect(clearMember(a, null)).toBe(a)
  })
})

describe('shoppersOf', () => {
  const state = {
    'm-2': sig(),
    'm-3': sig({ memberId: 'm-3', name: 'Jo', at: T0 + 1000 }),
    'm-4': sig({ memberId: 'm-4', name: 'Old', at: T0 - PRESENCE_TTL_MS }),
    'm-5': sig({ memberId: 'm-5', name: 'Elsewhere', listId: 'l2' }),
  }

  it('names who is on this list, newest first', () => {
    expect(shoppersOf(state, 'l1', T0 + 2000).map((s) => s.name)).toEqual(['Jo', 'Sam'])
  })

  it('drops the expired without being pruned first', () => {
    expect(shoppersOf(state, 'l1', T0 + 2000).some((s) => s.name === 'Old')).toBe(false)
  })

  it('leaves me out — the banner is about the other person', () => {
    expect(shoppersOf(state, 'l1', T0 + 2000, { exclude: 'm-2' }).map((s) => s.name)).toEqual([
      'Jo',
    ])
  })

  it('is empty without a list', () => {
    expect(shoppersOf(state, null, T0)).toEqual([])
    expect(shoppersOf({}, 'l1', T0)).toEqual([])
  })
})

describe('shoppedLists', () => {
  it('counts each list in one pass', () => {
    const state = {
      'm-2': sig(),
      'm-3': sig({ memberId: 'm-3', at: T0 + 10 }),
      'm-5': sig({ memberId: 'm-5', listId: 'l2' }),
      'm-6': sig({ memberId: 'm-6', listId: 'l3', at: T0 - PRESENCE_TTL_MS }),
    }
    expect(shoppedLists(state, T0 + 20)).toEqual({ l1: 2, l2: 1 })
  })

  it('leaves me out', () => {
    const state = { 'm-2': sig() }
    expect(shoppedLists(state, T0, { exclude: 'm-2' })).toEqual({})
  })
})

describe('shoppingLabel', () => {
  it('names one shopper with their progress', () => {
    expect(shoppingLabel([sig()])).toBe('Sam is shopping this now · 3 of 12')
  })

  it('omits progress that would only say what the list already shows', () => {
    expect(shoppingLabel([sig({ done: 0 })])).toBe('Sam is shopping this now')
    expect(shoppingLabel([sig({ total: 0 })])).toBe('Sam is shopping this now')
  })

  it('names both when a big shop gets split', () => {
    expect(shoppingLabel([sig({ done: 0 }), sig({ memberId: 'm-3', name: 'Jo' })])).toBe(
      'Sam and Jo are shopping this now',
    )
  })

  it('counts the rest beyond two', () => {
    expect(
      shoppingLabel([
        sig({ done: 0 }),
        sig({ memberId: 'm-3', name: 'Jo' }),
        sig({ memberId: 'm-4', name: 'Pat' }),
      ]),
    ).toBe('Sam and 2 others are shopping this now')
  })

  it('has nothing to say about nobody', () => {
    expect(shoppingLabel([])).toBe(null)
    expect(shoppingLabel(null)).toBe(null)
  })
})

describe('the privacy gate', () => {
  // Gating the SEND rather than the render is the whole point: every member is
  // subscribed to the same household channel, so a private list that announces
  // itself has already leaked, however carefully the other client declines to
  // draw it.
  it('refuses to build a signal for a private list', () => {
    expect(canAnnounce({ id: 'l1', privacy_level: 'private' })).toBe(false)
    expect(
      shoppingSignal({
        list: { id: 'l1', privacy_level: 'private' },
        memberId: 'm-1',
        name: 'Marc',
        done: 1,
        total: 3,
        at: T0,
      }),
    ).toBe(null)
  })

  it('allows a shared list', () => {
    expect(canAnnounce({ id: 'l1', privacy_level: 'family_shared' })).toBe(true)
    expect(
      shoppingSignal({
        list: { id: 'l1', privacy_level: 'family_shared' },
        memberId: 'm-1',
        name: 'Marc',
        done: 1,
        total: 3,
        at: T0,
      }),
    ).toMatchObject({ kind: SHOPPING, listId: 'l1', memberId: 'm-1', done: 1, total: 3 })
  })

  it('refuses without a member to attribute it to', () => {
    expect(shoppingSignal({ list: { id: 'l1' }, memberId: null, done: 1, total: 3, at: T0 })).toBe(
      null,
    )
  })

  it('refuses without a list', () => {
    expect(canAnnounce(null)).toBe(false)
  })
})
