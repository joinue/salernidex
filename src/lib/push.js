// Client half of push notifications (Phase 6b). Everything here works
// today — permission, a real push subscription from the browser's push
// service, and local test notifications. What does NOT exist yet is a
// server that sends to the subscription; that arrives at Supabase go-live.
import { supabase } from './supabase'
import { demoMode } from './demo'
import { isIos, isStandalone } from './platform'

// Dev keypair's public half, for exercising the subscribe flow locally.
// The private half was discarded on purpose — at go-live, generate a fresh
// pair (npx web-push generate-vapid-keys), set VITE_VAPID_PUBLIC_KEY, and
// everyone re-enables on their devices (it's just the household).
const DEV_VAPID_PUBLIC =
  'BN3suYncH9TP5CPZ4xLj0vpN8vkK3aGmt29xxuorjNrnmo7QLwV23sek9F_Miwz1-G4Pj8t7iCyHNXUMIsMixxM'

// True only when a real key is configured. Subscriptions are bound to whichever
// public key created them, and the SAME keypair's private half must sign on the
// server (send-reminders). If a production build falls back to DEV_VAPID_PUBLIC,
// the server signs with a different key and every push is rejected (403) while
// the UI still says "Ready" — a silent, total delivery failure. Surface it.
export const vapidConfigured = Boolean(import.meta.env.VITE_VAPID_PUBLIC_KEY)
if (import.meta.env.PROD && !vapidConfigured) {
  console.error(
    '[push] VITE_VAPID_PUBLIC_KEY is unset in a production build — push delivery ' +
      'will fail. Set it to the public half of the SAME keypair the send-reminders ' +
      'function uses (npx web-push generate-vapid-keys).',
  )
}
export const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || DEV_VAPID_PUBLIC

// "This device has push turned on." Written on every successful enable (and in
// demo mode it doubles as the stand-in for the push_subscriptions row, which is
// why it stores the whole row). It used to be written ONLY in demo mode, so on a
// real account the Settings toggle read "off" after every reload — and since the
// off-switch is what clears a stale subscription, there was no way back from a
// bad one through the UI.
const DEVICE_KEY = 'salernidex-push-device'

// 'ok' | 'ios-install-first' | 'unsupported'
export function pushSupport() {
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)
    return 'ok'
  if (isIos() && !isStandalone()) return 'ios-install-first' // iOS 16.4+ gates push behind Add to Home Screen
  return 'unsupported'
}

export function permissionState() {
  return 'Notification' in window ? Notification.permission : 'unsupported'
}

export function deviceEnabled() {
  try {
    return Boolean(JSON.parse(localStorage.getItem(DEVICE_KEY) || 'null'))
  } catch {
    return false
  }
}

export async function ensureRegistration() {
  if (!('serviceWorker' in navigator)) return null
  return navigator.serviceWorker.register('/sw.js')
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

// Is this subscription bound to `key`? A PushSubscription is cryptographically
// tied to the applicationServerKey that created it: once the app's VAPID key
// changes, every send to an old subscription is rejected (Apple returns
// VapidPkHashMismatch, Chrome a 403) — forever, and silently, because the
// browser keeps handing the dead subscription back. Returns false when the
// browser won't tell us, so an unverifiable subscription is replaced rather
// than trusted.
function boundTo(sub, key) {
  const current = sub.options?.applicationServerKey
  if (!current) return false
  const bytes = new Uint8Array(current)
  return bytes.length === key.length && bytes.every((b, i) => b === key[i])
}

// Ask permission and create the subscription. Returns
// { permission, subscribed } — permission can be granted while subscription
// creation fails (e.g. headless browsers); local notifications still work
// then, and the device can re-subscribe later.
//
// Reuses an existing subscription only when it was created with the VAPID key
// we're currently shipping. Otherwise it's dropped and remade: a key rotation
// (or a deploy built against a different key) would otherwise brick push on
// every already-subscribed device, with the UI still cheerfully reporting
// "Ready" — the failure mode is total and invisible, so it self-heals here.
export async function enablePush(memberId) {
  const reg = await ensureRegistration()
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { permission, subscribed: false }

  const appKey = urlBase64ToUint8Array(vapidPublicKey)
  let sub = null
  try {
    const existing = await reg.pushManager.getSubscription()
    if (existing && boundTo(existing, appKey)) {
      sub = existing
    } else {
      if (existing) {
        // Drop the server row first: after unsubscribe() the endpoint is gone
        // and we'd have no way to identify the row to clean up.
        if (!demoMode) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', existing.endpoint)
        }
        await existing.unsubscribe().catch(() => {})
      }
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appKey,
      })
    }
  } catch {
    sub = null
  }

  if (sub) {
    const json = sub.toJSON()
    const row = {
      member_id: memberId,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh || '',
      auth: json.keys?.auth || '',
      user_agent: navigator.userAgent,
    }
    if (!demoMode) {
      await supabase.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' })
    }
    // Both modes: this is what makes the Settings toggle survive a reload.
    localStorage.setItem(DEVICE_KEY, JSON.stringify(row))
  }
  return { permission, subscribed: Boolean(sub) }
}

