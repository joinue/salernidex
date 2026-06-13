// organizations.name carries a UNIQUE constraint in the DB. Catch a collision
// on the client BEFORE the optimistic insert, so a duplicate name surfaces as a
// calm inline message instead of the org flashing into the list and then
// vanishing when the server rejects it. Case/space-insensitive to match how a
// person reads names ("Acme" == "  acme ").
export function orgNameTaken(name, orgs = [], excludeId = null) {
  const n = (name || '').trim().toLowerCase()
  if (!n) return false
  return orgs.some((o) => o.id !== excludeId && (o.name || '').trim().toLowerCase() === n)
}
