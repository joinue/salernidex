// Household + members model. A household has N members (couple, family,
// roommates — any size). Tasks/lists are assigned to a member id or 'anyone'.
//
// MULTITENANCY: in the live app this comes from the `households` /
// `household_members` tables scoped by RLS, and `currentMember` is derived from
// the signed-in user. For now (demo / pre-Supabase) it lives in localStorage so
// the whole members + assignee UX is buildable and testable. The stored
// assignee values are member ids (stable), so renaming a member never rewrites
// task data. Legacy values ('me' | 'partner' | 'either') are mapped on read.
const KEY = 'salernidex-household'
const LEGACY = 'salernidex-members'

const rid = (p = 'm-') => p + Math.random().toString(36).slice(2, 8)

function genCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no ambiguous chars
  let s = ''
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)]
  return `${s.slice(0, 3)}-${s.slice(3)}`
}

function defaults() {
  // Migrate names from the old two-field settings if present.
  let members = [{ id: 'm-1', name: 'Me' }, { id: 'm-2', name: 'Partner' }]
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY) || 'null')
    if (legacy) members = [{ id: 'm-1', name: legacy.me || 'Me' }, { id: 'm-2', name: legacy.partner || 'Partner' }]
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
  return save({ name: 'New Household', join_code: genCode(), members: [{ id: 'm-1', name: 'Me' }], current_member_id: 'm-1' })
}

// ---- members ----
export function members() {
  return load().members
}
export function currentMemberId() {
  return load().current_member_id
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
  return [{ value: 'anyone', label: 'Anyone' }, ...members().map((m) => ({ value: m.id, label: m.name }))]
}
export function assigneeLabel(value) {
  const v = normalizeAssignee(value)
  if (v === 'anyone') return 'Anyone'
  return members().find((m) => m.id === v)?.name || 'Anyone'
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
