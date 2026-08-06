// Recurrence engine (RRULE-lite).
//
// Rule shapes (weekday: 0=Sun … 6=Sat):
//   daily:                { freq:'daily',   interval, anchor }
//   weekly:               { freq:'weekly',  interval, weekdays:[1,3], anchor }
//   monthly by date:      { freq:'monthly', interval, monthdays:[1,15], anchor }
//   monthly by weekday:   { freq:'monthly', interval, setpos:1, weekday:1, anchor }  // setpos -1 = last
//   yearly:               { freq:'yearly',  interval, month:5, monthday:12, anchor }
//
// Optional on any shape:
//   until:   'YYYY-MM-DD' — last allowed date (inclusive); past it the series is
//            over and nextOccurrence returns null (the task then closes).
//   count:   N — end after N occurrences. Counted from the anchor, and (as in
//            RFC 5545) an EXDATE'd occurrence still spends its slot.
//   exdates: ['YYYY-MM-DD', …] — single occurrences to skip ("skip this one").
//   mode:    'after_completion' — see below. Absent = calendar-anchored.
//
// TWO CLOCKS. By default a rule is **calendar-anchored**: "the 1st and 15th"
// means those dates whether or not you kept up, and `anchor` fixes the phase so
// "every 2 weeks" is deterministic. `nextOccurrence` walks that grid.
//
// `mode: 'after_completion'` is the other clock, and chores need it: "water the
// plants every 5 days" means five days after you last *did* it. On a calendar
// grid, finishing three days late hands you the next one in two — which is how
// a maintenance chore turns into nagging. These rules have no grid, so
// nextOccurrence returns null for them by design; `advanceAfterCompletion`
// measures the interval from the day it was checked off instead.
//
// `monthday` (scalar) is the legacy spelling of `monthdays` and is still read
// everywhere, so rules stored before multi-day support keep working untouched.

const DAY = 86400000
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS_MIN = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const SETPOS_LABEL = { 1: 'First', 2: 'Second', 3: 'Third', 4: 'Fourth', 5: 'Fifth', '-1': 'Last' }
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export { WEEKDAYS_SHORT, WEEKDAYS_MIN, SETPOS_LABEL }

const pad = (n) => String(n).padStart(2, '0')
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate()
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function parse(dateOrIso) {
  if (dateOrIso instanceof Date) return startOfDay(dateOrIso)
  const [y, m, d] = String(dateOrIso).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function weekStart(d) {
  return addDays(d, -d.getDay()) // back up to Sunday
}

// Calendar-correct month arithmetic: clamp the day to the target month's length
// so "the 31st + 1 month" lands on the 28th/30th rather than spilling into the
// month after (which is what `new Date(y, m + 1, 31)` would do).
function addMonths(d, n) {
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1)
  const day = Math.min(d.getDate(), daysInMonth(t.getFullYear(), t.getMonth()))
  return new Date(t.getFullYear(), t.getMonth(), day)
}

// The days-of-month a monthly rule lands on, tolerating the legacy scalar.
function monthDaysOf(rule) {
  if (rule.monthdays?.length) return rule.monthdays
  return rule.monthday ? [rule.monthday] : []
}

export function isAfterCompletion(rule) {
  return rule?.mode === 'after_completion'
}

// The day-of-month for the nth weekday of a month (or null if it doesn't exist,
// e.g. a 5th Monday). setpos -1 = last.
function nthWeekdayDate(year, month, setpos, weekday) {
  if (setpos === -1) {
    const last = daysInMonth(year, month)
    const lastDow = new Date(year, month, last).getDay()
    return last - ((lastDow - weekday + 7) % 7)
  }
  const firstDow = new Date(year, month, 1).getDay()
  const day = 1 + ((weekday - firstDow + 7) % 7) + (setpos - 1) * 7
  return day <= daysInMonth(year, month) ? day : null
}

