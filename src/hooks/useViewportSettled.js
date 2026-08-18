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
// bar fades in over it (see .tabbar.settling), so the cost when there was
// nothing to correct is a fade nobody will notice.
const QUIET = 150
const CAP = 800

export function useViewportSettled() {
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    let quiet
    let cap
    const stop = () => {
      clearTimeout(quiet)
      clearTimeout(cap)
      window.removeEventListener('resize', arm)
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
    return stop
  }, [])

  return settled
}
