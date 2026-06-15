// Free-text address -> { lat, lng } via Nominatim (OpenStreetMap). No API key,
// no vendor lock-in — same spirit as the rest of the app. Nominatim's usage
// policy asks for at most ~1 request/second and a descriptive identifier, so we
// serialize lookups through a single in-flight chain with a minimum gap between
// them. Results are cached on the person row (latitude/longitude/geocoded_address,
// see migration 0027) by the caller, so this is only paid once per address.

const ENDPOINT = 'https://nominatim.openstreetmap.org/search'
const MIN_GAP_MS = 1100 // be a polite Nominatim citizen

let chain = Promise.resolve()
let lastAt = 0

// In-memory cache for the lifetime of the page — avoids re-hitting the network
// for the same string twice in one session (e.g. two people share an address).
const memo = new Map()

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function lookup(address) {
  const url = `${ENDPOINT}?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`geocode ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) return null
  const { lat, lon } = data[0]
  const latNum = Number(lat)
  const lngNum = Number(lon)
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null
  return { lat: latNum, lng: lngNum }
}

// Geocode one address, throttled and de-duplicated. Resolves to { lat, lng } or
// null (no match / not an error). Network errors reject so callers can surface them.
export function geocode(address) {
  const key = (address || '').trim()
  if (!key) return Promise.resolve(null)
  if (memo.has(key)) return Promise.resolve(memo.get(key))

  // Tack this lookup onto the serial chain so requests never overlap, with a
  // minimum gap since the previous one regardless of how fast callers arrive.
  const run = chain.then(async () => {
    const since = Date.now() - lastAt
    if (since < MIN_GAP_MS) await wait(MIN_GAP_MS - since)
    lastAt = Date.now()
    const result = await lookup(key)
    memo.set(key, result)
    return result
  })
  // Keep the chain alive even if one lookup rejects.
  chain = run.catch(() => {})
  return run
}
