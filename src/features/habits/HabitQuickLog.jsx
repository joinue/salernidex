import { Check } from 'react-feather'
import Stepper from '../../components/ui/Stepper'

// Inline logger for one habit on one day: a check for yes/no habits, a stepper
// for counts. Stops click propagation so it works inside tappable rows. Shared
// by the Habits list, the backfill sheet, and the Today card.
export default function HabitQuickLog({ habit, value, onLog }) {
  if (habit.measure === 'binary' && habit.polarity !== 'track') {
    const done = value >= 1
    return (
      <button
        className={`habit-check ${done ? 'on' : ''}`}
        style={{ '--c': habit.color }}
        onClick={(e) => {
          e.stopPropagation()
          onLog(done ? 0 : 1)
        }}
        aria-pressed={done}
        aria-label={done ? 'Mark not done' : 'Mark done'}
      >
        {done && <Check size={18} />}
      </button>
    )
  }
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Stepper value={value} onChange={onLog} min={0} label={habit.name} />
    </div>
  )
}
