import { useMemo, useState } from 'react'
import {
  ArrowRight,
  CheckCircle,
  Clock,
  Edit2,
  Flag,
  Plus,
  Repeat,
  RotateCcw,
  SkipForward,
  Trash2,
  X,
} from 'react-feather'
import { useConfirm } from '../../hooks/useConfirm'
import {
  canFlipDueKind,
  completionsFor,
  deadlineLabel,
  dueLabel,
  dueState,
  isDeadline,
  priorityLabel,
  startLabel,
} from '../../lib/tasks'
import { areaById } from '../../lib/areas'
import { describeRecurrence } from '../../lib/recurrence'
import { relativeTime } from '../../lib/contact'
import { assigneeLabel, normalizeAssignee } from '../../lib/household'
import { byOrder } from '../../lib/order'
import haptics from '../../lib/haptics'
import TaskRow from './TaskRow'
import AddToCalendar from '../../components/ui/AddToCalendar'
import Button from '../../components/ui/Button'
import NavBar from '../../components/ui/NavBar'
import SectionLabel from '../../components/ui/SectionLabel'
import EmptyState from '../../components/ui/EmptyState'
import IconButton from '../../components/ui/IconButton'
import ShareButton from '../../components/ui/ShareButton'
import NoteBacklinks from '../../components/ui/NoteBacklinks'

