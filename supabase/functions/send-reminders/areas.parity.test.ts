// Anti-drift guard: runs the server port and the client original side by side
// and asserts they agree on which rows reach Today.
//
// areas.ts is a hand port of mutedAreaIds/reachesToday in src/lib/areas.js,
// because the Edge Function can't import the browser app's modules. The failure
// this pins is asymmetric and nasty in one direction: if the server drifts
// toward showing MORE than the client, a household that switched Work off gets
// a silent Tasks page and a phone that still buzzes about work on a Saturday —
// and they'd have no way to tell which half was wrong.
//
// Vitest only: Deno never loads test files, so the deployed bundle is unaffected.

import { describe, it, expect } from 'vitest'
import {
  mutedAreaIds as clientMuted,
  reachesToday as clientReaches,
} from '../../../src/lib/areas.js'
import { mutedAreaIds, reachesToday } from './areas.ts'

const area = (over: Record<string, unknown> = {}) => ({
  id: 'a-work',
  name: 'Work',
  show_on_today: true,
  ...over,
})

// Every case runs through both implementations and asserts they match each
// other AND the expectation — so a test that's simply wrong can't pass by
// having both sides be wrong together.
const both = (areas: any[], row: any, expected: boolean) => {
  const server = reachesToday(row, mutedAreaIds(areas))
  const client = clientReaches(row, clientMuted(areas))
  expect(server).toBe(client)
  expect(server).toBe(expected)
}

describe('areas parity — show_on_today', () => {
  it('agrees a row in a muted area is hidden', () => {
    both([area({ show_on_today: false })], { area_id: 'a-work' }, false)
  })

  it('agrees a row in a live area reaches Today', () => {
    both([area()], { area_id: 'a-work' }, true)
  })

  it('agrees an unfiled row always reaches Today', () => {
    both([area({ show_on_today: false })], { area_id: null }, true)
    both([area({ show_on_today: false })], {}, true)
  })

  it('agrees a row in some OTHER muted area is unaffected', () => {
    both([area({ id: 'a-other', show_on_today: false })], { area_id: 'a-work' }, true)
  })

  // The compatibility case: a pre-0040 row, or one written by a client that
  // never learned the column. Both sides must treat it as visible — the safe
  // direction for a rule that hides things.
  it('agrees a missing show_on_today means visible', () => {
    const legacy: any = area()
    delete legacy.show_on_today
    both([legacy], { area_id: 'a-work' }, true)
    expect(mutedAreaIds([legacy]).size).toBe(clientMuted([legacy]).size)
  })

  it('agrees a null show_on_today means visible', () => {
    both([area({ show_on_today: null })], { area_id: 'a-work' }, true)
  })

  it('agrees with nothing muted at all', () => {
    both([], { area_id: 'a-work' }, true)
  })

  it('builds the same muted set from a mixed list', () => {
    const areas = [
      area({ id: 'a-work', show_on_today: false }),
      area({ id: 'a-home' }),
      area({ id: 'a-band', show_on_today: false }),
    ]
    expect([...mutedAreaIds(areas)].sort()).toEqual([...clientMuted(areas)].sort())
    expect([...mutedAreaIds(areas)].sort()).toEqual(['a-band', 'a-work'])
  })
})
