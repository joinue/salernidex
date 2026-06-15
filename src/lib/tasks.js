import { nextOccurrence } from './recurrence'

// Date + bucketing helpers for tasks. All dates are 'YYYY-MM-DD' strings,
// compared in local time so "today" means the user's today.

function parseLocal(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function todayLocal() {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

export function isoDateIn(days) {
  const d = new Date(Date.now() + days * 86400000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function daysUntilDue(dateStr) {
  if (!dateStr) return null
  return Math.round((parseLocal(dateStr) - todayLocal()) / 86400000)
}

// Compact local time label: '15:00' → '3 PM', '09:30' → '9:30 AM'. The :00 is
// dropped on the hour to keep chips short (design law: space-efficient). Accepts
// 'HH:MM' or 'HH:MM:SS'; null/'' → null.
export function timeLabel(timeStr) {
  if (!timeStr) return null
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 || 12
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ampm}` : `${h12} ${ampm}`
}

// The due chip's text: relative date, with the time appended when the task is
// timed ("Today, 3 PM" / "2d overdue, 8 AM"). timeStr is ignored without a date.
export function dueLabel(dateStr, timeStr = null) {
  const d = daysUntilDue(dateStr)
  if (d === null) return null
  const date =
    d < 0
      ? `${-d}d overdue`
      : d === 0
        ? 'Today'
        : d === 1
          ? 'Tomorrow'
          : d < 7
            ? `in ${d}d`
            : parseLocal(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const time = timeLabel(timeStr)
  return time ? `${date}, ${time}` : date
}

// 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'none'
export function dueState(dateStr) {
  const d = daysUntilDue(dateStr)
  if (d === null) return 'none'
  if (d < 0) return 'overdue'
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  return 'upcoming'
}

// A task is deferred while its start date is still in the future — it's parked
// until then (hidden from Today + the sender, parked under Upcoming).
export function isDeferred(task) {
  const d = daysUntilDue(task.start_date)
  return d !== null && d > 0
}

// "Starts Tomorrow" / "Starts in 3d" / "Starts Jun 20" — only meaningful while
// the task is still deferred. Returns null otherwise.
export function startLabel(task) {
  return isDeferred(task) ? `Starts ${dueLabel(task.start_date)}` : null
}

// Section bucket for an open top-level task. A deferred task waits under Upcoming
// regardless of its due date — you asked not to see it yet.
export function taskBucket(task) {
  if (isDeferred(task)) return 'upcoming'
  const s = dueState(task.due_date)
  if (s === 'overdue') return 'overdue'
  if (s === 'today') return 'today'
  if (s === 'none') return 'someday'
  return 'upcoming'
}

// Priority levels (match Apple Reminders): 0 none · 1 low · 2 medium · 3 high.
// PRIORITY_OPTIONS is ascending for the form's segmented picker.
export const PRIORITY_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Low' },
  { value: 2, label: 'Med' },
  { value: 3, label: 'High' },
]
const PRIORITY_LABELS = { 1: 'Low', 2: 'Medium', 3: 'High' }
export function priorityLabel(p) {
  return PRIORITY_LABELS[p] || 'None'
}

// Soonest-due-first comparator: overdue and near dates float up, undated tasks
// sink to the bottom. ISO 'YYYY-MM-DD' strings sort correctly as plain strings.
// Ties on the same date order by time (all-day first, then earliest), then by
// higher priority, then by creation order — so this is also the priority sort on
// surfaces that don't carry the Tasks page's manual order (Today, linked tasks).
function compareWhen(a, b, ad, bd) {
  if (ad !== bd) return ad < bd ? -1 : 1
  const at = a.due_time || ''
  const bt = b.due_time || ''
  if (at !== bt) {
    if (!at) return -1 // all-day sorts to the top of the day
    if (!bt) return 1
    return at < bt ? -1 : 1
  }
  const ap = a.priority || 0
  const bp = b.priority || 0
  if (ap !== bp) return bp - ap // higher priority first
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
}

export function byDue(a, b) {
  return compareWhen(a, b, a.due_date || '9999-99-99', b.due_date || '9999-99-99')
}

// Upcoming sort: a deferred task is keyed on its start date — when it wakes up is
// what "coming up next" means for it — while everything else keys on its due
// date. Without this, a task that starts in two weeks but happens to carry a
// nearer due date would wrongly jump to the top of Upcoming.
export function byUpcoming(a, b) {
  const ad = (isDeferred(a) ? a.start_date : a.due_date) || '9999-99-99'
  const bd = (isDeferred(b) ? b.start_date : b.due_date) || '9999-99-99'
  return compareWhen(a, b, ad, bd)
}

// Distinct area names currently in use, alphabetical — feeds TaskForm's
// autocomplete and the Tasks-page filter pills so areas stay consistent
// instead of fragmenting on typos.
export function areaNames(tasks) {
  const seen = new Set()
  for (const t of tasks) {
    const a = (t.area || '').trim()
    if (a) seen.add(a)
  }
  return [...seen].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
}

// Distinct tags in use across the given tasks, alphabetical — feeds the form's
// tag autocomplete and the Tasks-page tag filter (keeps tags from fragmenting).
export function taskTags(tasks) {
  const seen = new Set()
  for (const t of tasks) for (const tag of t.tags || []) if (tag) seen.add(tag)
  return [...seen].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
}

// Completion history for a task, newest first.
export function completionsFor(taskId, completions = []) {
  return completions
    .filter((c) => c.task_id === taskId)
    .sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1))
}

export function lastCompletion(taskId, completions = []) {
  return completionsFor(taskId, completions)[0] || null
}

// Local 'YYYY-MM-DD' for an ISO timestamp — the calendar day a check-off lands
// on in the user's timezone (completed_at is stored UTC).
function localDay(iso) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Time-of-day label for an ISO timestamp ('3 PM') — the right-aligned stamp on
// each Done-log row. Reuses timeLabel so it matches due-time formatting.
export function completionTime(iso) {
  const d = new Date(iso)
  return timeLabel(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
}

// Friendly header for a completion day: Today / Yesterday / weekday within the
// last week / 'Mon, Jun 9' beyond that.
export function dayLabel(dayStr) {
  const daysAgo = -daysUntilDue(dayStr)
  if (daysAgo <= 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'
  const d = parseLocal(dayStr)
  if (daysAgo < 7) return d.toLocaleDateString(undefined, { weekday: 'long' })
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

// The "Done" logbook: every check-off as a dated event, grouped by day (newest
// first, newest within each day first). Built from the completion log so
// recurring tasks — which roll forward and never carry completed_at — still
// appear the day they were done. Modern one-offs are logged too, so they come
// from the same source; legacy one-offs that predate the log are folded in via
// their completed_at. `keep(task)` applies the member/area/tag filters. Subtasks
// are excluded (they aren't logged and don't belong in the log).
export function completionLog(tasks, completions = [], keep = () => true) {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const logged = new Set()
  const events = []
  for (const c of completions) {
    const task = byId.get(c.task_id)
    if (!task || task.parent_id || !keep(task)) continue
    logged.add(task.id)
    events.push({ id: c.id, task, completedAt: c.completed_at, completedBy: c.completed_by || null })
  }
  for (const t of tasks) {
    if (t.parent_id || !t.completed_at || logged.has(t.id) || !keep(t)) continue
    events.push({ id: t.id, task: t, completedAt: t.completed_at, completedBy: null })
  }
  events.sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1))
  const groups = []
  const index = new Map()
  for (const e of events) {
    const day = localDay(e.completedAt)
    let g = index.get(day)
    if (!g) {
      g = { day, label: dayLabel(day), events: [] }
      index.set(day, g)
      groups.push(g)
    }
    g.events.push(e)
  }
  return groups
}

// Trim a completion log (from completionLog) to a recent window for inline
// display: keep events from the last `withinDays` days, capped at `max` total —
// whichever limit bites first. Groups are already newest-first, so this walks
// forward and stops. Returns the trimmed groups plus how many events were left
// out, so the UI can offer to reveal the rest without a separate history page.
export function capCompletionLog(groups, { withinDays = 14, max = 30 } = {}) {
  const cutoff = isoDateIn(-withinDays)
  let kept = 0
  let omitted = 0
  const out = []
  for (const g of groups) {
    const room = g.day < cutoff ? 0 : max - kept
    if (room <= 0) {
      omitted += g.events.length
    } else if (g.events.length <= room) {
      out.push(g)
      kept += g.events.length
    } else {
      out.push({ ...g, events: g.events.slice(0, room) })
      kept += room
      omitted += g.events.length - room
    }
  }
  return { groups: out, omitted }
}

// Subtask progress for a project, or null if it has no children.
// Heading rows are structure, not work — they never count.
export function projectProgress(taskId, all) {
  const children = all.filter((t) => t.parent_id === taskId && !t.is_heading)
  if (!children.length) return null
  return { done: children.filter((t) => t.completed_at).length, total: children.length }
}

// A task counts as a project only when it's explicitly flagged as one (the
// Task/Project toggle on the form). Projects open the full-page ProjectDetail;
// a plain task — even one with subtasks — stays a lightweight checklist that
// expands inline in the Tasks list.
export function isProject(task) {
  return !!task.is_project
}

// Tasks/projects linked to an entity (person | organization | group) via
// task_links — the reverse of ProjectDetail's "Related people & orgs". Open
// first (soonest-due), completed after; heading rows are structure, not work.
export function linkedTasksFor(entityType, entityId, tasks, taskLinks) {
  const ids = new Set(
    (taskLinks || [])
      .filter((l) => l.entity_type === entityType && l.entity_id === entityId)
      .map((l) => l.task_id),
  )
  const linked = tasks.filter((t) => ids.has(t.id) && !t.is_heading)
  const open = linked.filter((t) => !t.completed_at).sort(byDue)
  const done = linked
    .filter((t) => t.completed_at)
    .sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1))
  return [...open, ...done]
}

// On completing a recurring chore, roll its due date forward to the next
// scheduled occurrence (calendar-anchored) instead of closing it. One-offs just
// get a completed timestamp. When the series has ended (an `until` date passed,
// or every remaining occurrence is skipped) nextOccurrence returns null and the
// task closes like a one-off.
export function completionFields(task, done) {
  if (done && task.recurrence) {
    const next = nextOccurrence(task.recurrence, isoDateIn(0))
    if (next) return { due_date: next, completed_at: null }
  }
  return { completed_at: done ? new Date().toISOString() : null }
}

// "Skip this one": drop the current occurrence from a recurring task without
// logging it as done. Records the skipped date in the rule's exdates and rolls
// the due date to the next occurrence after it (honoring exdates + until). If
// nothing remains, the task closes. Returns null for non-recurring/undated tasks.
export function skipFields(task) {
  if (!task.recurrence || !task.due_date) return null
  const exdates = [...new Set([...(task.recurrence.exdates || []), task.due_date])]
  const recurrence = { ...task.recurrence, exdates }
  const next = nextOccurrence(recurrence, task.due_date)
  return next
    ? { recurrence, due_date: next, completed_at: null }
    : { recurrence, completed_at: new Date().toISOString() }
}
