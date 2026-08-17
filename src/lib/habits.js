// Habit logic: what counts as a good day, and how streaks run.
//
// A habit's `polarity` decides the meaning of a day's logged value:
//   build  — maximize; success when value >= target (target defaults to 1)
//   limit  — minimize; success when value <= target (target defaults to 0)
//   track  — neither; just a number to watch (no success, no streak)
//
// Scheduling has three modes (checked in this order):
//   rrule   — an RRULE-lite rule (lib/recurrence.js): every N days/weeks,
//             monthly (by date or weekday), or yearly. A day is scheduled iff
//             the rule lands on it; streaks count consecutive matching dates.
//             Overrides the two modes below when present.
//   weekday — `active_days` (0–6, Sun–Sat; empty = every day). Per-day success;
//             daily streak. Off-days are transparent (skipped, not broken).
//   weekly  — `weekly_target` "N times per week, any day". Success is measured
//             per week; the streak counts consecutive weeks that hit the target.
//
// A `skipped` entry is a one-off rest day: transparent to streaks, like an
// off-day, and distinct from a logged 0. Absence of any entry = value 0.

import { occursOn, describeRecurrence } from './recurrence'

export function hasRule(habit) {
  return !!(habit.rrule && habit.rrule.freq)
}

export function isWeekly(habit) {
  // An rrule schedules per-occurrence (a daily-style streak), never weekly.
  return !hasRule(habit) && habit.weekly_target != null && habit.weekly_target > 0
}

export function isScheduled(habit, date) {
  if (hasRule(habit)) return occursOn(habit.rrule, toISODate(date))
  if (isWeekly(habit)) return true // any day is fair game
  const days = habit.active_days
  if (!days || days.length === 0) return true
  return days.includes(date.getDay())
}

// null for `track` (the notion of success doesn't apply); boolean otherwise.
export function isSuccess(habit, value) {
  if (habit.polarity === 'track') return null
  if (habit.polarity === 'limit') return value <= (habit.target ?? 0)
  return value >= (habit.target ?? 1)
}

// Local yyyy-mm-dd (entries store a DATE, compared/keyed as a local-day string).
export function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Index entries by `${habit_id}|${date}` → { value, skipped }, for O(1) lookup.
export function entryMap(entries) {
  const m = new Map()
  for (const e of entries || []) {
    m.set(`${e.habit_id}|${e.date}`, {
      value: Number(e.value),
      skipped: !!e.skipped,
      note: e.note ?? null,
    })
  }
  return m
}

export function valueOn(habit, isoDate, map) {
  return map.get(`${habit.id}|${isoDate}`)?.value ?? 0
}

export function isSkipped(habit, isoDate, map) {
  return !!map.get(`${habit.id}|${isoDate}`)?.skipped
}

export function noteOn(habit, isoDate, map) {
  return map.get(`${habit.id}|${isoDate}`)?.note ?? ''
}

// Slice the date off an ISO string rather than re-parsing (a bare 'yyyy-mm-dd'
// through Date() would shift a day in negative timezones). Bounds streaks so
// they can't predate the habit.
export const startOf = (habit) => (habit.created_at ? String(habit.created_at).slice(0, 10) : null)

// Local midnight of `date` — the start of every backwards day-walk in here.
const dayOf = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

