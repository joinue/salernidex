import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { supabase } from './lib/supabase'
import { demoMode } from './lib/demo'
import { buildAttention, badgeCount } from './lib/reminders'
import { useData } from './hooks/useData'
import { useHousehold, ACTIVE_HOUSEHOLD_KEY } from './hooks/useHousehold'
import { useMediaQuery } from './hooks/useMediaQuery'
import { useNotificationPrefs } from './hooks/useNotificationPrefs'
import { useAppPrefs } from './hooks/useAppPrefs'
import { useNow } from './hooks/useNow'
import { useEdgeBack } from './hooks/useEdgeBack'
import { currentMemberId, clearHousehold, normalizeAssignee } from './lib/household'
import { clearSnapshots } from './lib/offlineCache'
import { areaNames, taskTags, isProject } from './lib/tasks'
import { isOpenItem } from './lib/listKinds'
import { setAppPrefs } from './lib/appPrefs'
import { buildProjectRows } from './lib/projectTemplates'
import { scrollToTop } from './lib/scroller'
import InstallHint from './components/shell/InstallHint'
import AuthScreen from './features/auth/AuthScreen'
import Onboarding from './features/auth/Onboarding'
import Sidebar from './components/shell/Sidebar'
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
import RelationshipForm from './features/people/RelationshipForm'
import { EMPTY_PEOPLE_FILTERS } from './lib/search'
import { isEditableTarget } from './lib/keys'
import EmptyState from './components/ui/EmptyState'

