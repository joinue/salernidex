import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useKeyboardOpen, useVisualBandBottom } from './useKeyboardOpen'

// jsdom has no visualViewport, so stand one up we can resize by hand. The hook
// reads `window.innerHeight - vv.height`, which is the only signal iOS gives us.
const LAYOUT_H = 844 // iPhone 14 portrait

function stubViewport(height) {
  const listeners = new Set()
  const vv = {
    height,
    addEventListener: (type, fn) => type === 'resize' && listeners.add(fn),
    removeEventListener: (type, fn) => listeners.delete(fn),
    // Test-only: mimic the keyboard opening/closing.
    resizeTo(next) {
      vv.height = next
      listeners.forEach((fn) => fn())
    },
    get listenerCount() {
      return listeners.size
    },
  }
  window.visualViewport = vv
  return vv
}

describe('useKeyboardOpen', () => {
  beforeEach(() => {
    window.innerHeight = LAYOUT_H
  })

  afterEach(() => {
    delete window.visualViewport
  })

  it('is false when the viewports agree', () => {
    stubViewport(LAYOUT_H)
    const { result } = renderHook(() => useKeyboardOpen())
    expect(result.current).toBe(false)
  })

  it('ignores a collapsing browser toolbar', () => {
    // Safari's URL bar is ~60px — well under the floor, and it must not read as
    // a keyboard or the tab bar would tuck away on an ordinary scroll.
    const vv = stubViewport(LAYOUT_H)
    const { result } = renderHook(() => useKeyboardOpen())
    act(() => vv.resizeTo(LAYOUT_H - 60))
    expect(result.current).toBe(false)
  })

  it('is true once the keyboard is up', () => {
    const vv = stubViewport(LAYOUT_H)
    const { result } = renderHook(() => useKeyboardOpen())
    act(() => vv.resizeTo(LAYOUT_H - 336)) // iOS portrait keyboard
    expect(result.current).toBe(true)
  })

  it('reports a keyboard that is already open on mount', () => {
    stubViewport(LAYOUT_H - 336)
    const { result } = renderHook(() => useKeyboardOpen())
    expect(result.current).toBe(true)
  })

  it('flips back when the keyboard closes', () => {
    const vv = stubViewport(LAYOUT_H - 336)
    const { result } = renderHook(() => useKeyboardOpen())
    expect(result.current).toBe(true)
    act(() => vv.resizeTo(LAYOUT_H))
    expect(result.current).toBe(false)
  })

  it('unsubscribes on unmount', () => {
    const vv = stubViewport(LAYOUT_H)
    const { unmount } = renderHook(() => useKeyboardOpen())
    expect(vv.listenerCount).toBe(1)
    unmount()
    expect(vv.listenerCount).toBe(0)
  })

  it('stays false where visualViewport is unavailable', () => {
    const { result } = renderHook(() => useKeyboardOpen())
    expect(result.current).toBe(false)
  })
})

// The same stub with the two things the inset needs and the boolean doesn't:
// a pan offset, and a `scroll` event to deliver changes to it.
function stubPannableViewport(height, offsetTop = 0) {
  const listeners = { resize: new Set(), scroll: new Set() }
  const vv = {
    height,
    offsetTop,
    addEventListener: (type, fn) => listeners[type]?.add(fn),
    removeEventListener: (type, fn) => listeners[type]?.delete(fn),
    resizeTo(next) {
      vv.height = next
      listeners.resize.forEach((fn) => fn())
    },
    panTo(next) {
      vv.offsetTop = next
      listeners.scroll.forEach((fn) => fn())
    },
    get listenerCount() {
      return listeners.resize.size + listeners.scroll.size
    },
  }
  window.visualViewport = vv
  return vv
}

const KEYBOARD_H = 336

describe('useVisualBandBottom', () => {
  beforeEach(() => {
    window.innerHeight = LAYOUT_H
  })

  afterEach(() => {
    delete window.visualViewport
  })

  it('is the layout viewport bottom when the viewports agree', () => {
    stubPannableViewport(LAYOUT_H)
    const { result } = renderHook(() => useVisualBandBottom())
    expect(result.current).toBe(LAYOUT_H)
  })

  it('rises to the top of the keyboard', () => {
    const vv = stubPannableViewport(LAYOUT_H)
    const { result } = renderHook(() => useVisualBandBottom())
    act(() => vv.resizeTo(LAYOUT_H - KEYBOARD_H))
    expect(result.current).toBe(LAYOUT_H - KEYBOARD_H)
  })

  it('moves down with the pan iOS uses to reveal the caret', () => {
    const vv = stubPannableViewport(LAYOUT_H)
    const { result } = renderHook(() => useVisualBandBottom())
    act(() => vv.resizeTo(LAYOUT_H - KEYBOARD_H))
    act(() => vv.panTo(120))
    expect(result.current).toBe(120 + LAYOUT_H - KEYBOARD_H)
  })

  // Straight off the device, and the reading that killed three earlier
  // versions: the band's bottom edge is *below* the layout viewport's own
  // (753 > 684). Anything phrased as an inset from that bottom goes negative
  // here and clamps to nothing; an absolute edge just answers 753.
  it('exceeds innerHeight when the band hangs below the layout viewport', () => {
    window.innerHeight = 684
    stubPannableViewport(543, 210)
    const { result } = renderHook(() => useVisualBandBottom())
    expect(result.current).toBe(753)
  })

  it('reads correctly on the very first render, before any event', () => {
    window.innerHeight = 684
    stubPannableViewport(543, 210)
    const { result } = renderHook(() => useVisualBandBottom())
    expect(result.current).toBe(753)
  })

  it('unsubscribes from both events on unmount', () => {
    const vv = stubPannableViewport(LAYOUT_H)
    const { unmount } = renderHook(() => useVisualBandBottom())
    expect(vv.listenerCount).toBe(2)
    unmount()
    expect(vv.listenerCount).toBe(0)
  })

  it('falls back to the layout viewport where visualViewport is unavailable', () => {
    const { result } = renderHook(() => useVisualBandBottom())
    expect(result.current).toBe(LAYOUT_H)
  })
})
