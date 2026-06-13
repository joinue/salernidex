import { isShared } from '../lib/privacy'
import { isSolo } from '../lib/household'

// Subtle "your household can see this" marker for a row. Self-gating: shows only
// in a 2+ member household (isSolo) and only for shared items — so a solo user
// never sees it, and in a couple it quietly marks what the partner can see.
export default function SharedDot({ item }) {
  if (isSolo() || !isShared(item)) return null
  return <span className="shared-dot" title="Shared with your household" aria-label="Shared" />
}
