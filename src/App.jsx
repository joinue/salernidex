import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { demoMode } from './lib/demo'
import { useData } from './hooks/useData'
import { useMediaQuery } from './hooks/useMediaQuery'
import Login from './components/Login'
import Sidebar from './components/Sidebar'
import MobileNav from './components/MobileNav'
import SearchView from './components/SearchView'
import PersonPage from './components/PersonPage'
import OrgsView from './components/OrgsView'
import GroupsView from './components/GroupsView'
import RelationshipsView from './components/RelationshipsView'
import ImportExport from './components/ImportExport'
import PersonForm from './components/PersonForm'
import OrgForm from './components/OrgForm'
import GroupForm from './components/GroupForm'
import RelationshipForm from './components/RelationshipForm'

// Hash routing: #/ (search), #/person/<id>, #/orgs, #/groups,
// #/relationships, #/import — back button and bookmarks work.
function parseHash() {
  const [name, id] = window.location.hash.replace(/^#\/?/, '').split('/')
  return { name: name || 'search', id }
}

export default function App() {
  if (demoMode) return <DemoFlow />
  return <AuthedApp />
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
  const [relationshipFrom, setRelationshipFrom] = useState(null) // null | 'new' | person
  const searchRef = useRef(null)
  const isMobile = useMediaQuery('(max-width: 720px)')

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (path) => {
    window.location.hash = '/' + path
  }
  const openPerson = (id) => go(`person/${id}`)

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 'k') {
        e.preventDefault()
        go('')
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

  const activeNav = route.name === 'person' ? 'search' : route.name

  return (
    <div className="layout">
      {!isMobile && (
        <Sidebar
          active={activeNav}
          go={go}
          onAddPerson={() => setEditingPerson('new')}
          onAddOrg={() => setEditingOrg('new')}
          onLogout={onLogout}
        />
      )}
      <main className="main">
        <div className="content">
          {demoMode && (
            <p className="demo-banner">
              Demo mode — sample data, nothing is saved. Connect Supabase (see README) to go live.
            </p>
          )}
          {data.error && <p className="error-text">{data.error}</p>}
          {route.name === 'search' && (
            <SearchView
              data={data}
              searchRef={searchRef}
              query={query}
              setQuery={setQuery}
              onOpen={openPerson}
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
          {route.name === 'orgs' && <OrgsView data={data} onEdit={(o) => setEditingOrg(o)} />}
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
          {route.name === 'import' && <ImportExport data={data} />}
        </div>
      </main>

      {isMobile && (
        <MobileNav
          active={activeNav}
          go={go}
          onAddPerson={() => setEditingPerson('new')}
          onAddOrg={() => setEditingOrg('new')}
          onAddGroup={() => setEditingGroup('new')}
          onAddRelationship={() => setRelationshipFrom('new')}
          onLogout={onLogout}
        />
      )}

      {editingPerson && (
        <PersonForm
          person={editingPerson === 'new' ? null : editingPerson}
          orgs={data.orgs}
          existingTags={allTags}
          onSave={data.savePerson}
          onClose={() => setEditingPerson(null)}
        />
      )}
      {editingOrg && (
        <OrgForm
          org={editingOrg === 'new' ? null : editingOrg}
          onSave={data.saveOrg}
          onClose={() => setEditingOrg(null)}
        />
      )}
      {editingGroup && (
        <GroupForm
          group={editingGroup === 'new' ? null : editingGroup}
          existingTags={allTags}
          onSave={data.saveGroup}
          onClose={() => setEditingGroup(null)}
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
