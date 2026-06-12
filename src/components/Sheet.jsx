import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useDrag } from '../hooks/useDrag'
import haptics from '../lib/haptics'

// Reusable iOS bottom sheet with drag-to-dismiss. Drag the grip (handle +
// title) down; release past a distance/velocity threshold to dismiss, else it
// springs back. Tapping the backdrop also dismisses. Used for menus and
// action sheets; the editing Modal has its own mobile drag handling.
export default function Sheet({ title, onClose, children }) {
  const [y, setY] = useState(0)
  const [closing, setClosing] = useState(false)

  const dismiss = () => {
    if (closing) return
    setClosing(true)
    haptics.light()
    setY(window.innerHeight)
    setTimeout(onClose, 220)
  }

  const { dragging, handlers } = useDrag({
    axis: 'y',
    onMove: ({ dy }) => setY(Math.max(0, dy)),
    onEnd: ({ dy, vy }) => {
      if (dy > 110 || vy > 0.5) dismiss()
      else setY(0)
    },
  })

  // Portal to <body> so the fixed overlay escapes any ancestor `transform`
  // (e.g. PullToRefresh), which would otherwise re-anchor it and trap it
  // behind the bottom tab bar.
  return createPortal(
    <div
      className="sheet-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="sheet"
        role="dialog"
        aria-label={title}
        style={{
          transform: `translateY(${y}px)`,
          transition: dragging ? 'none' : 'transform 260ms cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        <div className="sheet-grip" {...handlers}>
          <div className="sheet-handle" />
          {title && <div className="sheet-title">{title}</div>}
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}
