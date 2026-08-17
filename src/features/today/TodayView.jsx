import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  Gift,
  Calendar,
  ChevronRight,
  Sun,
  FileText,
  MessageCircle,
  Clock,
  Check,
  Search,
} from 'react-feather'
import { relativeTime } from '../../lib/contact'
import { dueLabel, daysUntilDue } from '../../lib/tasks'
import { buildAttention } from '../../lib/attention'
import { reminderWhen } from '../../lib/reminders'
import { normalizeAssignee } from '../../lib/household'
import { buildActivityFeed } from '../../lib/activity'
import { personActions } from '../../lib/personActions'
import { noteTitle, noteSnippet } from '../../lib/notes'
import {
  entryMap,
  valueOn,
  isWeekly,
  weekProgress,
  toISODate,
  habitsScheduledToday,
} from '../../lib/habits'
import { byOrder } from '../../lib/order'
import HabitQuickLog from '../habits/HabitQuickLog'
import { HabitDot } from '../habits/HabitRow'
import { useNotificationPrefs } from '../../hooks/useNotificationPrefs'
import { useNow } from '../../hooks/useNow'
import haptics from '../../lib/haptics'
import Avatar from '../../components/ui/Avatar'
import ProfileNudge from '../people/ProfileNudge'
import PageHeader from '../../components/shell/PageHeader'
import SwipeRow from '../../components/ui/SwipeRow'
import TaskRow from '../tasks/TaskRow'
import ActivityRow from '../activity/ActivityRow'
import ActionSheet from '../../components/ui/ActionSheet'
import SnoozeSheet from '../../components/ui/SnoozeSheet'
import InteractionForm from '../people/InteractionForm'
import SectionLabel from '../../components/ui/SectionLabel'
import EmptyState from '../../components/ui/EmptyState'
import IconButton from '../../components/ui/IconButton'

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Good evening'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// Whether the Recent activity section is open, remembered for the session.
const RECENT_KEY = 'today.showRecent'

const longDate = () =>
  new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

function dateWhen(entry) {
  if (entry.daysUntil === 0) return entry.kind === 'birthday' ? 'Today 🎂' : 'Today'
  if (entry.daysUntil === 1) return 'Tomorrow'
  return `in ${entry.daysUntil}d`
}

// How many days off an item in the Upcoming section is, whichever kind it is:
// a derived date carries `daysUntil`, a reminder carries a due_date. Lets the
// two sort against each other instead of clumping by kind.
function whenDays(item) {
  if (item.kind === 'reminder') return daysUntilDue(item.reminder.due_date) ?? 9999
  return item.entry.daysUntil
}

// "Turns 36" / "Wedding anniversary · 9 years" / "Retirement party"
function dateSub(entry) {
  if (entry.kind === 'birthday') return entry.turning ? `Turns ${entry.turning}` : 'Birthday'
  return entry.years ? `${entry.label} · ${entry.years} years` : entry.label
}

// Warm, human phrasing — this is staying close to people, not working a
// pipeline. Never "overdue", never "cadence".
function checkInSub(item) {
  if (item.state === 'never') return 'No catch-ups logged yet · say hi'
  return `It's been a while · last catch-up ${relativeTime(item.lastIso)}`
}

const DAY = 86400000

