import { useRef, useState } from 'react'
import haptics from '../../lib/haptics'
import { LONG_PRESS_MS, DRAG_SLOP_PX, REORDER_CANCEL_PX } from '../../lib/gestures'

// Drag-to-reorder wrapper for grouped-inset lists.
//
// Lift affordance matches the platform:
//  - touch: long-press (LONG_PRESS_MS, with haptic) lifts the row, then drag; moving
//    before the timer fires bows out so scrolling and swipe-rows keep working
//  - mouse: press and drag vertically a few px (a plain click stays a click)
//
// While lifted we stop pointer/touch propagation so ancestors (pull-to-
// refresh, edge-back) don't also interpret the gesture, and preventDefault
// touchmove so the page doesn't scroll under the drag.
//
// onMove(fromIndex, toIndex) commits when the drop actually moved the row;
// pair it with moveUpdates() from lib/order.js to persist.
export default function ReorderableList({ items, onMove, renderItem, className = 'list' }) {
  const wrapRef = useRef(null)
  const rowRefs = useRef(new Map())
  const sess = useRef(null)
  const [drag, setDrag] = useState(null) // { id, from, to, dy, h }

  const setRowRef = (id) => (el) => {
    if (el) rowRefs.current.set(id, el)
    else rowRefs.current.delete(id)
  }

  const lift = (index, anchorY, pointerId) => {
    const rects = items.map((it) => {
      const r = rowRefs.current.get(it.id).getBoundingClientRect()
      return { top: r.top, h: r.height, mid: r.top + r.height / 2 }
    })
    sess.current = { ...sess.current, lifted: true, index, to: index, anchorY, rects }
    haptics.medium()
    const rowEl = rowRefs.current.get(items[index].id)
    try {
      rowEl.setPointerCapture(pointerId)
    } catch {
      /* ignore */
    }
    setDrag({ id: items[index].id, from: index, to: index, dy: 0, h: rects[index].h })
  }

  const moveTo = (y) => {
    const s = sess.current
    if (!s?.lifted) return
    const dy = y - s.anchorY
    const center = s.rects[s.index].mid + dy
    let to = 0
    s.rects.forEach((r, i) => {
      if (i !== s.index && r.mid < center) to++
    })
    if (to !== s.to) haptics.light()
    s.to = to
    setDrag((d) => (d ? { ...d, dy, to } : d))
  }

  const start = (e, index) => {
    if (items.length < 2) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // buttons/inputs own their taps (checkboxes, swipe actions, fields)
    if (e.target.closest('button, input, textarea, select, a')) return

    const isTouch = e.pointerType !== 'mouse'
    const x0 = e.clientX
    const y0 = e.clientY
    const pointerId = e.pointerId
    const wrap = wrapRef.current
    let lpTimer = null

    const cleanup = () => {
      if (lpTimer) clearTimeout(lpTimer)
      wrap.removeEventListener('pointermove', onMoveEv)
      wrap.removeEventListener('pointerup', onUpEv)
      wrap.removeEventListener('pointercancel', onUpEv)
      wrap.removeEventListener('touchmove', onTouchMoveEv)
      sess.current = null
    }

    const onMoveEv = (ev) => {
      const s = sess.current
      if (!s) return
      if (!s.lifted) {
        const dx = ev.clientX - x0
        const dy = ev.clientY - y0
        if (isTouch) {
          // moved before the long-press armed → it's a scroll or a swipe
          if (Math.abs(dx) > REORDER_CANCEL_PX || Math.abs(dy) > REORDER_CANCEL_PX) cleanup()
          return
        }
        if (Math.abs(dy) > DRAG_SLOP_PX && Math.abs(dy) > Math.abs(dx)) {
          lift(index, ev.clientY, pointerId)
        } else if (Math.abs(dx) > REORDER_CANCEL_PX) {
          cleanup()
        }
        return
      }
      // lifted: this gesture is ours alone
      ev.stopPropagation()
      moveTo(ev.clientY)
    }

    const onTouchMoveEv = (ev) => {
      if (sess.current?.lifted) {
        ev.preventDefault() // keep the page from scrolling under the drag
        ev.stopPropagation()
      }
    }

    const onUpEv = () => {
      const s = sess.current
      const didDrag = s?.lifted
      const from = s?.index
      const to = s?.to
      cleanup()
      setDrag(null)
      if (!didDrag) return
      // a drag mustn't end as a click on the row underneath
      const swallow = (ce) => {
        ce.stopPropagation()
        ce.preventDefault()
      }
      window.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 80)
      if (to !== from) {
        haptics.success()
        onMove(from, to)
      }
    }

    sess.current = { lifted: false }
    wrap.addEventListener('pointermove', onMoveEv)
    wrap.addEventListener('pointerup', onUpEv)
    wrap.addEventListener('pointercancel', onUpEv)
    if (isTouch) {
      wrap.addEventListener('touchmove', onTouchMoveEv, { passive: false })
      lpTimer = setTimeout(() => {
        if (sess.current && !sess.current.lifted) lift(index, y0, pointerId)
      }, LONG_PRESS_MS)
    }
  }

  return (
    <div className={className} ref={wrapRef}>
      {items.map((it, i) => {
        let style
        let lifted = false
        if (drag) {
          if (it.id === drag.id) {
            lifted = true
            style = { transform: `translateY(${drag.dy}px) scale(1.02)` }
          } else {
            let shift = 0
            if (drag.from < drag.to && i > drag.from && i <= drag.to) shift = -drag.h
            else if (drag.to < drag.from && i >= drag.to && i < drag.from) shift = drag.h
            style = {
              transform: shift ? `translateY(${shift}px)` : 'none',
              transition: 'transform 200ms ease',
            }
          }
        }
        return (
          <div
            key={it.id}
            ref={setRowRef(it.id)}
            className={`reorder-row ${lifted ? 'lifted' : ''}`}
            style={style}
            onPointerDown={(e) => start(e, i)}
          >
            {renderItem(it, i)}
          </div>
        )
      })}
    </div>
  )
}
