import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { demoMode, demoPeople, demoOrgs, demoRelationships, demoGroups } from '../lib/demo'

const uuid = () => crypto.randomUUID()
const now = () => new Date().toISOString()

// Loads people, organizations, and relationships; keeps them fresh via
// Supabase realtime; exposes CRUD helpers used throughout the app.
// In demo mode everything lives in memory and nothing persists.
export function useData(session) {
  const [people, setPeople] = useState(demoMode ? demoPeople : [])
  const [orgs, setOrgs] = useState(demoMode ? demoOrgs : [])
  const [relationships, setRelationships] = useState(demoMode ? demoRelationships : [])
  const [groups, setGroups] = useState(demoMode ? demoGroups : [])
  const [loading, setLoading] = useState(!demoMode)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (demoMode) return
    const [p, o, r, g] = await Promise.all([
      supabase.from('people').select('*').order('name'),
      supabase.from('organizations').select('*').order('name'),
      supabase.from('relationships').select('*'),
      supabase.from('groups').select('*').order('name'),
    ])
    const firstError = p.error || o.error || r.error || g.error
    if (firstError) {
      setError(firstError.message)
    } else {
      setError(null)
      setPeople(p.data)
      setOrgs(o.data)
      setRelationships(r.data)
      setGroups(g.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!session || demoMode) return
    refresh()
    const channel = supabase
      .channel('salernidex-sync')
      .on('postgres_changes', { event: '*', schema: 'public' }, refresh)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [session, refresh])

  const savePerson = async (fields, id) => {
    if (demoMode) {
      setPeople((prev) =>
        id
          ? prev.map((p) => (p.id === id ? { ...p, ...fields, updated_at: now() } : p))
          : [...prev, { deleted_at: null, created_at: now(), updated_at: now(), ...fields, id: uuid() }]
      )
      return
    }
    const query = id
      ? supabase.from('people').update(fields).eq('id', id)
      : supabase.from('people').insert(fields)
    const { error } = await query
    if (error) throw error
    await refresh()
  }

  const deletePerson = async (id) => {
    if (demoMode) {
      setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, deleted_at: now() } : p)))
      return
    }
    const { error } = await supabase
      .from('people')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    await refresh()
  }

  const restorePerson = async (id) => {
    if (demoMode) {
      setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, deleted_at: null } : p)))
      return
    }
    const { error } = await supabase
      .from('people')
      .update({ deleted_at: null })
      .eq('id', id)
    if (error) throw error
    await refresh()
  }

  const saveOrg = async (fields, id) => {
    if (demoMode) {
      setOrgs((prev) =>
        id
          ? prev.map((o) => (o.id === id ? { ...o, ...fields, updated_at: now() } : o))
          : [...prev, { created_at: now(), updated_at: now(), key_contacts: [], ...fields, id: uuid() }]
      )
      return
    }
    const query = id
      ? supabase.from('organizations').update(fields).eq('id', id)
      : supabase.from('organizations').insert(fields)
    const { error } = await query
    if (error) throw error
    await refresh()
  }

  const deleteOrg = async (id) => {
    if (demoMode) {
      setOrgs((prev) => prev.filter((o) => o.id !== id))
      return
    }
    const { error } = await supabase.from('organizations').delete().eq('id', id)
    if (error) throw error
    await refresh()
  }

  const addRelationship = async (fields) => {
    if (demoMode) {
      setRelationships((prev) => [...prev, { ...fields, id: uuid(), created_at: now() }])
      return
    }
    const { error } = await supabase.from('relationships').insert(fields)
    if (error) throw error
    await refresh()
  }

  const deleteRelationship = async (id) => {
    if (demoMode) {
      setRelationships((prev) => prev.filter((r) => r.id !== id))
      return
    }
    const { error } = await supabase.from('relationships').delete().eq('id', id)
    if (error) throw error
    await refresh()
  }

  const saveGroup = async (fields, id) => {
    if (demoMode) {
      setGroups((prev) =>
        id
          ? prev.map((g) => (g.id === id ? { ...g, ...fields, updated_at: now() } : g))
          : [...prev, { created_at: now(), updated_at: now(), ...fields, id: uuid() }]
      )
      return
    }
    const query = id
      ? supabase.from('groups').update(fields).eq('id', id)
      : supabase.from('groups').insert(fields)
    const { error } = await query
    if (error) throw error
    await refresh()
  }

  const deleteGroup = async (id) => {
    if (demoMode) {
      setGroups((prev) => prev.filter((g) => g.id !== id))
      return
    }
    const { error } = await supabase.from('groups').delete().eq('id', id)
    if (error) throw error
    await refresh()
  }

  const importPeople = async (rows) => {
    if (demoMode) {
      setPeople((prev) => [
        ...prev,
        ...rows.map((r) => ({ deleted_at: null, created_at: now(), updated_at: now(), privacy_level: 'shared', ...r, id: uuid() })),
      ])
      return
    }
    const { error } = await supabase.from('people').insert(rows)
    if (error) throw error
    await refresh()
  }

  return {
    people,
    orgs,
    relationships,
    groups,
    loading,
    error,
    refresh,
    savePerson,
    deletePerson,
    restorePerson,
    saveOrg,
    deleteOrg,
    addRelationship,
    deleteRelationship,
    saveGroup,
    deleteGroup,
    importPeople,
  }
}
