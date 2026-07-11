# Offline Support

**Implemented:** May 2026 — continuously improved through July 2026  
**Current SW version:** v10  
**Based on:** Memories app offline implementation  

## Overview

Homebase works offline for daily mobile use cases: managing shopping/todo lists, viewing
and editing the calendar, completing chores, adjusting the meal plan, and browsing recipes —
all without internet. Mutations queue in IndexedDB and replay automatically on reconnect.

The finance module, documents, contacts, notes, and settings are read-only from cache while
offline — their data is viewable but mutations require the server.

---

## Key lessons applied from Memories app

1. **Never cache RSC prefetch requests** (`Next-Router-Prefetch: 1`) — caching them causes stale payloads on real navigations, requiring a double-refresh to recover
2. **RSC responses stored under a `?__rsc_cache` key** — avoids URL collisions with full HTML cached for the same pathname
3. **Detect RSC fetches via `Next-Router-State-Tree` header** in addition to `RSC: 1`
4. **`warmCaches()` on SW activation and idle** — all 13 main nav pages + 200 recipe detail pages are cached immediately. Each page fetched twice: full HTML (navigate fallback) and RSC payload (`?__rsc_cache`). Data APIs warmed server-side so byte-match view requests.
5. **`credentials: 'include'` on warm fetches** — required for auth-protected routes
6. **`.catch(() => {})` on every `cache.put()`** — storage quota errors must not crash the fetch handler
7. **Background Sync delegates to clients** via `SYNC_REQUESTED` postMessage — avoids duplicating IndexedDB logic in the SW; client handles replay and state update
8. **`visibilitychange` event** — catches the case where the SW Background Sync fires while the tab is backgrounded
9. **Lazy state initializers** instead of `setState` directly inside `useEffect` (OfflineBanner, AppShell)
10. **`offline.html` fallback** — shown for uncached pages instead of a broken blank screen
11. **ETag revalidation** — `fetchWithRevalidate()` replays GETs with `If-None-Match` so repeat warms cost a 304 instead of the full body
12. **Storage persistence** — `navigator.storage.persist()` prevents Android/Chromium from evicting the SW cache under memory pressure

---

## Architecture

### Service Worker — Two-Cache Design (v10)

| Cache | Contents | Strategy |
|---|---|---|
| `homebase-shell-v10` | Page HTML, static assets (JS/CSS/images/fonts), recipe images | Network-first for navigation; cache-first for static |
| `homebase-api-v10` | API JSON responses + RSC payloads | Split: network-first for mutable; stale-while-revalidate for reference |

### Fetch handler routing (top-to-bottom)

1. **Network-first patterns** — `/api/lists*`, `/api/events*`, `/api/chores*`  
   These collections are mutated locally and from other devices. Always try the network
   so a poll/focus refetch never serves a pre-mutation copy; fall back to cache only
   when offline. Uses ETag revalidation.

2. **Stale-while-revalidate patterns** — `/api/meal-plan*`, `/api/recipes*`, `/api/event-categories*`, `/api/ingredient-categories*`  
   Read-mostly reference data where a brief stale flash is acceptable. Returns cached
   immediately, revalidates in background with `If-None-Match`.

3. **RSC fetches** (not prefetches) — network-first, stored under `?__rsc_cache` key.  
   Falls back to warmed RSC payload when offline or on 5xx errors. Returns 503 JSON
   when nothing is cached — never falls through to `offlineNavigationFallback`.

4. **Full navigation** (`mode: navigate`) — network-first, cached on success.  
   Falls back through: exact URL → `/home` → `/meal-plan` → `/recipes` → `/offline.html`.

5. **Static assets** — cache-first.

6. **Everything else** — network only.

### Cache warming — two tiers

**Tier 1 — Data APIs (every trigger):** The `/api/warm` endpoint returns a list of API URLs
computed server-side from the user's timezone, calendar settings, and list IDs so they
byte-match the views' requests. These small JSON payloads warm every time and cost ~304s
on repeat passes thanks to ETag revalidation.

**Tier 2 — Full warm (12h throttle, skipped on Data Saver):** All 13 main nav pages
(HTML + RSC), top 20 recipe detail pages (HTML + RSC + images), and remaining 180 recipes
(RSC-only for client-nav coverage). Throttled to once per 12 hours to avoid flooding the
network with ~300 sequential fetches.

Triggers: SW activation, idle warm-up (3s after page load), reconnect, Periodic Background
Sync (Chrome Android, daily).

### Mutation queue — IndexedDB

All offline mutations queue in `homebase-offline-queue` IndexedDB. Each feature module
has its own scope key so post-flush refetches target only affected collections.

| Module | Scope | Operations Queued | Idempotency |
|--------|-------|-------------------|-------------|
| Shopping lists | `listId` | Add, toggle, delete, reorder, category change, lock/unlock, clear completed | `clientMutationId` for POST; fixed keys for PUT/DELETE |
| Todo lists | `listId` | Add, toggle, delete, reorder, assign, lock/unlock | Same as shopping |
| Calendar | `calendar` | Create, update, delete (incl. recurring occurrences) | `clientMutationId` for POST; PUT carries full form |
| Chores | `chores` | Complete only | `clientMutationId` for POST |
| Meal plan | `meal-plan` | Slot assign, remove, move, delete | Whole-slot state POST (idempotent upsert) |

### Flushing — global, single-threaded

`useGlobalOfflineFlush` (mounted once in AppShell) replays the entire queue in `queuedAt`
order on: mount, `window online`, `visibilitychange` (visible + online), and SW
`SYNC_REQUESTED` messages. Only one flush runs at a time. After flushing, views that own
optimistic state refetch affected collections via the `OFFLINE_QUEUE_FLUSHED` custom event.

