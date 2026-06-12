// Builds the shared household-activity feed: touchpoints logged, tasks
// completed, and list activity, merged newest-first. The Today card shows the
// head of this feed; the Activity log shows all of it. Each entry carries a
// `kind` that consumers branch on when rendering.
export function buildActivityFeed({ people, interactions, completions, tasks, lists, listItems }) {
  const byId = new Map((people || []).map((p) => [p.id, p]))
  const taskById = new Map((tasks || []).map((t) => [t.id, t]))
  const entries = []

  for (const it of interactions || []) {
    const person = byId.get(it.person_id)
    if (!person || person.deleted_at) continue
    entries.push({ kind: 'interaction', ts: it.occurred_at, key: `i-${it.id}`, it, person })
  }

  for (const c of completions || []) {
    const task = taskById.get(c.task_id)
    if (!task) continue
    entries.push({ kind: 'completion', ts: c.completed_at, key: `c-${c.id}`, task, by: c.completed_by })
  }

  // One row per list, keyed off its most recent item activity (added or checked
  // off) — collapses a whole grocery run into a single line.
  for (const list of lists || []) {
    let best = null
    for (const item of listItems || []) {
      if (item.list_id !== list.id) continue
      const events = [{ ts: item.created_at, action: 'added', text: item.text }]
      if (item.checked_at) events.push({ ts: item.checked_at, action: 'checked', text: item.text })
      for (const ev of events) if (ev.ts && (!best || ev.ts > best.ts)) best = ev
    }
    if (best) entries.push({ kind: 'list', ts: best.ts, key: `l-${list.id}`, list, action: best.action, text: best.text })
  }

  return entries.sort((a, b) => (a.ts < b.ts ? 1 : -1))
}

// Header label for a day-grouped feed: "Today", "Yesterday", a weekday within
// the last week, then a full date.
export function activityDayLabel(iso) {
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate())
  const d = new Date(iso)
  const diff = Math.round((startOf(new Date()) - startOf(d)) / 86400000)
  if (diff <= 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' })
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

// Groups an already-sorted (newest-first) feed into [{ label, items }] day
// sections, preserving order.
export function groupByDay(entries) {
  const groups = []
  let current = null
  for (const e of entries) {
    const label = activityDayLabel(e.ts)
    if (!current || current.label !== label) {
      current = { label, items: [] }
      groups.push(current)
    }
    current.items.push(e)
  }
  return groups
}
