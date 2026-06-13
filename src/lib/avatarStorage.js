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

// Signed URLs are cached per path until shortly before they expire, so the many
// Avatars on a page share one network round-trip per image.
const signedCache = new Map() // path -> { url, expires }

async function signedUrl(path) {
  if (!path || !supabase) return null
  const hit = signedCache.get(path)
  if (hit && hit.expires > Date.now()) return hit.url
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGN_TTL)
  if (error || !data?.signedUrl) return null
  signedCache.set(path, { url: data.signedUrl, expires: Date.now() + (SIGN_TTL - 120) * 1000 })
  return data.signedUrl
}

// Resolve an avatar_url value to something an <img src> can use. Direct URLs
// (demo data URLs, external links) return synchronously; Storage paths resolve
// to a signed URL on the next tick.
export function useAvatarSrc(value) {
  const [src, setSrc] = useState(() => directUrl(value))
  useEffect(() => {
    const direct = directUrl(value)
    if (direct || !value) {
      setSrc(direct)
      return
    }
    let active = true
    signedUrl(value).then((url) => active && setSrc(url))
    return () => {
      active = false
    }
  }, [value])
  return src
}
