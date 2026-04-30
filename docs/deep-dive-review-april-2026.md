# HomeBase — Deep Dive Code Review & Analysis
**Date:** April 30, 2026  
**Reviewer:** AI Code Review  
**Scope:** Full codebase — all pages, API routes, components, Prisma schema, and planning documents

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [What's Working Well](#2-whats-working-well)
3. [Critical Issues (Bugs)](#3-critical-issues-bugs)
4. [Moderate Issues](#4-moderate-issues)
5. [Minor Issues & Polish](#5-minor-issues--polish)
6. [Missing Features](#6-missing-features)
7. [Feature Wiring Verification](#7-feature-wiring-verification)
8. [Recommendations](#8-recommendations)

---

## 1. Architecture Overview

HomeBase is a Next.js family management app with the following architecture:

- **Framework:** Next.js (App Router) with TypeScript
- **Database:** SQLite via Prisma ORM
- **Auth:** NextAuth.js with credentials provider
- **UI:** shadcn/ui components + Tailwind CSS
- **Deployment:** Docker on Synology NAS

### Pattern Used Consistently
```
Server Page (data fetch) → Client Component (interactivity) → API Routes (mutations)
```

Each feature follows this pattern:
- `page.tsx` — Server component, calls `requireSession()`, fetches initial data via Prisma
- `*Client.tsx` — Client component, manages state, calls API routes for mutations
- `api/*/route.ts` — API routes, all guarded by `requireSession()`

---

## 2. What's Working Well

### Architecture & Structure
- ✅ **Clean separation** between server and client concerns
- ✅ **Consistent pattern** across all 9+ features
- ✅ **Proper Prisma relations** with indexes, cascade deletes, and unique constraints
- ✅ **Auth is solid** — `requireSession()` used consistently on every API route and page
- ✅ **TypeScript throughout** with proper interfaces and types
- ✅ **Good error handling** — most API routes return proper error responses with status codes

### Features Verified as Correctly Wired

| Feature | Server Page | Client Component | API Routes | UI State Mgmt | Notes |
|---|---|---|---|---|---|
| **Calendar/Events** | ✅ | ✅ | ✅ | ✅ | Recurrence expansion, Google sync, attendees |
| **Lists (Shopping/Todo)** | ✅ | ✅ | ✅ | ✅ | Reorder, categories, pricing, locking |
| **Recipes** | ✅ | ✅ | ✅ | ✅ | Tags (dual system), books, nutrition, import, scrape |
| **Meal Plan** | ✅ | ✅ | ✅ | ✅ | Templates, multi-recipe, export to groceries |
| **Chores** | ✅ | ✅ | ✅ | ✅ | Rotation, completion tracking, overdue indicators |
| **Contacts** | ✅ | ✅ | ✅ | ✅ | Categories, custom categories, click-to-call/email |
| **Notes** | ✅ | ✅ | ✅ | ✅ | Rich-text editor (WYSIWYG), note privacy (private/family), visibility filter |
| **Documents** | ✅ | ✅ | ✅ | ✅ | File upload, expiry tracking, category filtering |
| **Settings** | ✅ | ✅ | ✅ | ✅ | 11 tabs — all wired to API routes |
| **Dashboard** | ✅ | ✅ | ✅ | ✅ | Customisable cards, weekly summary, conditional data fetching |
| **Auth (Login/Register)** | ✅ | ✅ | ✅ | ✅ | Server actions, invite codes, registration flow |
| **Quick Add** | N/A | ✅ | ✅ | ✅ | Cmd+K, FAB, mobile bottom sheet, 4 action types |

### Specific Strengths Noted
- **Dashboard conditional fetching** — only queries data for visible cards (performance optimisation)
- **Meal plan template system** — full CRUD with save/apply/rename/delete
- **Chore rotation logic** — schedule-based and completion-based modes with auto-rotation
- **Tag migration** — dual system supporting both legacy comma-separated and new relational tags
- **Recurring event expansion** — server-side expansion with proper range handling
- **Google Calendar sync** — bidirectional sync with fire-and-forget pattern
- **Mobile responsiveness** — unified FAB bottom sheet, chip bar for lists, single-column dashboard

---

## 3. Critical Issues (Bugs)

### ~~🔴 Issue 1: `home/page.tsx` — `mealPlanTomorrowEnd` Copy-Paste Bug~~ ❌ NOT A BUG

**Verified:** Code is correct — `mealPlanTomorrowEnd` is already calculated from `mealPlanTomorrowStart`. No change needed.

---

### ✅ Issue 2 (Fixed): `QuickAdd.tsx` — Recipe Creation Always Fails

**File:** `src/components/layout/QuickAdd.tsx`  
**Lines:** 188-192

```typescript
const res = await fetch('/api/recipes', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: recipeTitle.trim() }),
})
```

**Problem:** The API route at `src/app/api/recipes/route.ts` (lines 201-206) requires both `ingredients` and `instructions` to be arrays:
```typescript
if (!title || !Array.isArray(ingredients) || !Array.isArray(instructions)) {
  return NextResponse.json(
    { error: 'title, ingredients (array), and instructions (array) are required' },
    { status: 400 }
  )
}
```

**Impact:** **Quick Add recipe creation always returns a 400 error.** The success toast is never shown, and the user is not redirected to the recipe detail page.

**Fix (applied):** Added `ingredients: [], instructions: []` to the POST body in `src/components/layout/QuickAdd.tsx`.

---

### ~~🔴 Issue 3: `ListsClient.tsx` — `handleSetDefault` Sends Wrong Preference Key~~ ❌ NOT A BUG

**File:** `src/app/(app)/lists/ListsClient.tsx`  
**Lines:** 100-115

```typescript
async function handleSetDefault(listId: string) {
  const list = listId ? lists.find((l) => l.id === listId) : null
  const uiPrefs: Record<string, string | null> = { defaultListId: listId || null }
  // Only update the dashboard shopping list preference when favoriting/unfavoriting a SHOPPING list
  if (list?.type === 'SHOPPING') {
    uiPrefs.dashboardShoppingListId = listId || null
  }
  const res = await fetch('/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uiPreferences: uiPrefs }),
  })
```

**Problem:** The key `defaultListId` is not a recognised preference key anywhere in the codebase. The settings API stores whatever is passed in `uiPreferences`, but no code reads `defaultListId` back. The only recognised key is `dashboardShoppingListId`.

**Impact:** **Favoriting a list doesn't actually persist the preference.** When the page reloads, the favourite/default list is lost.

**Verified:** `defaultListId` IS read in `src/app/(app)/lists/page.tsx` lines 26-35. No change needed.

---

## 4. Moderate Issues

### ✅ Issue 4 (Fixed): Weekly Summary Ignores User's `weekStartsOn` Preference

**File:** `src/app/(app)/home/page.tsx`  
**Lines:** 47-48

```typescript
const weekStart = startOfWeek(nowInTz, { weekStartsOn: 0 })
const weekEndDate = endOfWeek(nowInTz, { weekStartsOn: 0 })
```

**Problem:** Hardcoded `weekStartsOn: 0` (Sunday) ignores the user's `weekStartsOn` preference. The user object has `weekStartsOn` available but it's not passed to this function.

**Impact:** Users who prefer Monday-start weeks will see incorrect weekly summary boundaries.

**Fix (applied):** `getDashboardData` now accepts `weekStartsOn` as a parameter; call site passes `user.weekStartsOn`.

---

### 🟡 Issue 5: `nowInTz` Construction is Fragile

**File:** `src/app/(app)/home/page.tsx`  
**Line:** 46

```typescript
const nowInTz = new Date(new Intl.DateTimeFormat('en-US', { 
  timeZone: timezone, 
  year: 'numeric', month: '2-digit', day: '2-digit' 
}).format(new Date()))
```

**Problem:** Creating a `Date` from a formatted string (`"04/30/2026"`) relies on browser-specific parsing behaviour. While it works in most modern browsers, it's not guaranteed to be consistent.

**Impact:** Potential date calculation errors in edge cases or less common browsers.

**Fix:** Use a more robust approach — either use `date-fns-tz` or parse the formatted parts explicitly.

---

### ✅ Issue 6 (Fixed): Duplicated UTC Date Conversion Logic in `MealPlanGrid.tsx`

**File:** `src/components/meal-plan/MealPlanGrid.tsx`

The same UTC date conversion logic is duplicated in at least 4 places:
1. `navWeek()` — lines 101-119
2. `goToday()` — lines 137-155
3. `handleClearWeek()` — lines 243-261
4. `ApplyTemplateDialog` `onApplied` callback — lines 493-511

**Problem:** Each block is ~15 lines of identical date manipulation. If the date logic needs to change (e.g., timezone handling), it must be updated in all 4 places.

**Impact:** Maintenance risk — future changes are likely to miss one of the copies.

**Fix (applied):** Extracted into `weekDateRange(weekStart: Date): { from: string; to: string }` at the top of `MealPlanGrid.tsx`; all four call sites replaced.

---

### ✅ Issue 7 (Fixed): Contact Deletion Has No Confirmation

**File:** `src/app/(app)/contacts/ContactsClient.tsx`  
**Lines:** 179-188

```typescript
async function handleDelete(id: string) {
  try {
    const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to delete')
    setContacts((prev) => prev.filter((c) => c.id !== id))
    toast.success('Contact deleted')
  } catch {
    toast.error('Failed to delete contact')
  }
}
```

**Problem:** Unlike recipes and lists (which use `confirm()`), contacts are deleted immediately with no confirmation dialog.

**Impact:** Accidental data loss — a single mis-click can delete a contact permanently.

**Fix (applied):** `handleDelete` now accepts `name` and calls `confirm('Delete "${name}"? ...')` before proceeding.

---

### ✅ Issue 8 (Fixed): `DocumentsPage.tsx` — No Error State for Initial Fetch

**File:** `src/app/(app)/documents/page.tsx`  
**Lines:** 42-58

```typescript
const fetchDocuments = useCallback(async () => {
  setLoading(true)
  try {
    // ... fetch
    const data = await res.json()
    setDocuments(data)
  } catch {
    toast.error('Failed to load documents')
  } finally {
    setLoading(false)
  }
}, [categoryFilter, showExpiringOnly])
```

**Problem:** If the initial fetch fails, the page shows "No documents found" with an "Upload Document" button — which is misleading. The user doesn't know there was an error.

**Impact:** Poor UX — users may think they have no documents when there's actually a server error.

**Fix (applied):** Added `fetchError` state; on failure shows an error panel with a "Try again" button instead of the misleading empty state.

---

### 🟡 Issue 9: `ChoresClient.tsx` — `handleComplete` Assumes Response Shape

**File:** `src/app/(app)/chores/ChoresClient.tsx`  
**Lines:** 79-105

```typescript
const data = await res.json()
setChores((prev) =>
  prev.map((c) =>
    c.id === choreId
      ? {
          ...c,
          ...data.chore,
          completions: [data.completion, ...c.completions],
          _count: { completions: c._count.completions + 1 },
        }
      : c
  )
)
```

**Problem:** The code destructures `data.chore` and `data.completion` from the response. If the API route at `chores/[id]/complete/route.ts` returns a different shape, this will silently fail (spreading `undefined` into the state).

**Impact:** Potential silent data corruption if the API response format changes.

**Fix:** Verify the API response shape matches, or add defensive checks.

---

## 5. Minor Issues & Polish

### 🟢 Issue 10: `NotesClient.tsx` — `tagFilter` Initial State Inconsistency

**File:** `src/app/(app)/notes/NotesClient.tsx`  
**Line:** 34

```typescript
const [tagFilter, setTagFilter] = useState<string | null>('')
```

The initial state is `''` (empty string) but the type is `string | null`. The Select component's `onValueChange` sets it to `''` for "All tags", but the filter logic checks `if (tagFilter)` which is falsy for `''`. This works but is fragile and confusing.

---

### 🟢 Issue 11: `RecipesClient.tsx` — Uses `confirm()` Instead of Modal

**File:** `src/app/(app)/recipes/RecipesClient.tsx`  
**Line:** 98

```typescript
if (!confirm(`Delete "${recipe.title}"? This cannot be undone.`)) return
```

Consistency issue — the meal plan "Clear Week" uses a proper Dialog component, but recipe deletion uses the browser's native `confirm()`. Consider standardising.

---

### 🟢 Issue 12: `QuickAdd.tsx` — Type Cast on `inputRef`

**File:** `src/components/layout/QuickAdd.tsx`  
**Line:** 375

```typescript
ref={inputRef as React.Ref<HTMLInputElement>}
```

This type cast suggests a type mismatch. The `inputRef` is typed as `RefObject<HTMLInputElement>` but the `Input` component expects `Ref<HTMLInputElement>`. Should be fixed properly rather than casting.

---

### 🟢 Issue 13: `MealPlanGrid.tsx` — `handleClearWeek` UTC String Comparison

**File:** `src/components/meal-plan/MealPlanGrid.tsx`  
**Lines:** 270-274

```typescript
setEntries((prev) => prev.filter((e) => {
  const entryDateStr = e.date.slice(0, 10)
  return entryDateStr < from || entryDateStr > to
}))
```

Comparing date strings from ISO format against UTC date strings. This could mismatch for entries near midnight boundaries due to timezone differences between storage (UTC) and display (local).

---

### 🟢 Issue 14: `MealPlanGrid.tsx` — `handleClear` No Error Revert

**File:** `src/components/meal-plan/MealPlanGrid.tsx`  
**Lines:** 203-210

```typescript
async function handleClear(entryId: string) {
  const res = await fetch(`/api/meal-plan/${entryId}`, { method: 'DELETE' })
  if (res.ok) {
    setEntries((prev) => prev.filter((e) => e.id !== entryId))
  } else {
    toast.error('Failed to clear meal. Please try again.')
  }
}
```

No optimistic update is applied (which is fine), but if the API fails, the entry remains in the list. The error toast is the only feedback. Consider adding retry logic.

---

## 6. Missing Features

Based on the backlog docs (`homebase-backlog-build-plans.md` and `homebase-feature-suggestions-and-plans.md`) and codebase review:

### High Priority

| Feature | Schema Ready? | API Ready? | UI Ready? | Notes |
|---|---|---|---|---|
| **Offline PWA / Background Sync** | ❌ No queue model | ❌ | ❌ | Service worker exists but no offline queue. Critical for supermarket use. |
| ~~**Push Notifications**~~ | ✅ | ✅ Already implemented | ✅ `NotificationSettings.tsx` exists | **Verified: fully implemented.** API at `/api/push-subscriptions`, UI in Settings → Notifications. |

### Medium Priority

| Feature | Schema Ready? | API Ready? | UI Ready? | Notes |
|---|---|---|---|---|
| **Budgeting Module** | ❌ No models exist | ❌ | ❌ | Not started. High effort. |
| **Recipe Scaling** | ✅ No schema changes needed | N/A | ❌ No UI on recipe detail page | Low effort — pure UI work. |
| ~~**Shopping List Price Totals**~~ | ✅ | ✅ | ✅ `CategoryGroup.tsx` shows subtotals | **Verified: fully implemented.** Per-category subtotals rendered in `src/components/lists/CategoryGroup.tsx`. |

### Low Priority / Polish

| Feature | Schema Ready? | API Ready? | UI Ready? | Notes |
|---|---|---|---|---|
| **Birthday/Anniversary Banner** | ✅ Via recurring events | ✅ | ❌ No "Special date" toggle in EventModal | Low effort. |
| ~~**Event Attendance UI**~~ | ✅ | ✅ | ✅ `EventAttendeePanel` in `EventModal` | **Verified: fully implemented.** `EventAttendeePanel` is imported and rendered in `src/components/calendar/EventModal.tsx`. |
| **Automated DB Backups** | ❌ No backup model | ❌ | ❌ | Low effort — filesystem operations. |

---

## 7. Feature Wiring Verification

### Calendar / Events
- **Page:** `src/app/(app)/calendar/page.tsx` — fetches events, passes to `CalendarView`
- **Client:** `CalendarView.tsx` — month/week views, event modal, refresh callback
- **API GET:** `/api/events` — fetches events with recurrence expansion, masks personal events
- **API POST:** `/api/events` — creates event, pushes to Google Calendar
- **API PUT:** `/api/events/[id]` — updates event, validates permissions for personal events
- **API DELETE:** `/api/events/[id]` — deletes event or series, cleans up Google Calendar sync
- **Status:** ✅ Fully wired

### Lists (Shopping / Todo)
- **Page:** `src/app/(app)/lists/page.tsx` — fetches lists with items, passes to `ListsClient`
- **Client:** `ListsClient.tsx` — list selector, shopping/todo views, reorder, delete
- **API GET:** `/api/lists` — fetches active lists with pending item counts
- **API POST:** `/api/lists` — creates new list
- **API PATCH:** `/api/lists/[id]` — updates list name/active status
- **API DELETE:** `/api/lists/[id]` — deletes list
- **API:** `/api/lists/[id]/items` — CRUD for list items
- **API:** `/api/lists/reorder` — batch update sort orders
- **Status:** ✅ Fully wired (with noted bug in `handleSetDefault`)

### Recipes
- **Page:** `src/app/(app)/recipes/page.tsx` — fetches recipes with tags and books
- **Client:** `RecipesClient.tsx` — search, tag filter, book filter, CRUD
- **API GET:** `/api/recipes` — fetches with tag/book filtering, dual tag system support
- **API POST:** `/api/recipes` — creates with tag processing (ID or name)
- **API:** `/api/recipes/[id]` — GET/PUT/DELETE individual recipe
- **API:** `/api/recipes/import` — bulk import
- **API:** `/api/recipes/scrape` — URL scraping
- **API:** `/api/recipes/upload` — image upload
- **Status:** ✅ Fully wired (with noted bug in Quick Add recipe creation)

### Meal Plan
- **Page:** `src/app/(app)/meal-plan/page.tsx` — fetches week's entries with recipes
- **Client:** `MealPlanGrid.tsx` — week navigation, assign/clear meals, templates, export
- **API GET:** `/api/meal-plan` — fetches by date range with recipe data
- **API POST:** `/api/meal-plan` — upsert with multi-recipe support
- **API DELETE:** `/api/meal-plan/[id]` — delete single entry
- **API DELETE:** `/api/meal-plan/bulk` — clear week by date range
- **API:** `/api/meal-plan/templates` — CRUD for templates
- **API:** `/api/meal-plan/export-groceries` — export to shopping list
- **Status:** ✅ Fully wired

### Chores
- **Page:** `src/app/(app)/chores/page.tsx` — fetches chores with assignee and completions
- **Client:** `ChoresClient.tsx` — complete, rotate, delete, dialog
- **API GET:** `/api/chores` — fetches active chores
- **API POST:** `/api/chores` — creates with due date calculation
- **API:** `/api/chores/[id]` — PATCH/DELETE
- **API:** `/api/chores/[id]/complete` — mark complete, recalculate next due
- **API:** `/api/chores/[id]/rotate` — rotate assignee
- **Status:** ✅ Fully wired

### Contacts
- **Page:** `src/app/(app)/contacts/page.tsx` — fetches contacts
- **Client:** `ContactsClient.tsx` — grouped by category, CRUD with dialog
- **API GET:** `/api/contacts` — fetches all family contacts
- **API POST:** `/api/contacts` — creates contact
- **API:** `/api/contacts/[id]` — PATCH/DELETE
- **Status:** ✅ Fully wired (missing delete confirmation)

### Notes
- **Page:** `src/app/(app)/notes/page.tsx` — fetches notes with categories, passes `currentUserId`
- **Client:** `NotesClient.tsx` — search, category/tag/visibility filter, CRUD with editor dialog, private/family badge
- **Detail:** `src/app/(app)/notes/[id]/NoteDetail.tsx` — full note view with edit/delete, privacy badge
- **Editor:** `src/components/notes/NoteEditor.tsx` — rich-text WYSIWYG (bold, italic, underline, strikethrough, H1–H3, ordered/unordered lists, alignment, font size, links, text colour, highlight colour, clear formatting), tag input, private/family toggle
- **Card:** `src/components/notes/NoteCard.tsx` — displays privacy badge (Private / Family)
- **API GET:** `/api/notes` — fetches with search/category/tag/visibility filtering, `isPrivate` respected
- **API POST:** `/api/notes` — creates note with `isPrivate` support
- **API:** `/api/notes/[id]` — PUT/DELETE with `isPrivate` support
- **Schema:** `Note.isPrivate Boolean @default(false)` — migration `20260430000001_add_note_privacy`
- **Status:** ✅ Fully wired — richtext editor + note privacy added April 2026

### Documents
- **Page:** `src/app/(app)/documents/page.tsx` — client-side fetch with filters
- **Client:** Inline in page — search, category filter, expiring soon toggle
- **API:** `/api/documents` — GET/POST with file upload
- **API:** `/api/documents/[id]` — GET/PATCH/DELETE
- **Status:** ✅ Fully wired — error state with retry button added April 2026

### Settings
- **Page:** `src/app/(app)/settings/page.tsx` — 11 tabs, fetches user + cozi imports
- **Tabs:** Account, Appearance, Integrations, Data, Import, Tags, Categories, Event Categories, Ingredient Mappings, Notifications, Activity Log
- **Status:** ✅ Fully wired

### Dashboard
- **Page:** `src/app/(app)/home/page.tsx` — conditional data fetching per visible card
- **Client:** `HomeClient.tsx` — customiser dialog, card management
- **Grid:** `DashboardGrid.tsx` — renders visible cards in order
- **Cards:** Weekly Summary, Upcoming Events, Today's Meals, Tomorrow's Meals, Shopping List, To-Do Summary
- **Status:** ✅ Fully wired (with noted bugs in date calculations)

---

## 8. Recommendations

### Must Fix (Bugs)
1. ~~**Fix `mealPlanTomorrowEnd`**~~ — **not a bug**, code was already correct
2. ✅ **Fixed Quick Add recipe creation** — added empty `ingredients` and `instructions` arrays
3. ~~**Fix `ListsClient.tsx` `handleSetDefault`**~~ — **not a bug**, `defaultListId` is read in `lists/page.tsx`

### Should Fix (Reliability)
4. ✅ **Fixed: Extract UTC date conversion** — `weekDateRange()` utility in `MealPlanGrid.tsx`
5. ✅ **Fixed: Confirmation dialog** for contact deletion
6. ✅ **Fixed: `user.weekStartsOn`** now passed to weekly summary computation
7. ✅ **Fixed: Error state** added to document page with retry button
8. **Verify `ChoresClient` response shape** — verified: API returns `{ chore, completion }` and client matches

### Nice to Have (Polish)
9. Standardise delete confirmations across all features (modal vs `confirm()`)
10. Add loading skeletons to pages missing them
11. Clean up type casts in QuickAdd
12. Fix `tagFilter` initial state in NotesClient

### Feature Gaps to Consider
13. **Offline support for shopping lists** — highest value missing feature for supermarket use
14. ~~**Push notification subscription UI**~~ — already fully implemented
15. **Recipe scaling on detail pages** — low effort, high value for cooking
16. ~~**Shopping list price totals**~~ — already fully implemented in `CategoryGroup.tsx`

---

---

## 9. Changes Implemented (April 30, 2026)

### Features Added
- **Rich-text note editor** — `NoteEditor.tsx` rewritten as a WYSIWYG editor using `contentEditable` with toolbar: bold, italic, underline, strikethrough, H1/H2/H3, ordered/unordered lists, text alignment, font sizes, hyperlinks
- **Note privacy** — `isPrivate` field added to `Note` schema (migration `20260430000001_add_note_privacy`); notes are tagged Private/Family throughout the UI (`NoteCard`, `NoteDetail`, `NotesClient` visibility filter)

### Bugs Fixed
- **QuickAdd recipe creation** (`src/components/layout/QuickAdd.tsx`) — POST now includes `ingredients: [], instructions: []`
- **Weekly summary week boundary** (`src/app/(app)/home/page.tsx`) — `user.weekStartsOn` now passed to `startOfWeek`/`endOfWeek`
- **Contact deletion confirmation** (`src/app/(app)/contacts/ContactsClient.tsx`) — `confirm()` dialog added before delete
- **Documents error state** (`src/app/(app)/documents/page.tsx`) — `fetchError` state with "Try again" button replaces misleading empty state on server error
- **MealPlanGrid UTC duplication** (`src/components/meal-plan/MealPlanGrid.tsx`) — four identical ~15-line blocks replaced with `weekDateRange()` utility

### Infrastructure
- **Dockerfile** — 4-stage build: `deps → builder → pruner → runner`. New `pruner` stage installs clean production-only dependencies, eliminating the need to manually enumerate `serverExternalPackages`. Better comments and consistent formatting.
- **docker-compose.yml** — Added `healthcheck` (polls `/api/health` every 30s), annotated volume mounts, environment variables moved above volumes for readability
- **docker/entrypoint.sh** — Full rewrite with numbered steps (1–6), pre-migration backups now written to `/data/backups/` (not root `/data/`), strict migration error handling (exits cleanly with diagnostics instead of falling back to `db push`), database health check via `sqlite3` CLI, daily backup cron runs as `nextjs` user via `su-exec`

---

*Generated from codebase review of `C:\Appdev\HomeBase` — April 30, 2026*  
*Updated with verification results and implementation log — April 30, 2026*
