import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  Gift,
  Calendar,
  ChevronRight,
  Sun,
  MessageCircle,
  Clock,
  Check,
  UserPlus,
  UserMinus,
  Briefcase,
} from 'react-feather'
import { relativeTime } from '../../lib/contact'
import { dueLabel, daysUntilDue } from '../../lib/tasks'
import { attentionAreaId, buildAttention, canBeFiled } from '../../lib/attention'
import { ALL_AREAS, areaById } from '../../lib/areas'
import UnfiledSection from '../../components/ui/UnfiledSection'
import { reminderWhen } from '../../lib/reminders'
import { isSolo, normalizeAssignee } from '../../lib/household'
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
import AreaDot from '../../components/ui/AreaDot'
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
//
// An org gets the same shape in a plainer register (0042): "say hi" to a
// contracting firm is odd, and the warmth those words carry is for people. It
// still isn't pipeline-speak — "nothing logged yet" is a fact about your record,
// not a stage in a funnel.
function checkInSub(item) {
  if (item.org) {
    return item.state === 'never'
      ? 'Nothing logged yet'
      : `It's been a while · last contact ${relativeTime(item.lastIso)}`
  }
  if (item.state === 'never') return 'No catch-ups logged yet · say hi'
  return `It's been a while · last catch-up ${relativeTime(item.lastIso)}`
}

const DAY = 86400000

