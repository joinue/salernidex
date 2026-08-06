import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useScrollLock } from '../../hooks/useScrollLock'
import { useFocusTrap } from '../../hooks/useFocusTrap'

// Centered "are you sure" alert (iOS UIAlertController style). Reusable for any
// destructive confirm. `danger` tints the confirm button red. Cancel is the
// quiet default; the overlay and Escape both cancel.
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}) {
  useScrollLock()
  // A confirm usually opens *over* another sheet, so trapping here matters
  // most: without it Tab leaves the alert and lands back in the form behind it.
  const dialogRef = useRef(null)
  useFocusTrap(dialogRef)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return createPortal(
    <div
      className="confirm-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2 className="confirm-title">{title}</h2>
        {message && <p className="confirm-message">{message}</p>}
        <div className="confirm-actions">
          <button className="confirm-btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`confirm-btn ${danger ? 'danger' : 'primary'}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
