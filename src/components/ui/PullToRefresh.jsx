import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'react-feather'
import haptics from '../../lib/haptics'
import { swallowNextClick } from '../../lib/gestures'
import { scrollTop } from '../../lib/scroller'

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

  // `.main` is the scrollport on desktop; on a phone the document scrolls and
  // this element never moves. scrollTop() reads whichever is live — the pull
  // must only engage from a genuine top-of-page, either way.
  const atTop = () => scrollTop(rootRef.current?.closest('.main')) <= 0

  // `.main` is touch-action:pan-y, so the browser also treats a downward drag at
  // the top as a pan it might claim — and once it claims one it fires
  // pointercancel and our pull dies mid-gesture. On a phone the document is the
  // scroller, which makes this the same fight against the page's own overscroll.
  // Suppressing touchmove while engaged keeps the gesture ours either way. It
  // has to be a native non-passive listener:
  // React registers touchmove passively at the root, where preventDefault is a
  // silent no-op.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const onTouchMove = (e) => {
      if (drag.current?.engaged) e.preventDefault()
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [])

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' || refreshing) return
    if (!e.isPrimary) return
    drag.current = { y0: e.clientY, engaged: false, armed: false, pointerId: e.pointerId }
  }

  const onPointerMove = (e) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    const dy = e.clientY - d.y0
    if (!d.engaged) {
      if (dy > 6 && atTop()) {
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
      drag.current = { y0: e.clientY, engaged: false, armed: false, pointerId: e.pointerId }
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

  const onPointerUp = async (e) => {
    const d = drag.current
    if (d && d.pointerId !== e.pointerId) return
    drag.current = null
    if (!d || !d.engaged) return
    setDragging(false)
    // The pull started on top of something tappable — usually a list row. A
    // short pull that doesn't reach the threshold ends where it began, so
    // without this the browser follows it with a click and the row navigates.
    swallowNextClick()
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
