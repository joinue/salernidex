// "Private — only me" enforcement. Rows whose privacy_level is 'marc_only'
// (renamed to 'private' at the go-live migration) are visible ONLY to their
// creator. Enforced once here at the data layer — every view, export, badge,
// and reminder inherits it — and again at the database by the go-live RLS
// policies in supabase/schema.sql. The full JSON backup deliberately bypasses
// this (your own backup must be lossless), via the all* arrays in useData.
export const PRIVATE_LEVEL = 'marc_only'

// `userId` is the auth user id (auth.uid()), NOT the household_member id —
// created_by defaults to auth.uid(), so the "is this mine?" test compares
// against the user, not the member. The two are distinct in live mode; passing
// a member id here would silently break private-row visibility.
export function visibleTo(row, userId) {
  if (row?.privacy_level !== PRIVATE_LEVEL) return true
  // Unknown creator (legacy rows) stays visible — never strand data.
  return !row.created_by || !userId || row.created_by === userId
}

export function filterVisible(rows, userId) {
  return rows.filter((row) => visibleTo(row, userId))
}