// 'yyyy-mm-dd' → local Date (parsed from parts; see startOf).
const parseISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Backstop for a row with no created_at (shouldn't happen — the column is NOT
// NULL — but a hand-imported row shouldn't spin forever either).
const MAX_SCAN_DAYS = 366 * 25

// How many calendar days back a streak or lifetime walk scans: exactly the
// habit's lifespan. The walks already break at created_at, so this only bounds
// the worst case — but deriving it from the habit means a fixed window can
// never truncate a real streak (a 400-day run used to report 366), and a young
// habit scans days-since-creation instead of a blind year.
function dayScanDays(habit, today) {
  const startISO = startOf(habit)
  if (!startISO) return MAX_SCAN_DAYS
  const days = Math.round((dayOf(today) - parseISO(startISO)) / 86400000) + 1
  return Math.min(Math.max(days, 1), MAX_SCAN_DAYS)
}

// Same, in weeks, for the weekly-mode walks. Rounded up with a week of slack so
// the scan always covers the partial week the habit was created in.
const weekScanWeeks = (habit, today) => Math.ceil(dayScanDays(habit, today) / 7) + 1

// Monday-start week containing `date`.
function weekStartOf(date) {
  const d = dayOf(date)
  const dow = (d.getDay() + 6) % 7 // Mon=0 .. Sun=6
  d.setDate(d.getDate() - dow)
  return d
}

// Consecutive successful scheduled days ending now (weekday mode), or weeks that
// hit target (weekly mode). Today/this-week never *breaks* a streak (not over
// yet); off-days and rest days are transparent. `today` is injectable for tests.
export function currentStreak(habit, map, today = new Date()) {
  if (habit.polarity === 'track' || !habit.track_streak) return 0
  if (isWeekly(habit)) return currentWeeklyStreak(habit, map, today)
  const todayISO = toISODate(today)
  const startISO = startOf(habit)
  let streak = 0
  const horizon = dayScanDays(habit, today)
  const d = dayOf(today)
  for (let i = 0; i < horizon; i++) {
    if (startISO && toISODate(d) < startISO) break
    if (isScheduled(habit, d)) {
      const iso = toISODate(d)
      if (isSkipped(habit, iso, map)) {
        // rest day — transparent, neither counts nor breaks
      } else if (isSuccess(habit, valueOn(habit, iso, map))) {
        streak++
      } else if (iso !== todayISO) {
        break
      }
    }
    d.setDate(d.getDate() - 1)
  }
  return streak
}

// Longest past run, same grace/transparency rules.
export function bestStreak(habit, map, today = new Date()) {
  if (habit.polarity === 'track' || !habit.track_streak) return 0
  if (isWeekly(habit)) return bestWeeklyStreak(habit, map, today)
  const startISO = startOf(habit)
  const todayISO = toISODate(today)
  let best = 0
  let run = 0
  const horizon = dayScanDays(habit, today)
  const d = dayOf(today)
  for (let i = 0; i < horizon; i++) {
    if (startISO && toISODate(d) < startISO) break
    if (isScheduled(habit, d)) {
      const iso = toISODate(d)
      if (isSkipped(habit, iso, map)) {
        // transparent
      } else if (isSuccess(habit, valueOn(habit, iso, map))) {
        run++
        if (run > best) best = run
      } else if (iso !== todayISO) {
        run = 0
      }
    }
    d.setDate(d.getDate() - 1)
  }
  return best
}

// ---- weekly mode -------------------------------------------------------

// Success-days within the 7 days starting `weekStart`, capped at `today` (no
// future), bounded by created_at, off-days and rest days transparent. Takes an
// arbitrary week start so it serves both the Monday-start weekly streak and the
// Sunday-start bars on the detail page.
export function weekCount(habit, map, weekStart, today) {
  const startISO = startOf(habit)
  const todayISO = toISODate(today)
  let count = 0
  const d = dayOf(weekStart)
  for (let i = 0; i < 7; i++) {
    const iso = toISODate(d)
    if (iso > todayISO) break
    if (
      (!startISO || iso >= startISO) &&
      isScheduled(habit, d) &&
      !isSkipped(habit, iso, map) &&
      isSuccess(habit, valueOn(habit, iso, map))
    ) {
      count++
    }
    d.setDate(d.getDate() + 1)
  }
  return count
}

// This week's progress toward the weekly target, e.g. { count: 2, target: 3 }.
export function weekProgress(habit, map, today = new Date()) {
  return { count: weekCount(habit, map, weekStartOf(today), today), target: habit.weekly_target }
}

// ---- "what does today ask of me" ---------------------------------------
// The two predicates below are the ONE definition of a habit's claim on today.
// Today's Habits section and the attention engine (lib/attention) both read
// them, so the dashboard and the badge/push can't drift the way they used to
// when Today re-derived this inline.

// Habits on today's card: scheduled for the day, not rested, and — for weekly
// habits — still short of the week's target. Includes ones you've already
// logged, because the row is also how you log and correct them. Archived and
// soft-deleted habits never qualify. Display rules stay with the caller (Today
// additionally honors the per-habit `show_on_today` pin).
export function habitsScheduledToday(habits, map, today = new Date()) {
  const iso = toISODate(today)
  return (habits || []).filter((h) => {
    if (h.archived_at || h.deleted_at) return false
    if (!isScheduled(h, today)) return false
    if (isSkipped(h, iso, map)) return false
    if (!isWeekly(h)) return true
    const { count, target } = weekProgress(h, map, today)
    return count < target
  })
}

// The subset that still wants something from you — today's entry isn't a
// success yet. Note the two polarities that resolve themselves: a `limit` habit
// ("≤ 0 a day") is satisfied until you log against it, so it never nags; a
// `track` habit has no notion of success, so it's outstanding only while
// there's no number for the day.
export function habitsDueToday(habits, map, today = new Date()) {
  const iso = toISODate(today)
  return habitsScheduledToday(habits, map, today).filter((h) =>
    h.polarity === 'track' ? !map.has(`${h.id}|${iso}`) : !isSuccess(h, valueOn(h, iso, map)),
  )
}

// A week is a "rest week" when every elapsed day in it (since the habit existed,
// up to today) is a rest day — e.g. a vacation that paused the habit. Like a
// daily rest day, a rest week is transparent to the weekly streak: it neither
// counts toward it nor breaks it. Needs at least one elapsed day to qualify.
function isRestWeek(habit, map, weekStart, today) {
  const startISO = startOf(habit)
  const todayISO = toISODate(today)
  let any = false
  const d = dayOf(weekStart)
  for (let i = 0; i < 7; i++) {
    const iso = toISODate(d)
    if (iso > todayISO) break
    if (!startISO || iso >= startISO) {
      any = true
      if (!isSkipped(habit, iso, map)) return false
    }
    d.setDate(d.getDate() + 1)
  }
  return any
}

function currentWeeklyStreak(habit, map, today) {
  const startISO = startOf(habit)
  const thisWeekISO = toISODate(weekStartOf(today))
  let streak = 0
  let ws = weekStartOf(today)
  const horizon = weekScanWeeks(habit, today)
  for (let w = 0; w < horizon; w++) {
    const weekEnd = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 6)
    if (startISO && toISODate(weekEnd) < startISO) break
    if (isRestWeek(habit, map, ws, today)) {
      // paused week — transparent, like a daily rest day
    } else if (weekCount(habit, map, ws, today) >= habit.weekly_target) {
      streak++
    } else if (toISODate(ws) !== thisWeekISO) {
      break // current week may still be filled; an earlier miss ends it
    }
    ws = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() - 7)
  }
  return streak
}