---

## What works offline

| Feature | Offline behaviour |
|---|---|
| Shopping list — all CRUD | All operations queued; optimistic UI updates |
| Todo list — all CRUD | All operations queued; optimistic UI updates |
| All lists — viewing | All lists and items shown from cache |
| Calendar — view | Current month from warmed API cache; ±1 month if visited online |
| Calendar — create/edit/delete | Queued with idempotent replay |
| Chores — view schedule | From warmed API cache |
| Chores — complete | Queued POST with `clientMutationId` |
| Meal plan — view | Current week from warmed API cache |
| Meal plan — edit slots | Assign, remove, move, delete all queued |
| Recipe list | Full list from warmed API cache |
| Recipe detail | Top 20 with full HTML+RSC+images; 180 more with RSC (client-nav works) |
| Finance — view | Cached page HTML (last-visit snapshot, no API data) |
| Contacts — view | From cached page HTML |
| Notes — view | From cached page HTML |
| Documents — view list | From cached page HTML (file content not cached) |
| Trips — view | From cached page HTML |
| All 13 nav pages | Warmed on SW activation; available offline before first visit |

## What does NOT work offline

- **Login / sign out** — server action hits DB; you must be logged in before going offline
- **Finance mutations** — create/edit bills, record payments, post journals (by design)
- **Recipe creation/editing/scraping**
- **Chore creation/editing/deletion/rotation**
- **Contacts/notes mutations** (add, edit, delete)
- **Document uploads/content viewing**
- **Settings changes** (preferences, admin, family)
- **AI assistant**
- **Adding new shopping list categories**
- **Clearing the entire meal plan**
- **Navigating beyond cached calendar/meal-plan range**
- **Google Calendar sync**

---

## Authentication offline

The NextAuth v5 JWT session has a 30-day default maxAge. The `session` callback in
`auth.ts` wraps its DB read in try/catch — if the DB is unreachable, it falls back
to JWT token values (set at login). This prevents every page and API route from 500-ing
when SQLite is locked or unavailable.

When the PWA client is completely offline (no network to the server), the service worker
serves cached HTML directly — `auth()` is never called. The risk is: if the browser
bypasses the SW cache (hard refresh, cache eviction, first load after restart) and the
server is unreachable, the cached page is still served via `offlineNavigationFallback`.

---

## Offline banner

`OfflineBanner` is mounted in `AppShell` and visible whenever:

| State | Message |
|---|---|
| Offline, no pending changes | "You're offline — changes will sync when you reconnect" |
| Offline, N pending changes | "Offline — N changes pending sync" |
| Online, syncing | "Syncing N changes…" (with spinner) |

Queue count is broadcast via `window.dispatchEvent(new CustomEvent('offline-queue-update', …))`.

---

## Files

| File | Role |
|---|---|
| `public/sw.js` | Service worker v10: two-cache architecture, RSC caching, Background Sync, cache warming, ETag revalidation, periodic sync |
| `public/offline.html` | Fallback page for uncached navigation requests |
| `src/lib/offline-queue.ts` | IndexedDB queue: enqueue, flush (ordered replay), idempotency, global flusher |
| `src/lib/calendar-offline.ts` | Calendar event CRUD queued for offline replay |
| `src/lib/chores-offline.ts` | Chore completion queued for offline replay |
| `src/lib/meal-plan-offline.ts` | Meal plan slot state queued for offline replay |
| `src/hooks/useGlobalOfflineFlush.ts` | Global queue flusher mounted in AppShell |
| `src/hooks/lists/useOfflineQueue.ts` | Per-list queue integration + refetch on flush |
| `src/hooks/lists/useShoppingList.ts` | Offline-aware shopping list CRUD |
| `src/hooks/lists/useTodoList.ts` | Offline-aware todo list CRUD |
| `src/hooks/meal-plan/useMealPlanDragDrop.ts` | Offline-aware meal plan drag-drop |
| `src/components/layout/OfflineBanner.tsx` | Connection status + pending sync count banner |
| `src/components/layout/AppShell.tsx` | App shell mounting OfflineBanner + global flusher |
| `src/app/layout.tsx` | SW registration, idle warm-up, periodic sync, storage persistence |
| `src/app/api/warm/route.ts` | Returns recipe IDs, image URLs, and data API URLs for SW warming |
| `src/lib/auth.ts` | NextAuth v5 config: session callback with DB-failure fallback to JWT token |

---

## Docker / NAS deployment

No schema changes. Standard redeploy:

```bash
docker-compose down && docker-compose up -d --build
```

Ensure `/sw.js` headers remain `no-cache` (already set in `next.config.ts`) so browsers always fetch the latest service worker version.

---

## Testing checklist

1. Chrome DevTools → Application → Service Workers — confirm `homebase-shell-v10` active, no errors
2. Visit `/home`, `/calendar`, `/meal-plan`, `/lists`, and a few recipe pages while online
3. DevTools → Network → Offline
4. Navigate through all main pages — each loads from RSC cache (no network)
5. Open a recipe — loads with image from cache
6. Open shopping list — add an item ✓, check off an item ✓, reorder ✓, delete ✓, amber banner appears with count
7. Open calendar — create an event ✓, edit it ✓, delete it ✓
8. Open chores — complete a chore ✓
9. Open meal plan — assign a recipe to a slot ✓, remove it ✓
10. Remove Offline throttle — banner changes to "Syncing…" spinner then disappears
11. Verify: added items have real IDs, toggled items persisted — no duplicates
12. Repeat on iOS PWA (Added to Home Screen) to verify `online` event path
13. Open DevTools Console — confirm no unhandled errors during SW registration or sync
