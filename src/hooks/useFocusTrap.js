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

// Controls that open the software keyboard when they take focus.
const TEXT_ENTRY = 'textarea, [contenteditable=""], [contenteditable="true"], input'
const NO_KEYBOARD = ['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'color', 'range']

function opensKeyboard(el) {
  if (!el.matches(TEXT_ENTRY)) return false
  return el.tagName !== 'INPUT' || !NO_KEYBOARD.includes(el.type)
}

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
    //
    // And where the overlay *hasn't* asked, the fallback must not land on a
    // text field, because on a phone that summons the keyboard the instant the
    // sheet opens and covers the thing you just opened. `focusOnDesktop` is the
    // rule ("we don't auto-focus a sheet's first field on phones") and every
    // form honours it — but the fallback here was quietly undoing it for any
    // sheet whose first control happens to be an input, which is most of them.
    // Wanting the keyboard is what autoFocus is for; the branch below then
    // never runs.
    if (!root.contains(document.activeElement)) {
      const first = focusable(root)[0]
      if (first && !opensKeyboard(first)) first.focus()
      else {
        // The dialog itself: screen readers announce its label, Tab walks into
        // the content from the top, and no keyboard appears uninvited.
        root.setAttribute('tabindex', '-1')
        root.focus({ preventScroll: true })
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
