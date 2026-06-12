import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { supabase } from './lib/supabase'
import { demoMode } from './lib/demo'
import { buildAttention, badgeCount } from './lib/reminders'
import { useData } from './hooks/useData'
import { useHousehold } from './hooks/useHousehold'
import { useMediaQuery } from './hooks/useMediaQuery'
import { useNotificationPrefs } from './hooks/useNotificationPrefs'
import { useEdgeBack } from './hooks/useEdgeBack'
import InstallHint from './components/InstallHint'
import AuthScreen from './components/AuthScreen'
import Onboarding from './components/Onboarding'
import Sidebar from './components/Sidebar'
import MobileNav from './components/MobileNav'
import MoreSheet from './components/MoreSheet'
import ConfirmDialog from './components/ConfirmDialog'
import QuickFind from './components/QuickFind'
import TodayView from './components/TodayView'
import ActivityView from './components/ActivityView'
import PullToRefresh from './components/PullToRefresh'
import SearchView from './components/SearchView'
import TasksView from './components/TasksView'
import ListsView from './components/ListsView'
import ListDetail from './components/ListDetail'
import ProjectDetail from './components/ProjectDetail'
import PersonPage from './components/PersonPage'
import OrgsView from './components/OrgsView'
import GroupsView from './components/GroupsView'
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
import ListForm from './components/ListForm'
import OrgForm from './components/OrgForm'
import GroupForm from './components/GroupForm'
import RelationshipForm from './components/RelationshipForm'

