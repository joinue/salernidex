// The attention engine: ONE pure function that decides what needs you today.
// Today's sections, the tab/app badges, and (in 6b) the server-side push
// sender all read from this, so the surfaces can never disagree.
//
// Returns [{ kind, key, urgency, ...payload }]:
//   kind 'task'  — top-level open task due today or overdue        (payload: task)
//   kind 'nudge' — someone you meant to stay close to, drifting    (payload: person, state, lastIso)
//                  (internal name; the UI says "check in" — never "nudge"/"follow up")
//   kind 'date'  — birthday or key date inside the lead window     (payload: entry from upcomingDates)
//   kind 'list'  — a list with a due_date that's due today/overdue  (payload: list)
//   urgency: 'overdue' | 'today' | 'upcoming'
//   key: stable id, doubles as reminder_snoozes.target_key
//
// Per-member snoozes hide items: until=null means dismissed for good,
// otherwise hidden through that timestamp. FYI items (partner activity) are
// push-only (6b) — in-app, the Recent activity section already covers them.
import { taskBucket, byDue, dueState } from './tasks'
import { followUp, lastInteraction, upcomingDates } from './contact'
import { DEFAULT_PREFS } from './notifyPrefs'

export function buildAttention(
  data,
  prefs = DEFAULT_PREFS,
  snoozes = [],
  memberId = null,
  now = Date.now(),
) {
  const { people = [], tasks = [], interactions = [], keyDates = [], lists = [] } = data
  const active = people.filter((p) => !p.deleted_at)

  const hidden = new Set(
    snoozes
      .filter((s) => !memberId || s.member_id === memberId)
      .filter((s) => s.until === null || new Date(s.until).getTime() > now)
      .map((s) => s.target_key),
  )

  const items = []

  if (prefs.tasks) {
    for (const t of tasks) {
      if (t.parent_id || t.completed_at) continue
      const bucket = taskBucket(t)
      if (bucket !== 'overdue' && bucket !== 'today') continue
      items.push({ kind: 'task', key: `task:${t.id}`, urgency: bucket, task: t })
    }
    // Soonest first, then earliest time of day, then higher priority (byDue).
    items.sort((a, b) => byDue(a.task, b.task))
  }

  // A list with a due_date that's reached today (or slipped past) earns a spot —
  // the whole list is the actionable thing ("get the groceries by Fri"), so it
  // rides alongside tasks instead of duplicating into one.
  if (prefs.lists) {
    for (const l of lists) {
      const bucket = dueState(l.due_date)
      if (bucket !== 'overdue' && bucket !== 'today') continue
      items.push({ kind: 'list', key: `list:${l.id}`, urgency: bucket, list: l })
    }
  }

  if (prefs.nudges) {
    const checkIns = []
    for (const p of active) {
      const last = lastInteraction(p.id, interactions)
      const f = followUp(p, last?.occurred_at)
      if (!f || f.state === 'ok') continue
      checkIns.push({
        kind: 'nudge',
        key: `nudge:${p.id}`,
        urgency: 'overdue',
        person: p,
        state: f.state,
        lastIso: last?.occurred_at || null,
      })
    }
    // people you've never caught up with first, then longest-quiet first
    checkIns.sort((a, b) => ((a.lastIso || '') < (b.lastIso || '') ? -1 : 1))
    items.push(...checkIns)
  }

  if (prefs.dates) {
    for (const entry of upcomingDates(active, keyDates, prefs.dates_lead_days)) {
      const key =
        entry.kind === 'birthday' ? `date:b-${entry.person.id}` : `date:${entry.keyDate.id}`
      items.push({
        kind: 'date',
        key,
        urgency: entry.daysUntil === 0 ? 'today' : 'upcoming',
        entry,
      })
    }
  }

  return items.filter((i) => !hidden.has(i.key))
}

// Tab + app-icon badge: only what's actionable right now.
export function badgeCount(items) {
  return items.filter((i) => i.urgency === 'overdue' || i.urgency === 'today').length
}
