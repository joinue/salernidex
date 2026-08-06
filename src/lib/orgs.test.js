import { describe, it, expect } from 'vitest'
import {
  orgNameTaken,
  isCounterparty,
  showsInSummary,
  personSummary,
  leadAffiliation,
  currentAffiliations,
  affiliationDetail,
  orgMembers,
  orgFormerMembers,
  orgHasContact,
  websiteUrl,
} from './orgs'

const orgs = [
  { id: '1', name: 'Acme' },
  { id: '2', name: 'Globex' },
]

describe('orgNameTaken', () => {
  it('matches case- and space-insensitively', () => {
    expect(orgNameTaken('acme', orgs)).toBe(true)
    expect(orgNameTaken('  ACME ', orgs)).toBe(true)
    expect(orgNameTaken('Initech', orgs)).toBe(false)
  })
  it('ignores the record being edited', () => {
    expect(orgNameTaken('Acme', orgs, '1')).toBe(false) // editing Acme itself
    expect(orgNameTaken('Acme', orgs, '2')).toBe(true) // renaming Globex → Acme collides
  })
  it('an empty name is never "taken"', () => {
    expect(orgNameTaken('', orgs)).toBe(false)
    expect(orgNameTaken('   ', orgs)).toBe(false)
  })
})

// ---------- affiliations ----------

const ORGS = [
  { id: 'o-plumb', name: 'Riverbend Plumbing', type: 'Contractor' },
  { id: 'o-acme', name: 'Acme Corp', type: 'Company' },
  { id: 'o-clinic', name: 'Summit Health', type: 'Healthcare' },
  { id: 'o-untyped', name: 'Mystery LLC' },
]
const orgsById = new Map(ORGS.map((o) => [o.id, o]))

const aff = (over) => ({
  id: 'a1',
  person_id: 'p1',
  organization_id: 'o-acme',
  role: null,
  is_primary: false,
  show_in_summary: null,
  ended_on: null,
  ...over,
})

describe('isCounterparty', () => {
  it('splits orgs you deal with from orgs people merely work at', () => {
    expect(isCounterparty({ type: 'Contractor' })).toBe(true)
    expect(isCounterparty({ type: 'Healthcare' })).toBe(true)
    expect(isCounterparty({ type: 'Club / Association' })).toBe(true)
    expect(isCounterparty({ type: 'Company' })).toBe(false)
    expect(isCounterparty({ type: 'Nonprofit' })).toBe(false)
    // No type yet (quick-add from PersonForm) is biography, the quieter default.
    expect(isCounterparty({})).toBe(false)
  })
})

describe('showsInSummary', () => {
  it('infers from the org type when the affiliation has no opinion', () => {
    expect(showsInSummary(aff({ show_in_summary: null }), orgsById.get('o-plumb'))).toBe(true)
    expect(showsInSummary(aff({ show_in_summary: null }), orgsById.get('o-acme'))).toBe(false)
  })

  it('lets an explicit override win in both directions', () => {
    // The accountant at a firm someone typed as "Company".
    expect(showsInSummary(aff({ show_in_summary: true }), orgsById.get('o-acme'))).toBe(true)
    // A friend who happens to be a nurse at your clinic.
    expect(showsInSummary(aff({ show_in_summary: false }), orgsById.get('o-clinic'))).toBe(false)
  })
})

describe('personSummary', () => {
  const person = { id: 'p1', name: 'Dana', role: null }

  it('shows "role at org" for a counterparty org', () => {
    const affs = [aff({ organization_id: 'o-plumb', role: 'Plumber' })]
    expect(personSummary(person, affs, orgsById)).toBe('Plumber at Riverbend Plumbing')
  })

  it('shows the bare org name when no title is recorded', () => {
    const affs = [aff({ organization_id: 'o-plumb' })]
    expect(personSummary(person, affs, orgsById)).toBe('Riverbend Plumbing')
  })

  it('keeps the title but drops the employer for a biography org', () => {
    const affs = [aff({ organization_id: 'o-acme', role: 'Software engineer' })]
    expect(personSummary(person, affs, orgsById)).toBe('Software engineer')
  })

  it('says nothing for a friend who just happens to work somewhere', () => {
    const affs = [aff({ organization_id: 'o-acme' })]
    expect(personSummary(person, affs, orgsById)).toBe('')
  })

  it('falls back to people.role only when there is no affiliation at all', () => {
    expect(personSummary({ id: 'p1', role: 'Babysitter' }, [], orgsById)).toBe('Babysitter')
    expect(personSummary({ id: 'p1', role: null }, [], orgsById)).toBe('')
  })

  it('ignores an affiliation that has ended', () => {
    const affs = [aff({ organization_id: 'o-plumb', role: 'Plumber', ended_on: '2024-01-01' })]
    expect(personSummary(person, affs, orgsById)).toBe('')
  })

  it('prefers the org that explains the relationship over the one flagged primary', () => {
    // Employed at Acme, but they're in the address book because they're the
    // plumber — that's what should read on the row.
    const affs = [
      aff({ id: 'a1', organization_id: 'o-acme', role: 'Engineer', is_primary: true }),
      aff({ id: 'a2', organization_id: 'o-plumb', role: 'Plumber' }),
    ]
    expect(personSummary(person, affs, orgsById)).toBe('Plumber at Riverbend Plumbing')
  })

  it('respects is_primary when several affiliations are showable', () => {
    const affs = [
      aff({ id: 'a1', organization_id: 'o-clinic', role: 'Nurse' }),
      aff({ id: 'a2', organization_id: 'o-plumb', role: 'Plumber', is_primary: true }),
    ]
    expect(personSummary(person, affs, orgsById)).toBe('Plumber at Riverbend Plumbing')
  })

  it('ignores affiliations belonging to someone else', () => {
    const affs = [aff({ person_id: 'p2', organization_id: 'o-plumb', role: 'Plumber' })]
    expect(personSummary(person, affs, orgsById)).toBe('')
  })
})

