// Household + members model. A household has N members (couple, family,
// roommates — any size). Tasks/lists are assigned to a member id or 'anyone'.
//
// MULTITENANCY: in the live app this comes from the `households` /
// `household_members` tables scoped by RLS, and `currentMember` is derived from
// the signed-in user. For now (demo / pre-Supabase) it lives in localStorage so
// the whole members + assignee UX is buildable and testable. The stored
// assignee values are member ids (stable), so renaming a member never rewrites
// task data. Legacy values ('me' | 'partner' | 'either') are mapped on read.
import { formatJoinCode } from './joinCode'

const KEY = 'salernidex-household'
const LEGACY = 'salernidex-members'

const rid = (p = 'm-') => p + Math.random().toString(36).slice(2, 8)

// The join code is the ONLY thing standing between a stranger and a household —
// join_household() adds whoever presents it, with no approval step — so it has
// to be treated as a password, not a friendly nickname. Three properties matter:
//   • 12 chars over a 31-char alphabet ≈ 59 bits, on par with the DB default's
//     12 hex chars. The old 6 chars was ~30 bits: guessable in bulk.
//   • drawn from the CSPRNG, not Math.random() (a PRNG whose state is
//     recoverable from its own output).
//   • rejection-sampled — a plain `% 31` over 0-255 would favor the first
//     8 letters, since 256 isn't a multiple of 31.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no ambiguous chars
const CODE_LENGTH = 12

function genCode() {
  const ceiling = 256 - (256 % CODE_ALPHABET.length) // 248 — discard bytes above
  let s = ''
  while (s.length < CODE_LENGTH) {
    const bytes = new Uint8Array(CODE_LENGTH)
    globalThis.crypto.getRandomValues(bytes)
    for (const b of bytes) {
      if (b < ceiling && s.length < CODE_LENGTH) s += CODE_ALPHABET[b % CODE_ALPHABET.length]
    }
  }
  return formatJoinCode(s)
}

// A fresh, friendly join code (ABC-DEF). Used by the live household hook when
// regenerating the DB code, and by the demo regenerate below.
export function newJoinCode() {
  return genCode()
}

function defaults() {
  // Migrate names from the old two-field settings if present.
  let members = [
    { id: 'm-1', name: 'Me' },
    { id: 'm-2', name: 'Partner' },
  ]
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY) || 'null')
    if (legacy)
      members = [
        { id: 'm-1', name: legacy.me || 'Me' },
        { id: 'm-2', name: legacy.partner || 'Partner' },
      ]
  } catch {
    /* ignore */
  }
  return { name: 'Our Household', join_code: genCode(), members, current_member_id: 'm-1' }
}

function load() {
  try {
    const h = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (h && Array.isArray(h.members) && h.members.length) return h
  } catch {
    /* ignore */
  }
  return save(defaults())
}

function save(h) {
  localStorage.setItem(KEY, JSON.stringify(h))
  return h
}

// ---- household ----
export function getHousehold() {
  return load()
}
export function setHousehold(h) {
  if (h && Array.isArray(h.members)) save(h)
}
// Forget the hydrated household on sign-out so the next user (or the signed-out
// state) never reads the previous user's cached household — load() otherwise
// falls back to a fabricated default and never returns null.
export function clearHousehold() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
export function setHouseholdName(name) {
  save({ ...load(), name })
}
export function regenerateJoinCode() {
  const code = genCode()
  save({ ...load(), join_code: code })
  return code
}
// Demo stand-in for the live "leave + join another household" flow: resets to a
// fresh, empty household with just you.
export function leaveHousehold() {
  return save({
    name: 'New Household',
    join_code: genCode(),
    members: [{ id: 'm-1', name: 'Me' }],
    current_member_id: 'm-1',
  })
}

// ---- members ----
export function members() {
  return load().members
}
// How many people are in the active household. Drives progressive disclosure of
// the sharing UI: a solo household (just you) hides the private/shared and
// assignee controls and the member filter — there's no one to share with or
// assign to yet. Reads the same synchronous cache useHousehold hydrates.
export function memberCount() {
  return load().members.length
}
export function isSolo() {
  return memberCount() <= 1
}
export function currentMemberId() {
  return load().current_member_id
}
// The current member's linked self contact card id (live mode). null in demo,
// or before an existing member has linked one.
export function currentPersonId() {
  return currentMember()?.person_id || null
}
export function currentMember() {
  const h = load()
  return h.members.find((m) => m.id === h.current_member_id) || h.members[0] || null
}
export function setCurrentMember(id) {
  save({ ...load(), current_member_id: id })
}
// Resolve a member id to a display name. Returns null for ids we don't know
// (e.g. a live auth user id that isn't linked to a member yet).
export function memberName(id) {
  if (!id) return null
  return load().members.find((m) => m.id === id)?.name || null
}
export function addMember(name) {
  const h = load()
  const m = { id: rid(), name: (name || '').trim() || 'Member' }
  save({ ...h, members: [...h.members, m] })
  return m
}
export function renameMember(id, name) {
  const h = load()
  save({ ...h, members: h.members.map((m) => (m.id === id ? { ...m, name } : m)) })
}
export function removeMember(id) {
  const h = load()
  const remaining = h.members.filter((m) => m.id !== id)
  const current = h.current_member_id === id ? remaining[0]?.id || null : h.current_member_id
  save({ ...h, members: remaining, current_member_id: current })
}

// ---- assignee helpers (member-id based, legacy-tolerant) ----
export function normalizeAssignee(value) {
  const ms = members()
  if (!value || value === 'either' || value === 'anyone') return 'anyone'
  if (value === 'me') return ms[0]?.id || 'anyone'
  if (value === 'partner') return ms[1]?.id || 'anyone'
  return value // already a member id
}
export function assigneeOptions() {
  return [
    { value: 'anyone', label: 'Anyone' },
    ...members().map((m) => ({ value: m.id, label: m.name, avatar_url: m.avatar_url || null })),
  ]
}
export function assigneeLabel(value) {
  const v = normalizeAssignee(value)
  if (v === 'anyone') return 'Anyone'
  return members().find((m) => m.id === v)?.name || 'Anyone'
}

// Who a NEW task starts out belonging to. Once there's more than one member,
// that's you: a task you just typed is yours until you hand it over, and
// "Anyone" made every new task nobody's in particular — the state a shared list
// quietly rots into. The form still shows Who up front so opening it back up to
// the household is one tap.
//
// A solo household has no one to distinguish, so it stays 'anyone' — otherwise
// every row would carry a pointless "Me" chip and the assignee UI (hidden by
// isSolo) would have nothing to explain it.
export function defaultAssignee() {
  return isSolo() ? 'anyone' : currentMemberId() || 'anyone'
}

// ---- backward-compat shims (used by ImportExport's settings payload) ----
export function memberNames() {
  const ms = members()
  return { me: ms[0]?.name || 'Me', partner: ms[1]?.name || 'Partner' }
}
export function setMemberNames({ me, partner } = {}) {
  const h = load()
  const ms = [...h.members]
  if (ms[0] && me != null) ms[0] = { ...ms[0], name: me }
  if (ms[1] && partner != null) ms[1] = { ...ms[1], name: partner }
  save({ ...h, members: ms })
}
