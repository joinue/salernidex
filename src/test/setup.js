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
