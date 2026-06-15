// Recurrence engine (RRULE-lite) — calendar-anchored, not interval-from-done.
//
// Rule shapes (weekday: 0=Sun … 6=Sat):
//   daily:                { freq:'daily',   interval, anchor }
//   weekly:               { freq:'weekly',  interval, weekdays:[1,3], anchor }
//   monthly by date:      { freq:'monthly', interval, monthday:20, anchor }
//   monthly by weekday:   { freq:'monthly', interval, setpos:1, weekday:1, anchor }  // setpos -1 = last
//   yearly:               { freq:'yearly',  interval, month:5, monthday:12, anchor }
//
// Optional on any shape:
//   until:   'YYYY-MM-DD' — last allowed date (inclusive); past it the series is
//            over and nextOccurrence returns null (the task then closes).
//   exdates: ['YYYY-MM-DD', …] — single occurrences to skip ("skip this one").
//
// `anchor` (ISO date) fixes the phase so "every 2 weeks"/"every 3 months" are
// deterministic. `nextOccurrence` returns the next ISO date matching the rule,
// strictly after (or on, if inclusive) the given date.

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
      const target = Math.min(rule.monthday, daysInMonth(d.getFullYear(), d.getMonth()))
      return d.getDate() === target
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

// Next ISO date matching `rule` after `from` (inclusive optional). Returns null
// if nothing found within a sane horizon.
export function nextOccurrence(rule, from, { inclusive = false } = {}) {
  if (!rule || !rule.freq) return null
  const fromD = parse(from)
  const anchor = rule.anchor ? parse(rule.anchor) : fromD
  const until = rule.until ? parse(rule.until) : null
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
  const base = describeFreq(rule)
  return rule.until ? `${base}, until ${untilLabel(rule.until)}` : base
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
      const days = (rule.weekdays || [])
        .slice()
        .sort()
        .map((w) => WEEKDAYS_SHORT[w])
      if (!days.length) return 'Weekly'
      if (days.length === 7) return 'Every day'
      if (rule.interval > 1) return `Every ${rule.interval} weeks on ${days.join(', ')}`
      if (days.length === 1) return `Every ${days[0]}`
      return `Weekly on ${days.join(', ')}`
    }
    case 'monthly': {
      if (rule.setpos) {
        return `${SETPOS_LABEL[rule.setpos]} ${WEEKDAYS_SHORT[rule.weekday]}${every ? ` every ${every}months` : ' each month'}`
      }
      return `${every ? `Every ${every}months` : 'Monthly'} on the ${ordinal(rule.monthday)}`
    }
    case 'yearly':
      return `Every ${every}year on ${MONTHS[rule.month]} ${rule.monthday}`
    default:
      return 'Repeats'
  }
}
