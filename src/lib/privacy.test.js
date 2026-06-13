import { describe, it, expect } from 'vitest'
import { visibleTo, filterVisible, isPrivate, isShared, PRIVATE_LEVEL } from './privacy'

const me = 'member-1'
const you = 'member-2'

describe('visibleTo', () => {
  it('non-private rows are visible to anyone', () => {
    expect(visibleTo({ privacy_level: 'shared', created_by: you }, me)).toBe(true)
  })
  it('private rows are visible only to their creator', () => {
    expect(visibleTo({ privacy_level: PRIVATE_LEVEL, created_by: me }, me)).toBe(true)
    expect(visibleTo({ privacy_level: PRIVATE_LEVEL, created_by: you }, me)).toBe(false)
  })
  it('legacy private rows with no creator stay visible (never strand data)', () => {
    expect(visibleTo({ privacy_level: PRIVATE_LEVEL, created_by: null }, me)).toBe(true)
  })
  it('an unknown viewer still sees private rows (e.g. pre-auth)', () => {
    expect(visibleTo({ privacy_level: PRIVATE_LEVEL, created_by: you }, null)).toBe(true)
  })
})

describe('filterVisible', () => {
  it("drops only other people's private rows", () => {
    const rows = [
      { id: 'a', privacy_level: 'shared', created_by: you },
      { id: 'b', privacy_level: PRIVATE_LEVEL, created_by: me },
      { id: 'c', privacy_level: PRIVATE_LEVEL, created_by: you },
    ]
    expect(filterVisible(rows, me).map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('isPrivate / isShared', () => {
  it('isPrivate is true only for the private level', () => {
    expect(isPrivate({ privacy_level: PRIVATE_LEVEL })).toBe(true)
    expect(isPrivate({ privacy_level: 'shared' })).toBe(false)
    expect(isPrivate({})).toBe(false)
  })
  it('isShared is true for any non-private privacy level', () => {
    expect(isShared({ privacy_level: 'shared' })).toBe(true)
    expect(isShared({ privacy_level: 'family_shared' })).toBe(true)
    expect(isShared({ privacy_level: PRIVATE_LEVEL })).toBe(false)
  })
  it('a row with no privacy_level is neither private nor shared', () => {
    expect(isPrivate({})).toBe(false)
    expect(isShared({})).toBe(false)
  })
})
