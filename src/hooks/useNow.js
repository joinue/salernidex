import { useEffect, useState } from 'react'

// Re-render on a fixed cadence so time-derived UI stays honest on a long-lived
// tab — e.g. a tablet left running on the wall. Without this, "Good evening",
// the date, and "2d overdue" are computed once at mount and drift until the
// page is reloaded.
//
// Returns a timestamp that changes each tick. Read it (even just by calling the
// hook) to refresh render-time values like greetings and relativeTime(); pass
// it into time-dependent useMemo deps (and to buildAttention's `now` arg) so
// memoized computations recompute too. Also ticks the moment the tab becomes
// visible again, so waking the device shows fresh values immediately rather
// than waiting out the remainder of the interval.
export function useNow(intervalMs = 5 * 60 * 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const id = setInterval(tick, intervalMs)
    const onVisible = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs])
  return now
}
