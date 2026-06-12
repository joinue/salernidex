import { nextOccurrence } from './recurrence'

// Date + bucketing helpers for tasks. All dates are 'YYYY-MM-DD' strings,
// compared in local time so "today" means the user's today.

function parseLocal(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function todayLocal() {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

export function isoDateIn(days) {
  const d = new Date(Date.now() + days * 86400000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function daysUntilDue(dateStr) {
  if (!dateStr) return null
  return Math.round((parseLocal(dateStr) - todayLocal()) / 86400000)
}

export function dueLabel(dateStr) {
  const d = daysUntilDue(dateStr)
  if (d === null) return null
  if (d < 0) return `${-d}d overdue`
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  if (d < 7) return `in ${d}d`
  return parseLocal(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'none'
export function dueState(dateStr) {
  const d = daysUntilDue(dateStr)
  if (d === null) return 'none'
  if (d < 0) return 'overdue'
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  return 'upcoming'
}

// Section bucket for an open top-level task.
export function taskBucket(task) {
  const s = dueState(task.due_date)
  if (s === 'overdue') return 'overdue'
  if (s === 'today') return 'today'
  if (s === 'none') return 'someday'
  return 'upcoming'
}

// Completion history for a task, newest first.
export function completionsFor(taskId, completions = []) {
  return completions
    .filter((c) => c.task_id === taskId)
    .sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1))
}

export function lastCompletion(taskId, completions = []) {
  return completionsFor(taskId, completions)[0] || null
}

// Subtask progress for a project, or null if it has no children.
export function projectProgress(taskId, all) {
  const children = all.filter((t) => t.parent_id === taskId)
  if (!children.length) return null
  return { done: children.filter((t) => t.completed_at).length, total: children.length }
}

// A task counts as a project if it's explicitly flagged or has any subtasks —
// projects open the full-page ProjectDetail instead of expanding inline.
export function isProject(task, all) {
  return !!task.is_project || all.some((t) => t.parent_id === task.id)
}

// On completing a recurring chore, roll its due date forward to the next
// scheduled occurrence (calendar-anchored) instead of closing it. One-offs just
// get a completed timestamp.
export function completionFields(task, done) {
  if (done && task.recurrence) {
    const next = nextOccurrence(task.recurrence, isoDateIn(0))
    if (next) return { due_date: next, completed_at: null }
  }
  return { completed_at: done ? new Date().toISOString() : null }
}
