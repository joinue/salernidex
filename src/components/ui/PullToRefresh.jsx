import { useRef, useState } from 'react'
import { RefreshCw } from 'react-feather'
import haptics from '../../lib/haptics'

const THRESHOLD = 64 // px pulled before a release triggers refresh
const MAX = 96
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// Pull-to-refresh for the main scroll area. Engages only when the scroller is
// at the very top AND the finger moves down, so normal scrolling is never
// stolen. Damped travel + a spinner that arms past the threshold. `onRefresh`
// runs on release; a small floor keeps the spinner from flashing in demo mode.
export default function PullToRefresh({ onRefresh, children }) {
  const rootRef = useRef(null)
  const drag = useRef(null)
  const [pull, setPull] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const scroller = () => rootRef.current?.closest('.main')

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' || refreshing) return
    drag.current = { y0: e.clientY, engaged: false, armed: false }
  }

  const onPointerMove = (e) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.y0
    if (!d.engaged) {
      const sc = scroller()
      if (dy > 6 && sc && sc.scrollTop <= 0) {
        d.engaged = true
        setDragging(true)
        try {
          rootRef.current.setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      } else {
        return
      }
    }
    if (dy <= 0) {
      // pulled back up past the top — hand control back to the scroller
      d.engaged = false
      setDragging(false)
      setPull(0)
      drag.current = { y0: e.clientY, engaged: false, armed: false }
      return
    }
    const damped = Math.min(MAX, dy * 0.5)
    setPull(damped)
    if (damped >= THRESHOLD && !d.armed) {
      d.armed = true
      haptics.light()
    } else if (damped < THRESHOLD && d.armed) {
      d.armed = false
    }
  }

  const onPointerUp = async () => {
    const d = drag.current
    drag.current = null
    if (!d || !d.engaged) return
    setDragging(false)
    if (d.armed) {
      setRefreshing(true)
      setPull(THRESHOLD)
      haptics.success()
      try {
        await Promise.all([onRefresh?.(), wait(600)])
      } finally {
        setRefreshing(false)
        setPull(0)
      }
    } else {
      setPull(0)
    }
  }

  const progress = Math.min(1, pull / THRESHOLD)

  return (
    <div
      ref={rootRef}
      className="ptr"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="ptr-indicator" style={{ height: pull, opacity: progress }}>
        <RefreshCw
          size={20}
          className={refreshing ? 'ptr-spin' : ''}
          style={{ transform: refreshing ? undefined : `rotate(${progress * 270}deg)` }}
        />
      </div>
      <div
        className="ptr-content"
        style={{
          // only apply a transform while actually pulling — a permanent
          // transform would re-anchor fixed-position sheets/modals to this box
          transform: pull ? `translateY(${pull}px)` : undefined,
          transition: dragging ? 'none' : 'transform 280ms cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