function bestWeeklyStreak(habit, map, today) {
  const startISO = startOf(habit)
  const thisWeekISO = toISODate(weekStartOf(today))
  let best = 0
  let run = 0
  let ws = weekStartOf(today)
  const horizon = weekScanWeeks(habit, today)
  for (let w = 0; w < horizon; w++) {
    const weekEnd = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 6)
    if (startISO && toISODate(weekEnd) < startISO) break
    if (isRestWeek(habit, map, ws, today)) {
      // transparent
    } else if (weekCount(habit, map, ws, today) >= habit.weekly_target) {
      run++
      if (run > best) best = run
    } else if (toISODate(ws) !== thisWeekISO) {
      run = 0
    }
    ws = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() - 7)
  }
  return best
}

// Rollup over the last `calendarDays` days (including today): scheduled days,
// successes, total and average. Rest days are excluded from the scheduled count.
export function windowStats(habit, map, today = new Date(), calendarDays = 30) {
  const startISO = startOf(habit)
  let scheduledDays = 0
  let successDays = 0
  let total = 0
  const d = dayOf(today)
  for (let i = 0; i < calendarDays; i++) {
    const iso = toISODate(d)
    if (startISO && iso < startISO) break // don't count days before the habit existed
    if (isScheduled(habit, d) && !isSkipped(habit, iso, map)) {
      const v = valueOn(habit, iso, map)
      scheduledDays++
      total += v
      if (isSuccess(habit, v)) successDays++
    }
    d.setDate(d.getDate() - 1)
  }
  return { scheduledDays, successDays, total, average: scheduledDays ? total / scheduledDays : 0 }
}

// ---- display helpers ---------------------------------------------------

const DOW2 = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// Units are stored plural ("sessions", "glasses") because that's how they read
// most of the time, so a target of 1 needs the singular back: "Goal ≥ 1 session"
// not "Goal ≥ 1 sessions". Naive, deliberately: it only has to handle the unit
// words a habit actually carries.
function unitFor(unit, n) {
  if (!unit || n !== 1) return unit
  if (/(ch|sh|s|x|z)es$/.test(unit)) return unit.slice(0, -2)
  if (/ies$/.test(unit)) return unit.slice(0, -3) + 'y'
  if (/s$/.test(unit) && !/ss$/.test(unit)) return unit.slice(0, -1)
  return unit
}

