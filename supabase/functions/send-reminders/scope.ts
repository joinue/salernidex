// Who is allowed to be told about a row — the two rules that decide it, ported
// for the sender.
//
// The client applies both ONCE, at the data layer (src/hooks/useData.js), and
// every view, badge, export and search inherits them for free. This function
// gets no such inheritance: it holds a service-role client, which bypasses RLS
// by design (it has to see every household to build everyone's digest), so the
// rules that RLS and useData would have applied have to be applied by hand.
//
// They weren't. `badgeCount` was given household-filtered arrays; the builders
// that produce the notification TEXT were handed the raw ones, so a check-in
// push could name a contact from a household the recipient has never heard of.
// Nothing applied privacy_level at all, so a contact marked "Private, only me"
// was pushed to the other member of the household by name.
//
// So: one module, applied once per member, feeding every builder including the
// badge. Both rules together, because they fail the same way — quietly, in a
// notification, to the one person who shouldn't see it.
//
// Ported rather than imported for the same reason as areas.ts / badge.ts /
// habitSchedule.ts: this is a bundled Deno function and can't reach the browser
// app's module graph. scope.parity.test.ts pins it against lib/privacy.js.

// Mirrors PRIVATE_LEVEL in src/lib/privacy.js (renamed from 'marc_only' in 0023).
export const PRIVATE_LEVEL = 'private'

// Rows belonging to one household. A row with no household_id is NOT included:
// every data table has carried the column `not null` since migration 0001, so an
// undefined one means the caller forgot to select it, and the safe direction for
// a rule that decides who gets told is to tell nobody.
export function forHousehold<T extends { household_id?: string }>(
  rows: T[] = [],
  householdId: string,
): T[] {
  return rows.filter((r) => r?.household_id === householdId)
}

// "Private — only me": visible only to its creator. `userId` is the auth user id
// (household_members.user_id), NOT the member id — created_by defaults to
// auth.uid() throughout the schema, which is the same footgun lib/privacy.js
// documents. Unknown creator (legacy rows) stays visible: never strand data.
export function visibleTo(row: any, userId: string): boolean {
  if (row?.privacy_level !== PRIVATE_LEVEL) return true
  return !row.created_by || !userId || row.created_by === userId
}

export function filterVisible<T>(rows: T[] = [], userId: string): T[] {
  return rows.filter((r) => visibleTo(r, userId))
}

// Both rules, one pass — what every builder in index.ts should be fed. Tables
// with no privacy_level column (key_dates, interactions) fall through the
// privacy test untouched, which is correct: they're reachable only through a
// person, and that person has already been filtered.
export function scopeFor<T extends { household_id?: string }>(
  rows: T[] = [],
  householdId: string,
  userId: string,
): T[] {
  return rows.filter((r) => r?.household_id === householdId && visibleTo(r, userId))
}
