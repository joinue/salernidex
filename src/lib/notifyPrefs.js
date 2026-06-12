// Per-member notification preferences. localStorage for now (demo-first);
// the live counterpart is the notification_prefs table in schema.sql. The
// whole map rides in the JSON backup as settings.notifications.
const KEY = 'salernidex-notify-prefs' // { [memberId]: { ...prefs } }

export const DEFAULT_PREFS = {
  tasks: true,
  nudges: true, // internal name; reads as "check-in reminders" everywhere a human sees it
  dates: true,
  fyi: false, // partner activity — off by default, it's the noisiest
  dates_lead_days: 7,
}

const listeners = new Set()

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
  all[memberId || ''] = { ...getPrefs(memberId), ...patch }
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
