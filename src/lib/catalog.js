// Recent-items catalog ("what we usually buy"). Every item added to a non-private
// list is remembered per household so typing it again autocompletes — the way
// AnyList/Bring keep a master item list. Because checked items get cleared after
// a shopping run (list_items rows are deleted), the catalog is the durable memory
// that survives the clear; it's a derived frequency cache, regenerable from use,
// so it's intentionally NOT part of the portable backup.
//
// An entry: { id, household_id, text, norm, category, use_count, last_used_at }.
// `norm` is the dedupe/match key; `category` is the last aisle the item went to,
// so tapping a suggestion refiles it without re-guessing.

// Match/dedupe key: trimmed, lowercased, inner whitespace collapsed.
export function catalogKey(text) {
  return (text || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

// Fold a list of list_items into catalog entries (demo seed + a fallback when the
// catalog table is empty/absent). Counts repeats, keeps the most-recent non-null
// category. Headings and blank rows are skipped.
export function buildCatalog(items) {
  const byKey = new Map()
  for (const it of items || []) {
    if (it.is_heading) continue
    const norm = catalogKey(it.text)
    if (!norm) continue
    const at = it.created_at || ''
    const prev = byKey.get(norm)
    if (!prev) {
      byKey.set(norm, {
        id: it.id,
        text: it.text.trim(),
        norm,
        category: it.category || null,
        use_count: 1,
        last_used_at: at,
      })
    } else {
      prev.use_count += 1
      if (at >= prev.last_used_at) {
        prev.last_used_at = at
        prev.text = it.text.trim()
        if (it.category) prev.category = it.category
      }
    }
  }
  return [...byKey.values()]
}

// Return the catalog with one item's use recorded: bumps an existing entry's
// count / recency / category, or appends a fresh entry. Pure — caller persists.
export function bumpCatalog(catalog, { text, category = null, at, id, household_id = null }) {
  const norm = catalogKey(text)
  if (!norm) return catalog
  const existing = catalog.find((e) => e.norm === norm)
  if (existing) {
    const next = {
      ...existing,
      text: text.trim(),
      use_count: existing.use_count + 1,
      last_used_at: at,
      // Remember the aisle only when one was supplied (standard items pass null
      // and shouldn't wipe a grocery item's learned aisle).
      category: category || existing.category,
    }
    return catalog.map((e) => (e.norm === norm ? next : e))
  }
  return [
    ...catalog,
    { id, household_id, text: text.trim(), norm, category, use_count: 1, last_used_at: at },
  ]
}

// Rank catalog entries for what's been typed. Prefix matches rank above
// mid-word/substring matches; ties break on use_count then recency. `exclude` is
// a set/array of norms already on the list, so we never suggest a dupe. An empty
// query returns nothing (suggestions appear only once the user starts typing).
export function suggestItems(catalog, query, { exclude = [], limit = 6 } = {}) {
  const q = catalogKey(query)
  if (!q) return []
  const skip = new Set((exclude || []).map(catalogKey))
  return (catalog || [])
    .filter((e) => e.norm.includes(q) && !skip.has(e.norm))
    .map((e) => ({ ...e, _prefix: e.norm.startsWith(q) ? 0 : 1 }))
    .sort(
      (a, b) =>
        a._prefix - b._prefix ||
        b.use_count - a.use_count ||
        (b.last_used_at || '').localeCompare(a.last_used_at || ''),
    )
    .slice(0, limit)
    .map(({ _prefix, ...e }) => e)
}
