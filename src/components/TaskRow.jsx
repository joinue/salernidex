import { Check, Repeat, Flag, Clock } from 'react-feather'
import { dueLabel, dueState, priorityLabel, startLabel } from '../lib/tasks'
import { describeRecurrence } from '../lib/recurrence'
import { assigneeLabel, normalizeAssignee } from '../lib/household'
import SharedDot from './SharedDot'

// Presentational task line: completion circle + title + meta chips (assignee,
// due, recurring). The checkbox stops propagation so the surrounding row can
// own tap (expand/open). `size="sm"` is used for subtasks.
export default function TaskRow({
  task,
  onToggle,
  size = 'md',
  progress,
  hideAssignee = false,
  breadcrumb = null,
}) {
  const done = !!task.completed_at
  const dl = dueLabel(task.due_date, task.due_time)
  const ds = dueState(task.due_date)
  const showAssignee = !hideAssignee && normalizeAssignee(task.assignee) !== 'anyone'
  const prio = task.priority || 0
  const starts = startLabel(task) // "Starts Jun 20" while deferred, else null
  const tags = task.tags || []

  return (
    <>
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
      <div className="row-body">
        <div className="row-titleline">
          <div className={`row-title ${done ? 'task-done' : ''} ${size === 'sm' ? 'sm' : ''}`}>
            {task.title}
          </div>
          <SharedDot item={task} />
        </div>
        {(showAssignee ||
          dl ||
          task.recurrence ||
          progress ||
          task.area ||
          prio > 0 ||
          starts ||
          breadcrumb ||
          tags.length > 0) && (
          <div className="task-meta">
            {breadcrumb && (
              <span className="chip" title={`Part of ${breadcrumb}`}>
                ↳ {breadcrumb}
              </span>
            )}
            {prio > 0 && (
              <span className={`chip prio prio-${prio}`} title={`${priorityLabel(prio)} priority`}>
                <Flag size={11} />
              </span>
            )}
            {task.area && <span className="chip area">{task.area}</span>}
            {tags.map((t) => (
              <span className="chip tag" key={t}>
                {t}
              </span>
            ))}
            {progress && (
              <span className="chip">
                {progress.done}/{progress.total}
              </span>
            )}
            {showAssignee && <span className="chip">{assigneeLabel(task.assignee)}</span>}
            {starts && (
              <span className="chip starts" title="Deferred — hidden from Today until then">
                <Clock size={11} /> {starts}
              </span>
            )}
            {dl && <span className={`chip due-${ds}`}>{dl}</span>}
            {task.recurrence ? (
              <span className="chip" title={describeRecurrence(task.recurrence)}>
                <Repeat size={11} />
              </span>
            ) : null}
          </div>
        )}
      </div>
    </>
  )
}
