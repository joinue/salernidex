import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'react-feather'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useDrag } from '../hooks/useDrag'
import haptics from '../lib/haptics'

// Editing surface: a right-side sheet on desktop, a bottom sheet on mobile.
// On mobile it gains a drag handle for drag-to-dismiss (the native pattern:
// drag from the top grip while the body still scrolls underneath).
export default function Modal({ title, onClose, children }) {
  const isMobile = useMediaQuery('(max-width: 720px)')
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
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
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
        {isMobile && (
          <div className="modal-grip" {...handlers}>
            <div className="sheet-handle" />
          </div>
        )}
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}
