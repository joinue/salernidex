// Areas — the one lens over the app.
//
// An area is which part of your life something belongs to: Work, Home, the
// band. Exclusive (one per item, or none) and optional, which is the whole
// difference from tags — tags are the many cross-cutting labels, an area is the
// one partition, and it's the only axis you can scope the entire app to.
//
//   Assignee is who. Due date is when. Tags are what this needs.
//   An area is which part of your life.
//
// Pure, and working on plain rows, because the same answers are needed in three
// places that can't share a component: the shell switcher, every scoped view,
// and eventually the Swift port. Design and the reasoning behind each decision:
// docs/scopes/areas-and-tags.md.

import { byOrder } from './order'
import { PRIVATE_LEVEL } from './privacy'

// The "no lens" selection. A string rather than null so it round-trips through
// appPrefs and a data attribute without every caller special-casing nullish.
export const ALL_AREAS = 'all'

// Display order: manual rank first, then creation — the same rule tasks and
// list items use (lib/order.js), so a dragged area behaves like everything else.
// Archived areas are NOT dropped here; the manager wants to list them.
// `visibleAreas` is what the switcher should use.
export function sortAreas(areas = []) {
  return [...areas].sort(byOrder)
}

// The lenses THIS user is offered: shared ones, plus their own, minus archived.
//
// `userId` is the auth user id (auth.uid()), NOT the household_member id —
// areas.created_by defaults to auth.uid() like every other created_by in the
// schema. Passing a member id here would hide every area you made, which is the
// same footgun lib/privacy.js documents for the same reason.
//
// An area with no creator (backfilled or demo data) stays visible: never strand
// data behind an ownership test it predates.
export function visibleAreas(areas = [], userId) {
  return sortAreas(
    areas.filter((a) => !a.archived_at && (a.shared || !a.created_by || a.created_by === userId)),
  )
}

export function areaById(areas = [], id) {
  if (!id || id === ALL_AREAS) return null
  return areas.find((a) => a.id === id) || null
}

// Guard against a stale selection. The lens persists across launches, so the
// area it names can be deleted, archived, or un-shared by a co-member while
// you're away — and a filter pointing at a row that no longer exists shows an
// empty app with no explanation. Falls back to ALL_AREAS, which shows
// everything, because the failure mode of "too much" beats "nothing".
export function resolveAreaId(areas = [], areaId, userId) {
  if (!areaId || areaId === ALL_AREAS) return ALL_AREAS
  return visibleAreas(areas, userId).some((a) => a.id === areaId) ? areaId : ALL_AREAS
}

// Split rows for a scoped view: what's in this area, and what has no area at all.
//
// Both, deliberately. Unfiled items appear under every lens — an unfiled item is
// by definition not work-specific, and hiding it is how things get lost — but
// they belong in their own collapsed "No area" section rather than mixed in, so
// the lens stays legible and the section does the nudging a silent rule can't.
//
// Under ALL_AREAS there is nothing to distinguish, so everything is `scoped` and
// `unfiled` is empty. Callers can then render the same way in both modes.
export function scopeToArea(rows = [], areaId) {
  if (!areaId || areaId === ALL_AREAS) return { scoped: rows, unfiled: [] }
  const scoped = []
  const unfiled = []
  for (const row of rows) {
    if (row.area_id === areaId) scoped.push(row)
    else if (!row.area_id) unfiled.push(row)
  }
  return { scoped, unfiled }
}

// The area a new item should be filed under, given the active lens. ALL_AREAS
// means "don't file it", not "pick one for me" — guessing would put things
// somewhere the user never chose.
export function areaForNewItem(areaId) {
  return !areaId || areaId === ALL_AREAS ? null : areaId
}

// Does a NEW item created here default to private?
//
// Only meaningful on an unshared area: a shared area whose contents default to
// private is close to a contradiction — you shared it so you'd both see what's
// in it. The UI hides the toggle once an area is shared, and this re-checks
// rather than trusting the column, so a stale row (or an older client that
// shared an area without clearing the flag) can't quietly resurrect it. The
// database deliberately carries no constraint saying so — see 0040_areas.sql.
export function isDefaultPrivate(area) {
  return !!area && !area.shared && !!area.default_private
}

// The visibility a NEW item filed here should start with.
//
// A fallthrough, not an override: the area gets to say "private", and otherwise
// the member's own preference decides. That ordering is the whole reason this
// is a boolean rather than a privacy_level — the non-private default differs by
// entity (lists are 'family_shared', tasks and people 'shared'), so an area
// that stamped a level across all of them would silently re-default lists.
// See docs/scopes/areas-and-tags.md §5.2.
//
// `fallback` is whatever the caller would have used anyway, so a caller that
// knows nothing about areas keeps working by passing its existing default.
export function privacyForNewItem(area, fallback) {
  return isDefaultPrivate(area) ? PRIVATE_LEVEL : fallback
}

