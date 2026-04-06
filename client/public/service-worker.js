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
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return self.clients.openWindow('/');
    })
  );
});
