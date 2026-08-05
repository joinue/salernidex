import { useMemo } from 'react'
import { ChevronRight, Plus, Folder } from 'react-feather'
import {
  isProject,
  projectBucket,
  projectProgress,
  projectDate,
  byProjects,
  byDue,
  dueLabel,
} from '../../lib/tasks'
import Avatar from '../../components/ui/Avatar'
import PageHeader from '../../components/shell/PageHeader'
import Segmented from '../../components/ui/Segmented'
import SharedDot from '../../components/ui/SharedDot'
import SectionLabel from '../../components/ui/SectionLabel'
import EmptyState from '../../components/ui/EmptyState'

const SORT_OPTIONS = [
  { value: 'recent', label: 'Recent' },
  { value: 'name', label: 'Name' },
  { value: 'due', label: 'Due' },
]

// Compact range/target label for a project card: "Jun 3 – Jul 1" when both ends
// are set, otherwise the single date via the shared dueLabel ("in 5d", "Jul 1").
function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
function rangeLabel(p) {
  if (p.start_date && p.end_date) return `${shortDate(p.start_date)} – ${shortDate(p.end_date)}`
  return dueLabel(projectDate(p)) // null-safe
}

// The Projects index — peer to TasksView, reached via the Tasks↔Projects title
// switcher (the People-hub pattern). Projects are tasks flagged is_project; here
// they get a real front door, grouped by lifecycle (Active / Someday / Done).
export default function ProjectsView({ data, onOpenProject, onAdd, onSearch, hub, sort, onSort }) {
  const { tasks, taskLinks = [], people } = data

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])

  // Linked people per project (avatars on the card) — the rolodex bridge that a
  // generic todo app can't show. Orgs/groups are linked too but we lead with faces.
  const linkedPeople = useMemo(() => {
    const byProject = new Map()
    for (const l of taskLinks) {
      if (l.entity_type !== 'person') continue
      const person = peopleById.get(l.entity_id)
      if (!person || person.deleted_at) continue
      const arr = byProject.get(l.task_id) || []
      arr.push(person)
      byProject.set(l.task_id, arr)
    }
    return byProject
  }, [taskLinks, peopleById])

  const buckets = useMemo(() => {
    const out = { active: [], someday: [], done: [] }
    for (const t of tasks) if (isProject(t)) out[projectBucket(t)].push(t)
    out.active.sort(byProjects(sort))
    out.someday.sort(byProjects(sort))
    // Done reads newest-finished first regardless of the active sort.
    out.done.sort((a, b) => ((a.completed_at || '') < (b.completed_at || '') ? 1 : -1))
    return out
  }, [tasks, sort])

  const total = buckets.active.length + buckets.someday.length + buckets.done.length

  const nextAction = (projectId) => {
    const open = tasks
      .filter((t) => t.parent_id === projectId && !t.is_heading && !t.completed_at && t.due_date)
      .sort(byDue)
    return open[0] || null
  }

  const renderProject = (p) => {
    const progress = projectProgress(p.id, tasks)
    const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0
    const range = rangeLabel(p)
    const next = !range && projectBucket(p) === 'active' ? nextAction(p.id) : null
    const faces = (linkedPeople.get(p.id) || []).slice(0, 3)
    const sub =
      range ||
      (next ? `Next: ${next.title}` : progress ? `${progress.total} tasks` : 'No tasks yet')

    return (
      <div className="list-row" key={p.id} onClick={() => onOpenProject(p.id)}>
        <Avatar name={p.title} size={42} kind="group" icon={Folder} />
        <div className="row-body">
          <div className="row-titleline">
            <div className="row-title">{p.title}</div>
            <SharedDot item={p} />
          </div>
          <div className="row-sub">{sub}</div>
          {progress && (
            <div className="project-bar" aria-hidden="true">
              <i style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        <div className="row-meta">
          {faces.length > 0 && (
            <div className="avatar-stack">
              {faces.map((f) => (
                <Avatar key={f.id} name={f.name} src={f.avatar_url} size={24} kind="person" />
              ))}
            </div>
          )}
          {progress && (
            <span className="chip">
              {progress.done}/{progress.total}
            </span>
          )}
          <ChevronRight size={18} className="row-chevron" />
        </div>
      </div>
    )
  }

  const Section = ({ id, label }) =>
    buckets[id].length ? (
      <div>
        <SectionLabel>
          {label}
          <span className="section-count">{buckets[id].length}</span>
        </SectionLabel>
        <div className="list">{buckets[id].map(renderProject)}</div>
      </div>
    ) : null

  return (
    <div>
      <PageHeader
        title="Projects"
        navOptions={hub?.options}
        navActive={hub?.active}
        onNavigate={hub?.onNavigate}
        createAction={onAdd}
        actionLabel="New project"
        onSearch={onSearch}
        infoTitle="What’s a project?"
        info="A project is something bigger you deliberately start — a trip, a renovation, an event. It holds phased subtasks, its own lists, and the people involved. Everyday to-dos stay over in Tasks."
      />

      {total === 0 ? (
        <EmptyState
          icon={Folder}
          action={
            <button className="text-btn" onClick={onAdd}>
              <Plus size={14} /> New project
            </button>
          }
        >
          No projects yet. Start one from a template — a trip, a renovation, an event.
        </EmptyState>
      ) : (
        <>
          {total > 1 && <Segmented options={SORT_OPTIONS} value={sort} onChange={onSort} />}
          <Section id="active" label="Active" />
          <Section id="someday" label="Someday" />
          <Section id="done" label="Done" />
        </>
      )}
    </div>
  )
}