export default function TodayView({
  data,
  taskScope = 'mine',
  onOpenPerson,
  onOpenOrg,
  onOpenList,
  // One task, on the Tasks page, expanded. onOpenTasks is the whole page.
  onOpenTask,
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
    updateTask,
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
  // The subject of the "Log a touchpoint" sheet: { row, kind }. An org can have
  // a cadence of its own since 0042, and its check-in row is the same row — so
  // the sheet has to be told which column to write rather than assuming person.
  const [logSubject, setLogSubject] = useState(null)
  const [actionPerson, setActionPerson] = useState(null)
  const [laterItem, setLaterItem] = useState(null) // attention item picking a snooze

  const attention = useMemo(
    () =>
      buildAttention(data, prefs, data.reminderSnoozes, memberId, now, {
        taskScope,
        // Legacy 'me'/'partner'/'either' assignees only resolve through here.
        normalizeAssignee,
      }),
    // Granular deps on purpose: `data` is a fresh object every render; these are
    // the fields buildAttention actually reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      data.people,
      // Orgs carry a cadence of their own since 0042, so they feed check-ins
      // exactly as people do — and a missing dep here means logging a touchpoint
      // with an account leaves its row sitting on Today until the next reload.
      data.orgs,
      data.tasks,
      data.lists,
      data.interactions,
      data.keyDates,
      data.reminderSnoozes,
      data.habits,
      data.habitEntries,
      // The area ROWS, not just the selected lens id below: buildAttention reads
      // show_on_today off them. Missing, flipping an area quiet left Today
      // unchanged until something else happened to invalidate this memo.
      data.areas,
      prefs,
      memberId,
      taskScope,
      area,
      now,
    ],
  )
  // The lens, applied here rather than inside buildAttention — because a lens
  // that had already dropped the excluded items couldn't hand them back, and
  // Today needs them for the "No area" section below.
  //
  // Only fileable kinds are partitioned. A birthday and a habit stay put under
  // every lens: contacts have no area at all, and nothing sets habits.area_id
  // — so sweeping them into a collapsed section would empty the Dates card and
  // the Habits card the moment you picked an area. See canBeFiled.
  const lensOn = !!area && area !== ALL_AREAS
  const scoped = lensOn
    ? attention.filter((i) => !canBeFiled(i) || attentionAreaId(i) === area)
    : attention
  const unfiled = lensOn ? attention.filter((i) => canBeFiled(i) && !attentionAreaId(i)) : []

  // To-do is what's due now. Deadlines that haven't landed yet ride in their own
  // section below it — close enough to plan around (reminders.ANYTIME_DAYS), but
  // mixing them into To-do would blur the line between "due" and "due soon".
  const dueTasks = scoped.filter((i) => i.kind === 'task' && i.urgency !== 'anytime')
  const anytimeTasks = scoped.filter((i) => i.kind === 'task' && i.urgency === 'anytime')
  const dueLists = scoped.filter((i) => i.kind === 'list')
  const checkIns = scoped.filter((i) => i.kind === 'nudge')
  // Kept apart, because they draw different rows — see reminderItemRow.
  const unfiledTasks = unfiled.filter((i) => i.kind === 'task')
  const unfiledReminders = unfiled.filter((i) => i.kind === 'reminder')
  const unfiledLists = unfiled.filter((i) => i.kind === 'list')
  // Dates read off contacts and reminders you wrote are one section, not two:
  // "what's coming up" is a single question, and the difference between a
  // birthday derived from a contact and a reminder you typed is ours, not
  // yours. Sorted together so the soonest thing is the top row either way.
  const dates = scoped
    .filter((i) => i.kind === 'date' || i.kind === 'reminder')
    .sort((a, b) => whenDays(a) - whenDays(b))

  // The two row shapes Today draws, pulled out of their sections so the
  // "No area" block can render the same rows rather than a second, subtly
  // different version of them. (The To-do and Anytime sections were already
  // byte-identical.)
  // Which area a row is in, for its dot. Today is the one screen that mixes
  // areas by design — a work task and a Saturday errand land in the same To-do
  // section — so on All this is the only thing on the row saying why it's here.
  // Null under a lens, and null for the "No area" block below, where the heading
  // has already said it.
  const rowArea = (row) => (lensOn ? null : areaById(data.areas, row?.area_id))

  // Tapping a task goes to the task: a step of a project opens the project it
  // belongs to (where the step sits among its siblings, which is what you need
  // to see); anything else opens the Tasks page with that row expanded. Today
  // deliberately shows a task as one line — no notes, no subtasks, no controls
  // beyond the check — so "tell me more" has to have somewhere to go, and until
  // now a plain task's row answered a tap with nothing at all.
  const openTaskItem = (item) =>
    item.project ? onOpenProject?.(item.project.id) : onOpenTask?.(item.task.id)

  // Later stays the first action even though claiming is the newer, more
  // frequent one: it's the shortest swipe on this page today, and moving a
  // control someone's thumb already knows costs more than the second slot does.
  const taskItemRow = (item) => (
    <SwipeRow
      key={item.key}
      label={item.task.title}
      actions={[later(item), claim(item)].filter(Boolean)}
      onClick={() => openTaskItem(item)}
    >
      <div className="list-row">
        <TaskRow
          task={item.task}
          onToggle={toggleTask}
          breadcrumb={item.project?.title || null}
          area={rowArea(item.task)}
        />
      </div>
    </SwipeRow>
  )

  // A reminder you wrote: nothing to do, so the row's job is to say it, let you
  // say "Got it", and take you to it on Reminders — where it sits among the rest
  // of what's coming, with its notes and its repeat rule.
  //
  // Extracted from the Coming up section for the same reason the two above were:
  // the "No area" block below renders reminders too, and it was passing them
  // through the TASK row — which reads item.task, and a reminder item hasn't got
  // one. Under a lens, one unfiled reminder took the whole page down.
  const reminderItemRow = (item) => {
    const r = item.reminder
    return (
      <SwipeRow
        key={item.key}
        label={r.title}
        actions={[
          { label: 'Got it', icon: Check, onClick: () => completeTask(r, true) },
          later(item),
        ]}
        onClick={() => onOpenReminders?.(r.id)}
      >
        <div className="list-row">
          <span className="reminder-dot" aria-hidden="true">
            <Bell size={15} />
          </span>
          <div className="row-body">
            <div className="row-titleline">
              <AreaDot area={rowArea(r)} />
              <div className="row-title">{r.title}</div>
            </div>
            <div className="row-sub">{r.notes || 'Just a heads-up'}</div>
          </div>
          <div className="row-meta">
            <span className={`row-time ${item.urgency === 'today' ? 'warn' : ''}`}>
              {reminderWhen({ daysUntil: whenDays(item), dateIso: r.due_date })}
            </span>
            <ChevronRight size={18} className="row-chevron" />
          </div>
        </div>
      </SwipeRow>
    )
  }

  const listItemRow = (item) => {
    const l = item.list
    const left = (data.listItems || []).filter((it) => it.list_id === l.id && !it.checked_at).length
    return (
      <SwipeRow
        key={item.key}
        label={l.name}
        actions={[later(item)]}
        onClick={() => onOpenList(l.id)}
      >
        <div className="list-row">
          <span className="list-emoji" style={l.color ? { background: l.color } : undefined}>
            {l.icon || '📝'}
          </span>
          <div className="row-body">
            <div className="row-titleline">
              <AreaDot area={rowArea(l)} />
              <div className="row-title">{l.name}</div>
            </div>
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
  }

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
  //
  // Recent activity is deliberately NOT counted, and neither is "No area":
  // neither is scoped by the lens, so either one would silently swallow the
  // empty state — pick an area you haven't filed anything into yet and the page
  // would answer with a history feed and a collapsed section of things that
  // aren't in it, and never say the area is empty. Both still render below.
  const nothing =
    dueTasks.length === 0 &&
    anytimeTasks.length === 0 &&
    dueLists.length === 0 &&
    checkIns.length === 0 &&
    dates.length === 0 &&
    todayHabits.length === 0 &&
    pinnedNotes.length === 0

  // Swipe action: "Later" → sheet with gentle snooze choices.
  const later = (item) => ({ label: 'Later', icon: Clock, onClick: () => setLaterItem(item) })

  // Swipe action: take an open chore, or hand it back.
  //
  // The rows this reaches are a small, deliberate set. defaultAssignee() makes a
  // task you type YOURS, so "Anyone" isn't the state a shared list rots into —
  // it's a choice, and it means the rota: the bins, the dishes, whoever gets
  // there first. Those are exactly the rows two people can both pick up on the
  // same evening from different rooms, and saying "I've got it" meant opening
  // the edit form, which nobody does mid-errand.
  //
  // No new state backs this. It writes the `assignee` that already exists, so
  // buildAttention stops nagging the other person, the row grows a name chip on
  // its own, and realtime carries both to the other phone with no new plumbing.
  //
  // Three cases, two of them offer a button: unclaimed offers to take it, yours
  // offers to put it back (a mis-tap has to be undoable without the form). A
  // task assigned to someone ELSE gets nothing — taking work off a housemate is
  // a conversation, not a swipe. Solo households get nothing either, the same
  // progressive disclosure isSolo() already does for the rest of the sharing UI.
  const claim = (item) => {
    if (isSolo() || !memberId) return null
    const who = normalizeAssignee(item.task.assignee)
    const me = normalizeAssignee(memberId)
    const set = (assignee) => () => {
      haptics.light()
      updateTask(item.task.id, { assignee })
    }
    if (who === 'anyone') return { label: 'Mine', icon: UserPlus, onClick: set(memberId) }
    if (who === me)
      return { label: 'Not mine', icon: UserMinus, variant: 'neutral', onClick: set('anyone') }
    return null
  }

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
      {/* Search and you, exactly as every other top-level page carries them —
          Today was the odd one out, spending a whole row of the home screen on
          a search field that is a 36px button everywhere else.

          Two buttons, not three: with the avatar on the right, a third made the
          greeting wrap onto two lines, which cost more height than the search
          row saved. Notes gave up the slot — it's one tap away in the drawer,
          and Search is the thing you reach for from a dashboard. */}
      <PageHeader title={greeting()} subtitle={longDate()} onSearch={onSearch} />

      {household && <ProfileNudge household={household} />}

      {nothing && (
        <EmptyState icon={Sun}>
          {/* Name the lens rather than saying "you're all caught up": under an
              area, caught-up is a claim about that area only, and the same
              sentence one tap later on All would be a different fact. */}
          {lensOn
            ? `Nothing in ${areaById(data.areas, area)?.name || 'this area'} needs attention today.`
            : "You're all caught up. Nothing needs attention today."}
        </EmptyState>
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
            <div className="list">{dueTasks.map(taskItemRow)}</div>
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
            <div className="list">{anytimeTasks.map(taskItemRow)}</div>
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
            <div className="list">{dueLists.map(listItemRow)}</div>
          </section>
        )}

        {/* What the lens set aside: dated work that needs you today but has no
            area of its own. Collapsed, below the sections it would otherwise be
            mixed into — so picking Work doesn't quietly lose the errand you
            never filed, and doesn't pad Work with it either. Matches Tasks,
            Projects, Lists, Notes and Reminders. */}
        <UnfiledSection count={unfiledTasks.length + unfiledReminders.length + unfiledLists.length}>
          <div className="list">
            {unfiledTasks.map(taskItemRow)}
            {unfiledReminders.map(reminderItemRow)}
            {unfiledLists.map(listItemRow)}
          </div>
        </UnfiledSection>

        {checkIns.length > 0 && (
          <section className="today-section">
            <SectionLabel>Check in</SectionLabel>
            <div className="list">
              {checkIns.map((item) => {
                // One row shape for both, because they are the same thing: an
                // account you meant to stay on top of, drifting. Only the avatar
                // and the destination differ.
                const org = item.kind === 'nudge' ? item.org : null
                const subject = item.person || org
                const kind = org ? 'organization' : 'person'
                const open = () => (org ? onOpenOrg?.(org.id) : onOpenPerson(subject.id))
                return (
                  <SwipeRow
                    key={item.key}
                    label={subject.name}
                    actions={[
                      {
                        label: 'Check in',
                        icon: MessageCircle,
                        onClick: () => setLogSubject({ row: subject, kind }),
                      },
                      {
                        label: 'Clear',
                        icon: Check,
                        variant: 'neutral',
                        onClick: () => clearCheckIn(item),
                      },
                      later(item),
                    ]}
                    onClick={open}
                    // The long-press menu is personActions — Call, Email, Log —
                    // and every entry of it reads off a PERSON. An org has its
                    // own contact fields in different columns, so rather than
                    // half a menu it gets none, and the row's own tap and swipe
                    // still do everything.
                    onLongPress={org ? undefined : () => setActionPerson(item.person)}
                  >
                    <div className="list-row">
                      <Avatar
                        name={subject.name}
                        src={subject.avatar_url}
                        size={42}
                        {...(org ? { kind: 'org', icon: Briefcase } : {})}
                      />
                      <div className="row-body">
                        <div className="row-title">{subject.name}</div>
                        <div className="row-sub">{checkInSub(item)}</div>
                      </div>
                      <div className="row-meta">
                        <IconButton
                          icon={MessageCircle}
                          variant="accent"
                          className="touch-quick"
                          label={`Check in with ${subject.name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setLogSubject({ row: subject, kind })
                          }}
                        />
                      </div>
                    </div>
                  </SwipeRow>
                )
              })}
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
                if (item.kind === 'reminder') return reminderItemRow(item)
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
            onLog: (p) => setLogSubject({ row: p, kind: 'person' }),
          })}
          onClose={() => setActionPerson(null)}
        />
      )}
      {logSubject && (
        <InteractionForm
          subject={logSubject.row}
          subjectKind={logSubject.kind}
          presetType="call"
          onSave={addInteraction}
          onClose={() => setLogSubject(null)}
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
