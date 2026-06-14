import { useMemo, useState } from 'react'
import { Activity, Plus, ChevronRight, Zap, Check } from 'react-feather'
import {
  entryMap,
  valueOn,
  isScheduled,
  isWeekly,
  isSuccess,
  currentStreak,
  weekProgress,
  goalLabel,
  cadenceLabel,
  toISODate,
} from '../lib/habits'
import { byOrder, moveUpdates } from '../lib/order'
import { topInsights } from '../lib/habitInsights'
import { HABIT_TEMPLATES } from '../lib/habitTemplates'
import { memberName } from '../lib/household'
import PageHeader from './PageHeader'
import ReorderableList from './ReorderableList'
import HabitQuickLog from './HabitQuickLog'
import InsightCarousel from './InsightCarousel'

// A few starter templates surfaced inline on the empty state for one-tap add.
const STARTERS = HABIT_TEMPLATES.slice(0, 6)

export default function HabitsView({ data, onAdd, onPickTemplate, onOpen, onOpenInsights }) {
  const { habits, sharedHabits, habitEntries, logHabit, archiveHabit, reorderHabits, loading } = data
  const [showArchived, setShowArchived] = useState(false)

  const today = useMemo(() => new Date(), [])
  const todayISO = toISODate(today)
  const map = useMemo(() => entryMap(habitEntries), [habitEntries])
  const insights = useMemo(() => topInsights(habits, map, today, { max: 5 }), [habits, map, today])

  if (loading) return <p className="empty dots">Loading</p>

  const active = habits.filter((h) => !h.archived_at).sort(byOrder)
  const archived = habits.filter((h) => h.archived_at)
  const shared = (sharedHabits || []).filter((h) => !h.archived_at).sort(byOrder)

  const Row = (h) => {
    const weekly = isWeekly(h)
    const streak = currentStreak(h, map, today)
    const wp = weekly ? weekProgress(h, map, today) : null
    return (
      <div className={`list-row ${isScheduled(h, today) ? '' : 'habit-offday'}`} onClick={() => onOpen(h.id)}>
        <span
          className={`habit-dot ${h.icon ? 'emoji' : ''}`}
          style={{ background: h.color || 'var(--accent)' }}
        >
          {h.icon || h.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="row-body">
          <div className="row-title">
            {h.name}
            {h.track_streak && streak > 0 && (
              <span className="habit-streak">
                <Zap size={12} /> {streak}
                {weekly ? 'w' : ''}
              </span>
            )}
          </div>
          <div className="row-sub">
            {weekly ? `${wp.count}/${wp.target} this week` : goalLabel(h)} · {cadenceLabel(h)}
          </div>
        </div>
        <HabitQuickLog
          habit={h}
          value={valueOn(h, todayISO, map)}
          onLog={(v) => logHabit(h.id, todayISO, v)}
        />
        <ChevronRight size={18} className="row-chevron" />
      </div>
    )
  }

  // A household member's shared habit — read-only: today's status, no logging.
  const SharedRow = (h) => {
    const weekly = isWeekly(h)
    const streak = currentStreak(h, map, today)
    const wp = weekly ? weekProgress(h, map, today) : null
    const doneToday = isSuccess(h, valueOn(h, todayISO, map))
    return (
      <div className="list-row" onClick={() => onOpen(h.id)}>
        <span
          className={`habit-dot ${h.icon ? 'emoji' : ''}`}
          style={{ background: h.color || 'var(--accent)' }}
        >
          {h.icon || h.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="row-body">
          <div className="row-title">
            {h.name}
            {h.track_streak && streak > 0 && (
              <span className="habit-streak">
                <Zap size={12} /> {streak}
                {weekly ? 'w' : ''}
              </span>
            )}
          </div>
          <div className="row-sub">
            {weekly ? `${wp.count}/${wp.target} this week` : goalLabel(h)} · {cadenceLabel(h)}
          </div>
        </div>
        {h.polarity !== 'track' && (
          <span className={`shared-status ${doneToday ? 'done' : ''}`}>
            {doneToday ? <Check size={16} /> : '·'}
          </span>
        )}
        <ChevronRight size={18} className="row-chevron" />
      </div>
    )
  }

  // Group shared habits under each owner's name.
  const sharedByOwner = shared.reduce((acc, h) => {
    ;(acc[h.member_id] ||= []).push(h)
    return acc
  }, {})

  return (
    <div>
      <PageHeader
        title="Habits"
        infoTitle="How habits work"
        info="Build (do more), Limit (do less), or Track (just log a number). Schedule by specific days or “N times a week.” Log today on the list, or open a habit for its full history, streaks, and insights. Streaks count consecutive good days (or weeks) — off-days and rest days don’t break them."
        action={onPickTemplate}
        actionLabel="New habit"
      />

      <InsightCarousel insights={insights} onOpenAll={onOpenInsights} />

      {active.length === 0 && archived.length === 0 ? (
        <div className="empty">
          <Activity size={28} className="empty-icon" />
          No habits yet.
          <button className="text-btn" onClick={onPickTemplate}>
            <Plus size={14} /> New habit
          </button>
          <div className="template-rail">
            {STARTERS.map((t) => (
              <button key={t.id} className="template-pill" onClick={() => onAdd(t.habit)}>
                <span aria-hidden="true">{t.habit.icon}</span> {t.habit.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ReorderableList
          items={active}
          onMove={(from, to) => reorderHabits(moveUpdates(active, from, to))}
          renderItem={(h) => <Row {...h} />}
        />
      )}

      {shared.length > 0 && (
        <div className="habit-shared">
          {Object.entries(sharedByOwner).map(([mid, list]) => (
            <div key={mid}>
              <div className="section-label shared-label">
                Shared by {memberName(mid) || 'a member'}
              </div>
              <div className="list">
                {list.map((h) => (
                  <SharedRow key={h.id} {...h} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div className="habit-archived">
          <button className="text-btn" onClick={() => setShowArchived((s) => !s)}>
            {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
          </button>
          {showArchived && (
            <div className="list">
              {archived.map((h) => (
                <div className="list-row" key={h.id}>
                  <span
                    className={`habit-dot ${h.icon ? 'emoji' : ''}`}
                    style={{ background: h.color || 'var(--accent)', opacity: 0.5 }}
                  >
                    {h.icon || h.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="row-body">
                    <div className="row-title">{h.name}</div>
                    <div className="row-sub">Archived</div>
                  </div>
                  <button className="text-btn" onClick={() => archiveHabit(h.id, false)}>
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
