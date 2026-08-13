import { useEffect } from 'react'
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

// Every overlay in the app (Modal, Sheet, ConfirmDialog, QuickFind, PeopleMap)
// takes a scroll lock, which makes this counter an accurate "is something
// covering the page right now" signal. useEdgeBack reads it so an edge swipe
// inside an open sheet doesn't navigate the page out from behind it.
export function overlaysOpen() {
  return locks > 0
}

export function useScrollLock() {
  useEffect(() => {
    if (locks === 0) release = freezeScroll(document.querySelector('.main'))
    locks += 1

    return () => {
      locks -= 1
      if (locks === 0) {
        release?.()
        release = null
      }
    }
  }, [])
}
