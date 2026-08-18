import { useMemo } from 'react'
import { Bell, Check, Edit2, Plus, Repeat, Trash2, User } from 'react-feather'
import PageHeader from '../../components/shell/PageHeader'
import SectionLabel from '../../components/ui/SectionLabel'
import EmptyState from '../../components/ui/EmptyState'
import UnfiledSection from '../../components/ui/UnfiledSection'
import { ALL_AREAS, scopeToArea } from '../../lib/areas'
import SwipeRow from '../../components/ui/SwipeRow'
import SharedDot from '../../components/ui/SharedDot'
import IconButton from '../../components/ui/IconButton'
import Avatar from '../../components/ui/Avatar'
import { groupReminders, reminderWhen, upcomingReminders } from '../../lib/reminders'
import { describeRecurrence } from '../../lib/recurrence'
import { assigneeLabel, normalizeAssignee } from '../../lib/household'
import haptics from '../../lib/haptics'

// Things to be told, not things to do. The list is deliberately mixed: reminders
// you wrote sit beside birthdays and key dates computed from your contacts,
// because "what's coming up" is one question and answering it in two places is
// how you end up checking neither.
//
// The two kinds behave differently on purpose. A stored reminder can be
// acknowledged ("Got it"), edited and deleted. A derived one can't — it belongs
// to the contact it came from, so the row takes you there instead. That keeps
// people.birthday the only place a birthday lives.
const SECTIONS = [
  // Overdue leads, and it's the one section whose name isn't about time: nothing
  // here is late, because there was never anything to do. It's just unread.
  { key: 'overdue', label: 'Needs a look' },
  { key: 'today', label: 'Today' },
  { key: 'soon', label: 'This week' },
  { key: 'later', label: 'Later this month' },
  { key: 'undated', label: 'No date yet' },
]

