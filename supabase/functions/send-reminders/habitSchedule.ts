// Server-side port of the habit schedule/success rules in src/lib/habits.js
// (and the occursOn half of src/lib/recurrence.js), used by send-reminders to
// decide whether a habit is worth nudging about today.
//
// Why a port and not an import: this runs on Deno inside a bundled Edge
// Function and can't reach into the browser app's module graph. So it's a
// second implementation — which is exactly why it lives in its own file with
// its own tests (habitSchedule.test.ts) instead of buried in index.ts. When the
// rules in lib/habits.js change, they change here too, and the tests here are
// written to mirror the cases in src/lib/habits.test.js.
//
// The one deliberate difference: everything here works from 'yyyy-mm-dd'
// strings via UTC-noon Dates, so no DST or timezone can shift a day. The client
// gets the same answers because it only ever compares local-day strings too.

export type Habit = {
  id: string
  name: string
  polarity?: 'build' | 'limit' | 'track'
  target?: number | null
  active_days?: number[] | null
  weekly_target?: number | null
  rrule?: Rule | null
}

export type Rule = {
  freq?: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval?: number
  anchor?: string
  weekdays?: number[]
  weekday?: number
  monthday?: number
  month?: number
  setpos?: number
  until?: string
  exdates?: string[]
}

export type Entry = { habit_id: string; date: string; value?: number; skipped?: boolean }

const DAY = 86400000
const utc = (iso: string) => new Date(`${iso}T12:00:00Z`) // noon: DST-proof
export const dowOf = (iso: string) => utc(iso).getUTCDay() // 0=Sun..6=Sat
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()

// Port of lib/recurrence.js occursOn: does `rule` land on this ISO date?
// Anchored phase for "every N" intervals; honors until/exdates.
export function ruleOccursOn(rule: Rule | null | undefined, iso: string): boolean {
  if (!rule || !rule.freq) return false
  if (rule.until && iso > rule.until) return false
  if (rule.exdates?.includes(iso)) return false
  const d = utc(iso)
  const a = utc(rule.anchor || iso)
  const interval = rule.interval || 1
  switch (rule.freq) {
    case 'daily': {
      const diff = Math.round((d.getTime() - a.getTime()) / DAY)
      return diff >= 0 && diff % interval === 0
    }
    case 'weekly': {
      if (!rule.weekdays?.includes(d.getUTCDay())) return false
      const wsNum = (x: Date) => Math.floor(x.getTime() / DAY) - x.getUTCDay()
      const weeks = Math.round((wsNum(d) - wsNum(a)) / 7)
      return weeks >= 0 && weeks % interval === 0
    }
    case 'monthly': {
      const months =
        (d.getUTCFullYear() - a.getUTCFullYear()) * 12 + (d.getUTCMonth() - a.getUTCMonth())
      if (months < 0 || months % interval !== 0) return false
      if (rule.setpos) {
        const y = d.getUTCFullYear()
        const m = d.getUTCMonth()
        let day: number
        if (rule.setpos === -1) {
          const last = daysInMonth(y, m)
          const lastDow = new Date(Date.UTC(y, m, last)).getUTCDay()
          day = last - ((lastDow - rule.weekday! + 7) % 7)
        } else {
          const firstDow = new Date(Date.UTC(y, m, 1)).getUTCDay()
          day = 1 + ((rule.weekday! - firstDow + 7) % 7) + (rule.setpos - 1) * 7
          if (day > daysInMonth(y, m)) return false
        }
        return d.getUTCDate() === day
      }
      return (
        d.getUTCDate() ===
        Math.min(rule.monthday!, daysInMonth(d.getUTCFullYear(), d.getUTCMonth()))
      )
    }
    case 'yearly': {
      const years = d.getUTCFullYear() - a.getUTCFullYear()
      if (years < 0 || years % interval !== 0) return false
      return (
        d.getUTCMonth() === rule.month &&
        d.getUTCDate() === Math.min(rule.monthday!, daysInMonth(d.getUTCFullYear(), rule.month!))
      )
    }
  }
  return false
}

// Port of isSuccess: null for `track` (success doesn't apply), boolean otherwise.
// A missing entry is value 0 — which for a `limit` habit is a clean day.
export function habitSuccess(h: Habit, value: number): boolean | null {
  if (h.polarity === 'track') return null
  if (h.polarity === 'limit') return value <= (h.target ?? 0)
  return value >= (h.target ?? 1)
}

// Port of isScheduled, in the same precedence order: rrule wins, then weekly
// ("any day is fair game"), then the active_days set (empty = every day).
export function habitScheduledOn(h: Habit, iso: string): boolean {
  if (h.rrule?.freq) return ruleOccursOn(h.rrule, iso)
  if (h.weekly_target) return true
  const days = h.active_days ?? []
  return days.length === 0 || days.includes(dowOf(iso))
}

// Monday-start week containing `iso`, as an ISO date.
export function weekStartOf(iso: string): string {
  const d = utc(iso)
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY)
  return monday.toISOString().slice(0, 10)
}

// Port of weekCount: success-days in the Monday-start week containing `today`,
// up to and including today. Off-days and rest days are transparent.
export function weekSuccessCount(h: Habit, entries: Entry[], today: string): number {
  const from = weekStartOf(today)
  const byDate = new Map<string, Entry>()
  for (const e of entries) {
    if (e.habit_id === h.id && e.date >= from && e.date <= today) byDate.set(e.date, e)
  }
  let count = 0
  let iso = from
  while (iso <= today) {
    const e = byDate.get(iso)
    if (habitScheduledOn(h, iso) && !e?.skipped && habitSuccess(h, Number(e?.value ?? 0))) count++
    iso = new Date(utc(iso).getTime() + DAY).toISOString().slice(0, 10)
  }
  return count
}

// Is this habit worth a nudge today? Due on the schedule, not rested, and not
// already satisfied — a gentle "time to log this", never a nag about something
// already done.
export function habitDueToday(h: Habit, entries: Entry[], today: string): boolean {
  const todayEntry = entries.find((e) => e.habit_id === h.id && e.date === today)
  if (todayEntry?.skipped) return false // rest day
  if (!habitScheduledOn(h, today)) return false

  // Weekly mode: already hit the week's target → nothing left to nudge about.
  if (!h.rrule?.freq && h.weekly_target) {
    return weekSuccessCount(h, entries, today) < h.weekly_target
  }

  // Otherwise nudge unless today is already a success. `limit` and `track`
  // habits are always worth a log prompt: an unlogged day counts as clean for a
  // limit, so "success" there means "nothing recorded yet", not "done".
  if (h.polarity !== 'build') return true
  return !habitSuccess(h, Number(todayEntry?.value ?? 0))
}
