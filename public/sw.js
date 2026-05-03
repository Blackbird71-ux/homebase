// Homebase Service Worker — v4
//
// Lessons applied from Memories offline implementation:
//   - Two-cache architecture (shell + api) — simpler than three caches
//   - RSC prefetch requests (Next-Router-Prefetch:1) are NEVER cached —
//     caching them causes stale payloads / double-refresh bug
//   - RSC responses stored under a ?__rsc_cache key to avoid URL collisions
//     with full HTML responses for the same pathname
//   - Next-Router-State-Tree header also identifies RSC fetches
//   - warmNavCache() on activate — key pages available offline before first visit
//   - credentials:'include' on warm fetches — required for auth-protected routes
//   - .catch(()=>{}) on every cache.put — quota errors must not crash fetch handler
//   - Background Sync delegates to clients via postMessage — avoids duplicating
//     IndexedDB logic in SW context

const SHELL_CACHE = 'homebase-shell-v4';
const API_CACHE   = 'homebase-api-v4';
const ALL_CACHES  = [SHELL_CACHE, API_CACHE];

const SYNC_TAG = 'homebase-list-sync';

// Statically pre-cached on install — no auth required
const PRECACHE_URLS = [
  '/offline.html',
  '/icon-192.png',
  '/icon-512.png',
];

// Pages warmed on activation so they work offline even before first visit
const WARM_PAGES = [
  '/meal-plan',
  '/recipes',
  '/lists',
  '/calendar',
  '/notes',
];

// API GET paths cached with stale-while-revalidate
// Using regex for precise matching — avoids accidentally caching mutation endpoints
const API_CACHE_PATTERNS = [
  /^\/api\/meal-plan($|\?|\/)/,
  /^\/api\/recipes($|\?|\/)/,
  /^\/api\/lists($|\?|\/)/,
  /^\/api\/events($|\?|\/)/,
  /^\/api\/event-categories($|\?|\/)/,
  /^\/api\/notes($|\?|\/)/,
];

// ── Install ────────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

// ── Activate ───────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !ALL_CACHES.includes(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim())
      .then(() => warmNavCache()),
  );
});

// Silently fetch and cache key pages so they're available offline
// even if the user hasn't navigated to them yet in this session.
async function warmNavCache() {
  const cache = await caches.open(SHELL_CACHE);
  for (const url of WARM_PAGES) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) await cache.put(url, res);
    } catch {} // offline at activate time — skip, will cache on first visit
  }
}

// ── Background Sync ────────────────────────────────────────────────────────────

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    // Delegate actual replay to open client windows — they hold the app state
    // and can update React after syncing. If no windows are open the online
    // event / visibilitychange in the client will handle it when the user returns.
    event.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({ type: 'SYNC_REQUESTED' }));
}

// ── Message handler ────────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  // Allow new SW version to take over immediately when prompted
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Push Notifications ─────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [100, 50, 100],
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === urlToOpen && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(urlToOpen);
    }),
  );
});

// ── Fetch handler ──────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  // Only handle same-origin GET requests
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  const url = new URL(event.request.url);

  // ── 1. API cache (stale-while-revalidate) ────────────────────────────────────
  if (API_CACHE_PATTERNS.some((p) => p.test(url.pathname))) {
    event.respondWith(
      caches.open(API_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        const fetchPromise = fetch(event.request)
          .then((res) => {
            if (res.ok) cache.put(event.request, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => null);

        // Return cached immediately; revalidate in background
        if (cached) { fetchPromise.catch(() => {}); return cached; }

        // No cache yet — wait for network
        return (await fetchPromise) || new Response(
          JSON.stringify({ offline: true }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    return;
  }

  // ── 2. Next.js RSC fetches (client-side navigation) ─────────────────────────
  // Identified by RSC:1 or Next-Router-State-Tree header.
  // IMPORTANT: prefetch requests (Next-Router-Prefetch:1) are passed through
  // without caching — caching prefetches causes stale payloads on real
  // navigations, requiring a double-refresh to recover (Memories lesson #4).
  const isRscFetch     = event.request.headers.get('RSC') === '1'
                      || event.request.headers.has('Next-Router-State-Tree');
  const isRscPrefetch  = event.request.headers.get('Next-Router-Prefetch') === '1';

  if (isRscFetch && !isRscPrefetch) {
    // Store under a distinct key so RSC responses never collide with the full
    // HTML cached for the same URL by the navigate handler below.
    const rscKey = new Request(url.origin + url.pathname + '?__rsc_cache');
    event.respondWith(
      caches.open(API_CACHE).then(async (cache) => {
        const fresh = await fetch(event.request)
          .then((res) => {
            if (res.ok) cache.put(rscKey, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => null);

        if (fresh) return fresh;

        // Offline — return cached RSC payload so the user sees previous data
        const cached = await cache.match(rscKey);
        if (cached) return cached;

        // Nothing cached — fall through to the cached full-page HTML
        return offlineNavigationFallback(new Request(url.origin + url.pathname));
      }),
    );
    return;
  }

  // ── 3. Full page navigation ─────────────────────────────────────────────────
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            caches.open(SHELL_CACHE)
              .then((cache) => cache.put(event.request, res.clone()))
              .catch(() => {});
          }
          return res;
        })
        .catch(() => offlineNavigationFallback(event.request)),
    );
    return;
  }

  // ── 4. Static assets — cache-first ──────────────────────────────────────────
  if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|css|js)$/)
      || url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((res) => {
          if (res.ok) {
            caches.open(SHELL_CACHE)
              .then((cache) => cache.put(event.request, res.clone()))
              .catch(() => {});
          }
          return res;
        }).catch(() => new Response('', { status: 503 }));
      }),
    );
    return;
  }

  // Everything else: network only
});

// ── Offline navigation fallback ────────────────────────────────────────────────
// Priority: exact URL → /meal-plan → /recipes → /offline.html → plain text
async function offlineNavigationFallback(request) {
  return (
    (await caches.match(request)) ||
    (await caches.match('/meal-plan')) ||
    (await caches.match('/recipes')) ||
    (await caches.match('/offline.html')) ||
    new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
  );
}
