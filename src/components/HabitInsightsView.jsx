import { useMemo } from 'react'
import { ArrowLeft, Zap, ChevronRight } from 'react-feather'
import { entryMap } from '../lib/habits'
import { topInsights } from '../lib/habitInsights'

// Full list of every detected cross-habit pattern, grouped by confidence band.
// The carousel on the Habits list links here for the complete set.
export default function HabitInsightsView({ data, onBack, onOpenHabit }) {
  const { habits, habitEntries } = data
  const today = useMemo(() => new Date(), [])
  const map = useMemo(() => entryMap(habitEntries), [habitEntries])
  const insights = useMemo(
    () => topInsights(habits, map, today, { max: Infinity }),
    [habits, map, today],
  )

  const strong = insights.filter((r) => r.band === 'strong')
  const moderate = insights.filter((r) => r.band === 'moderate')

  const Row = (r) => (
    <button key={r.aId + r.bId} className="insight-row" onClick={() => onOpenHabit(r.primaryId)}>
      <Zap size={15} className="insight-row-icon" />
      <div className="insight-row-body">
        <div className="insight-row-text">{r.phrase}</div>
        <div className="insight-row-sub">over {r.n} shared days</div>
      </div>
      <ChevronRight size={16} className="row-chevron" />
    </button>
  )

  return (
    <div>
      <button className="back-btn" onClick={onBack}>
        <ArrowLeft size={18} /> Habits
      </button>
      <h1 className="habit-detail-name" style={{ marginBottom: 16 }}>
        Insights
      </h1>

      {insights.length === 0 ? (
        <div className="empty">
          <Zap size={28} className="empty-icon" />
          No patterns yet.
          <span className="muted" style={{ fontSize: 13, maxWidth: 280 }}>
            Keep logging — patterns appear once a few habits share about two weeks of overlap.
          </span>
        </div>
      ) : (
        <>
          {strong.length > 0 && (
            <div className="habit-section">
              <span className="section-label">Strong</span>
              <div className="insight-list">{strong.map(Row)}</div>
            </div>
          )}
          {moderate.length > 0 && (
            <div className="habit-section">
              <span className="section-label">Moderate</span>
              <div className="insight-list">{moderate.map(Row)}</div>
            </div>
          )}
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Associations, not causes — a pattern in your logs, not a guarantee.
          </p>
        </>
      )}
    </div>
  )
}
