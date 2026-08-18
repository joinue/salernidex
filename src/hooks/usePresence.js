import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { currentMemberId, members as householdMembers, memberName } from '../lib/household'
import {
  PRESENCE_BEAT_MS,
  SHOPPING,
  applySignal,
  clearMember,
  shoppingSignal,
} from '../lib/presence'

// The carrier for errand co-presence: a second Realtime channel, `household:<id>`,
// carrying `broadcast` only and never touching the database.
//
// It must not ride the postgres_changes path in useData, and that is the single
// most important thing about this file. That channel answers every event with a
// debounced table refetch — which is right for durable rows and catastrophic for
// something chatty. A heartbeat every twenty seconds per shopper would turn into
// a table refetch every twenty seconds on every other member's phone, and the
// feature would be its own performance bug. Nothing here writes a row, so
// nothing here can trigger one.
//
// Rides the existing websocket: `connect-src ... wss://*.supabase.co` is already
// in public/_headers, so there is no CSP or infrastructure change.
export function usePresence(householdId, { demo = false } = {}) {
  const [state, setState] = useState({})
  const channelRef = useRef(null)
  // What we are currently announcing, so the heartbeat can resend it without
  // the caller having to beat it themselves.
  const beatRef = useRef(null)
  const meId = currentMemberId()

  const send = useCallback((event, payload) => {
    const ch = channelRef.current
    if (!ch) return
    ch.send({ type: 'broadcast', event, payload })
  }, [])

  // ---- the channel ------------------------------------------------------
  useEffect(() => {
    if (demo || !householdId || !supabase) return
    const channel = supabase.channel(`household:${householdId}`, {
      config: { broadcast: { self: false } },
    })
    channel
      .on('broadcast', { event: SHOPPING }, ({ payload }) => {
        setState((prev) => applySignal(prev, payload))
      })
      .on('broadcast', { event: 'left' }, ({ payload }) => {
        setState((prev) => clearMember(prev, payload?.memberId))
      })
      .subscribe()
    channelRef.current = channel
    return () => {
      // Say so on the way out rather than letting the TTL do it — leaving the
      // page is the one moment we can be certain, and forty-five seconds of a
      // stale banner is forty-five seconds of somebody standing in an aisle
      // thinking their partner is already there.
      if (beatRef.current)
        channel.send({ type: 'broadcast', event: 'left', payload: { memberId: meId } })
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [demo, householdId, meId])

  // ---- the heartbeat ----------------------------------------------------
  // Ephemeral state has to be re-asserted or it decays, which is the property
  // that makes "gone" work without a reliable goodbye.
  useEffect(() => {
    if (demo || !householdId) return
    const t = setInterval(() => {
      const beat = beatRef.current
      if (!beat) return
      send(SHOPPING, { ...beat, at: Date.now() })
    }, PRESENCE_BEAT_MS)
    return () => clearInterval(t)
  }, [demo, householdId, send])

  // ---- demo -------------------------------------------------------------
  // CONVENTIONS.md requires every feature to be visible in demo mode, because
  // that is how the app gets reviewed — and a realtime feature is invisible
  // there by construction, since demo has no socket and only one person.
  //
  // So in demo a housemate joins whichever list you start working — check one
  // item off and they turn up on it, with their own progress, and they leave
  // when you do. Openly fake, like every other row in demo mode, and it drives
  // the real reducer and the real TTL rather than a parallel code path that
  // could drift from them.
  const [demoListId, setDemoListId] = useState(null)
  useEffect(() => {
    if (!demo || !demoListId) return
    const other = householdMembers().find((m) => m.id !== meId)
    if (!other) return
    const beat = () =>
      setState((prev) =>
        applySignal(prev, {
          kind: SHOPPING,
          memberId: other.id,
          name: other.name,
          listId: demoListId,
          done: 2,
          total: 7,
          at: Date.now(),
        }),
      )
    beat()
    const t = setInterval(beat, PRESENCE_BEAT_MS)
    return () => clearInterval(t)
  }, [demo, demoListId, meId])

  // ---- what a view calls ------------------------------------------------

  // "I am working this list." Called on a check-off, never on arrival — the
  // difference between errand co-presence and the viewer presence §5 declines.
  const announceShopping = useCallback(
    (list, { done, total }) => {
      const signal = shoppingSignal({
        list,
        memberId: meId,
        name: memberName(meId),
        done,
        total,
        at: Date.now(),
      })
      // Null means the privacy gate said no (a private list must not announce
      // itself) or there is no member to attribute it to. Either way we stop
      // beating, so a list that turns private mid-shop goes quiet.
      if (!signal) {
        beatRef.current = null
        return
      }
      beatRef.current = signal
      if (demo) {
        setDemoListId(signal.listId)
        return
      }
      send(SHOPPING, signal)
    },
    [demo, meId, send],
  )

  // Stop claiming a list — left the page, or cleared it out.
  const stopShopping = useCallback(() => {
    if (!beatRef.current) return
    beatRef.current = null
    if (demo) {
      setDemoListId(null)
      return
    }
    send('left', { memberId: meId })
  }, [demo, meId, send])

  return useMemo(
    () => ({ presence: state, announceShopping, stopShopping, meId }),
    [state, announceShopping, stopShopping, meId],
  )
}
