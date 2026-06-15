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
