// Server port of `badgeCount(buildAttention(...))` from src/lib/attention.js —
// the number on the app icon.
//
// Why the server has to compute this at all: the Badging API can only be driven
// from code that is actually running. src/App.jsx sets the badge from the open
// page, so while the app is closed — which is most of the time, and exactly when
// a badge earns its keep — nothing can move it. The one thing that does run with
// the app closed is the service worker's `push` handler, so the count has to
// arrive in the push payload for public/sw.js to apply.
//
// Why a port and not an import: this is a bundled Deno Edge Function and can't
// reach the browser app's module graph — same reason deadlines.ts and
// habitSchedule.ts exist, and it gets the same treatment: its own file with a
// parity test (badge.parity.test.ts) asserting it never disagrees with the
// client. A badge that disagrees with the list it claims to count is worse than
// no badge, because the number is all you can see from the home screen.
//
// The rule, straight from badgeCount: only what is actionable *now*.
//   • tasks due today or overdue
//   • lists whose due date has arrived or passed
//   • birthdays and key dates falling today
// Deliberately excluded, because a count that never reaches zero stops being
// read: relationship check-ins ('soft'), deadlines with days of slack left
// ('anytime'), and dates still inside their lead window ('upcoming').

export type BadgePrefs = { tasks?: boolean; lists?: boolean; dates?: boolean }

export type BadgeData = {
  tasks: any[]
  lists: any[]
  people: any[]
  keyDates: any[]
}

const monthDay = (iso: string) => (iso || '').slice(5) // 'MM-DD'

// Port of taskBucket() in src/lib/tasks.js. String comparison is safe and
// timezone-proof because both sides are 'yyyy-mm-dd' in household-local time.
function taskBucket(t: any, today: string): string {
  if (t.start_date && t.start_date > today) return 'upcoming' // deferred: parked until its day
  if (!t.due_date) return 'someday'
  if (t.due_date < today) return 'overdue'
  if (t.due_date === today) return 'today'
  if (t.due_kind === 'by') return 'anytime' // deadline with slack left
  return 'upcoming'
}

// Port of assignedToMe() at taskScope 'mine'. A step of a project inherits the
// project's owner when it has none of its own, so someone else's project doesn't
// badge your icon.
//
// The client also maps legacy assignee labels ('me' / 'partner' / 'either')
// through household.normalizeAssignee before comparing; the function has no
// access to that mapping, exactly like dueTasksToday() in index.ts. Any row
// still carrying a legacy label reads as another member's and is skipped by both
// the badge and the ping, so the two stay consistent with each other.
function assignedToMe(t: any, parent: any, memberId: string): boolean {
  const a = t.assignee ? t.assignee : parent ? parent.assignee : t.assignee
  return !a || a === 'anyone' || a === memberId
}

// `hidden` is the member's live snooze/dismissal keys, same target_key strings
// the client builds — so a dismissed item leaves the badge here too.
export function badgeCount(
  data: BadgeData,
  memberId: string,
  today: string,
  prefs: BadgePrefs,
  hidden: Set<string> = new Set(),
): number {
  const { tasks = [], lists = [], people = [], keyDates = [] } = data
  let n = 0

  if (prefs.tasks) {
    const byId = new Map(tasks.map((t: any) => [t.id, t]))
    for (const t of tasks) {
      if (t.completed_at || t.is_heading || t.is_project) continue
      // A project's dated step counts; loose subtasks of a plain task are
      // checklist detail and never reach Today.
      const parent = t.parent_id ? byId.get(t.parent_id) : null
      if (t.parent_id && !(parent && parent.is_project && t.due_date)) continue
      if (!assignedToMe(t, parent, memberId)) continue
      const bucket = taskBucket(t, today)
      // 'anytime' falls out here on purpose — that is precisely what badgeCount
      // does with a deadline that still has room.
      if (bucket !== 'overdue' && bucket !== 'today') continue
      if (hidden.has(`task:${t.id}`)) continue
      n++
    }
  }

  // Lists are household-shared and, unlike the list *push*, the badge doesn't
  // care about reminder_enabled or a reminder time: the in-app count shows any
  // list whose due date has landed, so the icon must agree.
  if (prefs.lists) {
    for (const l of lists) {
      if (!l.due_date || l.due_date > today) continue
      if (hidden.has(`list:${l.id}`)) continue
      n++
    }
  }

  // Day-of only. A birthday a week out is a heads-up in the app ('upcoming'),
  // never part of the count.
  if (prefs.dates) {
    const td = monthDay(today)
    const alive = new Map(people.filter((p: any) => !p.deleted_at).map((p: any) => [p.id, p]))
    for (const p of alive.values()) {
      if (!p.birthday || monthDay(p.birthday) !== td) continue
      if (hidden.has(`date:b-${p.id}`)) continue
      n++
    }
    for (const kd of keyDates) {
      if (!alive.has(kd.person_id)) continue
      const isToday = kd.annual ? monthDay(kd.date) === td : kd.date === today
      if (!isToday) continue
      if (hidden.has(`date:${kd.id}`)) continue
      n++
    }
  }

  return n
}
