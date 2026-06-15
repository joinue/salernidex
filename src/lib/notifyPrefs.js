// Per-member notification preferences. localStorage is the synchronous cache
// the UI reads; in a signed-in session useData hydrates it from, and write-binds
// it to, the notification_prefs table (see bindNotifyRemote below) — same
// arrangement as lib/appPrefs.js. In demo it stays localStorage-only. The whole
// map rides in the JSON backup as settings.notifications.
const KEY = 'salernidex-notify-prefs' // { [memberId]: { ...prefs } }

export const DEFAULT_PREFS = {
  tasks: true,
  lists: true, // a list with a due date, reaching today/overdue
  nudges: true, // internal name; reads as "check-in reminders" everywhere a human sees it
  dates: true,
  fyi: false, // partner activity — off by default, it's the noisiest
  dates_lead_days: 7,
  digest_time: '08:00', // local HH:MM the morning summary push fires (server reads this)
}

const listeners = new Set()

// Optional live backend. useData binds a writer in a signed-in session so every
// change also persists to notification_prefs; null in demo / before sign-in.
let remoteWriter = null
export function bindNotifyRemote(fn) {
  remoteWriter = fn // fn(memberId, fullPrefs) | pass null to unbind
}

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {}
  } catch {
    return {}
  }
}

export function getPrefs(memberId) {
  return { ...DEFAULT_PREFS, ...(loadAll()[memberId || ''] || {}) }
}

export function setPrefs(memberId, patch) {
  const all = loadAll()
  const next = { ...getPrefs(memberId), ...patch }
  all[memberId || ''] = next
  localStorage.setItem(KEY, JSON.stringify(all))
  listeners.forEach((fn) => fn())
  // Push the full merged object (not just the patch) so the server row always
  // reflects complete client state — no partial-column drift.
  remoteWriter?.(memberId, next)
}

// Seed the cache from the server WITHOUT echoing back to it (used by useData on
// load and on realtime changes). Notifies subscribers so the UI re-renders.
export function hydrateNotifyPrefs(memberId, prefs) {
  const all = loadAll()
  all[memberId || ''] = { ...DEFAULT_PREFS, ...prefs }
  localStorage.setItem(KEY, JSON.stringify(all))
  listeners.forEach((fn) => fn())
}

// Backup round-trip: the full per-member map.
export function getAllPrefs() {
  return loadAll()
}

export function setAllPrefs(map) {
  if (!map || typeof map !== 'object') return
  localStorage.setItem(KEY, JSON.stringify(map))
  listeners.forEach((fn) => fn())
}

export function subscribePrefs(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
