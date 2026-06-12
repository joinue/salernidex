// Client half of push notifications (Phase 6b). Everything here works
// today — permission, a real push subscription from the browser's push
// service, and local test notifications. What does NOT exist yet is a
// server that sends to the subscription; that arrives at Supabase go-live.
import { supabase } from './supabase'
import { demoMode } from './demo'

// Dev keypair's public half, for exercising the subscribe flow locally.
// The private half was discarded on purpose — at go-live, generate a fresh
// pair (npx web-push generate-vapid-keys), set VITE_VAPID_PUBLIC_KEY, and
// everyone re-enables on their devices (it's just the household).
const DEV_VAPID_PUBLIC = 'BN3suYncH9TP5CPZ4xLj0vpN8vkK3aGmt29xxuorjNrnmo7QLwV23sek9F_Miwz1-G4Pj8t7iCyHNXUMIsMixxM'
export const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || DEV_VAPID_PUBLIC

const DEVICE_KEY = 'salernidex-push-device' // demo-mode stand-in for push_subscriptions

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true

// 'ok' | 'ios-install-first' | 'unsupported'
export function pushSupport() {
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) return 'ok'
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

// Ask permission and create the subscription. Returns
// { permission, subscribed } — permission can be granted while subscription
// creation fails (e.g. headless browsers); local notifications still work
// then, and the device can re-subscribe later.
export async function enablePush(memberId) {
  const reg = await ensureRegistration()
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { permission, subscribed: false }

  let sub = null
  try {
    sub =
      (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      }))
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
    if (demoMode) {
      localStorage.setItem(DEVICE_KEY, JSON.stringify(row))
    } else {
      await supabase.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' })
    }
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
export async function sendTestNotification() {
  const reg = await navigator.serviceWorker.ready
  await reg.showNotification('Salernidex', {
    body: "Notifications are working — you'll get the morning summary here once live accounts arrive.",
    icon: '/web-app-manifest-192x192.png',
    badge: '/favicon-96x96.png',
    data: { url: '/' },
  })
}
