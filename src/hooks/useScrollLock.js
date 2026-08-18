import { useEffect, useSyncExternalStore } from 'react'
import { freezeScroll } from '../lib/scroller'

// Locks the page scroller while an overlay (modal/sheet/quick-find) is open so
// the content behind the backdrop can't scroll — the classic "scroll bleed"
// that instantly reads as non-native on iOS. Which box has to be frozen depends
// on the shell (`.main` on desktop, the document on a phone), so the mechanism
// lives in lib/scroller and this hook only owns the counting.
//
// Reference-counted via a module-level counter so stacked overlays (e.g. a
// form Modal opened from a Sheet) don't unlock prematurely — the scroller is
// only restored when the last overlay closes. The release closure is kept
// alongside the counter rather than recomputed: it captures the scroll offset
// to put back, and a resize across the breakpoint mid-overlay must not leave
// the page pinned by a lock nobody can undo.
let locks = 0
let release = null
const listeners = new Set()

// Every overlay in the app (Modal, Sheet, ConfirmDialog, QuickFind, PeopleMap)
// takes a scroll lock, which makes this counter an accurate "is something
// covering the page right now" signal. useEdgeBack reads it so an edge swipe
// inside an open sheet doesn't navigate the page out from behind it.
export function overlaysOpen() {
  return locks > 0
}

function subscribeOverlays(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Notify only when the ANSWER changes, not on every lock — a Modal opened from
// a Sheet takes a second lock, and nothing watching should hear about it.
function announce(before) {
  if (locks > 0 !== before) for (const fn of listeners) fn()
}

// The same signal as a hook, for chrome that has to stand down while the page
// is covered. The tab bar is the one that needs it, and the reason is the lock
// itself rather than the overlay: freezing the document (lib/scroller pins the
// body on a phone) takes away the page's scrollability, and browsers answer
// that by changing the very things a bottom-anchored pill is measured against —
// iOS Safari brings its toolbar back, which flips env(safe-area-inset-bottom),
// and a desktop window narrow enough to be on the phone shell loses its
// scrollbar and widens. Either way the pill moves while a sheet is open.
//
// It can't be held still — the viewport really did change — so it isn't
// painted instead. Nothing is lost: it sits under a modal backdrop, inert and
// unreachable, for exactly as long as this is true. The right-hand nav drawer
// is what made this visible (it covers 310px of the screen and leaves the pill
// in plain sight behind the scrim); the bottom sheets and modals were doing the
// same thing all along with their own backdrops over the evidence.
export function useOverlayOpen() {
  return useSyncExternalStore(subscribeOverlays, overlaysOpen, () => false)
}

export function useScrollLock() {
  useEffect(() => {
    const before = overlaysOpen()
    if (locks === 0) release = freezeScroll(document.querySelector('.main'))
    locks += 1
    announce(before)

    return () => {
      const was = overlaysOpen()
      locks -= 1
      if (locks === 0) {
        release?.()
        release = null
      }
      announce(was)
    }
  }, [])
}
