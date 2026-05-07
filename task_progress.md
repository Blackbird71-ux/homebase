# Implementation Progress

## Schema Changes
- [x] Add `note` field to Chore model
- [x] Add `assignedToUserId` field to ListItem model
- [x] Create migration SQL file

## Meal Planner - Rolling Forward View
- [x] Update `meal-plan/page.tsx` to pass today as initial week start
- [x] Update `MealPlanGrid.tsx` for today-first ordering + scope selector (7/14/30)

## Home Dashboard - Rolling Display
- [x] Update `home/page.tsx` weekly summary to start from today
- [x] Update `WeeklySummaryCard.tsx` rolling label

## Chore Schedule Card (New Dashboard Panel)
- [x] Add types to `types/index.ts`
- [x] Create `api/chores/schedule/route.ts` API endpoint
- [x] Create `ChoreScheduleCard.tsx` component
- [x] Register card in `dashboard-cards.ts`
- [x] Add card rendering to `DashboardGrid.tsx`

## Chore Dialog - Note Field
- [x] Update `ChoreDialog.tsx` to add Notes text field
- [x] Update `api/chores/route.ts` to accept/save note
- [x] Update `api/chores/[id]/route.ts` to accept/save note

## ToDo - Per-User Assignment
- [x] Update `api/lists/[id]/items/route.ts` to accept `assignedToUserId`
- [x] Update `api/lists/[id]/items/[itemId]/route.ts` to accept `assignedToUserId`
- [x] Update `TodoList.tsx` to show assignee dropdown
- [x] Update `ListItemRow.tsx` to show assignee badge
- [x] Update `TodoCard.tsx` with "My Tasks / Family Tasks" filter

## Chore Completion Visual Feedback
- [x] Update `ChoresClient.tsx` for persistent checkbox + strikethrough

## Documentation & Git
- [x] Create feature doc `docs/feature-dashboard-rolling-forward-2026-05-07.md`
- [x] Update `PROJECT_SUMMARY.md` with new features
- [x] Update `task_progress.md` with completion status
- [x] Commit all changes to git with descriptive message

## Build Verification
- [x] Build passes with zero TypeScript errors
- [x] Docker configuration verified