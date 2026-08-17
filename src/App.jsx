import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { supabase } from './lib/supabase'
import { demoMode } from './lib/demo'
import { buildAttention, badgeCount } from './lib/attention'
import { useData } from './hooks/useData'
import { useHousehold, ACTIVE_HOUSEHOLD_KEY } from './hooks/useHousehold'
import { useMediaQuery } from './hooks/useMediaQuery'
import { useNotificationPrefs } from './hooks/useNotificationPrefs'
import { useAppPrefs } from './hooks/useAppPrefs'
import { useNow } from './hooks/useNow'
import { useEdgeBack } from './hooks/useEdgeBack'
import { currentMemberId, clearHousehold, memberName, normalizeAssignee } from './lib/household'
import { clearSnapshots } from './lib/offlineCache'
import { taskTags, isProject } from './lib/tasks'
import { areaCounts, areaForNewItem, resolveAreaId, visibleAreas } from './lib/areas'
import { isOpenItem } from './lib/listKinds'
import { setAppPrefs } from './lib/appPrefs'
import { buildProjectRows } from './lib/projectTemplates'
import { scrollToTop } from './lib/scroller'
import InstallHint from './components/shell/InstallHint'
import AuthScreen from './features/auth/AuthScreen'
import Onboarding from './features/auth/Onboarding'
import Sidebar from './components/shell/Sidebar'
import { AccountProvider } from './components/shell/AccountMenu'
import MobileNav from './components/shell/MobileNav'
import ConfirmDialog from './components/ui/ConfirmDialog'
import { ConfirmProvider } from './components/ui/ConfirmProvider'
import QuickFind from './components/shell/QuickFind'
import TodayView from './features/today/TodayView'
import ActivityView from './features/activity/ActivityView'
import PullToRefresh from './components/ui/PullToRefresh'
import SearchView from './features/people/SearchView'
import TasksView from './features/tasks/TasksView'
import ProjectsView from './features/tasks/ProjectsView'
import RemindersView from './features/reminders/RemindersView'
import ListsView from './features/lists/ListsView'
import ListDetail from './features/lists/ListDetail'
import NotesView from './features/notes/NotesView'
import ProjectDetail from './features/tasks/ProjectDetail'
import TaskDetail from './features/tasks/TaskDetail'
import PersonPage from './features/people/PersonPage'
import OrgsView from './features/people/OrgsView'
import OrgPage from './features/people/OrgPage'
import GroupsView from './features/people/GroupsView'
import GroupPage from './features/people/GroupPage'
import HabitsView from './features/habits/HabitsView'
import HabitDetail from './features/habits/HabitDetail'
import HabitInsightsView from './features/habits/HabitInsightsView'
import HabitTemplatePicker from './features/habits/HabitTemplatePicker'
import RelationshipsView from './features/people/RelationshipsView'
import SettingsView from './features/settings/SettingsView'
import LegalView from './features/settings/LegalView'
import BoardView from './features/board/BoardView'
import ErrorBoundary from './components/shell/ErrorBoundary'
import Toasts from './components/shell/Toasts'

// Lazy: Import/Export carries the CSV parser — no reason to ship it on
// every app open when it's visited once a month.
const ImportExport = lazy(() => import('./features/settings/ImportExport'))
// Dev-only reference page for the ui/ primitives (#/kitchen-sink).
// import.meta.env.DEV is a build-time constant, so the whole module — and its
// route — drop out of a production bundle.
const KitchenSink = import.meta.env.DEV
  ? lazy(() => import('./features/kitchen-sink/KitchenSink'))
  : null
import PersonForm from './features/people/PersonForm'
import TaskForm from './features/tasks/TaskForm'
import ProjectTemplatePicker from './features/tasks/ProjectTemplatePicker'
import ListForm from './features/lists/ListForm'
import OrgForm from './features/people/OrgForm'
import GroupForm from './features/people/GroupForm'
import HabitForm from './features/habits/HabitForm'
import AreasView from './features/areas/AreasView'
import AreaForm from './features/areas/AreaForm'
import RelationshipForm from './features/people/RelationshipForm'
import ReminderForm from './features/reminders/ReminderForm'
import { EMPTY_PEOPLE_FILTERS } from './lib/search'
import { isEditableTarget } from './lib/keys'
import { AREA_SCOPED_ROUTES, DETAIL_ROUTES, KNOWN_ROUTES } from './lib/nav'
import AreaSwitcher from './components/shell/AreaSwitcher'
import EmptyState from './components/ui/EmptyState'

// Routing and the chrome's shape both come from lib/nav.js — see the comment at
// the top of it for why they stopped living here.
function parseHash() {
  const [name, id] = window.location.hash.replace(/^#\/?/, '').split('/')
  return { name: name || 'today', id }
}

// Dev-only, so it can't sit in the shared table: the kitchen sink's route.
const ROUTES = [...KNOWN_ROUTES, ...(import.meta.env.DEV ? ['kitchen-sink'] : [])]

// The "Network" hub: People and the three views that are really groupings of
// people. On mobile these collapse behind the People title dropdown instead of
// each claiming a nav slot; the desktop sidebar still breaks them out.
const HUB_OPTIONS = [
  { id: 'people', label: 'People' },
  { id: 'groups', label: 'Groups' },
  { id: 'orgs', label: 'Organizations' },
  { id: 'relationships', label: 'Relationships' },
]

// The "Work" hub: Tasks (everyday to-dos) and Projects (bigger things you start
// deliberately). Same mobile title-dropdown treatment as the People hub — on
// desktop the sidebar breaks them out instead.
const WORK_OPTIONS = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'projects', label: 'Projects' },
  { id: 'reminders', label: 'Reminders' },
]

