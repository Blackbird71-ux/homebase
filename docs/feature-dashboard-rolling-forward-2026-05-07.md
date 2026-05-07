# Feature: Rolling Forward Dashboard + Chore Schedule + Todo Assignment
**Date:** May 7, 2026

## Summary
Major dashboard and meal planner overhaul to display rolling forward views (from today), new chore schedule dashboard panel, note field on chores, per-user todo assignment, and scope selectors (7/14/30 days).

## Changes

### 1. Rolling Forward Display (Home Dashboard & Meal Planner)
- **Home dashboard** now shows all panels starting from today's date going forward (rolling 7-day window)
- **Meal planner** starts from today with the current day at the top and next six underneath
- No historical data is shown in weekly summaries or meal plan views
- **Files:**
  - `src/app/(app)/home/page.tsx` — rolls weekStart from today, computes weekLabel dynamically
  - `src/app/api/dashboard/route.ts` — weekly summary queries from todayStart forward
  - `src/components/dashboard/WeeklySummaryCard.tsx` — "Next 7 Days — {weekLabel}" title
  - `src/app/(app)/meal-plan/page.tsx` — passes todayStringInTz as initial weekStart
  - `src/components/meal-plan/MealPlanGrid.tsx` — today-first ordering

### 2. Scope Selector (7 / 14 / 30 Days)
- **Meal planner** and **Chore Schedule card** now have toggle buttons for scope: Week (7), 14d, or 30d
- Segmented button group style with `bg-muted/30 border border-border rounded-lg p-0.5`
- ScopeDays type: `7 | 14 | 30`
- Navigation arrows on meal planner always advance by 7 days regardless of scope
- **Files:**
  - `src/components/meal-plan/MealPlanGrid.tsx` — `const [scope, setScope] = useState<ScopeDays>(7)`, scope toggle buttons, `getScopeDays(startDate, scope)`
  - `src/components/dashboard/ChoreScheduleCard.tsx` — scope toggle with `data.slice(0, scope)` for display

### 3. Chore Schedule Dashboard Card (New)
- New card on the home dashboard showing rolling 7 days (by default) as day cards
- Each day card lists chore line items with: chore title, assignee (UserIcon), note (StickyNoteIcon)
- Overdue chores highlighted with `bg-destructive/10 border border-destructive/20`
- Hidden when no data (`data.every((d) => d.chores.length === 0)`)
- **Added completion support (Bug 1 fix):** Each chore now has a checkbox button that:
  - Calls `POST /api/chores/[id]/complete` to mark the chore complete
  - Persistently tracks completed state via `completedIds` Set (never cleared during session)
  - Shows green checkbox + strikethrough + reduced opacity on completion
  - Uses `completingIds` Set for brief 700ms animation state
- **New files:**
  - `src/components/dashboard/ChoreScheduleCard.tsx` — 190 lines, 'use client' component (includes completion logic)
  - `src/app/api/chores/schedule/route.ts` — GET endpoint returning `ChoreScheduleDay[]`
- **Modified files:**
  - `src/lib/dashboard-cards.ts` — registered `'chore-schedule'` card
  - `src/components/dashboard/DashboardGrid.tsx` — renders `<ChoreScheduleCard>`
  - `src/app/(app)/home/HomeClient.tsx` — added `handleScopeChange` to re-fetch dashboard data on scope toggle (Bug 4 fix)

### 4. Chore Note Field
- ChoreDialog now has a "Notes" textarea field for persistent notes on chore line items
- Note is stored in the `Chore.note` column (schema: `String?`)
- API routes accept and save the note field on create and update
- **Files:**
  - `src/app/(app)/chores/ChoreDialog.tsx` — `const [note, setNote] = useState(chore?.note ?? '')`, textarea with label `htmlFor="chore-note"`
  - `src/app/api/chores/route.ts` — `note: note ?? null` in create
  - `src/app/api/chores/[id]/route.ts` — `...(body.note !== undefined ? { note: body.note } : {})` in PATCH
  - `prisma/schema.prisma` — Chore model: `note String?`

