// Errand co-presence — "Sam is shopping this list now."
//
// The ephemeral half of a coordination problem whose durable half already
// shipped: a one-tap claim writes tasks.assignee, so "I've got this" survives a
// pocketed phone. This is the other half, and it should stay ephemeral. Nothing
// here is ever written to the database.
//
// It is deliberately NOT viewer presence (docs/scopes/competitive-superlist.md
// §5). Avatars saying who is *looking* at a list are noise at three people, and
// the line between the two features is easy to erase by accident, so it is
// drawn here in code rather than only in prose: a signal exists only once
// somebody has actually WORKED the list — the first check-off, not the page
// load. Nothing in this module can express "I am here", because there is no
// event for arriving.
//
// Pure state + rules. The channel that carries it is hooks/usePresence.js.

import { isPrivate } from './privacy'

// How long a signal is believed without a refresh. Two heartbeats' worth, so a
// single dropped beat doesn't blink the banner off and back on.
export const PRESENCE_TTL_MS = 45000

// How often an active shopper re-announces. Comfortably inside the TTL.
export const PRESENCE_BEAT_MS = 20000

// The one kind of signal there is. Named rather than boolean so a second kind
// (a task being done right now) is an addition instead of a rewrite.
export const SHOPPING = 'shopping'

// Ephemeral state lies, and this is where that is admitted: a broadcast dies
// with the tab that sent it. A signal therefore carries the wall-clock time it
// was made, and every read is relative to a `nowMs` the caller passes in — so
// "gone" is derived on read rather than trusted to arrive as its own event.
// A phone that goes into a tunnel mid-aisle stops beating, and forty-five
// seconds later the banner is simply gone. That is honest; a stuck "Sam is
// shopping" is not.
export function isFresh(signal, nowMs) {
  if (!signal?.at) return false
  const age = nowMs - signal.at
  // A clock ahead of ours would otherwise read as infinitely fresh. Clamp both
  // ends: only a signal genuinely inside the window counts.
  return age >= -PRESENCE_TTL_MS && age < PRESENCE_TTL_MS
}

// Fold one broadcast into the state. Keyed by member: one person can only be
// shopping one list at a time, so a newer signal from the same member replaces
// their older one rather than accumulating.
//
// `state` is a plain object so it compares cheaply in React and serialises in
// tests. Returns the same reference when nothing changed, which keeps an
// unchanged heartbeat from re-rendering every row on the page.
export function applySignal(state, signal) {
  if (!signal?.memberId || !signal?.at) return state
  const prev = state[signal.memberId]
  // Out-of-order delivery: an older beat must not undo a newer one.
  if (prev && prev.at > signal.at) return state
  if (
    prev &&
    prev.at === signal.at &&
    prev.listId === signal.listId &&
    prev.done === signal.done &&
    prev.total === signal.total
  ) {
    return state
  }
  return { ...state, [signal.memberId]: signal }
}

// Someone said they're done (left the page, unmounted, cleared the list).
export function clearMember(state, memberId) {
  if (!memberId || !state[memberId]) return state
  const next = { ...state }
  delete next[memberId]
  return next
}

// Who is working THIS list right now, me excluded — the banner is about the
// other person. Expired signals are dropped on read, so a caller never has to
// remember to prune.
export function shoppersOf(state, listId, nowMs, { exclude } = {}) {
  if (!listId) return []
  return Object.values(state || {})
    .filter(
      (s) =>
        s.kind === SHOPPING && s.listId === listId && s.memberId !== exclude && isFresh(s, nowMs),
    )
    .sort((a, b) => b.at - a.at)
}

// Every list somebody is working, as { [listId]: count } — for the index, where
// a whole page of lists needs one pass rather than one scan each.
export function shoppedLists(state, nowMs, { exclude } = {}) {
  const out = {}
  for (const s of Object.values(state || {})) {
    if (s.kind !== SHOPPING || s.memberId === exclude || !isFresh(s, nowMs)) continue
    out[s.listId] = (out[s.listId] || 0) + 1
  }
  return out
}

// The banner's words. Progress is only included when there is some — "0 of 12"
// is what the list already looks like, and saying it adds nothing.
//
// Two people on the same list is rare but real (splitting a big shop), and
// naming them both beats a bare "2 people".
export function shoppingLabel(shoppers) {
  if (!shoppers?.length) return null
  const names = shoppers.map((s) => s.name || 'Someone')
  const who =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names[0]} and ${names.length - 1} others`
  const lead = shoppers[0]
  const verb = names.length === 1 ? 'is shopping this now' : 'are shopping this now'
  if (!lead.total || !lead.done) return `${who} ${verb}`
  return `${who} ${verb} · ${lead.done} of ${lead.total}`
}

// Whether this list may announce itself AT ALL.
//
// The gate is on the SEND, not the render, and that distinction is the whole
// point: a private list broadcasting "Marc is shopping Birthday surprises" has
// already leaked it, no matter how carefully the other client decides not to
// draw it. Every member is subscribed to the same household channel.
export function canAnnounce(list) {
  return !!list && !isPrivate(list)
}

// The signal a shopper sends. Built here so the shape has one author, and so
// the privacy gate can't be forgotten by a caller assembling it by hand.
export function shoppingSignal({ list, memberId, name, done, total, at }) {
  if (!canAnnounce(list) || !memberId) return null
  return { kind: SHOPPING, memberId, name: name || null, listId: list.id, done, total, at }
}
