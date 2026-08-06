import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useKeyboardOpen } from './useKeyboardOpen'

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
