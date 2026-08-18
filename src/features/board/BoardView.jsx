import { useMemo } from 'react'
import { X } from 'react-feather'
import { buildBoard } from '../../lib/board'
import { toISO } from '../../lib/mealPlan'
import { dueLabel, taskBucket } from '../../lib/tasks'
import { reminderWhen } from '../../lib/reminders'
import { entryMap, habitsScheduledToday } from '../../lib/habits'
import { assigneeLabel } from '../../lib/household'
import { useNow } from '../../hooks/useNow'
import { useWakeLock } from '../../hooks/useWakeLock'
import Avatar from '../../components/ui/Avatar'
import { HabitDot } from '../habits/HabitRow'

// The household board — the app with its chrome taken off, for a screen that
// lives in the kitchen rather than in a pocket. Reached at #/board.
//
// It is deliberately READ-ONLY. Nothing here checks anything off, and that's a
// decision, not an omission: an always-on screen at counter height gets leaned
// on, wiped, and walked past by people who aren't signed in. A display that
// silently completes a chore when a sleeve brushes it is worse than one you
// have to pick up your phone to act on.
//
// What it shows and, crucially, what it hides is settled in lib/board.js —
// household scope, nothing private.

// A minute, not Today's five: the clock is on screen, so drift is visible here
// in a way it never is on a phone you glance at.
const TICK_MS = 60 * 1000

// Cards are a summary, not the list. Past this many rows a card stops being
// glanceable and starts pushing its neighbours off a 768px-tall tablet.
const CARD_ROWS = 8

const timeOfDay = (h) => (h < 5 ? 'Evening' : h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening')

// Rows plus a "+N more" tail, so no card can grow without bound.
function capped(items, render, max = CARD_ROWS) {
  const shown = items.slice(0, max)
  return (
    <>
      {shown.map(render)}
      {items.length > max && <li className="board-more">+{items.length - max} more</li>}
    </>
  )
}

export default function BoardView({ data, onExit }) {
  const now = useNow(TICK_MS)
  useWakeLock(true)

  const nowDate = new Date(now)
  const todayISO = toISO(nowDate)

  const habitMap = useMemo(() => entryMap(data.habitEntries || []), [data.habitEntries])
  const board = useMemo(
    () =>
      buildBoard(
        {
          tasks: data.tasks,
          reminders: data.reminders,
          lists: data.lists,
          listItems: data.listItems,
          people: data.people,
          keyDates: data.keyDates,
          habits: habitsScheduledToday(data.habits, habitMap, nowDate),
          sharedHabits: habitsScheduledToday(data.sharedHabits, habitMap, nowDate),
        },
        todayISO,
      ),
    // `now` is in the deps on purpose: every derivation below is date-relative,
    // so the tick is what rolls the board over at midnight without a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, habitMap, todayISO, now],
  )

  const clock = nowDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const weekday = nowDate.toLocaleDateString(undefined, { weekday: 'long' })
  const date = nowDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })

  return (
    <div className="board">
      <header className="board-head">
        <div className="board-when">
          <div className="board-weekday">{weekday}</div>
          <div className="board-date">{date}</div>
        </div>
        <div className="board-clock">
          <span className="board-time">{clock}</span>
          <span className="board-greeting">Good {timeOfDay(nowDate.getHours()).toLowerCase()}</span>
        </div>
        {/* Small and cornered rather than a proper nav bar: leaving is a thing
            you do once a week, and every pixel it takes is a pixel not showing
            the household anything. */}
        <button className="board-exit" onClick={onExit} aria-label="Leave board">
          <X size={20} />
        </button>
      </header>

      {board.empty ? (
        <div className="board-clear">
          <div className="board-clear-mark">✓</div>
          <p>Nothing on the board. Enjoy the quiet.</p>
        </div>
      ) : (
        <div className="board-grid">
          {board.meals.length > 0 && (
            <section className="board-card wide">
              <h2>Dinner</h2>
              <ul className="board-meals">
                {board.meals.map((m) => (
                  <li key={m.id}>
                    <span className="board-meal-name">{m.text}</span>
                    {m.note && <span className="board-meal-note">{m.note}</span>}
                    {/* "Cooking: Marc" rather than "<name> cooks" — the label
                        can be the viewer's own ("Me"), and no verb form reads
                        right for both that and a real name. */}
                    {m.assignee && m.assignee !== 'anyone' && (
                      <span className="board-who">Cooking: {assigneeLabel(m.assignee)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {board.tasks.length > 0 && (
            <section className="board-card">
              <h2>
                Today <span className="board-count">{board.tasks.length}</span>
              </h2>
              <ul className="board-tasks">
                {capped(board.tasks, (t) => (
                  <li key={t.id} className={taskBucket(t) === 'overdue' ? 'late' : ''}>
                    <span className="board-task-title">{t.title}</span>
                    <span className="board-task-meta">
                      {taskBucket(t) === 'overdue' && (
                        <span className="board-late">{dueLabel(t.due_date)}</span>
                      )}
                      {t.assignee && t.assignee !== 'anyone' && (
                        <Avatar name={assigneeLabel(t.assignee)} size={26} />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {board.reminders.length > 0 && (
            <section className="board-card">
              {/* Its own card rather than folded into Today: a reminder has
                  nothing to do about it, so it can't be late and mustn't
                  borrow the overdue styling above. */}
              <h2>Reminders</h2>
              <ul className="board-reminders">
                {capped(board.reminders, (r) => (
                  <li key={r.key}>
                    <span className="board-task-title">{r.title}</span>
                    <span className="board-when-chip">{reminderWhen(r)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {board.unscheduled.length > 0 && (
            <section className="board-card">
              {/* Not "Anytime": the whole reason these earn wall space is that
                  each one has a name against it. */}
              <h2>
                On someone <span className="board-count">{board.unscheduled.length}</span>
              </h2>
              <ul className="board-tasks">
                {capped(board.unscheduled, (t) => (
                  <li key={t.id}>
                    <span className="board-task-title">{t.title}</span>
                    <span className="board-task-meta">
                      <Avatar name={assigneeLabel(t.assignee)} size={26} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {board.lists.map((g) => (
            <section className="board-card" key={g.list.id}>
              <h2>
                {g.list.name} <span className="board-count">{g.items.length}</span>
              </h2>
              {/* The card is a reminder that the list exists and roughly how
                  big it is, not the list itself — you shop from the phone in
                  your hand. */}
              <ul className="board-shopping">
                {capped(g.items, (it) => (
                  <li key={it.id}>{it.text}</li>
                ))}
              </ul>
            </section>
          ))}

          {board.habits.length > 0 && (
            <section className="board-card">
              {/* Only what someone chose to share — see boardHabits. */}
              <h2>Shared habits</h2>
              <ul className="board-habits">
                {capped(board.habits, (h) => (
                  <li key={h.id}>
                    <HabitDot habit={h} />
                    {h.name}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {board.dates.length > 0 && (
            <section className="board-card">
              <h2>Coming up</h2>
              <ul className="board-dates">
                {capped(board.dates, (e) => (
                  <li key={`${e.kind}-${e.person.id}-${e.label}`}>
                    <span className="board-date-name">{e.person.name}</span>
                    <span className="board-date-what">
                      {e.kind === 'birthday' ? '🎂' : ''} {e.label}
                      {' · '}
                      {e.daysUntil === 0
                        ? 'today'
                        : e.daysUntil === 1
                          ? 'tomorrow'
                          : `in ${e.daysUntil} days`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
