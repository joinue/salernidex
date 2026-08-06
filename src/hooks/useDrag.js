import { useEffect, useRef, useState } from 'react'
import { LONG_PRESS_MS, DRAG_SLOP_PX } from '../lib/gestures'
import haptics from '../lib/haptics'

// Core pointer-drag primitive shared by every gesture in the app (swipe rows,
// drag-to-dismiss sheets). One hardened pipeline so behavior is consistent.
//
// Key behaviors:
// - Axis-intent lock: the gesture only "claims" the pointer once movement is
//   clearly along `axis`; otherwise it bows out so the list keeps scrolling.
//   This is what makes swipe-vs-scroll feel native instead of fighting.
// - Velocity tracking so callers can do flick/momentum snapping.
// - Pointer capture once locked, with clean cancellation.
// - Optional long-press: fires if the finger stays put past `longPressDelay`
//   without locking into a drag (mouse excluded).
//
// Returns { dragging, handlers } — spread handlers onto the draggable element.
export function useDrag({
  axis = 'x',
  onStart,
  onMove,
  onEnd,
  onLongPress,
  longPressDelay = LONG_PRESS_MS,
  enabled = true,
} = {}) {
  const state = useRef(null)
  const lpTimer = useRef(null)
  const [dragging, setDragging] = useState(false)

  const clearLP = () => {
    if (lpTimer.current) {
      clearTimeout(lpTimer.current)
      lpTimer.current = null
    }
  }

  // A pending long-press must not outlive the element. Rows disappear mid-hold
  // all the time here (a realtime delete from another household member, a route
  // change), and a timer that fires afterwards runs its action against a screen
  // the user already left.
  useEffect(
    () => () => {
      clearLP()
      state.current = null
    },
    [],
  )

  const down = (e) => {
    if (!enabled) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // Second finger mid-gesture: ignore it rather than re-home the drag on the
    // new contact point, which makes the row visibly jump. Testing isPrimary is
    // enough — and safer than refusing to start while state is non-null, which
    // would wedge the row for good if a pointerup ever landed elsewhere.
    if (!e.isPrimary) return
    clearLP() // a stale timer from an abandoned press must not outlive it
    state.current = {
      x0: e.clientX,
      y0: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      lastT: e.timeStamp,
      vx: 0,
      vy: 0,
      locked: false,
      active: false,
      moved: false,
      longPressed: false,
      pointerId: e.pointerId,
      target: e.currentTarget,
    }
    if (onLongPress && e.pointerType !== 'mouse') {
      lpTimer.current = setTimeout(() => {
        const s = state.current
        if (s && !s.locked && !s.moved) {
          s.longPressed = true
          haptics.medium() // match useLongPress: a hold always confirms with a buzz
          onLongPress({ x: s.x0, y: s.y0 })
        }
      }, longPressDelay)
    }
  }

  const move = (e) => {
    const s = state.current
    if (!s || s.pointerId !== e.pointerId) return
    const dx = e.clientX - s.x0
    const dy = e.clientY - s.y0
    if (Math.abs(dx) > DRAG_SLOP_PX || Math.abs(dy) > DRAG_SLOP_PX) {
      s.moved = true
      clearLP()
    }
    if (!s.locked) {
      if (Math.abs(dx) < DRAG_SLOP_PX && Math.abs(dy) < DRAG_SLOP_PX) return
      const horizontal = Math.abs(dx) > Math.abs(dy)
      const wanted = axis === 'x' ? horizontal : !horizontal
      if (!wanted) {
        // gesture belongs to the other axis (scrolling) — let it go
        clearLP()
        state.current = null
        return
      }
      s.locked = true
      s.active = true
      setDragging(true)
      try {
        s.target.setPointerCapture(s.pointerId)
      } catch {
        /* ignore */
      }
      onStart?.({ dx, dy })
    }
    const dt = e.timeStamp - s.lastT || 16
    s.vx = (e.clientX - s.lastX) / dt
    s.vy = (e.clientY - s.lastY) / dt
    s.lastX = e.clientX
    s.lastY = e.clientY
    s.lastT = e.timeStamp
    onMove?.({ dx, dy, vx: s.vx, vy: s.vy, event: e })
  }

  const up = (e) => {
    const s = state.current
    // A secondary pointer lifting must not end the drag the primary is running.
    if (s && s.pointerId !== e.pointerId) return
    clearLP()
    state.current = null
    if (!s) return
    if (s.active) setDragging(false)
    onEnd?.({
      dx: e.clientX - s.x0,
      dy: e.clientY - s.y0,
      vx: s.vx,
      vy: s.vy,
      active: s.active,
      moved: s.moved,
      longPressed: s.longPressed,
      event: e,
    })
  }

  return {
    dragging,
    handlers: {
      onPointerDown: down,
      onPointerMove: move,
      onPointerUp: up,
      onPointerCancel: up,
    },
  }
}
