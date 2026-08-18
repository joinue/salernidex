import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Calendar,
  Check,
  CheckSquare,
  ChevronRight,
  Clock,
  Copy,
  Maximize2,
  Plus,
  Repeat as RepeatIcon,
  Trash2,
  User,
  X,
} from 'react-feather'
import {
  taskBucket,
  canFlipDueKind,
  isDeadline,
  completionsFor,
  completionLog,
  capCompletionLog,
  completionTime,
  isProject,
  taskTags,
  byDue,
  byUpcoming,
  isoDateIn,
} from '../../lib/tasks'
import { ALL_AREAS, areaById, privacyForNewItem, resolveAreaId } from '../../lib/areas'
import UnfiledSection from '../../components/ui/UnfiledSection'
import { describeRecurrence } from '../../lib/recurrence'
import { parseTaskInput, quickTaskFields } from '../../lib/taskParse'
import { PRIVATE_LEVEL } from '../../lib/privacy'
import { relativeTime } from '../../lib/contact'
import {
  members,
  assigneeLabel,
  normalizeAssignee,
  defaultAssignee,
  isSolo,
} from '../../lib/household'
import { byOrder, moveUpdates } from '../../lib/order'
import haptics from '../../lib/haptics'
import { showToast } from '../../lib/toast'
import { useConfirm } from '../../hooks/useConfirm'
import useFocusRow from '../../hooks/useFocusRow'
import PageHeader from '../../components/shell/PageHeader'
import MenuSelect from '../../components/ui/MenuSelect'
import TaskRow from './TaskRow'
import SharedDot from '../../components/ui/SharedDot'
import ReorderableList from '../../components/ui/ReorderableList'
import PressableRow from '../../components/ui/PressableRow'
import AddToCalendar from '../../components/ui/AddToCalendar'
import SelectionBar from '../../components/ui/SelectionBar'
import { useSelection } from '../../hooks/useSelection'
import { longPressOwner } from '../../lib/gestures'
import { copyText, countLabel, toMarkdown } from '../../lib/bulk'
import SectionLabel from '../../components/ui/SectionLabel'
import EmptyState from '../../components/ui/EmptyState'
import IconButton from '../../components/ui/IconButton'

// Icons for the quick-add preview chips, matching TaskForm's smart-add tokens.
const TOKEN_ICON = { due: Calendar, time: Clock, repeat: RepeatIcon, who: User }

// Anytime sits above Upcoming on purpose: its tasks are actionable TODAY (the
// date is only a ceiling), while Upcoming is work you can't start yet.
const BUCKETS = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Today' },
  { id: 'anytime', label: 'Anytime' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'someday', label: 'Someday' },
]

// How many recurring chores Upcoming tolerates before folding them away.
const FOLD_RECURRING_AT = 3

