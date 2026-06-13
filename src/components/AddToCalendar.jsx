import { useState } from 'react'
import { Calendar } from 'react-feather'
import ActionSheet from './ActionSheet'
import { downloadTaskIcs, googleCalendarUrl, outlookCalendarUrl } from '../lib/calendar'

// "Add to calendar" affordance for a task: a trigger button that opens an
// action sheet to pick a target. There's no way to push into a calendar without
// the user's auth, so each option hands off — Apple via a downloaded .ics, the
// others via a pre-filled web composer in a new tab. `trigger` lets the caller
// match the surrounding button style (text-btn in the inline expand, pill-btn on
// the project page).
export default function AddToCalendar({ task, trigger = 'text' }) {
  const [open, setOpen] = useState(false)

  const actions = [
    { label: 'Apple / device calendar', icon: Calendar, onClick: () => downloadTaskIcs(task) },
    { label: 'Google Calendar', icon: Calendar, onClick: () => window.open(googleCalendarUrl(task), '_blank', 'noopener') },
    { label: 'Outlook', icon: Calendar, onClick: () => window.open(outlookCalendarUrl(task), '_blank', 'noopener') },
  ]

  return (
    <>
      {trigger === 'pill' ? (
        <button className="pill-btn" onClick={() => setOpen(true)}>
          <Calendar size={15} /> Calendar
        </button>
      ) : (
        <button className="text-btn" onClick={() => setOpen(true)}>
          <Calendar size={14} /> Add to calendar
        </button>
      )}
      {open && <ActionSheet title="Add to calendar" actions={actions} onClose={() => setOpen(false)} />}
    </>
  )
}
