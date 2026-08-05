import { useState, useEffect } from 'react'
import { Zap, ChevronRight } from 'react-feather'

// One quiet rotating line on the Habits list. Cross-fades through the top
// insights and is fully tappable to the Insights page. Renders nothing when
// there's no signal — silence is the elegant default, no "not enough data" nag.
// Pauses on hover/focus; honors prefers-reduced-motion (snap, no animation).
export default function InsightCarousel({ insights, onOpenAll }) {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = insights?.length || 0

  // Keep the index in range if the list shrinks between renders.
  useEffect(() => {
    if (i >= count && count > 0) setI(0)
  }, [count, i])

  useEffect(() => {
    if (count < 2 || paused) return
    const t = setInterval(() => setI((n) => (n + 1) % count), 5000)
    return () => clearInterval(t)
  }, [count, paused])

  if (count === 0) return null
  const insight = insights[Math.min(i, count - 1)]

  return (
    <button
      className="insight-strip"
      onClick={onOpenAll}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-label={`Insight: ${insight.phrase}. Open all insights.`}
    >
      <Zap size={14} className="insight-strip-icon" />
      <span key={insight.aId + insight.bId + i} className="insight-strip-text">
        {insight.phrase}
      </span>
      {count > 1 && <span className="insight-strip-all">all</span>}
      <ChevronRight size={16} className="insight-strip-chevron" />
    </button>
  )
}
