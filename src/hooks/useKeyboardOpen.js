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

// The same floor, for callers that need to ask "is this gap big enough to be a
// keyboard?" of a measurement they already have.
export const KEYBOARD_FLOOR = KEYBOARD_MIN

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

// How far the bottom of what you can see sits above the bottom of the layout
// viewport — which is the offset a `position: fixed` element needs to rest on
// top of the keyboard rather than behind it. The notes formatting toolbar docks
// with it.
//
// Deliberately *not* gated on "is a keyboard open". iOS has two ways of making
// room for one and they are not distinguishable from in here: Safari in a tab
// keeps the layout viewport whole and pans it, while an installed standalone
// app can shrink it outright. Under the pan the gap is the keyboard minus
// however far it has scrolled; under the shrink it is 0, because the layout
// viewport now *ends* at the keyboard. Both answers are already correct, so
// this measures and returns, and the caller decides when it wants to dock.
// Trying to detect the keyboard first is what broke it: the shrink case reads
// as no keyboard at all, so the bar never docked and stayed sticky at the top
// of the page, under the Dynamic Island — the exact bug it was meant to fix.
//
// This one listens to `scroll` as well as `resize`, and that's the difference
// from useKeyboardOpen. Whether a keyboard is open can't change during a pan,
// so that hook can ignore it; where the bottom of the visible band is changes
// on every frame of one.
export function useVisualBottomGap() {
  const [gap, setGap] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    // The visible band ends at offsetTop + height; everything below it is
    // keyboard, or page that has been panned out of the way.
    const update = () => setGap(Math.max(0, window.innerHeight - (vv.height + vv.offsetTop)))
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return gap
}
