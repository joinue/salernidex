import { useMemo, useState } from 'react'
import { Edit2, Archive, Trash2, TrendingUp, TrendingDown, Minus, Pause, Play } from 'react-feather'
import { useConfirm } from '../../hooks/useConfirm'
import {
  entryMap,
  valueOn,
  isSkipped,
  noteOn,
  isWeekly,
  startOf,
  currentStreak,
  bestStreak,
  windowStats,
  weekCount,
  weekProgress,
  calendarMatrix,
  bestDayOfWeek,
  trend,
  totals,
  goalLabel,
  cadenceLabel,
  formatDay,
  toISODate,
} from '../../lib/habits'
import HabitQuickLog from './HabitQuickLog'
import { HabitDot } from './HabitRow'
import Sheet from '../../components/ui/Sheet'
import { memberName } from '../../lib/household'
import NavBar from '../../components/ui/NavBar'
import NoteBacklinks from '../../components/ui/NoteBacklinks'
import EmptyState from '../../components/ui/EmptyState'
import SectionLabel from '../../components/ui/SectionLabel'
import StatTile, { StatGrid } from '../../components/ui/StatTile'

const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const RANGES = [
  { value: 13, label: '3m' },
  { value: 26, label: '6m' },
  { value: 53, label: '1y' },
]

// What each heatmap square means, spoken. The cells are empty buttons — colour
// is the only visual channel — so without this a screen reader gets a grid of
// hundreds of unnamed buttons.
const CELL_STATUS = {
  hit: 'done',
  miss: 'missed',
  today: 'not logged yet',
  skip: 'rest day',
  off: 'off-day',
  logged: 'logged',
  empty: 'not logged',
  future: 'upcoming',
  none: 'before this habit started',
}

