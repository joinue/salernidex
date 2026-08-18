import { useEffect, useMemo, useState } from 'react'

// Tracks the visual viewport so bottom-anchored overlays stay above the iOS
// software keyboard. iOS Safari does not shrink the layout viewport when the
// keyboard opens — it only shrinks the *visual* viewport and scrolls the page
// up — so a `position: fixed; inset: 0` overlay keeps the keyboard's footprint
// and its bottom-anchored sheet ends up hidden behind the keyboard.
//
// Returns inline styles to spread onto the overlay element. They clamp it to
// the currently visible rectangle so `align-items: flex-end` rests the sheet
// on top of the keyboard instead of underneath it.
export function useVisualViewport() {
  const [rect, setRect] = useState(null)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    // Only publish an actual change. iOS reports the keyboard's rise as a
    // stream of resize *and* scroll events, many of them carrying a rectangle
    // identical to the last one; re-rendering every consumer on each of those
    // is work done in the middle of the one animation that has to stay smooth.
    const update = () =>
      setRect((prev) =>
        prev && prev.height === vv.height && prev.top === vv.offsetTop
          ? prev
          : { height: vv.height, top: vv.offsetTop },
      )
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  // Memoized so the identity only changes when the rectangle does. iOS reports
  // the keyboard's rise as a stream of resize events, and a fresh style object
  // per render makes every consumer that depends on this one re-run its own
  // work on each of them, mid-animation.
  return useMemo(
    () => (rect ? { top: rect.top, height: rect.height, bottom: 'auto' } : null),
    [rect],
  )
}