describe('currentAffiliations', () => {
  it('drops ended links and orders primary first, then by org name', () => {
    const affs = [
      aff({ id: 'a1', organization_id: 'o-untyped' }),
      aff({ id: 'a2', organization_id: 'o-acme' }),
      aff({ id: 'a3', organization_id: 'o-clinic', is_primary: true }),
      aff({ id: 'a4', organization_id: 'o-plumb', ended_on: '2023-06-01' }),
    ]
    expect(currentAffiliations('p1', affs, orgsById).map((a) => a.id)).toEqual(['a3', 'a2', 'a1'])
  })
})

describe('leadAffiliation', () => {
  it('returns null when the person has no current affiliation', () => {
    expect(leadAffiliation('p1', [], orgsById)).toBe(null)
    expect(leadAffiliation('p1', [aff({ ended_on: '2024-01-01' })], orgsById)).toBe(null)
  })

  it('still returns a link when none are showable, so its title can be used', () => {
    const affs = [aff({ id: 'a1', organization_id: 'o-acme', role: 'Engineer' })]
    expect(leadAffiliation('p1', affs, orgsById)?.id).toBe('a1')
  })
})

describe('affiliationDetail', () => {
  it('reads as the title, marking anything ended as former', () => {
    expect(affiliationDetail({ role: 'Plumber' })).toBe('Plumber')
    expect(affiliationDetail({ role: 'Plumber', ended_on: '2024-01-01' })).toBe('Plumber · Former')
    expect(affiliationDetail({})).toBe('')
  })
})

describe('org member lists', () => {
  const people = [
    { id: 'p1', name: 'Dana' },
    { id: 'p2', name: 'Marco' },
    { id: 'p3', name: 'Archived Al', deleted_at: '2024-01-01' },
  ]
  const affs = [
    aff({ id: 'a1', person_id: 'p1', organization_id: 'o-plumb' }),
    aff({ id: 'a2', person_id: 'p2', organization_id: 'o-plumb', ended_on: '2024-02-01' }),
    aff({ id: 'a3', person_id: 'p3', organization_id: 'o-plumb' }),
  ]

  it('counts only current, non-archived people', () => {
    expect(orgMembers('o-plumb', people, affs).map((p) => p.id)).toEqual(['p1'])
  })

  it('lists former members separately', () => {
    expect(orgFormerMembers('o-plumb', people, affs).map((p) => p.id)).toEqual(['p2'])
  })

  it('does not list someone as former when they also hold a current link', () => {
    const rehired = [
      aff({ id: 'a5', person_id: 'p2', organization_id: 'o-clinic', ended_on: '2020-01-01' }),
      aff({ id: 'a6', person_id: 'p2', organization_id: 'o-clinic' }),
    ]
    expect(orgFormerMembers('o-clinic', people, rehired)).toEqual([])
  })
})

describe('org contact helpers', () => {
  it('detects whether an org can be reached at all', () => {
    expect(orgHasContact({ name: 'Acme' })).toBe(false)
    expect(orgHasContact({ phone: '555-0134' })).toBe(true)
    expect(orgHasContact({ address: '12 Main St' })).toBe(true)
  })

  it('makes a typed bare host href-able', () => {
    expect(websiteUrl('acme.com')).toBe('https://acme.com')
    expect(websiteUrl('http://acme.com')).toBe('http://acme.com')
    expect(websiteUrl('  ')).toBe(null)
  })
})
