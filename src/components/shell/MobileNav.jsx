import { useState } from 'react'
import {
  Home,
  User as PeopleIcon,
  CheckSquare,
  Folder,
  List,
  Plus,
  Activity,
  Share2,
  Briefcase,
  UserPlus,
  Users,
} from 'react-feather'
import Sheet from '../ui/Sheet'
import { useLongPress } from '../../hooks/useLongPress'
import { useHideOnScroll } from '../../hooks/useHideOnScroll'
import { useKeyboardOpen } from '../../hooks/useKeyboardOpen'

// Bottom bar: Today · People · Habits · Tasks · Lists, with a floating ➕ above
// the pill. The FAB is page-aware — a tap creates the obvious thing for the
// current tab; a long-press opens the full add menu so you can cross-create
// from anywhere. (The ➕ used to sit in the bar's center, but adding Habits
// needed that slot, so it floats now.)
export default function MobileNav({
  active,
  adds,
  badge = 0,
  hideFab = false,
  hideTabs = false,
  forceMenu = false,
  scrollRef,
}) {
  const {
    go,
    onAddPerson,
    onAddTask,
    onAddProject,
    onAddList,
    onAddHabit,
    onAddOrg,
    onAddGroup,
    onAddRelationship,
  } = adds
  const [sheet, setSheet] = useState(false)
  // Both pieces of chrome stand down while the keyboard is up: it covers the
  // bottom of the screen anyway, and on iOS a fixed element left behind it
  // drifts across the page as Safari pans (see useKeyboardOpen). Standing down
  // also hands the freed height to whatever composer you're typing into — the
  // same thing iOS does natively.
  const keyboardOpen = useKeyboardOpen()
  // Tuck the FAB while scrolling down — it's fixed, so otherwise it sits on top
  // of whatever row happens to be under it. Never while the add sheet is open.
  const tucked = useHideOnScroll(scrollRef, !hideFab && !sheet) || keyboardOpen
  const close = () => setSheet(false)
  const pick = (fn) => () => {
    close()
    fn()
  }

  // tap → the primary create for this tab; ambiguous tabs open the menu
  const primary = {
    people: onAddPerson,
    tasks: onAddTask,
    projects: onAddProject,
    lists: onAddList,
    habits: onAddHabit,
    orgs: onAddOrg,
    groups: onAddGroup,
    relationships: onAddRelationship,
  }[active]
  // On an entity detail page the tab's "primary" create would make a sibling
  // (another person while viewing one), so fall back to the cross-create menu —
  // the FAB stays a quick-capture button without the misleading default.
  const onFab = () => (primary && !forceMenu ? primary() : setSheet(true))
  const longPress = useLongPress(() => setSheet(true))

  const Tab = ({ id, icon: Icon, text, count = 0 }) => {
    const current = active === id
    return (
      <button
        className={`tab ${current ? 'active' : ''}`}
        // aria-current is what tells a screen reader which destination it's on;
        // the blue tint alone says nothing.
        aria-current={current ? 'page' : undefined}
        onClick={() => go(id === 'today' ? '' : id)}
      >
        <Icon size={22} aria-hidden="true" />
        <span>{text}</span>
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
      {/* The list detail screen hides the FAB outright — its add-item dock owns
          creation. Other detail pages keep it (see forceMenu above) so global
          quick-capture stays one tap away. */}
      {!hideFab && (
        <button
          className={`fab ${tucked ? 'tucked' : ''}`}
          onClick={onFab}
          aria-label="Add"
          aria-hidden={tucked || undefined}
          tabIndex={tucked ? -1 : undefined}
          {...longPress}
        >
          <Plus size={26} aria-hidden="true" />
        </button>
      )}

      {/* An immersive screen (the note composer) drops the bar outright rather
          than tucking it: `tucked` is a temporary stand-down that comes back on
          its own, and there's nothing here to come back for. */}
      {!hideTabs && (
        <nav
          className={`tabbar ${keyboardOpen ? 'tucked' : ''}`}
          aria-label="Main"
          // Hidden chrome must leave the a11y tree and the focus order too, or an
          // iPad hardware keyboard tabs into five invisible destinations. `inert`
          // does both; React 18 needs it as an empty string rather than a bool.
          inert={keyboardOpen ? '' : undefined}
        >
          <Tab id="today" icon={Home} text="Today" count={badge} />
          <Tab id="people" icon={PeopleIcon} text="People" />
          <Tab id="habits" icon={Activity} text="Habits" />
          <Tab id="tasks" icon={CheckSquare} text="Tasks" />
          <Tab id="lists" icon={List} text="Lists" />
        </nav>
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
