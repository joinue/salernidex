// Quantity helpers for list items. `qty` is freeform text so groceries stay
// honest ("2", "2 lbs", "a dozen") rather than forcing a bare number — but the
// common case is a small count, so the editor's − / + step the leading number
// while preserving any trailing unit.

// Step the leading integer of a qty string by ±1, keeping a trailing unit.
// Empty/“1” behaves as a count of 1: stepping up → "2", down → "" (cleared,
// meaning the unlabeled default of one). A non-numeric qty ("a dozen") is left
// alone — there's nothing sensible to increment.
export function stepQty(qty, delta) {
  const raw = (qty || '').trim()
  const m = raw.match(/^(\d+)\s*(.*)$/)
  if (!raw) {
    // Blank = 1. Up → 2; down stays blank (can't go below one).
    return delta > 0 ? '2' : ''
  }
  if (!m) return raw // unparseable unit-only qty, leave as typed
  const n = parseInt(m[1], 10) + delta
  const unit = m[2].trim()
  if (n <= 1 && !unit) return '' // back to the unlabeled default of one
  return unit ? `${Math.max(n, 0)} ${unit}` : String(Math.max(n, 0))
}

// Units we recognize when a number leads the typed text, so "2 lbs chicken"
// folds the unit into the qty instead of the item name. A leading number with
// no known unit ("2 avocados") is still a count.
const QTY_UNITS = new Set([
  'lb',
  'lbs',
  'oz',
  'g',
  'kg',
  'ml',
  'l',
  'gal',
  'qt',
  'pt',
  'dozen',
  'doz',
  'pack',
  'packs',
  'pk',
  'ct',
  'count',
  'bag',
  'bags',
  'box',
  'boxes',
  'can',
  'cans',
  'bottle',
  'bottles',
  'bunch',
  'jar',
  'jars',
  'loaf',
  'head',
])

// Split a leading quantity off freeform add-item text so the count doesn't end
// up baked into the name. "2 milk" → { qty: '2', text: 'milk' }; "12 oz cream
// cheese" → { qty: '12 oz', text: 'cream cheese' }; "milk" or a bare "5" → no
// qty (a number with nothing after it is the item, not a count).
export function parseQty(input) {
  const raw = (input || '').trim()
  const m = raw.match(/^(\d+)\s+(.*)$/)
  if (!m) return { qty: '', text: raw }
  const [, n, rest] = m
  const um = rest.match(/^([a-zA-Z]+)\s+(.+)$/)
  if (um && QTY_UNITS.has(um[1].toLowerCase()) && um[2].trim()) {
    return { qty: `${n} ${um[1].toLowerCase()}`, text: um[2].trim() }
  }
  return { qty: n, text: rest.trim() }
}

// Split a qty into a count and a unit, treating blank as one. Returns null for
// something that can't be counted ("a dozen") — the caller decides what to do.
function qtyParts(qty) {
  const raw = (qty || '').trim()
  if (!raw) return { n: 1, unit: '' }
  const m = raw.match(/^(\d+)\s*(.*)$/)
  if (!m) return null
  return { n: parseInt(m[1], 10), unit: m[2].trim().toLowerCase() }
}

// Combine the qty already on a list with one being added again, for when the
// same item is entered twice. Returns null when they can't be combined — a
// non-numeric qty, or two different units ("2 lbs" + "3 oz") — and the caller
// should then keep them as separate rows rather than invent a number.
export function mergeQty(existing, added) {
  const a = qtyParts(existing)
  const b = qtyParts(added)
  if (!a || !b) return null
  if (a.unit && b.unit && a.unit !== b.unit) return null
  const unit = a.unit || b.unit
  const n = a.n + b.n
  if (n <= 1 && !unit) return ''
  return unit ? `${n} ${unit}` : String(n)
}

// Open (unchecked) item counts per list, for the index's "N items left".
//
// Section headings are rows in the same table but they are not items — counting
// them made "Add section" bump a standard list from "4 items left" to "5", which
// is the kind of number a user quietly stops trusting.
export function openCountsByList(listItems) {
  const open = {}
  for (const it of listItems || []) {
    if (it.checked_at || it.is_heading) continue
    open[it.list_id] = (open[it.list_id] || 0) + 1
  }
  return open
}

// Whether a qty is worth showing on the row: anything set and not just "1".
export function hasQty(qty) {
  const raw = (qty || '').trim()
  return raw !== '' && raw !== '1'
}

// Compact badge text for a qty on a row ("2" → "×2", "2 lbs" → "2 lbs").
export function qtyLabel(qty) {
  const raw = (qty || '').trim()
  if (!hasQty(raw)) return ''
  return /^\d+$/.test(raw) ? `×${raw}` : raw
}
