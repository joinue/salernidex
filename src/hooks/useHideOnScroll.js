import { useEffect, useState } from 'react'
import { scrollTop, watchScroll } from '../lib/scroller'

// True while the user is scrolling *down* through a container — the cue for
// tucking floating chrome (the FAB) out of the way.
//
// Why not just leave the FAB up: it's `position: fixed`, so it permanently
// covers a ~54px square of whatever row sits under it — which in practice was
// the habit steppers, a task row's trailing control, and Settings' "I'm this"
// button. Hiding on scroll-down is the same answer iOS gives (Safari's
// toolbars, Mail's compose button).
//
// Deliberately does NOT re-show on scroll-idle: if you scrolled down to reach a
// row and stopped, the FAB reappearing over it would put the collision straight
// back. Scroll up (or return to the top) and it comes back.
const THRESHOLD = 8 // px of travel before we commit to a direction
const TOP_ZONE = 24 // always visible this close to the top

export function useHideOnScroll(ref, enabled = true) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const el = ref?.current
    if (!el || !enabled) {
      setHidden(false)
      return
    }
    // Which box moves depends on the shell — `.main` on desktop, the document
    // on a phone — so read and subscribe through lib/scroller rather than
    // assuming the element passed in is the one that scrolls.
    let last = scrollTop(el)
    let frame = 0

    const measure = () => {
      frame = 0
      const y = scrollTop(el)
      const dy = y - last
      if (y <= TOP_ZONE) setHidden(false)
      else if (dy > THRESHOLD) setHidden(true)
      else if (dy < -THRESHOLD) setHidden(false)
      // Anchor only once we've acted, so slow scrolls still accumulate travel.
      if (Math.abs(dy) > THRESHOLD) last = y
    }

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }

    const unwatch = watchScroll(el, onScroll)
    return () => {
      unwatch()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [ref, enabled])

  return hidden
}
