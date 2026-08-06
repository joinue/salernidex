import { useEffect, useState } from 'react'

// True while the software keyboard is up.
//
// iOS Safari never shrinks the *layout* viewport for the keyboard — it shrinks
// the visual viewport and pans the page instead — so `position: fixed` chrome
// stays pinned to a bottom edge that now lives behind the keyboard, and drifts
// across the screen as Safari pans. The only reliable signal is the gap between
// the two viewports. Android/Chrome defaults to the same model
// (`interactive-widget=resizes-visual`), so one measurement covers both.
//
// The floor keeps Safari's collapsing URL bar (~60px) and the iOS input
// accessory bar from reading as a keyboard; every software keyboard clears it
// comfortably, including the shortest (an external keyboard's accessory strip
// doesn't shrink the viewport at all, so it correctly reads as closed).
const KEYBOARD_MIN = 140

export function useKeyboardOpen() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    // Only `resize` — not `scroll`. Safari fires scroll continuously while it
    // pans the visual viewport, and the gap we measure doesn't change during a
    // pan, so listening would be pure churn.
    const update = () => setOpen(window.innerHeight - vv.height > KEYBOARD_MIN)
    update()
    vv.addEventListener('resize', update)
    return () => vv.removeEventListener('resize', update)
  }, [])

  return open
}
