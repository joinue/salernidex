// Shared setup for the jsdom suites.
//
// The DOM matchers (toBeInTheDocument, toBeDisabled, …), plus an explicit
// unmount between tests: Testing Library only auto-cleans when Vitest runs with
// `globals: true`, and without it every render stacks up in the same document,
// so getByRole starts resolving to the previous test's markup.
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

afterEach(cleanup)

// jsdom ships no matchMedia, and useMediaQuery reads it during the first
// render — too early for a beforeEach to help. Default everything to "no
// match", which lands the pointer-capability queries on the touch branch (no
// hover, no fine pointer); a suite that cares about a particular query still
// reassigns window.matchMedia itself.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })
}
