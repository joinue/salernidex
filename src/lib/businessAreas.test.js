// Business areas, contact contexts, and org check-ins — migration 0042.
//
// The property under test throughout is the one the whole design rests on: a
// context area is ADDITIVE. It changes what a record OFFERS and whether its
// check-in can be silenced; it must never decide whether the contact is SHOWN.
// docs/scopes/areas-and-tags.md §3.2 argues that a colleague who becomes a
// friend is both, permanently, and these tests are what stop a later change
// from quietly making that false.

import { describe, it, expect } from 'vitest'
import {
  isBusinessArea,
  isBusinessContact,
  contextAreaFor,
  contactReachesToday,
  mutedAreaIds,
} from './areas'
import { tiersFor, cadenceOptionsFor, PERSONAL_TIERS, BUSINESS_TIERS } from './constants'
import { buildAttention, canBeFiled, attentionAreaId, badgeCount } from './attention'
import { lastOrgInteraction, interactionsFor, localDay } from './contact'
import { searchPeople, searchOrgs } from './search'
import { findDuplicates } from './duplicates'
import { AREA_SCOPED_ROUTES } from './nav'

const work = { id: 'a-work', name: 'Work', is_business: true, show_on_today: true }
const home = { id: 'a-home', name: 'Home', is_business: false, show_on_today: true }
const areas = [work, home]

const person = (over = {}) => ({ id: 'p1', name: 'Dana', deleted_at: null, ...over })
const org = (over = {}) => ({ id: 'o1', name: 'Acme', ...over })
const prefs = { tasks: true, lists: true, nudges: true, dates: true }
const base = { people: [], orgs: [], tasks: [], interactions: [], keyDates: [], lists: [] }
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()

describe('is_business — reading the flag', () => {
  it('reads the flag off an area', () => {
    expect(isBusinessArea(work)).toBe(true)
    expect(isBusinessArea(home)).toBe(false)
    expect(isBusinessArea(null)).toBe(false)
  })

  it('resolves a contact to its context area', () => {
    expect(contextAreaFor(person({ context_area_id: 'a-work' }), areas)).toBe(work)
    expect(contextAreaFor(person(), areas)).toBe(null)
  })

  it('an unfiled contact is never a business contact', () => {
    expect(isBusinessContact(person(), areas)).toBe(false)
  })

  it('a contact filed under a personal area is not a business contact', () => {
    expect(isBusinessContact(person({ context_area_id: 'a-home' }), areas)).toBe(false)
  })

  it('a contact filed under a business area is', () => {
    expect(isBusinessContact(person({ context_area_id: 'a-work' }), areas)).toBe(true)
  })

  // A context pointing at an area that has since been deleted resolves to null,
  // which reads as "personal" — the additive direction. The opposite default
  // would hand someone business vocabulary they never asked for.
  it('a dangling context reads as personal, not as business', () => {
    expect(isBusinessContact(person({ context_area_id: 'a-gone' }), areas)).toBe(false)
  })
})

describe('additive, never subtractive — the rule §3.2 depends on', () => {
  it('offers business tiers first but keeps every personal one', () => {
    const business = tiersFor(true).map((t) => t.value)
    for (const t of PERSONAL_TIERS) expect(business).toContain(t.value)
    for (const t of BUSINESS_TIERS) expect(business).toContain(t.value)
    expect(business[0]).toBe('client')
  })

  it('offers personal contacts the personal ladder alone', () => {
    expect(tiersFor(false)).toEqual(PERSONAL_TIERS)
  })

  it('offers every cadence to everyone, changing only the order', () => {
    const b = cadenceOptionsFor(true).map((o) => o.value)
    const p = cadenceOptionsFor(false).map((o) => o.value)
    expect([...b].sort()).toEqual([...p].sort())
    // "No reminder" is the way out, not a duration — pinned first in both.
    expect(b[0]).toBe(0)
    expect(p[0]).toBe(0)
    // Weekly leads for business; the long cadences lead for personal.
    expect(b[1]).toBe(7)
    expect(p[1]).toBe(30)
  })

  it('offers the short cadences the business half needs at all', () => {
    const values = cadenceOptionsFor(true).map((o) => o.value)
    expect(values).toContain(7)
    expect(values).toContain(14)
    expect(values).toContain(21)
  })

  // The load-bearing one. If this ever fails, a contact can vanish behind a
  // lens and the argument in §3.2 has been broken.
  it('never lets the lens scope the People page', () => {
    expect(AREA_SCOPED_ROUTES).not.toContain('people')
    expect(AREA_SCOPED_ROUTES).not.toContain('orgs')
    expect(AREA_SCOPED_ROUTES).not.toContain('groups')
    expect(AREA_SCOPED_ROUTES).not.toContain('relationships')
  })
})

