import { useMemo, useState } from 'react'
import { ArrowLeft, Plus, Edit2, Trash2, X, UserPlus, Repeat, Users } from 'react-feather'
import { completionsFor, dueLabel, dueState } from '../lib/tasks'
import { relativeTime } from '../lib/contact'
import { assigneeLabel, normalizeAssignee } from '../lib/household'
import { describeRecurrence } from '../lib/recurrence'
import { byOrder, moveUpdates } from '../lib/order'
import haptics from '../lib/haptics'
import Avatar from './Avatar'
import TaskRow from './TaskRow'
import ReorderableList from './ReorderableList'
import LinkEntityForm from './LinkEntityForm'
import AddToCalendar from './AddToCalendar'

// Full-page view for a project (a task flagged is_project and/or with
// subtasks). Adds two things a plain task doesn't get: linked people/orgs
// (the rolodex bridge) and a roomy place to manage subtasks.
//
// Subtasks can be grouped Things-style: a heading is just a subtask row with
// is_heading set, and the tasks that follow it (in manual order) sit under it.
// Dragging rows across a heading re-files them; deleting a heading merges its
// tasks into the section above.
export default function ProjectDetail({ data, taskId, onBack, onEdit, onOpenPerson }) {
  const { tasks, completions, taskLinks, people, orgs, groups = [], addTask, deleteTask, completeTask, reorderTasks, addTaskLink, deleteTaskLink } = data
  const task = tasks.find((t) => t.id === taskId)
  const [draftSub, setDraftSub] = useState('')
  const [linking, setLinking] = useState(false)

  const orgsById = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs])

  // headings + tasks interleaved, in manual order
  const subs = useMemo(() => tasks.filter((t) => t.parent_id === taskId).sort(byOrder), [tasks, taskId])
  const realSubs = useMemo(() => subs.filter((s) => !s.is_heading), [subs])

  const links = useMemo(() => {
    const byType = {
      person: new Map(people.map((p) => [p.id, p])),
      organization: new Map(orgs.map((o) => [o.id, o])),
      group: new Map(groups.map((g) => [g.id, g])),
    }
    return (taskLinks || [])
      .filter((l) => l.task_id === taskId)
      .map((l) => {
        const entity = byType[l.entity_type]?.get(l.entity_id)
        return entity ? { link: l, entity } : null
      })
      // drop links whose target was deleted (people soft-delete; orgs/groups vanish)
      .filter((r) => r && !(r.link.entity_type === 'person' && r.entity.deleted_at))
  }, [taskLinks, taskId, people, orgs, groups])

  if (!task) {
    return (
      <div>
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={18} /> Back
        </button>
        <p className="empty">Project not found.</p>
      </div>
    )
  }

  const progress = realSubs.length ? { done: realSubs.filter((s) => s.completed_at).length, total: realSubs.length } : null
  const history = completionsFor(task.id, completions)
  const dl = dueLabel(task.due_date)
  const ds = dueState(task.due_date)

  const toggle = (t) => {
    if (!t.completed_at) haptics.success()
    completeTask(t, !t.completed_at)
  }

  const addSub = (asHeading = false) => {
    const title = draftSub.trim()
    if (!title) return
    addTask(
      asHeading
        ? { title, parent_id: task.id, is_heading: true, privacy_level: task.privacy_level }
        : { title, parent_id: task.id, assignee: task.assignee, privacy_level: task.privacy_level }
    )
    setDraftSub('')
  }

  const remove = () => {
    if (window.confirm(`Delete "${task.title}" and its subtasks?`)) {
      deleteTask(task.id)
      onBack()
    }
  }

  return (
    <div className="detail">
      <button className="back-btn" onClick={onBack}>
        <ArrowLeft size={18} /> Back
      </button>

      <div className="profile-head">
        <h1 className="person-name">{task.title}</h1>
        <div className="chips" style={{ justifyContent: 'center', marginTop: 10 }}>
          {progress && <span className="chip">{progress.done}/{progress.total} done</span>}
          {normalizeAssignee(task.assignee) !== 'anyone' && <span className="chip">{assigneeLabel(task.assignee)}</span>}
          {dl && <span className={`chip due-${ds}`}>{dl}</span>}
          {task.recurrence && (
            <span className="chip" title={describeRecurrence(task.recurrence)}><Repeat size={11} /> {describeRecurrence(task.recurrence)}</span>
          )}
        </div>
        <div className="profile-actions">
          <button className="pill-btn" onClick={() => onEdit(task)}>
            <Edit2 size={15} /> Edit
          </button>
          <AddToCalendar task={task} trigger="pill" />
          <button className="pill-btn danger" onClick={remove}>
            <Trash2 size={15} /> Delete
          </button>
        </div>
      </div>

      {task.notes && (
        <>
          <div className="section-label">Notes</div>
          <div className="list">
            <p className="notes">{task.notes}</p>
          </div>
        </>
      )}

      <div className="section-label">
        Subtasks
        {progress && <span className="section-count">{progress.done}/{progress.total}</span>}
      </div>
      <div className="list">
        {subs.length > 0 && (
          <ReorderableList
            className="reorder-plain"
            items={subs}
            onMove={(from, to) => reorderTasks(moveUpdates(subs, from, to))}
            renderItem={(s) =>
              s.is_heading ? (
                <div className="heading-row">
                  <span className="heading-title">{s.title}</span>
                  <button className="icon-btn danger" onClick={() => deleteTask(s.id)} aria-label="Delete heading">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="list-row sub">
                  <TaskRow task={s} onToggle={toggle} size="sm" hideAssignee={normalizeAssignee(s.assignee) === normalizeAssignee(task.assignee)} />
                  <button className="icon-btn danger" onClick={() => deleteTask(s.id)} aria-label="Delete subtask">
                    <X size={15} />
                  </button>
                </div>
              )
            }
          />
        )}
        <div className={`subtask-composer ${subs.length > 0 ? 'divided' : ''}`}>
          <input
            value={draftSub}
            onChange={(e) => setDraftSub(e.target.value)}
            placeholder={subs.length ? 'Add a subtask…' : 'Add the first step…'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addSub()
              }
            }}
          />
          <div className="subtask-composer-actions">
            <button className="text-btn" onClick={() => addSub()} disabled={!draftSub.trim()}>
              <Plus size={15} /> Add task
            </button>
            <button className="text-btn quiet" onClick={() => addSub(true)} disabled={!draftSub.trim()} title="Group the steps below it — like “Materials” or “Phase 1”">
              Add as heading
            </button>
          </div>
        </div>
      </div>

      <div className="section-label">
        Related people &amp; orgs
        <button className="text-btn" style={{ float: 'right' }} onClick={() => setLinking(true)}>
          <UserPlus size={14} /> Link
        </button>
      </div>
      <div className="list">
        {links.length === 0 ? (
          <p className="empty-inline">Nothing linked yet. Add a person, organization, or group tied to this project — a contractor, vendor, or family member.</p>
        ) : (
          links.map(({ link, entity }) => {
            const type = link.entity_type
            const isPerson = type === 'person'
            const isGroup = type === 'group'
            const sub =
              [link.role, isPerson ? entity.role || orgsById.get(entity.organization_id)?.name : isGroup ? null : entity.type]
                .filter(Boolean)
                .join(' · ') || (isPerson ? 'Contact' : isGroup ? 'Group' : 'Organization')
            return (
              <div
                className="list-row"
                key={link.id}
                onClick={isPerson ? () => onOpenPerson(entity.id) : undefined}
                style={isPerson ? undefined : { cursor: 'default' }}
              >
                <Avatar name={entity.name} src={entity.avatar_url} size={38} kind={isPerson ? 'person' : 'org'} icon={isGroup ? Users : undefined} />
                <div className="row-body">
                  <div className="row-title">{entity.name}</div>
                  <div className="row-sub">{sub}</div>
                </div>
                <button
                  className="icon-btn danger"
                  onClick={(e) => { e.stopPropagation(); deleteTaskLink(link.id) }}
                  aria-label="Remove link"
                >
                  <X size={16} />
                </button>
              </div>
            )
          })
        )}
      </div>

      {history.length > 0 && (
        <>
          <div className="section-label">History</div>
          <div className="list">
            {history.slice(0, 6).map((c) => (
              <div className="value-row" key={c.id}>
                <span className="v-value">
                  Done {relativeTime(c.completed_at)}
                  {c.completed_by ? ` · ${assigneeLabel(c.completed_by)}` : ''}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {linking && (
        <LinkEntityForm
          taskId={task.id}
          people={people}
          orgs={orgs}
          groups={groups}
          existing={links.map((l) => l.link)}
          onSave={addTaskLink}
          onClose={() => setLinking(false)}
        />
      )}
    </div>
  )
}
