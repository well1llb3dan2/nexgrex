// ============================================================================
// NEXGREX Service Worker — Notifications only, no fetch interception.
// Keeping the worker minimal avoids stale-cache flicker on navigation.
// ============================================================================

self.addEventListener('install', () => {
  // Clear any caches left by previous versions of this service worker.
  caches.keys().then((names) => names.forEach((n) => caches.delete(n)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Push / notification support only — no fetch handler.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing app window if one is open.
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a fresh window at the target URL.
      return self.clients.openWindow(targetUrl);
    })
  );
});