function matches(rule, d, anchor) {
  const interval = rule.interval || 1
  switch (rule.freq) {
    case 'daily': {
      const diff = Math.round((d - anchor) / DAY)
      return diff >= 0 && diff % interval === 0
    }
    case 'weekly': {
      if (!rule.weekdays?.includes(d.getDay())) return false
      const weeks = Math.round((weekStart(d) - weekStart(anchor)) / (7 * DAY))
      return weeks >= 0 && weeks % interval === 0
    }
    case 'monthly': {
      const months =
        (d.getFullYear() - anchor.getFullYear()) * 12 + (d.getMonth() - anchor.getMonth())
      if (months < 0 || months % interval !== 0) return false
      if (rule.setpos) {
        const day = nthWeekdayDate(d.getFullYear(), d.getMonth(), rule.setpos, rule.weekday)
        return day != null && d.getDate() === day
      }
      // Each requested day clamps into short months independently, so
      // "the 15th and the 31st" lands twice in March and twice in February
      // (the 15th and the 28th) rather than dropping the 31st entirely.
      const dim = daysInMonth(d.getFullYear(), d.getMonth())
      return monthDaysOf(rule).some((md) => d.getDate() === Math.min(md, dim))
    }
    case 'yearly': {
      const years = d.getFullYear() - anchor.getFullYear()
      if (years < 0 || years % interval !== 0) return false
      const target = Math.min(rule.monthday, daysInMonth(d.getFullYear(), rule.month))
      return d.getMonth() === rule.month && d.getDate() === target
    }
    default:
      return false
  }
}

// The last date a COUNT-bounded series can reach: the date of its Nth
// occurrence counted from the anchor. Following RFC 5545, occurrences are
// counted before EXDATEs are applied — a skipped one still spends its slot, so
// "10 times" can't be stretched indefinitely by skipping.
function countLimit(rule) {
  if (!rule.count || rule.count < 1 || !rule.anchor) return null
  const anchor = parse(rule.anchor)
  const cap = Math.min(370 * ((rule.interval || 1) + 1) * rule.count, 200000)
  let d = anchor
  let seen = 0
  for (let i = 0; i < cap; i++) {
    if (matches(rule, d, anchor) && ++seen >= rule.count) return d
    d = addDays(d, 1)
  }
  return null
}

// Next due date for an "after it's done" rule: the interval measured from the
// day it was actually completed. Being a week late pushes the next one a week
// out instead of handing you one in two days. Returns null once `until` has
// passed. See the two-clocks note at the top of this file.
export function advanceAfterCompletion(rule, fromIso) {
  if (!rule?.freq) return null
  const n = Math.max(1, rule.interval || 1)
  const d = parse(fromIso)
  let next
  switch (rule.freq) {
    case 'daily':
      next = addDays(d, n)
      break
    case 'weekly':
      next = addDays(d, n * 7)
      break
    case 'monthly':
      next = addMonths(d, n)
      break
    case 'yearly':
      next = addMonths(d, n * 12)
      break
    default:
      return null
  }
  const until = rule.until ? parse(rule.until) : null
  if (until && next > until) return null
  return toISO(next)
}

// The date a rule should first land on, for a task that has no due date yet.
// A calendar rule takes its next grid date; an after-completion rule starts
// today — its clock only begins once you check it off.
export function firstOccurrence(rule, todayIso) {
  if (!rule?.freq) return null
  if (isAfterCompletion(rule)) return todayIso
  return nextOccurrence(rule, todayIso, { inclusive: true })
}

