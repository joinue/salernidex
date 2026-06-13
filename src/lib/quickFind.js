import { isProject, dueLabel } from './tasks'
import { groupMembers } from './groups'

// Quick Find: one ranked index across every entity — people, tasks, lists,
// orgs, groups — plus pages and create actions. Same scoring idea as
// searchPeople (every query word must match somewhere, word-start doubles,
// best field wins per word) so results feel consistent with People search.

// Pages, with synonyms so "network" finds Relationships, "export" finds
// Import / Export, etc.
const NAV = [
  { route: '', title: 'Today', alias: 'home dashboard' },
  { route: 'tasks', title: 'Tasks', alias: 'todos chores projects' },
  { route: 'lists', title: 'Lists', alias: 'groceries shopping' },
  { route: 'people', title: 'People', alias: 'contacts rolodex' },
  { route: 'activity', title: 'Activity', alias: 'history log touchpoints' },
  { route: 'relationships', title: 'Relationships', alias: 'network connections' },
  { route: 'orgs', title: 'Organizations', alias: 'companies orgs' },
  { route: 'groups', title: 'Groups', alias: 'tags circles' },
  { route: 'import', title: 'Import / Export', alias: 'backup csv restore' },
  { route: 'settings', title: 'Settings', alias: 'theme notifications preferences' },
]

const ACTIONS = [
  { action: 'person', title: 'New person', alias: 'add contact create' },
  { action: 'task', title: 'New task', alias: 'add todo create' },
  { action: 'list', title: 'New list', alias: 'add create' },
  { action: 'org', title: 'New organization', alias: 'add company create' },
  { action: 'group', title: 'New group', alias: 'add create' },
  { action: 'relationship', title: 'New relationship', alias: 'add connection create' },
]

// Display order of sections; also the tie-break when scores match.
export const TYPE_LABELS = {
  person: 'People',
  project: 'Projects',
  task: 'Tasks',
  list: 'Lists',
  org: 'Organizations',
  group: 'Groups',
  nav: 'Pages',
  action: 'New',
}
const TYPE_RANK = Object.keys(TYPE_LABELS)

// Each entry: { key, type, id?, route?, action?, title, sub, fields: [[text, weight]] }
// `key` is stable across sessions — it's what recents store.
export function buildIndex(data) {
  const entries = []
  const add = (e) =>
    entries.push({ ...e, key: `${e.type}:${e.id || e.route || e.action || e.title}` })

  for (const n of NAV)
    add({
      type: 'nav',
      route: n.route,
      title: n.title,
      sub: 'Page',
      fields: [
        [n.title, 60],
        [n.alias, 25],
      ],
    })
  for (const a of ACTIONS)
    add({
      type: 'action',
      action: a.action,
      title: a.title,
      sub: 'Create',
      fields: [
        [a.title, 50],
        [a.alias, 25],
      ],
    })

  const orgNameById = new Map((data.orgs || []).map((o) => [o.id, o.name]))
  for (const p of data.people) {
    if (p.deleted_at) continue
    const orgName = orgNameById.get(p.organization_id) || ''
    add({
      type: 'person',
      id: p.id,
      title: p.name || 'Unnamed',
      avatar_url: p.avatar_url || null,
      sub: [p.role, orgName].filter(Boolean).join(' · ') || 'Person',
      fields: [
        [p.name, 100],
        [orgName, 40],
        [p.role, 30],
        [(p.tags || []).join(' '), 30],
        [p.email, 20],
        [p.notes, 10],
      ],
    })
  }

  const byId = new Map(data.tasks.map((t) => [t.id, t]))
  for (const t of data.tasks) {
    if (t.completed_at || t.is_heading) continue // headings are structure, not destinations
    const parent = t.parent_id ? byId.get(t.parent_id) : null
    const project = !parent && isProject(t)
    add({
      type: project ? 'project' : 'task',
      id: t.id,
      parentId: parent?.id || null,
      title: t.title || 'Untitled',
      sub: parent ? `In ${parent.title}` : dueLabel(t.due_date) || (project ? 'Project' : 'Task'),
      fields: [
        [t.title, 90],
        [t.notes, 10],
      ],
    })
  }

  const itemsByList = new Map()
  for (const it of data.listItems || []) {
    itemsByList.set(it.list_id, (itemsByList.get(it.list_id) || '') + ' ' + (it.text || ''))
  }
  for (const l of data.lists) {
    const open = (data.listItems || []).filter((it) => it.list_id === l.id && !it.checked_at).length
    add({
      type: 'list',
      id: l.id,
      icon: l.icon,
      title: l.name || 'Untitled',
      sub: open ? `${open} item${open === 1 ? '' : 's'} left` : 'List',
      // Item text indexed too, so "milk" finds Groceries.
      fields: [
        [l.name, 80],
        [itemsByList.get(l.id), 15],
      ],
    })
  }

  for (const o of data.orgs) {
    add({
      type: 'org',
      id: o.id,
      title: o.name || 'Unnamed',
      sub: o.type || 'Organization',
      fields: [
        [o.name, 70],
        [o.type, 20],
        [(o.tags || []).join(' '), 20],
        [o.description, 10],
      ],
    })
  }

  for (const g of data.groups) {
    const n = groupMembers(g, data.people).length
    add({
      type: 'group',
      id: g.id,
      title: g.name || 'Unnamed',
      sub: `${n} ${n === 1 ? 'person' : 'people'}`,
      fields: [
        [g.name, 70],
        [[...(g.all_tags || []), ...(g.any_tags || [])].join(' '), 25],
      ],
    })
  }

  return entries
}

