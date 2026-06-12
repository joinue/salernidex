// Fuzzy search across name, organization, role, email, notes, and tags.
// Every word in the query must match somewhere; results are ranked so
// name matches surface first (instant context under time pressure).

function fieldText(person) {
  return {
    name: (person.name || '').toLowerCase(),
    organization: (person.organization || '').toLowerCase(),
    role: (person.role || '').toLowerCase(),
    email: (person.email || '').toLowerCase(),
    notes: (person.notes || '').toLowerCase(),
    tags: (person.tags || []).join(' ').toLowerCase(),
  }
}

const WEIGHTS = { name: 100, organization: 40, role: 30, tags: 30, email: 20, notes: 10 }

export function searchPeople(people, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return people

  const scored = []
  for (const person of people) {
    const fields = fieldText(person)
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

// Sort options for the People list. `lastByPerson` maps person id → their most
// recent interaction timestamp (ISO string), used by the activity-based sorts.
export const PEOPLE_SORTS = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'recent', label: 'Recent activity' },
  { value: 'tier', label: 'Tier (closest first)' },
]

const TIER_SORT_RANK = { inner: 0, close: 1, network: 2 }

export function sortPeople(people, sort, lastByPerson) {
  if (sort === 'relevance') return people // keep searchPeople's match ranking
  const byName = (a, b) => (a.name || '').localeCompare(b.name || '')

  if (sort === 'tier') {
    // Inner circle → close → network → unsorted, alphabetical within each.
    const rank = (p) => TIER_SORT_RANK[p.tier] ?? 3
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
