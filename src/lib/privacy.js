// "Private — only me" enforcement. Rows whose privacy_level is 'marc_only'
// (renamed to 'private' at the go-live migration) are visible ONLY to their
// creator. Enforced once here at the data layer — every view, export, badge,
// and reminder inherits it — and again at the database by the go-live RLS
// policies in supabase/schema.sql. The full JSON backup deliberately bypasses
// this (your own backup must be lossless), via the all* arrays in useData.
export const PRIVATE_LEVEL = 'marc_only'

export function visibleTo(row, memberId) {
  if (row?.privacy_level !== PRIVATE_LEVEL) return true
  // Unknown creator (legacy rows) stays visible — never strand data.
  return !row.created_by || !memberId || row.created_by === memberId
}

export function filterVisible(rows, memberId) {
  return rows.filter((row) => visibleTo(row, memberId))
}
