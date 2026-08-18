// The DOOT logo, wherever the app needs to name itself.
//
// Two shapes, and the difference is what each one has to do. The mark — house,
// D, dot — labels: it's square, full-color on a transparent ground, and reads
// on paper and on ink alike, so one file serves both themes. The lockup sets
// the DOOT lettermark beside that mark and introduces: it belongs on the
// screens someone meets before they're inside (sign in, sign up, onboarding).
// Its letters are flat ink, so that one does ship as a pair.
//
// Both PNGs of a lockup render and primitives/logo.css shows whichever the
// resolved theme calls for, so nothing here has to read the theme. The hidden
// one leaves the a11y tree with `display: none`, which is why both carry the
// same alt: exactly one is ever announced.
//
// Size it from the outside: a class (the sidebar does, since it needs a
// collapsed variant) or `height` for a one-off. Width follows the aspect ratio.
//
// These are the served files' real pixel dimensions, which are deliberately
// close to the largest size anything renders them at — brand/optimize.py cuts
// the design-tool masters down to 3x on-screen and repalettes them. Ask for a
// size much past what the CSS uses today and you'll be upscaling; raise the
// targets in that script rather than stretching the art here.
const ART = {
  mark: { width: 256, height: 256 },
  lockup: { width: 900, height: 300 },
}

export default function Logo({ variant = 'mark', className = '', height, alt = 'DOOT' }) {
  const art = ART[variant]
  // The width/height attributes are the intrinsic ratio, not the display size —
  // they reserve the right box before the PNG lands so nothing jumps.
  const shared = {
    alt,
    width: art.width,
    height: art.height,
    style: height ? { height, width: 'auto' } : undefined,
  }

  // The mark carries its own color, so there's only ever one file to show.
  if (variant === 'mark') {
    return <img className={`logo ${className}`} src="/doot-mark.png" {...shared} />
  }

  return (
    <>
      <img
        className={`logo logo-ink ${className}`}
        src="/doot-icon-and-lettermark-dark.png"
        {...shared}
      />
      <img
        className={`logo logo-paper ${className}`}
        src="/doot-icon-and-lettermark-white.png"
        {...shared}
      />
    </>
  )
}
