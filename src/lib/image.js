// Downscale a picked image file to a compact JPEG data: URL. Notes embed images
// inline in their HTML body (see lib/notes.js sanitizer), so they ride the same
// RLS + privacy rules as the note itself and need no Storage bucket. Downscaling
// keeps the base64 payload reasonable (rows + realtime stay light).

const MAX_EDGE = 1280 // longest side, px
const QUALITY = 0.72

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Returns a 'data:image/jpeg;base64,…' string. Throws on a non-image or a
// decode failure so the caller can surface it.
export async function fileToImageDataUrl(file) {
  if (!file || !file.type?.startsWith('image/')) throw new Error('That file isn’t an image.')
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImage(objectUrl)
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', QUALITY)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
