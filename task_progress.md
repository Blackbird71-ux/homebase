# Bug Fix Progress

## Bugs Fixed

### Bug 1: Calendar events for tomorrow show on home tab for today (UTC issue)
- [x] Analyze root cause
- [x] Fix home page upcoming events query to use timezone-aware date boundaries

### Bug 2: Meal planned but not showing on tonight's dinner
- [x] Analyze root cause
- [x] Fix meal plan query to use timezone-aware date boundaries

### Bug 3: Shopping panel shows Bunnings list but should be selectable
- [x] Analyze root cause
- [x] Add user preference for dashboard shopping list selection
- [x] Update dashboard API to respect the preference
- [x] Add UI in settings to select which list shows on dashboard

### Bug 4: Calendar cannot add/change/update events
- [x] Analyze root cause
- [x] Fix event creation/update flow (null-safety on seriesId access)

### Bug 5: Calendar add new stuck at saving
- [x] Analyze root cause
- [x] Fix loading state issue in EventModal (same null-safety fix as Bug 4)

### Bug 6: Cannot change or update categories in settings
- [x] Analyze root cause
- [x] Confirmed API was correct; DialogTrigger render prop pattern is correct for @base-ui/react

### Bug 7: New events need fortnightly, quarterly, and bi-annually options
- [x] Analyze root cause
- [x] Already implemented in REPEAT_OPTIONS array

## Additional Fixes (post-review)

### Bug 8: All-day event end date not synced when date changes
- [x] Fix EventModal: all-day date input onChange now updates both start and end

### Bug 9: All-day events on home dashboard show UTC date not family timezone
- [x] Fix UpcomingEventsCard: all-day events now use Intl.DateTimeFormat with family timezone

### Bug 10: Home page shows no shopping list when preferred list is deleted/inactive
- [x] Fix home/page.tsx: fetches top 5 active lists and falls back to first if preferred not found
