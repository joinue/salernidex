// Reminders: the things you want said out loud on a day, with nothing to do
// about them. "Bins go out Thursday." "Mum's birthday." "Insurance renews."
//
// Two kinds arrive here from different places and the page shows them as one
// list, because the difference is ours, not the user's:
//
//   stored   — a task row with is_reminder set (migration 0039). Editable,
//              assignable, snoozable, recurring, exactly like a task.
//   derived  — a birthday or key date computed from a contact, via
//              upcomingDates(). NOT stored as a reminder row, and that's the
//              point: people.birthday is the one place a birthday lives, so it
//              can't drift from the contact it belongs to, and editing it means
//              editing the person.
//
// Everything below is pure, and reads "today" through lib/tasks' helpers — so
// the tests pin the clock with fake timers, the way tasks.test.js does, rather
// than threading a `now` argument nothing else in the date layer takes.
import { upcomingDates } from './contact'
import { daysUntilDue, dueLabel, shortDate } from './tasks'

// How far ahead the page looks by default. A month is the horizon a date is
// useful at — long enough to buy a present, short enough that the list is still
// a list rather than a calendar.
export const HORIZON_DAYS = 30

// Is this row a reminder rather than a task? Kept here so a caller never has to
// know the column name, and so the one place that can change is this one.
export function isReminder(task) {
  return !!task?.is_reminder
}

// The fields a new reminder starts with. Assignable and shareable like any task
// — "bins go out" is somebody's turn, and a birthday is the household's. What
// it never gets: subtasks, headings, a project flag, or a deadline sense of a
// due date (a reminder happens ON its day; `by` would mean it has slack, which
// is a claim about work).
export function newReminderFields({ due_date = '', privacy_level = 'shared' } = {}) {
  return {
    title: '',
    due_date,
    due_time: '',
    recurrence: null,
    assignee: 'anyone',
    privacy_level,
    notes: '',
    is_reminder: true,
    due_kind: 'on',
  }
}

// One shape for both kinds, so the view renders a single list:
//   { key, kind, title, sub, dateIso, daysUntil, done, source }
// `source` carries the row (stored) or the derived entry, for the caller that
// needs to open the right editor.
function fromStored(r) {
  const daysUntil = daysUntilDue(r.due_date)
  return {
    key: `r-${r.id}`,
    kind: 'stored',
    title: r.title,
    sub: r.notes || '',
    dateIso: r.due_date || null,
    daysUntil,
    done: !!r.completed_at,
    source: r,
  }
}

function fromDerived(entry) {
  const who = entry.person?.name || ''
  // "Ada turns 40" reads like the thing you're being reminded of; "Birthday ·
  // Ada Lovelace" reads like a database row about her.
  const title =
    entry.kind === 'birthday'
      ? entry.turning
        ? `${who} turns ${entry.turning}`
        : `${who}'s birthday`
      : `${who} · ${entry.label}`
  return {
    key: entry.kind === 'birthday' ? `b-${entry.person.id}` : `k-${entry.keyDate.id}`,
    kind: 'derived',
    title,
    sub: entry.years ? `${entry.years} years` : '',
    dateIso: null, // upcomingDates works in days, not ISO — daysUntil is the truth here
    daysUntil: entry.daysUntil,
    done: false,
    source: entry,
  }
}

// Everything worth telling you about, soonest first. Stored reminders that are
// done, or dated beyond the horizon, drop out; overdue ones stay, because an
// unacknowledged reminder is the one case where the past still matters.
export function upcomingReminders(
  { reminders = [], people = [], keyDates = [] } = {},
  { withinDays = HORIZON_DAYS, includeDone = false } = {},
) {
  const stored = reminders
    .filter((r) => includeDone || !r.completed_at)
    .map(fromStored)
    // An undated reminder has nothing to be soonest about — it waits in its own
    // section rather than jumping the queue with daysUntil null.
    .filter((r) => r.daysUntil === null || r.daysUntil <= withinDays)

  const derived = upcomingDates(people, keyDates, withinDays).map(fromDerived)

  return [...stored, ...derived].sort((a, b) => {
    if (a.daysUntil === null) return 1
    if (b.daysUntil === null) return -1
    return a.daysUntil - b.daysUntil
  })
}

// Reminders with no date at all — kept, because "renew the passport" is a real
// thing to be reminded of before you know when.
export function undatedReminders(reminders = []) {
  return reminders.filter((r) => !r.completed_at && !r.due_date)
}

// The chip under a reminder: 'Today', 'in 3d', 'Jun 20', '2d ago'. Reads as
// when, never as how overdue — nothing is late, because there was never
// anything to do.
export function reminderWhen(item) {
  const d = item?.daysUntil
  if (d === null || d === undefined) return 'No date'
  if (d < 0) return `${-d}d ago`
  // A stored reminder has a real date, so dueLabel gives the nicer phrasing
  // (including 'Jun 20' once a relative one stops helping).
  const label = item.dateIso ? dueLabel(item.dateIso) : null
  if (label) return label
  // Derived entries carry days rather than an ISO date.
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  return `in ${d}d`
}

// Does this reminder look like it belongs to somebody? Drives the nudge to file
// it on the contact instead, where a date about a person can only live once.
// Deliberately conservative: a name has to appear as a whole word, and there has
// to be date-shaped language around it, or every reminder mentioning a housemate
// starts asking to be moved.
const DATE_WORDS = /\b(birthday|bday|anniversary|wedding|graduat|retire)/i
export function suggestsContactDate(title, people = []) {
  const text = (title || '').trim()
  if (!text || !DATE_WORDS.test(text)) return null
  for (const p of people) {
    if (p.deleted_at) continue
    const first = (p.name || '').split(/\s+/)[0]
    // Two is the floor, not three: Bo, Jo, Al and Li are names, and requiring
    // three excluded them entirely. The date-word test above is what keeps a
    // short name from matching prose.
    if (!first || first.length < 2) continue
    if (new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
      return { person: p, kind: /birthday|bday/i.test(text) ? 'birthday' : 'keydate' }
    }
  }
  return null
}

// Group the list into the sections the page shows. Overdue first (you haven't
// said "got it" yet), then today, then the horizon, then the undated tail.
export function groupReminders(items) {
  const groups = { overdue: [], today: [], soon: [], later: [], undated: [] }
  for (const item of items) {
    if (item.daysUntil === null) groups.undated.push(item)
    else if (item.daysUntil < 0) groups.overdue.push(item)
    else if (item.daysUntil === 0) groups.today.push(item)
    else if (item.daysUntil <= 7) groups.soon.push(item)
    else groups.later.push(item)
  }
  return groups
}

// Calendar-date label for a stored reminder's own row (the editor's summary).
export function reminderDateLabel(r) {
  return r?.due_date ? shortDate(r.due_date) : null
}
