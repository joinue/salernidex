import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useScrollLock } from '../hooks/useScrollLock'
import { DRAG_SLOP_PX } from '../lib/gestures'
import haptics from '../lib/haptics'

// Reusable iOS bottom sheet with drag-to-dismiss. You can pull the sheet down
// from ANYWHERE on its body — not just the top grip — so it's reachable with a
// thumb wherever the sheet is resting. If the sheet is tall enough to scroll,
// the pull-to-dismiss engages only once its content is scrolled to the top, so
// dragging inside a scrolled list still scrolls. Release past a distance or
// velocity threshold to dismiss, else it springs back; tapping the backdrop
// also dismisses. (The editing Modal has its own mobile drag handling.)
const DISMISS_PX = 110 // travel before a release dismisses
const DISMISS_VY = 0.5 // …or a downward flick this fast (px/ms)

export default function Sheet({ title, onClose, children }) {
  const sheetRef = useRef(null)
  const drag = useRef(null)
  const [y, setY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [closing, setClosing] = useState(false)
  useScrollLock()

  const dismiss = () => {
    if (closing) return
    setClosing(true)
    haptics.light()
    setY(window.innerHeight)
    setTimeout(onClose, 220)
  }

  const onPointerDown = (e) => {
    if (closing || (e.pointerType === 'mouse' && e.button !== 0)) return
    drag.current = { y0: e.clientY, lastY: e.clientY, lastT: e.timeStamp, vy: 0, active: false }
  }

  const onPointerMove = (e) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.y0
    if (!d.active) {
      // Engage only on a downward pull that begins at the top of the sheet's
      // scroll — otherwise it's a normal scroll, so leave it to the browser.
      if (dy > DRAG_SLOP_PX && (sheetRef.current?.scrollTop ?? 0) <= 0) {
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
    d.vy = (e.clientY - d.lastY) / dt
    d.lastY = e.clientY
    d.lastT = e.timeStamp
    setY(Math.max(0, dy))
  }

  const onPointerUp = (e) => {
    const d = drag.current
    drag.current = null
    if (!d || !d.active) return
    setDragging(false)
    // A pull that lands on a tappable row mustn't also fire its click.
    const swallow = (ce) => {
      ce.stopPropagation()
      ce.preventDefault()
    }
    window.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 80)
    const dy = e.clientY - d.y0
    if (dy > DISMISS_PX || d.vy > DISMISS_VY) dismiss()
    else setY(0)
  }

  // Portal to <body> so the fixed overlay escapes any ancestor `transform`
  // (e.g. PullToRefresh), which would otherwise re-anchor it and trap it
  // behind the bottom tab bar.
  return createPortal(
    <div
      className="sheet-overlay"
      style={{
        background: `rgba(0, 0, 0, ${0.4 * Math.max(0, 1 - y / (window.innerHeight * 0.6))})`,
      }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-label={title}
        style={{
          transform: `translateY(${y}px)`,
          transition: dragging ? 'none' : 'transform 260ms cubic-bezier(0.32,0.72,0,1)',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="sheet-grip">
          <div className="sheet-handle" />
          {title && <div className="sheet-title">{title}</div>}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
