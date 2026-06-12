import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { demoMode } from './lib/demo'
import { buildAttention, badgeCount } from './lib/reminders'
import { useData } from './hooks/useData'
import { useMediaQuery } from './hooks/useMediaQuery'
import { useNotificationPrefs } from './hooks/useNotificationPrefs'
import { useEdgeBack } from './hooks/useEdgeBack'
import InstallHint from './components/InstallHint'
import Login from './components/Login'
import Sidebar from './components/Sidebar'
import MobileNav from './components/MobileNav'
import MoreSheet from './components/MoreSheet'
import ConfirmDialog from './components/ConfirmDialog'
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
import ErrorBoundary from './components/ErrorBoundary'

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
// #/import.
function parseHash() {
  const [name, id] = window.location.hash.replace(/^#\/?/, '').split('/')
  return { name: name || 'today', id }
}

export default function App() {
  return (
    <ErrorBoundary>
      {demoMode ? <DemoFlow /> : <AuthedApp />}
    </ErrorBoundary>
  )
}

// Demo: no Supabase, any credentials sign in, data lives in memory.
function DemoFlow() {
  const [signedIn, setSignedIn] = useState(false)
  if (!signedIn) return <Login demo onDemo={() => setSignedIn(true)} />
  return <Shell session={{ demo: true }} onLogout={() => setSignedIn(false)} />
}

function AuthedApp() {
  const [session, setSession] = useState(undefined) // undefined = checking

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="login-wrap">
        <span className="muted dots">Loading</span>
      </div>
    )
  }
  if (!session) return <Login />
  return <Shell session={session} onLogout={() => supabase.auth.signOut()} />
}

function Shell({ session, onLogout }) {
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
  const [confirmLogout, setConfirmLogout] = useState(false)
  const searchRef = useRef(null)
  const mainRef = useRef(null)
  const isMobile = useMediaQuery('(max-width: 720px)')

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
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
  const DETAIL_ROUTES = ['person', 'project', 'list', 'activity', 'settings']
  useEdgeBack(mainRef, isMobile && DETAIL_ROUTES.includes(route.name), () => window.history.back())

  // Stale bookmarks / typo'd hashes land on Today, not a blank screen.
  const KNOWN_ROUTES = ['today', 'activity', 'tasks', 'project', 'lists', 'list', 'people', 'person', 'orgs', 'groups', 'relationships', 'import', 'settings']
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
              }[route.name]
    document.title = named ? `${named} — Salernidex` : 'Salernidex'
  }, [route, data.people, data.lists, data.tasks])
  const openPerson = (id) => go(`person/${id}`)
  const openList = (id) => go(`list/${id}`)
  const openProject = (id) => go(`project/${id}`)
  const requestLogout = () => setConfirmLogout(true)

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 'k') {
        e.preventDefault()
        go('people')
        setTimeout(() => searchRef.current?.focus(), 50)
      } else if (e.key === 'n') {
        e.preventDefault()
        setEditingPerson('new')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const allTags = [...new Set(data.people.flatMap((p) => p.tags || []))].sort()

  // Attention badge: overdue/today items for the signed-in member, mirrored on
  // the Today tab/sidebar item and the app icon (installed PWA, iOS 16.4+).
  const [prefs] = useNotificationPrefs(data.ownerId)
  const badge = useMemo(
    () => badgeCount(buildAttention(data, prefs, data.reminderSnoozes, data.ownerId)),
    [data.people, data.tasks, data.interactions, data.keyDates, data.reminderSnoozes, prefs, data.ownerId]
  )
  useEffect(() => {
    if (badge > 0) navigator.setAppBadge?.(badge)
    else navigator.clearAppBadge?.()
  }, [badge])

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
        <Sidebar active={activeNav} go={go} onLogout={requestLogout} badge={badge} />
      )}
      <main className="main" ref={mainRef}>
        <PullToRefresh onRefresh={data.refresh}>
        <div className="content">
          {isMobile && <InstallHint />}
          {demoMode && (
            <p className="demo-banner">
              Demo mode — sample data, nothing is saved. Connect Supabase (see README) to go live.
            </p>
          )}
          {data.error && <p className="error-text">{data.error}</p>}
          {route.name === 'today' && (
            <TodayView data={data} onOpenPerson={openPerson} onOpenList={openList} onOpenTasks={() => go('tasks')} onOpenActivity={() => go('activity')} onMore={isMobile ? () => setMoreOpen('global') : undefined} onSettings={isMobile ? () => go('settings') : undefined} />
          )}
          {route.name === 'activity' && (
            <ActivityView data={data} onBack={() => go('today')} onOpenPerson={openPerson} onOpenList={openList} onOpenTasks={() => go('tasks')} />
          )}
          {route.name === 'tasks' && (
            <TasksView data={data} onAdd={() => setEditingTask('new')} onEdit={(t) => setEditingTask(t)} onOpenProject={openProject} />
          )}
          {route.name === 'project' && (
            <ProjectDetail data={data} taskId={route.id} onBack={() => window.history.back()} onEdit={(t) => setEditingTask(t)} onOpenPerson={openPerson} />
          )}
          {route.name === 'lists' && (
            <ListsView data={data} onOpenList={openList} onAdd={() => setEditingList('new')} />
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
            <OrgsView data={data} onEdit={(o) => setEditingOrg(o)} onAdd={() => setEditingOrg('new')} />
          )}
          {route.name === 'groups' && (
            <GroupsView
              data={data}
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
          {route.name === 'settings' && <SettingsView go={go} />}
        </div>
        </PullToRefresh>
      </main>

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
