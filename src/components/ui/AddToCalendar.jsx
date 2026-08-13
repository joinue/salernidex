import { useMemo, useState } from 'react'
import { Calendar } from 'react-feather'
import ActionSheet from './ActionSheet'
import IconButton from './IconButton'
import { downloadTaskIcs, googleCalendarUrl, outlookCalendarUrl } from '../../lib/calendar'

// "Add to calendar" affordance for a task, subtask, or project: a trigger button
// that opens an action sheet to pick a target. There's no way to push into a
// calendar without the user's auth, so each option hands off — Apple via a
// downloaded .ics, the others via a pre-filled web composer in a new tab.
//
// `trigger` lets the caller match the surrounding button style: text-btn in the
// inline expand, pill-btn on the project page, and an icon on subtask rows,
// which are tight and already carry their delete control.
//
// `parent` is the project or task a subtask hangs off. It rides along in the
// event's description so the entry still makes sense on its own in Calendar.
export default function AddToCalendar({ task, parent, trigger = 'text' }) {
  const [open, setOpen] = useState(false)

  const event = useMemo(
    () => (parent ? { ...task, parent_title: parent.title } : task),
    [task, parent],
  )

  const actions = [
    { label: 'Apple / device calendar', icon: Calendar, onClick: () => downloadTaskIcs(event) },
    {
      label: 'Google Calendar',
      icon: Calendar,
      onClick: () => window.open(googleCalendarUrl(event), '_blank', 'noopener'),
    },
    {
      label: 'Outlook',
      icon: Calendar,
      onClick: () => window.open(outlookCalendarUrl(event), '_blank', 'noopener'),
    },
  ]

  return (
    <>
      {trigger === 'icon' ? (
        <IconButton
          icon={Calendar}
          label={`Add ${task.title} to calendar`}
          onClick={() => setOpen(true)}
        />
      ) : trigger === 'pill' ? (
        <button className="pill-btn" onClick={() => setOpen(true)}>
          <Calendar size={15} /> Calendar
        </button>
      ) : (
        <button className="text-btn" onClick={() => setOpen(true)}>
          <Calendar size={14} /> Add to calendar
        </button>
      )}
      {open && (
        <ActionSheet title="Add to calendar" actions={actions} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
