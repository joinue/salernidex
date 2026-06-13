import { describe, it, expect } from 'vitest'
import { formatAddress, parseAddress } from './address'

describe('formatAddress', () => {
  it('joins parts into one Maps-friendly string', () => {
    expect(
      formatAddress({
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zip: '62704',
        country: 'USA',
      }),
    ).toBe('123 Main St, Springfield, IL 62704, USA')
  })
  it('skips empty parts cleanly', () => {
    expect(formatAddress({ street: '123 Main St', city: 'Springfield' })).toBe(
      '123 Main St, Springfield',
    )
    expect(formatAddress({})).toBe('')
  })
})

describe('parseAddress', () => {
  it('splits a full address into fields', () => {
    expect(parseAddress('123 Main St, Springfield, IL 62704, USA')).toEqual({
      street: '123 Main St',
      city: 'Springfield',
      state: 'IL',
      zip: '62704',
      country: 'USA',
    })
  })
  it('handles a 3-part address (no country)', () => {
    expect(parseAddress('500 Oak Ave, Austin, TX 78701')).toEqual({
      street: '500 Oak Ave',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      country: '',
    })
  })
  it('puts a single token in street, never throws on junk', () => {
    expect(parseAddress('somewhere')).toMatchObject({ street: 'somewhere' })
    expect(parseAddress('')).toEqual({ street: '', city: '', state: '', zip: '', country: '' })
    expect(parseAddress(null)).toEqual({ street: '', city: '', state: '', zip: '', country: '' })
  })
})

describe('round-trip', () => {
  it('format∘parse is stable for well-formed US addresses', () => {
    for (const s of [
      '123 Main St, Springfield, IL 62704, USA',
      '500 Oak Ave, Austin, TX 78701',
      '10 Downing St, London',
    ]) {
      expect(formatAddress(parseAddress(s))).toBe(s)
    }
  })
})
