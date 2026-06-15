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
import { currentMemberId, clearHousehold } from './lib/household'
import { clearSnapshots } from './lib/offlineCache'
import { areaNames, taskTags, isProject } from './lib/tasks'
import { setAppPrefs } from './lib/appPrefs'
import { buildProjectRows } from './lib/projectTemplates'
import InstallHint from './components/InstallHint'
import AuthScreen from './components/AuthScreen'
import Onboarding from './components/Onboarding'
import Sidebar from './components/Sidebar'
import MobileNav from './components/MobileNav'
import ConfirmDialog from './components/ConfirmDialog'
import { ConfirmProvider } from './components/ConfirmProvider'
import QuickFind from './components/QuickFind'
import TodayView from './components/TodayView'
import ActivityView from './components/ActivityView'
import PullToRefresh from './components/PullToRefresh'
import SearchView from './components/SearchView'
import TasksView from './components/TasksView'
import ProjectsView from './components/ProjectsView'
import ListsView from './components/ListsView'
import ListDetail from './components/ListDetail'
import NotesView from './components/NotesView'
import NoteDetail from './components/NoteDetail'
import ProjectDetail from './components/ProjectDetail'
import PersonPage from './components/PersonPage'
import OrgsView from './components/OrgsView'
import OrgPage from './components/OrgPage'
import GroupsView from './components/GroupsView'
import GroupPage from './components/GroupPage'
import HabitsView from './components/HabitsView'
import HabitDetail from './components/HabitDetail'
import HabitInsightsView from './components/HabitInsightsView'
import HabitTemplatePicker from './components/HabitTemplatePicker'
import RelationshipsView from './components/RelationshipsView'
import SettingsView from './components/SettingsView'
import LegalView from './components/LegalView'
import ErrorBoundary from './components/ErrorBoundary'
import Toasts from './components/Toasts'

// Lazy: Import/Export carries the CSV parser — no reason to ship it on
// every app open when it's visited once a month.
const ImportExport = lazy(() => import('./components/ImportExport'))
import PersonForm from './components/PersonForm'
import TaskForm from './components/TaskForm'
import ProjectTemplatePicker from './components/ProjectTemplatePicker'
import ListForm from './components/ListForm'
import OrgForm from './components/OrgForm'
import GroupForm from './components/GroupForm'
import HabitForm from './components/HabitForm'
import RelationshipForm from './components/RelationshipForm'
import { EMPTY_PEOPLE_FILTERS } from './lib/search'

