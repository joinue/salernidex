// Structured address <-> single canonical string. We store ONE `address`
// string — that's what Google Maps resolves cleanly and what the vCard export
// writes — and use the structured fields only to help the user build it
// consistently. Parsing an existing string back into fields is best-effort so
// editing prefills sensibly; worst case the whole thing lands in `street`,
// which is non-destructive.

export function formatAddress({ street, city, state, zip, country } = {}) {
  const region = [state, zip]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join(' ')
  return [street, city, region, country]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join(', ')
}

// An address, opened in Google Maps. Null when there's nothing to look up, so
// a caller can decide between a link and a plain row the same way `websiteUrl`
// lets one decide (lib/orgs.js) — an <a> with no href is still focusable and
// still looks tappable, which is worse than not being a link at all.
//
// The documented `?api=1` search form rather than a bare `maps.google.com/?q=`:
// it is the URL Google guarantees, and on a phone it hands off to the Maps app
// when it's installed instead of opening a web map inside the browser.
//
// A search, not a `dir` directions link. We store one canonical string and no
// coordinates (see formatAddress above), and directions from an unknown origin
// would make the phone ask where you're starting from before it can show you
// anything. Searching lands on the pin, where "Directions" is one tap away.
export function mapsUrl(address) {
  const q = (address || '').trim()
  if (!q) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

const EMPTY = { street: '', city: '', state: '', zip: '', country: '' }

export function parseAddress(value) {
  if (!value || typeof value !== 'string') return { ...EMPTY }
  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0) return { ...EMPTY }
  if (parts.length === 1) return { ...EMPTY, street: parts[0] }

  // Peel known chunks off the end: [street…, city, "state zip", country?].
  const rest = [...parts]
  const country = rest.length >= 4 ? rest.pop() : ''
  const region = rest.length >= 3 ? rest.pop() : ''
  const city = rest.length >= 2 ? rest.pop() : ''
  const street = rest.join(', ')

  // Split "IL 62704" into state + zip (zip = trailing token containing a digit).
  let state = region
  let zip = ''
  const m = region.match(/^(.*?)[\s,]+([\w-]*\d[\w-]*)$/)
  if (m) {
    state = m[1].trim()
    zip = m[2].trim()
  }
  return { street, city, state, zip, country }
}
