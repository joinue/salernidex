import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Trash2 } from 'react-feather'
import Cropper from 'react-easy-crop'
import Avatar from './Avatar'
import Sheet from './Sheet'
import { cropToBlob, uploadAvatar } from '../lib/avatarStorage'

// Photo picker for people / orgs / groups: shows the current avatar (or the
// monogram fallback), lets you pick an image, frame it in a round crop, and
// upload it. `entity` is the Storage path segment ('people' | 'orgs' |
// 'groups'); `kind` and `icon` are passed through to Avatar for the fallback.
//
// Two layouts:
//   'inline' (default) — the avatar plus Change/Remove text buttons, for forms.
//   'menu'             — just the avatar; tapping it opens an action sheet with
//                        the same options. Used on the contact page header.
export default function AvatarUpload({
  value,
  onChange,
  name,
  kind = 'person',
  icon,
  entity,
  demo = false,
  variant = 'inline',
  size = 64,
}) {
  const fileRef = useRef(null)
  const [fileSrc, setFileSrc] = useState(null) // object URL of the picked image (drives the crop modal)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [pixels, setPixels] = useState(null) // croppedAreaPixels from react-easy-crop
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false) // action sheet (menu variant)

  const openPicker = () => fileRef.current?.click()

  const pick = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setFileSrc(URL.createObjectURL(file))
  }

  const closeCrop = () => {
    if (fileSrc) URL.revokeObjectURL(fileSrc)
    setFileSrc(null)
    setPixels(null)
  }

  const confirm = async () => {
    if (!pixels) return
    setBusy(true)
    setError(null)
    try {
      const blob = await cropToBlob(fileSrc, pixels)
      const next = await uploadAvatar(entity, blob, { demo })
      // Note: a replaced photo's old Storage object is left orphaned rather than
      // deleted here — the form may still be cancelled, which would otherwise
      // leave the saved row pointing at a deleted object. Cleanup is a follow-up.
      onChange(next)
      closeCrop()
    } catch (err) {
      setError(err.message || 'Could not save photo')
    } finally {
      setBusy(false)
    }
  }

  const remove = () => onChange(null)

  // Tapping the avatar: forms go straight to the picker (the buttons cover the
  // rest); the menu variant opens the options sheet. stopPropagation keeps a tap
  // from also firing an enclosing row's onClick (e.g. the org/group list rows).
  const onAvatarTap = (e) => {
    e?.stopPropagation()
    if (variant === 'menu') setMenuOpen(true)
    else openPicker()
  }

  // Badge scales with the avatar so it reads on a 42px list row and an 88px
  // header alike, without dominating the small one.
  const badgeDim = Math.min(24, Math.max(15, Math.round(size * 0.3)))
  const badgeIcon = Math.max(11, Math.round(badgeDim * 0.58))

  const avatarButton = (
    <button
      type="button"
      className="avatar-tap"
      onClick={onAvatarTap}
      aria-label={value ? 'Change photo' : 'Add photo'}
    >
      <Avatar name={name} src={value} kind={kind} icon={icon} size={size} />
      <span className="avatar-tap-badge" style={{ width: badgeDim, height: badgeDim }} aria-hidden="true">
        <Camera size={badgeIcon} />
      </span>
    </button>
  )

  return (
    <>
      {variant === 'inline' ? (
        <div className="avatar-upload">
          {avatarButton}
          <div className="avatar-upload-actions">
            <button type="button" className="text-btn" onClick={openPicker}>
              {value ? 'Change photo' : 'Add photo'}
            </button>
            {value && (
              <button type="button" className="text-btn danger" onClick={remove}>
                Remove
              </button>
            )}
          </div>
        </div>
      ) : (
        avatarButton
      )}

      <input ref={fileRef} type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />

      {menuOpen && (
        <Sheet title="Photo" onClose={() => setMenuOpen(false)}>
          <button
            className="sheet-item"
            onClick={() => {
              setMenuOpen(false)
              openPicker()
            }}
          >
            <Camera size={20} /> {value ? 'Change photo' : 'Add photo'}
          </button>
          {value && (
            <button
              className="sheet-item danger"
              onClick={() => {
                setMenuOpen(false)
                remove()
              }}
            >
              <Trash2 size={20} /> Remove photo
            </button>
          )}
        </Sheet>
      )}

      {fileSrc &&
        createPortal(
          <div className="crop-overlay" role="dialog" aria-label="Crop photo">
            <div className="crop-card">
              <div className="crop-stage">
                <Cropper
                  image={fileSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, px) => setPixels(px)}
                />
              </div>
              <input
                className="crop-zoom"
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                aria-label="Zoom"
              />
              {error && <p className="error-text" style={{ margin: '0 16px' }}>{error}</p>}
              <div className="crop-actions">
                <button type="button" className="crop-btn" onClick={closeCrop} disabled={busy}>
                  Cancel
                </button>
                <button type="button" className="crop-btn primary" onClick={confirm} disabled={busy || !pixels}>
                  {busy ? <span className="dots">Saving</span> : 'Use photo'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
