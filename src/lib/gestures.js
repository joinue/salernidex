// Shared gesture tuning — one place to feel out the whole app's touch handling
// instead of chasing magic numbers across useDrag, useLongPress, ReorderableList
// and useEdgeBack. The slop values intentionally differ by gesture (a long-press
// tolerates more drift than a drag needs to lock); they're named so that's a
// decision, not an accident.

// Press-and-hold duration before a long-press fires or a reorder row lifts.
export const LONG_PRESS_MS = 450

// Finger travel before a drag commits to its axis (swipe rows, sheets).
export const DRAG_SLOP_PX = 6

// Travel that cancels a pending long-press — looser than DRAG_SLOP so a steady
// hold survives small jitter without turning into a scroll.
export const LONG_PRESS_MOVE_PX = 10

// Travel before a reorder lift that means "you're scrolling/swiping, not
// reordering" — so the lift bows out and the list keeps moving.
export const REORDER_CANCEL_PX = 8

// Travel before the edge-swipe-back commits to horizontal intent (vs a vertical
// scroll that happens to start near the screen edge).
export const EDGE_BACK_SLOP_PX = 12

// A drag that ends over a tappable row must not also fire that row's click —
// otherwise pulling a sheet down, or pulling to refresh, navigates into
// whatever happened to be under the finger. Every drag primitive that can end
// on top of other content calls this on release. It was hand-rolled in Sheet
// and ReorderableList and simply missing from PullToRefresh; one copy means one
// behaviour.
export function swallowNextClick(window_ = window) {
  const swallow = (e) => {
    e.stopPropagation()
    e.preventDefault()
  }
  window_.addEventListener('click', swallow, { capture: true, once: true })
  // If no click follows (the common case — a drag that ends on empty space),
  // drop the listener so it can't eat an unrelated tap later on.
  setTimeout(() => window_.removeEventListener('click', swallow, { capture: true }), 80)
}

// Elements that own their own drags. A gesture starting inside one of these is
// theirs, not the container's: dragging in a textarea places a cursor, dragging
// a slider moves it. Without this a sheet with a note field dismisses itself
// the moment you try to select text.
export const DRAG_EXEMPT_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-no-drag]'