// ── Business areas, and the context a contact is known through ───────────────
//
// An area can be marked business-related (0042). A contact can name one as its
// CONTEXT — which part of your life you know them through.
//
// The rule that makes this safe, and the only rule that matters here: a context
// area is ADDITIVE. It changes what a contact's record OFFERS (business tiers,
// weekly cadences, renewal-shaped key dates) and lets that contact's check-in be
// muted along with the rest of its area. It must never decide whether the
// contact is SHOWN. §3.2's argument is untouched — a colleague who becomes a
// friend is still both, permanently, and still visible under every lens.
//
// The column is `context_area_id`, never `area_id`, so that the wrong change
// reads wrong at the call site. If you find yourself passing a contact to
// scopeToArea(), that is the mistake this naming exists to catch.

export function isBusinessArea(area) {
  return !!area?.is_business
}

// The context area of a contact (person or org), or null. Resolves through the
// full `areas` list rather than visibleAreas: a co-member's unshared area still
// has to render its name on a record you can see, exactly as §3.3 concluded for
// item chips.
export function contextAreaFor(contact, areas = []) {
  const id = contact?.context_area_id
  if (!id) return null
  return areas.find((a) => a.id === id) || null
}

// Does this contact's record get the business field set? False for an unfiled
// contact, and false for one filed under a personal area — which is the common
// case and the one that must stay unchanged.
export function isBusinessContact(contact, areas = []) {
  return isBusinessArea(contextAreaFor(contact, areas))
}

// The areas offered as a context. Same visibility rule as the lens switcher —
// you can only file someone under a lens you actually have.
export function contextAreaOptions(areas = [], userId) {
  return visibleAreas(areas, userId)
}

// ── Quiet areas ──────────────────────────────────────────────────────────────
// An area with show_on_today off never reaches Today, the nav or app-icon
// badges, or the push sweep. This is the half of the feature that actually
// fixes the complaint: filtering pages is the obvious part, but work should be
// able to DISAPPEAR when you're not at work — whether or not you remembered to
// touch the switcher.
//
// It is deliberately a plain boolean and not a schedule. This rule is ported
// into the send-reminders Edge Function (areas.ts) and, later, Swift — and
// docs/next-steps.md §3 records habitSchedule.ts as the hand port that silently
// drifted until a habit's weekly count came out wrong. A recurrence-shaped rule
// implemented three times is that failure waiting to happen; a set membership
// test is not.
//
// The set, computed once per render/sweep rather than per item.
export function mutedAreaIds(areas = []) {
  const out = new Set()
  // `=== false` on purpose: a row from before 0040, or a client that never
  // learned the column, has it undefined and must still reach Today. The safe
  // direction for a rule that HIDES things is to do nothing when unsure.
  for (const a of areas) if (a && a.show_on_today === false) out.add(a.id)
  return out
}

// Does this row reach Today? Unfiled rows always do — an item with no area
// can't be the thing you're trying to silence.
export function reachesToday(row, muted) {
  if (!muted || muted.size === 0) return true
  const id = row?.area_id
  return !id || !muted.has(id)
}

// The same question for a CONTACT, whose area lives on context_area_id.
//
// This is the half of the business-area feature that actually earns it: before
// 0042 there was no way to say "the business is closed". Switching Work off
// Today silenced its tasks and its lists, and its follow-up pings kept arriving
// on a Saturday, because contacts had no area at all and the rule had nothing to
// read. Now a contact you know through Work goes quiet with Work.
//
// A contact with no context — every personal one, and every contact that existed
// before this migration — always reaches Today. Muting Work can never silence a
// friend's birthday, which is the property §3.2 was protecting.
export function contactReachesToday(contact, muted) {
  return reachesToday({ area_id: contact?.context_area_id }, muted)
}

// How many rows sit in each area, for the switcher's quiet counts. The caller
// decides what counts — pass open tasks, not every task — and sums across entity
// types itself if it wants one number per lens. Unfiled rows are not counted:
// they belong to no area, and "All" already shows them.
export function areaCounts(rows = []) {
  const counts = new Map()
  for (const row of rows) {
    if (!row.area_id) continue
    counts.set(row.area_id, (counts.get(row.area_id) || 0) + 1)
  }
  return counts
}