// Ranked flat results. Same contract as searchPeople: all words must match.
export function searchIndex(entries, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []

  const scored = []
  for (const entry of entries) {
    const fields = entry.fields.map(([text, weight]) => [(text || '').toLowerCase(), weight])
    let total = 0
    let allMatched = true
    for (const word of words) {
      let best = 0
      for (const [text, weight] of fields) {
        const idx = text.indexOf(word)
        if (idx === -1) continue
        let score = weight
        if (idx === 0 || text[idx - 1] === ' ') score *= 2 // word-start bonus
        best = Math.max(best, score)
      }
      if (!best) {
        allMatched = false
        break
      }
      total += best
    }
    if (allMatched) scored.push({ entry, total })
  }
  return scored
    .sort(
      (a, b) =>
        b.total - a.total || TYPE_RANK.indexOf(a.entry.type) - TYPE_RANK.indexOf(b.entry.type),
    )
    .map((s) => s.entry)
}

// Group a ranked flat list into sections, preserving rank order between
// sections (a section appears where its best hit ranked). Caps keep the
// palette scannable.
export function groupResults(ranked, { perType = 5, max = 18 } = {}) {
  const sections = []
  const byType = new Map()
  let total = 0
  for (const entry of ranked) {
    if (total >= max) break
    let section = byType.get(entry.type)
    if (!section) {
      section = { type: entry.type, label: TYPE_LABELS[entry.type], items: [] }
      byType.set(entry.type, section)
      sections.push(section)
    }
    if (section.items.length >= perType) continue
    section.items.push(entry)
    total++
  }
  return sections
}

// ---------- recents (most recently opened via Quick Find) ----------

const RECENTS_KEY = 'salernidex-qf-recents'
const RECENTS_MAX = 8

export function loadRecents(entries) {
  let keys = []
  try {
    keys = JSON.parse(localStorage.getItem(RECENTS_KEY)) || []
  } catch {
    keys = []
  }
  const byKey = new Map(entries.map((e) => [e.key, e]))
  return keys.map((k) => byKey.get(k)).filter(Boolean) // stale keys drop out
}

export function pushRecent(entry) {
  let keys = []
  try {
    keys = JSON.parse(localStorage.getItem(RECENTS_KEY)) || []
  } catch {
    keys = []
  }
  keys = [entry.key, ...keys.filter((k) => k !== entry.key)].slice(0, RECENTS_MAX)
  localStorage.setItem(RECENTS_KEY, JSON.stringify(keys))
}

// Split `text` into segments, marking the parts any query word matches —
// drives the <mark> highlight in results.
export function highlightSegments(text, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length || !text) return [{ text, hit: false }]
  const lower = text.toLowerCase()
  const hits = new Array(text.length).fill(false)
  for (const word of words) {
    let from = 0
    while (true) {
      const idx = lower.indexOf(word, from)
      if (idx === -1) break
      for (let i = idx; i < idx + word.length; i++) hits[i] = true
      from = idx + 1
    }
  }
  const segments = []
  for (let i = 0; i < text.length; i++) {
    const last = segments[segments.length - 1]
    if (last && last.hit === hits[i]) last.text += text[i]
    else segments.push({ text: text[i], hit: hits[i] })
  }
  return segments
}
