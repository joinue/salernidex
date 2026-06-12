import { useEffect } from 'react'

// iOS-style edge-swipe back: drag right from the left screen edge on a
// detail page to go back, with the content tracking your finger. Installed
// PWAs don't get Safari's native gesture, so we provide it.
//
// Listeners live on window, not the content element — the gesture starts at
// the literal screen edge, which page gutters/margins may not cover.
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
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
          active = false // they're scrolling
          return
        }
        if (!(dx > 12 && Math.abs(dx) > Math.abs(dy))) return
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
      if (intent && dx > 80) onBack()
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
