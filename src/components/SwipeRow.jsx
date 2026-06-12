import { useEffect, useRef, useState } from 'react'
import { useDrag } from '../hooks/useDrag'
import haptics from '../lib/haptics'

// iOS swipe-to-reveal row, built on the shared useDrag pipeline. Swipe left to
// expose trailing actions; flick respects velocity; opening one row auto-closes
// any other open row. On non-touch devices the actions surface on hover (CSS).
// `onLongPress` (optional) fires a press-and-hold without a separate listener.
// A tap that didn't drag falls through to `onClick`.
const CLOSE_EVENT = 'swiperow-close-others'
let nextId = 0

export default function SwipeRow({ actions = [], onClick, onLongPress, children }) {
  const idRef = useRef(++nextId)
  const [offset, setOffset] = useState(0)
  const offsetRef = useRef(0)
  const startRef = useRef(0)
  const openRef = useRef(false)
  const suppressClick = useRef(false)

  const openWidth = Math.min(actions.length * 76, 228)

  const set = (v) => {
    offsetRef.current = v
    setOffset(v)
  }

  // close this row when another opens
  useEffect(() => {
    const onOther = (e) => {
      if (e.detail !== idRef.current) {
        openRef.current = false
        set(0)
      }
    }
    window.addEventListener(CLOSE_EVENT, onOther)
    return () => window.removeEventListener(CLOSE_EVENT, onOther)
  }, [])

  const snap = (open) => {
    if (open) window.dispatchEvent(new CustomEvent(CLOSE_EVENT, { detail: idRef.current }))
    if (open !== openRef.current) haptics.light()
    openRef.current = open
    set(open ? -openWidth : 0)
  }

  const { dragging, handlers } = useDrag({
    axis: 'x',
    onLongPress: onLongPress ? () => { suppressClick.current = true; onLongPress() } : undefined,
    onStart: () => {
      startRef.current = offsetRef.current
    },
    onMove: ({ dx }) => {
      const next = Math.min(0, Math.max(-openWidth - 28, startRef.current + dx))
      set(next)
    },
    onEnd: ({ vx, moved, longPressed }) => {
      if (longPressed) {
        snap(false)
        return
      }
      if (moved) suppressClick.current = true
      // velocity-aware: a clear flick wins; otherwise snap to nearest
      const open = vx < -0.35 ? true : vx > 0.35 ? false : offsetRef.current < -openWidth / 2
      snap(open)
    },
  })

  const handleClick = (e) => {
    if (suppressClick.current || offsetRef.current !== 0) {
      e.preventDefault()
      suppressClick.current = false
      snap(false)
      return
    }
    onClick?.(e)
  }

  return (
    <div className={`swipe-wrap ${offset ? 'open' : ''}`}>
      <div className="swipe-actions" style={{ width: openWidth }}>
        {actions.map((a) => (
          <button
            key={a.label}
            className={`swipe-action ${a.variant || ''}`}
            onClick={(e) => {
              e.stopPropagation()
              snap(false)
              a.onClick()
            }}
            aria-label={a.label}
          >
            {a.icon && <a.icon size={18} />}
            <span>{a.label}</span>
          </button>
        ))}
      </div>
      <div
        className="swipe-content"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 280ms cubic-bezier(0.32,0.72,0,1)',
        }}
        {...handlers}
        onClick={handleClick}
      >
        {children}
      </div>
    </div>
  )
}