// One task, on its own page — the other half of the row's inline expander. The
// expander is for a glance without leaving the list; this is for settling in on
// one thing.
//
// What it adds is room. A task row abbreviates by design: the chip budget drops
// whatever doesn't fit into a "+N" (MAX_CHIPS in TaskRow), the note shows as one
// clipped line, the history stops after four. None of that is abbreviated here.
//
// Deliberately not ProjectDetail. A project is a container — linked people,
// scoped lists, a status and a date range — and a task is one thing to do.
// Wrapping it in project chrome would invent structure it doesn't have.
export default function TaskDetail({ data, taskId, onBack, onEdit, onOpenNote }) {
  const {
    tasks,
    notes = [],
    completions,
    addTask,
    updateTask,
    deleteTask,
    completeTask,
    skipTaskOccurrence,
  } = data
  const confirm = useConfirm()
  const task = tasks.find((t) => t.id === taskId)
  const [draftSub, setDraftSub] = useState('')

  // byOrder, not array order: the list's inline panel renders them however they
  // arrive, which is fine for three rows glanced at, and arbitrary for a screen
  // you came to in order to work through them.
  const subs = useMemo(
    () => tasks.filter((t) => t.parent_id === taskId && !t.is_heading).sort(byOrder),
    [tasks, taskId],
  )

  if (!task) {
    return (
      <div>
        <NavBar backLabel="Tasks" onBack={onBack} title="Not found" />
        <EmptyState>This task no longer exists.</EmptyState>
      </div>
    )
  }

  const done = !!task.completed_at
  const history = completionsFor(task.id, completions)
  const progress = subs.length
    ? { done: subs.filter((s) => s.completed_at).length, total: subs.length }
    : null
  // A deadline ('by') answers "how much room is left?", a due date answers
  // "when is this on?" — same split the row makes.
  const by = isDeadline(task)
  const dl = by
    ? deadlineLabel(task.due_date, task.due_time)
    : dueLabel(task.due_date, task.due_time)
  const ds = dueState(task.due_date)
  const starts = startLabel(task)
  const prio = task.priority || 0
  const tags = task.tags || []

  const toggle = (t) => {
    if (!t.completed_at) haptics.success()
    completeTask(t, !t.completed_at)
  }

  const addSub = () => {
    const title = draftSub.trim()
    if (!title) return
    addTask({
      title,
      parent_id: task.id,
      assignee: task.assignee,
      privacy_level: task.privacy_level,
    })
    setDraftSub('')
  }

  // Same rule the list follows: a childless task goes on the undo toast's word
  // alone, but silently taking eight children with it gets said out loud first.
  const remove = async () => {
    if (subs.length > 0) {
      const ok = await confirm({
        title: `Delete “${task.title}”?`,
        message: `Its ${subs.length} subtask${subs.length === 1 ? '' : 's'} go too. You can undo this from the toast.`,
        confirmLabel: 'Delete',
        danger: true,
      })
      if (!ok) return
    }
    deleteTask(task.id)
    onBack()
  }

  return (
    <div className="detail">
      <NavBar backLabel="Tasks" onBack={onBack} title={task.title}>
        <div className="profile-head">
          <h1 className="person-name">{task.title}</h1>
          {/* Every chip the row had to budget for, spelled out: the priority
              flag gets its word, the repeat rule its sentence. */}
          <div className="chips profile-chips">
            {done && <span className="chip">Done</span>}
            {progress && (
              <span className="chip">
                {progress.done}/{progress.total} done
              </span>
            )}
            {prio > 0 && (
              <span className={`chip prio prio-${prio}`}>
                <Flag size={11} /> {priorityLabel(prio)}
              </span>
            )}
            {normalizeAssignee(task.assignee) !== 'anyone' && (
              <span className="chip">{assigneeLabel(task.assignee)}</span>
            )}
            {starts && (
              <span className="chip starts">
                <Clock size={11} /> Starts {starts}
              </span>
            )}
            {dl && <span className={`chip due-${ds}`}>{dl}</span>}
            {/* Resolved from area_id, not the legacy tasks.area text — that
                column is a write-time snapshot and goes stale on a rename. */}
            {areaById(data.areas, task.area_id) && (
              <span className="chip area">{areaById(data.areas, task.area_id).name}</span>
            )}
            {tags.map((t) => (
              <span className="chip tag" key={t}>
                {t}
              </span>
            ))}
            {task.recurrence && (
              <span className="chip">
                <Repeat size={11} /> {describeRecurrence(task.recurrence)}
              </span>
            )}
          </div>
          <div className="profile-actions">
            <Button
              variant="pill"
              icon={done ? RotateCcw : CheckCircle}
              onClick={() => toggle(task)}
            >
              {done ? 'Reopen' : 'Mark done'}
            </Button>
            <Button variant="pill" icon={Edit2} onClick={() => onEdit(task)}>
              Edit
            </Button>
            <AddToCalendar task={task} trigger="pill" />
            <ShareButton type={task.is_project ? 'project' : 'task'} row={task} trigger="pill" />
            {/* The on/by flip, same one-tap retrofit the list offers. Named for
                the section the task lands in, since that's the visible outcome. */}
            {canFlipDueKind(task) && (
              <Button
                variant="pill"
                icon={ArrowRight}
                className="neutral"
                onClick={() => {
                  haptics.light()
                  updateTask(task.id, { due_kind: by ? 'on' : 'by' })
                }}
              >
                {by ? 'Move to Upcoming' : 'Move to Anytime'}
              </Button>
            )}
            {task.recurrence && (
              <Button variant="pill" icon={SkipForward} onClick={() => skipTaskOccurrence(task)}>
                Skip this one
              </Button>
            )}
          </div>
        </div>
      </NavBar>

      {task.notes && (
        <>
          <SectionLabel>Notes</SectionLabel>
          <div className="list">
            <p className="notes">{task.notes}</p>
          </div>
        </>
      )}

      <SectionLabel>
        Subtasks
        {progress && (
          <span className="section-count">
            {progress.done}/{progress.total}
          </span>
        )}
      </SectionLabel>
      <div className="list">
        {subs.map((s) => (
          <div className="list-row sub" key={s.id}>
            <TaskRow
              task={s}
              onToggle={toggle}
              size="sm"
              hideAssignee={normalizeAssignee(s.assignee) === normalizeAssignee(task.assignee)}
            />
            <AddToCalendar task={s} parent={task} trigger="icon" />
            <IconButton
              icon={X}
              variant="danger"
              label="Delete subtask"
              onClick={() => deleteTask(s.id)}
            />
          </div>
        ))}
        {/* The roomier composer, not the list's one-line .subtask-add: breaking
            a task into steps is most of why you'd open this page. */}
        <div className={`subtask-composer ${subs.length > 0 ? 'divided' : ''}`}>
          <input
            value={draftSub}
            onChange={(e) => setDraftSub(e.target.value)}
            placeholder={subs.length ? 'Add a subtask…' : 'Break it into steps…'}
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addSub()
              }
            }}
          />
          <div className="subtask-composer-actions">
            <Button variant="text" icon={Plus} onClick={addSub} disabled={!draftSub.trim()}>
              Add subtask
            </Button>
          </div>
        </div>
      </div>

      <NoteBacklinks notes={notes} type={['task', 'project']} id={taskId} onOpenNote={onOpenNote} />

      {history.length > 0 && (
        <>
          <SectionLabel>History</SectionLabel>
          <div className="list">
            {history.slice(0, 12).map((c) => (
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

      <div className="danger-zone">
        <Button variant="text" tone="danger" icon={Trash2} onClick={remove}>
          Delete task
        </Button>
      </div>
    </div>
  )
}
