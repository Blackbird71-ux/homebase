# Bug Fixes - April 2026

## Summary of Changes

### Bug 1: Calendar events for tomorrow show on home tab for today (UTC issue)

**Root Cause:** The home page was computing date boundaries using `new Date()` directly without considering the family's configured timezone. This caused events from the next day (in the family's timezone) to appear as "today" when the UTC date was ahead.

**Fix:** Updated `getDashboardData()` in `src/app/(app)/home/page.tsx` to use `Intl.DateTimeFormat` with the family's timezone to compute `todayStart` and `todayEnd` as UTC boundaries aligned to the family's local date.

**Files Modified:**
- `src/app/(app)/home/page.tsx`

---

### Bug 2: Meal planned but not showing on home tonight's dinner

**Root Cause:** Same UTC issue as Bug 1. The meal plan query was using the same incorrect date boundaries, so a meal planned for "today" in the family's timezone might not match if the UTC date was different.

**Fix:** Same fix as Bug 1 - the meal plan query now uses the same timezone-aware `todayStart`/`todayEnd` boundaries.

**Files Modified:**
- `src/app/(app)/home/page.tsx`

---

### Bug 3: Shopping panel shows Bunnings list instead of groceries

**Root Cause:** The home page was selecting the first active shopping list (`take: 1` ordered by `createdAt: 'desc'`), which might not be the desired list (e.g., a "Bunnings" list created more recently than "Groceries").

**Fix:** Added a user preference `dashboardShoppingListId` stored in the existing `uiPreferences` JSON field on the User model. The home page now checks this preference first. If set, it queries for that specific list; otherwise it falls back to the most recent active list.

**New UI:** Added a "Dashboard Shopping List" card to the Appearance settings tab with a dropdown selector showing all active shopping lists, plus an "Auto" option for the default behavior.

**Files Modified:**
- `src/app/(app)/home/page.tsx` - Added `preferredListId` parameter to `getDashboardData()`, reads `uiPreferences.dashboardShoppingListId`
- `src/components/settings/AppearanceTab.tsx` - Added shopping list selector UI
- `src/app/api/lists/route.ts` - Added `type` query parameter support to GET endpoint

---

### Bug 4: Calendar - cannot add anything, change or update

**Root Cause:** The event API routes had issues with how they handled the request body and response serialization. The `POST /api/events` and `PATCH /api/events/[id]` routes were not properly handling the event data.

**Fix:** Updated the event API routes to properly parse and validate request data, handle recurrence fields, and return properly serialized responses.

**Files Modified:**
- `src/app/api/events/route.ts`
- `src/app/api/events/[id]/route.ts`

---

### Bug 5: Calendar add new stuck at saving

**Root Cause:** The EventModal component had a loading state issue where the save operation would hang indefinitely due to improper async handling and missing error recovery.

**Fix:** Updated the EventModal to properly handle loading states, error responses, and ensure the modal closes correctly after successful save.

**Files Modified:**
- `src/components/calendar/EventModal.tsx`

---

### Bug 6: Cannot change or update categories in settings

**Root Cause:** The EventCategoryManager component and its API routes had issues with the update flow. The PATCH endpoint for event categories was not properly handling the request body.

**Fix:** Updated the EventCategoryManager component and API routes to properly handle category updates.

**Files Modified:**
- `src/components/calendar/EventCategoryManager.tsx`
- `src/app/api/event-categories/[id]/route.ts`

---

### Bug 7: New events need option for fortnightly, quarterly and bi-annually

**Root Cause:** The EventModal's repeat frequency selector only had basic options (daily, weekly, monthly, yearly, weekdays).

**Fix:** Added three new repeat frequency options:
- **Fortnightly** (every 2 weeks) - `FREQ=WEEKLY;INTERVAL=2`
- **Quarterly** (every 3 months) - `FREQ=MONTHLY;INTERVAL=3`
- **Bi-annually** (every 6 months) - `FREQ=MONTHLY;INTERVAL=6`

**Files Modified:**
- `src/components/calendar/EventModal.tsx`

---

## Files Modified

| File | Changes |
|------|---------|
| `src/app/(app)/home/page.tsx` | Timezone fix + shopping list preference |
| `src/components/settings/AppearanceTab.tsx` | Dashboard shopping list selector |
| `src/app/api/lists/route.ts` | Added `type` query param support |
| `src/app/api/events/route.ts` | Event creation fix |
| `src/app/api/events/[id]/route.ts` | Event update fix |
| `src/components/calendar/EventModal.tsx` | Loading state fix + new repeat options |
| `src/components/calendar/EventCategoryManager.tsx` | Category update fix |
| `src/app/api/event-categories/[id]/route.ts` | Category API fix |

## Testing

1. **Bug 1 & 2:** Set family timezone to a UTC+X zone, create events/meal plans for today, verify they appear correctly on the home dashboard
2. **Bug 3:** Go to Settings > Appearance, select a specific shopping list from the "Dashboard Shopping List" dropdown, save, verify the home dashboard shows that list
3. **Bug 4 & 5:** Create, edit, and delete events in the calendar - verify all operations work
4. **Bug 6:** Go to Settings > Event Categories, create/edit/delete categories
5. **Bug 7:** Create a new event, check the repeat dropdown for "Fortnightly", "Quarterly", and "Bi-annually" options
