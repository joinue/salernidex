// "Send it to them" — a link to one item, handed to the OS share sheet.
//
// The household already has a text thread, and this is the app admitting it:
// the fastest way to get your partner to the right screen is a message they
// tap, not a notification they triage. Everything needed for that already
// existed — the hash routes in lib/nav.js address every entity — so this module
// is the missing affordance, not new plumbing.
//
// Deliberately NOT a sharing *permission*. The link is a pointer, and the
// household boundary is still the only permission boundary there is: RLS and
// lib/privacy decide what the person who taps it can see. Sending a link to
// somebody outside the household gets them a sign-in screen and nothing else,
// which is the correct outcome and is why this needs no schema change.
//
// See docs/scopes/competitive-superlist.md item 15.

import { isPrivate } from './privacy'

// Where each kind of thing lives. These are the singular detail routes from
// lib/nav.js — the ones that put a thing on a page of its own, which is what
// somebody following a link from a text message wants. Landing them on an index
// scrolled to a row would be answering a different question.
const PATHS = {
  task: 'task',
  project: 'project',
  list: 'list',
  note: 'note',
  person: 'person',
  org: 'org',
  group: 'group',
  habit: 'habit',
}

export function entityPath(type, id) {
  const route = PATHS[type]
  return route && id ? `${route}/${id}` : null
}

// The full URL. `origin` is passed rather than read so this stays pure — and so
// a test can prove the shape without a jsdom location.
export function shareUrl(type, id, origin) {
  const path = entityPath(type, id)
  if (!path || !origin) return null
  return `${origin.replace(/\/$/, '')}/#/${path}`
}

// What the row is called, for the message. Each entity type keeps its title in
// a different column, and an untitled note is a real thing you can share.
export function shareTitle(type, row) {
  if (!row) return null
  const raw = row.title || row.name || row.text || ''
  const trimmed = String(raw).trim()
  if (trimmed) return trimmed
  return type === 'note' ? 'Untitled note' : null
}

// Whether this item may be sent at all.
//
// A private row is refused, and not because the link would leak it — it
// wouldn't; the recipient's own read is filtered by lib/privacy and again by
// RLS. It is refused because the link cannot work: they would tap it and land
// on "not found", which reads as the app being broken rather than as the item
// being yours alone. Better to say so before sending than to make them
// discover it.
export function canShare(type, row) {
  if (!entityPath(type, row?.id)) return false
  return !isPrivate(row)
}

// The payload for navigator.share. Title and text both, because the platforms
// disagree about which they use: Messages shows the text and drops the title,
// while some targets show only the title.
export function sharePayload(type, row, origin) {
  if (!canShare(type, row)) return null
  const url = shareUrl(type, row.id, origin)
  if (!url) return null
  const title = shareTitle(type, row)
  return { title: title || undefined, text: title ? `${title}\n${url}` : url, url }
}

// Hand it to the OS.
//
// Three outcomes worth distinguishing, because the caller has to say something
// different about each: 'shared' (the sheet took it — say nothing, the OS
// already gave feedback), 'copied' (no share sheet here, so the clipboard is
// the honest fallback and the user needs telling), and 'cancelled' (they backed
// out — say nothing at all, since they meant to).
//
// Building an SMS gateway of our own was the alternative and it is the wrong
// shape: the household's thread already exists, on a service they already use,
// and the share sheet is how the OS hands things to it.
export async function shareItem(type, row, { origin, nav = navigator } = {}) {
  const payload = sharePayload(type, row, origin)
  if (!payload) return 'blocked'

  if (nav?.share) {
    try {
      await nav.share(payload)
      return 'shared'
    } catch (err) {
      // AbortError is the user closing the sheet, which is not a failure and
      // must not fall through to a surprise clipboard write.
      if (err?.name === 'AbortError') return 'cancelled'
      // Anything else (a desktop browser that advertises share but refuses a
      // payload, a permissions policy) falls back rather than dead-ending.
    }
  }

  // Testing for the method rather than optional-chaining through it: `await
  // undefined` resolves happily, so a browser with no clipboard API at all
  // would have been reported as a successful copy and the caller would have
  // told the user their link was ready to paste.
  if (typeof nav?.clipboard?.writeText !== 'function') return 'failed'
  try {
    await nav.clipboard.writeText(payload.url)
    return 'copied'
  } catch {
    return 'failed'
  }
}
