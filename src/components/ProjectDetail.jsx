import { useMemo, useState } from 'react'
import { ArrowLeft, Plus, Edit2, Trash2, X, UserPlus, Repeat } from 'react-feather'
import { completionsFor, dueLabel, dueState } from '../lib/tasks'
import { relativeTime } from '../lib/contact'
import { assigneeLabel, normalizeAssignee } from '../lib/household'
import { describeRecurrence } from '../lib/recurrence'
import haptics from '../lib/haptics'
import Avatar from './Avatar'
import TaskRow from './TaskRow'
import LinkEntityForm from './LinkEntityForm'

// Full-page view for a project (a task flagged is_project and/or with
// subtasks). Adds two things a plain task doesn't get: linked people/orgs
// (the rolodex bridge) and a roomy place to manage subtasks.
export default function ProjectDetail({ data, taskId, onBack, onEdit, onOpenPerson }) {
  const { tasks, completions, taskLinks, people, orgs, addTask, deleteTask, completeTask, addTaskLink, deleteTaskLink } = data
  const task = tasks.find((t) => t.id === taskId)
  const [draftSub, setDraftSub] = useState('')
  const [linking, setLinking] = useState(false)

  const subs = useMemo(() => tasks.filter((t) => t.parent_id === taskId), [tasks, taskId])

  const links = useMemo(() => {
    const peopleById = new Map(people.map((p) => [p.id, p]))
    const orgsById = new Map(orgs.map((o) => [o.id, o]))
    return (taskLinks || [])
      .filter((l) => l.task_id === taskId)
      .map((l) => {
        const entity = l.entity_type === 'person' ? peopleById.get(l.entity_id) : orgsById.get(l.entity_id)
        return entity ? { link: l, entity } : null
      })
      // drop links whose target was deleted (people soft-delete, orgs vanish)
      .filter((r) => r && !(r.link.entity_type === 'person' && r.entity.deleted_at))
  }, [taskLinks, taskId, people, orgs])

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

  const progress = subs.length ? { done: subs.filter((s) => s.completed_at).length, total: subs.length } : null
  const history = completionsFor(task.id, completions)
  const dl = dueLabel(task.due_date)
  const ds = dueState(task.due_date)

  const toggle = (t) => {
    if (!t.completed_at) haptics.success()
    completeTask(t, !t.completed_at)
  }

  const addSub = () => {
    const title = draftSub.trim()
    if (!title) return
    addTask({ title, parent_id: task.id, assignee: task.assignee, privacy_level: task.privacy_level })
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

      <div className="section-label">Subtasks</div>
      <div className="list">
        {subs.length === 0 && <p className="empty-inline">No subtasks yet — break the project down below.</p>}
        {subs.map((s) => (
          <div className="list-row sub" key={s.id}>
            <TaskRow task={s} onToggle={toggle} size="sm" />
            <button className="icon-btn danger" onClick={() => deleteTask(s.id)} aria-label="Delete subtask">
              <X size={15} />
            </button>
          </div>
        ))}
        <div className="subtask-add">
          <input
            value={draftSub}
            onChange={(e) => setDraftSub(e.target.value)}
            placeholder="Add a subtask…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addSub()
              }
            }}
          />
          <button className="text-btn" onClick={addSub}>Add</button>
        </div>
      </div>

      <div className="section-label">
        Related contacts
        <button className="text-btn" style={{ float: 'right' }} onClick={() => setLinking(true)}>
          <UserPlus size={14} /> Link
        </button>
      </div>
      <div className="list">
        {links.length === 0 ? (
          <p className="empty-inline">No one linked yet. Add the contractor, vendor, or anyone tied to this project.</p>
        ) : (
          links.map(({ link, entity }) => {
            const isPerson = link.entity_type === 'person'
            return (
              <div
                className="list-row"
                key={link.id}
                onClick={isPerson ? () => onOpenPerson(entity.id) : undefined}
                style={isPerson ? undefined : { cursor: 'default' }}
              >
                <Avatar name={entity.name} size={38} kind={isPerson ? 'person' : 'org'} />
                <div className="row-body">
                  <div className="row-title">{entity.name}</div>
                  <div className="row-sub">
                    {[link.role, isPerson ? (entity.role || entity.organization) : entity.type].filter(Boolean).join(' · ') || (isPerson ? 'Contact' : 'Organization')}
                  </div>
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
          existing={links.map((l) => l.link)}
          onSave={addTaskLink}
          onClose={() => setLinking(false)}
        />
      )}
    </div>
  )
}
