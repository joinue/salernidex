import { describe, it, expect, vi, afterEach } from 'vitest'
import { useRef } from 'react'
import { render, fireEvent } from '@testing-library/react'
import { useEdgeBack } from './useEdgeBack'
import { EDGE_BACK_SLOP_PX } from '../lib/gestures'

// jsdom's PointerEvent drops pointerId/isPrimary from the constructor, so pass
// them explicitly — fireEvent copies unknown init keys straight onto the event.
const ptr = (over = {}) => ({
  pointerId: 1,
  pointerType: 'touch',
  isPrimary: true,
  clientX: 4, // inside the 24px edge zone
  clientY: 300,
  ...over,
})

const realMatchMedia = window.matchMedia

// The hook reads display-mode on every effect run; setup.js defaults every query
// to "no match", which is the browser-tab case.
function runStandalone(standalone) {
  window.matchMedia = (query) => ({
    ...realMatchMedia(query),
    matches: standalone && query.includes('display-mode: standalone'),
  })
}

function Page({ enabled = true, onBack = () => {} }) {
  const ref = useRef(null)
  useEdgeBack(ref, enabled, onBack)
  return (
    <main ref={ref}>
      <div className="content" data-testid="content" />
    </main>
  )
}

// Swipe right from the left edge, far enough to commit.
function swipeFromEdge(dx = 120, over = {}) {
  fireEvent.pointerDown(window, ptr(over))
  fireEvent.pointerMove(window, ptr({ ...over, clientX: 4 + EDGE_BACK_SLOP_PX + 5 }))
  fireEvent.pointerMove(window, ptr({ ...over, clientX: 4 + dx }))
}

describe('useEdgeBack', () => {
  afterEach(() => {
    window.matchMedia = realMatchMedia
  })

  describe('installed (standalone)', () => {
    it('tracks the finger and goes back past the commit threshold', () => {
      runStandalone(true)
      const onBack = vi.fn()
      const { getByTestId } = render(<Page onBack={onBack} />)
      const content = getByTestId('content')

      swipeFromEdge(120)
      expect(content.style.transform).toBe('translateX(60px)') // 0.5× rubber-band

      fireEvent.pointerUp(window, ptr({ clientX: 4 + 120 }))
      expect(onBack).toHaveBeenCalledTimes(1)
      expect(content.style.transform).toBe('translateX(0)')
    })

    it('snaps back without navigating on a short drag', () => {
      runStandalone(true)
      const onBack = vi.fn()
      const { getByTestId } = render(<Page onBack={onBack} />)

      swipeFromEdge(40)
      fireEvent.pointerUp(window, ptr({ clientX: 4 + 40 }))

      expect(onBack).not.toHaveBeenCalled()
      expect(getByTestId('content').style.transform).toBe('translateX(0)')
    })

    it('ignores a drag that starts away from the edge', () => {
      runStandalone(true)
      const onBack = vi.fn()
      const { getByTestId } = render(<Page onBack={onBack} />)

      fireEvent.pointerDown(window, ptr({ clientX: 200 }))
      fireEvent.pointerMove(window, ptr({ clientX: 320 }))
      fireEvent.pointerUp(window, ptr({ clientX: 320 }))

      expect(onBack).not.toHaveBeenCalled()
      expect(getByTestId('content').style.transform).toBe('')
    })

    it('hands a vertical drag back to the scroller', () => {
      runStandalone(true)
      const onBack = vi.fn()
      const { getByTestId } = render(<Page onBack={onBack} />)

      fireEvent.pointerDown(window, ptr())
      fireEvent.pointerMove(window, ptr({ clientY: 300 + EDGE_BACK_SLOP_PX + 5 }))
      // even if the finger later curls sideways, the gesture is gone for good
      fireEvent.pointerMove(window, ptr({ clientX: 200, clientY: 320 }))
      fireEvent.pointerUp(window, ptr({ clientX: 200, clientY: 320 }))

      expect(onBack).not.toHaveBeenCalled()
      expect(getByTestId('content').style.transform).toBe('')
    })

    it('detaches on unmount', () => {
      runStandalone(true)
      const onBack = vi.fn()
      const { getByTestId, unmount } = render(<Page onBack={onBack} />)
      const content = getByTestId('content')
      unmount()

      swipeFromEdge(120)
      fireEvent.pointerUp(window, ptr({ clientX: 124 }))

      expect(onBack).not.toHaveBeenCalled()
      expect(content.style.transform).toBe('')
    })
  })

  // The regression this guards: in a browser tab Safari runs its own edge-swipe
  // back, and ours ran on the same finger. The two motions compounded, so a
  // detail page slid sideways under a drag that tab pages absorb without moving.
  it('stands down in a browser tab, where the platform already has the gesture', () => {
    runStandalone(false)
    const onBack = vi.fn()
    const { getByTestId } = render(<Page onBack={onBack} />)

    swipeFromEdge(120)
    fireEvent.pointerUp(window, ptr({ clientX: 124 }))

    expect(onBack).not.toHaveBeenCalled()
    expect(getByTestId('content').style.transform).toBe('')
  })

  it('stays off for a route that never enables it', () => {
    runStandalone(true)
    const onBack = vi.fn()
    const { getByTestId } = render(<Page enabled={false} onBack={onBack} />)

    swipeFromEdge(120)
    fireEvent.pointerUp(window, ptr({ clientX: 124 }))

    expect(onBack).not.toHaveBeenCalled()
    expect(getByTestId('content').style.transform).toBe('')
  })
})
