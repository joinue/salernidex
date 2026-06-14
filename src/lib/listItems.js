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
