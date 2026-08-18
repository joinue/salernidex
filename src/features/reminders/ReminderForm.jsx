import { useMemo, useState } from 'react'
import { Calendar, UserPlus } from 'react-feather'
import Modal from '../../components/ui/Modal'
import Field from '../../components/ui/Field'
import Avatar from '../../components/ui/Avatar'
import RecurrencePicker from '../../components/ui/RecurrencePicker'
import AssigneePicker from '../../components/ui/AssigneePicker'
import PrivacyField from '../../components/ui/PrivacyField'
import AreaPicker from '../../components/ui/AreaPicker'
import { focusOnDesktop } from '../../lib/constants'
import { defaultAssignee, isSolo, normalizeAssignee } from '../../lib/household'
import { isoDateIn } from '../../lib/tasks'
import { newReminderFields, suggestsContactDate } from '../../lib/reminders'

// Create or edit a reminder. Shorter than TaskForm by design — there is no
// priority, no defer date and no subtasks, because none of those mean anything
// about a thing you aren't going to do. What's left is: what, when, which part
// of your life, and (in a household) whose.
//
// The area is the exception to that pruning, and it was wrongly pruned with the
// rest at first. Priority and defer dates are about DOING something, which a
// reminder isn't; an area is about which part of your life the thing belongs
// to, which a renewal date has as much as a chore does. It also carries the one
// setting that decides whether this reaches you at all — an area with
// show_on_today off keeps its reminders off Today, both badges and the push
// sweep. Without it RemindersView scoped and sectioned by an area no reminder
// could ever have, so every one of them lived permanently under "No area".
export default function ReminderForm({
  reminder,
  people = [],
  areas = [],
  onSave,
  onClose,
  onFileOnContact,
  defaultPrivacy = 'shared',
  defaultAreaId = null,
}) {
  const [form, setForm] = useState(() => ({
    ...newReminderFields({ privacy_level: defaultPrivacy, area_id: defaultAreaId }),
    ...(reminder
      ? {
          title: reminder.title || '',
          due_date: reminder.due_date || '',
          due_time: reminder.due_time ? reminder.due_time.slice(0, 5) : '',
          recurrence: reminder.recurrence || null,
          assignee: normalizeAssignee(reminder.assignee),
          privacy_level: reminder.privacy_level || defaultPrivacy,
          notes: reminder.notes || '',
          area_id: reminder.area_id || null,
        }
      : { assignee: defaultAssignee() }),
  }))
  const [busy, setBusy] = useState(false)
  const patch = (p) => setForm((f) => ({ ...f, ...p }))
  const set = (k) => (e) => patch({ [k]: e.target.value })

  // A date about a person can only live in one place without drifting, and that
  // place is the contact. So when the title reads like somebody's date, offer to
  // put it there instead of quietly storing a second copy.
  const suggestion = useMemo(() => suggestsContactDate(form.title, people), [form.title, people])

  const submit = (e) => {
    e.preventDefault()
    const title = form.title.trim()
    if (!title || busy) return
    setBusy(true)
    onSave({
      ...form,
      title,
      due_date: form.due_date || null,
      due_time: form.due_time || null,
      notes: form.notes.trim(),
      area_id: form.area_id || null,
      is_reminder: true,
    })
  }

  return (
    <Modal title={reminder ? 'Edit reminder' : 'New reminder'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Remind me about">
          {(id) => (
            <input
              id={id}
              value={form.title}
              onChange={set('title')}
              placeholder="Bins go out · Insurance renews · Mum's birthday"
              autoFocus={focusOnDesktop()}
              enterKeyHint="done"
            />
          )}
        </Field>

        {/* Sits under the title, where the thing it's reacting to is. Not a
            warning and not a block — you can ignore it and save the reminder. */}
        {suggestion && onFileOnContact && (
          <button
            type="button"
            className="reminder-suggestion"
            onClick={() => onFileOnContact(suggestion, form)}
          >
            <Avatar
              name={suggestion.person.name}
              src={suggestion.person.avatar_url}
              size={30}
              kind="person"
            />
            <span className="reminder-suggestion-text">
              Save this on {suggestion.person.name.split(/\s+/)[0]} instead?
              <span className="muted">
                {suggestion.kind === 'birthday'
                  ? ' A birthday on the contact repeats every year on its own.'
                  : ' Key dates on a contact show up here automatically.'}
              </span>
            </span>
            <UserPlus size={16} aria-hidden="true" />
          </button>
        )}

        <Field label="When">
          {(id) => (
            <div className="reminder-when">
              <input id={id} type="date" value={form.due_date} onChange={set('due_date')} />
              <input
                type="time"
                value={form.due_time}
                onChange={set('due_time')}
                aria-label="Time of day"
              />
            </div>
          )}
        </Field>
        <div className="chips reminder-quick-dates">
          {[
            ['Today', 0],
            ['Tomorrow', 1],
            ['Next week', 7],
          ].map(([label, days]) => (
            <button
              key={label}
              type="button"
              className="text-btn"
              onClick={() => patch({ due_date: isoDateIn(days) })}
            >
              <Calendar size={12} aria-hidden="true" /> {label}
            </button>
          ))}
          {form.due_date && (
            <button type="button" className="text-btn" onClick={() => patch({ due_date: '' })}>
              Clear
            </button>
          )}
        </div>

        <Field label="Repeat" hint="A yearly one is how an anniversary keeps coming back.">
          <RecurrencePicker
            value={form.recurrence}
            onChange={(recurrence) => patch({ recurrence })}
            dueDate={form.due_date}
          />
        </Field>

        {!isSolo() && (
          <Field label="Who" hint="Reminders can belong to someone, or to the household.">
            <AssigneePicker value={form.assignee} onChange={(v) => patch({ assignee: v })} />
          </Field>
        )}

        {/* Above Notes and below Who, matching TaskForm's order. Hidden until
            an area exists, by AreaPicker's own rule, so a household that never
            made one still gets the short form this screen was written to be. */}
        <AreaPicker areas={areas} value={form.area_id} onChange={(area_id) => patch({ area_id })} />

        <Field label="Notes">
          {(id) => (
            <textarea
              id={id}
              value={form.notes}
              onChange={set('notes')}
              rows={2}
              placeholder="Anything you'll want at hand, like a policy number or a size."
            />
          )}
        </Field>

        <PrivacyField
          value={form.privacy_level}
          onChange={(privacy_level) => patch({ privacy_level })}
        />

        <button className="btn-primary" disabled={busy || !form.title.trim()}>
          {busy ? <span className="dots">Saving</span> : reminder ? 'Save changes' : 'Add reminder'}
        </button>
      </form>
    </Modal>
  )
}
