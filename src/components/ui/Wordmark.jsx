// The DOOT mark, wherever the app needs to name itself.
//
// It ships as two PNGs — ink for light, paper for dark — because a single-color
// raster can't be recolored in CSS. Both render; primitives/wordmark.css shows
// whichever the resolved theme calls for, so nothing here has to read the theme.
// The hidden one leaves the a11y tree with `display: none`, which is why both
// carry the same alt: exactly one is ever announced.
//
// Two sizes, because both variants download either way and the source art is
// 4144px wide: chrome (sidebar, crash screen) takes the 256px pair, and only
// the auth hero — which actually renders at 260px — pays for the full-res one.
//
// Size it from the outside: a class (the sidebar does, since it needs a
// collapsed variant) or `height` for a one-off. Width follows the aspect ratio.
const ART = {
  sm: { suffix: '-sm', width: 256, height: 227 },
  full: { suffix: '', width: 4144, height: 3667 },
}

export default function Wordmark({ className = '', height, alt = 'DOOT', size = 'sm' }) {
  const art = ART[size]
  // The width/height attributes are the intrinsic ratio, not the display size —
  // they reserve the right box before the PNG lands so nothing jumps.
  const shared = {
    alt,
    width: art.width,
    height: art.height,
    style: height ? { height, width: 'auto' } : undefined,
  }
  return (
    <>
      <img
        className={`wordmark wordmark-ink ${className}`}
        src={`/joindoot${art.suffix}.png`}
        {...shared}
      />
      <img
        className={`wordmark wordmark-paper ${className}`}
        src={`/joindoot-white${art.suffix}.png`}
        {...shared}
      />
    </>
  )
}
