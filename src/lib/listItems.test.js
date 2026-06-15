import { describe, it, expect } from 'vitest'
import { stepQty, hasQty, qtyLabel, parseQty } from './listItems'

describe('stepQty', () => {
  it('treats blank as one: up → 2, down → blank', () => {
    expect(stepQty('', 1)).toBe('2')
    expect(stepQty('', -1)).toBe('')
    expect(stepQty('1', 1)).toBe('2')
    expect(stepQty('1', -1)).toBe('')
  })

  it('steps a plain number', () => {
    expect(stepQty('3', 1)).toBe('4')
    expect(stepQty('3', -1)).toBe('2')
  })

  it('keeps a trailing unit', () => {
    expect(stepQty('2 lbs', 1)).toBe('3 lbs')
    expect(stepQty('2 lbs', -1)).toBe('1 lbs')
  })

  it('clears a bare count once it falls to one', () => {
    expect(stepQty('2', -1)).toBe('')
    expect(stepQty('0', -1)).toBe('')
  })

  it('never drops a unit qty below zero', () => {
    expect(stepQty('0 lbs', -1)).toBe('0 lbs')
  })

  it('leaves an unparseable unit-only qty alone', () => {
    expect(stepQty('a dozen', 1)).toBe('a dozen')
  })
})

describe('hasQty', () => {
  it('is true only for a meaningful qty', () => {
    expect(hasQty('')).toBe(false)
    expect(hasQty('1')).toBe(false)
    expect(hasQty('2')).toBe(true)
    expect(hasQty('2 lbs')).toBe(true)
  })
})

describe('parseQty', () => {
  it('peels a leading count off the item name', () => {
    expect(parseQty('2 avocados')).toEqual({ qty: '2', text: 'avocados' })
    expect(parseQty('12 eggs')).toEqual({ qty: '12', text: 'eggs' })
  })

  it('folds a recognized unit into the qty', () => {
    expect(parseQty('2 lbs chicken')).toEqual({ qty: '2 lbs', text: 'chicken' })
    expect(parseQty('12 oz cream cheese')).toEqual({ qty: '12 oz', text: 'cream cheese' })
  })

  it('treats an unrecognized word after the number as part of the name', () => {
    expect(parseQty('2 percent milk')).toEqual({ qty: '2', text: 'percent milk' })
  })

  it('leaves plain text and bare numbers untouched', () => {
    expect(parseQty('milk')).toEqual({ qty: '', text: 'milk' })
    expect(parseQty('5')).toEqual({ qty: '', text: '5' })
    expect(parseQty('  bananas ')).toEqual({ qty: '', text: 'bananas' })
  })
})

describe('qtyLabel', () => {
  it('prefixes a bare count with ×, leaves units as-is', () => {
    expect(qtyLabel('2')).toBe('×2')
    expect(qtyLabel('2 lbs')).toBe('2 lbs')
    expect(qtyLabel('1')).toBe('')
    expect(qtyLabel('')).toBe('')
  })
})
