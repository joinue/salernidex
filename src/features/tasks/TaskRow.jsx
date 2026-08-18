import { Check, Repeat, Flag, Clock } from 'react-feather'
import {
  deadlineLabel,
  dueLabel,
  dueState,
  isDeadline,
  priorityLabel,
  shortDate,
  startLabel,
} from '../../lib/tasks'
import { describeRecurrence } from '../../lib/recurrence'
import { assigneeLabel, normalizeAssignee } from '../../lib/household'
import SharedDot from '../../components/ui/SharedDot'
import AreaDot from '../../components/ui/AreaDot'

// Presentational task line: completion circle + title + meta chips (assignee,
// due, recurring). The checkbox stops propagation so the surrounding row can
// own tap (expand/open). `size="sm"` is used for subtasks.
// How many chips a row shows before the rest collapse into "+N".
const MAX_CHIPS = 4

export default function TaskRow({
  task,
  onToggle,
  size = 'md',
  progress,
  hideAssignee = false,
  breadcrumb = null,
  // The area row itself, resolved by the caller — not read off the task.
  // `tasks.area` still exists and is still written (0040 keeps it as a rollback
  // seat), but it's a snapshot of the name at write time, so a renamed area
  // would leave old rows showing the old word. The lookup belongs where the
  // areas are. Null while a lens is on: see AreaDot.
  area = null,
}) {
  const done = !!task.completed_at
  // A deadline ('by') answers a different question than a due date: not "when
  // is this on?" but "how much room is left?" — so it gets its own label.
  const by = isDeadline(task)
  const dl = by
    ? deadlineLabel(task.due_date, task.due_time)
    : dueLabel(task.due_date, task.due_time)
  const ds = dueState(task.due_date)
  const showAssignee = !hideAssignee && normalizeAssignee(task.assignee) !== 'anyone'
  const prio = task.priority || 0
  const starts = startLabel(task) // "Starts Jun 20" while deferred, else null
  const tags = task.tags || []

  // A task can carry eight facts at once (breadcrumb, priority, area, tags,
  // progress, assignee, deferred-start, due, recurrence). Rendering all of them
  // wrapped the row onto three lines and left the checkbox floating against a
  // wall of pills, with the due date — the one thing you scan for — last.
  //
  // So: a fixed budget, spent in order of what actually drives a decision.
  // Whatever doesn't fit collapses into a "+N" chip that names the rest on hover.
  // The survivors still render in their original left-to-right order.
  const chips = [
    breadcrumb && {
      rank: 6,
      title: `Part of ${breadcrumb}`,
      node: (
        <span className="chip" key="crumb" title={`Part of ${breadcrumb}`}>
          ↳ {breadcrumb}
        </span>
      ),
    },
    prio > 0 && {
      rank: 2,
      title: `${priorityLabel(prio)} priority`,
      node: (
        <span
          className={`chip prio prio-${prio}`}
          key="prio"
          title={`${priorityLabel(prio)} priority`}
        >
          <Flag size={11} />
        </span>
      ),
    },
    ...tags.map((t) => ({
      rank: 8,
      title: t,
      node: (
        <span className="chip tag" key={`tag-${t}`}>
          {t}
        </span>
      ),
    })),
    progress && {
      rank: 4,
      title: `${progress.done} of ${progress.total} done`,
      node: (
        <span className="chip" key="progress">
          {progress.done}/{progress.total}
        </span>
      ),
    },
    showAssignee && {
      rank: 3,
      title: assigneeLabel(task.assignee),
      node: (
        <span className="chip" key="assignee">
          {assigneeLabel(task.assignee)}
        </span>
      ),
    },
    starts && {
      rank: 5,
      title: `Starts ${starts}`,
      node: (
        <span className="chip starts" key="starts" title="Deferred until this date">
          <Clock size={11} /> {starts}
        </span>
      ),
    },
    dl && {
      rank: 1,
      title: by ? `Anytime before ${shortDate(task.due_date)}` : dl,
      node: (
        <span
          className={`chip due-${ds}`}
          key="due"
          title={by ? `Anytime before ${shortDate(task.due_date)}` : undefined}
        >
          {dl}
        </span>
      ),
    },
    task.recurrence && {
      rank: 9,
      title: describeRecurrence(task.recurrence),
      node: (
        <span className="chip" key="repeat" title={describeRecurrence(task.recurrence)}>
          <Repeat size={11} />
        </span>
      ),
    },
  ].filter(Boolean)

  const keep = new Set([...chips].sort((a, b) => a.rank - b.rank).slice(0, MAX_CHIPS))
  const shown = chips.filter((c) => keep.has(c))
  const hidden = chips.filter((c) => !keep.has(c))

  return (
    <>
      {/* No onToggle means the row isn't offering completion — the caller has
          put something else in the circle's place. Multi-select does exactly
          that: while selecting, the leading control is the selection tick, and
          two checkboxes on one row would be a coin flip every time. */}
      {onToggle && (
        <button
          className={`task-check ${size === 'sm' ? 'sm' : ''} ${done ? 'done' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onToggle(task)
          }}
          aria-label={done ? 'Mark not done' : 'Mark done'}
        >
          <Check size={size === 'sm' ? 12 : 15} />
        </button>
      )}
      <div className="row-body">
        <div className="row-titleline">
          {/* Out of the chip budget and onto the title line. As a chip it ranked
              7th of four slots, so on any row carrying a due date, an assignee
              and a breadcrumb — the rows you most want to place — it collapsed
              into "+N" and the area was invisible exactly when it mattered. A
              dot costs 8px and never competes for the budget. */}
          <AreaDot area={area} />
          <div className={`row-title ${done ? 'task-done' : ''} ${size === 'sm' ? 'sm' : ''}`}>
            {task.title}
          </div>
          <SharedDot item={task} />
        </div>
        {chips.length > 0 && (
          <div className="task-meta">
            {shown.map((c) => c.node)}
            {hidden.length > 0 && (
              <span className="chip chip-more" title={hidden.map((c) => c.title).join(' · ')}>
                +{hidden.length}
              </span>
            )}
          </div>
        )}
      </div>
    </>
  )
}
