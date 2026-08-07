// How the app is being run, as opposed to what it can do. Three places need to
// branch on this — the install hint, push support, and the edge-swipe-back —
// and each had grown its own identical copy of these two predicates.

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

// Installed to the Home Screen / launched as its own window, rather than sitting
// in a browser tab. `display-mode` is the standard; `navigator.standalone` is
// the iOS-only predecessor, which is what actually answers on older Safari.
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
