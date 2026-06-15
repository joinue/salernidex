import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getHousehold, setHousehold, newJoinCode } from '../lib/household'

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
//         'error' → couldn't load memberships (show a retry, not Onboarding);
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
      // A read error (network blip, transient RLS/500) is NOT "no membership" —
      // routing it to Onboarding would let an existing member accidentally
      // create a SECOND household.
      // Tier-1 offline: if we've been online before, the household cache is
      // already hydrated (real uuid id). Render the app from it instead of the
      // retry screen so the offline data snapshot (useData) has a gate to pass.
      // Only a genuine never-loaded state (no cache) falls through to the retry.
      const cached = getHousehold()
      if (cached?.id) {
        setLocalHousehold({ id: cached.id, name: cached.name, join_code: cached.join_code })
        setMembers(
          (cached.members || []).map((m) => ({
            id: m.id,
            name: m.name,
            user_id: null,
            role: null,
            person_id: m.person_id || null,
            avatar_url: m.avatar_url || null,
          })),
        )
        setMemberId(cached.current_member_id)
        setMemberships([]) // the household switcher needs the network; offline shows just the active one
        setStatus('ready')
        return
      }
      setStatus('error')
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
      supabase
        .from('households')
        .select('id, name, join_code')
        .eq('id', active.household_id)
        .single(),
      supabase
        .from('household_members')
        // Embed the linked self contact card so each member carries its photo
        // (one many-to-one FK: household_members.person_id → people).
        .select('id, user_id, display_name, role, person_id, self:people(avatar_url)')
        .eq('household_id', active.household_id)
        .order('joined_at'),
    ])
    const hh = hhRes.data
    const memberRows = (memRes.data || []).map((m) => ({
      id: m.id,
      name: m.display_name || 'Member',
      user_id: m.user_id,
      role: m.role,
      person_id: m.person_id || null,
      avatar_url: m.self?.avatar_url || null,
    }))

    setLocalHousehold(hh)
    setMembers(memberRows)
    setMemberId(active.id)

    // Hydrate the cache the rest of the app reads synchronously.
    setHousehold({
      id: hh.id,
      name: hh.name,
      join_code: hh.join_code,
      members: memberRows.map((m) => ({
        id: m.id,
        name: m.name,
        avatar_url: m.avatar_url,
        person_id: m.person_id,
      })),
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
    await supabase
      .from('households')
      .update({ name: name.trim() || 'Our Household' })
      .eq('id', hid)
    await load()
  }

  // Rename a member (yourself, or anyone if you're an owner — RLS enforces it).
  const renameMember = async (id, name) => {
    await supabase
      .from('household_members')
      .update({ display_name: name.trim() || 'Member' })
      .eq('id', id)
    await load()
  }

  // The current member's self contact card, if linked yet. New members get one
  // from the create/join RPCs; existing (pre-0025) members link lazily below.
  const personId = members.find((m) => m.id === memberId)?.person_id || null

  // Make sure I have a self contact card and return its id. New members already
  // have one (RPC-created); this only fires for existing members who predate the
  // link, the first time they add a photo.
  const ensureSelfPerson = async () => {
    if (personId) return personId
    if (!hid) return null
    const meRow = members.find((m) => m.id === memberId)
    const { data, error } = await supabase
      .from('people')
      .insert({ household_id: hid, name: meRow?.name || 'Me', privacy_level: 'shared' })
      .select('id')
      .single()
    if (error) throw error
    await supabase.from('household_members').update({ person_id: data.id }).eq('id', memberId)
    await load()
    return data.id
  }

  // Set my avatar = the photo on my self card (creating/linking the card first
  // if needed). `url` is an avatars Storage path from AvatarUpload.
  const setMyAvatar = async (url) => {
    const pid = await ensureSelfPerson()
    if (!pid) return
    await supabase.from('people').update({ avatar_url: url }).eq('id', pid)
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

  // Delete the whole household (the sole-member "start over"). The RPC cascades
  // the membership row + every data table, so nothing is orphaned behind RLS.
  // Then forget the active id and re-evaluate → onboarding (or another household
  // if you somehow still have one).
  const deleteHousehold = async () => {
    if (!hid) return
    const { error } = await supabase.rpc('delete_household', { hid })
    if (error) throw error
    localStorage.removeItem(ACTIVE_HOUSEHOLD_KEY)
    setStatus('loading')
    await load()
  }

  // Leave the active household. As the sole member, a bare membership delete
  // would orphan the household + its data, so delete it cleanly instead. With
  // co-members it's a plain leave — they keep everything and you can re-join.
  const leave = () => (members.length <= 1 ? deleteHousehold() : removeMember(memberId))

  return {
    status,
    household,
    members,
    memberships,
    householdId: household?.id || null,
    memberId,
    personId,
    ensureSelfPerson,
    setMyAvatar,
    refresh: load,
    switchHousehold,
    setName,
    renameMember,
    removeMember,
    regenerateCode,
    deleteHousehold,
    leave,
  }
}
