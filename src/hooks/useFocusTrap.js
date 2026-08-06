import { useEffect, useRef } from 'react'

// Keeps keyboard focus inside an open overlay, and hands it back where it came
// from on close.
//
// Without this, `role="dialog"` is a label and nothing more: Tab walks straight
// out of the sheet and into the page behind it, so a keyboard or screen-reader
// user ends up operating a screen they can't see while a modal sits over it.
// Pair it with `aria-modal="true"` on the dialog element — the attribute tells
// AT the rest of the page is inert, and this makes that actually true.
//
// Reference-counted like useScrollLock: with stacked overlays (a Modal opened
// from a Sheet) only the innermost one traps, so the outer sheet doesn't fight
// it for focus.
let depth = 0

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusable(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter(
    // offsetParent is null for display:none; a zero-size box is a visually
    // hidden control that shouldn't take a tab stop either.
    (el) => el.offsetParent !== null || el.getClientRects().length > 0,
  )
}

export function useFocusTrap(ref, { enabled = true } = {}) {
  const restoreTo = useRef(null)

  useEffect(() => {
    const root = ref.current
    if (!enabled || !root) return

    restoreTo.current = document.activeElement
    const myDepth = ++depth

    // Don't steal focus from a field the overlay itself autoFocused — the New
    // task sheet focuses its title input on desktop, and that should win.
    if (!root.contains(document.activeElement)) {
      const first = focusable(root)[0]
      if (first) first.focus()
      else {
        root.setAttribute('tabindex', '-1')
        root.focus()
      }
    }

    const onKeyDown = (e) => {
      if (e.key !== 'Tab' || depth !== myDepth) return
      const items = focusable(root)
      if (!items.length) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      // Focus escaping the root entirely (browser chrome, a stray programmatic
      // blur) lands back on the near edge rather than out in the page.
      if (!root.contains(document.activeElement)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
        return
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      depth--
      // Only restore if focus is still ours to move — otherwise something after
      // us has already claimed it and yanking it back would be the bug.
      const prev = restoreTo.current
      if (
        prev &&
        document.body.contains(prev) &&
        (!root || root.contains(document.activeElement))
      ) {
        prev.focus()
      }
    }
  }, [ref, enabled])
}
