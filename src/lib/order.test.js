import { describe, it, expect } from 'vitest'
import { byOrder, moveUpdates } from './order'

const row = (id, sort_order, created_at) => ({ id, sort_order, created_at })

describe('byOrder', () => {
  it('sorts by sort_order ascending', () => {
    const list = [row('b', 2), row('a', 1), row('c', 3)]
    expect([...list].sort(byOrder).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })
  it('sinks null sort_order below ranked rows', () => {
    const list = [row('n', null, '2020-01-01'), row('a', 5)]
    expect([...list].sort(byOrder).map((r) => r.id)).toEqual(['a', 'n'])
  })
  it('breaks ties among unranked rows by created_at', () => {
    const list = [row('late', null, '2021-01-02'), row('early', null, '2021-01-01')]
    expect([...list].sort(byOrder).map((r) => r.id)).toEqual(['early', 'late'])
  })
})

describe('moveUpdates', () => {
  it('a midpoint move writes exactly one row', () => {
    const sorted = [row('a', 1), row('b', 2), row('c', 3), row('d', 4)]
    // move 'a' (idx 0) to between b and c: after removal rest=[b,c,d], to=1
    const updates = moveUpdates(sorted, 0, 1)
    expect(updates).toEqual([{ id: 'a', sort_order: 2.5 }])
  })
  it('moving to the end ranks past the last neighbor', () => {
    const sorted = [row('a', 1), row('b', 2), row('c', 3)]
    expect(moveUpdates(sorted, 0, 2)).toEqual([{ id: 'a', sort_order: 4 }])
  })
  it('moving to the front ranks before the first neighbor', () => {
    const sorted = [row('a', 1), row('b', 2), row('c', 3)]
    expect(moveUpdates(sorted, 2, 0)).toEqual([{ id: 'c', sort_order: 0 }])
  })
  it('a no-op move on a ranked row writes nothing', () => {
    const sorted = [row('a', 1), row('b', 2)]
    expect(moveUpdates(sorted, 0, 0)).toEqual([])
  })
  it('normalizes to integers when a neighbor is unranked', () => {
    // 'a' ranked, 'b'/'c' never placed (null). Moving 'c' up next to 'a'
    // can't split a null, so the whole list renumbers to 1..n.
    const sorted = [row('a', 1), row('b', null, '2020-01-01'), row('c', null, '2020-01-02')]
    const updates = moveUpdates(sorted, 2, 1) // c → position 1
    // result order a, c, b → ranks 1,2,3; only changed rows are returned
    const byId = Object.fromEntries(updates.map((u) => [u.id, u.sort_order]))
    expect(byId.c).toBe(2)
    expect(byId.b).toBe(3)
  })
  it('returns nothing for an out-of-range source', () => {
    expect(moveUpdates([row('a', 1)], 5, 0)).toEqual([])
  })
})
