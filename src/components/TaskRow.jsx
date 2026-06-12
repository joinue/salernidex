import { Check, Repeat } from 'react-feather'
import { dueLabel, dueState } from '../lib/tasks'
import { describeRecurrence } from '../lib/recurrence'
import { assigneeLabel, normalizeAssignee } from '../lib/household'

// Presentational task line: completion circle + title + meta chips (assignee,
// due, recurring). The checkbox stops propagation so the surrounding row can
// own tap (expand/open). `size="sm"` is used for subtasks.
export default function TaskRow({ task, onToggle, size = 'md', progress }) {
  const done = !!task.completed_at
  const dl = dueLabel(task.due_date)
  const ds = dueState(task.due_date)
  const showAssignee = normalizeAssignee(task.assignee) !== 'anyone'

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
        <div className={`row-title ${done ? 'task-done' : ''} ${size === 'sm' ? 'sm' : ''}`}>{task.title}</div>
        {(showAssignee || dl || task.recurrence || progress) && (
          <div className="task-meta">
            {progress && <span className="chip">{progress.done}/{progress.total}</span>}
            {showAssignee && <span className="chip">{assigneeLabel(task.assignee)}</span>}
            {dl && <span className={`chip due-${ds}`}>{dl}</span>}
            {task.recurrence ? (
              <span className="chip" title={describeRecurrence(task.recurrence)}><Repeat size={11} /></span>
            ) : null}
          </div>
        )}
      </div>
    </>
  )
}
