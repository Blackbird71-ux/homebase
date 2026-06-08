// Homebase Service Worker — v6
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
// v6 additions:
//   - Recipe detail page warming (top 20 recipes) on activation
//   - Recipe image pre-caching into shell cache for offline image display
//   - Periodic background sync for daily cache refresh
//   - Client-side idle warm-up trigger via postMessage
// v7 additions:
//   - Live, user-mutated collections (/api/lists, /api/events) are now NETWORK-FIRST
//     instead of stale-while-revalidate. SWR served a stale cached copy first, which
//     overwrote freshly-mutated local state on the next poll/focus — the root cause of
//     shopping-list and calendar items flickering in/out. See QA.md §12.27.
//   - Cache names bumped v6→v7 so the stale SWR entries purge on activate.
// v8 additions:
//   - WARM_PAGES now covers EVERY primary nav route (was missing /home, /chores,
//     /finance, /documents, /trips, /wishlists, /maintenance) so the whole app is
//     available offline, not just six pages.
//   - RSC navigation handler now falls back to a warmed RSC payload when the live
//     fetch fails OR returns a 5xx (e.g. a transient SQLite lock under load) — not
//     only when fully offline. This fixes the "tap Home several times before it
//     loads" dead-end: a flaky navigation now shows the last-good page immediately.
//   - Cache names bumped v7→v8 so the expanded warm list rebuilds cleanly on activate.

const SHELL_CACHE = 'homebase-shell-v8';
const API_CACHE   = 'homebase-api-v8';
const ALL_CACHES  = [SHELL_CACHE, API_CACHE];

const SYNC_TAG = 'homebase-list-sync';

// Statically pre-cached on install — no auth required
const PRECACHE_URLS = [
  '/offline.html',
  '/icon-192.png',
  '/icon-512.png',
];

// Pages warmed on activation so they work offline even before first visit.
// Covers every primary nav route (see Sidebar.tsx) — not just a handful — so the
// whole app is reachable offline. Warmed sequentially and best-effort; auth-gated
// routes simply skip if the warm fetch isn't authenticated yet.
const WARM_PAGES = [
  '/home',
  '/calendar',
  '/chores',
  '/lists',
  '/recipes',
  '/meal-plan',
  '/finance',
  '/contacts',
  '/documents',
  '/trips',
  '/notes',
  '/wishlists',
  '/maintenance',
];

// Number of recipe detail pages to warm on activation
const MAX_RECIPE_WARM = 20;


// API GET paths cached with stale-while-revalidate.
// Using regex for precise matching — avoids accidentally caching mutation endpoints.
// These are read-mostly reference data where a brief stale flash is acceptable.
const API_CACHE_PATTERNS = [
  /^\/api\/meal-plan($|\?|\/)/,
  /^\/api\/recipes($|\?|\/)/,
  /^\/api\/event-categories($|\?|\/)/, // EventModal fetches this client-side
  /^\/api\/ingredient-categories($|\?|\/)/, // ShoppingList fetches this on mount
];

