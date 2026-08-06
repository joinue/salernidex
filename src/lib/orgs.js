// Organizations, and how people attach to them.
//
// A person↔org link is an `affiliations` row (migration 0033), not a column on
// the person: someone can sit on a board, contract for two firms, and carry a
// job history. Each link owns the `role` (their title AT THAT org), so "role"
// finally has an answer to "at which one".

// The org `type` picker. Order is the order shown in OrgForm.
export const ORG_TYPES = [
  'Company',
  'Government',
  'Nonprofit',
  'Community',
  'School / Education',
  'Healthcare',
  'Financial',
  'Insurance',
  'Utility',
  'Service Provider',
  'Contractor',
  'Retail / Store',
  'Restaurant',
  'Religious',
  'Club / Association',
  'Sports / Recreation',
  'Other',
]

// The types where the org is the REASON you have this contact — either you
// engage it (your plumber, your dentist, the power company) or you know these
// people through it (church, the swim club). For those, the org name under a
// person's name is the most useful thing on the row.
//
// Everything else — Company, Government, Nonprofit, Community, Other, and no
// type at all — is biography: where your friend happens to work. True, worth
// keeping, worth searching, but noise under their name in a list.
//
// This is a DEFAULT, not a verdict. An affiliation can override it either way
// via show_in_summary (your accountant at a firm typed "Company"), which is
// what the per-row toggle in PersonForm sets.
export const COUNTERPARTY_TYPES = new Set([
  'School / Education',
  'Healthcare',
  'Financial',
  'Insurance',
  'Utility',
  'Service Provider',
  'Contractor',
  'Retail / Store',
  'Restaurant',
  'Religious',
  'Club / Association',
  'Sports / Recreation',
])

export function isCounterparty(org) {
  return COUNTERPARTY_TYPES.has(org?.type)
}

// Does this affiliation earn a spot under the person's name? The explicit
// per-affiliation override wins; absent one (null/undefined), infer from the
// org's type.
export function showsInSummary(affiliation, org) {
  if (affiliation?.show_in_summary != null) return affiliation.show_in_summary
  return isCounterparty(org)
}

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

// An org is worth showing a Contact card for once it has any way to reach it.
export function orgHasContact(org) {
  return Boolean(org?.phone || org?.email || org?.website || org?.address)
}

// Normalize a typed website into something href-able. People type "acme.com";
// a bare host with no scheme resolves as a relative path and navigates nowhere.
export function websiteUrl(value) {
  const v = (value || '').trim()
  if (!v) return null
  return /^https?:\/\//i.test(v) ? v : `https://${v}`
}

// ---------- affiliations ----------

// An affiliation with an end date is history — it stays on the profile as
// "Former", but never labels the person or counts toward an org's headcount.
export const isCurrent = (a) => !a?.ended_on

export function affiliationsFor(personId, affiliations = []) {
  return affiliations.filter((a) => a.person_id === personId)
}

// Current affiliations, ordered the way they're displayed: primary first, then
// alphabetically by org name so the list is stable across renders (affiliation
// rows have no sort_order and arrive in whatever order the server returns).
export function currentAffiliations(personId, affiliations = [], orgsById) {
  const name = (a) => orgsById?.get(a.organization_id)?.name || ''
  return affiliationsFor(personId, affiliations)
    .filter(isCurrent)
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || name(a).localeCompare(name(b)))
}

// The one affiliation that speaks for the person where only one line fits.
//
// Prefers a showable link over the primary flag on purpose: someone employed at
// Acme (biography, flagged primary) who is ALSO your plumber at Riverbend
// should read as the plumber — that's the fact you need when their name comes
// up in a list. Falls back to the primary/first link so its `role` can still
// supply a title even when no org is shown.
export function leadAffiliation(personId, affiliations = [], orgsById) {
  const current = currentAffiliations(personId, affiliations, orgsById)
  if (!current.length) return null
  const showable = current.filter((a) => showsInSummary(a, orgsById?.get(a.organization_id)))
  return showable[0] || current[0]
}

// The line under a person's name, everywhere it appears (profile header, list
// rows, map pins, group members, project links). One implementation so those
// surfaces can't drift apart.
//
//   "Plumber at Riverbend Plumbing"  — counterparty org, title known
//   "Riverbend Plumbing"             — counterparty org, no title
//   "Software engineer"              — biography org: the title, not the employer
//   ""                               — a friend with nothing to say here
export function personSummary(person, affiliations = [], orgsById) {
  if (!person) return ''
  const lead = leadAffiliation(person.id, affiliations, orgsById)
  // people.role survives only as the standalone descriptor for contacts with no
  // affiliation at all ("Babysitter"); 0033 moved every org title onto the link.
  if (!lead) return person.role || ''
  const org = orgsById?.get(lead.organization_id)
  const role = lead.role || person.role || ''
  if (org && showsInSummary(lead, org)) return role ? `${role} at ${org.name}` : org.name
  return role
}

// How an affiliation reads on the person's profile, where the org name is
// already the row's title — so this is just the title and the tenure.
export function affiliationDetail(affiliation) {
  const parts = []
  if (affiliation?.role) parts.push(affiliation.role)
  if (affiliation?.ended_on) parts.push('Former')
  return parts.join(' · ')
}

// ---------- the org's side of the same link ----------

export function orgMemberIds(orgId, affiliations = [], { includeFormer = false } = {}) {
  return affiliations
    .filter((a) => a.organization_id === orgId && (includeFormer || isCurrent(a)))
    .map((a) => a.person_id)
}

// People currently at this org. Archived (soft-deleted) contacts are left out —
// the same rule the member list used when this was a column on people.
export function orgMembers(orgId, people = [], affiliations = [], opts) {
  const ids = new Set(orgMemberIds(orgId, affiliations, opts))
  return people.filter((p) => !p.deleted_at && ids.has(p.id))
}

export function orgFormerMembers(orgId, people = [], affiliations = []) {
  const ended = new Set(
    affiliations
      .filter((a) => a.organization_id === orgId && !isCurrent(a))
      .map((a) => a.person_id),
  )
  const current = new Set(orgMemberIds(orgId, affiliations))
  return people.filter((p) => !p.deleted_at && ended.has(p.id) && !current.has(p.id))
}
