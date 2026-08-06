import { useEffect, useRef, useState } from 'react'
import { useDrag } from '../../hooks/useDrag'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import haptics from '../../lib/haptics'

// iOS swipe-to-reveal row, built on the shared useDrag pipeline. Swipe left to
// expose trailing actions; flick respects velocity; opening one row auto-closes
// any other open row. `onLongPress` (optional) fires a press-and-hold without a
// separate listener. A tap that didn't drag falls through to `onClick`.
//
// Mouse users never discover sideways-dragging — on fine-pointer devices the
// same actions surface as a compact icon cluster on hover instead, and drag
// handling is disabled so rows can't be smeared around by accident. A hybrid
// (touchscreen laptop, iPad with a keyboard) reports BOTH a fine pointer and a
// coarse one, so it gets the cluster *and* keeps the swipe: capability is
// additive, and asking `matchMedia` once at module load couldn't see either
// change anyway.
//
// The cluster is also the accessible representation of the actions, on every
// device. The swipe-revealed buttons can't be it: they're visibility:hidden
// until the row opens, which takes them out of the tab order and the
// accessibility tree, so a VoiceOver user — who cannot perform the swipe —
// had no route to Edit or Delete at all.
const CLOSE_EVENT = 'swiperow-close-others'
let nextId = 0

export default function SwipeRow({ actions = [], onClick, onLongPress, label, children }) {
  const finePointer = useMediaQuery('(hover: hover) and (pointer: fine)')
  const coarsePointer = useMediaQuery('(any-pointer: coarse)')
  const swipeEnabled = !finePointer || coarsePointer
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
    onLongPress: onLongPress
      ? () => {
          suppressClick.current = true
          onLongPress()
        }
      : undefined,
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
      {/* Hidden from assistive tech: these duplicate the always-present cluster
          below, which is the accessible path. Sighted users tap them directly
          after swiping, so they need no name of their own. */}
      <div className="swipe-actions" style={{ width: openWidth }} aria-hidden="true">
        {actions.map((a) => (
          <button
            key={a.label}
            className={`swipe-action ${a.variant || ''}`}
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation()
              snap(false)
              a.onClick()
            }}
          >
            {a.icon && <a.icon size={18} />}
            <span>{a.label}</span>
          </button>
        ))}
      </div>
      <div
        className="swipe-content"
        style={{
          // No transform at rest: an always-on translateX(0) keeps every row
          // on its own compositing layer, and layer snapping at fractional row
          // heights randomly clips the 0.5px divider (visible at 1x DPR).
          transform: offset ? `translateX(${offset}px)` : undefined,
          transition: dragging ? 'none' : 'transform 280ms cubic-bezier(0.32,0.72,0,1)',
        }}
        {...(swipeEnabled ? handlers : {})}
        onClick={handleClick}
      >
        {children}
        {actions.length > 0 && (
          <div className={`row-hover-actions ${finePointer ? '' : 'sr-only'}`}>
            {actions.map((a) => (
              <button
                key={a.label}
                className={`icon-btn ${a.variant || ''}`}
                title={a.label}
                // Name the row, not just the verb: a screen reader moving down
                // a list otherwise hears "Delete" forty times with no subject.
                aria-label={label ? `${a.label} ${label}` : a.label}
                onClick={(e) => {
                  e.stopPropagation()
                  a.onClick()
                }}
              >
                {a.icon && <a.icon size={16} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