// API GET paths served NETWORK-FIRST (fall back to cache only when offline).
// These collections are mutated locally and from other devices; serving a stale
// cached copy first overwrites fresh local state on the next poll/focus. See QA.md §12.27.
const NETWORK_FIRST_PATTERNS = [
  /^\/api\/lists($|\?|\/)/,
  /^\/api\/events($|\?|\/)/,          // CalendarView fetches this client-side when navigating months
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
// We fetch twice per page:
//   1. Full HTML → SHELL_CACHE (serves navigate requests offline)
//   2. RSC payload → API_CACHE under ?__rsc_cache key (serves client-side
//      navigation offline — without this, Next.js receives HTML in place of
//      an RSC response, fails to parse it, and shows a broken partial page)
//
// v6: Also warms recipe detail pages and recipe images for offline viewing.
async function warmNavCache() {
  const shellCache = await caches.open(SHELL_CACHE);
  const apiCache   = await caches.open(API_CACHE);

  // Step 1: Warm main navigation pages (HTML + RSC)
  for (const url of WARM_PAGES) {
    await warmPage(url, shellCache, apiCache);
  }

  // Step 2: Fetch warm list from /api/warm and warm recipe details + images
  try {
    const warmRes = await fetch(self.location.origin + '/api/warm', {
      credentials: 'include',
    });
    if (warmRes.ok) {
      const warmData = await warmRes.json();

      // Warm recipe detail pages (top N)
      const recipeIds = (warmData.recipeIds || []).slice(0, MAX_RECIPE_WARM);
      for (const id of recipeIds) {
        await warmPage('/recipes/' + id, shellCache, apiCache);
      }

      // Warm recipe images into the shell cache
      const images = warmData.recipeImages || [];
      for (const img of images) {
        if (img.alreadyCached) continue;
        // Only warm cacheable images (those with a cachePath)
        if (!img.cachePath) continue;
        const imgUrl = self.location.origin + '/api/images/' + img.cachePath + '?url=' + encodeURIComponent(img.url);
        try {
          const res = await fetch(imgUrl, { credentials: 'include' });
          if (res.ok) await shellCache.put(imgUrl, res).catch(() => {});
        } catch {}
      }
    }
  } catch {
    // /api/warm may fail if not logged in (SW activation can happen before auth)
    // That's fine — the warm-up is best-effort; pages will cache on first visit.
  }
}

// Warm a single page: fetch both full HTML and RSC payload
async function warmPage(url, shellCache, apiCache) {
  // Full HTML
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (res.ok) await shellCache.put(url, res).catch(() => {});
  } catch {}
  // RSC payload — RSC: 1 tells Next.js to return the component payload
  try {
    const res = await fetch(url, { credentials: 'include', headers: { 'RSC': '1' } });
    if (res.ok) {
      const rscKey = new Request(self.location.origin + url + '?__rsc_cache');
      await apiCache.put(rscKey, res).catch(() => {});
    }
  } catch {}
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

// ── Periodic Background Sync (daily cache refresh) ────────────────────────────
// Supported on Chrome Android. Re-warms the cache daily so new content
// (recipes, meal plans) is available offline without the user visiting
// every page while online.
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'homebase-cache-warm') {
    event.waitUntil(warmNavCache());
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
  // Client-triggered cache warm-up (e.g. after login or idle)
  if (event.data?.type === 'WARM_CACHE') {
    event.waitUntil(warmNavCache());
  }
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

  // ── 1. API: live, user-mutated collections — network-first ───────────────────
  // Lists and calendar events change from local mutations and other devices.
  // Always try the network so a poll/focus refetch never serves a pre-mutation
  // copy; fall back to cache only when the network is unreachable (offline).
  if (NETWORK_FIRST_PATTERNS.some((p) => p.test(url.pathname))) {
    event.respondWith(
      caches.open(API_CACHE).then(async (cache) => {
        try {
          const res = await fetch(event.request);
          if (res.ok) cache.put(event.request, res.clone()).catch(() => {});
          return res;
        } catch {
          const cached = await cache.match(event.request);
          return cached || new Response(
            JSON.stringify({ offline: true }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          );
        }
      }),
    );
    return;
  }

  // ── 2. API cache (stale-while-revalidate) ────────────────────────────────────
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

  // ── 3. Next.js RSC fetches (client-side navigation) ─────────────────────────
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

        // Live payload succeeded — serve it.
        if (fresh && fresh.ok) return fresh;

        // Live fetch failed (offline) or errored (5xx — e.g. a transient SQLite
        // lock on a heavy page like /home under load). Prefer a previously-warmed
        // RSC payload so a flaky navigation shows the last-good page instead of
        // dead-ending. Redirects/auth (3xx/4xx) are NOT treated as failures —
        // those fall through to `return fresh` so Next.js handles them.
        if (!fresh || fresh.status >= 500) {
          const cached = await cache.match(rscKey);
          if (cached) return cached;
        }
        if (fresh) return fresh;

        // Nothing cached — return 503 so Next.js shows its error boundary.
        // DO NOT fall through to offlineNavigationFallback here: serving full-page
        // HTML as an RSC payload causes Next.js to navigate to the wrong page
        // (e.g. /meal-plan) or show a browser-level "this page couldn't load" error.
        return new Response(JSON.stringify({ offline: true }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    return;
  }

  // ── 4. Full page navigation ─────────────────────────────────────────────────
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

  // ── 5. Static assets — cache-first ──────────────────────────────────────────
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
// Priority: exact URL → /home → /meal-plan → /recipes → /offline.html → plain text
async function offlineNavigationFallback(request) {
  return (
    (await caches.match(request)) ||
    (await caches.match('/home')) ||
    (await caches.match('/meal-plan')) ||
    (await caches.match('/recipes')) ||
    (await caches.match('/offline.html')) ||
    new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
  );
}
