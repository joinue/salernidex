import { useEffect } from 'react'

// Hold a screen wake lock while `active`, so a display propped on the counter
// doesn't dim thirty seconds after you walk away. That is the entire point of
// the board, and it's the one thing a web page genuinely cannot fake.
//
// Three facts the implementation is shaped around:
//
//   - The API doesn't exist on iOS Safari before 16.4, and never in a non-
//     secure context. Absence is normal, not an error: the board still works,
//     the screen just sleeps on the OS timer.
//   - The browser drops the lock whenever the tab is hidden, and does NOT give
//     it back on return. Re-acquiring on `visibilitychange` is required, or the
//     lock survives exactly one trip to another app.
//   - request() rejects (NotAllowedError) when the OS is in low-power mode or
//     the document isn't visible. That's an expected outcome, so it's swallowed
//     rather than surfaced — there's nothing the user could usefully do.
export function useWakeLock(active) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return

    let sentinel = null
    // Guards the async gap: an acquire in flight when the effect tears down
    // must release rather than leak a lock the board no longer wants.
    let cancelled = false

    const acquire = async () => {
      if (cancelled || document.hidden || sentinel) return
      try {
        sentinel = await navigator.wakeLock.request('screen')
        if (cancelled) {
          sentinel.release()
          sentinel = null
          return
        }
        // The browser can revoke at any time (low battery). Clear our handle so
        // the next visibility change re-requests instead of assuming it holds.
        sentinel.addEventListener('release', () => {
          sentinel = null
        })
      } catch {
        sentinel = null
      }
    }

    const onVisible = () => {
      if (!document.hidden) acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      sentinel?.release().catch(() => {})
      sentinel = null
    }
  }, [active])
}
