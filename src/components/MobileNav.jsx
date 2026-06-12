import { useState } from 'react'
import { Search, Users, Plus, Share2, Menu, Briefcase, DownloadCloud, LogOut, UserPlus } from 'react-feather'
import ThemeToggle from './ThemeToggle'

function Sheet({ title, onClose, children }) {
  return (
    <div className="sheet-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label={title}>
        <div className="sheet-handle" />
        {title && <div className="sheet-title">{title}</div>}
        {children}
      </div>
    </div>
  )
}

export default function MobileNav({ active, go, onAddPerson, onAddOrg, onAddGroup, onAddRelationship, onLogout }) {
  const [sheet, setSheet] = useState(null) // null | 'add' | 'more'
  const close = () => setSheet(null)
  const pick = (fn) => () => {
    close()
    fn()
  }

  const Tab = ({ id, icon: Icon, text, onClick }) => (
    <button
      className={`tab ${active === id ? 'active' : ''}`}
      onClick={onClick || (() => go(id === 'search' ? '' : id))}
    >
      <Icon size={22} />
      <span>{text}</span>
    </button>
  )

  return (
    <>
      <nav className="tabbar">
        <Tab id="search" icon={Search} text="Search" />
        <Tab id="groups" icon={Users} text="Groups" />
        <button className="tab-add" onClick={() => setSheet('add')} aria-label="Add">
          <span className="add-circle">
            <Plus size={24} />
          </span>
        </button>
        <Tab id="relationships" icon={Share2} text="Network" />
        <Tab id="more" icon={Menu} text="More" onClick={() => setSheet(sheet === 'more' ? null : 'more')} />
      </nav>

      {sheet === 'add' && (
        <Sheet title="Add" onClose={close}>
          <button className="sheet-item" onClick={pick(onAddPerson)}>
            <UserPlus size={20} /> Person
          </button>
          <button className="sheet-item" onClick={pick(onAddOrg)}>
            <Briefcase size={20} /> Organization
          </button>
          <button className="sheet-item" onClick={pick(onAddRelationship)}>
            <Share2 size={20} /> Relationship
          </button>
          <button className="sheet-item" onClick={pick(onAddGroup)}>
            <Users size={20} /> Group
          </button>
        </Sheet>
      )}

      {sheet === 'more' && (
        <Sheet title="Salernidex" onClose={close}>
          <button className="sheet-item" onClick={pick(() => go('orgs'))}>
            <Briefcase size={20} /> Organizations
          </button>
          <button className="sheet-item" onClick={pick(() => go('import'))}>
            <DownloadCloud size={20} /> Import / Export
          </button>
          <ThemeToggle className="sheet-item" iconSize={20} />
          <button className="sheet-item" onClick={pick(onLogout)}>
            <LogOut size={20} /> Logout
          </button>
        </Sheet>
      )}
    </>
  )
}
