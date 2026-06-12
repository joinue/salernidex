import { Share2, Briefcase, Users, DownloadCloud, LogOut } from 'react-feather'
import Sheet from './Sheet'

// Overflow menu (mobile). Always lists the rolodex/network destinations. When
// `onLogout` is passed (the global menu from Today) it also shows logout.
// Settings + theme live one tap away in the Today header → Settings, so they're
// not repeated here.
export default function MoreSheet({ go, onLogout, onClose, title = 'More' }) {
  const pick = (fn) => () => {
    onClose()
    fn()
  }
  return (
    <Sheet title={title} onClose={onClose}>
      <button className="sheet-item" onClick={pick(() => go('relationships'))}>
        <Share2 size={20} /> Network
      </button>
      <button className="sheet-item" onClick={pick(() => go('orgs'))}>
        <Briefcase size={20} /> Organizations
      </button>
      <button className="sheet-item" onClick={pick(() => go('groups'))}>
        <Users size={20} /> Groups
      </button>
      <button className="sheet-item" onClick={pick(() => go('import'))}>
        <DownloadCloud size={20} /> Import / Export
      </button>
      {onLogout && (
        <>
          <div className="sheet-divider" />
          <button className="sheet-item danger" onClick={pick(onLogout)}>
            <LogOut size={20} /> Logout
          </button>
        </>
      )}
    </Sheet>
  )
}
