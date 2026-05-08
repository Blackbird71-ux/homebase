# Dashboard Quick-Add: Full Modal Editors

**Date:** 2026-05-08

---

## Overview

Upgraded the dashboard `+` quick-add buttons to open the same full modal editors used on their respective dedicated pages, instead of the previous lightweight inline forms. Also added a shared `/api/members` endpoint for family member lookups by any authenticated user.

---

## Changes

### Chores — Full ChoreDialog

The `+` button on the Chore Schedule card now opens the full `ChoreDialog` (same editor as the `/chores` page), exposing all fields:

- Title, description, notes
- Frequency (daily / weekly / bi-weekly / monthly)
- Day of week / day of month
- Start / end dates
- Rotation interval
- Assignee (family member dropdown)
- Trigger-on-complete, auto-rotate, email reminder

Family members are fetched lazily from `/api/members` on first open. On save the card refreshes its schedule inline without a full page navigation.

### Events — Full EventModal

The `+` button on the Upcoming Events card now opens the full `EventModal` (same editor as the `/calendar` page):

- Title, start/end datetime, all-day toggle
- Category, colour, description
- Recurrence rule (daily, weekly, fortnightly, monthly, quarterly, bi-annually, yearly)
- Email reminder with hours + recipient list
- Personal flag

`UpcomingEventsCard` converted from a server component to a client component to hold the modal state.

### Meals — Full AssignMealModal

The `+` button on the Today's Meals card now opens the full `AssignMealModal` (same editor as the `/meal-plan` page):

- Recipe search (searches the recipe library)
- Quick note tab for non-recipe meals
- Export to groceries

Defaults to today's date and dinner slot. Calls `POST /api/meal-plan` on assign.

`TonightsDinnerCard` converted from a server component to a client component to hold the modal state.

### To-Do

No change — the existing `CardQuickAdd type="todo-item"` inline form is the appropriate editor for todo items (matches the list page's add-item UX).

---

## Scope Filters (Week / 14d / 30d)

Verified correct. Scope changes propagate from `HomeClient` → `DashboardGrid` → `ChoreScheduleCard` via the `scope` prop. The `useEffect` on `scope` triggers a fresh `GET /api/chores/schedule?scope=X` and the display slices to the new scope. No fix required.

---

## Files Changed

| File | Change |
|---|---|
| `src/app/api/members/route.ts` | New — returns `{id, name}[]` for all family members; requires session (any role) |
| `src/components/dashboard/ChoreScheduleCard.tsx` | Replaces `CardQuickAdd` with lazy-member-fetch + `ChoreDialog` |
| `src/components/dashboard/UpcomingEventsCard.tsx` | Adds `'use client'`; replaces `CardQuickAdd` with `EventModal` |
| `src/components/dashboard/TonightsDinnerCard.tsx` | Adds `'use client'`; replaces `CardQuickAdd` with `AssignMealModal` |
