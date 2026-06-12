// Homebase Service Worker — v10
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
// v9 additions:
//   - Recipe warm depth: /api/warm now returns up to 200 recipe IDs (newest first).
//     Full HTML+RSC is still warmed only for the top MAX_RECIPE_WARM (cost control);
//     the rest get RSC-only warming, which makes every recipe reachable offline via
//     client-side navigation from the warmed /recipes list page. (Hard-refreshing a
//     non-top-20 recipe URL offline still falls back to the nav fallback chain.)
//   - Offline mutation flushing moved to a single global flusher mounted in the app
//     shell (useGlobalOfflineFlush) — SYNC_REQUESTED replay no longer requires a
//     list page to be open.
//   - Cache names bumped v8→v9 so the deeper recipe warm rebuilds cleanly on activate.
// v10 additions (low-data cache warming):
//   - Data API warming: /api/warm now returns apiUrls (lists/items/chores/schedule/
//     events/meal-plan/recipes/categories, URLs computed server-side from the user's
//     settings so they byte-match the views' requests). warmCaches() warms these on
//     EVERY trigger — previously data APIs were only cached when a view was visited
//     online, so a never-opened view had pages but no data offline.
//   - ETag revalidation: cacheable API routes emit ETags; fetchWithRevalidate()
//     replays GETs with If-None-Match from the cached copy, so repeat warms and
//     network-first refetches cost a ~304 instead of the full body.
//   - Full warm (pages + recipe HTML/RSC + images — the expensive part, several MB)
//     is throttled to once per 12h via a timestamp in the API cache; data API warm
//     runs every time. Clients pass saveData:true (Data Saver) to skip full warm.
//   - Cache names bumped v9→v10 so caches rebuild cleanly on activate.
//   - Fix: the 12h full-warm timestamp is written at the START of the sweep, not
//     the end — an interrupted warm (~300 sequential fetches) used to leave the
//     timestamp unwritten, restarting the entire flood on every page load.

const SHELL_CACHE = 'homebase-shell-v10';
const API_CACHE   = 'homebase-api-v10';
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

// Number of recipe detail pages warmed with full HTML + RSC on activation.
// Recipes beyond this depth are warmed RSC-only (see warmCaches step 2).
const MAX_RECIPE_WARM = 20;

// Synthetic cache entry holding the last full-warm timestamp. The pathname
// matches no fetch-handler pattern, so it can never be served to a page.
const WARM_META_URL = self.location.origin + '/__homebase_warm_meta';
const FULL_WARM_INTERVAL_MS = 12 * 60 * 60 * 1000;


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
  /^\/api\/chores($|\?|\/)/,          // chores page + /api/chores/schedule (dashboard card); GET-only, completion POSTs pass through
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
      .then(() => warmCaches({ fullWarm: true })),
  );
});

