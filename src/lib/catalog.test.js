import { describe, it, expect } from 'vitest'
import { catalogKey, buildCatalog, bumpCatalog, suggestItems } from './catalog'

describe('catalogKey', () => {
  it('normalizes case and whitespace', () => {
    expect(catalogKey('  Oat   Milk ')).toBe('oat milk')
    expect(catalogKey('EGGS')).toBe('eggs')
    expect(catalogKey('')).toBe('')
  })
})

describe('buildCatalog', () => {
  const items = [
    { id: 'a', text: 'Eggs', category: 'Dairy & Eggs', created_at: '2026-01-01' },
    { id: 'b', text: 'eggs', category: null, created_at: '2026-02-01' },
    { id: 'c', text: 'Bananas', category: 'Produce', created_at: '2026-01-15' },
    { id: 'h', text: 'Clothes', is_heading: true, created_at: '2026-01-01' },
    { id: 'd', text: '   ', created_at: '2026-01-01' },
  ]

  it('folds repeats by normalized text and counts uses', () => {
    const cat = buildCatalog(items)
    const eggs = cat.find((e) => e.norm === 'eggs')
    expect(eggs.use_count).toBe(2)
  })

  it('keeps the most-recent non-null category and label', () => {
    const cat = buildCatalog(items)
    const eggs = cat.find((e) => e.norm === 'eggs')
    // newer row (b) had null category — the learned aisle from (a) is kept
    expect(eggs.category).toBe('Dairy & Eggs')
    expect(eggs.last_used_at).toBe('2026-02-01')
  })

  it('skips headings and blank rows', () => {
    const cat = buildCatalog(items)
    expect(cat.find((e) => e.norm === 'clothes')).toBeUndefined()
    expect(cat).toHaveLength(2) // eggs + bananas
  })
})

describe('bumpCatalog', () => {
  it('increments an existing entry and refreshes recency', () => {
    const start = [
      {
        id: '1',
        norm: 'milk',
        text: 'Milk',
        category: 'Dairy & Eggs',
        use_count: 1,
        last_used_at: '2026-01-01',
      },
    ]
    const next = bumpCatalog(start, { text: 'milk', category: 'Dairy & Eggs', at: '2026-03-01' })
    expect(next).toHaveLength(1)
    expect(next[0].use_count).toBe(2)
    expect(next[0].last_used_at).toBe('2026-03-01')
  })

  it('does not wipe a learned aisle when none is supplied', () => {
    const start = [
      {
        id: '1',
        norm: 'milk',
        text: 'Milk',
        category: 'Dairy & Eggs',
        use_count: 1,
        last_used_at: '2026-01-01',
      },
    ]
    const next = bumpCatalog(start, { text: 'Milk', category: null, at: '2026-03-01' })
    expect(next[0].category).toBe('Dairy & Eggs')
  })

  it('appends a fresh entry for a new item', () => {
    const next = bumpCatalog([], {
      text: 'Tomatoes',
      category: 'Produce',
      at: '2026-03-01',
      id: 'x',
    })
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ norm: 'tomatoes', use_count: 1, category: 'Produce' })
  })

  it('ignores blank text', () => {
    expect(bumpCatalog([], { text: '  ', at: '2026-03-01' })).toEqual([])
  })
})

describe('suggestItems', () => {
  const catalog = [
    { norm: 'milk', text: 'Milk', use_count: 5, last_used_at: '2026-03-01' },
    { norm: 'oat milk', text: 'Oat milk', use_count: 2, last_used_at: '2026-03-05' },
    { norm: 'maple syrup', text: 'Maple syrup', use_count: 1, last_used_at: '2026-02-01' },
  ]

  it('returns nothing for an empty query', () => {
    expect(suggestItems(catalog, '')).toEqual([])
  })

  it('ranks prefix matches above substring matches', () => {
    const out = suggestItems(catalog, 'm')
    // "Milk" and "Maple syrup" start with m; "Oat milk" only contains it
    expect(out.map((e) => e.text)).toEqual(['Milk', 'Maple syrup', 'Oat milk'])
  })

  it('breaks prefix ties by use_count', () => {
    const out = suggestItems(catalog, 'mi')
    expect(out[0].text).toBe('Milk') // prefix; only milk starts with "mi"
  })

  it('excludes items already on the list', () => {
    const out = suggestItems(catalog, 'milk', { exclude: ['Milk'] })
    expect(out.map((e) => e.text)).toEqual(['Oat milk'])
  })

  it('respects the limit', () => {
    expect(suggestItems(catalog, 'm', { limit: 1 })).toHaveLength(1)
  })
})
