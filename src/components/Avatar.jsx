import { initials, avatarGradient } from '../lib/avatar'

// Monogram avatar with a stable per-name gradient. `kind` lets non-person
// entities (orgs, groups) reuse the same shape with a neutral fill + icon.
export default function Avatar({ name = '', size = 40, icon: Icon, kind = 'person' }) {
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
    </span>
  )
}
