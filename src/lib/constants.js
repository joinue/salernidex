import { Phone, MessageCircle, Mail, Coffee, Edit3 } from 'react-feather'

// On phones we don't auto-focus a sheet's first field — popping the keyboard
// the instant a sheet opens covers the form and feels jarring. Desktop keeps
// autofocus so you can type right away. Used as `autoFocus={focusOnDesktop()}`.
export const focusOnDesktop = () =>
  typeof window !== 'undefined' && window.matchMedia('(min-width: 721px)').matches

// 'private' means "Private — only me": rows with it are hidden from other
// household members (lib/privacy.js). The enum value was renamed from the
// legacy 'marc_only' in migration 0023.
export const PRIVACY_LABELS = {
  private: 'Private, only me',
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
  { value: 'family', label: 'Family' },
  { value: 'inner', label: 'Inner circle' },
  { value: 'close', label: 'Close' },
  { value: 'network', label: 'Network' },
  { value: 'acquaintance', label: 'Acquaintance' },
]

export const TIER_LABELS = Object.fromEntries(TIERS.map((t) => [t.value, t.label]))
export const TIER_RANK = Object.fromEntries(TIERS.map((t, i) => [t.value, i]))

// Labels for additional emails/phones (Apple Contacts style). Freeform values
// are allowed on import, but the editor offers these as the picker options.
export const EMAIL_LABELS = ['Home', 'Work', 'Other']
export const PHONE_LABELS = ['Mobile', 'Home', 'Work', 'Other']

// Social profiles. `base` builds an openable URL from a bare handle; when null
// the stored value is expected to be a full URL (or non-linkable handle).
export const SOCIAL_PLATFORMS = [
  {
    id: 'linkedin',
    label: 'LinkedIn',
    base: 'https://www.linkedin.com/in/',
    placeholder: 'username',
  },
  { id: 'instagram', label: 'Instagram', base: 'https://instagram.com/', placeholder: 'username' },
  { id: 'x', label: 'X', base: 'https://x.com/', placeholder: 'username' },
  { id: 'facebook', label: 'Facebook', base: 'https://facebook.com/', placeholder: 'username' },
  { id: 'github', label: 'GitHub', base: 'https://github.com/', placeholder: 'username' },
  { id: 'website', label: 'Website', base: null, placeholder: 'https://…' },
  { id: 'other', label: 'Other', base: null, placeholder: 'link or handle' },
]

export const SOCIAL_BY_ID = Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.id, p]))

// "Keep in touch" cadence presets, stored as days (0 = no reminder).
export const KEEP_IN_TOUCH_OPTIONS = [
  { value: 0, label: 'No reminder' },
  { value: 30, label: 'Every month' },
  { value: 90, label: 'Every 3 months' },
  { value: 180, label: 'Every 6 months' },
  { value: 365, label: 'Every year' },
]

export const KEEP_IN_TOUCH_LABELS = Object.fromEntries(
  KEEP_IN_TOUCH_OPTIONS.map((o) => [o.value, o.label]),
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
