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
//
// Two vocabularies, one column. The personal tiers are a closeness ladder; the
// business ones (0042) are a role, and ranking a client "closer" than a vendor
// would be meaningless — so they rank AFTER the whole personal ladder, in a
// stable order of their own, and the tier sort stays a sentence you can say out
// loud ("family first, strangers last, business at the end").
//
// Which set a contact is OFFERED depends on its context area being business-
// related (tiersFor below). Which set it may KEEP does not: retyping an area
// must never silently blank a tier someone chose, so every value stays legal on
// every contact and the picker is the only thing that narrows.
export const PERSONAL_TIERS = [
  { value: 'family', label: 'Family' },
  { value: 'inner', label: 'Inner circle' },
  { value: 'close', label: 'Close' },
  { value: 'network', label: 'Network' },
  { value: 'acquaintance', label: 'Acquaintance' },
]

// Deliberately roles, not stages. "Prospect → Client" is the one pair that
// reads like a pipeline, and it earns its place because a solo operator really
// does need to tell the two apart; anything further (Qualified, Negotiating,
// Won) is the salesy register this app has always refused. See ROADMAP "Warm,
// not salesy" — the line is that these describe who someone IS to the business,
// never how far along they are in being sold to.
export const BUSINESS_TIERS = [
  { value: 'client', label: 'Client' },
  { value: 'prospect', label: 'Prospect' },
  { value: 'partner', label: 'Partner' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'advisor', label: 'Advisor' },
]

export const TIERS = [...PERSONAL_TIERS, ...BUSINESS_TIERS]

export const TIER_LABELS = Object.fromEntries(TIERS.map((t) => [t.value, t.label]))
export const TIER_RANK = Object.fromEntries(TIERS.map((t, i) => [t.value, i]))

// The tiers to OFFER for a contact, given whether its context area is
// business-related. Additive, never subtractive: a business contact still gets
// the personal ladder underneath, because the whole premise of the business-area
// flag is that a client can also be a friend (docs/scopes/areas-and-tags.md
// §3.2). Only the order changes — what you're most likely to want goes first.
export function tiersFor(isBusiness) {
  return isBusiness ? [...BUSINESS_TIERS, ...PERSONAL_TIERS] : PERSONAL_TIERS
}

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
//
// The short end (0042) exists for the business half. A month was the floor, which
// is the right shape for a friend and useless for anyone you are actually working
// with — a founder chasing a deal thinks in weeks, and a cadence you can't
// express is a cadence you keep in your head instead. The column has always been
// a plain `integer >= 0`; only this list was narrow.
//
// Everyone gets every option. The weekly ones are listed first for a business
// contact and last for a personal one (see cadenceOptionsFor) — nothing is
// hidden, because "every week" is a perfectly reasonable thing to want with a
// parent, and a picker that refused it would be making a judgement it has no
// business making.
export const KEEP_IN_TOUCH_OPTIONS = [
  { value: 0, label: 'No reminder' },
  { value: 7, label: 'Every week', short: true },
  { value: 14, label: 'Every 2 weeks', short: true },
  { value: 21, label: 'Every 3 weeks', short: true },
  { value: 30, label: 'Every month' },
  { value: 90, label: 'Every 3 months' },
  { value: 180, label: 'Every 6 months' },
  { value: 365, label: 'Every year' },
]

export const KEEP_IN_TOUCH_LABELS = Object.fromEntries(
  KEEP_IN_TOUCH_OPTIONS.map((o) => [o.value, o.label]),
)

// Cadence choices ordered for the contact in hand. "No reminder" stays pinned at
// the top in both orders — it's the default and the way out, not a duration.
export function cadenceOptionsFor(isBusiness) {
  const [none, ...rest] = KEEP_IN_TOUCH_OPTIONS
  if (isBusiness) return [none, ...rest]
  const short = rest.filter((o) => o.short)
  const long = rest.filter((o) => !o.short)
  return [none, ...long, ...short]
}

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
