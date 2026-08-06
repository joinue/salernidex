import { useMemo, useState } from 'react'
import {
  ChevronRight,
  Calendar,
  Clock,
  Repeat as RepeatIcon,
  User,
  X,
  RotateCcw,
  Folder,
} from 'react-feather'
import Modal from '../../components/ui/Modal'
import Field from '../../components/ui/Field'
import Segmented from '../../components/ui/Segmented'
import RecurrencePicker from '../../components/ui/RecurrencePicker'
import AssigneePicker from '../../components/ui/AssigneePicker'
import PrivacyField from '../../components/ui/PrivacyField'
import TagInput from '../../components/ui/TagInput'
import { focusOnDesktop } from '../../lib/constants'
import { normalizeAssignee, defaultAssignee, members, isSolo } from '../../lib/household'
import { PRIVATE_LEVEL } from '../../lib/privacy'
import { isoDateIn, PRIORITY_OPTIONS } from '../../lib/tasks'
import { firstOccurrence } from '../../lib/recurrence'
import { parseTaskInput, titleFrom } from '../../lib/taskParse'

const TOKEN_ICON = { due: Calendar, time: Clock, repeat: RepeatIcon, who: User }

// Create or edit a single task. Flagging it a project unlocks the full-page
// detail view (subtasks + linked contacts); subtasks themselves are added from
// there, so this form stays focused on one item's fields.
//
// Field order is the order you answer in: WHAT, then WHEN, then WHO. Everything
// else (priority, area, tags, defer, repeat, visibility, notes) is one task in
// twenty, so it waits behind "More options" — auto-expanded when editing a task
// that already uses any of it. Task-vs-project is a rare, structural choice, so
// it sits at the foot of the sheet rather than in front of the title.
export default function TaskForm({
  task,
  onSave,
  onClose,
  onMakeProject,
  defaultPrivacy = 'shared',
  areas = [],
  tagSuggestions = [],
}) {
  const [form, setForm] = useState({
    title: task?.title || '',
    is_project: task?.is_project || false,
    // A new task is yours (see household.defaultAssignee); an edit keeps whoever
    // it already belongs to.
    assignee: task ? normalizeAssignee(task.assignee) : defaultAssignee(),
    area: task?.area || '',
    tags: task?.tags || [],
    due_date: task?.due_date || '',
    start_date: task?.start_date || '',
    due_time: task?.due_time ? task.due_time.slice(0, 5) : '',
    priority: task?.priority ?? 0,
    recurrence: task?.recurrence || null,
    privacy_level: task?.privacy_level || (isSolo() ? PRIVATE_LEVEL : defaultPrivacy),
    notes: task?.notes || '',
  })
  const [more, setMore] = useState(
    !!task &&
      (!!task.area ||
        task.tags?.length > 0 ||
        !!task.start_date ||
        !!task.recurrence ||
        (task.priority ?? 0) > 0 ||
        (!isSolo() && task.privacy_level && task.privacy_level !== 'shared') ||
        !!task.notes),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // Token types the user dismissed from the smart-add preview ({ repeat: true }).
  const [ignored, setIgnored] = useState({})
  // Whether the Who picker has been touched. Until it is, a "for <name>" typed
  // into the title still gets to steer the assignee — with the default now
  // being you rather than "Anyone", the old "is it still Anyone?" test would
  // have read every new task as an explicit pick and silently eaten the token.
  const [assigneeTouched, setAssigneeTouched] = useState(false)

  const set = (key) => (e) => {
    const value = e.target.value
    setForm((f) => ({ ...f, [key]: value }))
  }
  const patch = (fields) => setForm((f) => ({ ...f, ...fields }))

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

  // Who the task actually lands on: an explicit pick wins, otherwise a live
  // "for <name>" in the title, otherwise the default. The picker renders this
  // same value, so typing "for Rita" visibly moves the selection.
  const assignee = assigneeTouched ? form.assignee : uses('who') ? parsed.assignee : form.assignee

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // Parsed values fill blanks; anything set by hand — or dismissed — wins.
      const title = parsed ? previewTitle : form.title
      const recurrence = form.recurrence || (uses('repeat') ? parsed.recurrence : null)
      // A recurring task with no explicit start gets its first due date from
      // the rule, so it lands on the calendar immediately. firstOccurrence
      // handles both clocks — an after-completion rule starts today, since it
      // has no grid to look ahead on.
      let due = form.due_date || (uses('due') ? parsed.due_date : null)
      if (recurrence && !due) due = firstOccurrence(recurrence, isoDateIn(0))
      // A time of day only means something with a date; a typed "at 3pm" with no
      // date pins to today (matching Apple, which won't hold a time without one).
      const due_time = form.due_time || (uses('time') ? parsed.due_time : null)
      if (due_time && !due) due = isoDateIn(0)
      await onSave(
        {
          ...form,
          title,
          recurrence,
          assignee,
          area: form.area.trim() || null,
          tags: form.tags,
          due_date: due,
          // A defer date only makes sense up to the due date; keep it as typed
          // otherwise (null when blank).
          start_date: form.start_date || null,
          due_time: due ? due_time || null : null,
          priority: form.priority || 0,
        },
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

        <Field label={form.is_project ? 'Project' : 'Task'}>
          {(id) => (
            <>
              <input
                id={id}
                value={form.title}
                onChange={set('title')}
                required
                autoFocus={focusOnDesktop()}
                enterKeyHint="done"
                placeholder={
                  form.is_project ? 'What are we tackling?' : 'Try "trash out every Monday"'
                }
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
            </>
          )}
        </Field>

        {/* Due leads with the three dates that cover most tasks — one tap, no
            picker — and keeps the native inputs underneath for everything else. */}
        <Field label="Due">
          {(id) => (
            <>
              <div className="chips due-chips">
                {[
                  { label: 'Today', days: 0 },
                  { label: 'Tomorrow', days: 1 },
                  { label: 'Next week', days: 7 },
                ].map(({ label, days }) => {
                  const value = isoDateIn(days)
                  const on = form.due_date === value
                  return (
                    <button
                      type="button"
                      key={label}
                      className={`chip accent tap-target ${on ? 'on' : ''}`}
                      aria-pressed={on}
                      onClick={() => patch({ due_date: value })}
                    >
                      {label}
                    </button>
                  )
                })}
                {form.due_date && (
                  <button
                    type="button"
                    className="chip"
                    onClick={() => patch({ due_date: '', due_time: '' })}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="due-row">
                <input id={id} type="date" value={form.due_date} onChange={set('due_date')} />
                {form.due_date && (
                  <input
                    type="time"
                    value={form.due_time}
                    onChange={set('due_time')}
                    aria-label="Time of day (optional)"
                  />
                )}
              </div>
            </>
          )}
        </Field>

        {/* Who is up front now that a new task defaults to you — handing it to
            the household has to be as cheap as keeping it. */}
        {!isSolo() && (
          <Field label="Who">
            <AssigneePicker
              value={assignee}
              onChange={(v) => {
                setAssigneeTouched(true)
                patch({ assignee: v })
              }}
            />
          </Field>
        )}

        {!more ? (
          <button type="button" className="form-more-btn" onClick={() => setMore(true)}>
            <ChevronRight size={15} />
            More options
            <span className="form-more-hint">priority · area · tags · starts · repeat · …</span>
          </button>
        ) : (
          <>
            <Field label="Priority">
              <Segmented
                options={PRIORITY_OPTIONS}
                value={form.priority}
                onChange={(v) => patch({ priority: v })}
                size="sm"
              />
            </Field>
            <Field label="Area" hint="One category per task — Work, Home, Personal.">
              {(id) => (
                <>
                  <input
                    id={id}
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
                </>
              )}
            </Field>
            <Field
              label={
                <>
                  Tags <span className="muted">(optional)</span>
                </>
              }
            >
              <TagInput
                tags={form.tags}
                onChange={(tags) => patch({ tags })}
                suggestions={tagSuggestions}
              />
            </Field>
            <Field
              label={
                <>
                  Starts <span className="muted">(defer until)</span>
                </>
              }
            >
              {(id) => (
                <>
                  <input
                    id={id}
                    type="date"
                    value={form.start_date}
                    max={form.due_date || undefined}
                    onChange={set('start_date')}
                  />
                  {form.start_date && (
                    <div className="chips" style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className="chip"
                        onClick={() => patch({ start_date: '' })}
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </>
              )}
            </Field>
            <Field label="Repeat">
              <RecurrencePicker
                value={form.recurrence}
                dueDate={form.due_date}
                onChange={(recurrence) => patch({ recurrence })}
              />
            </Field>
            <PrivacyField
              value={form.privacy_level}
              onChange={(v) => patch({ privacy_level: v })}
            />
            <Field
              label={
                <>
                  Notes <span className="muted">(optional)</span>
                </>
              }
            >
              {(id) => <textarea id={id} value={form.notes} onChange={set('notes')} />}
            </Field>
          </>
        )}

        {/* Task ↔ project. A structural choice you make once, so it sits at the
            foot rather than in front of the title. Starting a NEW project hands
            off to the template picker so the experience matches "New project"
            everywhere else; editing keeps the inline toggle so a task can still
            be promoted (or a project demoted) in place. */}
        {task ? (
          <Field label="Type">
            <Segmented
              options={[
                { value: 'task', label: 'Task' },
                { value: 'project', label: 'Project' },
              ]}
              value={form.is_project ? 'project' : 'task'}
              onChange={(v) => patch({ is_project: v === 'project' })}
              size="sm"
            />
          </Field>
        ) : (
          onMakeProject && (
            <button
              type="button"
              className="text-btn quiet form-footer-btn"
              onClick={() => onMakeProject(form.title.trim())}
            >
              <Folder size={14} /> Make this a project instead
            </button>
          )
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