export default function RemindersView({
  data,
  onAdd,
  onEdit,
  onOpenPerson,
  onSearch,
  hub,
  onNavigate,
  area,
}) {
  const { reminders = [], people = [], keyDates = [], completeTask, deleteTask } = data

  const lensOn = !!area && area !== ALL_AREAS
  // Stored reminders are tasks, so they carry an area. Derived ones — birthdays
  // and key dates read off contacts — never can: contacts deliberately have no
  // area (a colleague who becomes a friend is not 40% work). So under a lens
  // they all fall to the unfiled section, which is the right place for them: a
  // birthday belongs to neither work nor home.
  const lens = useMemo(() => scopeToArea(reminders, area), [reminders, area])

  const groups = useMemo(
    () =>
      groupReminders(
        upcomingReminders({
          reminders: lens.scoped,
          people: lensOn ? [] : people,
          keyDates: lensOn ? [] : keyDates,
        }),
      ),
    [lens.scoped, lensOn, people, keyDates],
  )
  const unfiled = useMemo(
    () =>
      lensOn
        ? groupReminders(upcomingReminders({ reminders: lens.unfiled, people, keyDates }))
        : null,
    [lensOn, lens.unfiled, people, keyDates],
  )
  const total = SECTIONS.reduce((n, s) => n + groups[s.key].length, 0)
  const unfiledTotal = unfiled ? SECTIONS.reduce((n, s) => n + unfiled[s.key].length, 0) : 0

  const acknowledge = (row) => {
    haptics.success()
    completeTask(row, true)
  }

  const row = (item) => {
    // Derived: belongs to a contact, so the row is a way to them rather than
    // something to act on here.
    if (item.kind === 'derived') {
      const person = item.source.person
      return (
        <div
          className="list-row"
          key={item.key}
          role="button"
          onClick={() => onOpenPerson?.(person.id)}
        >
          <Avatar name={person.name} src={person.avatar_url} size={38} kind="person" />
          <div className="row-body">
            <div className="row-title">{item.title}</div>
            <div className="row-sub">
              {[item.sub, 'from their contact'].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="row-meta">
            <span className={`row-time ${item.daysUntil <= 3 ? 'warn' : ''}`}>
              {reminderWhen(item)}
            </span>
          </div>
        </div>
      )
    }

    const r = item.source
    const assignee = normalizeAssignee(r.assignee)
    return (
      <SwipeRow
        key={item.key}
        label={item.title}
        onClick={() => onEdit?.(r)}
        actions={[
          { label: 'Got it', icon: Check, onClick: () => acknowledge(r) },
          { label: 'Edit', icon: Edit2, onClick: () => onEdit?.(r) },
          { label: 'Delete', icon: Trash2, variant: 'danger', onClick: () => deleteTask(r.id) },
        ]}
      >
        <div className="list-row">
          <span className="reminder-dot" aria-hidden="true">
            <Bell size={15} />
          </span>
          <div className="row-body">
            <div className="row-titleline">
              <div className="row-title">{item.title}</div>
              <SharedDot item={r} />
            </div>
            <div className="row-sub">
              {[
                item.sub,
                assignee !== 'anyone' ? assigneeLabel(r.assignee) : null,
                r.recurrence ? describeRecurrence(r.recurrence) : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Nothing to do, just a heads-up'}
            </div>
          </div>
          <div className="row-meta">
            {r.recurrence && <Repeat size={13} aria-hidden="true" />}
            <span className={`row-time ${item.daysUntil <= 0 ? 'warn' : ''}`}>
              {reminderWhen(item)}
            </span>
            {/* `touch-quick`: drawn on a phone, hidden where the hover cluster
                covers the same spot. Edit and Delete are fine as swipe-only —
                acknowledging isn't, because it's the only thing you ever do to a
                reminder, and hiding the one verb behind a gesture would make the
                page read as a list you can't clear. */}
            <IconButton
              icon={Check}
              variant="accent"
              className="touch-quick"
              label={`Got it: ${item.title}`}
              onClick={(e) => {
                e.stopPropagation()
                acknowledge(r)
              }}
            />
          </div>
        </div>
      </SwipeRow>
    )
  }

  return (
    <div>
      <PageHeader
        title="Reminders"
        createAction={onAdd}
        actionLabel="New reminder"
        onSearch={onSearch}
        navOptions={hub?.options}
        navActive={hub?.active}
        onNavigate={onNavigate}
        info="Things to be told about, with nothing to do. Birthdays and key dates come from your contacts automatically; edit those on the person."
        infoTitle="Reminders"
      />

      {/* Unfiled reminders aren't in this area, so they don't suppress the
          empty state — it sits above the "No area" section below. */}
      {total === 0 ? (
        <EmptyState
          icon={Bell}
          action={
            <button className="text-btn" onClick={onAdd}>
              <Plus size={14} /> New reminder
            </button>
          }
        >
          {lensOn
            ? 'Nothing coming up in this area.'
            : 'Nothing coming up. Add a date you want surfaced: bin day, a renewal, an anniversary.'}
        </EmptyState>
      ) : (
        SECTIONS.map(({ key, label }) =>
          groups[key].length === 0 ? null : (
            <div key={key}>
              <SectionLabel>
                {label}
                <span className="section-count">{groups[key].length}</span>
              </SectionLabel>
              <div className="list">{groups[key].map(row)}</div>
            </div>
          ),
        )
      )}

      <UnfiledSection count={unfiledTotal}>
        {SECTIONS.map(({ key, label }) =>
          !unfiled || unfiled[key].length === 0 ? null : (
            <div key={key}>
              <SectionLabel>
                {label}
                <span className="section-count">{unfiled[key].length}</span>
              </SectionLabel>
              <div className="list">{unfiled[key].map(row)}</div>
            </div>
          ),
        )}
      </UnfiledSection>

      {/* Where the derived half comes from, said once at the foot rather than on
          every row that came from a contact. */}
      {onOpenPerson && (
        <p className="reminders-footnote">
          <User size={12} aria-hidden="true" /> Birthdays and key dates are read from your contacts.
          Change them on the person and they change here.
        </p>
      )}
    </div>
  )
}
