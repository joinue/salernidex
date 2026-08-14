// Per-member app preferences: default visibility for new items, how the Tasks
// page opens, and the People-page sort. localStorage for now (demo-first) —
// same shape, listener model, and backup story as notifyPrefs; the whole map
// rides in the JSON backup as settings.preferences. The live home is the
// member_preferences table in supabase/schema.sql (wired at go-live, alongside
// notification_prefs). Theme stays per-device, so it is deliberately NOT here.
const KEY = 'salernidex-app-prefs' // { [memberId]: { ...prefs } }

// One-time fallback: the People-page sort used to live in its own
// (non-member-scoped) localStorage key. Seed it as the default so existing
// users keep their choice until they next change it — which writes into the
// per-member map and supersedes this.
const LEGACY_PEOPLE_SORT = (() => {
  try {
    return localStorage.getItem('salernidex-people-sort') || 'name'
  } catch {
    return 'name'
  }
})()

export const DEFAULT_APP_PREFS = {
  // Default visibility applied to NEW items (existing items keep their own).
  // Mirrors the per-form defaults these replace: tasks/people 'shared',
  // lists 'family_shared' (see TaskForm / ListForm / PersonForm).
  taskPrivacy: 'shared',
  listPrivacy: 'family_shared',
  personPrivacy: 'shared',
  // Tasks page default view.
  taskFilter: 'all', // 'all' (Everyone) | <member id>
  showCompleted: false, // start with the Done section expanded
  // Whose tasks reach Today — and, with it, the tab count, the app-icon badge
  // and the push reminders. 'mine' shows what's assigned to you plus anything
  // left open to Anyone; 'all' is the old whole-household behavior.
  todayScope: 'mine', // 'mine' | 'all'
  // People page default sort: 'name' | 'recent' | 'tier' (lib/search.js).
  peopleSort: LEGACY_PEOPLE_SORT,
  // Projects index sort: 'recent' | 'name' | 'due' (lib/tasks.byProjects).
  projectsSort: 'recent',
  // Notebook sort: 'edited' | 'created' | 'title' (lib/notes.sortNotes). Only
  // the ordering lives here. The notebook's other two controls deliberately
  // don't: list-vs-gallery is a per-device call about screen space (localStorage,
  // like the sidebar's collapsed state), and the tag filter isn't persisted at
  // all — a filter that survives a relaunch hides notes without saying so, which
  // reads as data loss. Sort only ever reorders.
  notesSort: 'edited',
}

const listeners = new Set()

// Optional live backend. In a signed-in session useData binds a writer here so
// every change also persists to the member_preferences table; in demo (or
// before sign-in) it stays null and we're localStorage-only. localStorage
// doubles as the offline cache the UI reads synchronously — same arrangement
// useHousehold uses for the household cache.
let remoteWriter = null
export function bindAppPrefsRemote(fn) {
  remoteWriter = fn // fn(memberId, fullPrefs) | pass null to unbind
}

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {}
  } catch {
    return {}
  }
}

export function getAppPrefs(memberId) {
  return { ...DEFAULT_APP_PREFS, ...(loadAll()[memberId || ''] || {}) }
}

export function setAppPrefs(memberId, patch) {
  const all = loadAll()
  const next = { ...getAppPrefs(memberId), ...patch }
  all[memberId || ''] = next
  localStorage.setItem(KEY, JSON.stringify(all))
  listeners.forEach((fn) => fn())
  // Push the full merged object (not just the patch) so the server row always
  // reflects complete client state — no partial-column drift.
  remoteWriter?.(memberId, next)
}

// Seed the cache from the server WITHOUT echoing back to it (used by useData on
// load and on realtime changes). Notifies subscribers so the UI re-renders.
export function hydrateAppPrefs(memberId, prefs) {
  const all = loadAll()
  all[memberId || ''] = { ...DEFAULT_APP_PREFS, ...prefs }
  localStorage.setItem(KEY, JSON.stringify(all))
  listeners.forEach((fn) => fn())
}

// Backup round-trip: the full per-member map.
export function getAllAppPrefs() {
  return loadAll()
}

export function setAllAppPrefs(map) {
  if (!map || typeof map !== 'object') return
  localStorage.setItem(KEY, JSON.stringify(map))
  listeners.forEach((fn) => fn())
}

export function subscribeAppPrefs(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
