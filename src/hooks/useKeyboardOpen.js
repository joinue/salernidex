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

// The same signal as a distance rather than a boolean: how many CSS pixels at
// the bottom of the layout viewport the keyboard currently hides. A fixed
// element offset by this much rests on top of the keyboard — an iOS input
// accessory bar, which is what the notes formatting toolbar uses it for.
//
// Returns 0 whenever no software keyboard is up, so `inset > 0` doubles as
// "there is a keyboard to dock to" and desktop never takes the docked path.
//
// This one *does* listen to `scroll`, and that's the whole difference from
// useKeyboardOpen. Whether a keyboard is open can't change during a pan, so
// that hook can ignore it; *where the bottom of the visible band is* changes on
// every frame of one, because Safari pans by moving `offsetTop` rather than by
// scrolling the document. Ignoring it here is exactly the bug this replaces:
// chrome pinned to a bottom edge that has since slid away.
export function useKeyboardInset() {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      const closed = window.innerHeight - vv.height <= KEYBOARD_MIN
      // The visible band ends at offsetTop + height; everything below it is
      // keyboard (plus whatever Safari has panned out of the way).
      setInset(closed ? 0 : Math.max(0, window.innerHeight - (vv.height + vv.offsetTop)))
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return inset
}
