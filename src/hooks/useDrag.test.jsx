import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useDrag } from './useDrag'
import { DRAG_SLOP_PX, LONG_PRESS_MS } from '../lib/gestures'

// A pointer event as the hook reads it. jsdom's PointerEvent doesn't carry
// pointerId/isPrimary through the constructor, so pass them explicitly —
// fireEvent copies unknown init keys onto the event.
const ptr = (over = {}) => ({
  pointerId: 1,
  pointerType: 'touch',
  isPrimary: true,
  button: 0,
  clientX: 100,
  clientY: 100,
  ...over,
})

function Target(opts) {
  const { handlers } = useDrag(opts)
  return <div data-testid="t" {...handlers} />
}

describe('useDrag axis-intent lock', () => {
  it('claims a horizontal drag on an x-axis gesture', () => {
    const onStart = vi.fn()
    const onMove = vi.fn()
    const { getByTestId } = render(<Target axis="x" onStart={onStart} onMove={onMove} />)
    const el = getByTestId('t')

    fireEvent.pointerDown(el, ptr())
    fireEvent.pointerMove(el, ptr({ clientX: 100 + DRAG_SLOP_PX + 5 }))

    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenCalled()
  })

  // This is the behaviour that makes swipe-vs-scroll feel native: a vertical
  // drag on a swipe row must be handed back to the scroller, not tracked.
  it('bows out of a vertical drag on an x-axis gesture, and stays out', () => {
    const onStart = vi.fn()
    const onMove = vi.fn()
    const { getByTestId } = render(<Target axis="x" onStart={onStart} onMove={onMove} />)
    const el = getByTestId('t')

    fireEvent.pointerDown(el, ptr())
    fireEvent.pointerMove(el, ptr({ clientY: 100 + DRAG_SLOP_PX + 5 }))
    // even if the finger later curls sideways, the gesture is gone for good
    fireEvent.pointerMove(el, ptr({ clientX: 200, clientY: 100 + DRAG_SLOP_PX + 5 }))

    expect(onStart).not.toHaveBeenCalled()
    expect(onMove).not.toHaveBeenCalled()
  })

  it('does not lock until movement clears the slop threshold', () => {
    const onStart = vi.fn()
    const { getByTestId } = render(<Target axis="x" onStart={onStart} />)
    const el = getByTestId('t')

    fireEvent.pointerDown(el, ptr())
    fireEvent.pointerMove(el, ptr({ clientX: 100 + DRAG_SLOP_PX - 1 }))

    expect(onStart).not.toHaveBeenCalled()
  })

  it('reports the drag to onEnd so callers can tell a tap from a swipe', () => {
    const onEnd = vi.fn()
    const { getByTestId } = render(<Target axis="x" onEnd={onEnd} />)
    const el = getByTestId('t')

    fireEvent.pointerDown(el, ptr())
    fireEvent.pointerUp(el, ptr())

    expect(onEnd).toHaveBeenCalledWith(expect.objectContaining({ moved: false, active: false }))
  })
})

describe('useDrag multi-touch', () => {
  it('ignores a second finger instead of re-homing the drag onto it', () => {
    const onMove = vi.fn()
    const { getByTestId } = render(<Target axis="x" onMove={onMove} />)
    const el = getByTestId('t')

    fireEvent.pointerDown(el, ptr({ pointerId: 1, clientX: 100 }))
    // a second contact lands far away; if it were adopted, the next move would
    // be measured from *its* origin and the row would visibly jump
    fireEvent.pointerDown(el, ptr({ pointerId: 2, isPrimary: false, clientX: 300 }))
    fireEvent.pointerMove(el, ptr({ pointerId: 1, clientX: 130 }))

    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ dx: 30 }))
  })

  it('does not end the gesture when a secondary pointer lifts', () => {
    const onEnd = vi.fn()
    const { getByTestId } = render(<Target axis="x" onEnd={onEnd} />)
    const el = getByTestId('t')

    fireEvent.pointerDown(el, ptr({ pointerId: 1 }))
    fireEvent.pointerUp(el, ptr({ pointerId: 2, isPrimary: false }))

    expect(onEnd).not.toHaveBeenCalled()
  })
})

describe('useDrag long-press', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('fires after a stationary hold', () => {
    const onLongPress = vi.fn()
    const { getByTestId } = render(<Target axis="x" onLongPress={onLongPress} />)
    fireEvent.pointerDown(getByTestId('t'), ptr())

    vi.advanceTimersByTime(LONG_PRESS_MS + 10)

    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it('is cancelled by movement', () => {
    const onLongPress = vi.fn()
    const { getByTestId } = render(<Target axis="x" onLongPress={onLongPress} />)
    const el = getByTestId('t')

    fireEvent.pointerDown(el, ptr())
    fireEvent.pointerMove(el, ptr({ clientX: 100 + DRAG_SLOP_PX + 5 }))
    vi.advanceTimersByTime(LONG_PRESS_MS + 10)

    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('never fires for a mouse', () => {
    const onLongPress = vi.fn()
    const { getByTestId } = render(<Target axis="x" onLongPress={onLongPress} />)
    fireEvent.pointerDown(getByTestId('t'), ptr({ pointerType: 'mouse' }))

    vi.advanceTimersByTime(LONG_PRESS_MS + 10)

    expect(onLongPress).not.toHaveBeenCalled()
  })

  // Rows vanish mid-hold in a shared household list. A timer that survives the
  // unmount runs its action against a screen the user already left.
  it('does not fire after the element unmounts mid-hold', () => {
    const onLongPress = vi.fn()
    const { getByTestId, unmount } = render(<Target axis="x" onLongPress={onLongPress} />)
    fireEvent.pointerDown(getByTestId('t'), ptr())

    unmount()
    vi.advanceTimersByTime(LONG_PRESS_MS + 10)

    expect(onLongPress).not.toHaveBeenCalled()
  })
})
