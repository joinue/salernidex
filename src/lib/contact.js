// Time + cadence helpers that turn the raw interaction log into the signals a
// CRM lives on: "last contacted", "how long ago", and "are we overdue?".

// Most-recent interaction for a person (or null). Expects ISO `occurred_at`.
export function lastInteraction(personId, interactions = []) {
  let latest = null
  for (const it of interactions) {
    if (it.person_id !== personId) continue
    if (!latest || it.occurred_at > latest.occurred_at) latest = it
  }
  return latest
}

export function daysSince(iso) {
  if (!iso) return null
  // Calendar days between local midnights — not a rolling 24h window, so a task
  // done late yesterday reads "yesterday" this morning, not "today".
  const then = new Date(iso)
  const now = new Date()
  const startThen = new Date(then.getFullYear(), then.getMonth(), then.getDate())
  const startNow = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((startNow - startThen) / 86400000)
}

// Compact relative label: "today", "yesterday", "5d", "3w", "4mo", "2y".
export function relativeTime(iso) {
  const days = daysSince(iso)
  if (days === null) return null
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

// Next birthday for a person within `withinDays`, or null. Returns the upcoming
// date, days until it, and the age they'll turn (if birth year is known).
export function upcomingBirthday(person, withinDays = 30) {
  if (!person?.birthday) return null
  const [y, m, d] = person.birthday.split('-').map(Number)
  if (!m || !d) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let next = new Date(today.getFullYear(), m - 1, d)
  if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d)
  const daysUntil = Math.round((next - today) / 86400000)
  if (daysUntil > withinDays) return null
  return { date: next, daysUntil, turning: y ? next.getFullYear() - y : null }
}

// Local yyyy-mm-dd for a Date. Entries below carry it alongside `daysUntil` so
// a derived date can be labelled by the same code that labels a stored one —
// "Sep 4" once "in 84d" has stopped meaning anything.
function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// All upcoming dates for the Today hub: birthdays merged with key dates
// (anniversaries etc.), soonest first. Each entry: { kind, person, daysUntil,
// dateIso, label, turning?, years?, keyDate? }. Annual key dates roll forward each
// year ("years" = how many, when the original year is meaningful); one-offs
// appear until their date passes.
export function upcomingDates(people, keyDates = [], withinDays = 30) {
  const byId = new Map(people.map((p) => [p.id, p]))
  const out = []

  for (const p of people) {
    // Deleted contacts don't have birthdays any more. The key-date loop below
    // has always checked this; the birthday loop never did, so archiving someone
    // left their birthday arriving on Today, in the attention badge, and in the
    // push the sender builds from the same list — every year.
    if (p.deleted_at) continue
    const b = upcomingBirthday(p, withinDays)
    if (b)
      out.push({
        kind: 'birthday',
        person: p,
        daysUntil: b.daysUntil,
        dateIso: isoLocal(b.date),
        turning: b.turning,
        label: 'Birthday',
      })
  }

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  for (const kd of keyDates) {
    const person = byId.get(kd.person_id)
    if (!person || person.deleted_at) continue
    const [y, m, d] = (kd.date || '').split('-').map(Number)
    if (!m || !d) continue
    let next
    if (kd.annual) {
      next = new Date(today.getFullYear(), m - 1, d)
      if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d)
    } else {
      next = new Date(y, m - 1, d)
      if (next < today) continue // past one-off: done with
    }
    const daysUntil = Math.round((next - today) / 86400000)
    if (daysUntil > withinDays) continue
    out.push({
      kind: 'keydate',
      person,
      keyDate: kd,
      daysUntil,
      dateIso: isoLocal(next),
      label: kd.label,
      years: kd.annual && y ? next.getFullYear() - y : null,
    })
  }

  return out.sort((a, b) => a.daysUntil - b.daysUntil)
}

// Follow-up status for a person given their last-contact date. Returns null
// when no cadence is set. Otherwise: 'never' (cadence but nothing logged),
// 'overdue' (past the cadence window), or 'ok' (within it).
export function followUp(person, lastIso) {
  const cadence = person?.keep_in_touch_days
  if (!cadence) return null
  const since = daysSince(lastIso)
  if (since === null) return { state: 'never', cadence }
  const overdueBy = since - cadence
  if (overdueBy >= 0) return { state: 'overdue', overdueBy, cadence }
  return { state: 'ok', dueIn: -overdueBy, cadence }
}

const days = (n) => `${n} day${n === 1 ? '' : 's'}`

// How a follow-up state reads on screen, and the tone that carries it. Lives
// here rather than in a component because the person page, the people list and
// the reminder feed all have to say the same thing about the same state — the
// cadence was previously stated as a setting ("every 30 days") and the user was
// left to do the subtraction against "last contact · 5w ago" themselves.
//
// `urgent` is the "this needs you" flag: a screen that only has room for a
// warning (a list row) shows it when urgent, a screen with room (the profile)
// shows the label whatever the state.
export function followUpLabel(status) {
  if (!status) return null
  if (status.state === 'never')
    return { text: 'No touchpoint logged yet', tone: 'danger', urgent: true }
  if (status.state === 'overdue')
    return {
      text:
        status.overdueBy === 0 ? 'Due to reach out today' : `Overdue by ${days(status.overdueBy)}`,
      tone: 'danger',
      urgent: true,
    }
  return {
    text: status.dueIn === 1 ? 'Reach out tomorrow' : `Due in ${days(status.dueIn)}`,
    tone: 'neutral',
    urgent: false,
  }
}
