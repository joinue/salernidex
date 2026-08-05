import { useState } from 'react'
import { Clock, BellOff, SkipForward, Minus, Plus } from 'react-feather'
import Sheet from './Sheet'
import haptics from '../../lib/haptics'

const DAY = 86400000

// "Remind me later" for a Today item: quick presets plus a custom day count, so
// you can postpone by exactly as many days as you want. onSnooze(untilISO|null)
// takes an ISO timestamp to re-surface on (or null = "don't remind"); onSkip
// (recurring tasks only) skips just this occurrence.
export default function SnoozeSheet({ item, onSnooze, onSkip, onClose }) {
  const [days, setDays] = useState(3)
  const untilIn = (d) => new Date(Date.now() + d * DAY).toISOString()
  // Run the action, then close (mirrors ActionSheet's pick-then-dismiss).
  const pick = (fn) => {
    onClose()
    fn()
  }
  const recurring = item.kind === 'task' && item.task?.recurrence

  return (
    <Sheet title="Remind me later" onClose={onClose}>
      {recurring && (
        <button
          className="sheet-item"
          onClick={() =>
            pick(() => {
              haptics.light()
              onSkip(item.task)
            })
          }
        >
          <SkipForward size={20} /> Skip this one
        </button>
      )}
      <button className="sheet-item" onClick={() => pick(() => onSnooze(untilIn(1)))}>
        <Clock size={20} /> Tomorrow
      </button>
      <button className="sheet-item" onClick={() => pick(() => onSnooze(untilIn(3)))}>
        <Clock size={20} /> In 3 days
      </button>
      <button className="sheet-item" onClick={() => pick(() => onSnooze(untilIn(7)))}>
        <Clock size={20} /> Next week
      </button>

      {/* Custom: postpone by an exact number of days. */}
      <div className="snooze-custom">
        <div className="snooze-stepper">
          <button
            type="button"
            onClick={() => setDays((d) => Math.max(1, d - 1))}
            aria-label="Fewer days"
            disabled={days <= 1}
          >
            <Minus size={16} />
          </button>
          <span className="snooze-days">
            {days} day{days === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={() => setDays((d) => Math.min(365, d + 1))}
            aria-label="More days"
            disabled={days >= 365}
          >
            <Plus size={16} />
          </button>
        </div>
        <button
          type="button"
          className="snooze-go"
          onClick={() => pick(() => onSnooze(untilIn(days)))}
        >
          Remind me
        </button>
      </div>

      <button className="sheet-item danger" onClick={() => pick(() => onSnooze(null))}>
        <BellOff size={20} /> Don’t remind me about this
      </button>
    </Sheet>
  )
}