export default function TasksView({
  data,
  expandId,
  onAdd,
  onEdit,
  onOpenTask,
  onSearch,
  hub,
  defaultFilter = 'all',
  defaultShowCompleted = false,
  defaultPrivacy = 'shared',
  // The area lens, read-only here. The control that SETS it lives in the shell
  // (sidebar on desktop, under the page header on a phone) so one pick scopes
  // every page at once; App owns the value and persists it to appPrefs, which
  // is what makes it survive a cold launch.
  area = ALL_AREAS,
}) {
  const {
    tasks,
    completions,
    addTask,
    updateTask,
    deleteTask,
    deleteTasks,
    completeTask,
    skipTaskOccurrence,
    reorderTasks,
  } = data
  // Ad-hoc filters persist for the session only (sessionStorage), so stepping
  // into a task/project and back doesn't reset them — while a fresh app launch
  // still falls back to the saved per-member defaults. Keyed by member so
  // switching "I'm this" (demo) never carries one person's view onto another's.
  const sessionKey = `salernidex-tasks-filters:${data.memberId || ''}`
  const readSession = () => {
    try {
      return JSON.parse(sessionStorage.getItem(sessionKey) || '{}') || {}
    } catch {
      return {}
    }
  }
  // Default view from settings; fall back to 'all' if the saved member is gone.
  const [filter, setFilter] = useState(() => {
    const v = readSession().filter ?? defaultFilter
    return v === 'all' || members().some((m) => m.id === v) ? v : 'all'
  })
  // Narrowing to one tag (cross-cutting label). Independent of the area lens —
  // an area is which part of your life, a tag is what the thing needs.
  const [tagFilter, setTagFilter] = useState(() => readSession().tagFilter ?? 'all')
  const confirm = useConfirm()
  // A set, not one id. Comparing two tasks' subtasks is a normal thing to want,
  // and an accordion that closes the first the moment you open the second makes
  // you keep re-opening it to check what you just read. Each row toggles alone.
  const [expanded, setExpanded] = useState(() => new Set(expandId ? [expandId] : []))
  const [showDone, setShowDone] = useState(() => readSession().showDone ?? defaultShowCompleted)
  // Recurring chores in Upcoming start folded — see upcomingParts.
  const [showRecurring, setShowRecurring] = useState(() => readSession().showRecurring ?? false)
  const [showAllDone, setShowAllDone] = useState(false)
  // The Done logbook's own "No area" fold — see unfiledLog.
  const [showUnfiledDone, setShowUnfiledDone] = useState(false)
  // Keyed by task id: with several rows open at once, one shared draft would put
  // what you type under one task into the box under every other one too.
  const [subDrafts, setSubDrafts] = useState({})
  // Inline quick-add: type a line, Enter adds it (running the same NL parser the
  // modal uses), and the field stays focused for the next one — fast capture
  // without opening the full form. The FAB/"New task" still opens the modal when
  // you want priority, area, notes, etc.
  const [quickDraft, setQuickDraft] = useState('')
  const quickRef = useRef(null)
  const quickPreview = useMemo(
    () => parseTaskInput(quickDraft, { today: isoDateIn(0), members: members() }),
    [quickDraft],
  )

  // Deep link from Today, the activity feed or Quick Find (#/tasks/<id>): land
  // with that task expanded. Added to whatever is already open rather than
  // replacing it — arriving here shouldn't shut the rows you left open.
  useEffect(() => {
    if (expandId) setExpanded((prev) => new Set(prev).add(expandId))
  }, [expandId])

  // …and make sure there's a row there to land on. This page keeps filters for
  // the session, so you can arrive from a task you just tapped on Today into a
  // list narrowed to someone else, or to a tag that task doesn't carry — and the
  // row you asked for simply isn't drawn. Following a link to a specific thing
  // is an unambiguous statement about what you want to see, so the filters that
  // would hide it give way. Only the ones that would: a lens/tag you set is left
  // alone whenever the target passes it anyway.
  //
  // The area lens is NOT touched — it's the shell's, shared by every page, and
  // silently switching areas under someone is a much bigger move than dropping a
  // per-page filter. Unfiled targets are handled by opening the "No area"
  // section instead, and a target filed elsewhere can't be reached from Today
  // (both pages read the same lens), only from a stale bookmark.
  const relaxedFor = useRef(null)
  useEffect(() => {
    if (!expandId || relaxedFor.current === expandId) return
    const t = tasks.find((x) => x.id === expandId)
    if (!t) return // not loaded yet, or gone — try again when tasks arrive
    relaxedFor.current = expandId
    const who = normalizeAssignee(t.assignee)
    setFilter((f) => (f === 'all' || who === f || who === 'anyone' ? f : 'all'))
    setTagFilter((tag) => (tag === 'all' || (t.tags || []).includes(tag) ? tag : 'all'))
    // A task checked off between the link being drawn and being followed lives
    // in the logbook now. Opening Done is the honest landing: the row is there,
    // struck through, which is the answer to what happened to it. Both folds,
    // because the logbook has its own "No area" nested inside.
    if (t.completed_at) {
      setShowDone(true)
      if (!t.area_id) setShowUnfiledDone(true)
    }
  }, [expandId, tasks])

  // Scroll the linked row into view and mark it for a moment — see useFocusRow.
  const focusRow = useFocusRow(expandId)

  // Mirror the active filters into sessionStorage so a remount (stepping into a
  // task/project and back) restores them; naturally cleared when the PWA closes.
  useEffect(() => {
    try {
      sessionStorage.setItem(
        sessionKey,
        JSON.stringify({ filter, tagFilter, showDone, showRecurring }),
      )
    } catch {
      // private mode / quota — non-essential, fine to skip
    }
  }, [sessionKey, filter, tagFilter, showDone, showRecurring])

  // "Anyone", not "Everyone": it matches the word a task already uses for work
  // nobody has claimed, and the list it opens is a list of people — reading it
  // as "show me … anyone / Marc / Sam" is the question this control answers.
  const filterOptions = [
    { value: 'all', label: 'Anyone' },
    ...members().map((m) => ({ value: m.id, label: m.name })),
  ]

  // Guard against a stale area selection — one deleted, archived or un-shared
  // while you were away. resolveAreaId falls back to All rather than leaving you
  // on an empty page with no explanation.
  const activeArea = resolveAreaId(data.areas, area, data.userId)

  // The pills describe the lens you're standing in, not the whole account —
  // offering #groceries while you're looking at Work is offering a filter whose
  // only outcome is an empty page. Unfiled tasks are deliberately left out: they
  // sit outside the lens in their own collapsed section, so their labels aren't
  // part of what this area is about.
  const tagList = useMemo(
    () =>
      taskTags(
        tasks.filter(
          (t) =>
            !t.parent_id &&
            !t.completed_at &&
            (activeArea === ALL_AREAS || t.area_id === activeArea),
        ),
      ),
    [tasks, activeArea],
  )
  // Same guard for tags: the tag can go stale because the last task carrying it
  // was finished, or because you switched to a lens where nothing uses it. The
  // saved choice is kept in session either way, so coming back to the lens that
  // does use it restores the narrowing instead of quietly dropping it.
  const activeTag = tagList.includes(tagFilter) ? tagFilter : 'all'

  // The dot on a row. Suppressed while a lens is active: every row on screen is
  // in that area, so it would repeat the same mark down the whole page.
  const rowArea = (t) => (activeArea === ALL_AREAS ? areaById(data.areas, t.area_id) : null)

  const matches = (t) => {
    if (filter !== 'all') {
      const a = normalizeAssignee(t.assignee)
      if (a !== filter && a !== 'anyone') return false
    }
    // The lens narrows to its own area only. Unfiled tasks are NOT dropped —
    // they come back below in their own collapsed "No area" section, so
    // forgetting to file something never makes it disappear (§3.5).
    if (activeArea !== ALL_AREAS && t.area_id !== activeArea) return false
    if (activeTag !== 'all' && !(t.tags || []).includes(activeTag)) return false
    return true
  }

  // Same test, minus the area clause — the rows the lens excluded purely for
  // having no area of their own.
  const matchesUnfiled = (t) => {
    if (activeArea === ALL_AREAS || t.area_id) return false
    if (filter !== 'all') {
      const a = normalizeAssignee(t.assignee)
      if (a !== filter && a !== 'anyone') return false
    }
    if (activeTag !== 'all' && !(t.tags || []).includes(activeTag)) return false
    return true
  }

  // `matches` closes over filter/activeArea/activeTag — all listed below; ESLint
  // just can't see through the helper, so the dep lists are in fact complete.
  // Projects are excluded here — they live in their own index (ProjectsView),
  // reached via the Tasks↔Projects switcher. The Tasks list stays pure to-dos.
  const topOpen = useMemo(
    () =>
      tasks
        .filter((t) => !t.parent_id && !t.completed_at && !isProject(t) && matches(t))
        .sort(byOrder),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, filter, activeArea, activeTag],
  )
  // Done is a dated logbook of check-offs, not a list of completed task rows.
  // Recurring tasks roll forward (completed_at stays null), so they'd never show
  // here otherwise — completionLog reads the completion log so every check-off
  // appears the day it happened. See lib/tasks.completionLog.
  // Completed projects belong to the Projects › Done section, not the Tasks
  // logbook — keep them out so a finished project surfaces in exactly one place.
  const log = useMemo(
    () => completionLog(tasks, completions, (t) => matches(t) && !isProject(t)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, completions, filter, activeArea, activeTag],
  )
  const logCount = useMemo(() => log.reduce((n, g) => n + g.events.length, 0), [log])
  // Open tasks with no area at all, while a lens is on. Shown in a collapsed
  // section at the foot rather than mixed in: the lens stays legible, and the
  // section does the nudging to file them that a silent rule can't.
  const unfiled = useMemo(
    () =>
      tasks
        .filter((t) => !t.parent_id && !t.completed_at && !isProject(t) && matchesUnfiled(t))
        .sort(byOrder),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, filter, activeArea, activeTag],
  )
  // Whether the row we were sent to is one of the unfiled ones, so the "No area"
  // fold can open itself for it — a link that lands you on a page and leaves the
  // row behind a collapsed section didn't land you anywhere.
  const unfiledTarget = expandId && unfiled.some((t) => t.id === expandId) ? expandId : null
  // The same rescue the open list gets, for check-offs. `matches` drops a task
  // with no area of its own the moment a lens is on, and the logbook had no
  // equivalent of the "No area" section below — so a completed unfiled task
  // didn't read as filtered out, it read as gone. Uncapped, unlike the main log:
  // it sits behind two taps already, and a rescue section that hides part of
  // what it rescued is the same failure one level down.
  const unfiledLog = useMemo(
    () => completionLog(tasks, completions, (t) => matchesUnfiled(t) && !isProject(t)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, completions, filter, activeArea, activeTag],
  )
  const unfiledLogCount = useMemo(
    () => unfiledLog.reduce((n, g) => n + g.events.length, 0),
    [unfiledLog],
  )
  // Counted together because they're rendered together: the fold below holds
  // both, so its header would be lying if it only counted one of them.
  const doneCount = logCount + unfiledLogCount

  // Which Done rows have a live check. A row can only undo something if it's the
  // task's CURRENT closed state. A recurring task that rolled forward carries no
  // completed_at — its rows are history, and an un-check there means nothing, so
  // the check stays a static marker.
  //
  // But a series that has ENDED — `until` passed, count spent, every remaining
  // date skipped — closes with a real completed_at, exactly like a one-off, and
  // still carries its rule. The old test here was `!task.recurrence`, which
  // greyed those out along with the history and left them with no way back at
  // all: once a task is done it's out of the list and out of Quick Find, so the
  // page that has a Reopen button is unreachable and this check is the only
  // control there is.
  //
  // Only the newest row per task goes live. completeTask drops the most recent
  // completion, so an older row would quietly undo a different day than the one
  // you tapped. Both logs are walked because they're disjoint by task — a task
  // is in the lens or unfiled, never both — and each is already newest-first.
  const liveChecks = useMemo(() => {
    const live = new Set()
    const seen = new Set()
    for (const g of [...log, ...unfiledLog]) {
      for (const e of g.events) {
        if (seen.has(e.task.id)) continue
        seen.add(e.task.id)
        if (e.task.completed_at) live.add(e.id)
      }
    }
    return live
  }, [log, unfiledLog])
  // Inline view is capped to the last 2 weeks / 30 check-offs (whichever bites
  // first) so the list can't run away; "Show N earlier" reveals the rest in place.
  const { groups: cappedLog, omitted } = useMemo(() => capCompletionLog(log), [log])
  const shownLog = showAllDone ? log : cappedLog
  const grouped = useMemo(() => {
    const g = { overdue: [], today: [], anytime: [], upcoming: [], someday: [] }
    for (const t of topOpen) g[taskBucket(t)].push(t)
    // Upcoming is date-driven, so read it chronologically (soonest first) rather
    // than by manual drag order — what's "coming up next" belongs at the top.
    g.upcoming.sort(byUpcoming)
    // Anytime reads as a queue of deadlines: least slack first, so the thing you
    // should slot in next is on top.
    g.anytime.sort(byDue)
    return g
  }, [topOpen])

  // Upcoming is mostly recurring chores for anyone with a real chore rota, and
  // they drown the handful of one-off dated tasks that share the section. Each
  // is only one row (they roll forward rather than stacking up), but twelve of
  // them still bury the two things you'd actually plan around — so they fold
  // away behind a count, the way Done does.
  //
  // Only once there are enough to actually crowd, though: hiding one or two
  // rows behind a header row saves no space and costs a tap to read them. Below
  // the threshold Upcoming stays a single chronological list, which is the
  // better read anyway when it's short.
  const upcomingParts = useMemo(() => {
    const recurring = grouped.upcoming.filter((t) => t.recurrence)
    if (recurring.length < FOLD_RECURRING_AT) return { oneOff: grouped.upcoming, recurring: [] }
    return { oneOff: grouped.upcoming.filter((t) => !t.recurrence), recurring }
  }, [grouped.upcoming])

  // The rota fold makes the same promise the "No area" one does, and breaks it
  // the same way: a link to a chore that happens to repeat would land on a page
  // with the row counted but not drawn.
  useEffect(() => {
    if (expandId && upcomingParts.recurring.some((t) => t.id === expandId)) setShowRecurring(true)
  }, [expandId, upcomingParts.recurring])

  // Today splits in two: clock-anchored tasks lead in time order (a 9 AM
  // commitment shouldn't sink under untimed to-dos), then untimed tasks keep the
  // user's manual order below. All Today tasks share today's date, so byDue here
  // collapses to time-of-day, then priority.
  const todayParts = useMemo(() => {
    const timed = grouped.today.filter((t) => t.due_time).sort(byDue)
    const untimed = grouped.today.filter((t) => !t.due_time)
    return { timed, untimed }
  }, [grouped.today])

  // Every open task on the page, in the order it is drawn — the buckets in
  // BUCKETS order, with the two that split internally (Upcoming's one-offs
  // before its recurring rota, Today's timed before its untimed) split the same
  // way here, then Unfiled. Copying a selection has to come out in the order
  // you saw it, and a bulk delete's toast has to count what you actually chose.
  //
  // Done tasks are deliberately absent: the log is a record of what happened,
  // and the actions this offers (complete, delete) either mean nothing there or
  // mean something the logbook's own controls already say better.
  const selectable = useMemo(() => {
    const out = []
    for (const b of BUCKETS) {
      if (b.id === 'upcoming') out.push(...upcomingParts.oneOff, ...upcomingParts.recurring)
      else if (b.id === 'today') out.push(...todayParts.timed, ...todayParts.untimed)
      else out.push(...grouped[b.id])
    }
    out.push(...unfiled)
    return out
  }, [grouped, upcomingParts, todayParts, unfiled])
  const selectableIds = useMemo(() => selectable.map((t) => t.id), [selectable])
  const sel = useSelection(selectableIds)

  // Most buckets here are hand-orderable, so reorder keeps the long press and
  // Select is reached from the header button. lib/gestures owns the rule.
  const pressOwner = longPressOwner({ reorderable: true, selecting: sel.selecting })

  const bulkActions = [
    {
      label: 'Done',
      icon: CheckSquare,
      // One at a time through completeTask, deliberately: it is the only thing
      // that knows how to roll a recurring task forward and log who did it, and
      // a bulk path that wrote completed_at directly would quietly break every
      // repeating task in the selection.
      onClick: () =>
        sel.run((ids) => {
          const rows = selectable.filter((t) => ids.includes(t.id))
          for (const t of rows) if (!t.completed_at) completeTask(t, true)
          showToast(`Checked off ${countLabel(rows.length, 'task')}`)
        }),
    },
    {
      label: 'Copy',
      icon: Copy,
      onClick: () =>
        sel.run(async (ids) => {
          const rows = selectable.filter((t) => ids.includes(t.id))
          const ok = await copyText(toMarkdown(rows))
          showToast(ok ? `Copied ${countLabel(rows.length, 'task')}` : 'Could not copy that', {
            variant: ok ? undefined : 'error',
          })
        }),
    },
    {
      label: 'Delete',
      icon: Trash2,
      variant: 'danger',
      // deleteTasks raises one Undo toast covering all of them, so no confirm —
      // same reasoning the single-row swipe delete already follows.
      onClick: () => sel.run((ids) => deleteTasks(ids)),
    },
  ]

  // Sorted the way ProjectDetail sorts a project's steps: manual order first,
  // creation order for whatever was never dragged. The sort isn't cosmetic —
  // moveUpdates() ranks a drop against the array as displayed, so without it
  // the reorder below would write ranks against the wrong neighbours.
  const subtasks = (id) => tasks.filter((t) => t.parent_id === id && !t.is_heading).sort(byOrder)

  const toggleExpanded = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const toggle = (t) => {
    if (!t.completed_at) haptics.success()
    completeTask(t, !t.completed_at)
  }

  // Deleting a task takes its subtasks with it (deleteTask cascades). The undo
  // toast covers a mis-tap on a single task, but silently removing eight
  // children is not something to find out about from a toast — so anything with
  // subtasks states the consequence first.
  const removeTask = async (task) => {
    const kids = subtasks(task.id).length
    if (kids > 0) {
      const ok = await confirm({
        title: `Delete “${task.title}”?`,
        message: `Its ${kids} subtask${kids === 1 ? '' : 's'} go too. You can undo this from the toast.`,
        confirmLabel: 'Delete',
        danger: true,
      })
      if (!ok) return
    }
    deleteTask(task.id)
  }

  const addSub = (parent) => {
    const title = (subDrafts[parent.id] || '').trim()
    if (!title) return
    addTask({
      title,
      parent_id: parent.id,
      assignee: parent.assignee,
      privacy_level: parent.privacy_level,
    })
    setSubDrafts((d) => ({ ...d, [parent.id]: '' }))
  }

  const addQuick = () => {
    if (!quickDraft.trim()) return
    const fields = quickTaskFields(quickDraft, { today: isoDateIn(0), members: members() })
    // Who it lands on, in order of how explicit the signal is: a "for <name>" in
    // the typed text wins; then the member whose list you're looking at; then
    // you (household.defaultAssignee — the same rule TaskForm uses).
    if (fields.assignee === 'anyone') {
      fields.assignee = filter !== 'all' ? filter : defaultAssignee()
    }
    // Inherit the active content filters so a quick task stays in the view you
    // added it to — otherwise matches() hides it the moment it's created.
    if (activeArea !== ALL_AREAS) fields.area_id = activeArea
    if (activeTag !== 'all') fields.tags = [activeTag]
    haptics.success()
    // Privacy follows the user's "new task" default, exactly like TaskForm — solo
    // households are always private; otherwise it's the configured taskPrivacy —
    // and an area that keeps things private overrides it, so a quick task typed
    // under the Work lens lands as private without a form to say so in.
    addTask({
      ...fields,
      privacy_level: isSolo()
        ? PRIVATE_LEVEL
        : privacyForNewItem(areaById(data.areas, activeArea), defaultPrivacy),
    })
    setQuickDraft('')
    quickRef.current?.focus()
  }

  const renderTask = (task) => {
    const subs = subtasks(task.id)
    const progress = subs.length
      ? { done: subs.filter((s) => s.completed_at).length, total: subs.length }
      : null

    // topOpen already excludes projects — they live in ProjectsView — so every
    // row rendered here expands inline.
    const isOpen = expanded.has(task.id)
    const history = completionsFor(task.id, completions)

    // While selecting, the row is a checkbox with a task on it: no expand, no
    // open-full-screen, no completion circle. Its own branch, because "this row
    // means something else now" is what a mode is.
    if (sel.selecting) {
      const picked = sel.isSelected(task.id)
      return (
        <div key={task.id} {...focusRow(task.id)}>
          <PressableRow
            className={`list-row ${picked ? 'is-selected' : ''}`}
            onClick={() => sel.toggle(task.id)}
            label={task.title}
          >
            <span
              className={`select-tick tap-target ${picked ? 'on' : ''}`}
              role="checkbox"
              aria-checked={picked}
              aria-label={task.title}
            >
              <Check size={14} />
            </span>
            <TaskRow task={task} progress={progress} area={rowArea(task)} />
          </PressableRow>
        </div>
      )
    }

    return (
      <div key={task.id} {...focusRow(task.id)}>
        <PressableRow
          onClick={() => toggleExpanded(task.id)}
          onLongPress={pressOwner === 'selection' ? () => sel.enter(task.id) : undefined}
          label={`${task.title}, ${isOpen ? 'collapse' : 'expand'} details`}
        >
          <TaskRow task={task} onToggle={toggle} progress={progress} area={rowArea(task)} />
          {/* Beside the chevron rather than instead of it, because they answer
              different questions. The chevron is a glance — check the subtasks
              without losing the list. This one leaves the list behind and gives
              the task a page, where nothing is abbreviated to fit a row. */}
          {onOpenTask && (
            <IconButton
              icon={Maximize2}
              label={`Open ${task.title}`}
              onClick={(e) => {
                e.stopPropagation()
                onOpenTask(task.id)
              }}
            />
          )}
          <ChevronRight
            size={18}
            className="row-chevron"
            style={{
              transform: isOpen ? 'rotate(90deg)' : 'none',
              transition: 'transform 200ms ease',
            }}
          />
        </PressableRow>
        {isOpen && (
          <div className="task-expand">
            {task.notes && (
              <p className="muted" style={{ fontSize: 14, marginBottom: 10 }}>
                {task.notes}
              </p>
            )}
            {/* Same primitive, same persistence path as the project page's
                subtasks — the order you drag here is the order you'd see if you
                opened the task full-screen. */}
            {subs.length > 0 && (
              <ReorderableList
                className="reorder-plain"
                items={subs}
                onMove={(from, to) => reorderTasks(moveUpdates(subs, from, to))}
                renderItem={(s) => (
                  <div className="list-row sub">
                    <TaskRow
                      task={s}
                      onToggle={toggle}
                      size="sm"
                      hideAssignee={
                        normalizeAssignee(s.assignee) === normalizeAssignee(task.assignee)
                      }
                    />
                    <AddToCalendar task={s} parent={task} trigger="icon" />
                    <IconButton
                      icon={X}
                      variant="danger"
                      label="Delete subtask"
                      onClick={() => deleteTask(s.id)}
                    />
                  </div>
                )}
              />
            )}
            <div className="subtask-add">
              <input
                value={subDrafts[task.id] || ''}
                onChange={(e) => setSubDrafts((d) => ({ ...d, [task.id]: e.target.value }))}
                placeholder="Add a subtask…"
                enterKeyHint="done"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addSub(task)
                  }
                }}
              />
              <button className="text-btn" onClick={() => addSub(task)}>
                Add
              </button>
            </div>
            {history.length > 0 && (
              <div className="task-history">
                <div className="task-history-head">
                  Last done {relativeTime(history[0].completed_at)}
                  {history[0].completed_by ? ` · ${assigneeLabel(history[0].completed_by)}` : ''}
                </div>
                {history.slice(1, 4).map((c) => (
                  <div className="task-history-row" key={c.id}>
                    {relativeTime(c.completed_at)}
                    {c.completed_by ? ` · ${assigneeLabel(c.completed_by)}` : ''}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
              <button className="text-btn" onClick={() => onEdit(task)}>
                Edit
              </button>
              {/* Retrofitting a backlog one task at a time through the form is
                  the kind of chore nobody finishes, so the on/by flip gets a
                  one-tap home here. It names the section the task lands in
                  rather than the field it sets — that's the visible outcome,
                  and the row moving there is the confirmation. */}
              {canFlipDueKind(task) && (
                <button
                  className="text-btn"
                  onClick={() => {
                    haptics.light()
                    updateTask(task.id, { due_kind: isDeadline(task) ? 'on' : 'by' })
                  }}
                >
                  {isDeadline(task) ? 'Move to Upcoming' : 'Move to Anytime'}
                </button>
              )}
              <AddToCalendar task={task} />
              {task.recurrence && (
                <button className="text-btn" onClick={() => skipTaskOccurrence(task)}>
                  Skip this one
                </button>
              )}
              <button className="text-btn danger" onClick={() => removeTask(task)}>
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // One row in the Done logbook. Reads "done" (filled check, struck title) with a
  // right-aligned time-of-day stamp. A row that is the task's current closed
  // state keeps its un-check (tap the check to reopen); a past occurrence of a
  // still-running recurring task is a historical event, so its check is a static
  // marker — see liveChecks.
  //
  // The row itself opens the task's page rather than its edit form. The form
  // offers title/date/area and no way to reopen, so landing there from the one
  // place completed tasks are listed was a dead end with the wrong fields in it;
  // the page carries a labelled Reopen, which is what you came here for. Edit is
  // one tap further on, where it isn't the only thing on offer.
  const renderLogEvent = (event) => {
    const { task } = event
    const canReopen = liveChecks.has(event.id)
    return (
      <PressableRow
        key={event.id}
        onClick={() => (onOpenTask ? onOpenTask(task.id) : onEdit(task))}
        label={`${onOpenTask ? 'Open' : 'Edit'} ${task.title}`}
        focus={focusRow(task.id)}
      >
        <button
          className="task-check done"
          onClick={(e) => {
            e.stopPropagation()
            if (canReopen) toggle(task)
          }}
          aria-label={canReopen ? 'Mark not done' : 'Completed'}
          disabled={!canReopen}
        >
          <Check size={15} />
        </button>
        <div className="row-body">
          <div className="row-titleline">
            <div className="row-title task-done">{task.title}</div>
            <SharedDot item={task} />
          </div>
          <div className="task-meta">
            {task.recurrence && (
              <span className="chip" title={describeRecurrence(task.recurrence)}>
                <RepeatIcon size={11} />
              </span>
            )}
            {areaById(data.areas, task.area_id) && (
              <span className="chip area">{areaById(data.areas, task.area_id).name}</span>
            )}
            {event.completedBy && <span className="chip">{assigneeLabel(event.completedBy)}</span>}
            <span className="log-time">{completionTime(event.completedAt)}</span>
          </div>
        </div>
      </PressableRow>
    )
  }

  return (
    <div className={sel.selecting ? 'selecting' : undefined}>
      <PageHeader
        title="Tasks"
        navOptions={hub?.options}
        navActive={hub?.active}
        onNavigate={hub?.onNavigate}
        createAction={onAdd}
        actionLabel="New task"
        // Selection's guaranteed front door. Every bucket here is
        // hand-orderable, so the long press belongs to reorder and this button
        // is the only way in — see longPressOwner.
        secondaryAction={selectable.length && !sel.selecting ? () => sel.enter() : undefined}
        secondaryActionIcon={CheckSquare}
        secondaryActionLabel="Select tasks"
        onSearch={onSearch}
        // Whose tasks, up on the title row — the only page in the app with a
        // per-person view, and the one filter that decides what "Tasks" means.
        // It was a full-width tab bar under the header, which spent a whole row
        // on it, divided that row by N members (slivers past three), and let it
        // scroll away from the list it was scoping. Only shown with someone to
        // filter by (see isSolo).
        filter={
          isSolo() ? null : (
            <MenuSelect
              options={filterOptions}
              value={filter}
              onChange={setFilter}
              label="Show tasks for"
            />
          )
        }
      />

      {/* The area pills used to live here. They're gone: the lens is one
          control in the shell now (sidebar on desktop, under the header on a
          phone), scoping every page at once. Two controls for one concept is
          worse than either alone — and it was the per-page version that made
          you re-apply the same decision on seven screens. The tag pills below
          stay, because a tag is a different axis and deliberately page-local. */}

      {/* Tags, in their own outlined-and-hashed language — see .tag-filter. On a
          phone this row lands directly under the area lens, and until they were
          told apart the two read as one four-line pill soup. */}
      {tagList.length > 0 && (
        <div className="tag-filter" role="group" aria-label="Filter by tag">
          <button
            className={`tag-pill tag-pill-all ${activeTag === 'all' ? 'on' : ''}`}
            aria-pressed={activeTag === 'all'}
            onClick={() => setTagFilter('all')}
          >
            All tags
          </button>
          {tagList.map((t) => (
            <button
              key={t}
              className={`tag-pill ${activeTag === t ? 'on' : ''}`}
              aria-pressed={activeTag === t}
              onClick={() => setTagFilter(t)}
            >
              <span className="tag-pill-hash" aria-hidden="true">
                #
              </span>
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="task-quickadd">
        <div className="task-quickadd-row">
          <Plus size={18} className="task-quickadd-icon" />
          <input
            ref={quickRef}
            value={quickDraft}
            onChange={(e) => setQuickDraft(e.target.value)}
            placeholder="Add a task… e.g. trash out every Monday"
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addQuick()
              }
            }}
          />
        </div>
        {quickPreview.tokens.length > 0 && (
          <div className="nl-preview" aria-live="polite">
            <span className="nl-preview-title">{quickPreview.title}</span>
            <span className="nl-chips">
              {quickPreview.tokens.map((t) => {
                const Icon = TOKEN_ICON[t.type]
                return (
                  <span key={t.type} className={`nl-chip nl-${t.type}`}>
                    {Icon && <Icon size={11} />} {t.label}
                  </span>
                )
              })}
            </span>
          </div>
        )}
      </div>

      {topOpen.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          action={
            <button className="text-btn" onClick={onAdd}>
              <Plus size={14} /> New task
            </button>
          }
        >
          {activeArea !== ALL_AREAS
            ? `Nothing in ${areaById(data.areas, activeArea)?.name || 'this area'}.`
            : filter === 'all'
              ? 'Nothing on the list. Add a task.'
              : 'Nothing assigned here.'}
        </EmptyState>
      ) : (
        BUCKETS.map((b) =>
          grouped[b.id].length ? (
            <div key={b.id}>
              <SectionLabel>{b.label}</SectionLabel>
              {b.id === 'upcoming' ? (
                // Date-driven: chronological, no manual reorder. One-offs lead;
                // the recurring rota folds away beneath them.
                <>
                  {upcomingParts.oneOff.length > 0 && (
                    <div className="list">{upcomingParts.oneOff.map(renderTask)}</div>
                  )}
                  {upcomingParts.recurring.length > 0 && (
                    <>
                      <button
                        className="section-label section-toggle subsection-toggle"
                        aria-expanded={showRecurring}
                        onClick={() => setShowRecurring((v) => !v)}
                      >
                        Recurring · {upcomingParts.recurring.length}{' '}
                        <ChevronRight
                          size={13}
                          style={{ transform: showRecurring ? 'rotate(90deg)' : 'none' }}
                        />
                      </button>
                      {showRecurring && (
                        <div className="list">{upcomingParts.recurring.map(renderTask)}</div>
                      )}
                    </>
                  )}
                </>
              ) : b.id === 'anytime' ? (
                // Deadline queue: least slack first, no manual reorder.
                <div className="list">{grouped[b.id].map(renderTask)}</div>
              ) : b.id === 'today' ? (
                // Timed tasks lead in clock order; untimed stay reorderable below.
                <>
                  {todayParts.timed.length > 0 && (
                    <div className="list">{todayParts.timed.map(renderTask)}</div>
                  )}
                  {/* Selecting drops the reorder wrapper rather than disabling
                      it: a lift under a finger that meant to tick one more row
                      would scatter the bucket. */}
                  {sel.selecting ? (
                    <div className="list">{todayParts.untimed.map(renderTask)}</div>
                  ) : (
                    <ReorderableList
                      items={todayParts.untimed}
                      onMove={(from, to) => reorderTasks(moveUpdates(todayParts.untimed, from, to))}
                      renderItem={renderTask}
                    />
                  )}
                </>
              ) : sel.selecting ? (
                <div className="list">{grouped[b.id].map(renderTask)}</div>
              ) : (
                <ReorderableList
                  items={grouped[b.id]}
                  onMove={(from, to) => reorderTasks(moveUpdates(grouped[b.id], from, to))}
                  renderItem={renderTask}
                />
              )}
            </div>
          ) : null,
        )
      )}

      {/* Above Done, below the buckets: what the lens excluded only for having
          no area of its own. Collapsed, so it costs one row until you want it. */}
      <UnfiledSection count={unfiled.length} openFor={unfiledTarget}>
        <div className="list">{unfiled.map(renderTask)}</div>
      </UnfiledSection>

      {doneCount > 0 && (
        <>
          <button className="section-label section-toggle" onClick={() => setShowDone((v) => !v)}>
            Done · {doneCount}{' '}
            <ChevronRight size={13} style={{ transform: showDone ? 'rotate(90deg)' : 'none' }} />
          </button>
          {showDone && (
            <>
              {shownLog.map((g) => (
                <div key={g.day}>
                  <div className="log-day">{g.label}</div>
                  <div className="list">{g.events.map(renderLogEvent)}</div>
                </div>
              ))}
              {omitted > 0 && (
                <button className="text-btn log-more" onClick={() => setShowAllDone((v) => !v)}>
                  {showAllDone ? 'Show less' : `Show ${omitted} earlier`}
                </button>
              )}
              {/* The same promise UnfiledSection makes on the open list, told
                  with the nested fold Upcoming's rota already uses: Done is
                  itself a collapsed section, and a second top-level "No area"
                  row would sit beside the open list's saying something else. */}
              {unfiledLogCount > 0 && (
                <>
                  <button
                    className="section-label section-toggle subsection-toggle"
                    aria-expanded={showUnfiledDone}
                    onClick={() => setShowUnfiledDone((v) => !v)}
                  >
                    No area · {unfiledLogCount}{' '}
                    <ChevronRight
                      size={13}
                      style={{ transform: showUnfiledDone ? 'rotate(90deg)' : 'none' }}
                    />
                  </button>
                  {showUnfiledDone &&
                    unfiledLog.map((g) => (
                      <div key={g.day}>
                        <div className="log-day">{g.label}</div>
                        <div className="list">{g.events.map(renderLogEvent)}</div>
                      </div>
                    ))}
                </>
              )}
            </>
          )}
        </>
      )}

      {sel.selecting && (
        <SelectionBar
          count={sel.count}
          noun="task"
          allSelected={sel.allSelected}
          onToggleAll={sel.toggleAll}
          onCancel={sel.exit}
          actions={bulkActions}
        />
      )}
    </div>
  )
}
