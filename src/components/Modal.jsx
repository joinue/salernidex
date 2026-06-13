import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'react-feather'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useVisualViewport } from '../hooks/useVisualViewport'
import { useScrollLock } from '../hooks/useScrollLock'
import { useDrag } from '../hooks/useDrag'
import haptics from '../lib/haptics'

// Editing surface: a right-side sheet on desktop, a bottom sheet on mobile.
// On mobile it gains a drag handle for drag-to-dismiss (the native pattern:
// drag from the top grip while the body still scrolls underneath).
export default function Modal({ title, onClose, children }) {
  const isMobile = useMediaQuery('(max-width: 720px)')
  const viewport = useVisualViewport()
  useScrollLock()
  const [y, setY] = useState(0)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const dismiss = () => {
    if (closing) return
    setClosing(true)
    haptics.light()
    setY(window.innerHeight)
    setTimeout(onClose, 240)
  }

  const { dragging, handlers } = useDrag({
    axis: 'y',
    enabled: isMobile,
    onMove: ({ dy }) => setY(Math.max(0, dy)),
    onEnd: ({ dy, vy }) => {
      if (dy > 120 || vy > 0.5) dismiss()
      else setY(0)
    },
  })

  return createPortal(
    <div
      className="modal-overlay"
      style={
        isMobile
          ? {
              ...(viewport || {}),
              // Dim the backdrop in step with the drag, like a native sheet.
              background: `rgba(0, 0, 0, ${0.4 * Math.max(0, 1 - y / (window.innerHeight * 0.6))})`,
            }
          : undefined
      }
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal"
        role="dialog"
        aria-label={title}
        style={
          isMobile
            ? {
                transform: `translateY(${y}px)`,
                transition: dragging ? 'none' : 'transform 260ms cubic-bezier(0.32,0.72,0,1)',
              }
            : undefined
        }
      >
        {/* On mobile the grip + header is one drag-to-dismiss region, so you
            can pull the sheet down by its visible top, not just the thin grip. */}
        <div className="modal-top" {...(isMobile ? handlers : {})}>
          {isMobile && (
            <div className="modal-grip">
              <div className="sheet-handle" />
            </div>
          )}
          <div className="modal-header">
            <h2 className="modal-title">{title}</h2>
            <button
              className="modal-close"
              onClick={onClose}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
