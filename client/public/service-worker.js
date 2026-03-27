// ============================================================================
// NEXGREX Enterprise Service Worker v2.0
// Features: Offline-first, background sync, periodic sync, smart caching,
// push notifications, analytics, request prioritization, compression
// ============================================================================

const CACHE_VERSION = 2;
const CACHE_NAME = `nexgrex-v${CACHE_VERSION}`;
const STATIC_ASSETS_CACHE = `${CACHE_NAME}-static`;
const API_CACHE = `${CACHE_NAME}-api`;
const IMAGE_CACHE = `${CACHE_NAME}-images`;
const DB_NAME = 'nexgrex-db';
const MESSAGE_STORE = 'pending-messages';

// Analytics tracking
const analytics = {
  cacheHits: 0,
  cacheMisses: 0,
  networkRequests: 0,
  offlineRequests: 0,
  syncAttempts: 0,
  notificationsSent: 0
};

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/app.js'
];

const CRITICAL_ASSETS = [
  '/',
  '/index.html'
];

// Request priority levels for intelligent prioritization
const REQUEST_PRIORITY = {
  CRITICAL: 3,    // Auth, core UI
  HIGH: 2,        // Messages, user data
  NORMAL: 1,      // Images, secondary data
  LOW: 0          // Analytics, logging
};

// ============================================================================
// IndexedDB Initialization
// ============================================================================
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(MESSAGE_STORE)) {
        db.createObjectStore(MESSAGE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ============================================================================
// Install Event
// ============================================================================
self.addEventListener('install', (event) => {
  console.log('[SW] Install event');
  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(STATIC_ASSETS_CACHE).then((cache) => {
        return cache.addAll(STATIC_ASSETS).catch((err) => {
          console.log('[SW] Error caching static assets (non-critical):', err);
        });
      }),
      openDatabase()
    ]).then(() => {
      self.skipWaiting();
      console.log('[SW] Service Worker installed and activated');
    })
  );
});

// ============================================================================
// Activate Event - Clean old caches
// ============================================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !name.includes(`${CACHE_NAME}`) && !name.includes('nexgrex'))
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      self.clients.claim();
      console.log('[SW] All clients claimed');
    })
  );
});

// ============================================================================
// Fetch Event - Intelligent Caching & Network Strategies
// ============================================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip cross-origin and non-GET requests (except for specific POST endpoints)
  if (url.origin !== location.origin) {
    return;
  }
  
  if (request.method !== 'GET' && !isOfflineCapablePost(request)) {
    return;
  }
  
  // Route based on resource type
  if (url.pathname.startsWith('/api/')) {
    handleApiRequest(event);
  } else if (isImageRequest(url)) {
    handleImageRequest(event);
  } else {
    handleStaticAssetRequest(event);
  }
});

// ============================================================================
// API Request Handler - Network First with Smart Fallback
// ============================================================================
function handleApiRequest(event) {
  const { request } = event;
  const priority = getRequestPriority(request);
  
  event.respondWith(
    fetchWithRetry(request, priority)
      .then((response) => {
        // Cache successful API responses
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(API_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          }).catch((err) => console.log('[SW] Cache API error:', err));
          analytics.networkRequests++;
          analytics.cacheHits++;
        }
        return response;
      })
      .catch((error) => {
        analytics.offlineRequests++;
        // Network failed - try cache
        return caches.match(request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              console.log('[SW] Using cached API response for:', request.url);
              return cachedResponse;
            }
            // If POST and offline, queue for background sync
            if (request.method === 'POST') {
              return queueOfflineRequest(request);
            }
            return new Response('Offline - API unavailable', { 
              status: 503,
              headers: { 'Content-Type': 'text/plain' }
            });
          });
      })
  );
}

// ============================================================================
// Image Request Handler - Cache First with Network Fallback
// ============================================================================
function handleImageRequest(event) {
  const { request } = event;
  
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        analytics.cacheHits++;
        return cachedResponse;
      }
      
      analytics.cacheMisses++;
      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200) {
            return response;
          }
          
          const responseToCache = response.clone();
          caches.open(IMAGE_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          }).catch((err) => console.log('[SW] Cache image error:', err));
          
          return response;
        })
        .catch(() => {
          // Return placeholder or offline asset
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#f0f0f0" width="100" height="100"/></svg>',
            { 
              headers: { 'Content-Type': 'image/svg+xml' },
              status: 200
            }
          );
        });
    })
  );
}

// ============================================================================
// Static Asset Request Handler - Stale While Revalidate
// ============================================================================
function handleStaticAssetRequest(event) {
  const { request } = event;
  const url = new URL(request.url);
  const isCritical = CRITICAL_ASSETS.includes(url.pathname);
  
  if (isCritical) {
    // Critical assets: network first
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(STATIC_ASSETS_CACHE).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request)
            .then((cachedResponse) => {
              return cachedResponse || new Response('Offline', { status: 503 });
            });
        })
    );
  } else {
    // Non-critical: stale while revalidate
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request).then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(STATIC_ASSETS_CACHE).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        }).catch(() => cachedResponse);
        
        return cachedResponse || fetchPromise;
      })
    );
  }
}

