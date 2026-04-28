# HomeBase — Feature Suggestions & Build Plans
**Generated:** April 2026  
**App version:** 2.0 / Phase 7 complete  
**Status:** Planning document

---

## Table of Contents

1. [Full Feature Suggestions Summary](#1-full-feature-suggestions-summary)
2. [Priority Build Plans](#2-priority-build-plans)
   - [P1 — Mobile Responsiveness](#p1--mobile-responsiveness)
   - [P2 — Birthdays & Anniversaries](#p2--birthdays--anniversaries)
   - [P3 — Event Attendance & RSVP](#p3--event-attendance--rsvp)
   - [P4 — Recipe Nutritional Display](#p4--recipe-nutritional-display)
   - [P5 — Dashboard Customisation](#p5--dashboard-customisation)
3. [Backlog Feature Ideas](#3-backlog-feature-ideas)

---

## 1. Full Feature Suggestions Summary

### New Features

| Feature | Description | Effort | Status |
|---|---|---|---|
| Weekly family summary | Digest view on Home — this week's events, meals, and pending to-dos at a glance | Medium | ✅ Done |
| Chore / task roster | Assign recurring chores to family members with rotation schedule and completion tracking | Medium | ✅ Done |
| Household contacts | Family address book for doctors, schools, tradespeople, emergency services | Low | ✅ Done |
| Document vault | Store household documents (insurance, warranties, passports) with expiry reminders | High | ✅ Done |
| Budgeting module | Track household spending by category; complements shopping lists and recipe cost data | High | |
| Push notifications | VAPID + service worker already in place — add subscription store and preferences UI | Medium | ✅ Done |

### Enhancements to Existing Features

| Feature | Description | Effort | Status |
|---|---|---|---|
| Meal plan templates | Save a week's meal plan as a named template and re-apply in future weeks | Medium | ✅ Done |
| Recipe scaling | Multiply/halve ingredient quantities when viewing a recipe | Low | ✅ Done |
| Shopping list price estimates | Optional unit price field on ListItem for estimating shop cost | Low | ✅ Done |
| Recipe nutritional display | Nutrition data (calories, fat, protein, carbs, sodium) already in schema — needs a display panel | **Very Low** | ✅ Done |
| Event attendance / RSVP | Mark which family members are attending an event | Low | ✅ Done |
| Shopping list subtotals by category | Item counts and optional price subtotals per category group | Low | ✅ Done |

### UX & Quality of Life

| Feature | Description | Effort | Status |
|---|---|---|---|
| Mobile responsiveness | Unified FAB nav+quick-add bottom sheet, full-width list view with chip selector | Medium | ✅ Done |
| Dashboard customisation | Show/hide and reorder Home cards per user via existing `uiPreferences` JSON | Low | ✅ Done |
| Quick-add from anywhere | Floating action button or Cmd+K palette to add events/items without navigating | Medium | ✅ Done |
| Birthdays & anniversaries | Dedicated recurring event type with calendar banner and Home dashboard reminder | Low | ✅ Done |

### Infrastructure & Developer Experience

| Feature | Description | Effort | Status |
|---|---|---|---|
| Background sync (offline PWA) | Queue mutations offline and replay on reconnect using existing service worker | High | |
| Family activity log | Lightweight audit trail of changes with undo support | Medium | ✅ Done |
| Automated DB backups | Cron job in Docker to snapshot SQLite to NAS volume with restore UI in Settings | Low | ✅ Done |

---

## 2. Priority Build Plans

---

### P1 — Mobile Responsiveness ✅ Done

**Goal:** Make HomeBase comfortable to use on a phone — the primary on-the-go access pattern for family members checking lists, meals, and events away from home.

**Implemented approach:** Replaced the multi-pattern mobile nav (hamburger slide-in + bottom tab bar) with a single unified FAB that serves as both the navigation hub and the quick-add entry point. The lists page sidebar is hidden on mobile and replaced with a horizontally-scrollable chip bar.

#### What was built

1. **Unified FAB bottom sheet** — a single `+` button (bottom-right, fixed) opens a slide-up bottom sheet containing:
   - **Quick Add** section: 2-column grid for Event / List / Recipe / Note
   - **Navigate** section: 3-column grid for all 9 sections (Home, Calendar, Lists, Chores, Contacts, Recipes, Meals, Notes, Settings) + Sign out
   - Active page is highlighted in the nav grid
2. **Single-column dashboard** — `DashboardGrid` uses `grid-cols-1 md:grid-cols-2`; renders correctly on mobile.
3. **List view** — 200px sidebar hidden on mobile (`hidden md:block`); replaced with a horizontally-scrollable chip bar showing all list names. Full screen width used for list content. Mobile padding tightened to `p-4`.
4. **AppShell simplified** — removed hamburger button, mobile top bar, slide-in drawer, and bottom tab bar. Shell is now: desktop sidebar + content area + QuickAdd FAB.

#### Files modified

| File | Change |
|---|---|
| `src/components/layout/AppShell.tsx` | Removed hamburger/slide-in nav and bottom tab bar; simplified to Sidebar + content + QuickAdd |
| `src/components/layout/QuickAdd.tsx` | Mobile FAB now opens bottom sheet with nav grid + quick-add grid; desktop unchanged |
| `src/app/(app)/lists/ListsClient.tsx` | Mobile chip bar replaces the 200px aside on small screens |
| `src/components/layout/MobileNav.tsx` | **Deleted** — absorbed into QuickAdd bottom sheet |

#### No schema changes required.

#### Docker / NAS impact

None — purely frontend changes. Standard `docker-compose down && docker-compose up -d --build` on NAS after deploying.

#### Acceptance criteria

- [x] App is fully usable on a 375px viewport with no horizontal overflow
- [x] All interactive elements have minimum 44px tap targets
- [x] FAB nav correctly highlights the active section
- [x] All 9 sections + sign-out accessible from the mobile FAB
- [x] Lists page shows full-width content on mobile (chip bar for list switching)
- [x] No regressions on desktop (1280px+)
- [ ] Meal planner day-scroll view on mobile (backlog)
- [ ] Calendar week view scrollable or day-list fallback on mobile (backlog)

---

### P2 — Birthdays & Anniversaries

**Goal:** Give families a dedicated way to track birthdays and anniversaries — shown as a visual banner on the calendar and as a day-of reminder on the Home dashboard.

**Current state:** The calendar supports recurring events (including yearly), and the `EventCategory` model supports custom categories with colours. Birthdays could technically be added as yearly recurring events today, but there's no visual distinction, no dashboard banner, and no dedicated input flow.

#### Scope

1. **Seed two system EventCategories** — `Birthday` (pink) and `Anniversary` (amber) with `isSystem: true`.
2. **"Special date" event type** — when creating/editing an event, a "Birthday / Anniversary" toggle auto-sets the recurrence to `FREQ=YEARLY`, hides less-relevant fields (description, end time), and pre-selects the right category.
3. **Calendar banner** — on the day of a birthday/anniversary in month and week views, show a small coloured banner/pill above the event slot.
4. **Home dashboard banner** — if today or tomorrow has a birthday/anniversary event, show a dedicated highlight card at the top of the dashboard (above the meals cards).
5. **Settings** — Birthday and Anniversary categories are visible in Event Categories settings but marked as system (not deletable, colour editable).

#### Schema changes

No new models required. The existing `Event` model with `recurrenceRule`, `category`, and `isRecurring` handles everything. Seed the two EventCategories in the migration or entrypoint script.

```sql
-- Add seed data for Birthday and Anniversary categories if not present
INSERT OR IGNORE INTO EventCategory (id, name, color, isSystem, sortOrder, familyId, createdAt)
SELECT cuid(), 'Birthday', '#EC4899', 1, 0, id, datetime('now') FROM Family;

INSERT OR IGNORE INTO EventCategory (id, name, color, isSystem, sortOrder, familyId, createdAt)
SELECT cuid(), 'Anniversary', '#F59E0B', 1, 1, id, datetime('now') FROM Family;
```

This seed should run in `docker/entrypoint.sh` after `prisma migrate deploy` so existing families get the categories on next deploy.

#### Files to create / modify

| File | Change |
|---|---|
| `docker/entrypoint.sh` | Add seed SQL for Birthday/Anniversary EventCategories |
| `src/components/calendar/EventModal.tsx` | Add "Special date" toggle; auto-set yearly recurrence + category |
| `src/components/calendar/MonthView.tsx` | Render banner pill for birthday/anniversary events |
| `src/components/calendar/WeekView.tsx` | Same banner treatment |
| `src/components/dashboard/BirthdayBannerCard.tsx` | New — Home dashboard highlight card |
| `src/components/dashboard/DashboardGrid.tsx` | Conditionally render `<BirthdayBannerCard>` at top |
| `src/app/(app)/home/page.tsx` | Query today+tomorrow events filtered by Birthday/Anniversary category |
| `src/app/api/dashboard/route.ts` | Include birthday/anniversary events in dashboard response |
| `src/types/index.ts` | Add `birthdayEvents` to `DashboardData` type |

#### Implementation notes

- The "Special date" toggle in EventModal sets `recurrenceRule = 'FREQ=YEARLY'`, `recurrenceEndDate = null`, `isRecurring = true`, and hides the end-date/time fields.
- The calendar banner: check if `event.category === 'Birthday' || event.category === 'Anniversary'` and render a coloured pill (`🎂` or `💍` emoji optional — or a small Lucide icon).
- The dashboard banner card: query events where `category IN ('Birthday', 'Anniversary')` and the recurring expansion falls on today or tomorrow. Use the same `todayBoundsInTz` / timezone logic already in `home/page.tsx`.
- Age calculation (optional): if the event title includes a birth year (e.g. "Sarah — 1990"), parse it and display "turns 36 today".

#### Docker / NAS impact

`entrypoint.sh` updated — **copy to NAS before redeploying**. The seed SQL uses `INSERT OR IGNORE` so it is safe to run multiple times.

#### Acceptance criteria

- [ ] Creating a "Birthday" event auto-sets yearly recurrence and Birthday category
- [ ] Birthday/Anniversary events show a coloured banner in month and week calendar views
- [ ] Home dashboard shows a highlight card when a birthday or anniversary is today or tomorrow
- [ ] Existing recurring events are unaffected
- [ ] Birthday/Anniversary appear in Event Categories settings but cannot be deleted

---

### P3 — Event Attendance & RSVP

**Goal:** Track which family members are attending an event — useful for school pickups, appointments, and social plans where coordination matters.

**Current state:** Events have `createdBy` (a user ID string) but no attendee relationship. All events are family-scoped with no per-user participation tracking.

#### Scope

1. **New `EventAttendee` model** — links an event to a user with an RSVP status (`going`, `maybe`, `declined`, `invited`).
2. **EventModal UI** — a family member picker shown when creating/editing an event. Each member has a status toggle.
3. **Calendar view** — events show small avatar initials for attending members.
4. **Home dashboard** — upcoming events card shows attendee avatars.
5. **My events filter** — optional filter in calendar to show only events the current user is attending.

#### Schema changes

```prisma
model EventAttendee {
  id        String   @id @default(cuid())
  eventId   String
  userId    String
  status    String   @default("invited")  // going | maybe | declined | invited
  createdAt DateTime @default(now())

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId],  references: [id], onDelete: Cascade)

  @@unique([eventId, userId])
  @@index([eventId])
  @@index([userId])
}
```

Add `attendees EventAttendee[]` relation to the `Event` model and `eventAttendances EventAttendee[]` to `User`.

Migration filename suggestion: `add_event_attendees`

#### API changes

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/events/[id]/attendees` | GET | List attendees for an event |
| `/api/events/[id]/attendees` | POST | Add/update attendee status |
| `/api/events/[id]/attendees/[userId]` | DELETE | Remove attendee |

The existing `GET /api/events` and event detail queries should include `attendees: { include: { user: { select: { id, name } } } }`.

#### Files to create / modify

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `EventAttendee` model; update `Event` and `User` relations |
| `prisma/migrations/*/migration.sql` | New migration |
| `docker/entrypoint.sh` | No changes — migration runs automatically |
| `src/app/api/events/[id]/attendees/route.ts` | New — GET + POST handlers |
| `src/app/api/events/[id]/attendees/[userId]/route.ts` | New — DELETE handler |
| `src/components/calendar/EventModal.tsx` | Add family member picker with RSVP status per member |
| `src/components/calendar/EventCard.tsx` | Show attendee avatar row (initials circles) |
| `src/components/dashboard/UpcomingEventsCard.tsx` | Show attendee avatars on each event row |
| `src/components/calendar/AttendeeSelector.tsx` | New — reusable family member multi-select with status |
| `src/types/index.ts` | Add `EventAttendee` type; extend event types |

#### Implementation notes

- Attendee picker: fetch family members from `/api/family/members` (already exists). Show each as a checkbox row with a status dropdown (`Going / Maybe / Can't make it`).
- Avatar initials: take first letter of first and last name, display in a 24px circle coloured by a deterministic hash of the user ID (so each family member always has the same colour).
- Keep the attendee feature optional — events with no attendees set behave exactly as today.
- "My events" filter: add a toggle to the calendar toolbar that filters `events.attendees.some(a => a.userId === currentUserId && a.status !== 'declined')`.
- For recurring events, attendees are per-series (on the base event) not per-instance, for simplicity.

#### Docker / NAS impact

Schema migration — **run `docker-compose down && docker-compose up -d --build` on NAS**. Migration runs automatically via `prisma migrate deploy` in entrypoint.

#### Acceptance criteria

- [ ] Family members can be added to an event with a status in the EventModal
- [ ] Attendee avatars appear on event cards in the calendar
- [ ] Attendee avatars appear on the Home upcoming events card
- [ ] Existing events with no attendees are unaffected
- [ ] RSVP status can be updated after event creation
- [ ] Deleting an event also removes its attendee records (cascade)

---

### P4 — Recipe Nutritional Display

**Goal:** Surface the nutrition data that's already stored on recipes. This is the lowest-effort priority item — zero schema changes, pure UI work.

**Current state:** `Recipe` model already has `calories`, `fatContent`, `proteinContent`, `carbContent`, and `sodiumContent` fields (all `String?`). These are populated when recipes are imported from URLs but are never displayed to the user.

#### Scope

1. **Nutrition panel on recipe detail page** — a compact panel showing the 5 nutrients in a visual layout (similar to a simplified nutrition label).
2. **Nutrition summary on recipe cards** — optionally show calorie count as a small badge on recipe list/grid cards.
3. **Recipe form** — ensure the 5 nutrition fields are editable when creating/editing recipes manually (they may already be in the form — confirm and add if missing).
4. **Meal planner tooltip** — show calorie count on hover of a planned meal.

#### No schema changes required.

#### Files modified

| File | Change |
|---|---|
| `src/components/recipes/RecipeDetail.tsx` | Added `<NutritionPanel>` component below the Notes section |
| `src/components/recipes/NutritionPanel.tsx` | New — displays the 5 nutrients in a styled panel |
| `src/components/recipes/RecipeCard.tsx` | Added optional calorie badge if `calories` is set |
| `src/components/recipes/RecipeForm.tsx` | Added collapsible "Nutritional information (optional)" section with 5 text inputs |
| `src/app/(app)/recipes/[id]/page.tsx` | Confirmed nutrition fields are included in the recipe query |
| `src/app/api/recipes/[id]/route.ts` | Confirmed nutrition fields are returned in GET and handled in PUT |
| `src/app/api/recipes/route.ts` | Added nutrition fields to POST create handler |
| `src/app/(app)/recipes/RecipesClient.tsx` | Added `calories` to recipe queries for card display |
| `src/app/(app)/recipes/page.tsx` | Added `calories` to recipe data fetching |

#### NutritionPanel component design

```tsx
// Compact 5-nutrient panel
// Shows: Calories | Fat | Protein | Carbs | Sodium
// Each as a labelled stat block in a horizontal row
// Only renders if at least one value is present
// Handles string values like "320 kcal", "12g", etc.
```

The panel should:
- Only render if at least one of the 5 fields is non-null and non-empty.
- Parse the string values leniently (they come from web scraping and vary in format: "320 kcal", "320", "12g", "12 g").
- Show a "Per serving" label if `servings` is set.
- Use the existing card styling (white bg, border, border-radius-lg).

#### Implementation notes

- Nutrient values are stored as raw strings from the scraper (e.g. `"320 kcal"`, `"12g fat"`). Display them as-is with a label, rather than trying to parse to numbers — avoids issues with inconsistent formats.
- If all 5 fields are null/empty, the panel simply doesn't render — no empty state needed.
- The calorie badge on recipe cards: small `text-xs` muted badge, only shown if `calories` is truthy. Doesn't need to be precise — just the value string.
- Recipe form: add a collapsible "Nutritional information (optional)" section with 5 text inputs, positioned below the recipe Notes field.

#### Docker / NAS impact

No schema changes. Standard redeploy: `docker-compose down && docker-compose up -d --build`.

#### Acceptance criteria

- [ ] Recipe detail page shows a nutrition panel when any nutrition data is present
- [ ] Panel is hidden when all nutrition fields are empty/null
- [ ] Recipe cards show a calorie badge when `calories` is set
- [ ] Recipe form includes editable fields for all 5 nutrition values
- [ ] Manually entered nutrition data is saved and displayed correctly
- [ ] Imported recipes that already have nutrition data now display it

---

### P5 — Dashboard Customisation

**Goal:** Let each family member choose which cards appear on their Home dashboard and in what order, persisted to their existing `uiPreferences` JSON field.

**Current state:** The dashboard always shows 5 fixed cards: Upcoming Events, Today's Meals, Tomorrow's Meals, Shopping List, To-Do Summary. The order and visibility are hardcoded in `DashboardGrid.tsx`. The `User.uiPreferences` JSON field already exists and is used for `dashboardShoppingListId`.

#### Scope

1. **Per-user card visibility and order** — stored in `uiPreferences.dashboardCards` as an ordered array of card IDs with `visible: boolean`.
2. **Customise UI** — a "Customise dashboard" button/link on the Home page (or in Appearance settings) opens a drag-and-drop card manager.
3. **DashboardGrid renders from preferences** — instead of a hardcoded list, it reads the user's card order/visibility.
4. **Default config** — users with no `dashboardCards` preference get the current default layout (all 5 cards visible in the existing order).

#### Card registry

Define a `DASHBOARD_CARDS` constant:

```ts
export const DASHBOARD_CARDS = [
  { id: 'upcoming-events',  label: 'Upcoming Events',  defaultVisible: true  },
  { id: 'todays-meals',     label: "Today's Meals",    defaultVisible: true  },
  { id: 'tomorrows-meals',  label: "Tomorrow's Meals", defaultVisible: true  },
  { id: 'shopping-list',    label: 'Shopping List',    defaultVisible: true  },
  { id: 'todo-summary',     label: 'To-Do Summary',    defaultVisible: true  },
  // Future cards can be added here without changing the grid component
]
```

#### `uiPreferences` schema addition

Add to the existing JSON object (no migration needed):

```json
{
  "dashboardShoppingListId": "...",
  "dashboardCards": [
    { "id": "upcoming-events",  "visible": true,  "order": 0 },
    { "id": "todays-meals",     "visible": true,  "order": 1 },
    { "id": "tomorrows-meals",  "visible": false, "order": 2 },
    { "id": "shopping-list",    "visible": true,  "order": 3 },
    { "id": "todo-summary",     "visible": true,  "order": 4 }
  ]
}
```

#### Files created / modified

| File | Change |
|---|---|
| `src/lib/dashboard-cards.ts` | New — `DASHBOARD_CARDS` registry and `mergeDashboardCards()` helper |
| `src/components/dashboard/DashboardGrid.tsx` | Reads card order/visibility from `cards` prop instead of hardcoded list |
| `src/components/dashboard/DashboardCustomiser.tsx` | New — drag-and-drop card visibility/order dialog using `@dnd-kit` |
| `src/app/(app)/home/page.tsx` | Parses `dashboardCards` from `uiPreferences`; conditionally fetches data for visible cards only |
| `src/app/(app)/home/HomeClient.tsx` | New — client wrapper with "Customise" button and state management |
| `src/types/index.ts` | `DashboardCardConfig` type defined in `src/lib/dashboard-cards.ts` |

#### Implementation notes

- Drag-and-drop: use the existing `@dnd-kit` dependency (already in the project for meal planner and lists) — no new packages needed.
- The customiser UI: a vertical list of cards, each with a drag handle, label, and visibility toggle (eye icon). Save button calls `PATCH /api/settings/dashboard`.
- `DashboardGrid` receives `cards: DashboardCardConfig[]` as a prop and renders them in order, skipping hidden ones. The card components themselves are unchanged.
- The `home/page.tsx` server component parses `uiPreferences`, falls back to the default registry order if `dashboardCards` is absent or malformed, and only fetches data for visible cards (small perf gain — e.g. skip meal plan queries if meals cards are hidden).
- Keep the customiser simple — no live preview needed. Save and refresh is fine.

#### Docker / NAS impact

No schema migration (uses existing `uiPreferences` JSON field). New API route only. Standard redeploy.

#### Acceptance criteria

- [ ] Home page has a "Customise" button that opens the card manager
- [ ] User can toggle each card on/off and drag to reorder
- [ ] Preferences are saved per-user (other family members unaffected)
- [ ] Refreshing the page preserves the custom layout
- [ ] Users with no saved preference see the default 5-card layout
- [ ] Hidden cards do not trigger their data queries on the server

---

## 3. Backlog Feature Ideas

The following features were identified but are lower priority or higher effort. Kept here for future planning.

### Budgeting module
Track spending by category. Would benefit from shopping list price estimates being built first. High effort but high value.

### Offline PWA (background sync)
Extend the service worker to queue list mutations (check item, add item) when offline and replay on reconnect using the Background Sync API. High effort — requires careful conflict resolution.

---

*Document generated from codebase review of `C:\Appdev\HomeBase` — April 2026.*