export async function disablePush() {
  const reg = await navigator.serviceWorker?.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    if (!demoMode) await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
  localStorage.removeItem(DEVICE_KEY)
}

// Local notification through the service worker — proves the device shows
// them properly. No server involved.
//
// Kept, but it is the weaker of the two tests: it never leaves the browser, so
// it passes just as happily when delivery is completely broken. Reach for
// sendRealTestPush() to answer "will a reminder actually arrive?".
export async function sendTestNotification() {
  const reg = await navigator.serviceWorker.ready
  await reg.showNotification('DOOT', {
    body: "Notifications are working. You'll get the morning summary here once live accounts arrive.",
    icon: '/web-app-manifest-192x192.png',
    badge: '/favicon-96x96.png',
    data: { url: '/' },
  })
}

// The real thing: asks the server to push to this account's devices, over the
// same VAPID keypair and transport the reminder sweep uses. This is the only
// test that can fail — which is the point. It exercises the three things that
// break silently and are invisible from the client: the key pairing, the stored
// subscription, and whether the function is reachable at all.
export async function sendRealTestPush() {
  if (demoMode || !supabase) throw new Error('Sign in to send a real test push.')
  const { data, error } = await supabase.functions.invoke('send-test-push')
  // A non-2xx from the function arrives as `error` with the body unread; the
  // message alone ("Edge Function returned a non-2xx status code") would hide
  // whether this was auth, a missing deploy, or a send failure.
  if (error) throw new Error(error.message || 'Could not reach the push service.')
  if (data?.error) throw new Error(data.error)
  return data
}

// What to tell the user about a sendRealTestPush() result. Pure so it can be
// tested without a server: the copy is the whole feature here, since a test that
// reports "sent" when nothing arrived is worse than no test.
export function testPushMessage({ sent = 0, total = 0, results = [] } = {}) {
  if (!total) {
    return 'This device has no push registration on the server yet. Turn notifications off and on again to re-register.'
  }
  if (sent === total) {
    return sent === 1
      ? 'Sent. It should arrive on this device within a few seconds.'
      : `Sent to all ${sent} of your devices.`
  }
  // Name the mismatch specifically. It is the failure the user can do nothing
  // about, and the one that otherwise looks identical to "it worked".
  const reasons = new Set(results.filter((r) => !r.ok).map((r) => r.reason))
  if (reasons.has('key-mismatch')) {
    return 'Rejected: this build and the server are using different VAPID keys, so no reminder can be delivered. The keys have to match before push works.'
  }
  if (reasons.has('expired')) {
    const lost = total - sent
    return sent
      ? `Sent to ${sent} of ${total}. ${lost} stale registration${lost === 1 ? ' was' : 's were'} dropped. Re-enable notifications on those devices.`
      : 'Your registration had expired and has been cleared. Turn notifications off and on again to re-register.'
  }
  if (reasons.has('rate-limited'))
    return 'The push service is rate-limiting us. Try again in a minute.'
  return `Sent to ${sent} of ${total}. The rest failed. Check the function logs.`
}
