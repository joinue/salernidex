// Manual ordering for tasks and list items.
//
// Rows carry a nullable numeric `sort_order`. Display order is
// (sort_order, created_at): rows that were never manually placed (null) sink
// below ranked ones in the order they were added, so legacy data and rapid
// entry both behave sensibly with zero writes.
//
// Moves use fractional ranks — dropping a row between neighbors writes ONE
// row (the midpoint). Only when a neighbor is unranked do we normalize the
// whole list to integers in its current visual order.

export function byOrder(a, b) {
  const ao = a.sort_order ?? Infinity
  const bo = b.sort_order ?? Infinity
  if (ao !== bo) return ao - bo
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
}

// `sorted` is the list as displayed (already sorted byOrder). Returns the
// minimal [{ id, sort_order }] updates that realize moving sorted[from] to
// position `to` (index in the array after removal).
export function moveUpdates(sorted, from, to) {
  if (from === to && sorted[from]?.sort_order != null) return []
  const moved = sorted[from]
  if (!moved) return []
  const rest = sorted.filter((_, i) => i !== from)
  const prev = rest[to - 1]
  const next = rest[to]

  // A null-ranked neighbor has no number to split against — normalize the
  // final arrangement to clean integers (lists here are small).
  if ((prev && prev.sort_order == null) || (next && next.sort_order == null)) {
    const arranged = [...rest.slice(0, to), moved, ...rest.slice(to)]
    return arranged
      .map((row, i) => ({ id: row.id, sort_order: i + 1 }))
      .filter((u, i) => arranged[i].sort_order !== u.sort_order)
  }

  let rank
  if (prev && next) rank = (prev.sort_order + next.sort_order) / 2
  else if (next) rank = next.sort_order - 1
  else if (prev) rank = prev.sort_order + 1
  else rank = 1
  return [{ id: moved.id, sort_order: rank }]
}
