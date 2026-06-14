// Helpers for a person's additional emails/phones and social profiles — the
// labeled multi-value channels added in 0012. The primary email/phone columns
// are handled separately; these back the "+ Add" rows on the contact card.
import { SOCIAL_BY_ID } from './constants'

// Drop blank rows and trim values. Rows are kept while editing (so an empty new
// row can be typed into) and cleaned here before save.
export function cleanChannels(items) {
  if (!Array.isArray(items)) return []
  return items
    .map((it) => ({ ...it, value: (it.value || '').trim() }))
    .filter((it) => it.value)
}

// Resolve a social entry to an openable URL, or null if it isn't linkable.
// Full URLs pass through; bare handles get their platform's base prepended
// (a leading @ is stripped). For website/other we only linkify URL-shaped text.
export function socialUrl({ platform, value } = {}) {
  const v = (value || '').trim()
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return v
  const base = SOCIAL_BY_ID[platform]?.base
  if (base) return base + v.replace(/^@/, '')
  return /^[\w-]+(\.[\w-]+)+/.test(v) ? `https://${v}` : null
}

// Map a label (Home/Work/Mobile/…) to a vCard TEL/EMAIL TYPE token.
export function labelToVcardType(label) {
  const l = (label || '').toLowerCase()
  if (l === 'mobile' || l === 'cell') return 'CELL'
  if (l === 'work') return 'WORK'
  if (l === 'home') return 'HOME'
  return 'OTHER'
}
