import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useViewportSettled } from './useViewportSettled'

// The hook's two constants, restated here rather than exported: a test that
// reads them from the module can't notice them changing, which is most of what
// this is guarding.
const QUIET = 150
const CAP = 800

const tick = (ms) => act(() => vi.advanceTimersByTime(ms))
const resize = () => act(() => window.dispatchEvent(new Event('resize')))

describe('useViewportSettled', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('holds at first, so bottom chrome never paints against a floor that moves', () => {
    const { result } = renderHook(() => useViewportSettled())
    expect(result.current).toBe(false)
  })

  it('settles once the window has kept one size', () => {
    const { result } = renderHook(() => useViewportSettled())
    tick(QUIET)
    expect(result.current).toBe(true)
  })

  it('waits out the correction rather than the clock', () => {
    // The launch case: the window changes its mind partway through the quiet
    // window, which has to start over or the bar reveals mid-jump.
    const { result } = renderHook(() => useViewportSettled())
    tick(QUIET - 20)
    resize()
    tick(QUIET - 20)
    expect(result.current).toBe(false)
    tick(20)
    expect(result.current).toBe(true)
  })

  it('gives up waiting on a window that never stops moving', () => {
    // A phone rotating as it launches, or a desktop drag. Without the cap the
    // bar would be invisible for as long as it went on.
    const { result } = renderHook(() => useViewportSettled())
    for (let t = 0; t < CAP; t += QUIET - 20) {
      tick(QUIET - 20)
      resize()
    }
    expect(result.current).toBe(true)
  })

  it('stays settled — it is a launch guard, not a scroll one', () => {
    // Safari collapsing its toolbar mid-session resizes the window too, and a
    // bar that faded out every time you scrolled would be far worse than the
    // jump this fixes.
    const { result } = renderHook(() => useViewportSettled())
    tick(QUIET)
    resize()
    tick(1)
    expect(result.current).toBe(true)
  })

  it('drops its listener on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useViewportSettled())
    unmount()
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
    remove.mockRestore()
  })
})
