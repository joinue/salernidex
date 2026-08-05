import { useState } from 'react'
import { initials, avatarGradient } from '../../lib/avatar'
import { useAvatarSrc } from '../../lib/avatarStorage'

// Monogram avatar with a stable per-name gradient. `kind` lets non-person
// entities (orgs, groups) reuse the same shape with a neutral fill + icon.
// `src` (an avatar_url value — Storage path or data/URL) upgrades it to a photo,
// falling back to the monogram if it's absent or fails to load.
export default function Avatar({ name = '', size = 40, icon: Icon, kind = 'person', src }) {
  const resolved = useAvatarSrc(src)
  const [failed, setFailed] = useState(false)
  const showImage = resolved && !failed

  const isEntity = kind !== 'person'
  const style = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.38),
    background: showImage ? 'var(--fill)' : isEntity ? 'var(--fill)' : avatarGradient(name),
    color: isEntity ? 'var(--text-2)' : '#fff',
  }
  return (
    <span className="avatar" style={style} aria-hidden="true">
      {showImage ? (
        <img
          className="avatar-img"
          src={resolved}
          alt=""
          onError={() => setFailed(true)}
          style={{ width: size, height: size }}
        />
      ) : Icon ? (
        <Icon size={Math.round(size * 0.5)} />
      ) : (
        initials(name)
      )}
    </span>
  )
}
