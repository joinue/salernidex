// Meal plans — a list whose items are indexed by DAY rather than by sort order
// (standard) or aisle (grocery). Migration 0037 adds the `meal_plan` kind and
// `list_items.on_date`; everything here is the pure logic that reads them.
//
// The shape of the surface, decided once and shared by ListDetail and the
// household board: a rolling window that starts today, because the question a
// meal plan answers is "what's for dinner tonight, and what did we say for the
// rest of the week" — not "show me the calendar month of March". Anything
// before the window that's still open surfaces above it rather than vanishing,
// the same way an overdue task does.
//
// Pure and date-string-based (YYYY-MM-DD, local): no Date arithmetic leaks out
// of here, so a board left running past midnight just re-derives with a new
// `todayIso` and is correct.

// The kind constant and its predicate live in listKinds.js with the other
// three; re-exported here so existing callers (useData, board) keep importing
// them from the module that owns the rest of meal-plan logic.
export { MEAL_PLAN, isMealPlan } from './listKinds'

// How many days the plan shows at once, today inclusive.
export const PLAN_DAYS = 7

// 'YYYY-MM-DD' → Date at local midnight. Parsing the string by hand rather
// than through `new Date(iso)`, which reads a bare date as UTC and lands on
// the previous day for anyone west of Greenwich — the same trap lib/tasks
// avoids with its own parseLocal.
export function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISO(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// `days` calendar days after `iso`, as an ISO string. Goes through a Date so
// month ends and DST are the platform's problem, not ours.
export function addDays(iso, days) {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}

// The window's days, today first.
export function windowDays(todayIso, days = PLAN_DAYS) {
  return Array.from({ length: days }, (_, i) => addDays(todayIso, i))
}

// "Today" / "Tomorrow" / "Thursday" inside the week, then a dated label past
// it — the same escalation Today's date list uses. `locale` is only threaded
// through for tests; production passes nothing and gets the device's.
export function dayLabel(iso, todayIso, locale) {
  if (iso === todayIso) return 'Today'
  if (iso === addDays(todayIso, 1)) return 'Tomorrow'
  const d = parseISO(iso)
  const within = daysBetween(todayIso, iso)
  if (within > 1 && within < 7) return d.toLocaleDateString(locale, { weekday: 'long' })
  return d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })
}

// Short form for a tight row of day chips: 'Mon 18'.
export function dayChipLabel(iso, todayIso, locale) {
  if (iso === todayIso) return 'Today'
  if (iso === addDays(todayIso, 1)) return 'Tom'
  const d = parseISO(iso)
  return `${d.toLocaleDateString(locale, { weekday: 'short' })} ${d.getDate()}`
}

export function daysBetween(fromIso, toIso) {
  // Whole days, so a DST boundary inside the span can't round to 6.96 and
  // truncate to 6.
  return Math.round((parseISO(toIso) - parseISO(fromIso)) / 86400000)
}

// The whole surface in one pass:
//   earlier      — open items dated before today (nothing silently disappears)
//   days         — the rolling window, one entry per day, always present so an
//                  empty day still renders and can be tapped
//   later        — dated past the window
//   unscheduled  — no date yet ("we'll figure out Friday")
//   done         — made, whenever that was; sinks to the bottom like "Got it"
//
// Headings don't belong on a meal plan (the days are the sections), so they're
// dropped here rather than checked for at every call site.
export function planWindow(items, todayIso, days = PLAN_DAYS) {
  const mine = items.filter((it) => !it.is_heading)
  const window = windowDays(todayIso, days)
  const last = window[window.length - 1]
  const byDay = new Map(window.map((iso) => [iso, []]))

  const earlier = []
  const later = []
  const unscheduled = []
  const done = []

  for (const it of mine) {
    if (it.checked_at) {
      done.push(it)
      continue
    }
    const on = it.on_date || null
    if (!on) unscheduled.push(it)
    else if (on < todayIso) earlier.push(it)
    else if (on > last) later.push(it)
    else byDay.get(on).push(it)
  }

  // ISO dates sort correctly as strings, which is most of why they're the
  // storage format.
  earlier.sort((a, b) => (a.on_date < b.on_date ? -1 : 1))
  later.sort((a, b) => (a.on_date < b.on_date ? -1 : 1))
  done.sort((a, b) => (a.checked_at < b.checked_at ? 1 : -1))

  return {
    earlier,
    days: window.map((iso) => ({ iso, items: byDay.get(iso) })),
    later,
    unscheduled,
    done,
  }
}

// What's on for a given day — used by the board, which only ever asks about
// tonight and doesn't want the rest of the window computed to find out.
export function mealsOn(items, iso) {
  return items.filter((it) => !it.is_heading && !it.checked_at && it.on_date === iso)
}

// A meal's note is its ingredient line: "chicken thighs, rice, broccoli, soy
// sauce". Commas and newlines both split, because people type both, and a
// trailing "and" reads as a separator too ("rice, beans and salsa").
//
// Deliberately dumb: no quantity parsing, no unit inference. The grocery list
// already peels a leading count off "2 avocados" on the way in (parseQty), so
// anything typed that way still lands correctly without a second parser here.
export function parseIngredients(note) {
  if (!note) return []
  return String(note)
    .split(/[,\n;]+/)
    .flatMap((part) => part.split(/\s+\band\b\s+/i))
    .map((s) => s.trim().replace(/^[-•*]\s*/, ''))
    .filter(Boolean)
}

// Which day a new meal should land on when the user hasn't picked one. Today,
// unless today is already spoken for — then the first empty day in the window,
// because the common move is filling the week forward rather than stacking
// three dinners on a Tuesday. Falls back to today when the week is full.
export function suggestedDay(items, todayIso, days = PLAN_DAYS) {
  const plan = planWindow(items, todayIso, days)
  const empty = plan.days.find((d) => d.items.length === 0)
  return plan.days[0].items.length === 0 ? todayIso : (empty?.iso ?? todayIso)
}