// ── Cache warming ──────────────────────────────────────────────────────────────
//
// Two tiers, both driven by /api/warm:
//   - Data API warm (ALWAYS): the apiUrls list — small JSON payloads, and ~free
//     on repeat passes thanks to ETag/If-None-Match revalidation (304s).
//   - Full warm (throttled to 12h / skipped on Data Saver): nav pages + recipe
//     detail pages + recipe images. This is the expensive multi-MB tier.
//
// Page warming fetches twice per page:
//   1. Full HTML → SHELL_CACHE (serves navigate requests offline)
//   2. RSC payload → API_CACHE under ?__rsc_cache key (serves client-side
//      navigation offline — without this, Next.js receives HTML in place of
//      an RSC response, fails to parse it, and shows a broken partial page)
async function warmCaches({ fullWarm }) {
  const shellCache = await caches.open(SHELL_CACHE);
  const apiCache   = await caches.open(API_CACHE);

  // Fetch the warm manifest once. May fail if not logged in (SW activation can
  // happen before auth) — best-effort; pages and data cache on first visit.
  let warmData = null;
  try {
    const warmRes = await fetch(self.location.origin + '/api/warm', {
      credentials: 'include',
    });
    if (warmRes.ok) warmData = await warmRes.json();
  } catch {}

  // Tier 1 — data APIs, every trigger.
  if (warmData && Array.isArray(warmData.apiUrls)) {
    await warmApiData(warmData.apiUrls, apiCache);
  }

  if (!fullWarm) return;

  // Mark the full warm BEFORE the expensive tier, not after. The sweep below is
  // ~300 sequential fetches taking a minute or more; if the SW is killed mid-warm
  // (tab closed, device sleep), an end-of-sweep timestamp never lands and every
  // subsequent page load restarts the entire multi-MB flood. Worst case now is
  // the opposite and benign: an interrupted warm leaves some pages uncached for
  // up to 12h — acceptable for a best-effort offline cache. Only marked when the
  // warm manifest loaded (signed in + online), so a pre-auth attempt still
  // retries on the next load.
  if (warmData) await markFullWarm(apiCache);

  // Tier 2 — full warm. Step 1: main navigation pages (HTML + RSC).
  for (const url of WARM_PAGES) {
    await warmPage(url, shellCache, apiCache);
  }

  // Step 2: recipe detail pages + images from the warm manifest.
  if (warmData) {
    // Full HTML + RSC for the newest MAX_RECIPE_WARM, RSC-only for the rest —
    // client-side navigation from the warmed /recipes list page works offline
    // for every recipe, at a fraction of the warm cost.
    const recipeIds = warmData.recipeIds || [];
    for (const id of recipeIds.slice(0, MAX_RECIPE_WARM)) {
      await warmPage('/recipes/' + id, shellCache, apiCache);
    }
    for (const id of recipeIds.slice(MAX_RECIPE_WARM)) {
      await warmPageRsc('/recipes/' + id, apiCache);
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
}

// Warm the data API URLs into the API cache. Each fetch revalidates with
// If-None-Match, so unchanged payloads cost a 304 with an empty body.
async function warmApiData(apiUrls, apiCache) {
  for (const url of apiUrls) {
    const request = new Request(self.location.origin + url, { credentials: 'include' });
    try {
      await fetchWithRevalidate(request, apiCache);
    } catch {}
  }
}

// True when the last full warm is older than FULL_WARM_INTERVAL_MS (or absent).
async function fullWarmDue(apiCache) {
  try {
    const meta = await apiCache.match(WARM_META_URL);
    if (!meta) return true;
    const data = await meta.json();
    return !data.lastFullWarm || Date.now() - data.lastFullWarm > FULL_WARM_INTERVAL_MS;
  } catch {
    return true;
  }
}

async function markFullWarm(apiCache) {
  try {
    await apiCache.put(
      WARM_META_URL,
      new Response(JSON.stringify({ lastFullWarm: Date.now() }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  } catch {}
}

// Conditional fetch: replay the GET with If-None-Match from the cached copy.
// 304 → serve the cached body (no data transferred); 200 → update the cache.
// The header is only added when a cached copy exists, so a 304 always has a
// body to fall back to. Lives in the SW because views fetch with
// cache:'no-store', which bypasses the browser's own conditional caching.
async function fetchWithRevalidate(request, cache) {
  const cached = await cache.match(request);
  const etag = cached && cached.headers.get('ETag');
  let req = request;
  if (etag) {
    const headers = new Headers(request.headers);
    headers.set('If-None-Match', etag);
    req = new Request(request, { headers });
  }
  const res = await fetch(req);
  if (res.status === 304 && cached) return cached;
  if (res.ok) cache.put(request, res.clone()).catch(() => {});
  return res;
}

// Warm a single page: fetch both full HTML and RSC payload
async function warmPage(url, shellCache, apiCache) {
  // Full HTML
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (res.ok) await shellCache.put(url, res).catch(() => {});
  } catch {}
  await warmPageRsc(url, apiCache);
}

// Warm only the RSC payload — RSC: 1 tells Next.js to return the component
// payload. Enough for offline client-side navigation; ~10x cheaper than HTML.
async function warmPageRsc(url, apiCache) {
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
    event.waitUntil(warmCaches({ fullWarm: true }));
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
  // Client-triggered cache warm-up (page load, reconnect). Data APIs warm every
  // time (cheap — 304s); the expensive page/image warm only when 12h have passed
  // since the last one, and never when the client reports Data Saver is on.
  if (event.data?.type === 'WARM_CACHE') {
    event.waitUntil(
      (async () => {
        const apiCache = await caches.open(API_CACHE);
        const fullWarm = !event.data.saveData && (await fullWarmDue(apiCache));
        await warmCaches({ fullWarm });
      })(),
    );
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
          // Revalidates with If-None-Match — unchanged payloads cost a 304.
          return await fetchWithRevalidate(event.request, cache);
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
        // Background revalidation sends If-None-Match — a 304 confirms freshness
        // without re-downloading the body.
        const fetchPromise = fetchWithRevalidate(event.request, cache).catch(() => null);

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