function Heatmap({ habit, map, today, weeks, onPick }) {
  const { columns, monthLabels } = useMemo(
    () => calendarMatrix(habit, map, today, weeks),
    [habit, map, today, weeks],
  )
  const todayISO = toISODate(today)
  return (
    <div className="heatmap">
      <div className="heatmap-months" aria-hidden="true">
        {monthLabels.map((m, i) => (
          <span key={i} className="heatmap-month">
            {m}
          </span>
        ))}
      </div>
      <div className="heatmap-grid" role="group" aria-label={`${habit.name} history`}>
        {columns.map((col, ci) => (
          <div className="heatmap-col" key={ci}>
            {col.map((cell) => {
              const note = noteOn(habit, cell.iso, map)
              const label = `${formatDay(cell.iso, todayISO)} — ${
                CELL_STATUS[cell.status] ?? cell.status
              }${note ? `. Note: ${note}` : ''}`
              return (
                <button
                  key={cell.iso}
                  className={`habit-cell ${cell.status} ${note ? 'has-note' : ''}`}
                  title={label}
                  aria-label={label}
                  disabled={cell.status === 'future' || cell.status === 'none'}
                  onClick={() => onPick(cell.iso)}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// Tiny SVG line (trackers) or weekly bars (build/limit).
function MiniChart({ habit, map, today }) {
  const w = 300
  const h = 64
  if (habit.polarity === 'track') {
    const series = []
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 41)
    for (let i = 0; i < 42; i++) {
      const iso = toISODate(d)
      if (map.has(`${habit.id}|${iso}`)) series.push(valueOn(habit, iso, map))
      d.setDate(d.getDate() + 1)
    }
    if (series.length < 2) return null
    const min = Math.min(...series)
    const max = Math.max(...series)
    const range = max - min || 1
    const pts = series
      .map((v, i) => {
        const x = (i / (series.length - 1)) * w
        const y = h - 4 - ((v - min) / range) * (h - 8)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
    return (
      <svg className="habit-chart" viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
        <polyline
          points={pts}
          fill="none"
          stroke={habit.color || 'var(--accent)'}
          strokeWidth="2"
        />
      </svg>
    )
  }
  // build/limit: success-days per week over the last 12 weeks, clipped to the
  // weeks the habit has actually existed (no phantom empty bars before creation).
  // weekCount is the same primitive the streak and the heatmap run on, so a bar
  // can never disagree with the green squares above it.
  const startISO = startOf(habit)
  const weeks = []
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  cursor.setDate(cursor.getDate() - cursor.getDay()) // this Sunday
  for (let wk = 11; wk >= 0; wk--) {
    const start = new Date(cursor)
    start.setDate(cursor.getDate() - wk * 7)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    if (startISO && toISODate(end) < startISO) continue // week ended before the habit began
    weeks.push(weekCount(habit, map, start, today))
  }
  const max = Math.max(...weeks, 1)
  const bw = w / weeks.length
  return (
    <svg className="habit-chart" viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
      {weeks.map((c, i) => {
        const bh = (c / max) * (h - 8)
        return (
          <rect
            key={i}
            x={i * bw + 2}
            y={h - bh - 2}
            width={bw - 4}
            height={bh}
            rx="2"
            fill={habit.color || 'var(--accent)'}
            opacity={c ? 1 : 0.18}
          />
        )
      })}
    </svg>
  )
}

const TrendIcon = ({ dir }) =>
  dir === 'up' ? (
    <TrendingUp size={15} />
  ) : dir === 'down' ? (
    <TrendingDown size={15} />
  ) : (
    <Minus size={15} />
  )

// Local 'yyyy-mm-dd' n days from an ISO day (timezone-safe, parsed from parts).
function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  return toISODate(new Date(y, m - 1, d + n))
}

export default function HabitDetail({ data, habitId, onBack, onEdit, onOpenNote }) {
  const {
    habits,
    sharedHabits,
    notes = [],
    habitEntries,
    logHabit,
    archiveHabit,
    deleteHabit,
    pauseHabit,
    resumeHabit,
  } = data
  const confirm = useConfirm()
  const [weeks, setWeeks] = useState(13)
  const [editingDay, setEditingDay] = useState(null)
  const [breaking, setBreaking] = useState(false)

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${habit.name}”?`,
      message: 'This erases the habit and its entire history.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (ok) {
      onBack()
      deleteHabit(habit.id)
    }
  }

  const today = useMemo(() => new Date(), [])
  const todayISO = toISODate(today)
  const map = useMemo(() => entryMap(habitEntries), [habitEntries])
  const owned = habits.find((h) => h.id === habitId)
  const habit = owned || (sharedHabits || []).find((h) => h.id === habitId)
  // A household member's shared habit: view-only, no logging or editing.
  const readOnly = !owned && !!habit

  if (!habit) {
    return (
      <div>
        <NavBar backLabel="Back" onBack={onBack} title="Not found" />
        <EmptyState>Habit not found.</EmptyState>
      </div>
    )
  }

  const onBreak = !readOnly && isSkipped(habit, todayISO, map)
  const weekly = isWeekly(habit)
  const isTrack = habit.polarity === 'track'
  const streak = currentStreak(habit, map, today)
  const wp = weekly ? weekProgress(habit, map, today) : null
  const t = totals(habit, map, today)
  const tr = trend(habit, map, today)
  const best = bestDayOfWeek(habit, map, today)
  const s30 = windowStats(habit, map, today, 30)
  const pct = (st) => (st.scheduledDays ? Math.round((st.successDays / st.scheduledDays) * 100) : 0)
  const allTimePct = t.scheduled ? Math.round((t.successes / t.scheduled) * 100) : 0
  const abstinence = habit.polarity === 'limit' && (habit.target ?? 0) === 0
  const doneLabel = abstinence
    ? 'Days free'
    : habit.polarity === 'limit'
      ? 'Clean days'
      : 'Days hit'

  return (
    <div className="habit-detail-page">
      <NavBar backLabel="Habits" onBack={onBack} title={habit.name}>
        <header className="habit-detail-head">
          <HabitDot habit={habit} size="lg" />
          <div className="habit-detail-headtext">
            <h1 className="habit-detail-name">{habit.name}</h1>
            <p className="row-sub">
              {goalLabel(habit)} · {cadenceLabel(habit)}
            </p>
            {readOnly && (
              <p className="row-sub shared-by">
                Shared by {memberName(habit.member_id) || 'a member'}
              </p>
            )}
          </div>
          {!readOnly && (
            <button
              className="header-action neutral"
              onClick={() => onEdit(habit)}
              aria-label="Edit"
            >
              <Edit2 size={18} />
            </button>
          )}
        </header>
      </NavBar>

      {/* Log today (own habits only; shared habits are read-only) */}
      {!readOnly && (
        <div className="habit-today-log">
          <span>{weekly ? `${wp.count}/${wp.target} this week` : 'Log today'}</span>
          <HabitQuickLog
            habit={habit}
            value={valueOn(habit, todayISO, map)}
            onLog={(v) => logHabit(habit.id, todayISO, v)}
          />
        </div>
      )}

      {/* Insight cards */}
      <StatGrid>
        {isTrack ? (
          <>
            <StatTile label="30-day avg" value={s30.average.toFixed(1)} />
            <StatTile label="Logged" value={`${t.scheduled}`} unit="days" />
            {!tr.young && (
              <StatTile label="Trend" value={<TrendIcon dir={tr.dir} />} sub={tr.dir} />
            )}
          </>
        ) : weekly ? (
          <>
            {habit.track_streak && <StatTile label="Streak" value={`${streak}`} unit="weeks" />}
            <StatTile label="This week" value={`${wp.count}/${wp.target}`} />
            <StatTile label="Days done" value={`${t.successes}`} unit="total" />
            {!tr.young && (
              <StatTile label="Trend" value={<TrendIcon dir={tr.dir} />} sub={tr.dir} />
            )}
          </>
        ) : (
          <>
            {habit.track_streak && <StatTile label="Streak" value={`${streak}`} unit="days" />}
            {habit.track_streak && (
              <StatTile label="Best" value={`${bestStreak(habit, map, today)}`} unit="days" />
            )}
            <StatTile label="30-day" value={`${pct(s30)}%`} />
            <StatTile label="All-time" value={`${allTimePct}%`} />
            <StatTile label={doneLabel} value={`${t.successes}`} unit="days" />
            {best && (
              <StatTile
                label="Best day"
                value={DOW_FULL[best.dow].slice(0, 3)}
                unit={`${Math.round(best.rate * 100)}%`}
              />
            )}
            {!tr.young && (
              <StatTile label="Trend" value={<TrendIcon dir={tr.dir} />} sub={tr.dir} />
            )}
          </>
        )}
      </StatGrid>

      {/* History heatmap */}
      <div className="habit-section">
        <div className="habit-section-head">
          <SectionLabel>History</SectionLabel>
          <div className="range-toggle">
            {RANGES.map((r) => (
              <button
                key={r.value}
                className={weeks === r.value ? 'on' : ''}
                onClick={() => setWeeks(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <Heatmap
          habit={habit}
          map={map}
          today={today}
          weeks={weeks}
          onPick={(iso) => !readOnly && setEditingDay(iso)}
        />
      </div>

      {/* Chart */}
      <div className="habit-section">
        <SectionLabel>{isTrack ? 'Trend' : 'By week'}</SectionLabel>
        <MiniChart habit={habit} map={map} today={today} />
      </div>

      {/* Renders nothing when there are no backlinks, so no wrapper — an empty
          habit-section would leave its margin behind. */}
      <NoteBacklinks notes={notes} type="habit" id={habitId} onOpenNote={onOpenNote} />

      {!readOnly && (
        <div className="habit-actions" style={{ marginTop: 20 }}>
          <button className="text-btn" onClick={() => onEdit(habit)}>
            <Edit2 size={14} /> Edit
          </button>
          {onBreak ? (
            <button className="text-btn" onClick={() => resumeHabit(habit.id, todayISO)}>
              <Play size={14} /> End break
            </button>
          ) : (
            <button className="text-btn" onClick={() => setBreaking(true)}>
              <Pause size={14} /> Take a break
            </button>
          )}
          <button className="text-btn" onClick={() => archiveHabit(habit.id, true)}>
            <Archive size={14} /> Archive
          </button>
          <button className="text-btn danger" onClick={remove}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}

      {editingDay && (
        <Sheet
          title={`${habit.name} · ${formatDay(editingDay, todayISO)}`}
          onClose={() => setEditingDay(null)}
        >
          <div className="backfill-body">
            <HabitQuickLog
              habit={habit}
              value={valueOn(habit, editingDay, map)}
              onLog={(v) => logHabit(habit.id, editingDay, v, false)}
            />
          </div>
          <textarea
            key={editingDay}
            className="backfill-note"
            placeholder="Add a note (optional)"
            defaultValue={noteOn(habit, editingDay, map)}
            rows={2}
            onBlur={(e) =>
              logHabit(
                habit.id,
                editingDay,
                valueOn(habit, editingDay, map),
                isSkipped(habit, editingDay, map),
                e.target.value.trim(),
              )
            }
          />
          <div className="backfill-actions">
            <button
              className={`pill-btn ${isSkipped(habit, editingDay, map) ? 'on' : ''}`}
              onClick={() => logHabit(habit.id, editingDay, 0, !isSkipped(habit, editingDay, map))}
            >
              {isSkipped(habit, editingDay, map) ? '✓ Rest day' : 'Mark rest day'}
            </button>
            <button className="pill-btn" onClick={() => logHabit(habit.id, editingDay, 0, false)}>
              Clear
            </button>
          </div>
        </Sheet>
      )}

      {breaking && (
        <BreakSheet
          habitName={habit.name}
          todayISO={todayISO}
          onPause={(s, e) => pauseHabit(habit.id, s, e)}
          onClose={() => setBreaking(false)}
        />
      )}
    </div>
  )
}

const isoMs = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

// "Take a break": pick a date range to rest the habit over (a vacation). Writes
// rest days across the span, which the streak engine treats as transparent.
function BreakSheet({ habitName, todayISO, onPause, onClose }) {
  const [start, setStart] = useState(todayISO)
  const [end, setEnd] = useState(addDaysISO(todayISO, 6))
  const valid = end >= start
  const days = valid ? Math.round((isoMs(end) - isoMs(start)) / 86400000) + 1 : 0
  const quick = (n) => {
    setStart(todayISO)
    setEnd(addDaysISO(todayISO, n - 1))
  }
  return (
    <Sheet title={`Take a break — ${habitName}`} onClose={onClose}>
      <p className="muted" style={{ margin: '0 0 14px' }}>
        Rest days across this span — your streak stays protected and it drops off Today until you're
        back.
      </p>
      <div className="break-dates">
        <label className="field">
          <span className="label">From</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Until</span>
          <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <div className="chips" style={{ margin: '4px 0 16px' }}>
        <button type="button" className="chip accent" onClick={() => quick(7)}>
          1 week
        </button>
        <button type="button" className="chip accent" onClick={() => quick(14)}>
          2 weeks
        </button>
      </div>
      <button
        className="btn-primary"
        disabled={!valid}
        onClick={() => {
          onPause(start, end)
          onClose()
        }}
      >
        {valid ? `Pause for ${days} day${days === 1 ? '' : 's'}` : 'Pick an end date'}
      </button>
    </Sheet>
  )
}
