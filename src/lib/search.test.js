import { describe, it, expect } from 'vitest'
import { groupPeopleByLetter, ALPHABET } from './search'

const p = (name) => ({ name })

describe('groupPeopleByLetter', () => {
  it('buckets by first letter, uppercased', () => {
    const sections = groupPeopleByLetter([p('alice'), p('Adam'), p('Bob')])
    expect(sections.map((s) => s.letter)).toEqual(['A', 'B'])
    expect(sections[0].items.map((x) => x.name)).toEqual(['alice', 'Adam'])
  })

  it('folds accents onto the base letter', () => {
    const sections = groupPeopleByLetter([p('Élodie'), p('Eve')])
    expect(sections.map((s) => s.letter)).toEqual(['E'])
    expect(sections[0].items).toHaveLength(2)
  })

  it('puts numbers, symbols, and empty names under "#" last', () => {
    const sections = groupPeopleByLetter([p('Zane'), p('3M'), p('+1 contact'), p('')])
    expect(sections.map((s) => s.letter)).toEqual(['Z', '#'])
    expect(sections[1].items).toHaveLength(3)
  })

  it('skips letters with no contacts and preserves input order within a bucket', () => {
    const sections = groupPeopleByLetter([p('Mary'), p('Max'), p('Mike')])
    expect(sections).toHaveLength(1)
    expect(sections[0].items.map((x) => x.name)).toEqual(['Mary', 'Max', 'Mike'])
  })

  it('emits sections in ALPHABET order', () => {
    const sections = groupPeopleByLetter([p('Bob'), p('1up'), p('Ana')])
    const order = sections.map((s) => s.letter)
    expect(order).toEqual([...order].sort((a, b) => ALPHABET.indexOf(a) - ALPHABET.indexOf(b)))
    expect(order).toEqual(['A', 'B', '#'])
  })
})