export default function App() {
  // Runtime demo: the "Explore the demo" button works even when Supabase is
  // configured (build-time demoMode can't capture that). A demo session
  // bypasses auth + the household gate entirely.
  const [demo, setDemo] = useState(false)
  return (
    <ErrorBoundary>
      <ConfirmProvider>
        {demo ? (
          <Shell session={{ demo: true }} onLogout={() => setDemo(false)} />
        ) : (
          <AuthedApp onDemo={() => setDemo(true)} />
        )}
      </ConfirmProvider>
    </ErrorBoundary>
  )
}

function AuthedApp({ onDemo }) {
  // No Supabase configured → nothing to sign into; jump straight to the
  // demo-only auth screen (session stays null).
  const [session, setSession] = useState(supabase ? undefined : null) // undefined = checking
  const [route, setRoute] = useState(parseHash)
  // A password-reset link logs the user in with a temporary recovery session.
  // We intercept that (PASSWORD_RECOVERY) to show "choose a new password" instead
  // of dropping them into the app, which would never let them set the password.
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      // Drop the previous user's hydrated household so a sign-out (or a
      // different user signing in on this device) never reads stale members.
      if (event === 'SIGNED_OUT') {
        clearHousehold()
        clearSnapshots() // drop the offline data snapshot too — next user/device state starts clean
        try {
          localStorage.removeItem(ACTIVE_HOUSEHOLD_KEY)
        } catch {
          /* ignore */
        }
      }
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Track the hash so the legal pages are reachable without a session — they
  // need to render before auth (App-store / privacy-link requirement), so we
  // intercept them here, ahead of the loading and sign-in branches.
  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Logged-out (or still-checking): show the legal page on its own. Once
  // signed in, fall through so Shell renders it with the app chrome instead.
  if (!session && (route.name === 'privacy' || route.name === 'terms')) {
    return (
      <main className="main legal-standalone">
        <div className="content">
          <LegalView
            doc={route.name}
            onBack={() => {
              window.location.hash = '/'
            }}
          />
        </div>
      </main>
    )
  }

  if (session === undefined) {
    return (
      <div className="login-wrap">
        <span className="muted dots">Loading</span>
      </div>
    )
  }
  // Recovery link clicked: force the new-password screen even though a (temporary)
  // session now exists. Clearing the flag on success drops them into the app.
  if (recovering)
    return <AuthScreen recovery onRecovered={() => setRecovering(false)} onDemo={onDemo} />
  if (!session) return <AuthScreen onDemo={onDemo} noAuth={!supabase} />
  return <HouseholdGate session={session} onLogout={() => supabase.auth.signOut()} />
}

// Between a valid session and the app: ensure the user belongs to a household
// (creating/joining one if not), and hydrate the household cache before the
// Shell — which reads members synchronously — mounts.
function HouseholdGate({ session, onLogout }) {
  const hh = useHousehold(session)
  if (hh.status === 'loading') {
    return (
      <div className="login-wrap">
        <span className="muted dots">Loading</span>
      </div>
    )
  }
  if (hh.status === 'error') {
    return (
      <div className="login-wrap">
        <span className="muted">Couldn’t load your household.</span>
        <button className="btn-primary" onClick={hh.refresh}>
          Try again
        </button>
      </div>
    )
  }
  if (hh.status === 'none') {
    return <Onboarding session={session} onDone={hh.refresh} onLogout={onLogout} />
  }
  return <Shell session={session} onLogout={onLogout} household={hh} />
}

