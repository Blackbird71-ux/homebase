# Offline Support

**Implemented:** May 2026  
**Based on:** Memories app offline implementation (C:\Appdev\memories\docs\offline-support.md)

## Overview

Homebase works offline for the most common mobile use cases: checking items off the shopping list while in a supermarket, adding new items offline, and viewing the meal plan or recipes without a signal.

---

## Key lessons applied from Memories app

1. **Never cache RSC prefetch requests** (`Next-Router-Prefetch: 1`) — caching them causes stale payloads on real navigations, requiring a double-refresh to recover
2. **RSC responses stored under a `?__rsc_cache` key** — avoids URL collisions with full HTML cached for the same pathname
3. **Detect RSC fetches via `Next-Router-State-Tree` header** in addition to `RSC: 1`
4. **`warmNavCache()` on SW activation** — `/meal-plan`, `/recipes`, `/lists`, `/calendar`, `/notes`, `/contacts` are cached immediately so they work offline even before the user visits them in the current session. Each page is fetched **twice**: once as full HTML (for navigate fallback) and once as an RSC payload (`RSC: 1` header) stored under `?__rsc_cache`. Without the RSC warm fetch, client-side navigation offline receives HTML instead of an RSC payload, Next.js fails to parse it, and only the SSR default item renders (the "only Bunnings" bug).
5. **`credentials: 'include'` on warm fetches** — required for auth-protected routes
6. **`.catch(() => {})` on every `cache.put()`** — storage quota errors must not crash the fetch handler
7. **Background Sync delegates to clients** via `SYNC_REQUESTED` postMessage — avoids duplicating IndexedDB logic in the SW; client handles the actual replay and state update
8. **`visibilitychange` event** — catches the case where the SW Background Sync fires while the tab is backgrounded; flush happens when the user returns to the tab
9. **Lazy state initializers** instead of `setState` directly inside `useEffect` (OfflineBanner, AppShell)
10. **`offline.html` fallback** — shown for uncached pages instead of a broken blank screen

---

## Architecture

### Service Worker — Two-Cache Design

| Cache | Contents | Strategy |
|---|---|---|
| `homebase-shell-v5` | Page HTML, static assets (JS/CSS/images/fonts) | Network-first for navigation; cache-first for static |
| `homebase-api-v5` | API JSON responses + RSC payloads | Stale-while-revalidate for API; network-first for RSC |

### Fetch handler routing (top-to-bottom)

1. **API cache patterns** (`/api/meal-plan*`, `/api/recipes*`, `/api/lists*`, `/api/events*`, `/api/event-categories*`, `/api/ingredient-categories*`) — stale-while-revalidate. Note: pages that use server components with direct Prisma queries (lists, contacts, notes) get their data from the RSC/HTML cache, not from these API routes. The API routes are cached for components that fetch them client-side (e.g. `CalendarView` fetches `/api/events` when navigating months, `ShoppingList` fetches `/api/ingredient-categories` on mount).
2. **RSC fetches** (not prefetches) — network-first, stored under `?__rsc_cache` key
3. **Full navigation** (`mode: navigate`) — network-first, cached on success
4. **Static assets** — cache-first
5. **Everything else** — network only

### Shopping list mutations — IndexedDB queue

Queued in `homebase-offline-queue` IndexedDB (shared between client and SW context).

| Operation | Offline behaviour |
|---|---|
| Add item | Temp `tmp_<uuid>` ID, optimistic UI insert, queued POST |
| Toggle complete | Optimistic state flip, queued PATCH |
| Delete / reorder / category change | Online only — existing `toast.error` on failure |

### Sync triggers (three paths)

1. **`window online` event** — iOS/Safari fallback; runs immediately in React
2. **SW `SYNC_REQUESTED` message** — Chrome/Android Background Sync; SW notifies client
3. **`document visibilitychange`** (visible + online) — catches return from backgrounded state

After any sync: items are refetched from `GET /api/lists/[id]/items` to replace temp IDs with real server IDs and reconcile state.

---

## What works offline

| Feature | Offline behaviour |
|---|---|
| Shopping list — add item | Instant optimistic insert; syncs on reconnect |
| Shopping list — toggle complete | Instant optimistic update; syncs on reconnect |
| All lists — viewing | All lists and their items shown from cache (both full-page and sidebar nav) |
| Meal plan viewing | Last-visited week shown from cache |
| Meal plan other weeks | Only works if that week was visited while online |
| Recipe list | Full list shown from cache |
| Recipe detail | Any recipe detail page previously opened is available |
| Calendar (current ±1 month) | Events from server component cache; navigating months uses cached API response |
| Notes | All notes shown from cache |
| Contacts | All contacts shown from cache |

## What does NOT work offline

- Editing meal plan entries (fails with existing toast error)
- Editing / deleting recipes
- Shopping list delete, reorder, category change, lock
- Calendar / notes / contacts mutations (add, edit, delete)
- Chores, documents sections
- Navigating calendar beyond the cached month range
- Navigating to a meal plan week never loaded while online → shows cached fallback or offline.html

---

## Offline banner

`OfflineBanner` is mounted in `AppShell` and visible whenever:

| State | Message |
|---|---|
| Offline, no pending changes | "You're offline — shopping list changes will sync when you reconnect" |
| Offline, N pending changes | "Offline — N changes pending sync" |
| Online, syncing | "Syncing N changes…" (with spinner) |

Queue count is broadcast via `window.dispatchEvent(new CustomEvent('offline-queue-update', …))` from `ShoppingList` whenever the queue changes.

---

## Files

| File | Role |
|---|---|
| `public/sw.js` | Service worker: two-cache architecture, RSC caching, Background Sync, warmNavCache |
| `public/offline.html` | Fallback page for uncached navigation requests |
| `src/lib/offline-queue.ts` | IndexedDB queue: enqueue, getAll, remove, getQueueCount |
| `src/components/layout/OfflineBanner.tsx` | Offline status banner with pending count |
| `src/components/layout/AppShell.tsx` | Mounts OfflineBanner; lazy sidebar init |
| `src/components/lists/ShoppingList.tsx` | Offline-aware addItem/toggleItem; sync listeners |
| `src/app/layout.tsx` | SW registration via `<Script strategy="afterInteractive">` |

---

## Docker / NAS deployment

No schema changes. Standard redeploy:

```bash
docker-compose down && docker-compose up -d --build
```

Ensure `/sw.js` headers remain `no-cache` (already set in `next.config.ts`) so browsers always fetch the latest service worker version.

---

## Testing checklist

1. Chrome DevTools → Application → Service Workers — confirm `homebase-shell-v5` active, no errors
2. Visit `/meal-plan` and a few recipe pages while online
3. DevTools → Network → Offline
4. Click Meal Plan in sidebar — loads from RSC cache (no network)
5. Click a recipe — loads from cache
6. Open shopping list — add an item ✓, check off an item ✓, amber banner appears with count
7. Remove Offline throttle — banner changes to "Syncing…" spinner then disappears
8. Verify list: added item has real ID, toggled item persisted — no duplicates
9. Repeat steps 3–8 on iOS PWA (Added to Home Screen) to verify `online` event path
10. Open DevTools Console — confirm no unhandled errors during SW registration or sync
