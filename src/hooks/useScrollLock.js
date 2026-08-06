import { useEffect } from 'react'

// Locks the page scroller while an overlay (modal/sheet/quick-find) is open so
// the content behind the backdrop can't scroll — the classic "scroll bleed"
// that instantly reads as non-native on iOS. The app's scroller is `.main`
// (a flex `overflow-y: auto` region), not the document, so we freeze that.
//
// Reference-counted via a module-level counter so stacked overlays (e.g. a
// form Modal opened from a Sheet) don't unlock prematurely — the scroller is
// only restored when the last overlay closes. Toggling `overflow` preserves
// scrollTop, so there's no jump on lock/unlock.
let locks = 0
let prevOverflow = ''

// Every overlay in the app (Modal, Sheet, ConfirmDialog, QuickFind, PeopleMap)
// takes a scroll lock, which makes this counter an accurate "is something
// covering the page right now" signal. useEdgeBack reads it so an edge swipe
// inside an open sheet doesn't navigate the page out from behind it.
export function overlaysOpen() {
  return locks > 0
}

export function useScrollLock() {
  useEffect(() => {
    const main = document.querySelector('.main')
    if (!main) return

    if (locks === 0) {
      prevOverflow = main.style.overflow
      main.style.overflow = 'hidden'
    }
    locks += 1

    return () => {
      locks -= 1
      if (locks === 0) main.style.overflow = prevOverflow
    }
  }, [])
}
