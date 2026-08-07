import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useKeyboardOpen, useVisualBottomGap } from './useKeyboardOpen'

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

describe('useVisualBottomGap', () => {
  beforeEach(() => {
    window.innerHeight = LAYOUT_H
  })

  afterEach(() => {
    delete window.visualViewport
  })

  it('is 0 when the viewports agree', () => {
    stubPannableViewport(LAYOUT_H)
    const { result } = renderHook(() => useVisualBottomGap())
    expect(result.current).toBe(0)
  })

  // Safari-in-a-tab: the layout viewport keeps its full height and the keyboard
  // covers the bottom of it, so the gap is the keyboard.
  it('measures the keyboard when the layout viewport is left whole', () => {
    const vv = stubPannableViewport(LAYOUT_H)
    const { result } = renderHook(() => useVisualBottomGap())
    act(() => vv.resizeTo(LAYOUT_H - KEYBOARD_H))
    expect(result.current).toBe(KEYBOARD_H)
  })

  // ...and then iOS pans to reveal the caret, which slides a bottom-anchored
  // element out from under the keyboard's edge. Every pixel of pan comes back
  // off the offset.
  it('shrinks by however far iOS has panned', () => {
    const vv = stubPannableViewport(LAYOUT_H)
    const { result } = renderHook(() => useVisualBottomGap())
    act(() => vv.resizeTo(LAYOUT_H - KEYBOARD_H))
    act(() => vv.panTo(120))
    expect(result.current).toBe(KEYBOARD_H - 120)
  })

  // The standalone case, and the one that broke this. An installed app can
  // shrink the layout viewport for the keyboard instead of panning: the two
  // viewports still agree, so a gap of 0 is the right answer — the layout
  // viewport now ends where the keyboard begins. What must NOT happen is
  // reading that as "no keyboard" and refusing to dock at all.
  it('is 0 when the layout viewport shrinks for the keyboard instead', () => {
    const vv = stubPannableViewport(LAYOUT_H)
    const { result } = renderHook(() => useVisualBottomGap())
    act(() => {
      window.innerHeight = LAYOUT_H - KEYBOARD_H
      vv.resizeTo(LAYOUT_H - KEYBOARD_H)
    })
    expect(result.current).toBe(0)
  })

  // A collapsing Safari URL bar is not a keyboard, but it is a real gap, and
  // reporting it is correct: a bar docked 60px up is where the visible band
  // actually ends. Deciding it's too small to care about is the caller's call,
  // not this hook's — that judgement is what used to live here and misfire.
  it('reports small gaps rather than filtering them', () => {
    const vv = stubPannableViewport(LAYOUT_H)
    const { result } = renderHook(() => useVisualBottomGap())
    act(() => vv.resizeTo(LAYOUT_H - 60))
    expect(result.current).toBe(60)
  })

  it('never goes negative when panned past the end', () => {
    const vv = stubPannableViewport(LAYOUT_H)
    const { result } = renderHook(() => useVisualBottomGap())
    act(() => vv.resizeTo(LAYOUT_H - KEYBOARD_H))
    act(() => vv.panTo(KEYBOARD_H + 40))
    expect(result.current).toBe(0)
  })

  it('drops back to 0 when the keyboard closes', () => {
    const vv = stubPannableViewport(LAYOUT_H, 0)
    const { result } = renderHook(() => useVisualBottomGap())
    act(() => vv.resizeTo(LAYOUT_H - KEYBOARD_H))
    expect(result.current).toBe(KEYBOARD_H)
    act(() => vv.panTo(0))
    act(() => vv.resizeTo(LAYOUT_H))
    expect(result.current).toBe(0)
  })

  it('unsubscribes from both events on unmount', () => {
    const vv = stubPannableViewport(LAYOUT_H)
    const { unmount } = renderHook(() => useVisualBottomGap())
    expect(vv.listenerCount).toBe(2)
    unmount()
    expect(vv.listenerCount).toBe(0)
  })

  it('stays 0 where visualViewport is unavailable', () => {
    const { result } = renderHook(() => useVisualBottomGap())
    expect(result.current).toBe(0)
  })
})
