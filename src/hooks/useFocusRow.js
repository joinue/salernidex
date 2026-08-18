import { useCallback, useEffect, useRef, useState } from 'react'

// Arriving at a list from somewhere that named one row — Today, the activity
// feed, Quick Find — and being dropped at the top of the page is barely better
// than not being taken anywhere: on a page of forty tasks you now hunt for the
// thing you just tapped. This scrolls that row into view and marks it for a
// couple of seconds, so "which one did I come here for" is answered on screen
// rather than from memory.
//
// It's a hook rather than a per-page effect because the answer has to be the
// same on Tasks and on Reminders — two pages that land you on a row in two
// slightly different ways is how the gesture stops being learnable.
//
// Returns a props factory: spread `focus(id)` onto a row (or hand it to
// SwipeRow's `focus` prop) and the row whose id matches the target gets the ref
// and the class. Every other row gets an inert object.
const NONE = { ref: undefined, className: '' }

export default function useFocusRow(focusId, { hold = 2000 } = {}) {
  const [lit, setLit] = useState(false)
  // Which id we've already scrolled to. Rows remount constantly here — a filter
  // changes, a fold opens, a sibling task is checked off — and scrolling on
  // every remount would yank the page back to this row long after you'd moved
  // on to reading somewhere else.
  const landed = useRef(null)

  useEffect(() => {
    if (!focusId) return
    setLit(true)
    const t = setTimeout(() => setLit(false), hold)
    return () => clearTimeout(t)
  }, [focusId, hold])

  const attach = useCallback(
    (node) => {
      if (!node || !focusId || landed.current === focusId) return
      landed.current = focusId
      // Next frame: sections above this row may still be opening (the "No area"
      // fold, a relaxed filter re-rendering the list), and measuring before they
      // settle lands us short of the row we promised to land on.
      requestAnimationFrame(() => {
        node.scrollIntoView?.({
          block: 'center',
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
            ? 'auto'
            : 'smooth',
        })
      })
    },
    [focusId],
  )

  return (id) =>
    id && id === focusId ? { ref: attach, className: `row-focus${lit ? ' lit' : ''}` } : NONE
}
