import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'react-feather'
import { useScrollLock } from '../../hooks/useScrollLock'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useVisualViewport } from '../../hooks/useVisualViewport'
import { DRAG_SLOP_PX, DRAG_EXEMPT_SELECTOR, swallowNextClick } from '../../lib/gestures'
import haptics from '../../lib/haptics'

// Reusable iOS bottom sheet with drag-to-dismiss. You can pull the sheet down
// from ANYWHERE on its body — not just the top grip — so it's reachable with a
// thumb wherever the sheet is resting. If the sheet is tall enough to scroll,
// the pull-to-dismiss engages only once its content is scrolled to the top, so
// dragging inside a scrolled list still scrolls. Release past a distance or
// velocity threshold to dismiss, else it springs back; tapping the backdrop
// also dismisses. (The editing Modal has its own mobile drag handling.)
//
// `side="right"` makes it a full-height drawer instead — the nav menu, opened
// from ☰ in the bottom bar's last slot. Same sheet, one axis over: it slides in
// from the right and you flick it back out the way it came.
//
// Right, not left, for two reasons. The button that opens it is at the bottom
// right, and a panel should come from the edge its control sits on. And the LEFT
// edge already belongs to useEdgeBack — a left drawer opened by an edge swipe
// would be fighting the back gesture for the same pixels.
//
// The drawer also carries an explicit close button, parked at the bottom right
// where the thumb that opened it already is. A grip at the top of a full-height
// panel is the one place a thumb can't reach.
const DISMISS_PX = 110 // travel before a release dismisses
const DISMISS_V = 0.5 // …or a flick this fast, away from the anchored edge (px/ms)

export default function Sheet({ title, onClose, children, side = 'bottom' }) {
  const drawer = side === 'right'
  const sheetRef = useRef(null)
  const drag = useRef(null)
  const backdropDown = useRef(false)
  const [y, setY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [closing, setClosing] = useState(false)
  // A short sheet keeps touch-action:none so the pointer drag owns the whole
  // body; only once the content overflows do we let the browser scroll it
  // (pan-y, via the .scrollable class). Measure after layout, and again on
  // resize/orientation change since that shifts what fits.
  const [scrollable, setScrollable] = useState(false)
  useScrollLock()
  useFocusTrap(sheetRef)
  // iOS doesn't shrink the layout viewport for the keyboard, so a bottom-anchored
  // sheet ends up behind it — the backfill note editor and the member picker both
  // sit in one. Clamping the overlay to the visual viewport rests the sheet on
  // top of the keyboard instead. Modal has always done this; Sheet hadn't.
  const viewport = useVisualViewport()

  // Escape closes, as it does in Modal. Without it a keyboard or switch-control
  // user can only leave a sheet by finding the backdrop.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useLayoutEffect(() => {
    const measure = () => {
      const el = sheetRef.current
      if (el) setScrollable(el.scrollHeight > el.clientHeight + 1)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [children])

  // Travel along the sheet's own axis: down for a bottom sheet, right for the
  // drawer. Everything below is written once in terms of "away from the edge
  // it's anchored to".
  const along = (e) => (drawer ? e.clientX : e.clientY)
  const span = () => (drawer ? window.innerWidth : window.innerHeight)

  const dismiss = () => {
    if (closing) return
    setClosing(true)
    haptics.light()
    setY(span())
    setTimeout(onClose, 220)
  }

  const onPointerDown = (e) => {
    if (closing || (e.pointerType === 'mouse' && e.button !== 0)) return
    if (!e.isPrimary) return
    // A text field owns its own drags: the sheet body is touch-action:none, so
    // without this, dragging to place a cursor in the habit note pulls the
    // sheet down and past 110px throws the note away.
    if (e.target.closest?.(DRAG_EXEMPT_SELECTOR)) return
    drag.current = {
      p0: along(e),
      cross0: drawer ? e.clientY : e.clientX,
      last: along(e),
      lastT: e.timeStamp,
      v: 0,
      active: false,
      pointerId: e.pointerId,
    }
  }

  const onPointerMove = (e) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    const dp = along(e) - d.p0
    if (!d.active) {
      // A drawer scrolls vertically, so the thing that must not be hijacked is
      // the scroll, not the drag: engage only once the gesture is clearly more
      // sideways than up-down. A bottom sheet has the mirror problem and uses
      // the scroll position instead — a downward pull that starts mid-list is
      // someone scrolling back to the top.
      const crossed = drawer
        ? dp > DRAG_SLOP_PX && dp > Math.abs(e.clientY - d.cross0)
        : dp > DRAG_SLOP_PX && (sheetRef.current?.scrollTop ?? 0) <= 0
      if (crossed) {
        d.active = true
        setDragging(true)
        try {
          sheetRef.current.setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      } else {
        return
      }
    }
    const dt = e.timeStamp - d.lastT || 16
    d.v = (along(e) - d.last) / dt
    d.last = along(e)
    d.lastT = e.timeStamp
    setY(Math.max(0, dp))
  }

  const onPointerUp = (e) => {
    const d = drag.current
    if (d && d.pointerId !== e.pointerId) return
    drag.current = null
    if (!d || !d.active) return
    setDragging(false)
    // A pull that lands on a tappable row mustn't also fire its click.
    swallowNextClick()
    const dp = along(e) - d.p0
    if (dp > DISMISS_PX || d.v > DISMISS_V) dismiss()
    else setY(0)
  }

  // Portal to <body> so the fixed overlay escapes any ancestor `transform`
  // (e.g. PullToRefresh), which would otherwise re-anchor it and trap it
  // behind the bottom tab bar.
  return createPortal(
    <div
      className={`sheet-overlay ${drawer ? 'side-right' : ''}`}
      style={{
        ...(viewport || {}),
        background: `rgba(0, 0, 0, ${0.4 * Math.max(0, 1 - y / (span() * 0.6))})`,
      }}
      // Dismiss on tap *release*, not on touch-down: a press that turns into a
      // drag shouldn't close the sheet out from under the finger. One pointer
      // pair also replaces the old mousedown+touchstart, which both fired on iOS.
      onPointerDown={(e) => {
        backdropDown.current = e.target === e.currentTarget
      }}
      onPointerUp={(e) => {
        if (backdropDown.current && e.target === e.currentTarget) onClose()
        backdropDown.current = false
      }}
    >
      <div
        ref={sheetRef}
        className={`sheet ${scrollable ? 'scrollable' : ''} ${drawer ? 'side-right' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          transform: drawer ? `translateX(${y}px)` : `translateY(${y}px)`,
          transition: dragging ? 'none' : 'transform 260ms cubic-bezier(0.32,0.72,0,1)',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {drawer ? (
          title && <div className="sheet-title">{title}</div>
        ) : (
          <div className="sheet-grip">
            <div className="sheet-handle" />
            {title && <div className="sheet-title">{title}</div>}
          </div>
        )}
        {children}
        {/* A footer band, not a floating button. It has to stay under the thumb
            that opened the drawer, which means sticking to the bottom of a
            panel whose list scrolls — and a translucent pill doing that let the
            rows pass underneath it. When the row in question is a red Logout,
            half-visible behind the button you're reaching for, "did I just
            press that?" is a fair question to have. So the band is opaque and
            content ends at its edge.

            Last in the DOM as well as in the layout: it's the final tab stop,
            not the first thing a screen reader meets. */}
        {drawer && (
          <div className="sheet-foot">
            <button className="sheet-close" onClick={dismiss}>
              <X size={18} aria-hidden="true" />
              Close menu
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
