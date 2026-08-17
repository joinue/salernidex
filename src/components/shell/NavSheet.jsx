import { Fragment } from 'react'
import { Check } from 'react-feather'
import Sheet from '../ui/Sheet'
import { destinationGroups } from '../../lib/nav'
import NAV_ICONS from './navIcons'

// The mobile menu: every destination the app has, from the same table the
// desktop sidebar renders. It exists because the bottom bar can only hold two
// contextual slots, and a phone was previously reaching five of the twelve
// destinations — Notes, a top-level feature, was one button on one page.
//
// Right-anchored (see Sheet's `side`), because ☰ is the bar's last slot, at the
// bottom right, and a panel should arrive from the edge its control sits on. Its
// Close sits at the foot for the same reason: that's where the thumb already is.
//
// Destinations ONLY. Settings, Import / Export, the theme and Logout were the
// last four rows here, which meant the nearest thing to the thumb that opened
// this was a red Logout. They're behind the account avatar now, in the top-right
// corner — the hardest one to reach by accident, which is where rare and
// damaging things belong.
export default function NavSheet({ active, go, onClose, badge = 0, counts = {} }) {
  const pick = (id) => () => {
    onClose()
    go(id === 'today' ? '' : id)
  }

  return (
    <Sheet side="right" title="Go to" onClose={onClose}>
      {destinationGroups().map((group) => (
        <Fragment key={group.label || 'main'}>
          {group.label && <div className="sheet-group">{group.label}</div>}
          {group.items
            .filter((d) => !d.pending)
            .map((d) => {
              const Icon = NAV_ICONS[d.icon]
              const current = active === d.id
              const count = d.badge ? badge : counts[d.count] || 0
              return (
                <button
                  key={d.id}
                  className={`sheet-item ${current ? 'current' : ''}`}
                  // The menu is a list of destinations, so the one you're on is
                  // the current page — same claim the sidebar's active item and
                  // the bar's Today slot make.
                  aria-current={current ? 'page' : undefined}
                  onClick={pick(d.id)}
                >
                  <Icon size={20} aria-hidden="true" />
                  <span className="sheet-item-label">{d.label}</span>
                  {count > 0 && (
                    <span className={d.badge ? 'nav-badge' : 'nav-count'}>{count}</span>
                  )}
                  {current && <Check size={17} aria-hidden="true" />}
                </button>
              )
            })}
        </Fragment>
      ))}
    </Sheet>
  )
}
