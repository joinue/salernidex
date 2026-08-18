import { useCallback, useState } from 'react'
import { initials, avatarGradient } from '../../lib/avatar'
import { useAvatarSrc } from '../../lib/avatarStorage'

// Monogram avatar with a stable per-name gradient. `kind` lets non-person
// entities (orgs, groups) reuse the same shape with a neutral fill + icon.
// `src` (an avatar_url value — Storage path or data/URL) upgrades it to a photo,
// falling back to the monogram if it's absent or fails to load.
//
// The monogram is always rendered underneath, and the photo fades in on top
// once it has actually decoded. So there is never a blank disc waiting on the
// network: you get the person's colors immediately and their face a moment
// later, instead of a row of holes filling in one by one.
export default function Avatar({ name = '', size = 40, icon: Icon, kind = 'person', src }) {
  const resolved = useAvatarSrc(src)
  const [failedSrc, setFailedSrc] = useState(null) // tracked per-URL, so a new photo isn't judged by the old one's failure
  const [readySrc, setReadySrc] = useState(null)
  const showImage = resolved && failedSrc !== resolved

  // An image the browser already has decoded can fire `load` before React hears
  // it; catch that case when the element attaches so it can't stay invisible.
  const attach = useCallback(
    (img) => {
      if (img?.complete && img.naturalWidth) setReadySrc(resolved)
    },
    [resolved],
  )

  const isEntity = kind !== 'person'
  const style = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.38),
    background: isEntity ? 'var(--fill)' : avatarGradient(name),
    color: isEntity ? 'var(--text-2)' : '#fff',
  }
  return (
    <span className="avatar" style={style} aria-hidden="true">
      {Icon ? <Icon size={Math.round(size * 0.5)} /> : initials(name)}
      {showImage && (
        <img
          ref={attach}
          className={`avatar-img${readySrc === resolved ? ' is-ready' : ''}`}
          src={resolved}
          alt=""
          decoding="async"
          onLoad={() => setReadySrc(resolved)}
          onError={() => setFailedSrc(resolved)}
        />
      )}
    </span>
  )
}