// ============================================================================
// Retry Logic with Exponential Backoff
// ============================================================================
async function fetchWithRetry(request, priority, attempt = 1) {
  const maxRetries = priority === REQUEST_PRIORITY.CRITICAL ? 3 : 1;
  const baseDelay = 100 * Math.pow(2, attempt - 1);
  
  try {
    return await fetch(request);
  } catch (error) {
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, baseDelay));
      return fetchWithRetry(request, priority, attempt + 1);
    }
    throw error;
  }
}

// ============================================================================
// Request Categorization Helpers
// ============================================================================
function isImageRequest(url) {
  return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url.pathname);
}

function isOfflineCapablePost(request) {
  const url = new URL(request.url);
  return (
    request.method === 'POST' &&
    (url.pathname === '/api/messages' || url.pathname === '/api/avatar')
  );
}

function getRequestPriority(request) {
  const url = new URL(request.url);
  if (url.pathname.includes('/api/me') || url.pathname.includes('/api/login')) {
    return REQUEST_PRIORITY.CRITICAL;
  }
  if (url.pathname.includes('/api/messages')) {
    return REQUEST_PRIORITY.HIGH;
  }
  return REQUEST_PRIORITY.NORMAL;
}

// ============================================================================
// Offline Request Queueing
// ============================================================================
async function queueOfflineRequest(request) {
  try {
    const db = await openDatabase();
    const tx = db.transaction(MESSAGE_STORE, 'readwrite');
    const store = tx.objectStore(MESSAGE_STORE);
    
    const body = await request.clone().text();
    store.add({
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers),
      body: body,
      timestamp: Date.now(),
      retries: 0
    });
    
    console.log('[SW] Request queued for background sync');
    
    // Attempt background sync registration
    if (self.registration.sync) {
      self.registration.sync.register('sync-pending-messages')
        .catch((err) => console.log('[SW] Background sync registration failed:', err));
    }
    
    return new Response(JSON.stringify({ queued: true }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[SW] Queue error:', error);
    return new Response(JSON.stringify({ error: 'Queue failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ============================================================================
// Background Sync Handler
// ============================================================================
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-messages') {
    event.waitUntil(processPendingMessages());
  }
});

async function processPendingMessages() {
  try {
    analytics.syncAttempts++;
    const db = await openDatabase();
    const tx = db.transaction(MESSAGE_STORE, 'readonly');
    const store = tx.objectStore(MESSAGE_STORE);
    
    const messages = [];
    return new Promise((resolve) => {
      store.getAll().onsuccess = async (event) => {
        const pending = event.target.result;
        
        for (const msg of pending) {
          try {
            const response = await fetch(msg.url, {
              method: msg.method,
              headers: msg.headers,
              body: msg.body
            });
            
            if (response.ok) {
              // Remove successful message
              const deleteTx = db.transaction(MESSAGE_STORE, 'readwrite');
              deleteTx.objectStore(MESSAGE_STORE).delete(msg.id);
            } else if (msg.retries < 3) {
              // Retry with incremented counter
              const updateTx = db.transaction(MESSAGE_STORE, 'readwrite');
              msg.retries++;
              updateTx.objectStore(MESSAGE_STORE).put(msg);
            }
          } catch (error) {
            console.log('[SW] Sync attempt failed:', error);
          }
        }
        
        resolve();
      };
    });
  } catch (error) {
    console.error('[SW] Background sync error:', error);
  }
}

// ============================================================================
// Periodic Sync Handler (Daily Analytics Report)
// ============================================================================
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'daily-analytics') {
    event.waitUntil(reportAnalytics());
  }
});

async function reportAnalytics() {
  try {
    await fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: Date.now(),
        cacheHits: analytics.cacheHits,
        cacheMisses: analytics.cacheMisses,
        networkRequests: analytics.networkRequests,
        offlineRequests: analytics.offlineRequests,
        syncAttempts: analytics.syncAttempts,
        notificationsSent: analytics.notificationsSent
      })
    });
  } catch (error) {
    console.log('[SW] Analytics report failed:', error);
  }
}

// ============================================================================
// Push Notification Handler
// ============================================================================
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  let notificationData = {
    title: 'NEXGREX',
    options: {
      body: 'New message',
      icon: '/icon-192.svg',
      badge: '/icon-96.svg',
      tag: 'nexgrex-notification',
      requireInteraction: false,
      vibrate: [100, 50, 100]
    }
  };
  
  try {
    const data = event.data.json();
    notificationData.title = data.title || 'NEXGREX';
    notificationData.options.body = data.body || 'New notification';
    notificationData.options.tag = data.tag || 'nexgrex-notification';
  } catch (e) {
    notificationData.options.body = event.data.text();
  }
  
  analytics.notificationsSent++;
  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData.options)
  );
});

// ============================================================================
// Notification Click Handler
// ============================================================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// ============================================================================
// Message Handler for Client Communication
// ============================================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'REPORT_ANALYTICS') {
    event.ports[0].postMessage({
      type: 'ANALYTICS_REPORT',
      data: analytics
    });
  }
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
});