// Hash routing: #/ (today), #/activity, #/people, #/person/<id>, #/tasks,
// #/task/<id>, #/project/<id>, #/lists, #/list/<id>, #/orgs, #/org/<id>,
// #/groups, #/group/<id>, #/relationships, #/import. Quick Find can append an
// id to the Tasks page (#/tasks/<id>) to land with that row expanded; #/task/
// <id> is the singular — that one task on a page of its own.
function parseHash() {
  const [name, id] = window.location.hash.replace(/^#\/?/, '').split('/')
  return { name: name || 'today', id }
}

// Detail pages get iOS-style edge-swipe back (mobile). Module-scoped so the
// array identity is stable across renders.
const DETAIL_ROUTES = [
  'person',
  'org',
  'group',
  'task',
  'project',
  'list',
  'note',
  'habit',
  'habit-insights',
  'activity',
  'settings',
  'privacy',
  'terms',
]
// Screens where a floating ➕ would be noise: either they have their own docked
// composer (List detail), or "add" means nothing here (Settings, Activity,
// Import, the legal pages). A quick-capture button that creates something
// unrelated to what you're looking at isn't a shortcut, it's a trap.
const NO_FAB_ROUTES = ['list', 'note', 'settings', 'activity', 'import', 'privacy', 'terms']
// Screens that hide the bottom bar as well. An open note is a full-screen
// composer, not a destination you browse from: the ➕ there would create a
// person or a task on top of the sentence you're writing, and five tab
// destinations sit under your thumb for the whole time you're typing. Back is
// the way out, the way it is in Notes itself. (The pair already stood down
// while the keyboard was up — this is the other 50% of the time.)
const NO_TABBAR_ROUTES = ['note']
// Stale bookmarks / typo'd hashes land on Today, not a blank screen.
const KNOWN_ROUTES = [
  'today',
  'board',
  'activity',
  'tasks',
  'task',
  'projects',
  'project',
  'lists',
  'list',
  'notes',
  'note',
  'people',
  'person',
  'orgs',
  'org',
  'groups',
  'group',
  'relationships',
  'habits',
  'habit',
  'habit-insights',
  'import',
  'settings',
  'privacy',
  'terms',
  ...(import.meta.env.DEV ? ['kitchen-sink'] : []),
]

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
  const [query, setQuery] = useState('') // lifted so Back returns to the same results
  // People-page filters, lifted for the same reason: leaving and coming back
  // keeps the applied filter (resets on full reload, like the search query).
  const [peopleFilters, setPeopleFilters] = useState(EMPTY_PEOPLE_FILTERS)
  const [editingPerson, setEditingPerson] = useState(null) // null | 'new' | person
  const [editingOrg, setEditingOrg] = useState(null)
  const [editingGroup, setEditingGroup] = useState(null)
  const [editingHabit, setEditingHabit] = useState(null)
  const [pickingHabit, setPickingHabit] = useState(false) // template "start from" sheet
  const [editingTask, setEditingTask] = useState(null) // null | 'new' | task
  const [pickingProject, setPickingProject] = useState(false) // template "new project" sheet
  const [projectSeedName, setProjectSeedName] = useState('') // title carried from the task form
  const [editingList, setEditingList] = useState(null) // null | 'new' | list
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

  useEffect(() => {
    // Route changes cross-fade via the View Transitions API where available
    // (flushSync so the new view is painted inside the transition frame).
    // Reduced-motion users and other browsers get the plain instant swap.
    const onHash = () => {
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
    window.location.hash = '/' + path
  }
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
  useEdgeBack(mainRef, isMobile && DETAIL_ROUTES.includes(route.name), () => window.history.back())

  useEffect(() => {
    if (!KNOWN_ROUTES.includes(route.name)) window.location.hash = '/'
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
    document.title = named ? `${named} — DOOT` : 'DOOT'
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
  const createNote = (fields) => openNote(data.addNote(fields || {}))
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
    }),
    [data.tasks, data.listItems, listById],
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

  const adds = {
    go,
    onAddPerson: () => setEditingPerson('new'),
    onAddTask: () => setEditingTask('new'),
    onAddProject: () => openProjectPicker(),
    onAddNote: () => createNote(),
    onAddList: () => setEditingList('new'),
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
    return (
      <BoardView
        data={data}
        onExit={() => (window.history.length > 1 ? window.history.back() : go('today'))}
      />
    )
  }

  return (
    <div className="layout">
      {!isMobile && (
        <Sidebar
          active={activeNav}
          go={go}
          onSearch={() => setQuickFind(true)}
          onLogout={requestLogout}
          badge={badge}
          counts={navCounts}
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
            {route.name === 'today' && (
              <TodayView
                data={data}
                taskScope={appPrefs.todayScope}
                household={household}
                onOpenPerson={openPerson}
                onOpenList={openList}
                onOpenTasks={() => go('tasks')}
                onOpenProject={openProject}
                onOpenActivity={() => go('activity')}
                onSettings={isMobile ? () => go('settings') : undefined}
                onSearch={isMobile ? () => setQuickFind(true) : undefined}
                onOpenHabits={() => go('habits')}
                onOpenHabit={openHabit}
                onOpenNotes={() => go('notes')}
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
              />
            )}
            {route.name === 'task' && (
              <TaskDetail
                data={data}
                taskId={route.id}
                // Reached from the Tasks list, Quick Find, or a bookmark, so
                // back means where you came from. Deep-linked with no history
                // → the Tasks list.
                onBack={() => (window.history.length > 1 ? window.history.back() : go('tasks'))}
                onEdit={(t) => setEditingTask(t)}
                onOpenNote={openNote}
              />
            )}
            {route.name === 'projects' && (
              <ProjectsView
                data={data}
                onOpenProject={openProject}
                onAdd={() => openProjectPicker()}
                onSearch={isMobile ? () => setQuickFind(true) : undefined}
                hub={workNav('projects')}
                sort={appPrefs.projectsSort}
                onSort={(v) => setAppPrefs(meId, { projectsSort: v })}
              />
            )}
            {route.name === 'project' && (
              <ProjectDetail
                data={data}
                taskId={route.id}
                onBack={() => window.history.back()}
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
                onBack={() => (window.history.length > 1 ? window.history.back() : go('lists'))}
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
                sort={appPrefs.notesSort}
                onSort={(v) => setAppPrefs(meId, { notesSort: v })}
                onSearch={isMobile ? () => setQuickFind(true) : undefined}
                onCloseNote={() =>
                  window.history.length > 1 ? window.history.back() : go('notes')
                }
                onBack={() => (window.history.length > 1 ? window.history.back() : go('today'))}
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
                onBack={() => window.history.back()}
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
                onBack={() => window.history.back()}
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
                onBack={() => window.history.back()}
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
                onBack={() => (window.history.length > 1 ? window.history.back() : go('habits'))}
                onEdit={(h) => setEditingHabit(h)}
                onOpenNote={openNote}
              />
            )}
            {route.name === 'import' && (
              <Suspense fallback={<EmptyState loading>Loading</EmptyState>}>
                <ImportExport data={data} />
              </Suspense>
            )}
            {route.name === 'settings' && (
              <SettingsView
                go={go}
                household={household}
                isDemo={!!(demoMode || session?.demo)}
                onLogout={requestLogout}
                session={session}
                onBack={
                  isMobile
                    ? () => (window.history.length > 1 ? window.history.back() : go('today'))
                    : undefined
                }
              />
            )}
            {route.name === 'kitchen-sink' && KitchenSink && (
              <Suspense fallback={<p className="empty dots">Loading</p>}>
                <KitchenSink />
              </Suspense>
            )}
            {(route.name === 'privacy' || route.name === 'terms') && (
              <LegalView
                doc={route.name}
                onBack={() => (window.history.length > 1 ? window.history.back() : go('today'))}
              />
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
          active={activeNav}
          adds={adds}
          badge={badge}
          scrollRef={mainRef}
          hideFab={NO_FAB_ROUTES.includes(route.name)}
          hideTabs={NO_TABBAR_ROUTES.includes(route.name)}
          forceMenu={DETAIL_ROUTES.includes(route.name) && route.name !== 'list'}
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
          areas={areaNames(data.tasks)}
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
  )
}
