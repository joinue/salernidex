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
  const read = () => {
    const vv = window.visualViewport
    return vv ? vv.offsetTop + vv.height : window.innerHeight
  }
  const [bottom, setBottom] = useState(read)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => setBottom(vv.offsetTop + vv.height)
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return bottom
}
