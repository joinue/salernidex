// Duplicate detection for people. The goal is high-signal, low-noise: warn on
// the matches a human would call "that's the same person" (shared email, phone,
// or an identical name) and stay quiet otherwise. We surface, never block —
// the user always decides whether two records are really one.

export function normalizeEmail(email) {
  return (email || '').trim().toLowerCase()
}

// Compare phones by their digits, ignoring formatting and a leading country
// code. "+1 (555) 010-2020", "555-010-2020", and "15550102020" all collapse to
// the same key so they match.
export function normalizePhone(phone) {
  const digits = (phone || '').replace(/\D/g, '')
  if (!digits) return ''
  // Drop a leading US/Canada country code so 11-digit and 10-digit forms align.
  const trimmed = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits
  // Match on the last 10 digits when we have at least that many.
  return trimmed.length > 10 ? trimmed.slice(-10) : trimmed
}

// Lowercase, strip punctuation, and collapse whitespace so "J.R. O'Brien" and
// "JR OBrien" compare equal. Order-insensitive isn't worth the false positives,
// so "Smith, John" won't match "John Smith" — that's an acceptable miss.
export function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[.,'’\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Find existing people that look like `candidate`. Returns matches sorted
// strongest-first, each tagged with a confidence ('strong' | 'likely') and the
// human-readable reasons it matched. Soft-deleted people and `excludeId` (the
// record being edited) are ignored.
export function findDuplicates(candidate, people = [], excludeId = null) {
  const email = normalizeEmail(candidate.email)
  const phone = normalizePhone(candidate.phone)
  const name = normalizeName(candidate.name)

  const matches = []
  for (const person of people) {
    if (person.deleted_at) continue
    if (excludeId && person.id === excludeId) continue

    const reasons = []
    if (email && normalizeEmail(person.email) === email) reasons.push('same email')
    if (phone && normalizePhone(person.phone) === phone) reasons.push('same phone')
    if (name && normalizeName(person.name) === name) reasons.push('same name')
    if (!reasons.length) continue

    // Shared contact info is a strong signal; an identical name alone is only
    // "likely" (plenty of real people share a name).
    const strong = reasons.some((r) => r !== 'same name')
    matches.push({ person, confidence: strong ? 'strong' : 'likely', reasons })
  }

  const rank = { strong: 0, likely: 1 }
  return matches.sort((a, b) => rank[a.confidence] - rank[b.confidence])
}
