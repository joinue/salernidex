import { useState } from 'react'
import Modal from './Modal'
import Segmented from './Segmented'
import RecurrencePicker from './RecurrencePicker'
import AssigneePicker from './AssigneePicker'
import { PRIVACY_LABELS } from '../lib/constants'
import { normalizeAssignee } from '../lib/household'
import { isoDateIn } from '../lib/tasks'
import { nextOccurrence } from '../lib/recurrence'

// Create or edit a single task. Flagging it a project unlocks the full-page
// detail view (subtasks + linked contacts); subtasks themselves are added from
// there, so this form stays focused on one item's fields.
export default function TaskForm({ task, onSave, onClose }) {
  const [form, setForm] = useState({
    title: task?.title || '',
    is_project: task?.is_project || false,
    assignee: normalizeAssignee(task?.assignee),
    due_date: task?.due_date || '',
    recurrence: task?.recurrence || null,
    privacy_level: task?.privacy_level || 'shared',
    notes: task?.notes || '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // A recurring task with no explicit start gets its first due date from
      // the rule, so it lands on the calendar immediately.
      let due = form.due_date || null
      if (form.recurrence && !due) due = nextOccurrence(form.recurrence, isoDateIn(0), { inclusive: true })
      await onSave({ ...form, due_date: due }, task?.id)
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={task ? (form.is_project ? 'Edit project' : 'Edit task') : form.is_project ? 'New project' : 'New task'} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <p className="error-text">{error}</p>}
        <div className="field">
          <label className="label">Type</label>
          <Segmented
            options={[
              { value: 'task', label: 'Task' },
              { value: 'project', label: 'Project' },
            ]}
            value={form.is_project ? 'project' : 'task'}
            onChange={(v) => setForm({ ...form, is_project: v === 'project' })}
            size="sm"
          />
        </div>
        <div className="field">
          <label className="label">{form.is_project ? 'Project' : 'Task'}</label>
          <input value={form.title} onChange={set('title')} required autoFocus placeholder={form.is_project ? 'What are we tackling?' : 'What needs doing?'} />
        </div>
        <div className="field">
          <label className="label">Who</label>
          <AssigneePicker value={form.assignee} onChange={(v) => setForm({ ...form, assignee: v })} />
        </div>
        <div className="field">
          <label className="label">Due</label>
          <input type="date" value={form.due_date} onChange={set('due_date')} />
          <div className="chips" style={{ marginTop: 8 }}>
            <button type="button" className="chip accent" onClick={() => setForm({ ...form, due_date: isoDateIn(0) })}>Today</button>
            <button type="button" className="chip accent" onClick={() => setForm({ ...form, due_date: isoDateIn(1) })}>Tomorrow</button>
            <button type="button" className="chip accent" onClick={() => setForm({ ...form, due_date: isoDateIn(7) })}>Next week</button>
            {form.due_date && <button type="button" className="chip" onClick={() => setForm({ ...form, due_date: '' })}>Clear</button>}
          </div>
        </div>
        <div className="field">
          <label className="label">Repeat</label>
          <RecurrencePicker
            value={form.recurrence}
            dueDate={form.due_date}
            onChange={(recurrence) => setForm({ ...form, recurrence })}
          />
        </div>
        <div className="field">
          <label className="label">Visibility</label>
          <select value={form.privacy_level} onChange={set('privacy_level')}>
            {Object.entries(PRIVACY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Notes <span className="muted">(optional)</span></label>
          <textarea value={form.notes} onChange={set('notes')} />
        </div>
        <button className="btn-primary" disabled={busy}>
          {busy ? <span className="dots">Saving</span> : task ? 'Save changes' : form.is_project ? 'Add project' : 'Add task'}
        </button>
      </form>
    </Modal>
  )
}
