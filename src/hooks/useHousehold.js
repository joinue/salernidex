import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { setHousehold, newJoinCode } from '../lib/household'

// Which household is active on this device (one auth user can belong to several
// and switch between them). Onboarding + the Settings switcher write this.
export const ACTIVE_HOUSEHOLD_KEY = 'salernidex-active-household'

// Live household context. Loads the signed-in user's memberships, picks the
// active household, loads its members, and HYDRATES the synchronous
// lib/household cache (setHousehold) so every existing accessor
// — members(), currentMemberId(), assigneeLabel(), normalizeAssignee() —
// returns real household_members uuids without any call-site changes.
//
// status: 'loading' → checking; 'none' → no membership yet (show Onboarding);
//         'ready' → cache hydrated, safe to render the app.
export function useHousehold(session) {
  const [status, setStatus] = useState('loading')
  const [household, setLocalHousehold] = useState(null) // { id, name, join_code }
  const [members, setMembers] = useState([]) // [{ id, name, user_id, role }]
  const [memberships, setMemberships] = useState([]) // all of mine (for the switcher)
  const [memberId, setMemberId] = useState(null) // my household_members.id in the active household
  const userId = session?.user?.id

  const load = useCallback(async () => {
    if (!userId) return
    const { data: mineRaw, error } = await supabase
      .from('household_members')
      .select('id, household_id, display_name, role, households(name)')
      .eq('user_id', userId)
    const mine = mineRaw?.map((m) => ({ ...m, household_name: m.households?.name || 'Household' }))
    if (error) {
      // Can't tell membership state — surface as onboarding rather than trap
      // the user on a spinner; the RPCs will no-op gracefully if they retry.
      setStatus('none')
      return
    }
    if (!mine?.length) {
      setMemberships([])
      setStatus('none')
      return
    }
    setMemberships(mine)

    const saved = localStorage.getItem(ACTIVE_HOUSEHOLD_KEY)
    const active = mine.find((m) => m.household_id === saved) || mine[0]
    localStorage.setItem(ACTIVE_HOUSEHOLD_KEY, active.household_id)

    const [hhRes, memRes] = await Promise.all([
      supabase.from('households').select('id, name, join_code').eq('id', active.household_id).single(),
      supabase.from('household_members').select('id, user_id, display_name, role').eq('household_id', active.household_id).order('joined_at'),
    ])
    const hh = hhRes.data
    const memberRows = (memRes.data || []).map((m) => ({
      id: m.id,
      name: m.display_name || 'Member',
      user_id: m.user_id,
      role: m.role,
    }))

    setLocalHousehold(hh)
    setMembers(memberRows)
    setMemberId(active.id)

    // Hydrate the cache the rest of the app reads synchronously.
    setHousehold({
      id: hh.id,
      name: hh.name,
      join_code: hh.join_code,
      members: memberRows.map((m) => ({ id: m.id, name: m.name })),
      current_member_id: active.id,
    })
    setStatus('ready')
  }, [userId])

  useEffect(() => {
    if (!session || session.demo) return
    load()
    // Member renames / joins / leaves and household renames sync live.
    const channel = supabase
      .channel('household-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'household_members' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'households' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [session, load])

  const switchHousehold = (id) => {
    localStorage.setItem(ACTIVE_HOUSEHOLD_KEY, id)
    setStatus('loading')
    load()
  }

  // --- live mutations (DB-backed; the realtime subscription re-hydrates) ---
  const hid = household?.id

  const setName = async (name) => {
    if (!hid) return
    await supabase.from('households').update({ name: name.trim() || 'Our Household' }).eq('id', hid)
    await load()
  }

  // Rename a member (yourself, or anyone if you're an owner — RLS enforces it).
  const renameMember = async (id, name) => {
    await supabase.from('household_members').update({ display_name: name.trim() || 'Member' }).eq('id', id)
    await load()
  }

  // Remove a member (owner removes others; anyone can remove themselves = leave).
  const removeMember = async (id) => {
    await supabase.from('household_members').delete().eq('id', id)
    if (id === memberId) {
      // I left: forget the active household and re-evaluate (→ another
      // household, or onboarding if that was my last one).
      localStorage.removeItem(ACTIVE_HOUSEHOLD_KEY)
      setStatus('loading')
    }
    await load()
  }

  const regenerateCode = async () => {
    if (!hid) return null
    const code = newJoinCode()
    await supabase.from('households').update({ join_code: code }).eq('id', hid)
    await load()
    return code
  }

  const leave = () => removeMember(memberId)

  return {
    status,
    household,
    members,
    memberships,
    householdId: household?.id || null,
    memberId,
    refresh: load,
    switchHousehold,
    setName,
    renameMember,
    removeMember,
    regenerateCode,
    leave,
  }
}
