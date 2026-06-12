// SALERNIDEX service worker — push display + click-through only.
// Deliberately NO offline caching while the app is under active development
// (stale-cache bugs cost more than offline support is worth right now).

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

// 6b: the send-reminders Edge Function pushes { title, body, url, tag }.
self.addEventListener('push', (e) => {
  let data = {}
  try {
    data = e.data ? e.data.json() : {}
  } catch {
    data = { body: e.data?.text() }
  }
  e.waitUntil(
    self.registration.showNotification(data.title || 'Salernidex', {
      body: data.body || '',
      icon: '/web-app-manifest-192x192.png',
      badge: '/favicon-96x96.png',
      tag: data.tag || undefined, // same tag replaces, so re-sends don't stack
      data: { url: data.url || '/' },
    })
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
    })
  )
})
