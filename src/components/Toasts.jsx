import { useEffect, useRef, useState } from 'react'
import { TOAST_EVENT } from '../lib/toast'
import haptics from '../lib/haptics'

// Renders toasts raised via showToast(). One at a time keeps it calm — a new
// toast replaces the current one (its action, usually Undo, expires with it).
export default function Toasts() {
  const [toast, setToast] = useState(null)
  const [leaving, setLeaving] = useState(false)
  const timers = useRef([])

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  useEffect(() => {
    const onToast = (e) => {
      clearTimers()
      setLeaving(false)
      setToast(e.detail)
      timers.current.push(
        setTimeout(() => setLeaving(true), e.detail.duration - 200),
        setTimeout(() => setToast(null), e.detail.duration)
      )
    }
    window.addEventListener(TOAST_EVENT, onToast)
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast)
      clearTimers()
    }
  }, [])

  if (!toast) return null

  const act = () => {
    haptics.light()
    clearTimers()
    setToast(null)
    toast.onAction?.()
  }

  return (
    <div className="toasts" role="status" aria-live="polite">
      <div className={`toast ${toast.variant || ''} ${leaving ? 'leaving' : ''}`}>
        <span className="toast-msg">{toast.message}</span>
        {toast.actionLabel && (
          <button className="toast-action" onClick={act}>
            {toast.actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}
