import { describe, it, expect } from 'vitest'
import { formatAddress, parseAddress, mapsUrl } from './address'

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

describe('mapsUrl', () => {
  it('builds a Google Maps search link for an address', () => {
    expect(mapsUrl('123 Main St, Springfield, IL 62704, USA')).toBe(
      'https://www.google.com/maps/search/?api=1&query=123%20Main%20St%2C%20Springfield%2C%20IL%2062704%2C%20USA',
    )
  })
  it('encodes characters that would otherwise break the query', () => {
    // '#' truncates a URL at the fragment and '&' would start a new parameter —
    // both appear in real addresses ("Apt #3", "Smith & Co Building").
    const url = mapsUrl('Apt #3 Smith & Co, Springfield')
    expect(url).toContain('%233')
    expect(url).toContain('%26')
    expect(url.split('?')[1].split('&').length).toBe(2) // api=1 + query, nothing injected
  })
  it('is null when there is nothing to look up, so callers can skip the link', () => {
    expect(mapsUrl('')).toBe(null)
    expect(mapsUrl('   ')).toBe(null)
    expect(mapsUrl(null)).toBe(null)
    expect(mapsUrl(undefined)).toBe(null)
  })
  it('trims, so a stray space does not become a link to nowhere', () => {
    expect(mapsUrl('  10 Downing St, London  ')).toBe(
      'https://www.google.com/maps/search/?api=1&query=10%20Downing%20St%2C%20London',
    )
  })
  it('round-trips whatever formatAddress produced', () => {
    const addr = formatAddress({ street: '500 Oak Ave', city: 'Austin', state: 'TX', zip: '78701' })
    expect(mapsUrl(addr)).toBe(
      'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr),
    )
  })
})
