import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { getHousehold } from './household'

// Avatar images for people / orgs / groups. The `avatar_url` column stores a
// bucket-relative OBJECT PATH ('<household_id>/<kind>/<uuid>.jpg') in live mode,
// or — in demo / when Storage isn't reachable — an inline data: URL that lives
// only in local state. Both resolve through useAvatarSrc() below, so callers
// never need to know which one they hold.

const BUCKET = 'avatars'
const TARGET = 512 // square output edge, px — small enough to keep rows light
const SIGN_TTL = 3600 // signed-URL lifetime, seconds

// ---- crop → blob -------------------------------------------------------
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Draw the user's crop rectangle (in source pixels, from react-easy-crop's
// croppedAreaPixels) into a fixed-size square canvas → a JPEG blob.
export async function cropToBlob(imageSrc, crop) {
  const img = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = TARGET
  canvas.height = TARGET
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, TARGET, TARGET)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not process image'))),
      'image/jpeg',
      0.85,
    )
  })
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// ---- upload / remove ---------------------------------------------------
// Returns the value to store in avatar_url: a Storage path (live) or a data:
// URL (demo / unconfigured). Live failures throw so the form can surface them.
export async function uploadAvatar(kind, blob, { demo } = {}) {
  const householdId = getHousehold()?.id
  if (demo || !supabase || !householdId) return blobToDataUrl(blob)
  const path = `${householdId}/${kind}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false })
  if (error) throw new Error(error.message || 'Photo upload failed')
  return path
}

// Best-effort cleanup when a photo is replaced or removed. Data URLs and
// external URLs have no Storage object, so they're a no-op.
export async function removeAvatar(value) {
  if (!supabase || !value || directUrl(value)) return
  await supabase.storage
    .from(BUCKET)
    .remove([value])
    .catch(() => {})
}

// ---- resolve to a renderable URL --------------------------------------
// A value that's already a usable URL (data:/blob:/http) renders as-is; a bare
// Storage path needs a signed URL.
export function directUrl(value) {
  if (!value) return null
  return /^(https?:|data:|blob:)/.test(value) ? value : null
}

// Signing used to be one network round-trip per Avatar, fired from each one's
// own effect — a list of forty contacts opened forty requests before a single
// photo byte moved, which is why avatars trickled in. Two things fix that:
//
//   1. Every path requested in the same tick is signed in ONE createSignedUrls
//      call, so a whole page costs a single round-trip no matter how many faces
//      are on it (and duplicates of a path share one entry).
//   2. Results are cached for the life of the signature AND mirrored into
//      sessionStorage, so a reload or a re-entry into a list paints photos on
//      the first frame instead of after a round-trip.
const CACHE_KEY = 'sdx:avatar-src'
const MAX_BATCH = 100 // paths per createSignedUrls call

const signedCache = new Map() // path -> { url, expires }

// Rehydrate on module load: signatures live an hour, so most reloads land on a
// cache that's still good. Anything expired (or unreadable, e.g. private mode)
// is simply dropped and re-signed on demand.
try {
  const saved = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}')
  const now = Date.now()
  for (const [path, hit] of Object.entries(saved)) {
    if (hit?.url && hit.expires > now) signedCache.set(path, hit)
  }
} catch {
  /* no session storage, or garbage in it — start cold */
}

let persistTimer = null
function persist() {
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    try {
      const now = Date.now()
      const out = {}
      for (const [path, hit] of signedCache) if (hit.expires > now) out[path] = hit
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(out))
    } catch {
      /* quota or private mode — the in-memory cache still stands */
    }
  }, 250)
}

const inflight = new Map() // path -> Promise<string|null>, so N Avatars sharing a path share one job
let queued = [] // { path, resolve } awaiting the next flush
let flushScheduled = false

async function flush() {
  flushScheduled = false
  const jobs = queued
  queued = []
  if (!jobs.length) return
  const paths = [...new Set(jobs.map((j) => j.path))]
  const urls = new Map()
  try {
    for (let i = 0; i < paths.length; i += MAX_BATCH) {
      const chunk = paths.slice(i, i + MAX_BATCH)
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(chunk, SIGN_TTL)
      // Rows come back in request order; `path` is echoed but is null on the
      // error rows, so the index is the reliable way home.
      ;(data || []).forEach((row, j) => {
        if (row?.signedUrl && !row.error) urls.set(row.path ?? chunk[j], row.signedUrl)
      })
    }
  } catch {
    /* offline / Storage down — everyone falls back to the monogram and a later
       mount retries, since nothing failed gets cached */
  }
  if (urls.size) {
    const expires = Date.now() + (SIGN_TTL - 120) * 1000
    for (const [path, url] of urls) signedCache.set(path, { url, expires })
    persist()
  }
  for (const job of jobs) job.resolve(urls.get(job.path) ?? null)
}

// Joins the current batch, or starts one. The microtask flush is what collapses
// a page's worth of mounts into a single request: React runs every Avatar's
// effect in one task, so they all land here before the queue drains.
function signedUrl(path) {
  if (!path || !supabase) return Promise.resolve(null)
  const hit = signedCache.get(path)
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.url)
  const existing = inflight.get(path)
  if (existing) return existing
  const job = new Promise((resolve) => queued.push({ path, resolve })).finally(() =>
    inflight.delete(path),
  )
  inflight.set(path, job)
  if (!flushScheduled) {
    flushScheduled = true
    queueMicrotask(flush)
  }
  return job
}

// What we can render for `value` with no network at all: a direct URL, or a
// signature still in cache. Null means "ask the network".
export function cachedAvatarSrc(value) {
  const direct = directUrl(value)
  if (direct || !value) return direct
  const hit = signedCache.get(value)
  return hit && hit.expires > Date.now() ? hit.url : null
}

// Resolve an avatar_url value to something an <img src> can use. Anything
// already known — a data URL, an external link, a cached signature — comes back
// on the first render, so a warm avatar never flashes its monogram; only a cold
// Storage path waits a tick for the batch.
export function useAvatarSrc(value) {
  const [src, setSrc] = useState(() => cachedAvatarSrc(value))
  useEffect(() => {
    const known = cachedAvatarSrc(value)
    if (known || !value) {
      setSrc(known)
      return
    }
    setSrc(null)
    let active = true
    signedUrl(value).then((url) => active && setSrc(url))
    return () => {
      active = false
    }
  }, [value])
  return src
}

// Test seam: drop every cached signature (and the batch state behind it).
export function resetAvatarCache() {
  signedCache.clear()
  inflight.clear()
  queued = []
  try {
    sessionStorage.removeItem(CACHE_KEY)
  } catch {
    /* nothing to clear */
  }
}
