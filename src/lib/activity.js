// Builds the shared household-activity feed: touchpoints logged, tasks
// completed, habits checked in, and list activity, merged newest-first. The
// Today card shows the head of this feed; the Activity log shows all of it.
// Each entry carries a `kind` that consumers branch on when rendering.
export function buildActivityFeed({
  people,
  interactions,
  completions,
  tasks,
  lists,
  listItems,
  habits,
  habitEntries,
}) {
  const byId = new Map((people || []).map((p) => [p.id, p]))
  const taskById = new Map((tasks || []).map((t) => [t.id, t]))
  const habitById = new Map((habits || []).map((h) => [h.id, h]))
  const entries = []

  for (const it of interactions || []) {
    const person = byId.get(it.person_id)
    if (!person || person.deleted_at) continue
    entries.push({ kind: 'interaction', ts: it.occurred_at, key: `i-${it.id}`, it, person })
  }

  for (const c of completions || []) {
    const task = taskById.get(c.task_id)
    if (!task) continue
    entries.push({
      kind: 'completion',
      ts: c.completed_at,
      key: `c-${c.id}`,
      task,
      by: c.completed_by,
    })
  }

  // Habit check-ins. An entry row exists only because someone logged the day
  // (absence of a row means zero — see lib/habits), so every row is a real
  // event. Rest days are the exception: "paused this one" is a legitimate
  // action but reads as noise in a log of what got done. `updated_at` rather
  // than `date`, because the row is upserted per (habit, day) — re-logging an
  // afternoon run should move it up the feed, and a bare date wouldn't sort
  // against the timestamps everything else carries.
  for (const e of habitEntries || []) {
    if (e.skipped) continue
    const habit = habitById.get(e.habit_id)
    if (!habit || habit.deleted_at) continue
    entries.push({
      kind: 'habit',
      ts: e.updated_at || e.created_at || e.date,
      key: `h-${e.id || `${e.habit_id}-${e.date}`}`,
      habit,
      value: Number(e.value),
      note: e.note || null,
      date: e.date,
    })
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
    if (best)
      entries.push({
        kind: 'list',
        ts: best.ts,
        key: `l-${list.id}`,
        list,
        action: best.action,
        text: best.text,
      })
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
