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
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
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

// All upcoming dates for the Today hub: birthdays merged with key dates
// (anniversaries etc.), soonest first. Each entry: { kind, person, daysUntil,
// label, turning?, years?, keyDate? }. Annual key dates roll forward each
// year ("years" = how many, when the original year is meaningful); one-offs
// appear until their date passes.
export function upcomingDates(people, keyDates = [], withinDays = 30) {
  const byId = new Map(people.map((p) => [p.id, p]))
  const out = []

  for (const p of people) {
    const b = upcomingBirthday(p, withinDays)
    if (b)
      out.push({
        kind: 'birthday',
        person: p,
        daysUntil: b.daysUntil,
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
