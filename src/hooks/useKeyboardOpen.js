import { useEffect, useState } from 'react'
import { isEditableTarget } from '../lib/keys'

// True while the software keyboard is up.
//
// iOS Safari never shrinks the *layout* viewport for the keyboard — it shrinks
// the visual viewport and pans the page instead — so `position: fixed` chrome
// stays pinned to a bottom edge that now lives behind the keyboard, and drifts
// across the screen as Safari pans. The gap between the two viewports is the
// only size signal iOS gives us. Android/Chrome defaults to the same model
// (`interactive-widget=resizes-visual`), so one measurement covers both.
//
// The gap alone carried this for a while, on a shell where the document never
// scrolled and the two viewports therefore agreed exactly whenever the keyboard
// was down. That margin is gone. Now that a phone scrolls the document (see
// lib/scroller.js), `window.innerHeight` reports the *large* viewport — the
// screen as it would be with the browser toolbars collapsed — while
// visualViewport keeps reporting what you can actually see, so whatever chrome
// the browser is showing sits in the gap permanently rather than never.
//
// The floor was already thinner than it looks: the device reading recorded in
// useVisualBandBottom below is innerHeight 684 against a visual height of 543,
// a gap of 141 — one pixel the right side of it. Adding a toolbar's worth of
// slack on top of that is not something to leave to a constant, and the failure
// is not subtle when it goes: the tab bar and the FAB tuck off screen and stay
// there for the rest of the session.
//
// So focus is the primary signal now and size is the confirmation. A software
// keyboard cannot be up without an editable element focused, and browser chrome
// has nothing to do with focus — which makes the pair immune to a gap of any
// size that isn't a keyboard.
//
// The floor still earns its keep in the other direction: with a field focused
// but a *hardware* keyboard attached, iOS shows only the accessory strip and
// barely shrinks the viewport, which correctly reads as closed.
const KEYBOARD_MIN = 140

export function useKeyboardOpen() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () =>
      setOpen(
        isEditableTarget(document.activeElement) && window.innerHeight - vv.height > KEYBOARD_MIN,
      )
    update()

    // `resize` is the keyboard arriving or leaving. Not `scroll`: Safari fires
    // that continuously while it pans the visual viewport, and the gap doesn't
    // change during a pan, so listening would be pure churn.
    vv.addEventListener('resize', update)
    // Focus is the other half, and it moves without resizing anything: tabbing
    // between two fields keeps the keyboard up, while a tap-away dismisses it a
    // beat before the viewport grows back. Reading focus as it changes is what
    // brings the chrome back promptly instead of on the resize that follows.
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    return () => {
      vv.removeEventListener('resize', update)
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
    }
  }, [])

  return open
}

// Where the bottom edge of what you can actually see falls, in the coordinate
// space `position: fixed` uses. On a phone with the keyboard up that edge *is*
// the top of the keyboard, so a fixed element whose bottom lands here rests on
// it — an iOS input accessory bar, which is what the notes formatting toolbar
// wants to be.
//
// `offsetTop + height`, and both terms matter. Three earlier versions of this
// tried to express the same thing as an inset from the bottom of the layout
// viewport, and every one of them was defeated by the same measurements from a
// real installed app:
//
//     innerHeight 684   outerHeight 956
//     visualViewport   height 543   offsetTop 210
//
// The layout viewport is not the screen (684 vs 956), the visible band is not
// the layout viewport (543), and the band is pushed 210px down inside it — far
// enough that `top: 0` is off the top of the screen. Worse, offsetTop + height
// is 753, which *exceeds* innerHeight: the band's bottom edge sits below the
// layout viewport's own, so an inset from that bottom comes out negative and
// clamps to zero. There is no offset-from-the-bottom that survives this. An
// absolute edge does, because it never refers to the layout viewport's height
// at all.
//
// Listens to `scroll` as well as `resize`: iOS reveals the caret by moving
// offsetTop, so the edge moves on every frame of a pan.
export function useVisualBandBottom() {
  return useVisualBandEdge(
    (vv) => vv.offsetTop + vv.height,
    () => window.innerHeight,
  )
}

// The other edge of the same band, for chrome that pins to the top of what you
// can see. `offsetTop` alone: with a keyboard up iOS pushes the band down
// inside the layout viewport — 210px on the device this was measured against —
// so `top: 0` is that far above the top of the screen, which is exactly where
// the note's nav bar used to go when it panned away mid-sentence.
export function useVisualBandTop() {
  return useVisualBandEdge(
    (vv) => vv.offsetTop,
    () => 0,
  )
}

function useVisualBandEdge(measure, fallback) {
  const read = () => {
    const vv = window.visualViewport
    return vv ? measure(vv) : fallback()
  }
  const [edge, setEdge] = useState(read)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => setEdge(measure(vv))
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
    // measure/fallback are stable per call site (module-level arrow literals
    // recreated each render, but never varying in behaviour).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return edge
}