export function goalLabel(h) {
  if (h.polarity === 'track') return h.unit ? `Tracking ${h.unit}` : 'Tracking'
  const n = h.polarity === 'limit' ? (h.target ?? 0) : (h.target ?? 1)
  const u = h.unit ? ` ${unitFor(h.unit, n)}` : ''
  // An rrule isn't a daily cadence, so drop the "/day"/"each day" wording and let
  // cadenceLabel ("Every 3 days", "Monthly on the 20th") carry the frequency.
  const per = hasRule(h) ? '' : '/day'
  if (h.measure === 'binary') {
    if (hasRule(h)) return h.polarity === 'limit' ? 'Avoid' : 'Each time'
    return h.polarity === 'limit' ? 'Avoid each day' : 'Once a day'
  }
  return h.polarity === 'limit'
    ? `Limit ≤ ${h.target ?? 0}${u}${per}`
    : `Goal ≥ ${h.target ?? 1}${u}${per}`
}

// How one logged day reads in the activity feed: "Did it" for a binary win,
// otherwise the number with its unit ("3 glasses"). Deliberately flat — the
// feed is a record of what happened, not a scorecard, so a day that missed the
// target says "Logged" rather than judging it.
export function logLabel(h, value) {
  if (h.measure === 'binary') return isSuccess(h, value) ? 'Did it' : 'Logged'
  const u = h.unit ? ` ${unitFor(h.unit, value)}` : ''
  return `${value}${u}`
}

export function cadenceLabel(h) {
  if (hasRule(h)) return describeRecurrence(h.rrule)
  if (isWeekly(h)) return `${h.weekly_target}× / week`
  return !h.active_days?.length || h.active_days.length === 7
    ? 'Daily'
    : h.active_days.map((d) => DOW2[d]).join(' ')
}

// Is this habit on every day of the week?
function isEveryDay(h) {
  return !hasRule(h) && !isWeekly(h) && (!h.active_days?.length || h.active_days.length === 7)
}

// The one-line summary under a habit's name in a list row.
//
// `goalLabel(h) · cadenceLabel(h)` is the full statement and it's right on the
// detail screen, but in a row it has ~143px next to the badge and the day's
// logging control, and it overflowed on five of the nine seeded habits — the
// ellipsis ate the part that carried the number. CONVENTIONS.md is explicit
// that a line needing an ellipsis is the wrong line, so this is the shorter
// line rather than a wider column.
//
// Two redundancies come out:
//   - "Goal ≥" / "Limit ≤" → "≥" / "≤". The symbol already says which way the
//     habit runs, and it's the only part of that phrase carrying meaning.
//   - the cadence, whenever the goal has already said it. "8 glasses/day ·
//     Daily" says daily twice; "1 session/day · Mo We Fr" says /day about a
//     habit that isn't. A weekly habit's row shows live progress ("2/3 this
//     week") which states the target too, so it takes no cadence at all.
export function rowSummary(h) {
  if (isWeekly(h)) return null // the row prints live week progress instead
  const everyDay = isEveryDay(h)
  let goal = goalLabel(h).replace(/^(Goal|Limit) /, '')
  // "/day" is only true when the habit runs every day. Against a Mo/We/Fr
  // cadence it contradicts the days printed immediately after it.
  if (!everyDay) goal = goal.replace('/day', '')
  // A goal that already states the frequency doesn't need "Daily" after it.
  if (everyDay && /\/day|a day|each day/.test(goal)) return goal
  return `${goal} · ${cadenceLabel(h)}`
}

