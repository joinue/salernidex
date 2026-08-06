import { useEffect } from 'react'
import { EDGE_BACK_SLOP_PX } from '../lib/gestures'
import { overlaysOpen } from './useScrollLock'

// iOS-style edge-swipe back: drag right from the left screen edge on a
// detail page to go back, with the content tracking your finger. Installed
// PWAs don't get Safari's native gesture, so we provide it.
//
// Listeners live on window, not the content element — the gesture starts at
// the literal screen edge, which page gutters/margins may not cover. That
// breadth is also the catch: a sheet or modal is portaled to <body> and reaches
// x=0 on mobile, so without the overlay check below, swiping across a form
// field near the left edge navigates the page out from behind the overlay.
export function useEdgeBack(ref, enabled, onBack) {
  useEffect(() => {
    if (!enabled) return

    let startX = 0
    let startY = 0
    let active = false
    let intent = false // horizontal drag confirmed (vs vertical scroll)

    const content = () => ref.current?.querySelector('.content')

    const down = (e) => {
      if (e.clientX > 24) return
      if (!e.isPrimary) return
      // The page isn't what the user is looking at — an overlay is on top of it.
      if (overlaysOpen()) return
      startX = e.clientX
      startY = e.clientY
      active = true
      intent = false
    }

    const move = (e) => {
      if (!active) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (!intent) {
        if (Math.abs(dy) > EDGE_BACK_SLOP_PX && Math.abs(dy) > Math.abs(dx)) {
          active = false // they're scrolling
          return
        }
        if (!(dx > EDGE_BACK_SLOP_PX && Math.abs(dx) > Math.abs(dy))) return
        intent = true
      }
      const c = content()
      if (c) {
        c.style.transition = 'none'
        c.style.transform = `translateX(${Math.max(0, dx) * 0.5}px)` // rubber-band feel
      }
    }

    const end = (e) => {
      if (!active) return
      active = false
      const dx = e.clientX - startX
      const c = content()
      if (c) {
        c.style.transition = 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)'
        c.style.transform = 'translateX(0)'
      }
      // Re-check: an overlay can open mid-drag (a long-press menu), and the
      // swipe shouldn't then navigate the page underneath it.
      if (intent && dx > 80 && !overlaysOpen()) onBack()
    }

    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [ref, enabled, onBack])
}