export default function TodayView({
  data,
  taskScope = 'mine',
  onOpenPerson,
  onOpenList,
  onOpenTasks,
  onOpenProject,
  onOpenActivity,
  onSearch,
  onOpenHabits,
  onOpenHabit,
  onOpenNotes,
  onOpenNote,
  onOpenReminders,
  onOpenChange,
  household,
  area,
}) {
  const {
    addInteraction,
    completeTask,
    skipTaskOccurrence,
    snoozeReminder,
    memberId,
    habitEntries,
    logHabit,
  } = data
  const [prefs] = useNotificationPrefs(memberId)
  // Keep greetings, the date, and relative/overdue labels fresh on a wall-
  // mounted tablet that may run for days without a reload.
  const now = useNow()
  // Habits the user pinned to Today, that are scheduled for today. Which habits
  // today asks for is lib/habits' call (scheduling, rest days, weekly targets)
  // — the attention engine reads the same predicate, so the card and the
  // reminders can't disagree. `show_on_today` is the one rule that stays here:
  // it's a display pin, not a fact about the habit. (useNow gives a timestamp
  // number, so wrap it in a Date for the date-aware habit helpers.)
  const nowDate = new Date(now)
  const todayISO = toISODate(nowDate)
  const habitMap = useMemo(() => entryMap(habitEntries), [habitEntries])
  const todayHabits = habitsScheduledToday(data.habits, habitMap, nowDate)
    .filter((h) => h.show_on_today)
    .sort(byOrder)
  const [logPerson, setLogPerson] = useState(null)
  const [actionPerson, setActionPerson] = useState(null)
  const [laterItem, setLaterItem] = useState(null) // attention item picking a snooze

  const attention = useMemo(
    () =>
      buildAttention(data, prefs, data.reminderSnoozes, memberId, now, {
        taskScope,
        // Legacy 'me'/'partner'/'either' assignees only resolve through here.
        normalizeAssignee,
        // The lens. Today is the sharpest version of the problem areas exist to
        // solve — a work task with a date landing on the dashboard on a Saturday
        // morning — so this is the one that matters most. The badge deliberately
        // does NOT get it; see buildAttention's own note.
        areaId: area,
      }),
    // Granular deps on purpose: `data` is a fresh object every render; these are
    // the fields buildAttention actually reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      data.people,
      data.tasks,
      data.lists,
      data.interactions,
      data.keyDates,
      data.reminderSnoozes,
      data.habits,
      data.habitEntries,
      prefs,
      memberId,
      taskScope,
      area,
      now,
    ],
  )
  // To-do is what's due now. Deadlines that haven't landed yet ride in their own
  // section below it — close enough to plan around (reminders.ANYTIME_DAYS), but
  // mixing them into To-do would blur the line between "due" and "due soon".
  const dueTasks = attention.filter((i) => i.kind === 'task' && i.urgency !== 'anytime')
  const anytimeTasks = attention.filter((i) => i.kind === 'task' && i.urgency === 'anytime')
  const dueLists = attention.filter((i) => i.kind === 'list')
  const checkIns = attention.filter((i) => i.kind === 'nudge')
  // Dates read off contacts and reminders you wrote are one section, not two:
  // "what's coming up" is a single question, and the difference between a
  // birthday derived from a contact and a reminder you typed is ours, not
  // yours. Sorted together so the soonest thing is the top row either way.
  const dates = attention
    .filter((i) => i.kind === 'date' || i.kind === 'reminder')
    .sort((a, b) => whenDays(a) - whenDays(b))

  const toggleTask = (t) => {
    if (!t.completed_at) haptics.success()
    completeTask(t, !t.completed_at)
  }

  // Head of the shared household-activity feed (touchpoints, completed tasks,
  // list activity). The full log lives behind "See all".
  const feed = useMemo(() => buildActivityFeed(data), [data])
  const recent = useMemo(() => feed.slice(0, 6), [feed])
  // On a phone the feed is history, not something to act on, and it pushes the
  // habits and pinned notes below it off the screen — so it starts collapsed,
  // the way Done does on Tasks. Wide screens have the room, so it starts open.
  // Either way the choice sticks for the session (home is remounted constantly).
  const [showRecent, setShowRecent] = useState(() => {
    try {
      const saved = sessionStorage.getItem(RECENT_KEY)
      if (saved !== null) return saved === '1'
    } catch {
      // private mode / quota — fall through to the default
    }
    return !window.matchMedia('(max-width: 720px)').matches
  })
  useEffect(() => {
    try {
      sessionStorage.setItem(RECENT_KEY, showRecent ? '1' : '0')
    } catch {
      // non-essential, fine to skip
    }
  }, [showRecent])

  // Pinned notes as quick reference on the dashboard (a few, tap to open).
  const pinnedNotes = (data.notes || []).filter((n) => n.pinned).slice(0, 4)

  // Counted off the sections that actually render, not off `attention` as a
  // whole: the engine now also carries habit items, which this page draws from
  // its own pinned-habits list. Reading the raw length would let an unpinned
  // habit suppress the empty state and leave the page blank.
  const nothing =
    dueTasks.length === 0 &&
    anytimeTasks.length === 0 &&
    dueLists.length === 0 &&
    checkIns.length === 0 &&
    dates.length === 0 &&
    recent.length === 0 &&
    todayHabits.length === 0 &&
    pinnedNotes.length === 0

  // Swipe action: "Later" → sheet with gentle snooze choices.
  const later = (item) => ({ label: 'Later', icon: Clock, onClick: () => setLaterItem(item) })

  // "We're caught up, nothing worth logging" — quiets the check-in for one
  // full cadence cycle without inventing a touchpoint.
  const clearCheckIn = (item) => {
    const days = item.person.keep_in_touch_days || 30
    haptics.light()
    snoozeReminder({
      kind: 'nudge',
      target_key: item.key,
      until: new Date(Date.now() + days * DAY).toISOString(),
    })
  }

  return (
    <div>
      {/* One trailing button, not three. Settings moved into the account menu
          the avatar opens (it's account business, not a place your household's
          things live), and with the avatar arriving on the right this header had
          a gear, a notes icon, an avatar — and a greeting wrapping onto two
          lines to make room for them. Notes stays: it's the one destination
          Today's bottom bar has no slot for. */}
      <PageHeader
        title={greeting()}
        subtitle={longDate()}
        action={onOpenNotes}
        actionIcon={FileText}
        actionLabel="Notes"
        // A destination, not this page's primary action — so it doesn't wear the
        // accent circle.
        actionQuiet
      />

      {/* iOS-style search bar under the large title — opens Quick Find.
          Keeps the header to two quiet actions instead of squeezing three. */}
      {onSearch && (
        <button className="search-bar-btn" onClick={onSearch} aria-label="Quick Find">
          <Search size={16} />
          Search
        </button>
      )}

      {household && <ProfileNudge household={household} />}

      {nothing && (
        <EmptyState icon={Sun}>You're all caught up. Nothing needs attention today.</EmptyState>
      )}

      {/* On wide screens (landscape iPad / desktop) these sections flow into
          two columns so the dashboard fills the width instead of leaving a
          tall empty gutter; portrait and phone stay single-column. */}
      <div className="today-dashboard">
        {/* To-do leads. These are the overdue/due items that drive the tab
            badge and the app icon badge, so they're what "Today" is answering;
            habits are a daily ritual you already know about. Habits used to sit
            first and pushed the first due task below the fold. */}
        {dueTasks.length > 0 && (
          <section className="today-section">
            <SectionLabel>To-do</SectionLabel>
            <div className="list">
              {dueTasks.map((item) => (
                <SwipeRow
                  key={item.key}
                  label={item.task.title}
                  actions={[later(item)]}
                  onClick={item.project ? () => onOpenProject?.(item.project.id) : undefined}
                >
                  <div className="list-row">
                    <TaskRow
                      task={item.task}
                      onToggle={toggleTask}
                      breadcrumb={item.project?.title || null}
                    />
                  </div>
                </SwipeRow>
              ))}
            </div>
          </section>
        )}

        {/* Work you could pick up today whose deadline is inside the week. Not
            due — just running out of room, and better slotted into a free
            evening than discovered on the morning it's due. Named for the Tasks
            section it comes from, so it's one word to learn rather than two;
            each row's own chip ("5d left") says how much room is actually left,
            which a heading like "this week" would only approximate. */}
        {anytimeTasks.length > 0 && (
          <section className="today-section">
            <SectionLabel>Anytime</SectionLabel>
            <div className="list">
              {anytimeTasks.map((item) => (
                <SwipeRow
                  key={item.key}
                  label={item.task.title}
                  actions={[later(item)]}
                  onClick={item.project ? () => onOpenProject?.(item.project.id) : undefined}
                >
                  <div className="list-row">
                    <TaskRow
                      task={item.task}
                      onToggle={toggleTask}
                      breadcrumb={item.project?.title || null}
                    />
                  </div>
                </SwipeRow>
              ))}
            </div>
          </section>
        )}

        {todayHabits.length > 0 && (
          <section className="today-section">
            <SectionLabel>Habits</SectionLabel>
            <div className="list">
              {todayHabits.map((h) => (
                <div
                  className="list-row today-habit"
                  key={h.id}
                  onClick={() => (onOpenHabit ? onOpenHabit(h.id) : onOpenHabits?.())}
                >
                  <HabitDot habit={h} />
                  <div className="row-body">
                    <div className="row-title">{h.name}</div>
                    {isWeekly(h) && (
                      <div className="row-sub">
                        {weekProgress(h, habitMap, nowDate).count}/{h.weekly_target} this week
                      </div>
                    )}
                  </div>
                  <HabitQuickLog
                    habit={h}
                    value={valueOn(h, todayISO, habitMap)}
                    onLog={(v) => logHabit(h.id, todayISO, v)}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {pinnedNotes.length > 0 && onOpenNote && (
          <section className="today-section">
            <SectionLabel
              action={
                onOpenNotes && (
                  <button className="see-all" onClick={onOpenNotes}>
                    All notes
                  </button>
                )
              }
            >
              Notes
            </SectionLabel>
            <div className="list">
              {pinnedNotes.map((n) => (
                <div className="list-row note-row" key={n.id} onClick={() => onOpenNote(n.id)}>
                  <span className="list-emoji">📝</span>
                  <div className="row-body">
                    <div className="row-title">{noteTitle(n)}</div>
                    {noteSnippet(n) && <div className="row-sub">{noteSnippet(n, 60)}</div>}
                  </div>
                  <ChevronRight size={18} className="row-chevron" />
                </div>
              ))}
            </div>
          </section>
        )}

        {dueLists.length > 0 && (
          <section className="today-section">
            <SectionLabel>Lists</SectionLabel>
            <div className="list">
              {dueLists.map((item) => {
                const l = item.list
                const left = (data.listItems || []).filter(
                  (it) => it.list_id === l.id && !it.checked_at,
                ).length
                return (
                  <SwipeRow
                    key={item.key}
                    label={l.name}
                    actions={[later(item)]}
                    onClick={() => onOpenList(l.id)}
                  >
                    <div className="list-row">
                      <span
                        className="list-emoji"
                        style={l.color ? { background: l.color } : undefined}
                      >
                        {l.icon || '📝'}
                      </span>
                      <div className="row-body">
                        <div className="row-title">{l.name}</div>
                        <div className="row-sub">
                          {left ? `${left} item${left === 1 ? '' : 's'} left` : 'All done'}
                        </div>
                      </div>
                      <div className="row-meta">
                        <span className="row-time warn">{dueLabel(l.due_date)}</span>
                        <ChevronRight size={18} className="row-chevron" />
                      </div>
                    </div>
                  </SwipeRow>
                )
              })}
            </div>
          </section>
        )}

        {checkIns.length > 0 && (
          <section className="today-section">
            <SectionLabel>Check in</SectionLabel>
            <div className="list">
              {checkIns.map((item) => (
                <SwipeRow
                  key={item.key}
                  label={item.person.name}
                  actions={[
                    {
                      label: 'Check in',
                      icon: MessageCircle,
                      onClick: () => setLogPerson(item.person),
                    },
                    {
                      label: 'Clear',
                      icon: Check,
                      variant: 'neutral',
                      onClick: () => clearCheckIn(item),
                    },
                    later(item),
                  ]}
                  onClick={() => onOpenPerson(item.person.id)}
                  onLongPress={() => setActionPerson(item.person)}
                >
                  <div className="list-row">
                    <Avatar name={item.person.name} src={item.person.avatar_url} size={42} />
                    <div className="row-body">
                      <div className="row-title">{item.person.name}</div>
                      <div className="row-sub">{checkInSub(item)}</div>
                    </div>
                    <div className="row-meta">
                      <IconButton
                        icon={MessageCircle}
                        variant="accent"
                        className="touch-quick"
                        label={`Check in with ${item.person.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setLogPerson(item.person)
                        }}
                      />
                    </div>
                  </div>
                </SwipeRow>
              ))}
            </div>
          </section>
        )}

        {dates.length > 0 && (
          <section className="today-section">
            {/* Was "Dates" — the section absorbed reminders rather than Today
                growing a tenth one. Nine sections was already the most any
                screen here carries. */}
            <SectionLabel>Coming up</SectionLabel>
            <div className="list">
              {dates.map((item) => {
                // A reminder you wrote: nothing to open, nothing to do, so the
                // row's whole job is to say it and let you say "Got it".
                if (item.kind === 'reminder') {
                  const r = item.reminder
                  return (
                    <SwipeRow
                      key={item.key}
                      label={r.title}
                      actions={[
                        {
                          label: 'Got it',
                          icon: Check,
                          onClick: () => completeTask(r, true),
                        },
                        later(item),
                      ]}
                      onClick={() => onOpenReminders?.()}
                    >
                      <div className="list-row">
                        <span className="reminder-dot" aria-hidden="true">
                          <Bell size={15} />
                        </span>
                        <div className="row-body">
                          <div className="row-title">{r.title}</div>
                          <div className="row-sub">{r.notes || 'Just a heads-up'}</div>
                        </div>
                        <div className="row-meta">
                          <span className={`row-time ${item.urgency === 'today' ? 'warn' : ''}`}>
                            {reminderWhen({
                              daysUntil: whenDays(item),
                              dateIso: r.due_date,
                            })}
                          </span>
                        </div>
                      </div>
                    </SwipeRow>
                  )
                }
                const entry = item.entry
                const Icon = entry.kind === 'birthday' ? Gift : Calendar
                return (
                  <SwipeRow
                    key={item.key}
                    label={entry.person.name}
                    actions={[later(item)]}
                    onClick={() => onOpenPerson(entry.person.id)}
                    onLongPress={() => setActionPerson(entry.person)}
                  >
                    <div className="list-row">
                      <Avatar name={entry.person.name} src={entry.person.avatar_url} size={42} />
                      <div className="row-body">
                        <div className="row-title">{entry.person.name}</div>
                        <div className="row-sub">
                          <Icon size={12} style={{ verticalAlign: '-1px', marginRight: 4 }} />
                          {dateSub(entry)}
                        </div>
                      </div>
                      <div className="row-meta">
                        <span className={`row-time ${entry.daysUntil <= 3 ? 'warn' : ''}`}>
                          {dateWhen(entry)}
                        </span>
                        <ChevronRight size={18} className="row-chevron" />
                      </div>
                    </div>
                  </SwipeRow>
                )
              })}
            </div>
          </section>
        )}

        {recent.length > 0 && (
          <section className="today-section">
            <div className="section-head">
              <SectionLabel>
                <button
                  className="section-toggle"
                  aria-expanded={showRecent}
                  onClick={() => setShowRecent((v) => !v)}
                >
                  Recent activity{' '}
                  <ChevronRight
                    size={13}
                    style={{ transform: showRecent ? 'rotate(90deg)' : 'none' }}
                  />
                </button>
              </SectionLabel>
              {feed.length > recent.length && (
                <button className="see-all" onClick={onOpenActivity}>
                  See all
                </button>
              )}
            </div>
            {showRecent && (
              <div className="list">
                {recent.map((e) => (
                  <ActivityRow
                    key={e.key}
                    entry={e}
                    onOpenPerson={onOpenPerson}
                    onOpenList={onOpenList}
                    onOpenTasks={onOpenTasks}
                    onOpenHabit={onOpenHabit}
                    onOpenChange={onOpenChange}
                    onPersonLongPress={setActionPerson}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {actionPerson && (
        <ActionSheet
          title={actionPerson.name}
          actions={personActions(actionPerson, {
            onOpen: onOpenPerson,
            onLog: (p) => setLogPerson(p),
          })}
          onClose={() => setActionPerson(null)}
        />
      )}
      {logPerson && (
        <InteractionForm
          person={logPerson}
          presetType="call"
          onSave={addInteraction}
          onClose={() => setLogPerson(null)}
        />
      )}
      {laterItem && (
        <SnoozeSheet
          item={laterItem}
          onSnooze={(until) =>
            snoozeReminder({ kind: laterItem.kind, target_key: laterItem.key, until })
          }
          onSkip={(task) => skipTaskOccurrence(task)}
          onClose={() => setLaterItem(null)}
        />
      )}
    </div>
  )
}