// 'yyyy-mm-dd' → "Tue, Jun 10" (parsed from parts to stay timezone-safe).
export function formatDay(iso, todayISO) {
  if (iso === todayISO) return 'Today'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

// ---- history & insights (read-only over entries) -----------------------

// The outcome of a single day, for the heatmap.
function cellStatus(habit, map, date, iso, todayISO, startISO) {
  if (iso > todayISO) return 'future'
  if (startISO && iso < startISO) return 'none'
  if (isSkipped(habit, iso, map)) return 'skip'
  if (!isScheduled(habit, date)) return 'off'
  if (habit.polarity === 'track') return map.has(`${habit.id}|${iso}`) ? 'logged' : 'empty'
  if (isSuccess(habit, valueOn(habit, iso, map))) return 'hit'
  if (isWeekly(habit)) return 'empty'
  return iso === todayISO ? 'today' : 'miss'
}

// GitHub-style calendar: `weeks` Sunday-start columns (oldest left, current
// week rightmost), each a 7-day Sun..Sat array of { iso, status }. monthLabels
// holds a short month name on the column where a new month begins, else ''.
export function calendarMatrix(habit, map, today = new Date(), weeks = 13) {
  const startISO = startOf(habit)
  const todayISO = toISODate(today)
  const lastSunday = dayOf(today)
  lastSunday.setDate(lastSunday.getDate() - lastSunday.getDay())
  const firstSunday = new Date(lastSunday)
  firstSunday.setDate(lastSunday.getDate() - (weeks - 1) * 7)

  const columns = []
  const monthLabels = []
  let prevMonth = -1
  for (let w = 0; w < weeks; w++) {
    const colStart = new Date(firstSunday)
    colStart.setDate(firstSunday.getDate() + w * 7)
    const col = []
    for (let r = 0; r < 7; r++) {
      const d = new Date(colStart)
      d.setDate(colStart.getDate() + r)
      const iso = toISODate(d)
      col.push({ iso, status: cellStatus(habit, map, d, iso, todayISO, startISO) })
    }
    const m = colStart.getMonth()
    monthLabels.push(
      m !== prevMonth ? colStart.toLocaleDateString(undefined, { month: 'short' }) : '',
    )
    prevMonth = m
    columns.push(col)
  }
  return { columns, monthLabels }
}

// Which weekday this habit succeeds on most over the last `days` (build/limit
// only; needs a little signal per day). Returns { dow, rate } or null.
export function bestDayOfWeek(habit, map, today = new Date(), days = 90) {
  if (habit.polarity === 'track') return null
  const startISO = startOf(habit)
  const sched = [0, 0, 0, 0, 0, 0, 0]
  const succ = [0, 0, 0, 0, 0, 0, 0]
  const d = dayOf(today)
  for (let i = 0; i < days; i++) {
    const iso = toISODate(d)
    if (startISO && iso < startISO) break
    if (isScheduled(habit, d) && !isSkipped(habit, iso, map)) {
      const dow = d.getDay()
      sched[dow]++
      if (isSuccess(habit, valueOn(habit, iso, map))) succ[dow]++
    }
    d.setDate(d.getDate() - 1)
  }
  let best = null
  for (let dow = 0; dow < 7; dow++) {
    if (sched[dow] < 2) continue
    const rate = succ[dow] / sched[dow]
    if (!best || rate > best.rate) best = { dow, rate }
  }
  return best
}

// Direction over time: the recent `half`-day window vs the one before it.
// For build/limit compares success rate (0..1); for track compares average
// value. Always returns the same shape — `recent`/`prior` are the compared
// metric, `recentStats`/`priorStats` the raw windows behind it — so a caller
// can render the numbers without knowing which branch produced them.
export function trend(habit, map, today = new Date(), half = 28) {
  const prevEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() - half)
  const recentStats = windowStats(habit, map, today, half)
  const priorStats = windowStats(habit, map, prevEnd, half)
  const isTrack = habit.polarity === 'track'
  const rate = (s) => (s.scheduledDays ? s.successDays / s.scheduledDays : 0)
  const recent = isTrack ? recentStats.average : rate(recentStats)
  const prior = isTrack ? priorStats.average : rate(priorStats)
  const out = { recent, prior, recentStats, priorStats }
  // Too little prior history to compare (a young habit) → call it flat rather
  // than inventing an "improving" trend out of empty pre-creation days.
  if (priorStats.scheduledDays < 5) return { ...out, dir: 'flat', young: true }
  const diff = recent - prior
  const epsilon = isTrack ? 0.01 : 0.05
  return { ...out, dir: Math.abs(diff) < epsilon ? 'flat' : diff > 0 ? 'up' : 'down', young: false }
}

// Lifetime tallies since the habit was created. `days` is an optional extra cap
// for callers that only want a recent slice; by default the scan is the habit's
// own lifespan, so "all-time" really is.
export function totals(habit, map, today = new Date(), days = Infinity) {
  const startISO = startOf(habit)
  let successes = 0
  let skips = 0
  let scheduled = 0
  const horizon = Math.min(days, dayScanDays(habit, today))
  const d = dayOf(today)
  for (let i = 0; i < horizon; i++) {
    const iso = toISODate(d)
    if (startISO && iso < startISO) break
    if (isSkipped(habit, iso, map)) {
      skips++
    } else if (isScheduled(habit, d)) {
      scheduled++
      if (isSuccess(habit, valueOn(habit, iso, map))) successes++
    }
    d.setDate(d.getDate() - 1)
  }
  return { successes, skips, scheduled }
}
