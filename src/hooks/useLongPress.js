import { useRef } from 'react'
import haptics from '../lib/haptics'
import { LONG_PRESS_MS, LONG_PRESS_MOVE_PX } from '../lib/gestures'

// Long-press for elements that are NOT inside a SwipeRow (which gets long-press
// via useDrag). Fires after `delay` ms of a stationary touch; cancels on move
// or early release, and suppresses the click that would otherwise follow so a
// long-press doesn't also navigate. Touch-only (mouse is excluded).
export function useLongPress(
  onLongPress,
  { delay = LONG_PRESS_MS, moveTolerance = LONG_PRESS_MOVE_PX } = {},
) {
  const timer = useRef(null)
  const start = useRef(null)
  const fired = useRef(false)

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse') return
    start.current = { x: e.clientX, y: e.clientY }
    fired.current = false
    timer.current = setTimeout(() => {
      fired.current = true
      haptics.medium()
      onLongPress({ x: start.current.x, y: start.current.y })
    }, delay)
  }

  const onPointerMove = (e) => {
    if (!start.current) return
    if (
      Math.abs(e.clientX - start.current.x) > moveTolerance ||
      Math.abs(e.clientY - start.current.y) > moveTolerance
    ) {
      clear()
    }
  }

  const onPointerUp = () => clear()

  const onClickCapture = (e) => {
    if (fired.current) {
      e.preventDefault()
      e.stopPropagation()
      fired.current = false
    }
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClickCapture }
}
