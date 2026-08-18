// Anti-drift guard for the two rules that decide who may be TOLD about a row.
//
// scope.ts is a hand port of lib/privacy.js plus the household filter the client
// gets from RLS for free. It exists because the sender holds a service-role key
// and therefore gets neither: RLS is bypassed by design (it has to read every
// household to build everyone's digest), so the filtering has to be explicit.
//
// The failure this pins is not a wrong count on a page you chose to open. It is
// a push notification, on a lock screen, naming someone the recipient is not
// allowed to know about — across households, or across the "Private, only me"
// line inside one. There is no undo on a notification, so this test asserts the
// safe direction explicitly in both cases.
//
// Vitest only: Deno never loads test files, so the deployed bundle is unaffected.

import { describe, it, expect } from 'vitest'
import { visibleTo as clientVisibleTo, filterVisible as clientFilter } from '../../../src/lib/privacy.js'
import { forHousehold, visibleTo, filterVisible, scopeFor } from './scope.ts'

const HH = 'hh-1'
const OTHER = 'hh-2'
const ME = 'user-me'
const YOU = 'user-you'

const row = (over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  name: 'Dana',
  household_id: HH,
  privacy_level: 'shared',
  created_by: ME,
  ...over,
})

describe('privacy parity — server port vs lib/privacy.js', () => {
  const both = (r: any, userId: string, expected: boolean) => {
    const server = visibleTo(r, userId)
    const client = clientVisibleTo(r, userId)
    expect(server).toBe(client)
    expect(server).toBe(expected)
  }

  it('agrees a shared row is visible to anyone', () => {
    both(row(), YOU, true)
  })

  it('agrees a private row is visible to its creator', () => {
    both(row({ privacy_level: 'private' }), ME, true)
  })

  it('agrees a private row is hidden from everyone else', () => {
    both(row({ privacy_level: 'private' }), YOU, false)
  })

  it('agrees a private row with no creator stays visible — never strand data', () => {
    both(row({ privacy_level: 'private', created_by: null }), YOU, true)
  })

  it('agrees on whole arrays', () => {
    const rows = [
      row({ id: 'a' }),
      row({ id: 'b', privacy_level: 'private' }),
      row({ id: 'c', privacy_level: 'private', created_by: YOU }),
    ]
    expect(filterVisible(rows, ME).map((r) => r.id)).toEqual(clientFilter(rows, ME).map((r) => r.id))
    expect(filterVisible(rows, ME).map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('household scoping — the rule RLS would have applied', () => {
  it('keeps only this household', () => {
    const rows = [row({ id: 'mine' }), row({ id: 'theirs', household_id: OTHER })]
    expect(forHousehold(rows, HH).map((r) => r.id)).toEqual(['mine'])
  })

  // A row arriving with no household_id means the SELECT forgot the column —
  // every data table has carried it `not null` since 0001. Dropping it is the
  // safe direction: a missing notification is recoverable, a leaked one isn't.
  it('drops a row with no household_id rather than guessing', () => {
    const rows = [row({ id: 'nohh', household_id: undefined })]
    expect(forHousehold(rows, HH)).toEqual([])
  })
})

describe('scopeFor — both rules, which is what index.ts actually calls', () => {
  const rows = [
    row({ id: 'shared-mine' }),
    row({ id: 'private-mine', privacy_level: 'private', created_by: ME }),
    row({ id: 'private-yours', privacy_level: 'private', created_by: YOU }),
    row({ id: 'other-household', household_id: OTHER }),
    row({ id: 'other-household-private', household_id: OTHER, privacy_level: 'private' }),
  ]

  it('returns only what this member may be told about', () => {
    expect(scopeFor(rows, HH, ME).map((r) => r.id)).toEqual(['shared-mine', 'private-mine'])
  })

  it('never leaks another household, however the row is marked', () => {
    for (const userId of [ME, YOU]) {
      const ids = scopeFor(rows, HH, userId).map((r) => r.id)
      expect(ids).not.toContain('other-household')
      expect(ids).not.toContain('other-household-private')
    }
  })

  it("never leaks a co-member's private row", () => {
    expect(scopeFor(rows, HH, YOU).map((r) => r.id)).toEqual(['shared-mine', 'private-yours'])
  })

  // key_dates and interactions have no privacy_level; they're reachable only
  // through a person, who has already been filtered. They must survive the pass.
  it('leaves rows with no privacy_level column alone', () => {
    const keyDates = [
      { id: 'kd-1', household_id: HH, person_id: 'p-1', label: 'Anniversary' },
      { id: 'kd-2', household_id: OTHER, person_id: 'p-9', label: 'Anniversary' },
    ]
    expect(scopeFor(keyDates, HH, ME).map((r) => r.id)).toEqual(['kd-1'])
  })
})
