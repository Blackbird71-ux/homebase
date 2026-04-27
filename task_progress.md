# Bug Fix Progress

## Bugs to Fix

### Bug 1: Calendar events for tomorrow show on home tab for today (UTC issue)
- [x] Analyze root cause
- [ ] Fix home page upcoming events query to use timezone-aware date boundaries

### Bug 2: Meal planned but not showing on tonight's dinner
- [x] Analyze root cause
- [ ] Fix meal plan query to use timezone-aware date boundaries

### Bug 3: Shopping panel shows Bunnings list but should be selectable
- [x] Analyze root cause
- [ ] Add user preference for dashboard shopping list selection
- [ ] Update dashboard API to respect the preference
- [ ] Add UI in settings to select which list shows on dashboard

### Bug 4: Calendar cannot add/change/update events
- [x] Analyze root cause
- [ ] Fix event creation/update flow

### Bug 5: Calendar add new stuck at saving
- [x] Analyze root cause
- [ ] Fix loading state issue in EventModal

### Bug 6: Cannot change or update categories in settings
- [x] Analyze root cause
- [ ] Fix event category update flow

### Bug 7: New events need fortnightly, quarterly, and bi-annually options
- [x] Analyze root cause
- [ ] Add new repeat options to EventModal
