// Fuzzy search across name, organization, role, email, notes, and tags.
// Every word in the query must match somewhere; results are ranked so
// name matches surface first (instant context under time pressure).
import { TIERS, TIER_RANK } from './constants'
import { affiliationsFor } from './orgs'

// `orgsById` (Map id → org row) and `affiliations` resolve the orgs a person is
// linked to, since people reference orgs through link rows rather than carrying
// a name. EVERY org they're attached to is searchable, including the biography
// ones we deliberately keep out from under their name — hiding a fact from a
// list row is a display decision, not a reason to make it unfindable. Titles
// come from the links too, plus any standalone people.role.
function fieldText(person, orgsById, affiliations) {
  const links = affiliationsFor(person.id, affiliations)
  return {
    name: (person.name || '').toLowerCase(),
    organization: links
      .map((a) => orgsById?.get(a.organization_id)?.name || '')
      .join(' ')
      .toLowerCase(),
    role: [person.role, ...links.map((a) => a.role)].filter(Boolean).join(' ').toLowerCase(),
    email: (person.email || '').toLowerCase(),
    notes: (person.notes || '').toLowerCase(),
    tags: (person.tags || []).join(' ').toLowerCase(),
  }
}

const WEIGHTS = { name: 100, organization: 40, role: 30, tags: 30, email: 20, notes: 10 }

export function searchPeople(people, query, orgsById, affiliations = []) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return people

  const scored = []
  for (const person of people) {
    const fields = fieldText(person, orgsById, affiliations)
    let total = 0
    let allMatched = true
    for (const word of words) {
      let best = 0
      for (const [key, text] of Object.entries(fields)) {
        const idx = text.indexOf(word)
        if (idx === -1) continue
        let score = WEIGHTS[key]
        if (idx === 0 || text[idx - 1] === ' ') score *= 2 // word-start bonus
        best = Math.max(best, score)
      }
      if (!best) {
        allMatched = false
        break
      }
      total += best
    }
    if (allMatched) scored.push({ person, total })
  }
  return scored.sort((a, b) => b.total - a.total).map((s) => s.person)
}

const ORG_WEIGHTS = { name: 100, type: 40, tags: 30, contact: 20, description: 10 }

// Organizations matched by the same rules as people, so the People page can put
// them alongside the person results. Searching "plumber" should surface
// Riverbend Plumbing itself, not only the people filed under it — for a vendor
// the org IS the contact (0032).
export function searchOrgs(orgs, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []

  const scored = []
  for (const org of orgs) {
    const fields = {
      name: (org.name || '').toLowerCase(),
      type: (org.type || '').toLowerCase(),
      tags: (org.tags || []).join(' ').toLowerCase(),
      contact: [org.phone, org.email, org.website, org.address]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
      description: (org.description || '').toLowerCase(),
    }
    let total = 0
    let allMatched = true
    for (const word of words) {
      let best = 0
      for (const [key, text] of Object.entries(fields)) {
        const idx = text.indexOf(word)
        if (idx === -1) continue
        let score = ORG_WEIGHTS[key]
        if (idx === 0 || text[idx - 1] === ' ') score *= 2 // word-start bonus
        best = Math.max(best, score)
      }
      if (!best) {
        allMatched = false
        break
      }
      total += best
    }
    if (allMatched) scored.push({ org, total })
  }
  return scored.sort((a, b) => b.total - a.total).map((s) => s.org)
}

// Sort options for the People list. `lastByPerson` maps person id → their most
// recent interaction timestamp (ISO string), used by the activity-based sorts.
// People-page filter shape, lifted to App (see SearchView) so it survives
// leaving and returning to the page. All-empty = no filter applied.
export const EMPTY_PEOPLE_FILTERS = {
  org: '',
  tag: '',
  group: '',
  tier: '',
  privacy: '',
  showDeleted: false,
}

export const PEOPLE_SORTS = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'recent', label: 'Recent activity' },
  { value: 'tier', label: 'Tier (closest first)' },
]

// The full A–Z scrubber alphabet, with "#" (non-letters) last — matches the
// order groupPeopleByLetter emits so the jump bar and sections line up.
export const ALPHABET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#']

// Bucket an already name-sorted list into alphabetical sections for the
// Apple-Contacts-style browse view. A person's letter is the first A–Z
// character of their name (accents folded); anything else falls under "#".
// Returns [{ letter, items }] in ALPHABET order, skipping empty letters.
export function groupPeopleByLetter(people) {
  const buckets = new Map()
  for (const person of people) {
    const first = (person.name || '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .charAt(0)
      .toUpperCase()
    const letter = first >= 'A' && first <= 'Z' ? first : '#'
    if (!buckets.has(letter)) buckets.set(letter, [])
    buckets.get(letter).push(person)
  }
  return ALPHABET.filter((l) => buckets.has(l)).map((letter) => ({
    letter,
    items: buckets.get(letter),
  }))
}

export function sortPeople(people, sort, lastByPerson) {
  if (sort === 'relevance') return people // keep searchPeople's match ranking
  const byName = (a, b) => (a.name || '').localeCompare(b.name || '')

  if (sort === 'tier') {
    // Closest tier first (TIER_RANK order), unsorted last, alphabetical within each.
    const rank = (p) => TIER_RANK[p.tier] ?? TIERS.length
    return [...people].sort((a, b) => rank(a) - rank(b) || byName(a, b))
  }

  if (sort === 'recent') {
    // Most recently contacted first; never-contacted sink to the bottom.
    return [...people].sort((a, b) => {
      const ta = lastByPerson.get(a.id) || ''
      const tb = lastByPerson.get(b.id) || ''
      return ta === tb ? byName(a, b) : ta < tb ? 1 : -1
    })
  }

  return [...people].sort(byName)
}
