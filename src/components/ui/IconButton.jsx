import { forwardRef } from 'react'

// A round/soft icon-only button. Folds together three near-identical recipes
// (`.icon-btn`, `.header-action`, `.info-btn`) that differed only in size and
// tint, and — more to the point — none of which met the 44px touch minimum.
// The hit-area extension now comes with the primitive rather than being
// something each new control has to remember.
//
// `label` is required: an icon-only control with no accessible name is a
// mystery to a screen reader, and this is the single most common place to
// forget one.
//
// Variants: `quiet` (grey, default), `accent` (tinted circle, page actions),
// `danger` (destructive). Sizes: `sm` 32, `md` 38, `lg` 44 — all tap at 44.
const SIZES = { sm: 16, md: 18, lg: 20 }

const IconButton = forwardRef(function IconButton(
  { icon: Icon, label, variant = 'quiet', size = 'sm', className = '', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`icon-btn icon-btn-${variant} icon-btn-${size} ${className}`.trim()}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon size={SIZES[size]} aria-hidden="true" />
    </button>
  )
})

export default IconButton