// Hash routing: #/ (today), #/activity, #/people, #/person/<id>, #/tasks,
// #/project/<id>, #/lists, #/list/<id>, #/orgs, #/groups, #/relationships,
// #/import. Quick Find can append an id to list pages (#/tasks/<id>,
// #/orgs/<id>, #/groups/<id>) to land with that row expanded.
function parseHash() {
  const [name, id] = window.location.hash.replace(/^#\/?/, '').split('/')
  return { name: name || 'today', id }
}

export default function App() {
  // Runtime demo: the "Explore the demo" button works even when Supabase is
  // configured (build-time demoMode can't capture that). A demo session
  // bypasses auth + the household gate entirely.
  const [demo, setDemo] = useState(false)
  return (
    <ErrorBoundary>
      {demo ? (
        <Shell session={{ demo: true }} onLogout={() => setDemo(false)} />
      ) : (
        <AuthedApp onDemo={() => setDemo(true)} />
      )}
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
          <LegalView doc={route.name} onBack={() => { window.location.hash = '/' }} />
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
  if (recovering) return <AuthScreen recovery onRecovered={() => setRecovering(false)} onDemo={onDemo} />
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
  if (hh.status === 'none') {
    return <Onboarding session={session} onDone={hh.refresh} onLogout={onLogout} />
  }
  return <Shell session={session} onLogout={onLogout} household={hh} />
}

function Shell({ session, onLogout, household }) {
  const data = useData(session)
  const [route, setRoute] = useState(parseHash)
  const [query, setQuery] = useState('') // lifted so Back returns to the same results
  const [editingPerson, setEditingPerson] = useState(null) // null | 'new' | person
  const [editingOrg, setEditingOrg] = useState(null)
  const [editingGroup, setEditingGroup] = useState(null)
  const [editingTask, setEditingTask] = useState(null) // null | 'new' | task
  const [editingList, setEditingList] = useState(null) // null | 'new' | list
  const [relationshipFrom, setRelationshipFrom] = useState(null) // null | 'new' | person
  const [moreOpen, setMoreOpen] = useState(null) // null | 'global' | 'people'
  const [quickFind, setQuickFind] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const searchRef = useRef(null)
  const mainRef = useRef(null)
  const isMobile = useMediaQuery('(max-width: 720px)')

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

  // iOS-style edge-swipe back on detail pages (mobile only).
  const DETAIL_ROUTES = ['person', 'project', 'list', 'activity', 'settings', 'privacy', 'terms']
  useEdgeBack(mainRef, isMobile && DETAIL_ROUTES.includes(route.name), () => window.history.back())

  // Stale bookmarks / typo'd hashes land on Today, not a blank screen.
  const KNOWN_ROUTES = ['today', 'activity', 'tasks', 'project', 'lists', 'list', 'people', 'person', 'orgs', 'groups', 'relationships', 'import', 'settings', 'privacy', 'terms']
  useEffect(() => {
    if (!KNOWN_ROUTES.includes(route.name)) window.location.hash = '/'
  }, [route.name])

  // Window/tab title follows the page (history + tab switcher readability).
  useEffect(() => {
    const named =
      route.name === 'person'
        ? data.people.find((p) => p.id === route.id)?.name
        : route.name === 'list'
          ? data.lists.find((l) => l.id === route.id)?.name
          : route.name === 'project'
            ? data.tasks.find((t) => t.id === route.id)?.title
            : {
                activity: 'Activity', tasks: 'Tasks', lists: 'Lists', people: 'People',
                orgs: 'Organizations', groups: 'Groups', relationships: 'Relationships',
                import: 'Import / Export', settings: 'Settings',
                privacy: 'Privacy Policy', terms: 'Terms of Use',
              }[route.name]
    document.title = named ? `${named} — Salernidex` : 'Salernidex'
  }, [route, data.people, data.lists, data.tasks])
  const openPerson = (id) => go(`person/${id}`)
  const openList = (id) => go(`list/${id}`)
  const openProject = (id) => go(`project/${id}`)
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

  // Quick Find → where each result type lands. Orgs/groups/plain tasks carry
  // the id in the hash so the page opens with that row expanded.
  const pickQuickFind = (entry) => {
    setQuickFind(false)
    if (entry.type === 'person') openPerson(entry.id)
    else if (entry.type === 'project') openProject(entry.id)
    else if (entry.type === 'task') (entry.parentId ? openProject(entry.parentId) : go(`tasks/${entry.id}`))
    else if (entry.type === 'list') openList(entry.id)
    else if (entry.type === 'org') go(`orgs/${entry.id}`)
    else if (entry.type === 'group') go(`groups/${entry.id}`)
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
  const badge = useMemo(
    () => badgeCount(buildAttention(data, prefs, data.reminderSnoozes, data.memberId)),
    [data.people, data.tasks, data.interactions, data.keyDates, data.reminderSnoozes, prefs, data.memberId]
  )
  useEffect(() => {
    if (badge > 0) navigator.setAppBadge?.(badge)
    else navigator.clearAppBadge?.()
  }, [badge])

  // Quiet sidebar counts: open top-level tasks, unchecked list items.
  const navCounts = useMemo(
    () => ({
      tasks: data.tasks.filter((t) => !t.parent_id && !t.completed_at && !t.is_heading).length,
      lists: data.listItems.filter((it) => !it.checked_at).length,
    }),
    [data.tasks, data.listItems]
  )

  const activeNav =
    route.name === 'person' ? 'people' : route.name === 'list' ? 'lists' : route.name === 'project' ? 'tasks' : route.name === 'activity' ? 'today' : route.name

  const adds = {
    go,
    onAddPerson: () => setEditingPerson('new'),
    onAddTask: () => setEditingTask('new'),
    onAddList: () => setEditingList('new'),
    onAddOrg: () => setEditingOrg('new'),
    onAddGroup: () => setEditingGroup('new'),
    onAddRelationship: () => setRelationshipFrom('new'),
  }

  return (
    <div className="layout">
      {!isMobile && (
        <Sidebar active={activeNav} go={go} onSearch={() => setQuickFind(true)} onLogout={requestLogout} badge={badge} counts={navCounts} />
      )}
      <main className="main" ref={mainRef}>
        <PullToRefresh onRefresh={data.refresh}>
        <div className="content">
          {isMobile && <InstallHint />}
          {/* Mirror useData's demo condition exactly so the notice can never
              drift from the data: shown for runtime demo AND build-time demo,
              never for a real signed-in session. */}
          {(demoMode || session?.demo) && (
            <p className="demo-banner">
              Demo mode — sample data, nothing is saved. Create an account to start your own household.
            </p>
          )}
          {data.error && <p className="error-text">{data.error}</p>}
          {route.name === 'today' && (
            <TodayView data={data} onOpenPerson={openPerson} onOpenList={openList} onOpenTasks={() => go('tasks')} onOpenActivity={() => go('activity')} onMore={isMobile ? () => setMoreOpen('global') : undefined} onSettings={isMobile ? () => go('settings') : undefined} onSearch={isMobile ? () => setQuickFind(true) : undefined} />
          )}
          {route.name === 'activity' && (
            <ActivityView data={data} onBack={() => go('today')} onOpenPerson={openPerson} onOpenList={openList} onOpenTasks={() => go('tasks')} />
          )}
          {route.name === 'tasks' && (
            <TasksView data={data} expandId={route.id} onAdd={() => setEditingTask('new')} onEdit={(t) => setEditingTask(t)} onOpenProject={openProject} onSearch={isMobile ? () => setQuickFind(true) : undefined} />
          )}
          {route.name === 'project' && (
            <ProjectDetail data={data} taskId={route.id} onBack={() => window.history.back()} onEdit={(t) => setEditingTask(t)} onOpenPerson={openPerson} />
          )}
          {route.name === 'lists' && (
            <ListsView data={data} onOpenList={openList} onAdd={() => setEditingList('new')} onSearch={isMobile ? () => setQuickFind(true) : undefined} />
          )}
          {route.name === 'list' && (
            <ListDetail data={data} listId={route.id} onBack={() => go('lists')} onEdit={(l) => setEditingList(l)} />
          )}
          {route.name === 'people' && (
            <SearchView
              data={data}
              searchRef={searchRef}
              query={query}
              setQuery={setQuery}
              onOpen={openPerson}
              onEdit={(p) => setEditingPerson(p)}
              onAdd={() => setEditingPerson('new')}
              onMore={isMobile ? () => setMoreOpen('people') : undefined}
            />
          )}
          {route.name === 'person' && (
            <PersonPage
              data={data}
              personId={route.id}
              onOpenPerson={openPerson}
              onBack={() => window.history.back()}
              onEdit={(p) => setEditingPerson(p)}
              onConnect={(p) => setRelationshipFrom(p)}
            />
          )}
          {route.name === 'orgs' && (
            <OrgsView data={data} openId={route.id} onEdit={(o) => setEditingOrg(o)} onAdd={() => setEditingOrg('new')} />
          )}
          {route.name === 'groups' && (
            <GroupsView
              data={data}
              openId={route.id}
              onOpenPerson={openPerson}
              onAdd={() => setEditingGroup('new')}
              onEdit={(g) => setEditingGroup(g)}
            />
          )}
          {route.name === 'relationships' && (
            <RelationshipsView data={data} onOpenPerson={openPerson} onAdd={() => setRelationshipFrom('new')} />
          )}
          {route.name === 'import' && (
            <Suspense fallback={<p className="empty dots">Loading</p>}>
              <ImportExport data={data} />
            </Suspense>
          )}
          {route.name === 'settings' && <SettingsView go={go} household={household} isDemo={!!(demoMode || session?.demo)} />}
          {(route.name === 'privacy' || route.name === 'terms') && (
            <LegalView doc={route.name} onBack={() => (window.history.length > 1 ? window.history.back() : go('today'))} />
          )}
        </div>
        </PullToRefresh>
      </main>

      <Toasts />

      {quickFind && (
        <QuickFind data={data} onPick={pickQuickFind} onClose={() => setQuickFind(false)} />
      )}

      {isMobile && <MobileNav active={activeNav} adds={adds} badge={badge} />}
      {isMobile && moreOpen && (
        <MoreSheet
          go={go}
          onClose={() => setMoreOpen(null)}
          onLogout={moreOpen === 'global' ? requestLogout : undefined}
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
          existingTags={allTags}
          onSave={data.savePerson}
          onCreateFamily={data.saveFamily}
          onClose={() => setEditingPerson(null)}
          onOpenPerson={openPerson}
        />
      )}
      {editingOrg && (
        <OrgForm org={editingOrg === 'new' ? null : editingOrg} onSave={data.saveOrg} onClose={() => setEditingOrg(null)} />
      )}
      {editingGroup && (
        <GroupForm
          group={editingGroup === 'new' ? null : editingGroup}
          existingTags={allTags}
          onSave={data.saveGroup}
          onClose={() => setEditingGroup(null)}
        />
      )}
      {editingTask && (
        <TaskForm
          task={editingTask === 'new' ? null : editingTask}
          onSave={(fields, id) => (id ? data.updateTask(id, fields) : data.addTask(fields))}
          onClose={() => setEditingTask(null)}
        />
      )}
      {editingList && (
        <ListForm
          list={editingList === 'new' ? null : editingList}
          onSave={data.saveList}
          onClose={() => setEditingList(null)}
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