describe('a silenced business area silences its check-ins', () => {
  const quietWork = { ...work, show_on_today: false }
  const muted = mutedAreaIds([quietWork, home])

  it('drops a contact known through the silenced area', () => {
    expect(contactReachesToday(person({ context_area_id: 'a-work' }), muted)).toBe(false)
  })

  it('keeps a contact known through a live area', () => {
    expect(contactReachesToday(person({ context_area_id: 'a-home' }), muted)).toBe(true)
  })

  // The property that made contacts area-less in the first place: muting Work
  // must never silence a friend's birthday.
  it('always keeps an unfiled contact', () => {
    expect(contactReachesToday(person(), muted)).toBe(true)
    expect(contactReachesToday({}, muted)).toBe(true)
  })

  it('keeps everyone when nothing is muted', () => {
    const none = mutedAreaIds(areas)
    expect(contactReachesToday(person({ context_area_id: 'a-work' }), none)).toBe(true)
  })

  it('removes the check-in from attention entirely', () => {
    const data = {
      ...base,
      areas: [quietWork, home],
      people: [person({ context_area_id: 'a-work', keep_in_touch_days: 7 })],
    }
    expect(buildAttention(data, prefs)).toHaveLength(0)
  })

  it('still raises it while the area is live', () => {
    const data = {
      ...base,
      areas,
      people: [person({ context_area_id: 'a-work', keep_in_touch_days: 7 })],
    }
    const items = buildAttention(data, prefs)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'nudge', key: 'nudge:p1', urgency: 'soft' })
  })

  it("silences a filed contact's BIRTHDAY too, and never an unfiled one's", () => {
    const today = new Date()
    const md = `-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const data = {
      ...base,
      areas: [quietWork, home],
      people: [
        person({ id: 'p-work', context_area_id: 'a-work', birthday: `1990${md}` }),
        person({ id: 'p-free', birthday: `1990${md}` }),
      ],
    }
    const keys = buildAttention(data, prefs).map((i) => i.key)
    expect(keys).toContain('date:b-p-free')
    expect(keys).not.toContain('date:b-p-work')
  })
})

describe('canBeFiled — answered per item, not per kind', () => {
  const withContext = person({ context_area_id: 'a-work', keep_in_touch_days: 7 })
  const without = person({ id: 'p2', name: 'Mum', keep_in_touch_days: 7 })

  const items = buildAttention({ ...base, areas, people: [withContext, without] }, prefs)
  const filed = items.find((i) => i.person?.id === 'p1')
  const unfiled = items.find((i) => i.person?.id === 'p2')

  it('lets the lens scope a check-in that has a context', () => {
    expect(canBeFiled(filed)).toBe(true)
    expect(attentionAreaId(filed)).toBe('a-work')
  })

  // Before 0042 the answer was a flat no for the whole kind. Answering a flat
  // YES would sweep every birthday in a personal household into the collapsed
  // "No area" section the moment any lens was picked — the exact failure the
  // comment on canBeFiled has always warned about.
  it('leaves a contextless check-in unfileable, so it shows under every lens', () => {
    expect(canBeFiled(unfiled)).toBe(false)
    expect(attentionAreaId(unfiled)).toBe(null)
  })
})

describe('organizations as accounts', () => {
  const acme = org({ keep_in_touch_days: 30, context_area_id: 'a-work' })

  it('finds the last touchpoint logged against the org, not against a person', () => {
    const interactions = [
      { id: 'i1', person_id: 'p1', occurred_at: daysAgo(1) },
      { id: 'i2', organization_id: 'o1', occurred_at: daysAgo(40) },
    ]
    expect(lastOrgInteraction('o1', interactions).id).toBe('i2')
    // …and doesn't confuse the two id spaces in either direction.
    expect(lastOrgInteraction('p1', interactions)).toBe(null)
  })

  it('raises a check-in for an overdue account', () => {
    const data = {
      ...base,
      areas,
      orgs: [acme],
      interactions: [{ id: 'i1', organization_id: 'o1', occurred_at: daysAgo(40) }],
    }
    const items = buildAttention(data, prefs)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'nudge', key: 'nudge:org:o1', urgency: 'soft' })
    expect(items[0].org.name).toBe('Acme')
  })

  it('stays quiet while the account is inside its cadence', () => {
    const data = {
      ...base,
      areas,
      orgs: [acme],
      interactions: [{ id: 'i1', organization_id: 'o1', occurred_at: daysAgo(3) }],
    }
    expect(buildAttention(data, prefs)).toHaveLength(0)
  })

  it('ignores an org with no cadence set — most orgs are a number you call', () => {
    const data = { ...base, areas, orgs: [org()] }
    expect(buildAttention(data, prefs)).toHaveLength(0)
  })

  // A person's snooze key and an org's must not collide, or silencing one
  // silences the other.
  it('namespaces the org key apart from a person key', () => {
    const data = {
      ...base,
      areas,
      orgs: [acme],
      people: [person({ id: 'o1', keep_in_touch_days: 7 })],
    }
    const keys = buildAttention(data, prefs).map((i) => i.key)
    expect(new Set(keys).size).toBe(2)
    expect(keys).toContain('nudge:o1')
    expect(keys).toContain('nudge:org:o1')
  })

  // Ambient, like every other check-in: a count that never reaches zero stops
  // being read.
  it('keeps account check-ins out of the red badge', () => {
    const data = {
      ...base,
      areas,
      orgs: [acme],
      interactions: [{ id: 'i1', organization_id: 'o1', occurred_at: daysAgo(40) }],
    }
    expect(badgeCount(buildAttention(data, prefs))).toBe(0)
  })

  it('is silenced with its area, like a person', () => {
    const data = {
      ...base,
      areas: [{ ...work, show_on_today: false }, home],
      orgs: [acme],
      interactions: [{ id: 'i1', organization_id: 'o1', occurred_at: daysAgo(40) }],
    }
    expect(buildAttention(data, prefs)).toHaveLength(0)
  })
})

describe('the touchpoint log as a record', () => {
  const interactions = [
    { id: 'i1', person_id: 'p1', occurred_at: daysAgo(5), note: 'Quoted the consumables bundle' },
    { id: 'i2', organization_id: 'o1', occurred_at: daysAgo(2), note: 'Renewal lands in Q3' },
    { id: 'i3', person_id: 'p1', occurred_at: daysAgo(1), note: null },
  ]

  it('reads one subject at a time, newest first', () => {
    expect(interactionsFor('person', 'p1', interactions).map((i) => i.id)).toEqual(['i3', 'i1'])
    expect(interactionsFor('organization', 'o1', interactions).map((i) => i.id)).toEqual(['i2'])
  })

  it('finds a person by something said on a call', () => {
    const found = searchPeople([person()], 'consumables', new Map(), [], interactions)
    expect(found.map((p) => p.id)).toEqual(['p1'])
  })

  it('finds an org by something said on a call', () => {
    const found = searchOrgs([org()], 'renewal', interactions)
    expect(found.map((o) => o.id)).toEqual(['o1'])
  })

  it('still ranks a name above a thing someone once said', () => {
    const dana = person({ id: 'p1', name: 'Dana' })
    const other = person({ id: 'p2', name: 'Sam' })
    const log = [{ id: 'i1', person_id: 'p2', occurred_at: daysAgo(1), note: 'called Dana back' }]
    const found = searchPeople([other, dana], 'dana', new Map(), [], log)
    expect(found[0].id).toBe('p1')
  })

  it('searches exactly as before when no log is passed', () => {
    expect(searchPeople([person()], 'dana', new Map(), []).map((p) => p.id)).toEqual(['p1'])
  })

  // Touchpoints are stored at noon local, so a naive UTC slice lands on the
  // neighbouring day in zones far enough east or west — and the edit sheet would
  // then open on the wrong date and save it back.
  it('reads back the local calendar day it was logged on', () => {
    const noon = new Date(2026, 7, 18, 12, 0, 0).toISOString()
    expect(localDay(noon)).toBe('2026-08-18')
    expect(localDay(null)).toBe(null)
  })
})

describe('duplicate detection across every channel', () => {
  const existing = person({
    id: 'p-existing',
    name: 'Dana Whitfield',
    email: 'dana@home.example',
    emails: [{ label: 'Work', value: 'd.whitfield@acme.example' }],
    phone: '(555) 010-2020',
    phones: [{ label: 'Mobile', value: '555-010-3030' }],
  })

  // The miss that mattered: a business contact is exactly the one with two
  // addresses, so saving them under the work one produced no warning at all.
  it('matches a secondary email against a stored secondary', () => {
    const found = findDuplicates(
      { name: 'D. Whitfield', emails: [{ label: 'Work', value: 'd.whitfield@acme.example' }] },
      [existing],
    )
    expect(found).toHaveLength(1)
    expect(found[0].confidence).toBe('strong')
    expect(found[0].reasons).toContain('same email')
  })

  it('matches a primary against a stored secondary, and the reverse', () => {
    expect(
      findDuplicates({ name: 'X', email: 'd.whitfield@acme.example' }, [existing]),
    ).toHaveLength(1)
    expect(
      findDuplicates({ name: 'X', emails: [{ label: 'Home', value: 'dana@home.example' }] }, [
        existing,
      ]),
    ).toHaveLength(1)
  })

  it('matches a secondary phone, formatting and all', () => {
    const found = findDuplicates({ name: 'X', phone: '+1 (555) 010-3030' }, [existing])
    expect(found[0].reasons).toContain('same phone')
  })

  it('still says nothing about an unrelated contact', () => {
    expect(findDuplicates({ name: 'Sam', email: 'sam@example.com' }, [existing])).toHaveLength(0)
  })

  it('still rates a bare name match as only likely', () => {
    const found = findDuplicates({ name: 'Dana Whitfield' }, [existing])
    expect(found[0].confidence).toBe('likely')
  })
})
