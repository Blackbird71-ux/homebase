# Bug Fixes - Dashboard Rolling Forward (2026-05-07)

## Fix 1: Chore completion visual feedback (ChoresClient.tsx)
- [ ] Add `completedIds` state for recently completed chores
- [ ] Show strikethrough + muted opacity for completed chore rows
- [ ] Auto-remove from completed state after 4 seconds

## Fix 2: Scope selector on Chores page (ChoresClient.tsx)
- [ ] Add scope state (7/14/30) with toggle buttons
- [ ] Filter chores within scope window
- [ ] Show filtered count vs total

## Fix 3 & 4: Lift scope + apply to WeeklySummaryCard (HomeClient, WeeklySummaryCard, ChoreScheduleCard)
- [ ] Add scope state to HomeClient and pass down
- [ ] Update WeeklySummaryCard with scope toggles and dynamic title
- [ ] Update ChoreScheduleCard to accept parent scope
- [ ] Wire up DashboardGrid to pass scope to both cards
- [ ] Ensure all cards respond to scope changes
