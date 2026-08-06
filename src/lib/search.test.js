import { describe, it, expect } from 'vitest'
import { groupPeopleByLetter, ALPHABET, searchPeople, searchOrgs } from './search'

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

describe('searchPeople with affiliations', () => {
  const orgsById = new Map([
    ['o-plumb', { id: 'o-plumb', name: 'Riverbend Plumbing', type: 'Contractor' }],
    ['o-acme', { id: 'o-acme', name: 'Acme Corp', type: 'Company' }],
  ])
  const people = [
    { id: 'p1', name: 'Marco Reyes' },
    { id: 'p2', name: 'Dana Chen' },
    { id: 'p3', name: 'Nobody Nowhere' },
  ]
  const affiliations = [
    { id: 'a1', person_id: 'p1', organization_id: 'o-plumb', role: 'Plumber' },
    { id: 'a2', person_id: 'p2', organization_id: 'o-acme', role: 'Software engineer' },
  ]

  it('finds someone by the org they are linked to', () => {
    const hits = searchPeople(people, 'riverbend', orgsById, affiliations)
    expect(hits.map((x) => x.id)).toEqual(['p1'])
  })

  it('still finds a biography org that is hidden from the summary line', () => {
    // Acme never shows under Dana's name, but it must remain findable —
    // suppressing a fact on a list row is a display choice, not a deletion.
    const hits = searchPeople(people, 'acme', orgsById, affiliations)
    expect(hits.map((x) => x.id)).toEqual(['p2'])
  })

  it('matches a title that lives on the link', () => {
    expect(searchPeople(people, 'plumber', orgsById, affiliations).map((x) => x.id)).toEqual(['p1'])
  })

  it('searches every org a person belongs to, not just the leading one', () => {
    const both = [...affiliations, { id: 'a3', person_id: 'p1', organization_id: 'o-acme' }]
    expect(
      searchPeople(people, 'acme', orgsById, both)
        .map((x) => x.id)
        .sort(),
    ).toEqual(['p1', 'p2'])
  })

  it('returns everyone for an empty query', () => {
    expect(searchPeople(people, '  ', orgsById, affiliations)).toHaveLength(3)
  })
})

describe('searchOrgs', () => {
  const orgs = [
    {
      id: 'o1',
      name: 'Riverbend Plumbing',
      type: 'Contractor',
      phone: '(555) 555-0187',
      tags: ['home'],
    },
    { id: 'o2', name: 'Acme Corp', type: 'Company', description: 'Widgets.' },
  ]

  it('matches on name', () => {
    expect(searchOrgs(orgs, 'riverbend').map((o) => o.id)).toEqual(['o1'])
  })

  it('matches on type, so "contractor" surfaces the vendor', () => {
    expect(searchOrgs(orgs, 'contractor').map((o) => o.id)).toEqual(['o1'])
  })

  it('matches on the contact details an org now carries', () => {
    expect(searchOrgs(orgs, '0187').map((o) => o.id)).toEqual(['o1'])
  })

  it('requires every query word to match somewhere', () => {
    expect(searchOrgs(orgs, 'riverbend widgets')).toEqual([])
  })

  it('returns nothing for an empty query', () => {
    expect(searchOrgs(orgs, '   ')).toEqual([])
  })
})
