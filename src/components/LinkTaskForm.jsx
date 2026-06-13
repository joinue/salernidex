import { useMemo, useState } from 'react'
import Modal from './Modal'
import Segmented from './Segmented'
import DatePicker from './DatePicker'
import { byDue } from '../lib/tasks'
import { focusOnDesktop } from '../lib/constants'

// The reverse of LinkEntityForm: attach a task/project to a person, org, or
// group from that entity's page. Either spin up a new task (already linked) or
// pick an existing open top-level task that isn't linked here yet.
export default function LinkTaskForm({ entityType, entityId, entityName, tasks, existingTaskIds, addTask, addTaskLink, onClose }) {
  const [mode, setMode] = useState('new') // 'new' | 'existing'
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [taskId, setTaskId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Linkable = open, top-level, non-heading tasks not already linked here.
  const linkable = useMemo(
    () =>
      tasks
        .filter((t) => !t.parent_id && !t.is_heading && !t.completed_at && !existingTaskIds.has(t.id))
        .sort(byDue),
    [tasks, existingTaskIds]
  )

  const link = (id) => addTaskLink({ task_id: id, entity_type: entityType, entity_id: entityId })

  const submit = (e) => {
    e.preventDefault()
    setError(null)
    if (mode === 'new') {
      const t = title.trim()
      if (!t) return setError('Give the task a name.')
      setBusy(true)
      try {
        link(addTask({ title: t, due_date: due || null }))
        onClose()
      } catch (err) {
        setError(err.message)
        setBusy(false)
      }
    } else {
      if (!taskId) return setError('Pick a task to link.')
      setBusy(true)
      try {
        link(taskId)
        onClose()
      } catch (err) {
        setError(err.message)
        setBusy(false)
      }
    }
  }

  return (
    <Modal title={`Link a task to ${entityName}`} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <p className="error-text">{error}</p>}
        <div className="field">
          <Segmented
            options={[
              { value: 'new', label: 'New task' },
              { value: 'existing', label: 'Existing' },
            ]}
            value={mode}
            onChange={setMode}
            size="sm"
          />
        </div>

        {mode === 'new' ? (
          <>
            <div className="field">
              <label className="label">Task</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`e.g. Follow up with ${entityName}`}
                autoFocus={focusOnDesktop()}
              />
            </div>
            <div className="field">
              <label className="label">Due <span className="muted">(optional)</span></label>
              <DatePicker value={due} onChange={setDue} />
            </div>
          </>
        ) : (
          <div className="field">
            <label className="label">Task</label>
            <select value={taskId} onChange={(e) => setTaskId(e.target.value)} required>
              <option value="">{linkable.length ? 'Select…' : 'No unlinked open tasks'}</option>
              {linkable.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>
        )}

        <button className="btn-primary" disabled={busy || (mode === 'existing' && !linkable.length)}>
          {busy ? <span className="dots">Saving</span> : 'Link task'}
        </button>
      </form>
    </Modal>
  )
}
