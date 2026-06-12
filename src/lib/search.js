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
