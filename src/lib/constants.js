import { Phone, MessageCircle, Mail, Coffee, Edit3 } from 'react-feather'

export const PRIVACY_LABELS = {
  marc_only: 'Marc only',
  shared: 'Shared',
  family_shared: 'Family shared',
  public: 'Public',
}

// Interaction (touchpoint) types — the CRM activity log. `verb` labels the
// quick-log button, `label` labels a logged entry, past tense.
export const INTERACTION_TYPES = [
  { id: 'call', label: 'Called', verb: 'Call', icon: Phone },
  { id: 'text', label: 'Texted', verb: 'Text', icon: MessageCircle },
  { id: 'meeting', label: 'Met', verb: 'Met', icon: Coffee },
  { id: 'email', label: 'Emailed', verb: 'Email', icon: Mail },
  { id: 'note', label: 'Note', verb: 'Note', icon: Edit3 },
]

export const INTERACTION_BY_ID = Object.fromEntries(INTERACTION_TYPES.map((t) => [t.id, t]))

// Relationship tiers — how close someone is, independent of tags/groups.
// null/'' = unsorted. Order matters: closest first (drives the tier sort).
export const TIERS = [
  { value: 'inner', label: 'Inner circle' },
  { value: 'close', label: 'Close' },
  { value: 'network', label: 'Network' },
]

export const TIER_LABELS = Object.fromEntries(TIERS.map((t) => [t.value, t.label]))
export const TIER_RANK = Object.fromEntries(TIERS.map((t, i) => [t.value, i]))

// "Keep in touch" cadence presets, stored as days (0 = no reminder).
export const KEEP_IN_TOUCH_OPTIONS = [
  { value: 0, label: 'No reminder' },
  { value: 30, label: 'Every month' },
  { value: 90, label: 'Every 3 months' },
  { value: 180, label: 'Every 6 months' },
  { value: 365, label: 'Every year' },
]

export const KEEP_IN_TOUCH_LABELS = Object.fromEntries(
  KEEP_IN_TOUCH_OPTIONS.map((o) => [o.value, o.label])
)

// Format a YYYY-MM-DD date string without timezone surprises
export function formatDate(dateString) {
  if (!dateString) return null
  const [y, m, d] = dateString.split('-').map(Number)
  if (!y || !m || !d) return dateString
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
