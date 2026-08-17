import { noteTitle } from './notes'

// Builds the shared household-activity feed: touchpoints logged, tasks
// completed, habits checked in, list activity, and things made or edited,
// merged newest-first. The
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
  notes,
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
  //
  // `by` rides along per-event, not per-item: the person who added grout sealer
  // is often not the person who later ticked it off, so the credit has to come
  // from whichever of the two events won the recency contest. It stays a raw id
  // here (resolved for display by household.actorLabel) so this module keeps
  // working off plain rows, and null when the row predates the columns — the
  // row then renders with no name rather than a guessed one.
  for (const list of lists || []) {
    let best = null
    for (const item of listItems || []) {
      if (item.list_id !== list.id) continue
      const events = [
        { ts: item.created_at, action: 'added', text: item.text, by: item.created_by || null },
      ]
      if (item.checked_at)
        events.push({
          ts: item.checked_at,
          action: 'checked',
          text: item.text,
          by: item.checked_by || null,
        })
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
        by: best.by,
      })
  }

  entries.push(...changes({ tasks, notes, lists }))

  return entries.sort((a, b) => (a.ts < b.ts ? 1 : -1))
}

// A row counts as freshly made, rather than edited, when its last write lands
// within this of its first. The two timestamps are set by different clocks (the
// optimistic local insert, then the DB trigger on the way back), so they're
// close but rarely identical.
const CREATE_WINDOW_MS = 4000

// What KIND of thing changed, for the row's icon and its link. Reminders and
// projects are tasks in the table but not in the sentence: "Nina added a
// reminder" is the useful line, "Nina added a task" is not.
function taskEntity(t) {
  if (t.is_reminder) return 'reminder'
  if (t.is_project) return 'project'
  return 'task'
}

// Things made and things changed — the half of "what happened" the feed never
// had. It reported what got *finished* (completions, check-ins, items ticked
// off), so a partner adding three tasks, rewriting a note, or moving a project's
// dates left no trace anywhere in the app.
//
// Built from `updated_by`/`updated_at`, which every one of these tables already
// carries and useData already has in memory — no audit_log read, no migration.
// One entry per row, because the columns hold the LAST write: an edit that took
// six saves is one line, which is also what you'd want if it were free.
// Creates arrive in bursts and edits don't, so only creates get collapsed. A
// project template makes a project and eight subtasks in one tap; an import
// lands hundreds at once; and a brand-new account would otherwise open its feed
// to one "Added a task" per row it has ever held. Three or more of a kind, by
// one person, on one day, become a single line — which is also what you'd want
// if it were free, because "Nina added 8 tasks" is the fact, not eight facts.
//
// Edits stay individual: three notes edited are three different things to know,
// and nobody edits in bursts of twenty.
const COLLAPSE_AT = 3

export function changes({ tasks = [], notes = [], lists = [] } = {}) {
  const out = []

  const add = (entity, id, row, title) => {
    const created = row.created_at
    const updated = row.updated_at || created
    if (!updated) return
    const isCreate = !created || new Date(updated) - new Date(created) < CREATE_WINDOW_MS
    out.push({
      kind: 'change',
      ts: updated,
      key: `ch-${entity}-${id}`,
      entity,
      action: isCreate ? 'added' : 'edited',
      title,
      id,
      // created_by on a fresh row, updated_by on an edit — the actor for the
      // event being reported, not whoever happened to make the thing.
      by: (isCreate ? row.created_by : row.updated_by || row.created_by) || null,
    })
  }

  for (const t of tasks) {
    // Headings are structure, not things anyone did.
    if (t.is_heading || !t.title) continue
    // A completion already has its own entry, and `updated_at` moves when you
    // tick something off — so without this every check-off would also file an
    // "edited", and the feed would report each one twice.
    if (t.completed_at && Math.abs(new Date(t.updated_at) - new Date(t.completed_at)) < 60000)
      continue
    add(taskEntity(t), t.id, t, t.title)
  }

  for (const n of notes) {
    if (n.deleted_at) continue
    add('note', n.id, n, noteTitle(n))
  }

  // The list itself — renamed, re-dated, its icon changed. Items added and
  // ticked off are already covered above, keyed off the items themselves.
  for (const l of lists) {
    if (!l.updated_at || l.updated_at === l.created_at) continue
    add('list', l.id, l, l.name)
  }

  // Same day, same person, same kind of thing → one line. Keyed on the local
  // day, matching how the feed groups itself for display, so a collapsed row
  // never straddles two of the headings it sits under.
  const buckets = new Map()
  const singles = []
  for (const e of out) {
    if (e.action !== 'added') {
      singles.push(e)
      continue
    }
    const key = `${String(e.ts).slice(0, 10)}|${e.by || ''}|${e.entity}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(e)
  }

  for (const group of buckets.values()) {
    if (group.length < COLLAPSE_AT) {
      singles.push(...group)
      continue
    }
    // Newest of the burst carries the row, so it sorts where the activity was.
    const newest = group.reduce((a, b) => (a.ts > b.ts ? a : b))
    singles.push({
      kind: 'change',
      ts: newest.ts,
      key: `ch-many-${newest.entity}-${newest.by || 'x'}-${String(newest.ts).slice(0, 10)}`,
      entity: newest.entity,
      action: 'added',
      count: group.length,
      by: newest.by,
      // No single id to open — the row goes to that kind's index instead.
      id: null,
      title: null,
    })
  }

  return singles
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
