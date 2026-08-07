// Server-side port of the deadline ("do it by X") head start in
// src/lib/reminders.js, used by send-reminders to give a push the same warning
// the in-app Today screen gives.
//
// Why a port and not an import: this runs on Deno inside a bundled Edge
// Function and can't reach into the browser app's module graph — same reason
// habitSchedule.ts exists. So it's a second implementation, which is exactly
// why it lives in its own file with a parity test (deadlines.parity.test.ts)
// asserting it never disagrees with the client.
//
// The rule: a task whose due_kind is 'by' is actionable now and its date is
// only a ceiling. Left alone, a push would arrive on the deadline morning —
// the one day the task is no longer flexible, which defeats the point. So a
// deadline landing within ANYTIME_DAYS rides the digest early.
//
// It never becomes an individual ping. A deadline with days left has not earned
// an interruption; the same call the client makes by keeping it out of the
// badge (see badgeCount in src/lib/reminders.js).

// Must match ANYTIME_DAYS in src/lib/reminders.js — the parity test pins this.
export const ANYTIME_DAYS = 7

export type DeadlineTask = {
  id: string
  title: string
  due_date?: string | null
  due_kind?: string | null
  start_date?: string | null
  parent_id?: string | null
  completed_at?: string | null
  assignee?: string | null
}

// 'yyyy-mm-dd' + n days, via UTC so no timezone can shift the day. Matches the
// string-only date arithmetic the rest of this function does.
export function isoPlusDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

// Deadlines landing after today and within the window, soonest first. Tasks
// already due (or overdue) are left out: dueTasksToday owns those, and by then
// a deadline is just a due task.
export function deadlinesAhead(
  tasks: DeadlineTask[],
  memberId: string,
  today: string,
  days: number = ANYTIME_DAYS,
): DeadlineTask[] {
  const limit = isoPlusDays(today, days)
  return (
    tasks
      .filter((t) => !t.parent_id && !t.completed_at && t.due_kind === 'by')
      .filter((t) => !!t.due_date && t.due_date > today && t.due_date <= limit)
      // A deferred task stays parked until its start date, deadline or not.
      .filter((t) => !t.start_date || t.start_date <= today)
      // Yours, or open to anyone — same bargain as dueTasksToday.
      .filter((t) => !t.assignee || t.assignee === 'anyone' || t.assignee === memberId)
      .sort((a, b) => (a.due_date! < b.due_date! ? -1 : a.due_date! > b.due_date! ? 1 : 0))
  )
}
