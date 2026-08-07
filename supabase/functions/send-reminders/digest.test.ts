// The digest is the one notification that goes out every single morning, and
// its copy is now assembled from two sources that must not be confused for one
// another. These pin the sentence that actually lands on the lock screen.

import { describe, it, expect } from 'vitest'
import { digestCopy } from './digest.ts'

const item = (body: string) => ({ body })
const ahead = (title: string) => ({ title })

describe('digestCopy', () => {
  it('says nothing when there is nothing to say', () => {
    expect(digestCopy([], [])).toBeNull()
  })

  it('counts only what is due today, and names the first three', () => {
    expect(digestCopy([item('Bins'), item('Rent')], [])).toEqual({
      title: '2 things today',
      body: 'Bins · Rent',
    })
    expect(digestCopy([item('Bins')], [])).toEqual({ title: '1 thing today', body: 'Bins' })
  })

  it('collapses a long day to "+N more"', () => {
    const items = ['Bins', 'Rent', 'Vet', 'Taxes', 'Oil'].map(item)
    expect(digestCopy(items, [])).toEqual({
      title: '5 things today',
      body: 'Bins · Rent · Vet · +2 more',
    })
  })

  it('keeps a deadline out of the count and adds it as a trailing clause', () => {
    const copy = digestCopy([item('Bins')], [ahead('Renew the registration')])
    // The headline must still read 1 — the deadline is not due today.
    expect(copy).toEqual({
      title: '1 thing today',
      body: 'Bins · Coming up: Renew the registration',
    })
  })

  it('names the soonest deadline and tallies the rest', () => {
    const copy = digestCopy([item('Bins')], [ahead('Registration'), ahead('Gutters')])
    expect(copy!.body).toBe('Bins · Coming up: Registration +1')
    expect(copy!.title).toBe('1 thing today')
  })

  it('lets deadlines carry the digest on a day with nothing due', () => {
    expect(digestCopy([], [ahead('Registration'), ahead('Gutters')])).toEqual({
      title: '2 things coming up',
      body: 'Registration · Gutters',
    })
  })

  it('does not repeat "coming up" twice for a single deadline', () => {
    const copy = digestCopy([], [ahead('Registration')])
    expect(copy).toEqual({ title: '1 thing coming up', body: 'Registration' })
    expect(copy!.body).not.toMatch(/coming up/i)
  })

  it('collapses a long deadline-only list too', () => {
    const list = ['A', 'B', 'C', 'D'].map(ahead)
    expect(digestCopy([], list)).toEqual({
      title: '4 things coming up',
      body: 'A · B · C · +1 more',
    })
  })
})
