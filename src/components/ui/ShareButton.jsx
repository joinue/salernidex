import { Share } from 'react-feather'
import Button from './Button'
import IconButton from './IconButton'
import { canShare, shareItem } from '../../lib/share'
import { showToast } from '../../lib/toast'

// "Send this to them." One control, so every detail screen shares the same way
// and none of them has to know what the platform supports.
//
// Renders nothing at all for an item that can't be sent — a private row, whose
// link would land the recipient on "not found". An always-present button that
// explains itself only after being tapped is worse than no button.
//
// `trigger` picks the shape, matching AddToCalendar: detail screens that keep
// their actions in the NavBar want the icon, the ones with a pill row want a
// pill. Same behavior either way.
export default function ShareButton({ type, row, size = 'sm', label = 'Share', trigger = 'icon' }) {
  if (!canShare(type, row)) return null

  const onClick = async () => {
    const result = await shareItem(type, row, { origin: window.location.origin })
    // 'shared' and 'cancelled' both say nothing: the OS sheet has already given
    // its own feedback, and a toast confirming a share the user just abandoned
    // is the app talking over them.
    if (result === 'copied') showToast('Link copied')
    else if (result === 'failed') showToast('Could not share that link', { variant: 'error' })
  }

  if (trigger === 'pill') {
    return (
      <Button variant="pill" icon={Share} onClick={onClick}>
        Send
      </Button>
    )
  }
  return <IconButton icon={Share} label={label} size={size} onClick={onClick} />
}
