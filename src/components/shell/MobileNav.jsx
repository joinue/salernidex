import { useState } from 'react'
import {
  Bell,
  CheckSquare,
  Folder,
  List,
  Plus,
  Menu,
  Activity,
  Share2,
  Briefcase,
  UserPlus,
  Users,
  FileText,
} from 'react-feather'
import Sheet from '../ui/Sheet'
import NavSheet from './NavSheet'
import { useLongPress } from '../../hooks/useLongPress'
import { useKeyboardOpen } from '../../hooks/useKeyboardOpen'
import { ACTION, MENU, INSIGHTS, DESTINATIONS, barFor } from '../../lib/nav'
import NAV_ICONS from './navIcons'

// The bottom bar, five slots on every page:
//
//   [ Today ] [ sibling ] [ ＋ ] [ neighbour ] [ ☰ ]
//
// It is a toolbar, not a tab bar, and the difference matters. A tab bar tells you
// where you are; this offers where you'd go next *from here*, so its contents
// change per page (see BAR in lib/nav.js). What doesn't change is position: slots
// 1, 3 and 5 are fixed, and the two that vary hold any given destination in the
// same slot everywhere it appears — Lists is always the fourth thing. Without
// that rule you'd have to read the bar before every tap, which is most of what
// the old fixed bar was buying.
//
// Slot 1 is Today even on Today, where it marks where you are rather than
// linking anywhere: it keeps the row from having a hole in it, and it's the one
// honest "you are here" a contextual bar can offer.
//
// The ＋ replaces the floating FAB. Being fixed, the FAB sat on top of whatever
// row was under it and had to tuck itself away on scroll to compensate; in the
// bar that problem doesn't exist. A tap still creates the obvious thing for this
// page and a long-press still opens the full menu, so cross-creating survives.
//
// Pages that deliberately have no bar (detail screens, Settings, the legal
// pages) render nothing at all — see BARLESS_ROUTES.
const DEST_BY_ID = new Map(DESTINATIONS.map((d) => [d.id, d]))

// habit-insights holds a slot without being a menu destination: you reach it
// from Habits, not from the drawer.
const INSIGHTS_ENTRY = { id: INSIGHTS, label: 'Insights', icon: 'BarChart2' }

export default function MobileNav({ route, active, adds, badge = 0, counts = {}, onLogout }) {
  const {
    go,
    onAddPerson,
    onAddTask,
    onAddProject,
    onAddNote,
    onAddList,
    onAddReminder,
    onAddHabit,
    onAddOrg,
    onAddGroup,
    onAddRelationship,
  } = adds
  const [sheet, setSheet] = useState(false)
  const [menu, setMenu] = useState(false)
  // The bar stands down while the software keyboard is up: it covers the bottom
  // of the screen anyway, and on iOS a fixed element left behind it drifts across
  // the page as Safari pans (see useKeyboardOpen). Standing down also hands the
  // freed height to whatever composer you're typing into.
  const keyboardOpen = useKeyboardOpen()
  const close = () => setSheet(false)
  const pick = (fn) => () => {
    close()
    fn()
  }

  const slots = barFor(route)

  // What ＋ makes here. Today is the one page with no single obvious answer — it's
  // the whole household at a glance — so there it opens the menu of everything,
  // which is what the FAB did on Today before.
  const primary = {
    tasks: onAddTask,
    projects: onAddProject,
    reminders: onAddReminder,
    notes: onAddNote,
    lists: onAddList,
    habits: onAddHabit,
    people: onAddPerson,
    orgs: onAddOrg,
    groups: onAddGroup,
    relationships: onAddRelationship,
  }[route]
  const onAdd = () => (primary ? primary() : setSheet(true))
  const longPress = useLongPress(() => setSheet(true))

  if (!slots) return null

  const slot = (id, i) => {
    if (id === ACTION) {
      return (
        <button
          key="action"
          className="bar-action"
          onClick={onAdd}
          aria-label={primary ? 'Add' : 'Add something'}
          {...longPress}
        >
          <Plus size={24} aria-hidden="true" />
        </button>
      )
    }
    if (id === MENU) {
      return (
        <button
          key="menu"
          className="tab"
          onClick={() => setMenu(true)}
          aria-label="All destinations"
          aria-haspopup="dialog"
        >
          <Menu size={22} aria-hidden="true" />
          <span>More</span>
        </button>
      )
    }
    const d = id === INSIGHTS ? INSIGHTS_ENTRY : DEST_BY_ID.get(id)
    // Can't happen while nav.test.js passes — it asserts every slot names a real
    // destination — but a hole is better than a crash if it ever does.
    if (!d) return <span key={`gap-${i}`} className="tab" aria-hidden="true" />
    const Icon = NAV_ICONS[d.icon]
    const current = id === route
    const count = d.badge ? badge : 0
    return (
      <button
        key={d.id}
        className={`tab ${current ? 'active' : ''}`}
        // Only ever true of slot 1 on Today. Everywhere else these are onward
        // links, not a claim about where you are.
        aria-current={current ? 'page' : undefined}
        onClick={() => go(d.id === 'today' ? '' : d.id)}
      >
        <Icon size={22} aria-hidden="true" />
        <span>{d.label}</span>
        {count > 0 && (
          <span className="tab-badge" aria-label={`${count} needing attention`}>
            {count}
          </span>
        )}
      </button>
    )
  }

  return (
    <>
      <nav
        className={`tabbar ${keyboardOpen ? 'tucked' : ''}`}
        // "Main" would overclaim: this is the way onward from this page, and the
        // complete list of destinations lives behind ☰.
        aria-label="Page navigation"
        // Hidden chrome must leave the a11y tree and the focus order too, or an
        // iPad hardware keyboard tabs into five invisible destinations. `inert`
        // does both; React 18 needs it as an empty string rather than a bool.
        inert={keyboardOpen ? '' : undefined}
      >
        {slots.map(slot)}
      </nav>

      {menu && (
        <NavSheet
          active={active}
          go={go}
          badge={badge}
          counts={counts}
          onLogout={onLogout}
          onClose={() => setMenu(false)}
        />
      )}

      {sheet && (
        <Sheet title="Add" onClose={close}>
          <button className="sheet-item" onClick={pick(onAddPerson)}>
            <UserPlus size={20} /> Person
          </button>
          <button className="sheet-item" onClick={pick(onAddTask)}>
            <CheckSquare size={20} /> Task
          </button>
          <button className="sheet-item" onClick={pick(onAddProject)}>
            <Folder size={20} /> Project
          </button>
          <button className="sheet-item" onClick={pick(onAddReminder)}>
            <Bell size={20} /> Reminder
          </button>
          <button className="sheet-item" onClick={pick(onAddNote)}>
            <FileText size={20} /> Note
          </button>
          <button className="sheet-item" onClick={pick(onAddList)}>
            <List size={20} /> List
          </button>
          <button className="sheet-item" onClick={pick(onAddHabit)}>
            <Activity size={20} /> Habit
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
    </>
  )
}
