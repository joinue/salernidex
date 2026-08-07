import { useMemo, useState } from 'react'
import {
  Plus,
  Edit2,
  Trash2,
  X,
  UserPlus,
  Repeat,
  Users,
  SkipForward,
  Calendar,
  Moon,
  CheckCircle,
  RotateCcw,
  ChevronRight,
  List as ListIcon,
} from 'react-feather'
import { useConfirm } from '../../hooks/useConfirm'
import { completionsFor, deadlineLabel, dueLabel, dueState, isDeadline } from '../../lib/tasks'
import { relativeTime } from '../../lib/contact'
import { assigneeLabel, normalizeAssignee } from '../../lib/household'
import { describeRecurrence } from '../../lib/recurrence'
import { byOrder, moveUpdates } from '../../lib/order'
import { personSummary } from '../../lib/orgs'
import haptics from '../../lib/haptics'
import Avatar from '../../components/ui/Avatar'
import TaskRow from './TaskRow'
import ReorderableList from '../../components/ui/ReorderableList'
import LinkEntityForm from '../people/LinkEntityForm'
import AddToCalendar from '../../components/ui/AddToCalendar'
import NavBar from '../../components/ui/NavBar'
import SectionLabel from '../../components/ui/SectionLabel'
import EmptyState from '../../components/ui/EmptyState'
import IconButton from '../../components/ui/IconButton'
import Sheet from '../../components/ui/Sheet'
import SwipeRow from '../../components/ui/SwipeRow'
import NoteBacklinks from '../../components/ui/NoteBacklinks'