// Next ISO date matching `rule` after `from` (inclusive optional). Returns null
// if nothing found within a sane horizon, or for an after-completion rule —
// those have no calendar grid to walk (use advanceAfterCompletion).
export function nextOccurrence(rule, from, { inclusive = false } = {}) {
  if (!rule || !rule.freq || isAfterCompletion(rule)) return null
  const fromD = parse(from)
  const anchor = rule.anchor ? parse(rule.anchor) : fromD
  const countEnd = countLimit(rule)
  const untilRule = rule.until ? parse(rule.until) : null
  // Whichever bound bites first ends the series.
  const until = countEnd && (!untilRule || countEnd < untilRule) ? countEnd : untilRule
  const exdates = rule.exdates?.length ? new Set(rule.exdates) : null
  let d = inclusive ? fromD : addDays(fromD, 1)
  // Scan day-by-day for a match. The horizon scales with the interval but is
  // hard-capped (~274 years) so a pathological rule — e.g. an imported
  // `interval: 99999` — can never spin into a multi-million-iteration freeze.
  const cap = Math.min(370 * ((rule.interval || 1) + 1), 100000)
  for (let i = 0; i < cap; i++) {
    if (until && d > until) return null // series has ended
    if (matches(rule, d, anchor)) {
      const iso = toISO(d)
      if (!exdates || !exdates.has(iso)) return iso // honor skipped occurrences
    }
    d = addDays(d, 1)
  }
  return null
}

// Does `rule` land on the given ISO date? Reuses nextOccurrence (inclusive),
// which matches the date on its first step when it's an occurrence — so it also
// honors `until`/`exdates` for free. Used by habits to drive their schedule.
export function occursOn(rule, iso) {
  if (!rule || !rule.freq) return false
  return nextOccurrence(rule, iso, { inclusive: true }) === iso
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// Short human label for a rule, e.g. "Every Monday", "Monthly on the 20th",
// "First Monday", "Every 2 weeks" — with ", until Aug 31, 2026" appended when
// the series has an end date.
export function describeRecurrence(rule) {
  if (!rule || !rule.freq) return 'One-off'
  const base = isAfterCompletion(rule) ? describeAfterCompletion(rule) : describeFreq(rule)
  const bound = rule.count
    ? `, ${rule.count} times`
    : rule.until
      ? `, until ${untilLabel(rule.until)}`
      : ''
  return base + bound
}

// "Every 5 days after it's done" — the phrasing has to name the clock, because
// this rule and its calendar twin read identically otherwise and behave very
// differently the moment you run late.
const AFTER_UNIT = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }
function describeAfterCompletion(rule) {
  const n = Math.max(1, rule.interval || 1)
  const unit = AFTER_UNIT[rule.freq] || 'day'
  return `Every ${n > 1 ? `${n} ` : ''}${unit}${n > 1 ? 's' : ''} after it’s done`
}

// "the 1st and 15th" / "the 1st, 10th and 20th"
function joinDays(days) {
  const parts = days.map(ordinal)
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

function untilLabel(iso) {
  return parse(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function describeFreq(rule) {
  const every = rule.interval && rule.interval > 1 ? `${rule.interval} ` : ''
  switch (rule.freq) {
    case 'daily':
      return rule.interval > 1 ? `Every ${rule.interval} days` : 'Every day'
    case 'weekly': {
      const nums = (rule.weekdays || []).slice().sort((a, b) => a - b)
      const days = nums.map((w) => WEEKDAYS_SHORT[w])
      if (!days.length) return 'Weekly'
      if (days.length === 7) return 'Every day'
      // Mon–Fri is common enough to earn its own name; spelling out five
      // weekday abbreviations reads like a list of exceptions.
      if (!(rule.interval > 1) && nums.join(',') === '1,2,3,4,5') return 'Every weekday'
      if (rule.interval > 1) return `Every ${rule.interval} weeks on ${days.join(', ')}`
      if (days.length === 1) return `Every ${days[0]}`
      return `Weekly on ${days.join(', ')}`
    }
    case 'monthly': {
      if (rule.setpos) {
        return `${SETPOS_LABEL[rule.setpos]} ${WEEKDAYS_SHORT[rule.weekday]}${every ? ` every ${every}months` : ' each month'}`
      }
      const days = monthDaysOf(rule)
      if (!days.length) return every ? `Every ${every}months` : 'Monthly'
      return `${every ? `Every ${every}months` : 'Monthly'} on the ${joinDays(days)}`
    }
    case 'yearly':
      return `Every ${every}year${rule.interval > 1 ? 's' : ''} on ${MONTHS[rule.month]} ${rule.monthday}`
    default:
      return 'Repeats'
  }
}
