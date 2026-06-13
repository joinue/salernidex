import { useMemo, useState } from 'react'
import { ChevronRight, Calendar, Repeat as RepeatIcon, User, X, RotateCcw } from 'react-feather'
import Modal from './Modal'
import Segmented from './Segmented'
import RecurrencePicker from './RecurrencePicker'
import AssigneePicker from './AssigneePicker'
import PrivacyField from './PrivacyField'
import { focusOnDesktop } from '../lib/constants'
import { normalizeAssignee, members, isSolo } from '../lib/household'
import { PRIVATE_LEVEL } from '../lib/privacy'
import { isoDateIn } from '../lib/tasks'
import { nextOccurrence } from '../lib/recurrence'
import { parseTaskInput, titleFrom } from '../lib/taskParse'

const TOKEN_ICON = { due: Calendar, repeat: RepeatIcon, who: User }

// Create or edit a single task. Flagging it a project unlocks the full-page
// detail view (subtasks + linked contacts); subtasks themselves are added from
// there, so this form stays focused on one item's fields.
//
// Progressive disclosure: most tasks are a title and maybe a date, so that's
// all the form shows. Who/Repeat/Visibility/Notes live behind "More options",
// auto-expanded when editing a task that already uses any of them.
export default function TaskForm({ task, onSave, onClose, defaultPrivacy = 'shared', areas = [] }) {
  const [form, setForm] = useState({
    title: task?.title || '',
    is_project: task?.is_project || false,
    assignee: normalizeAssignee(task?.assignee),
    area: task?.area || '',
    due_date: task?.due_date || '',
    recurrence: task?.recurrence || null,
    privacy_level: task?.privacy_level || (isSolo() ? PRIVATE_LEVEL : defaultPrivacy),
    notes: task?.notes || '',
  })
  const [more, setMore] = useState(
    !!task &&
      (normalizeAssignee(task.assignee) !== 'anyone' ||
        !!task.area ||
        !!task.recurrence ||
        (!isSolo() && task.privacy_level && task.privacy_level !== 'shared') ||
        !!task.notes),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // Token types the user dismissed from the smart-add preview ({ repeat: true }).
  const [ignored, setIgnored] = useState({})

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  // Natural-language read of the title — only for NEW tasks. On an edit we leave
  // the title alone, so an existing "Call mom Monday" isn't re-parsed and gutted.
  const parsed = useMemo(
    () => (task ? null : parseTaskInput(form.title, { today: isoDateIn(0), members: members() })),
    [task, form.title],
  )
  // Tokens still in effect (not dismissed), and the title rebuilt from them.
  const activeTokens = parsed ? parsed.tokens.filter((t) => !ignored[t.type]) : []
  const previewTitle = parsed ? titleFrom(form.title, activeTokens) : form.title
  const uses = (type) => parsed && activeTokens.some((t) => t.type === type)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // Parsed values fill blanks; anything set by hand — or dismissed — wins.
      const title = parsed ? previewTitle : form.title
      const recurrence = form.recurrence || (uses('repeat') ? parsed.recurrence : null)
      const manualAssignee = normalizeAssignee(form.assignee) !== 'anyone'
      const assignee = manualAssignee
        ? form.assignee
        : uses('who')
          ? parsed.assignee
          : form.assignee
      // A recurring task with no explicit start gets its first due date from
      // the rule, so it lands on the calendar immediately.
      let due = form.due_date || (uses('due') ? parsed.due_date : null)
      if (recurrence && !due) due = nextOccurrence(recurrence, isoDateIn(0), { inclusive: true })
      await onSave(
        { ...form, title, recurrence, assignee, area: form.area.trim() || null, due_date: due },
        task?.id,
      )
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal
      title={
        task
          ? form.is_project
            ? 'Edit project'
            : 'Edit task'
          : form.is_project
            ? 'New project'
            : 'New task'
      }
      onClose={onClose}
    >
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
          <input
            value={form.title}
            onChange={set('title')}
            required
            autoFocus={focusOnDesktop()}
            placeholder={form.is_project ? 'What are we tackling?' : 'Try "trash out every Monday"'}
          />
          {parsed && parsed.tokens.length > 0 && (
            <div className="nl-preview" aria-live="polite">
              <span className="nl-preview-title">{previewTitle || form.title}</span>
              <span className="nl-chips">
                {parsed.tokens.map((t) => {
                  const Icon = TOKEN_ICON[t.type]
                  const off = !!ignored[t.type]
                  return (
                    <button
                      type="button"
                      key={t.type}
                      className={`nl-chip nl-${t.type} ${off ? 'off' : ''}`}
                      onClick={() => setIgnored((g) => ({ ...g, [t.type]: !g[t.type] }))}
                      title={off ? 'Ignored — tap to apply' : 'Applied — tap to ignore'}
                    >
                      {Icon && <Icon size={11} />} {t.label}
                      {off ? (
                        <RotateCcw size={11} className="nl-chip-x" />
                      ) : (
                        <X size={12} className="nl-chip-x" />
                      )}
                    </button>
                  )
                })}
              </span>
            </div>
          )}
        </div>
        <div className="field">
          <label className="label">Due</label>
          <input type="date" value={form.due_date} onChange={set('due_date')} />
          <div className="chips" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="chip accent"
              onClick={() => setForm({ ...form, due_date: isoDateIn(0) })}
            >
              Today
            </button>
            <button
              type="button"
              className="chip accent"
              onClick={() => setForm({ ...form, due_date: isoDateIn(1) })}
            >
              Tomorrow
            </button>
            <button
              type="button"
              className="chip accent"
              onClick={() => setForm({ ...form, due_date: isoDateIn(7) })}
            >
              Next week
            </button>
            {form.due_date && (
              <button
                type="button"
                className="chip"
                onClick={() => setForm({ ...form, due_date: '' })}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {!more ? (
          <button type="button" className="form-more-btn" onClick={() => setMore(true)}>
            <ChevronRight size={15} />
            More options
            <span className="form-more-hint">
              {isSolo() ? 'area · repeat · notes' : 'who · area · repeat · visibility · notes'}
            </span>
          </button>
        ) : (
          <>
            {!isSolo() && (
              <div className="field">
                <label className="label">Who</label>
                <AssigneePicker
                  value={form.assignee}
                  onChange={(v) => setForm({ ...form, assignee: v })}
                />
              </div>
            )}
            <div className="field">
              <label className="label">
                Area <span className="muted">(optional)</span>
              </label>
              <input
                value={form.area}
                onChange={set('area')}
                list="task-areas"
                placeholder="e.g. Work, Personal, Home"
                autoComplete="off"
              />
              <datalist id="task-areas">
                {areas.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label className="label">Repeat</label>
              <RecurrencePicker
                value={form.recurrence}
                dueDate={form.due_date}
                onChange={(recurrence) => setForm({ ...form, recurrence })}
              />
            </div>
            <PrivacyField
              value={form.privacy_level}
              onChange={(v) => setForm({ ...form, privacy_level: v })}
            />
            <div className="field">
              <label className="label">
                Notes <span className="muted">(optional)</span>
              </label>
              <textarea value={form.notes} onChange={set('notes')} />
            </div>
          </>
        )}

        <button className="btn-primary" disabled={busy}>
          {busy ? (
            <span className="dots">Saving</span>
          ) : task ? (
            'Save changes'
          ) : form.is_project ? (
            'Add project'
          ) : (
            'Add task'
          )}
        </button>
      </form>
    </Modal>
  )
}
