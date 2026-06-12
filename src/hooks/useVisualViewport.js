import { useEffect, useState } from 'react'

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

    const update = () => setRect({ height: vv.height, top: vv.offsetTop })
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  if (!rect) return null
  return { top: rect.top, height: rect.height, bottom: 'auto' }
}
