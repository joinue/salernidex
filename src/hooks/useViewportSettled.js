import { useEffect, useState } from 'react'

// False for the first beat after launch, while the browser is still deciding
// how tall the window is. True from then on, for the life of the session.
//
// An installed app's very first layout is done at a size that still allows for
// browser chrome that isn't there — a URL bar and a toolbar — and the window
// corrects itself a frame or two later. Nothing top-anchored notices, because
// that edge doesn't move; everything `position: fixed` to the *bottom* is drawn
// against a floor that is about to drop, so it paints high and then falls into
// place. That is the tab pill starting a little above where it lives and
// settling a moment later, and it is intermittent for the obvious reason: the
// bar has to paint inside that window to be caught by it, which takes a fast
// boot (a warm cache, a household already hydrated) to manage.
//
// There is no event for "the browser has made up its mind", so this settles on
// quiet instead: hold until the window has kept one size for QUIET, re-arming
// on every resize, with CAP as the backstop for a window that never stops
// moving — a desktop drag, or a phone rotating as it launches. QUIET is short
// enough to read as part of the app arriving rather than as a delay, and the
// bar fades in over it (see .tabbar.withheld), so the cost when there was
// nothing to correct is a fade nobody will notice.
//
// Watching `window` alone was not enough, and an installed iOS PWA is where it
// showed. With `apple-mobile-web-app-status-bar-style: black-translucent` (see
// index.html) the web view is full-bleed — content under the status bar and the
// home indicator, insets padding it back — but WebKit lays the page out once
// *before* applying that, against a rectangle inset for chrome the app doesn't
// have. Which is why the symptom reads as the app leaving room for a URL bar:
// it is, briefly. The correction that follows is not reliably a `window`
// resize, so this hook used to sit through it, hit CAP, and fade the bar in
// against the stale floor. visualViewport reports what `window` won't, so it is
// watched too.
//
// CAP still bounds the whole thing, because a bar that never arrives is worse
// than one that arrives 18px low — and iOS can defer the correction past any
// cap worth waiting for, as far as the first touch. That tail belongs to CSS
// rather than here: `.tabbar` transitions `bottom`, so a correction landing
// after the fade glides instead of jumping. Hiding until the geometry is
// provably final and hiding for a bounded moment are different promises, and
// only the second one is keepable.
const QUIET = 150
const CAP = 800

export function useViewportSettled() {
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    const vv = window.visualViewport
    let quiet
    let cap
    const stop = () => {
      clearTimeout(quiet)
      clearTimeout(cap)
      window.removeEventListener('resize', arm)
      vv?.removeEventListener('resize', arm)
    }
    const done = () => {
      stop()
      setSettled(true)
    }
    const arm = () => {
      clearTimeout(quiet)
      quiet = setTimeout(done, QUIET)
    }

    cap = setTimeout(done, CAP)
    arm()
    window.addEventListener('resize', arm)
    // `resize` only. visualViewport also fires `scroll` — continuously, while
    // iOS pans — and re-arming on those would hold the bar back for the whole
    // of a flick that had nothing to do with the window making up its mind.
    vv?.addEventListener('resize', arm)
    return stop
  }, [])

  return settled
}
