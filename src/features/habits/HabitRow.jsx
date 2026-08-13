import { ChevronRight, Zap, Check } from 'react-feather'
import {
  isWeekly,
  isSuccess,
  isScheduled,
  currentStreak,
  weekProgress,
  rowSummary,
  valueOn,
} from '../../lib/habits'
import PressableRow from '../../components/ui/PressableRow'
import HabitQuickLog from './HabitQuickLog'

// The habit's colored badge — its icon, or the first letter as a fallback.
// Shared by the Habits list, the detail header, and the Today card so the
// fallback rule only lives in one place.
export function HabitDot({ habit, size, style }) {
  return (
    <span
      className={`habit-dot ${size ? size : ''} ${habit.icon ? 'emoji' : ''}`}
      style={{ background: habit.color || 'var(--accent)', ...style }}
      aria-hidden="true"
    >
      {habit.icon || habit.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

// One habit in a list: badge, name + streak, goal/cadence, and today's control.
//
// `onLog` decides the trailing control and is the read-only switch: own habits
// pass a logger and get the inline stepper/checkbox; a household member's
// shared habit passes null and gets a static done-today marker instead.
export default function HabitRow({ habit, map, today, todayISO, onOpen, onLog }) {
  const weekly = isWeekly(habit)
  const streak = currentStreak(habit, map, today)
  const wp = weekly ? weekProgress(habit, map, today) : null
  const readOnly = !onLog
  const doneToday = isSuccess(habit, valueOn(habit, todayISO, map))
  // Off-days dim only where logging is the point; a shared row is a status view.
  const offDay = !readOnly && !isScheduled(habit, today)

  return (
    <PressableRow
      className={`list-row ${offDay ? 'habit-offday' : ''}`}
      onClick={() => onOpen(habit.id)}
      label={habit.name}
    >
      <HabitDot habit={habit} />
      <div className="row-body">
        <div className="row-title">
          {habit.name}
          {habit.track_streak && streak > 0 && (
            <span className="habit-streak">
              <Zap size={12} /> {streak}
              {weekly ? 'w' : ''}
            </span>
          )}
        </div>
        <div className="row-sub">
          {weekly ? `${wp.count}/${wp.target} this week` : rowSummary(habit)}
        </div>
      </div>
      {readOnly ? (
        habit.polarity !== 'track' && (
          <span className={`shared-status ${doneToday ? 'done' : ''}`}>
            {doneToday ? <Check size={16} /> : '·'}
          </span>
        )
      ) : (
        <HabitQuickLog habit={habit} value={valueOn(habit, todayISO, map)} onLog={onLog} />
      )}
      <ChevronRight size={18} className="row-chevron" />
    </PressableRow>
  )
}