### 5. Todo Per-User Assignment
- List items can now be assigned to individual family members
- TodoList shows filter buttons: All, My Tasks, Due today, Overdue
- ListItemRow shows assignee badge/dropdown:
  - Assigned: UserIcon + name badge, click to unassign
  - Unassigned: `<select>` with `opacity-0 group-hover:opacity-100` behavior
- TodoCard shows `myTasksCount` (User icon) and `familyTasksCount` (Users icon) with the user's ID passed from the server
- **Files:**
  - `src/app/api/lists/[id]/items/route.ts` — `assignedToUserId: assignedToUserId ?? null`
  - `src/app/api/lists/[id]/items/[itemId]/route.ts` — `...(assignedToUserId !== undefined && { assignedToUserId })`
  - `src/components/lists/TodoList.tsx` — filter buttons, `assignItem()` PATCH, category grouping
  - `src/components/lists/ListItemRow.tsx` — assignee badge/dropdown (lines 193-223)
  - `src/components/dashboard/TodoCard.tsx` — myTasksCount/familyTasksCount
  - `src/app/(app)/lists/page.tsx` — fetches family members, serializes assignedToUserId
  - `src/app/(app)/home/page.tsx` — passes userId for myTasksCount query
  - `src/lib/list-helpers.ts` — TodoFilter type: 'all'|'mine'|'today'|'overdue', filterTodoItems function
  - `prisma/schema.prisma` — ListItem: `assignedToUserId String?`, `assignedToUser User? @relation("ListItemAssignee")`

### 6. New Database Migration
- `prisma/migrations/20260508200000_add_chore_note_and_item_assignment/migration.sql`
  - `ALTER TABLE "Chore" ADD COLUMN "note" TEXT;`
  - `ALTER TABLE "ListItem" ADD COLUMN "assignedToUserId" TEXT;`
  - `CREATE INDEX IF NOT EXISTS "ListItem_assignedToUserId_idx";`

### 7. Type Definitions
- `src/types/index.ts` — Added `ChoreScheduleDay`, `ChoreScheduleItem`, `WeeklySummaryData`, `choreSchedule` field on `DashboardData`

## Design
- Scope toggle: segmented button group in card headers, `text-[10px]` size
- Chore schedule: day cards with `border border-border rounded-lg p-2 bg-muted/20`
- Overdue: `text-destructive` color + destructive background/border
- Todo assignee: UserIcon (`h-3 w-3`), name truncated with `max-w-[80px] truncate`
- Filter buttons: `All | My Tasks | Due today | Overdue` with active state highlighting

## Files Created (3)
- `src/components/dashboard/ChoreScheduleCard.tsx`
- `src/app/api/chores/schedule/route.ts`
- `prisma/migrations/20260508200000_add_chore_note_and_item_assignment/migration.sql`

## Files Modified (19)
- `prisma/schema.prisma`
- `src/types/index.ts`
- `src/lib/dashboard-cards.ts`
- `src/lib/list-helpers.ts`
- `src/components/dashboard/DashboardGrid.tsx`
- `src/components/dashboard/WeeklySummaryCard.tsx`
- `src/components/dashboard/TodoCard.tsx`
- `src/components/meal-plan/MealPlanGrid.tsx`
- `src/components/lists/TodoList.tsx`
- `src/components/lists/ListItemRow.tsx`
- `src/components/lists/ShoppingList.tsx`
- `src/app/(app)/home/page.tsx`
- `src/app/(app)/meal-plan/page.tsx`
- `src/app/(app)/lists/page.tsx`
- `src/app/(app)/chores/ChoreDialog.tsx`
- `src/app/api/dashboard/route.ts`
- `src/app/api/chores/route.ts`
- `src/app/api/chores/[id]/route.ts`
- `src/app/api/lists/[id]/items/route.ts`
- `src/app/api/lists/[id]/items/[itemId]/route.ts`

## Verification
- ✅ Build passes with zero TypeScript errors
- ✅ All routes show as `ƒ (Dynamic)`
- ✅ Docker configuration verified — migrations run at container startup via entrypoint.sh
- ✅ Migration SQL tested with `prisma migrate deploy`