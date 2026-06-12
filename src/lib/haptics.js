// Best-effort haptic feedback.
//
// ⚠️ iOS Safari does NOT support the Vibration API, so on iPhone web this is a
// silent no-op by design — we don't fake it. It works on Android/Chromium. The
// single `buzz()` seam below is the one place to swap in a real implementation
// if the app ever ships as an installed/native shell (or uses the iOS
// hidden-<label> haptic trick).
const supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

function buzz(pattern) {
  if (!supported) return
  try {
    navigator.vibrate(pattern)
  } catch {
    /* ignore */
  }
}

export const haptics = {
  light: () => buzz(8),
  medium: () => buzz(14),
  success: () => buzz([10, 30, 10]),
  warning: () => buzz([18, 40, 18]),
  supported,
}

export default haptics