// Hash routing: #/ (today), #/activity, #/people, #/person/<id>, #/tasks,
// #/project/<id>, #/lists, #/list/<id>, #/orgs, #/org/<id>, #/groups,
// #/group/<id>, #/relationships, #/import. Quick Find can append an id to the
// Tasks page (#/tasks/<id>) to land with that row expanded.
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
// Stale bookmarks / typo'd hashes land on Today, not a blank screen.
const KNOWN_ROUTES = [
  'today',
  'activity',
  'tasks',
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

  // Land at the top of the page on navigation — the scroll container persists
  // across route changes, so without this you keep the previous page's offset.
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
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
              : route.name === 'project'
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
    document.title = named ? `${named} — Salernidex` : 'Salernidex'
  }, [route, data.people, data.orgs, data.groups, data.lists, data.tasks, data.habits, data.notes])
  const openPerson = (id) => go(`person/${id}`)
  const openOrg = (id) => go(`org/${id}`)
  const openGroup = (id) => go(`group/${id}`)
  const openList = (id) => go(`list/${id}`)
  const openNote = (id) => go(`note/${id}`)
  // New note: create the row (optimistic, returns its id) and open it straight
  // into the editor — Apple Notes-style, no intermediate form.
  const createNote = () => openNote(data.addNote({}))
  const openProject = (id) => go(`project/${id}`)
  // Open a linked task from an entity page: projects get the full ProjectDetail,
  // plain tasks open the editor sheet.
  const openTask = (t) => (isProject(t) ? openProject(t.id) : setEditingTask(t))
  const requestLogout = () => setConfirmLogout(true)

  // ⌘K / Ctrl+K toggles Quick Find; "/" opens it too (outside text fields);
  // ⌘N still jumps straight to a new person.
  useEffect(() => {
    const isEditable = (el) =>
      el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setQuickFind((v) => !v)
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        setQuickFind(false)
        setEditingPerson('new')
      } else if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditable(e.target)) {
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
    else if (entry.type === 'org') openOrg(entry.id)
    else if (entry.type === 'group') openGroup(entry.id)
    else if (entry.type === 'nav') go(entry.route)
    else if (entry.type === 'action') {
      const open = {
        person: () => setEditingPerson('new'),
        task: () => setEditingTask('new'),
        list: () => setEditingList('new'),
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
    () => badgeCount(buildAttention(data, prefs, data.reminderSnoozes, data.memberId, now)),
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
      prefs,
      data.memberId,
      now,
    ],
  )
  useEffect(() => {
    if (badge > 0) navigator.setAppBadge?.(badge)
    else navigator.clearAppBadge?.()
  }, [badge])

  // Quiet sidebar counts: open top-level tasks, unchecked list items.
  const navCounts = useMemo(
    () => ({
      tasks: data.tasks.filter(
        (t) => !t.parent_id && !t.completed_at && !t.is_heading && !t.is_project,
      ).length,
      projects: data.tasks.filter(
        (t) => t.is_project && !t.completed_at && t.project_status !== 'someday',
      ).length,
      lists: data.listItems.filter((it) => !it.checked_at).length,
    }),
    [data.tasks, data.listItems],
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
    onAddList: () => setEditingList('new'),
    onAddOrg: () => setEditingOrg('new'),
    onAddGroup: () => setEditingGroup('new'),
    onAddHabit: () => setPickingHabit(true),
    onAddRelationship: () => setRelationshipFrom('new'),
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
            <InstallHint />
            {/* self-gates: Install button on Chrome/Edge, Add-to-Home-Screen on iOS */}
            {/* Mirror useData's demo condition exactly so the notice can never
              drift from the data: shown for runtime demo AND build-time demo,
              never for a real signed-in session. */}
            {(demoMode || session?.demo) && (
              <p className="demo-banner">
                Demo mode — sample data, nothing is saved. Create an account to start your own
                household.
              </p>
            )}
            {data.error && <p className="error-text">{data.error}</p>}
            {route.name === 'today' && (
              <TodayView
                data={data}
                household={household}
                onOpenPerson={openPerson}
                onOpenList={openList}
                onOpenTasks={() => go('tasks')}
                onOpenProject={openProject}
                onOpenActivity={() => go('activity')}
                onSettings={isMobile ? () => go('settings') : undefined}
                onSearch={isMobile ? () => setQuickFind(true) : undefined}
                onOpenHabits={() => go('habits')}
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
              />
            )}
            {route.name === 'tasks' && (
              <TasksView
                data={data}
                expandId={route.id}
                onAdd={() => setEditingTask('new')}
                onEdit={(t) => setEditingTask(t)}
                onOpenProject={openProject}
                onSearch={isMobile ? () => setQuickFind(true) : undefined}
                hub={workNav('tasks')}
                defaultFilter={appPrefs.taskFilter}
                defaultShowCompleted={appPrefs.showCompleted}
                defaultPrivacy={appPrefs.taskPrivacy}
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
              />
            )}
            {route.name === 'notes' && (
              <NotesView
                data={data}
                onOpenNote={openNote}
                onAdd={createNote}
                onSearch={isMobile ? () => setQuickFind(true) : undefined}
                onBack={() => (window.history.length > 1 ? window.history.back() : go('today'))}
              />
            )}
            {route.name === 'note' && (
              // Keyed by id so switching notes remounts with fresh state + a
              // freshly seeded contentEditable (no cursor fights, no stale body).
              <NoteDetail
                key={route.id}
                data={data}
                noteId={route.id}
                onBack={() => (window.history.length > 1 ? window.history.back() : go('notes'))}
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
                onBack={() => go('habits')}
                onEdit={(h) => setEditingHabit(h)}
              />
            )}
            {route.name === 'import' && (
              <Suspense fallback={<p className="empty dots">Loading</p>}>
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
          hideFab={route.name === 'list'}
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
          person={editingPerson === 'new' ? null : editingPerson}
          orgs={data.orgs}
          people={data.people}
          families={data.families}
          groups={data.groups}
          existingTags={allTags}
          onSave={data.savePerson}
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