function Shell({ session, onLogout, household }) {
  const data = useData(session)
  const [route, setRoute] = useState(parseHash)
  // Set by go() just before it changes the hash; consumed by the hashchange
  // handler, which is the first moment the new history entry exists to stamp.
  const pushedByUs = useRef(false)
  const [query, setQuery] = useState('') // lifted so Back returns to the same results
  // People-page filters, lifted for the same reason: leaving and coming back
  // keeps the applied filter (resets on full reload, like the search query).
  const [peopleFilters, setPeopleFilters] = useState(EMPTY_PEOPLE_FILTERS)
  const [editingPerson, setEditingPerson] = useState(null) // null | 'new' | person
  const [editingOrg, setEditingOrg] = useState(null)
  const [editingGroup, setEditingGroup] = useState(null)
  const [editingHabit, setEditingHabit] = useState(null)
  const [editingArea, setEditingArea] = useState(null)
  const [pickingHabit, setPickingHabit] = useState(false) // template "start from" sheet
  const [editingTask, setEditingTask] = useState(null) // null | 'new' | task
  const [pickingProject, setPickingProject] = useState(false) // template "new project" sheet
  const [projectSeedName, setProjectSeedName] = useState('') // title carried from the task form
  const [editingList, setEditingList] = useState(null) // null | 'new' | list
  const [editingReminder, setEditingReminder] = useState(null) // null | 'new' | reminder
  const [relationshipFrom, setRelationshipFrom] = useState(null) // null | 'new' | person
  const [quickFind, setQuickFind] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const searchRef = useRef(null)
  const mainRef = useRef(null)
  const isMobile = useMediaQuery('(max-width: 720px)')

  // Per-member defaults (new-item visibility + Tasks view). Keyed the same way
  // SettingsView writes them: the DB member id when live, the localStorage one
  // in demo — so reads here match what Settings saved.
  const isDemo = !!(demoMode || session?.demo)
  const meId = isDemo ? currentMemberId() : household?.memberId
  const [appPrefs] = useAppPrefs(meId)

  // The area lens, resolved once here so every scoped view reads the same
  // answer. resolveAreaId guards a stale selection — the lens persists across
  // launches, so the area it names can be deleted, archived or un-shared by a
  // co-member while you're away, and a filter pointing at a missing row would
  // show an empty app with no explanation.
  const areaId = resolveAreaId(data.areas, appPrefs.area, data.userId)
  const setArea = (v) => setAppPrefs(meId, { area: v })
  // Open work per area, for the switcher's quiet counts. Tasks only: it's the
  // number you'd act on, and summing five entity types would make "Home 43"
  // mean nothing in particular.
  const areaCountsByOpenTask = useMemo(
    () => areaCounts(data.tasks.filter((t) => !t.completed_at && !t.parent_id)),
    [data.tasks],
  )

  useEffect(() => {
    // Route changes cross-fade via the View Transitions API where available
    // (flushSync so the new view is painted inside the transition frame).
    // Reduced-motion users and other browsers get the plain instant swap.
    const onHash = () => {
      // Mark the entry we just pushed as ours (see `go` below). Stamped here
      // rather than in `go` because the entry doesn't exist yet at that point,
      // and only when the change came from us — the browser walking its own
      // history fires this too, and stamping then would relabel the entry the
      // user originally arrived on.
      if (pushedByUs.current) {
        pushedByUs.current = false
        try {
          window.history.replaceState({ ...(window.history.state || {}), appNav: true }, '')
        } catch {
          /* Safari's replaceState rate limit — Back just falls back to an index */
        }
      }
      const apply = () => setRoute(parseHash())
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      // document.hidden: a hidden tab gets no animation frames, so a started
      // transition would never finish and its overlay would eat all input.
      if (document.startViewTransition && !reduceMotion && !document.hidden) {
        document.startViewTransition(() => flushSync(apply))
      } else {
        apply()
      }
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Land at the top of the page on navigation — the scroller persists across
  // route changes, so without this you keep the previous page's offset. Which
  // box that is depends on the shell, hence lib/scroller rather than mainRef.
  useEffect(() => {
    scrollToTop(mainRef.current)
  }, [route.name, route.id])

  const go = (path) => {
    // Only when the hash will actually change: assigning the same value pushes
    // nothing and fires nothing, and the flag would then be sitting armed for
    // whichever browser-driven navigation came next.
    if (window.location.hash !== '#/' + path) pushedByUs.current = true
    window.location.hash = '/' + path
  }

  // Is the entry under us one of ours to pop? `history.state` rides along with
  // its entry, so this stays right through browser back/forward — unlike
  // `history.length > 1`, which is what these call sites used to ask. That
  // number counts the whole tab's history, so following a link into the app and
  // pressing Back sent you back out of it, and every "deep link falls to the
  // index" fallback was dead code that never ran.
  const canPopOurs = () => !!window.history.state?.appNav
  const goBack = (fallback) => (canPopOurs() ? window.history.back() : go(fallback))
  const backTo = (fallback) => () => goBack(fallback)
  // Title-dropdown config for the People hub (people/groups/orgs/network).
  // Mobile only — desktop keeps these broken out in the sidebar.
  const hubNav = (active) =>
    isMobile ? { options: HUB_OPTIONS, active, onNavigate: go } : undefined
  // Tasks↔Projects switcher — mobile only, mirroring hubNav. Desktop reaches
  // Projects through its own sidebar item.
  const workNav = (active) =>
    isMobile ? { options: WORK_OPTIONS, active, onNavigate: go } : undefined

  // One entry to the template picker, used by every "New project" affordance
  // (Projects page, cross-create sheet, FAB) and the task form's Project toggle.
  // `seed` carries a title typed in the task form so it pre-fills the name.
  const openProjectPicker = (seed = '') => {
    setProjectSeedName(seed)
    setPickingProject(true)
  }

  // Stamp out a project from a template (+ the picker's review overrides), then
  // open it. addTask returns its client id synchronously, so children can carry
  // parent_id and scoped lists carry project_id in the same pass — no awaiting.
  const createProject = (template, opts) => {
    const { project, children, lists } = buildProjectRows(template, opts)
    const projectId = data.addTask(project)
    for (const child of children) data.addTask({ ...child, parent_id: projectId })
    for (const list of lists) data.saveList({ ...list, project_id: projectId })
    openProject(projectId)
  }

  // iOS-style edge-swipe back on detail pages (mobile only).
  useEdgeBack(mainRef, isMobile && DETAIL_ROUTES.includes(route.name), () => goBack('today'))

  useEffect(() => {
    // ROUTES, not KNOWN_ROUTES: #/kitchen-sink is real in dev and would
    // otherwise bounce straight to Today.
    if (!ROUTES.includes(route.name)) window.location.hash = '/'
  }, [route.name])

  // Window/tab title follows the page (history + tab switcher readability).
  useEffect(() => {
    const named =
      route.name === 'person'
        ? data.people.find((p) => p.id === route.id)?.name
        : route.name === 'org'
          ? data.orgs.find((o) => o.id === route.id)?.name
          : route.name === 'group'
            ? data.groups.find((g) => g.id === route.id)?.name
            : route.name === 'list'
              ? data.lists.find((l) => l.id === route.id)?.name
              : route.name === 'project' || route.name === 'task'
                ? data.tasks.find((t) => t.id === route.id)?.title
                : route.name === 'note'
                  ? data.notes.find((n) => n.id === route.id)?.title || 'Note'
                  : route.name === 'habit'
                    ? data.habits.find((h) => h.id === route.id)?.name
                    : {
                        activity: 'Activity',
                        tasks: 'Tasks',
                        projects: 'Projects',
                        lists: 'Lists',
                        notes: 'Notes',
                        people: 'People',
                        orgs: 'Organizations',
                        groups: 'Groups',
                        relationships: 'Relationships',
                        habits: 'Habits',
                        import: 'Import / Export',
                        settings: 'Settings',
                        privacy: 'Privacy Policy',
                        terms: 'Terms of Use',
                      }[route.name]
    document.title = named ? `${named} · DOOT` : 'DOOT'
  }, [route, data.people, data.orgs, data.groups, data.lists, data.tasks, data.habits, data.notes])
  const openPerson = (id) => go(`person/${id}`)
  const openOrg = (id) => go(`org/${id}`)
  const openGroup = (id) => go(`group/${id}`)
  const openList = (id) => go(`list/${id}`)
  const openNote = (id) => go(`note/${id}`)
  // New note: create the row (optimistic, returns its id) and open it straight
  // into the editor — Apple Notes-style, no intermediate form. `fields` lets the
  // notebook seed it (with the tag you're filtered to, so the note you just made
  // doesn't fall straight out of the list you're looking at).
  // area_id from the active lens, so a note written while scoped to Work is a
  // Work note without being asked. An explicit area in `fields` still wins —
  // a note created from inside a project inherits the project's.
  const createNote = (fields) =>
    openNote(data.addNote({ area_id: areaForNewItem(areaId), ...(fields || {}) }))
  const openProject = (id) => go(`project/${id}`)
  // A plain task's own page, opened from the ⤢ on its row in the Tasks list.
  // Distinct from openTask below, which is the "follow a link to this task"
  // entry other screens use.
  const openTaskPage = (id) => go(`task/${id}`)
  const openHabit = (id) => go(`habit/${id}`)
  // Open a linked task from an entity page: projects get the full ProjectDetail,
  // plain tasks open the editor sheet.
  const openTask = (t) => (isProject(t) ? openProject(t.id) : setEditingTask(t))
  // Follow an @-mention chip tapped inside a note body. Tasks resolve through
  // openTask so a task that has since become a project still lands on its page.
  // A mention of something deleted (or private to someone else) just falls
  // through to that page's own "not found" state.
  const openMention = ({ type, id }) => {
    if (type === 'person') return openPerson(id)
    if (type === 'organization') return openOrg(id)
    if (type === 'group') return openGroup(id)
    if (type === 'list') return openList(id)
    if (type === 'habit') return openHabit(id)
    if (type === 'project' || type === 'task') {
      const t = data.tasks.find((x) => x.id === id)
      if (t) openTask(t)
    }
  }
  const requestLogout = () => setConfirmLogout(true)

  // ⌘K / Ctrl+K toggles Quick Find; "/" opens it too; ⌘N jumps straight to a
  // new person. The last two never fire from inside a text field — ⌘N used to
  // yank you out of a half-written note and into the contact form.
  useEffect(() => {
    const onKey = (e) => {
      // ⌘K stays global on purpose: it has to close Quick Find from inside Quick
      // Find's own search box. Everything below it must not fire while typing.
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setQuickFind((v) => !v)
        return
      }
      if (isEditableTarget(e.target)) return
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        setQuickFind(false)
        setEditingPerson('new')
      } else if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setQuickFind(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Quick Find → where each result type lands. People/orgs/groups open their
  // detail page; a plain task carries its id in the hash so the Tasks page opens
  // with that row expanded.
  const pickQuickFind = (entry) => {
    setQuickFind(false)
    if (entry.type === 'person') openPerson(entry.id)
    else if (entry.type === 'project') openProject(entry.id)
    else if (entry.type === 'task')
      entry.parentId ? openProject(entry.parentId) : go(`tasks/${entry.id}`)
    else if (entry.type === 'list') openList(entry.id)
    else if (entry.type === 'note') openNote(entry.id)
    else if (entry.type === 'habit') openHabit(entry.id)
    else if (entry.type === 'org') openOrg(entry.id)
    else if (entry.type === 'group') openGroup(entry.id)
    else if (entry.type === 'nav') go(entry.route)
    else if (entry.type === 'action') {
      const open = {
        person: () => setEditingPerson('new'),
        task: () => setEditingTask('new'),
        // A note is created by opening one, not by filling in a form — same
        // path the notebook's own "New note" takes.
        note: () => createNote(),
        list: () => setEditingList('new'),
        habit: () => setPickingHabit(true),
        org: () => setEditingOrg('new'),
        group: () => setEditingGroup('new'),
        relationship: () => setRelationshipFrom('new'),
      }
      open[entry.action]?.()
    }
  }

  const allTags = [...new Set(data.people.flatMap((p) => p.tags || []))].sort()

  // Attention badge: overdue/today items for the signed-in member, mirrored on
  // the Today tab/sidebar item and the app icon (installed PWA, iOS 16.4+).
  const [prefs] = useNotificationPrefs(data.memberId)
  // Threaded into buildAttention so the badge re-evaluates buckets as the clock
  // moves (e.g. a task flipping today→overdue at midnight on a long-lived tab),
  // exactly like the Today view — otherwise the two surfaces silently diverge.
  const now = useNow()
  const badge = useMemo(
    () =>
      badgeCount(
        buildAttention(data, prefs, data.reminderSnoozes, data.memberId, now, {
          // Must match TodayView's options exactly, or the count on the tab
          // disagrees with the list it's counting.
          taskScope: appPrefs.todayScope,
          normalizeAssignee,
        }),
      ),
    // Granular deps on purpose: `data` is a fresh object every render, so
    // depending on it would recompute the badge constantly. These are the
    // fields buildAttention actually reads.
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
      data.memberId,
      appPrefs.todayScope,
      now,
    ],
  )
  // Foreground half of the badge. The background half lives in public/sw.js,
  // which applies the count carried by each push — this can only run with a page
  // open, so on its own the icon froze at whatever it read when you last closed
  // the app. Whichever ran last, opening the app puts the number right.
  //
  // The promise needs catching: iOS rejects setAppBadge outright until
  // notification permission is granted, and an unhandled rejection every time
  // the count changes is noise in the console for a badge that was never going
  // to appear.
  useEffect(() => {
    const applied = badge > 0 ? navigator.setAppBadge?.(badge) : navigator.clearAppBadge?.()
    applied?.catch?.(() => {})
  }, [badge])

  // An item only knows its list_id, and whether it counts depends on the
  // list's kind — so the badge needs the lists to hand.
  const listById = useMemo(() => new Map(data.lists.map((l) => [l.id, l])), [data.lists])

  // Quiet sidebar counts: open top-level tasks, outstanding list items.
  const navCounts = useMemo(
    () => ({
      tasks: data.tasks.filter(
        (t) => !t.parent_id && !t.completed_at && !t.is_heading && !t.is_project,
      ).length,
      projects: data.tasks.filter(
        (t) => t.is_project && !t.completed_at && t.project_status !== 'someday',
      ).length,
      // Not just "unchecked": headings aren't items, and a collection's rows
      // are never outstanding work — a 40-restaurant list would otherwise park
      // a permanent 40 here that nothing could ever clear.
      lists: data.listItems.filter((it) => isOpenItem(it, listById.get(it.list_id))).length,
      // Unacknowledged only. Derived dates (birthdays) are deliberately not
      // counted: they arrive on their own and can't be cleared, so they would
      // park a number here that nothing you did would ever move.
      reminders: data.reminders.filter((r) => !r.completed_at).length,
    }),
    [data.tasks, data.reminders, data.listItems, listById],
  )

  const activeNav =
    route.name === 'person'
      ? 'people'
      : route.name === 'org'
        ? 'orgs'
        : route.name === 'group'
          ? 'groups'
          : route.name === 'list'
            ? 'lists'
            : route.name === 'task'
              ? 'tasks'
              : route.name === 'project'
                ? 'projects'
                : route.name === 'note'
                  ? 'notes'
                  : route.name === 'habit'
                    ? 'habits'
                    : route.name === 'activity'
                      ? 'today'
                      : route.name

  // Who you are, for the avatar menu every top-level header renders. The photo
  // is the member's self contact card's (migration 0025 — "its photo is the
  // member's avatar"), which useHousehold already joins in; no linked contact,
  // or demo, falls back to the monogram Avatar draws from the name.
  const me = (household?.members || []).find((m) => m.id === meId)
  const account = {
    name: me?.name || memberName(meId) || 'You',
    avatarUrl: me?.avatar_url || null,
    onSettings: () => go('settings'),
    onImport: () => go('import'),
    onLogout: requestLogout,
  }

  // Where a "made or edited" row in the activity feed takes you: to the thing
  // itself. One router rather than five props threaded into both feeds.
  const openChange = (e) => {
    // A collapsed burst has no single thing to open, so it goes to the index.
    if (!e.id) {
      return go(
        { note: 'notes', list: 'lists', project: 'projects', reminder: 'reminders' }[e.entity] ||
          'tasks',
      )
    }
    if (e.entity === 'note') return openNote(e.id)
    if (e.entity === 'list') return openList(e.id)
    if (e.entity === 'project') return openProject(e.id)
    if (e.entity === 'reminder') return go('reminders')
    const t = data.tasks.find((x) => x.id === e.id)
    return t ? openTask(t) : go('tasks')
  }

  const adds = {
    go,
    onAddPerson: () => setEditingPerson('new'),
    onAddTask: () => setEditingTask('new'),
    onAddProject: () => openProjectPicker(),
    onAddNote: () => createNote(),
    onAddList: () => setEditingList('new'),
    onAddReminder: () => setEditingReminder('new'),
    onAddOrg: () => setEditingOrg('new'),
    onAddGroup: () => setEditingGroup('new'),
    onAddHabit: () => setPickingHabit(true),
    onAddRelationship: () => setRelationshipFrom('new'),
  }

  // The board takes the whole screen and none of the chrome — no sidebar, no
  // tab bar, no FAB, no pull-to-refresh. It's a display, not a destination, so
  // it returns above the layout rather than rendering inside it. Still inside
  // Shell because it reads the same `data` everything else does.
  if (route.name === 'board') {
    return <BoardView data={data} onExit={() => goBack('today')} />
  }

  return (
    // Every PageHeader reads the account menu out of here, so a top-level page
    // gets it by existing rather than by remembering to ask.
    <AccountProvider value={account}>
      <div className="layout">
        {!isMobile && (
          <Sidebar
            active={activeNav}
            go={go}
            onSearch={() => setQuickFind(true)}
            badge={badge}
            counts={navCounts}
            areaSwitcher={
              <AreaSwitcher
                variant="rail"
                areas={data.areas}
                userId={data.userId}
                value={areaId}
                onChange={setArea}
                counts={areaCountsByOpenTask}
                onManage={() => go('areas')}
              />
            }
          />
        )}
        <main className="main" ref={mainRef}>
          <PullToRefresh onRefresh={data.refresh}>
            <div className="content">
              {/* Both of these are app-level status, not page content, so they are
                charged once rather than re-paid at the top of all 15 routes.
                Together they used to eat 155px of a 660px phone screen (300 of
                667 on an SE, where the copy wrapped to three lines) — enough to
                push the first task on /tasks below the fold. */}
              {route.name === 'today' && <InstallHint />}
              {/* self-gates: Install button on Chrome/Edge, Add-to-Home-Screen on iOS */}
              {/* Mirror useData's demo condition exactly so the notice can never
              drift from the data: shown for runtime demo AND build-time demo,
              never for a real signed-in session. */}
              {(demoMode || session?.demo) && (
                <p className="demo-banner">
                  <strong>Demo</strong> Sample data, nothing is saved.
                </p>
              )}
              {data.error && <p className="error-text">{data.error}</p>}
              {/* The lens, on a phone. Charged once here rather than at the top
                  of seven routes — and it deliberately does NOT render on the
                  contacts pages or any detail screen, because the lens doesn't
                  scope those (AREA_SCOPED_ROUTES). Desktop gets the same control
                  in the sidebar instead. */}
              {isMobile && AREA_SCOPED_ROUTES.includes(route.name) && (
                <AreaSwitcher
                  variant="bar"
                  areas={data.areas}
                  userId={data.userId}
                  value={areaId}
                  onChange={setArea}
                  counts={areaCountsByOpenTask}
                  onManage={() => go('areas')}
                />
              )}
              {route.name === 'today' && (
                <TodayView
                  data={data}
                  taskScope={appPrefs.todayScope}
                  area={areaId}
                  household={household}
                  onOpenPerson={openPerson}
                  onOpenList={openList}
                  onOpenTasks={() => go('tasks')}
                  onOpenProject={openProject}
                  onOpenActivity={() => go('activity')}
                  onSearch={isMobile ? () => setQuickFind(true) : undefined}
                  onOpenHabits={() => go('habits')}
                  onOpenHabit={openHabit}
                  onOpenNotes={() => go('notes')}
                  onOpenReminders={() => go('reminders')}
                  onOpenChange={openChange}
                  onOpenNote={openNote}
                />
              )}
              {route.name === 'activity' && (
                <ActivityView
                  data={data}
                  onBack={() => go('today')}
                  onOpenPerson={openPerson}
                  onOpenList={openList}
                  onOpenTasks={() => go('tasks')}
                  onOpenHabit={openHabit}
                  onOpenChange={openChange}
                />
              )}
              {route.name === 'tasks' && (
                <TasksView
                  data={data}
                  expandId={route.id}
                  onAdd={() => setEditingTask('new')}
                  onEdit={(t) => setEditingTask(t)}
                  onOpenTask={openTaskPage}
                  onSearch={isMobile ? () => setQuickFind(true) : undefined}
                  hub={workNav('tasks')}
                  defaultFilter={appPrefs.taskFilter}
                  defaultShowCompleted={appPrefs.showCompleted}
                  defaultPrivacy={appPrefs.taskPrivacy}
                  // Read-only: the switcher in the shell sets it, so every
                  // scoped page narrows from one pick. Already resolved against
                  // a stale selection above.
                  area={areaId}
                />
              )}
              {route.name === 'task' && (
                <TaskDetail
                  data={data}
                  taskId={route.id}
                  // Reached from the Tasks list, Quick Find, or a bookmark, so
                  // back means where you came from. Deep-linked with no history
                  // → the Tasks list.
                  onBack={backTo('tasks')}
                  onEdit={(t) => setEditingTask(t)}
                  onOpenNote={openNote}
                />
              )}
              {route.name === 'reminders' && (
                <RemindersView
                  data={data}
                  onAdd={() => setEditingReminder('new')}
                  onEdit={(r) => setEditingReminder(r)}
                  onOpenPerson={openPerson}
                  onSearch={isMobile ? () => setQuickFind(true) : undefined}
                  hub={workNav('reminders')}
                  onNavigate={go}
                  area={areaId}
                />
              )}
              {route.name === 'projects' && (
                <ProjectsView
                  data={data}
                  onOpenProject={openProject}
                  onAdd={() => openProjectPicker()}
                  onSearch={isMobile ? () => setQuickFind(true) : undefined}
                  hub={workNav('projects')}
                  area={areaId}
                  sort={appPrefs.projectsSort}
                  onSort={(v) => setAppPrefs(meId, { projectsSort: v })}
                />
              )}
              {route.name === 'project' && (
                <ProjectDetail
                  data={data}
                  taskId={route.id}
                  onBack={backTo('projects')}
                  onEdit={(t) => setEditingTask(t)}
                  onOpenPerson={openPerson}
                  onOpenOrg={openOrg}
                  onOpenGroup={openGroup}
                  onOpenList={openList}
                  onOpenNote={openNote}
                  onAddNote={createNote}
                />
              )}
              {route.name === 'lists' && (
                <ListsView
                  data={data}
                  onOpenList={openList}
                  area={areaId}
                  onEditList={(l) => setEditingList(l)}
                  onAdd={() => setEditingList('new')}
                  onSearch={isMobile ? () => setQuickFind(true) : undefined}
                />
              )}
              {route.name === 'list' && (
                <ListDetail
                  data={data}
                  listId={route.id}
                  // Go back to wherever the list was opened from — the Lists tab,
                  // a project, Today, etc. history.back() pops the entry that
                  // pushed this route, so it can't loop (unlike re-pushing a fixed
                  // hash, which stacks duplicates that the OS back button then
                  // walks through). Deep-linked with no history → fall to Lists.
                  onBack={backTo('lists')}
                  onEdit={(l) => setEditingList(l)}
                  onOpenNote={openNote}
                  onOpenProject={openProject}
                />
              )}
              {/* One component owns both notes routes: on a wide screen the index
                and the open note sit side by side, so /notes and /note/<id> are
                the same screen with a different selection. NotesView renders
                NoteDetail itself (keyed by id) and falls back to the phone's
                push-navigation when there isn't room for two panes. Keeping it
                mounted across both routes also preserves the search box, sort,
                and tag filter when you open a note and come back. */}
              {(route.name === 'notes' || route.name === 'note') && (
                <NotesView
                  data={data}
                  noteId={route.name === 'note' ? route.id : null}
                  onOpenNote={openNote}
                  onAdd={createNote}
                  onOpenMention={openMention}
                  area={areaId}
                  sort={appPrefs.notesSort}
                  onSort={(v) => setAppPrefs(meId, { notesSort: v })}
                  onSearch={isMobile ? () => setQuickFind(true) : undefined}
                  onCloseNote={() => goBack('notes')}
                  onBack={backTo('today')}
                />
              )}
              {route.name === 'people' && (
                <SearchView
                  data={data}
                  searchRef={searchRef}
                  query={query}
                  setQuery={setQuery}
                  filters={peopleFilters}
                  setFilters={setPeopleFilters}
                  onOpen={openPerson}
                  onOpenOrg={openOrg}
                  onEdit={(p) => setEditingPerson(p)}
                  onAdd={() => setEditingPerson('new')}
                  memberId={meId}
                  hub={hubNav('people')}
                />
              )}
              {route.name === 'person' && (
                <PersonPage
                  data={data}
                  personId={route.id}
                  onOpenPerson={openPerson}
                  onOpenOrg={openOrg}
                  onOpenTask={openTask}
                  onOpenNote={openNote}
                  onBack={backTo('people')}
                  onEdit={(p) => setEditingPerson(p)}
                  onConnect={(p) => setRelationshipFrom(p)}
                  isDemo={isDemo}
                />
              )}
              {route.name === 'orgs' && (
                <OrgsView
                  data={data}
                  onOpen={openOrg}
                  onAdd={() => setEditingOrg('new')}
                  hub={hubNav('orgs')}
                />
              )}
              {route.name === 'org' && (
                <OrgPage
                  data={data}
                  orgId={route.id}
                  onOpenPerson={openPerson}
                  onOpenTask={openTask}
                  onOpenNote={openNote}
                  // Seeds the add-person form with this org, so an empty
                  // organization offers the thing that fills it.
                  onAddPerson={(o) => setEditingPerson({ organization_id: o.id })}
                  onBack={backTo('orgs')}
                  onEdit={(o) => setEditingOrg(o)}
                  isDemo={isDemo}
                />
              )}
              {route.name === 'groups' && (
                <GroupsView
                  data={data}
                  onOpen={openGroup}
                  onAdd={() => setEditingGroup('new')}
                  hub={hubNav('groups')}
                />
              )}
              {route.name === 'group' && (
                <GroupPage
                  data={data}
                  groupId={route.id}
                  onOpenPerson={openPerson}
                  onOpenTask={openTask}
                  onOpenNote={openNote}
                  onBack={backTo('groups')}
                  onEdit={(g) => setEditingGroup(g)}
                  isDemo={isDemo}
                />
              )}
              {route.name === 'relationships' && (
                <RelationshipsView
                  data={data}
                  onOpenPerson={openPerson}
                  onAdd={() => setRelationshipFrom('new')}
                  hub={hubNav('relationships')}
                />
              )}
              {route.name === 'habits' && (
                <HabitsView
                  data={data}
                  onAdd={(seed) => setEditingHabit(seed || 'new')}
                  onPickTemplate={() => setPickingHabit(true)}
                  onOpen={(id) => go(`habit/${id}`)}
                  onOpenInsights={() => go('habit-insights')}
                />
              )}
              {route.name === 'habit-insights' && (
                <HabitInsightsView
                  data={data}
                  onBack={() => go('habits')}
                  onOpenHabit={(id) => go(`habit/${id}`)}
                />
              )}
              {route.name === 'habit' && (
                <HabitDetail
                  data={data}
                  habitId={route.id}
                  // A habit is now reachable from Today, the activity feed and
                  // Quick Find, so "back" has to mean where you came from — a
                  // fixed hop to the Habits index would strand you somewhere you
                  // never were. Deep-linked with no history → Habits.
                  onBack={backTo('habits')}
                  onEdit={(h) => setEditingHabit(h)}
                  onOpenNote={openNote}
                />
              )}
              {route.name === 'import' && (
                <Suspense fallback={<EmptyState loading>Loading</EmptyState>}>
                  <ImportExport data={data} />
                </Suspense>
              )}
              {route.name === 'areas' && (
                <AreasView
                  data={data}
                  onAdd={() => setEditingArea('new')}
                  onEdit={(a) => setEditingArea(a)}
                  // Reached from Settings today, so that's where Back lands when
                  // there's no history to pop (a deep link, a cold launch).
                  onBack={backTo('settings')}
                />
              )}
              {route.name === 'settings' && (
                <SettingsView
                  go={go}
                  household={household}
                  isDemo={!!(demoMode || session?.demo)}
                  onLogout={requestLogout}
                  session={session}
                  onBack={isMobile ? backTo('today') : undefined}
                />
              )}
              {route.name === 'kitchen-sink' && KitchenSink && (
                <Suspense fallback={<p className="empty dots">Loading</p>}>
                  <KitchenSink />
                </Suspense>
              )}
              {(route.name === 'privacy' || route.name === 'terms') && (
                <LegalView doc={route.name} onBack={backTo('today')} />
              )}
            </div>
          </PullToRefresh>
        </main>

        <Toasts />

        {quickFind && (
          <QuickFind data={data} onPick={pickQuickFind} onClose={() => setQuickFind(false)} />
        )}

        {isMobile && (
          <MobileNav
            route={route.name}
            active={activeNav}
            adds={adds}
            badge={badge}
            counts={navCounts}
          />
        )}

        {confirmLogout && (
          <ConfirmDialog
            title="Log out?"
            message="You'll need to sign in again to get back to your household."
            confirmLabel="Log out"
            danger
            onConfirm={() => {
              setConfirmLogout(false)
              onLogout()
            }}
            onCancel={() => setConfirmLogout(false)}
          />
        )}

        {editingPerson && (
          <PersonForm
            // 'new' or a seed object (no id) both mean "add"; only a real row
            // with an id is an edit. See PersonForm's isNew.
            person={editingPerson === 'new' ? null : editingPerson}
            orgs={data.orgs}
            affiliations={data.affiliations}
            people={data.people}
            families={data.families}
            groups={data.groups}
            existingTags={allTags}
            onSave={data.savePerson}
            onSaveAffiliations={data.setPersonAffiliations}
            onCreateFamily={data.saveFamily}
            onCreateOrg={data.findOrCreateOrg}
            onClose={() => setEditingPerson(null)}
            onOpenPerson={openPerson}
            defaultPrivacy={appPrefs.personPrivacy}
            isDemo={isDemo}
          />
        )}
        {editingOrg && (
          <OrgForm
            org={editingOrg === 'new' ? null : editingOrg}
            orgs={data.orgs}
            onSave={data.saveOrg}
            onClose={() => setEditingOrg(null)}
            isDemo={isDemo}
            defaultPrivacy={appPrefs.personPrivacy}
          />
        )}
        {editingGroup && (
          <GroupForm
            group={editingGroup === 'new' ? null : editingGroup}
            people={data.people}
            existingTags={allTags}
            onSave={data.saveGroup}
            onClose={() => setEditingGroup(null)}
            isDemo={isDemo}
          />
        )}
        {editingHabit && (
          <HabitForm
            habit={editingHabit === 'new' ? null : editingHabit}
            onSave={(fields, id) => (id ? data.updateHabit(id, fields) : data.addHabit(fields))}
            onClose={() => setEditingHabit(null)}
          />
        )}
        {editingArea && (
          <AreaForm
            area={editingArea === 'new' ? null : editingArea}
            onSave={(fields) =>
              editingArea === 'new' ? data.addArea(fields) : data.updateArea(editingArea.id, fields)
            }
            onClose={() => setEditingArea(null)}
          />
        )}
        {pickingHabit && (
          <HabitTemplatePicker
            onPick={(seed) => {
              setPickingHabit(false)
              setEditingHabit(seed || 'new')
            }}
            onClose={() => setPickingHabit(false)}
          />
        )}
        {editingTask && (
          <TaskForm
            task={editingTask === 'new' ? null : editingTask}
            onSave={(fields, id) => (id ? data.updateTask(id, fields) : data.addTask(fields))}
            onClose={() => setEditingTask(null)}
            onMakeProject={(title) => {
              setEditingTask(null)
              openProjectPicker(title)
            }}
            notes={data.notes}
            // Close the sheet on the way out — leaving it stacked over the note
            // you just opened would put a form on top of what you went to read.
            onOpenNote={(id) => {
              setEditingTask(null)
              openNote(id)
            }}
            defaultPrivacy={appPrefs.taskPrivacy}
            // Real area rows now, not the distinct strings scraped off
            // tasks.area — so an area you just made is pickable before anything
            // has been filed into it.
            areas={visibleAreas(data.areas, data.userId)}
            tagSuggestions={taskTags(data.tasks)}
          />
        )}
        {pickingProject && (
          <ProjectTemplatePicker
            onCreate={createProject}
            onClose={() => {
              setPickingProject(false)
              setProjectSeedName('')
            }}
            defaultPrivacy={appPrefs.taskPrivacy}
            initialName={projectSeedName}
          />
        )}
        {editingList && (
          <ListForm
            list={editingList === 'new' ? null : editingList}
            onSave={data.saveList}
            onClose={() => setEditingList(null)}
            defaultPrivacy={appPrefs.listPrivacy}
            areas={visibleAreas(data.areas, data.userId)}
            defaultAreaId={areaForNewItem(areaId)}
          />
        )}
        {editingReminder && (
          <ReminderForm
            reminder={editingReminder === 'new' ? null : editingReminder}
            people={data.people.filter((p) => !p.deleted_at)}
            defaultPrivacy={appPrefs.taskPrivacy}
            onSave={(fields) => {
              if (editingReminder === 'new') data.addTask(fields)
              else data.updateTask(editingReminder.id, fields)
              setEditingReminder(null)
            }}
            onClose={() => setEditingReminder(null)}
            // "Save this on Ada instead?" — hand the whole thing to her contact,
            // where a date about a person can live exactly once. The person form
            // opens seeded, so the reminder is never written at all rather than
            // written and then migrated.
            onFileOnContact={({ person, kind }, form) => {
              setEditingReminder(null)
              setEditingPerson(
                kind === 'birthday' && form.due_date
                  ? { ...person, birthday: form.due_date }
                  : person,
              )
            }}
          />
        )}
        {relationshipFrom && (
          <RelationshipForm
            from={relationshipFrom === 'new' ? null : relationshipFrom}
            people={data.people.filter((p) => !p.deleted_at)}
            onSave={data.addRelationship}
            onClose={() => setRelationshipFrom(null)}
          />
        )}
      </div>
    </AccountProvider>
  )
}
