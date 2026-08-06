import { useMemo, useState } from 'react'
import { Activity, Plus } from 'react-feather'
import { entryMap, toISODate } from '../../lib/habits'
import { byOrder, moveUpdates } from '../../lib/order'
import { topInsights } from '../../lib/habitInsights'
import { HABIT_TEMPLATES } from '../../lib/habitTemplates'
import { memberName } from '../../lib/household'
import PageHeader from '../../components/shell/PageHeader'
import ReorderableList from '../../components/ui/ReorderableList'
import HabitRow, { HabitDot } from './HabitRow'
import InsightCarousel from './InsightCarousel'
import EmptyState from '../../components/ui/EmptyState'

// A few starter templates surfaced inline on the empty state for one-tap add.
const STARTERS = HABIT_TEMPLATES.slice(0, 6)

export default function HabitsView({ data, onAdd, onPickTemplate, onOpen, onOpenInsights }) {
  const { habits, sharedHabits, habitEntries, logHabit, archiveHabit, reorderHabits, loading } =
    data
  const [showArchived, setShowArchived] = useState(false)

  const today = useMemo(() => new Date(), [])
  const todayISO = toISODate(today)
  const map = useMemo(() => entryMap(habitEntries), [habitEntries])
  const insights = useMemo(() => topInsights(habits, map, today, { max: 5 }), [habits, map, today])

  if (loading) return <p className="empty dots">Loading</p>

  const active = habits.filter((h) => !h.archived_at).sort(byOrder)
  const archived = habits.filter((h) => h.archived_at)
  const shared = (sharedHabits || []).filter((h) => !h.archived_at).sort(byOrder)

  const rowProps = { map, today, todayISO, onOpen }

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
        <EmptyState
          icon={Activity}
          action={
            <>
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
            </>
          }
        >
          No habits yet.
        </EmptyState>
      ) : (
        <ReorderableList
          items={active}
          onMove={(from, to) => reorderHabits(moveUpdates(active, from, to))}
          renderItem={(h) => (
            <HabitRow habit={h} {...rowProps} onLog={(v) => logHabit(h.id, todayISO, v)} />
          )}
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
                  <HabitRow key={h.id} habit={h} {...rowProps} onLog={null} />
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
                  <HabitDot habit={h} style={{ opacity: 0.5 }} />
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
