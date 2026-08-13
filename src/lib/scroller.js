// Which element actually scrolls — the one question the rest of the app should
// never have to answer for itself.
//
// The two shells scroll differently on purpose (see base.css). Desktop is a
// fixed-height frame: the sidebar holds still and `.main` is the scrollport.
// A phone lets the *document* scroll instead, because that is the only way iOS
// Safari will collapse its toolbars — it grants that to pages whose document
// moves, and to no others. A shell that scrolls an inner div keeps the toolbar
// on screen forever, which costs ~60px and leaves the floating tab pill sitting
// that much higher than it should.
//
// Everything that reads, watches, or freezes scroll position goes through here,
// so the fork lives in exactly one file and the two models can't drift.

// The phone breakpoint, matching the @media blocks in responsive.css. Kept as a
// query rather than a boolean so callers read it live: it has to be right after
// a rotation, not just at mount.
const PHONE = '(max-width: 720px)'

export function documentScrolls() {
  return window.matchMedia(PHONE).matches
}

/** Current offset of whichever scroller is live. */
export function scrollTop(main) {
  return documentScrolls() ? window.scrollY : (main?.scrollTop ?? 0)
}

/** Jump whichever scroller is live back to the top. */
export function scrollToTop(main) {
  if (documentScrolls()) window.scrollTo(0, 0)
  else main?.scrollTo(0, 0)
}

// Subscribe to scroll on both candidates rather than picking one.
//
// Two reasons, and the second is the load-bearing one. First, the document's
// scroll events fire at `window`, not at <html>, so the thing you listen to and
// the thing you measure aren't the same object anyway. Second, a subscription
// made at one width would otherwise go stale when the width changes — an iPad
// crossing 720px on rotation would leave the listener attached to a box that no
// longer moves. The idle candidate emits nothing, so listening to both costs a
// no-op registration and removes the whole staleness question.
export function watchScroll(main, handler) {
  const targets = [window, main].filter(Boolean)
  for (const t of targets) t.addEventListener('scroll', handler, { passive: true })
  return () => {
    for (const t of targets) t.removeEventListener('scroll', handler)
  }
}

// Freeze / restore the live scroller, for overlays that need the page behind
// the backdrop to hold still.
//
// The desktop half is the easy one: `overflow: hidden` on `.main` preserves
// scrollTop, so lock and unlock are invisible. The document half can't use it —
// iOS Safari ignores `overflow: hidden` on the document and keeps scrolling the
// page under the backdrop — so it takes the position:fixed pin instead, which
// does hold, at the cost of having to carry the offset by hand and put it back
// on release. `body` being fixed doesn't disturb the overlay itself: only
// transforms and filters create containing blocks for fixed descendants, and a
// portalled modal still resolves against the viewport.
export function freezeScroll(main) {
  if (!documentScrolls()) {
    if (!main) return () => {}
    const prev = main.style.overflow
    main.style.overflow = 'hidden'
    return () => {
      main.style.overflow = prev
    }
  }

  const { body } = document
  const y = window.scrollY
  const prev = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
  }
  body.style.position = 'fixed'
  body.style.top = `-${y}px`
  body.style.left = '0'
  body.style.right = '0'
  body.style.width = '100%'
  return () => {
    Object.assign(body.style, prev)
    // Explicitly instant. The document carries `scroll-behavior: smooth` (see
    // base.css), so a bare scrollTo would animate the restore — the page
    // visibly drifting back into place after a sheet closes, which is the
    // opposite of the "it never moved" illusion the lock exists to create.
    window.scrollTo({ top: y, left: 0, behavior: 'instant' })
  }
}
