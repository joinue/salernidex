import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Plus, CheckSquare } from 'react-feather'
import { taskBucket, completionsFor, isProject } from '../lib/tasks'
import { relativeTime } from '../lib/contact'
import { members, assigneeLabel, normalizeAssignee } from '../lib/household'
import { byOrder, moveUpdates } from '../lib/order'
import haptics from '../lib/haptics'
import PageHeader from './PageHeader'
import Segmented from './Segmented'
import TaskRow from './TaskRow'
import ReorderableList from './ReorderableList'

const BUCKETS = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'someday', label: 'Someday' },
]

export default function TasksView({ data, expandId, onAdd, onEdit, onOpenProject, onSearch }) {
  const { tasks, completions, addTask, deleteTask, completeTask, reorderTasks } = data
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(expandId || null)
  const [showDone, setShowDone] = useState(false)
  const [draftSub, setDraftSub] = useState('')

  // Deep link from Quick Find (#/tasks/<id>): land with that task expanded.
  useEffect(() => {
    if (expandId) setExpanded(expandId)
  }, [expandId])

  const filterOptions = [
    { value: 'all', label: 'Everyone' },
    ...members().map((m) => ({ value: m.id, label: m.name })),
  ]

  const matches = (t) => {
    if (filter === 'all') return true
    const a = normalizeAssignee(t.assignee)
    return a === filter || a === 'anyone'
  }

  const topOpen = useMemo(
    () => tasks.filter((t) => !t.parent_id && !t.completed_at && matches(t)).sort(byOrder),
    [tasks, filter]
  )
  const done = useMemo(
    () => tasks.filter((t) => !t.parent_id && t.completed_at && matches(t)).sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1)),
    [tasks, filter]
  )
  const grouped = useMemo(() => {
    const g = { overdue: [], today: [], upcoming: [], someday: [] }
    for (const t of topOpen) g[taskBucket(t)].push(t)
    return g
  }, [topOpen])

  const subtasks = (id) => tasks.filter((t) => t.parent_id === id && !t.is_heading)

  const toggle = (t) => {
    if (!t.completed_at) haptics.success()
    completeTask(t, !t.completed_at)
  }

  const addSub = (parent) => {
    const title = draftSub.trim()
    if (!title) return
    addTask({ title, parent_id: parent.id, assignee: parent.assignee, privacy_level: parent.privacy_level })
    setDraftSub('')
  }

  const renderTask = (task) => {
    const subs = subtasks(task.id)
    const progress = subs.length ? { done: subs.filter((s) => s.completed_at).length, total: subs.length } : null

    // Projects get the full-page detail view; plain tasks expand inline.
    if (isProject(task, tasks)) {
      return (
        <div className="list-row" key={task.id} onClick={() => onOpenProject(task.id)}>
          <TaskRow task={task} onToggle={toggle} progress={progress} />
          <ChevronRight size={18} className="row-chevron" />
        </div>
      )
    }

    const isOpen = expanded === task.id
    const history = completionsFor(task.id, completions)
    return (
      <div key={task.id}>
        <div className="list-row" onClick={() => setExpanded(isOpen ? null : task.id)}>
          <TaskRow task={task} onToggle={toggle} progress={progress} />
          <ChevronRight
            size={18}
            className="row-chevron"
            style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 200ms ease' }}
          />
        </div>
        {isOpen && (
          <div className="task-expand">
            {task.notes && <p className="muted" style={{ fontSize: 14, marginBottom: 10 }}>{task.notes}</p>}
            {subs.map((s) => (
              <div className="list-row sub" key={s.id}>
                <TaskRow task={s} onToggle={toggle} size="sm" />
                <button className="icon-btn danger" onClick={() => deleteTask(s.id)} aria-label="Delete subtask">
                  <Plus size={15} style={{ transform: 'rotate(45deg)' }} />
                </button>
              </div>
            ))}
            <div className="subtask-add">
              <input
                value={expanded === task.id ? draftSub : ''}
                onChange={(e) => setDraftSub(e.target.value)}
                placeholder="Add a subtask…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addSub(task)
                  }
                }}
              />
              <button className="text-btn" onClick={() => addSub(task)}>Add</button>
            </div>
            {history.length > 0 && (
              <div className="task-history">
                <div className="task-history-head">
                  Last done {relativeTime(history[0].completed_at)}
                  {history[0].completed_by ? ` · ${assigneeLabel(history[0].completed_by)}` : ''}
                </div>
                {history.slice(1, 4).map((c) => (
                  <div className="task-history-row" key={c.id}>
                    {relativeTime(c.completed_at)}
                    {c.completed_by ? ` · ${assigneeLabel(c.completed_by)}` : ''}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
              <button className="text-btn" onClick={() => onEdit(task)}>Edit</button>
              <button className="text-btn danger" onClick={() => deleteTask(task.id)}>Delete</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Tasks" action={onAdd} actionLabel="New task" onSearch={onSearch} />

      <Segmented options={filterOptions} value={filter} onChange={setFilter} />

      {topOpen.length === 0 ? (
        <div className="empty">
          <CheckSquare size={28} className="empty-icon" />
          {filter === 'all' ? 'Nothing on the list. Add a task.' : 'Nothing assigned here.'}
          <button className="text-btn" onClick={onAdd}><Plus size={14} /> New task</button>
        </div>
      ) : (
        BUCKETS.map((b) =>
          grouped[b.id].length ? (
            <div key={b.id}>
              <div className="section-label">{b.label}</div>
              <ReorderableList
                items={grouped[b.id]}
                onMove={(from, to) => reorderTasks(moveUpdates(grouped[b.id], from, to))}
                renderItem={renderTask}
              />
            </div>
          ) : null
        )
      )}

      {done.length > 0 && (
        <>
          <button className="section-label section-toggle" onClick={() => setShowDone((v) => !v)}>
            Done · {done.length} <ChevronRight size={13} style={{ transform: showDone ? 'rotate(90deg)' : 'none' }} />
          </button>
          {showDone && <div className="list">{done.map(renderTask)}</div>}
        </>
      )}
    </div>
  )
}
