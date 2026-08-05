import { useState } from 'react'
import { X } from 'react-feather'
import AvatarUpload from '../../components/ui/AvatarUpload'
import IconButton from '../../components/ui/IconButton'

// Gentle, one-time prompt to put a face on your self contact card. Shows on the
// home screen for a member who has a self card (live mode) but no photo yet —
// the card is auto-created on join, this is the "and add your photo" half. The
// picker is inline, so it's done without leaving Today. Dismissal is remembered
// per card so it never nags, and it disappears for good once a photo lands.
const KEY = 'salernidex-profile-nudge-dismissed'

export default function ProfileNudge({ household }) {
  const personId = household?.personId
  const me = household?.members?.find((m) => m.id === household.memberId)
  const hasPhoto = !!me?.avatar_url

  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === personId
    } catch {
      return false
    }
  })

  // No card to attach a photo to (demo, or a not-yet-linked existing member),
  // already has one, or already dismissed → nothing to nudge.
  if (!personId || hasPhoto || dismissed) return null

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, personId)
    } catch {
      /* ignore */
    }
    setDismissed(true)
  }

  return (
    <div className="profile-nudge">
      <AvatarUpload
        variant="menu"
        size={44}
        name={me?.name}
        value={null}
        entity="people"
        onChange={(url) => household.setMyAvatar(url)}
      />
      <div className="profile-nudge-body">
        <div className="profile-nudge-title">Add your photo</div>
        <div className="profile-nudge-sub">It becomes your avatar across your household.</div>
      </div>
      <IconButton icon={X} label="Dismiss" onClick={dismiss} />
    </div>
  )
}
