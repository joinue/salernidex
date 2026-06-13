// App-wide toast bus. Anything — including non-React code like useData's
// background sync — can raise a toast; the single <Toasts /> in the Shell
// listens and renders. Mirrors the CustomEvent pattern SwipeRow uses for
// cross-row coordination, so there's no context plumbing.
const TOAST_EVENT = 'app-toast'
let nextId = 0

// showToast('Task deleted', { actionLabel: 'Undo', onAction: () => ... })
// variant: undefined (neutral dark pill) | 'error'
export function showToast(message, { actionLabel, onAction, duration = 5000, variant } = {}) {
  window.dispatchEvent(
    new CustomEvent(TOAST_EVENT, {
      detail: { id: ++nextId, message, actionLabel, onAction, duration, variant },
    }),
  )
}

export { TOAST_EVENT }
