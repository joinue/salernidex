// Is any surface currently in selection mode?
//
// A tiny store rather than a prop or a context, for one reason: the thing that
// needs the answer is the tab bar, and the things that know it are feature views
// three levels down and across the tree. MobileNav already reads the software
// keyboard the same way (useKeyboardOpen) instead of having App thread it down,
// so this follows the pattern that is already there.
//
// The property that matters is that hooks/useSelection registers here itself.
// The bug this exists to fix (docs/records/mobile-audit.md, P0) was a shipped
// feature left unusable on a phone because the selection bar and the tab bar
// resolved to the same rectangle — and the failure mode of a per-view opt-in is
// that the fourth surface to adopt selection forgets, and ships the same bug
// again. Nothing to remember: using useSelection is what registers you.
//
// Membership is by token rather than a count, so a double-invoked effect (React
// StrictMode) can't drift the tally and strand the tab bar hidden forever.
const selecting = new Set()
const listeners = new Set()

export function subscribeSelectionMode(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function isSelectionActive() {
  return selecting.size > 0
}

// Notify only when the ANSWER changes, not on every registration — two surfaces
// handing over shouldn't flicker the tab bar between them.
export function setSelectionActive(token, on) {
  const before = selecting.size > 0
  if (on) selecting.add(token)
  else selecting.delete(token)
  if (selecting.size > 0 !== before) for (const fn of listeners) fn()
}

// Tests only: the store outlives any one component, so a suite that leaves a
// surface "selecting" would leak into the next file.
export function resetSelectionMode() {
  selecting.clear()
  for (const fn of listeners) fn()
}
