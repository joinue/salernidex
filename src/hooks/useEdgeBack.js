import { useEffect } from 'react'
import { EDGE_BACK_SLOP_PX } from '../lib/gestures'
import { isStandalone } from '../lib/platform'
import { overlaysOpen } from './useScrollLock'

// iOS-style edge-swipe back: drag right from the left screen edge on a
// detail page to go back, with the content tracking your finger. Installed
// PWAs don't get Safari's native gesture, so we provide it.
//
// Standalone only, and that qualifier is load-bearing rather than tidy-minded.
// In a browser tab Safari's own edge-swipe is still armed, so both gestures fire
// on the same finger: Safari slides the whole page while we translate .content
// inside it. The two motions compound, and a detail page ends up visibly
// sliding sideways under a drag that the tab pages — which never arm this hook —
// absorb without moving at all. Held still by touch-action: pan-y on .main; a
// transform isn't scrolling, so that CSS has no say over ours.
//
// Listeners live on window, not the content element — the gesture starts at
// the literal screen edge, which page gutters/margins may not cover. That
// breadth is also the catch: a sheet or modal is portaled to <body> and reaches
// x=0 on mobile, so without the overlay check below, swiping across a form
// field near the left edge navigates the page out from behind the overlay.
export function useEdgeBack(ref, enabled, onBack) {
  useEffect(() => {
    if (!enabled || !isStandalone()) return

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
        // Settle back, then take the transform *off* — don't park it at
        // translateX(0). A transform of any value, identity included, makes an
        // element a containing block for its fixed-position descendants, so
        // leaving one here silently re-anchors anything `position: fixed`
        // inside the page to this box for the rest of the session. One aborted
        // swipe was enough. Nothing noticed while the only fixed things were
        // the tab pill and modals — both live outside .content — but the notes
        // formatting toolbar docks to the keyboard from inside it.
        const clear = () => {
          c.style.transition = ''
          c.style.transform = ''
        }
        if (!intent) {
          clear() // never moved, so there's no transitionend coming
        } else {
          c.style.transition = 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)'
          c.style.transform = 'translateX(0)'
          c.addEventListener('transitionend', clear, { once: true })
        }
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
