import { useMemo } from 'react'
import { Zap, ChevronRight } from 'react-feather'
import { entryMap } from '../../lib/habits'
import { topInsights } from '../../lib/habitInsights'
import NavBar from '../../components/ui/NavBar'
import SectionLabel from '../../components/ui/SectionLabel'
import EmptyState from '../../components/ui/EmptyState'

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
      <NavBar backLabel="Habits" onBack={onBack} title="Insights">
        <h1 className="habit-detail-name" style={{ marginBottom: 16 }}>
          Insights
        </h1>
      </NavBar>

      {insights.length === 0 ? (
        <EmptyState icon={Zap}>
          No patterns yet.
          <span className="muted" style={{ fontSize: 13, maxWidth: 280 }}>
            Keep logging — patterns appear once a few habits share about two weeks of overlap.
          </span>
        </EmptyState>
      ) : (
        <>
          {strong.length > 0 && (
            <div className="habit-section">
              <SectionLabel>Strong</SectionLabel>
              <div className="insight-list">{strong.map(Row)}</div>
            </div>
          )}
          {moderate.length > 0 && (
            <div className="habit-section">
              <SectionLabel>Moderate</SectionLabel>
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
