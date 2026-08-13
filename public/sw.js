// SALERNIDEX service worker — push display + click-through, plus a Tier-1
// offline app-shell cache so a cold launch with no network still paints the app
// (the data layer hydrates from its own IndexedDB snapshot; see lib/offlineCache).
//
// Caching is scoped to OUR static shell only — Supabase API/realtime traffic is
// cross-origin and is never touched here. Strategy, chosen to avoid the
// stale-cache bugs that kept caching off before:
//   • navigations  → network-first, fall back to the cached shell when offline
//                    (online users always get fresh index.html → latest chunks)
//   • /assets/*     → cache-first (Vite hashes these; the name IS the version)
//   • other GETs    → stale-while-revalidate (icons, manifest, favicons)
const SHELL_CACHE = 'salernidex-shell-v1'
const SHELL_URL = '/index.html'

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => c.add(SHELL_URL))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const putInCache = (request, response) => {
  // Only cache successful, basic (same-origin) responses; clone before the body
  // is consumed by the page.
  if (response && response.ok && response.type === 'basic') {
    const copy = response.clone()
    caches.open(SHELL_CACHE).then((c) => c.put(request, copy))
  }
  return response
}

self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // leave Supabase & other origins alone

  // Dev-server traffic is never ours to cache: unhashed /src modules and Vite's
  // own /@vite, /@fs, /@id endpoints would land in stale-while-revalidate below
  // and hand every edit back one reload late. None of these paths exist in a
  // build, so this is a no-op in production.
  if (url.pathname.startsWith('/src/') || url.pathname.startsWith('/@')) return

  // SPA navigations: prefer the network (keeps the app fresh), fall back to the
  // cached shell when offline so a cold launch isn't a blank screen.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => putInCache(SHELL_URL, res))
        .catch(() => caches.match(SHELL_URL)),
    )
    return
  }

  // Hashed build assets are immutable — serve from cache, fetch+store on a miss.
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => putInCache(request, res))),
    )
    return
  }

  // Everything else same-origin (icons, manifest, favicons): stale-while-revalidate.
  e.respondWith(
    caches.match(request).then((hit) => {
      const net = fetch(request)
        .then((res) => putInCache(request, res))
        .catch(() => hit)
      return hit || net
    }),
  )
})

// 6b: the send-reminders Edge Function pushes { title, body, url, tag, badge }.
//
// `badge` is the app-icon count (send-reminders/badge.ts, a parity-tested port
// of badgeCount in src/lib/reminders.js). Applying it here is the only way the
// icon can change while the app is closed: the Badging API needs running code,
// and src/App.jsx only runs with a page open — so before this, the icon kept
// whatever number it had when you last closed the app.
//
// Note the two unrelated things called "badge": the `badge:` option below is
// Android's monochrome status-bar glyph for the notification. The app icon is
// registration.setAppBadge().
self.addEventListener('push', (e) => {
  let data = {}
  try {
    data = e.data ? e.data.json() : {}
  } catch {
    data = { body: e.data?.text() }
  }
  e.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || 'Salernidex', {
        body: data.body || '',
        icon: '/web-app-manifest-192x192.png',
        badge: '/favicon-96x96.png',
        tag: data.tag || undefined, // same tag replaces, so re-sends don't stack
        data: { url: data.url || '/' },
      }),
      // Omitted on a payload that doesn't carry a count (an older function
      // version): leave the badge alone rather than wrongly clearing it.
      typeof data.badge === 'number'
        ? data.badge > 0
          ? self.registration.setAppBadge?.(data.badge)
          : self.registration.clearAppBadge?.()
        : null,
    ]).catch(() => {
      // Badging can reject (iOS refuses it without notification permission).
      // The notification itself has already been shown by then, so swallow it —
      // an unhandled rejection here would fail the whole push event.
    }),
  )
})

// Tapping a notification deep-links into the app (e.g. /#/person/<id>),
// reusing an open window when there is one.
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = e.notification.data?.url || '/'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        if ('focus' in win) {
          win.navigate(url)
          return win.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