// Full-page view for a project (a task flagged is_project and/or with
// subtasks). Adds two things a plain task doesn't get: linked people/orgs
// (the rolodex bridge) and a roomy place to manage subtasks.
//
// Subtasks can be grouped Things-style: a heading is just a subtask row with
// is_heading set, and the tasks that follow it (in manual order) sit under it.
// Dragging rows across a heading re-files them; deleting a heading merges its
// tasks into the section above.
export default function ProjectDetail({
  data,
  taskId,
  onBack,
  onEdit,
  onOpenPerson,
  onOpenOrg,
  onOpenGroup,
  onOpenList,
  onOpenNote,
}) {
  const {
    tasks,
    notes = [],
    completions,
    taskLinks,
    people,
    orgs,
    affiliations = [],
    groups = [],
    lists = [],
    addTask,
    updateTask,
    deleteTask,
    completeTask,
    skipTaskOccurrence,
    reorderTasks,
    addTaskLink,
    deleteTaskLink,
    saveList,
  } = data
  const confirm = useConfirm()
  const task = tasks.find((t) => t.id === taskId)
  const [draftSub, setDraftSub] = useState('')
  const [draftList, setDraftList] = useState('')
  const [linking, setLinking] = useState(false)
  const [attaching, setAttaching] = useState(false)
  // Notes are edited inline (this is the project's reference scratchpad —
  // measurements, confirmation #s). Seeded from the row; saved on blur.
  const [notesDraft, setNotesDraft] = useState(task?.notes || '')

  const projectLists = useMemo(() => lists.filter((l) => l.project_id === taskId), [lists, taskId])

  // Free-standing lists (not already tied to a project) you can pull in. Keeping
  // it to unattached lists means attaching here never quietly steals a list from
  // another project.
  const attachableLists = useMemo(
    () => lists.filter((l) => !l.project_id).sort((a, b) => a.name.localeCompare(b.name)),
    [lists],
  )

  const orgsById = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs])

  // headings + tasks interleaved, in manual order
  const subs = useMemo(
    () => tasks.filter((t) => t.parent_id === taskId).sort(byOrder),
    [tasks, taskId],
  )
  const realSubs = useMemo(() => subs.filter((s) => !s.is_heading), [subs])

  const links = useMemo(() => {
    const byType = {
      person: new Map(people.map((p) => [p.id, p])),
      organization: new Map(orgs.map((o) => [o.id, o])),
      group: new Map(groups.map((g) => [g.id, g])),
    }
    return (
      (taskLinks || [])
        .filter((l) => l.task_id === taskId)
        .map((l) => {
          const entity = byType[l.entity_type]?.get(l.entity_id)
          return entity ? { link: l, entity } : null
        })
        // drop links whose target was deleted (people soft-delete; orgs/groups vanish)
        .filter((r) => r && !(r.link.entity_type === 'person' && r.entity.deleted_at))
    )
  }, [taskLinks, taskId, people, orgs, groups])

  if (!task) {
    return (
      <div>
        <NavBar backLabel="Back" onBack={onBack} title="Not found" />
        <EmptyState>Project not found.</EmptyState>
      </div>
    )
  }

  const progress = realSubs.length
    ? { done: realSubs.filter((s) => s.completed_at).length, total: realSubs.length }
    : null
  const history = completionsFor(task.id, completions)
  // A project can carry a deadline too ("renovation done by the 30th"), and it
  // reads the same way here as on a task row: room left, not a day to show up.
  const dl = isDeadline(task)
    ? deadlineLabel(task.due_date, task.due_time)
    : dueLabel(task.due_date, task.due_time)
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
        : { title, parent_id: task.id, assignee: task.assignee, privacy_level: task.privacy_level },
    )
    setDraftSub('')
  }

  const addList = () => {
    const name = draftList.trim()
    if (!name) return
    // Scoped to this project (project_id) yet still a normal household list —
    // it shows in global Lists too. Privacy follows the project's.
    saveList({ name, kind: 'standard', privacy_level: task.privacy_level, project_id: task.id })
    setDraftList('')
  }

  // Pull an existing household list into this project (it keeps living in global
  // Lists too — project_id is just a tag). Detach reverses it without deleting.
  const attachList = (listId) => {
    saveList({ project_id: task.id }, listId)
    setAttaching(false)
  }
  const detachList = async (listId) => {
    const l = lists.find((x) => x.id === listId)
    const ok = await confirm({
      title: `Remove “${l?.name || 'this list'}”?`,
      message: 'It comes off this project but stays in your Lists — nothing is deleted.',
      confirmLabel: 'Remove',
      danger: true,
    })
    if (ok) saveList({ project_id: null }, listId)
  }

  const setStatus = (status) => updateTask(task.id, { project_status: status })
  const toggleDone = () => completeTask(task, !task.completed_at)
  const setDate = (field, value) => updateTask(task.id, { [field]: value || null })

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${task.title}”?`,
      message: realSubs.length
        ? `Its ${realSubs.length} subtask${realSubs.length === 1 ? '' : 's'} go too. This can't be undone.`
        : "This can't be undone.",
      confirmLabel: 'Delete project',
      danger: true,
    })
    if (!ok) return
    deleteTask(task.id)
    onBack()
  }

  const isDone = !!task.completed_at
  const isSomeday = task.project_status === 'someday'

  return (
    <div className="detail">
      <NavBar backLabel="Projects" onBack={onBack} title={task.title}>
        <div className="profile-head">
          <h1 className="person-name">{task.title}</h1>
          <div className="chips" style={{ justifyContent: 'center', marginTop: 10 }}>
            {progress && (
              <span className="chip">
                {progress.done}/{progress.total} done
              </span>
            )}
            {isDone ? (
              <span className="chip">Done</span>
            ) : isSomeday ? (
              <span className="chip">
                <Moon size={11} /> Someday
              </span>
            ) : null}
            {normalizeAssignee(task.assignee) !== 'anyone' && (
              <span className="chip">{assigneeLabel(task.assignee)}</span>
            )}
            {dl && <span className={`chip due-${ds}`}>{dl}</span>}
            {task.recurrence && (
              <span className="chip" title={describeRecurrence(task.recurrence)}>
                <Repeat size={11} /> {describeRecurrence(task.recurrence)}
              </span>
            )}
          </div>
          <div className="profile-actions">
            <button className="pill-btn" onClick={() => onEdit(task)}>
              <Edit2 size={15} /> Edit
            </button>
            <AddToCalendar task={task} trigger="pill" />
            {task.recurrence && (
              <button className="pill-btn" onClick={() => skipTaskOccurrence(task)}>
                <SkipForward size={15} /> Skip this one
              </button>
            )}
          </div>
        </div>
      </NavBar>

      <SectionLabel>Status &amp; dates</SectionLabel>
      <div className="list" style={{ padding: 12 }}>
        <div className="project-status-row">
          <button
            className={`pill-btn ${!isDone && !isSomeday ? 'on' : ''}`}
            onClick={() => {
              if (isDone) toggleDone()
              setStatus('active')
            }}
          >
            Active
          </button>
          <button
            className={`pill-btn ${!isDone && isSomeday ? 'on' : ''}`}
            onClick={() => {
              if (isDone) toggleDone()
              setStatus('someday')
            }}
          >
            <Moon size={14} /> Someday
          </button>
          <button className={`pill-btn ${isDone ? 'on' : ''}`} onClick={toggleDone}>
            {isDone ? (
              <>
                <RotateCcw size={14} /> Reopen
              </>
            ) : (
              <>
                <CheckCircle size={14} /> Mark done
              </>
            )}
          </button>
        </div>
        <div className="project-dates">
          <label className="project-date-field">
            <span className="project-date-label">
              <Calendar size={13} /> Start
            </span>
            <input
              type="date"
              value={task.start_date || ''}
              onChange={(e) => setDate('start_date', e.target.value)}
            />
          </label>
          <label className="project-date-field">
            <span className="project-date-label">
              <Calendar size={13} /> Target
            </span>
            <input
              type="date"
              value={task.end_date || ''}
              min={task.start_date || undefined}
              onChange={(e) => setDate('end_date', e.target.value)}
            />
          </label>
        </div>
      </div>

      <SectionLabel>Notes</SectionLabel>
      <div className="list project-notes-card">
        <textarea
          className="project-notes-edit"
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={() => {
            if (notesDraft !== (task.notes || '')) updateTask(task.id, { notes: notesDraft })
          }}
          placeholder="Measurements, confirmation #s, links — anything you want at hand."
        />
      </div>

      <SectionLabel>
        Subtasks
        {progress && (
          <span className="section-count">
            {progress.done}/{progress.total}
          </span>
        )}
      </SectionLabel>
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
                  <IconButton
                    icon={X}
                    variant="danger"
                    label="Delete heading"
                    onClick={() => deleteTask(s.id)}
                  />
                </div>
              ) : (
                <div className="list-row sub">
                  <TaskRow
                    task={s}
                    onToggle={toggle}
                    size="sm"
                    hideAssignee={
                      normalizeAssignee(s.assignee) === normalizeAssignee(task.assignee)
                    }
                  />
                  <IconButton
                    icon={X}
                    variant="danger"
                    label="Delete subtask"
                    onClick={() => deleteTask(s.id)}
                  />
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
            <button
              className="text-btn quiet"
              onClick={() => addSub(true)}
              disabled={!draftSub.trim()}
              title="Group the steps below it — like “Materials” or “Phase 1”"
            >
              Add as heading
            </button>
          </div>
        </div>
      </div>

      <SectionLabel>Lists</SectionLabel>
      <div className="list">
        {projectLists.map((l) => {
          const left = (data.listItems || []).filter(
            (it) => it.list_id === l.id && !it.checked_at,
          ).length
          return (
            <SwipeRow
              key={l.id}
              label={l.name}
              onClick={() => onOpenList?.(l.id)}
              actions={[
                {
                  label: 'Remove',
                  icon: X,
                  variant: 'danger',
                  onClick: () => detachList(l.id),
                },
              ]}
            >
              <div className="list-row project-list-row">
                <span className="list-emoji" style={l.color ? { background: l.color } : undefined}>
                  {l.icon || (l.kind === 'grocery' ? '🛒' : '📝')}
                </span>
                <div className="row-body">
                  <div className="row-title">{l.name}</div>
                  <div className="row-sub">
                    {left ? `${left} item${left === 1 ? '' : 's'} left` : 'All done'}
                  </div>
                </div>
                <ChevronRight size={18} className="row-chevron" />
              </div>
            </SwipeRow>
          )
        })}
        <div className={`subtask-composer ${projectLists.length > 0 ? 'divided' : ''}`}>
          <ListIcon size={15} className="muted" style={{ flexShrink: 0 }} />
          <input
            value={draftList}
            onChange={(e) => setDraftList(e.target.value)}
            placeholder={projectLists.length ? 'Add a list…' : 'Add a packing or materials list…'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addList()
              }
            }}
          />
          <div className="subtask-composer-actions">
            <button className="text-btn" onClick={addList} disabled={!draftList.trim()}>
              <Plus size={15} /> Add list
            </button>
            <button
              className="text-btn quiet"
              onClick={() => setAttaching(true)}
              disabled={attachableLists.length === 0}
              title={
                attachableLists.length === 0
                  ? 'No unattached lists to add'
                  : 'Attach a list you already have'
              }
            >
              Attach existing
            </button>
          </div>
        </div>
      </div>

      <SectionLabel>
        Related people &amp; orgs
        <button className="text-btn" style={{ float: 'right' }} onClick={() => setLinking(true)}>
          <UserPlus size={14} /> Link
        </button>
      </SectionLabel>
      <div className="list">
        {links.length === 0 ? (
          <EmptyState inline>
            Nothing linked yet. Add a person, organization, or group tied to this project — a
            contractor, vendor, or family member.
          </EmptyState>
        ) : (
          links.map(({ link, entity }) => {
            const type = link.entity_type
            const isPerson = type === 'person'
            const isGroup = type === 'group'
            const sub =
              [
                link.role,
                isPerson
                  ? personSummary(entity, affiliations, orgsById)
                  : isGroup
                    ? null
                    : entity.type,
              ]
                .filter(Boolean)
                .join(' · ') || (isPerson ? 'Contact' : isGroup ? 'Group' : 'Organization')
            const open = isPerson
              ? () => onOpenPerson(entity.id)
              : isGroup
                ? () => onOpenGroup(entity.id)
                : () => onOpenOrg(entity.id)
            return (
              <div className="list-row" key={link.id} onClick={open}>
                <Avatar
                  name={entity.name}
                  src={entity.avatar_url}
                  size={38}
                  kind={isPerson ? 'person' : 'org'}
                  icon={isGroup ? Users : undefined}
                />
                <div className="row-body">
                  <div className="row-title">{entity.name}</div>
                  <div className="row-sub">{sub}</div>
                </div>
                <IconButton
                  icon={X}
                  variant="danger"
                  label="Remove link"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteTaskLink(link.id)
                  }}
                />
              </div>
            )
          })
        )}
      </div>

      <NoteBacklinks notes={notes} type={['project', 'task']} id={taskId} onOpenNote={onOpenNote} />

      {history.length > 0 && (
        <>
          <SectionLabel>History</SectionLabel>
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

      {/* Destructive action lives at the foot of the page and reads quietly.
          As a filled red pill next to Edit it carried the same weight as the
          safest action on the screen. */}
      <div className="danger-zone">
        <button className="text-btn danger" onClick={remove}>
          <Trash2 size={14} /> Delete project
        </button>
      </div>

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

      {attaching && (
        <Sheet title="Attach a list" onClose={() => setAttaching(false)}>
          <div className="list">
            {attachableLists.length === 0 ? (
              <EmptyState inline>No unattached lists. Create one above instead.</EmptyState>
            ) : (
              attachableLists.map((l) => {
                const left = (data.listItems || []).filter(
                  (it) => it.list_id === l.id && !it.checked_at,
                ).length
                return (
                  <div className="list-row" key={l.id} onClick={() => attachList(l.id)}>
                    <span
                      className="list-emoji"
                      style={l.color ? { background: l.color } : undefined}
                    >
                      {l.icon || (l.kind === 'grocery' ? '🛒' : '📝')}
                    </span>
                    <div className="row-body">
                      <div className="row-title">{l.name}</div>
                      <div className="row-sub">
                        {left ? `${left} item${left === 1 ? '' : 's'} left` : 'All done'}
                      </div>
                    </div>
                    <Plus size={18} className="row-chevron" />
                  </div>
                )
              })
            )}
          </div>
        </Sheet>
      )}
    </div>
  )
}
