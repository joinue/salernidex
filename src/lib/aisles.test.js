import { describe, it, expect } from 'vitest'
import { categorize, groupByAisle, AISLES, OTHER } from './aisles'

describe('categorize', () => {
  it('maps common items to the right aisle', () => {
    expect(categorize('Bananas')).toBe('Produce')
    expect(categorize('Oat milk')).toBe('Dairy & Eggs')
    expect(categorize('Sourdough bread')).toBe('Bakery')
    expect(categorize('Chicken thighs')).toBe('Meat & Seafood')
    expect(categorize('Sparkling water')).toBe('Beverages')
    expect(categorize('Paper towels')).toBe('Household')
  })

  it('resolves substring conflicts by precedence', () => {
    expect(categorize('Ice cream')).toBe('Frozen') // not Dairy via "cream"
    expect(categorize('Peanut butter')).toBe('Pantry') // not Dairy via "butter"
    expect(categorize('Frozen pizza')).toBe('Frozen')
  })

  it('matches plurals via leading word boundary, not stray substrings', () => {
    expect(categorize('apples')).toBe('Produce')
    expect(categorize('Graham crackers')).toBe('Snacks') // "ham" must not pull it to Deli/Meat
  })

  it('falls back to Other for unknowns and blanks', () => {
    expect(categorize('Birthday candles')).toBe(OTHER)
    expect(categorize('')).toBe(OTHER)
    expect(categorize(null)).toBe(OTHER)
  })
})

describe('groupByAisle', () => {
  it('groups items in canonical aisle order, skipping empties', () => {
    const items = [
      { id: '1', text: 'Eggs', category: 'Dairy & Eggs' },
      { id: '2', text: 'Bananas', category: 'Produce' },
      { id: '3', text: 'Milk', category: 'Dairy & Eggs' },
    ]
    const groups = groupByAisle(items)
    expect(groups.map((g) => g.aisle)).toEqual(['Produce', 'Dairy & Eggs'])
    expect(groups[1].items.map((i) => i.id)).toEqual(['1', '3'])
  })

  it('routes missing or unknown categories to Other (sorted last)', () => {
    const items = [
      { id: '1', text: 'Bananas', category: 'Produce' },
      { id: '2', text: 'Mystery', category: null },
      { id: '3', text: 'Junk', category: 'Nonexistent aisle' },
    ]
    const groups = groupByAisle(items)
    expect(groups.map((g) => g.aisle)).toEqual(['Produce', 'Other'])
    expect(groups[1].items.map((i) => i.id)).toEqual(['2', '3'])
  })

  it('keeps Other last even when present', () => {
    expect(AISLES[AISLES.length - 1]).toBe('Other')
  })
})
