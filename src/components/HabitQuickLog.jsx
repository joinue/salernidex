import { Plus, Minus, Check } from 'react-feather'

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
    <div className="habit-step" onClick={(e) => e.stopPropagation()}>
      <button
        className="habit-step-btn"
        onClick={() => onLog(Math.max(0, value - 1))}
        aria-label="Decrease"
      >
        <Minus size={16} />
      </button>
      <span className="habit-step-val">{value}</span>
      <button
        className="habit-step-btn"
        style={{ '--c': habit.color }}
        onClick={() => onLog(value + 1)}
        aria-label="Increase"
      >
        <Plus size={16} />
      </button>
    </div>
  )
}
