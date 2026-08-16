import { describe, it, expect } from 'vitest'
import {
  COLLECTION,
  GROCERY,
  LIST_KINDS,
  MEAL_PLAN,
  STANDARD,
  countsAsOpen,
  isCheckable,
  isCollection,
  isDueable,
  isOpenItem,
  kindOf,
  listIcon,
} from './listKinds'

describe('kindOf', () => {
  it('resolves each known kind', () => {
    expect(kindOf({ kind: GROCERY }).label).toBe('Grocery')
    expect(kindOf({ kind: MEAL_PLAN }).label).toBe('Meals')
    expect(kindOf({ kind: COLLECTION }).label).toBe('Collection')
  })

  it('falls back to standard for missing or unknown kinds', () => {
    // A row written by a newer client must render as something.
    expect(kindOf({}).value).toBe(STANDARD)
    expect(kindOf(null).value).toBe(STANDARD)
    expect(kindOf({ kind: 'from_the_future' }).value).toBe(STANDARD)
  })
})

describe('listIcon', () => {
  it('prefers the list’s own emoji', () => {
    expect(listIcon({ kind: GROCERY, icon: '🥑' })).toBe('🥑')
  })

  it('falls back to the kind’s default — including meal plan and collection', () => {
    expect(listIcon({ kind: STANDARD })).toBe('📝')
    expect(listIcon({ kind: GROCERY })).toBe('🛒')
    expect(listIcon({ kind: MEAL_PLAN })).toBe('🍽️')
    expect(listIcon({ kind: COLLECTION })).toBe('⭐')
  })
})

describe('behaviour flags', () => {
  it('a collection is the only kind you cannot check off', () => {
    const uncheckable = LIST_KINDS.filter((k) => !k.checkable).map((k) => k.value)
    expect(uncheckable).toEqual([COLLECTION])
    expect(isCheckable({ kind: COLLECTION })).toBe(false)
    expect(isCheckable({ kind: STANDARD })).toBe(true)
  })

  it('neither a meal plan nor a collection can be "due"', () => {
    expect(isDueable({ kind: STANDARD })).toBe(true)
    expect(isDueable({ kind: GROCERY })).toBe(true)
    expect(isDueable({ kind: MEAL_PLAN })).toBe(false)
    expect(isDueable({ kind: COLLECTION })).toBe(false)
  })

  it('a collection never counts as outstanding work', () => {
    expect(countsAsOpen({ kind: STANDARD })).toBe(true)
    expect(countsAsOpen({ kind: COLLECTION })).toBe(false)
  })

  it('identifies a collection', () => {
    expect(isCollection({ kind: COLLECTION })).toBe(true)
    expect(isCollection({ kind: STANDARD })).toBe(false)
  })
})

describe('isOpenItem', () => {
  const list = { kind: STANDARD }

  it('counts an unchecked, non-heading row', () => {
    expect(isOpenItem({ text: 'Milk' }, list)).toBe(true)
  })

  it('does not count a checked row', () => {
    expect(isOpenItem({ text: 'Milk', checked_at: '2026-08-13' }, list)).toBe(false)
  })

  it('does not count a section heading', () => {
    // The sidebar badge used to count these; the index never did.
    expect(isOpenItem({ text: 'Produce', is_heading: true }, list)).toBe(false)
  })

  it('counts nothing on a collection, however many rows it has', () => {
    const c = { kind: COLLECTION }
    expect(isOpenItem({ text: 'Cafe Monarch' }, c)).toBe(false)
  })
})
