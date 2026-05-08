# Bug Fixes: Dashboard Card Width, Chore Mine Filter, Weekly Summary Todo Picker

**Date:** 2026-05-08

## Fix 1: Dashboard Cards Always Rendering at Half/Fixed Width

### Problem

On every page load, dashboard cards rendered at a fixed ~800px width instead of filling the container. The `DashboardCardWrapper` computes pixel positions using `containerWidth`, which was tracked via a `useRef(800)` in `DashboardGrid`. The `ResizeObserver` updated this ref but never triggered a React re-render, so `containerWidth` stayed at the 800px fallback for the entire lifetime of the page until some other state change happened (e.g. drag or resize interaction).

### Fix

Converted `containerWidthRef` from `useRef` to `useState(800)` in `DashboardGrid`. The `ResizeObserver` now calls `setContainerWidth(...)`, triggering a re-render with the real container width immediately after mount. Also reads the initial width via `getBoundingClientRect()` in the same effect so the correct width is applied on first paint.

### Files Changed

- `src/components/dashboard/DashboardGrid.tsx` — `containerWidthRef` → `containerWidth` state; ResizeObserver calls `setContainerWidth`; initial width read on mount

---

## Fix 2: Chore Schedule "Mine" Filter Not Working

### Problem

The **Mine** toggle on the Chore Schedule card sent `assignedToMe=true` to `/api/chores/schedule`, but the API was filtering with `assigneeUserId: user.id`. The actual Prisma field on the `Chore` model is `currentAssigneeId` — the wrong field name caused the filter to silently do nothing, showing all chores regardless.

### Fix

Changed `assigneeUserId` to `currentAssigneeId` in the Prisma `where` clause.

### Files Changed

- `src/app/api/chores/schedule/route.ts` — `assigneeUserId` → `currentAssigneeId` in filter

---

## Feature: Weekly Summary Card — Todo List Picker

### Problem

The weekly summary card's To-Do section was hard-coded to show data from whichever list was set as the dashboard default (or the most recent list). There was no way to change this from the card itself.

### Solution

Added a list picker dropdown directly in the To-Do section header of the weekly summary card. Only visible when there are two or more active TODO lists. Selecting a list:
1. Saves `dashboardTodoListId` to `uiPreferences` via `PATCH /api/settings`
2. Refetches the full dashboard data from `/api/dashboard` with the new list ID

Defaults to the user's existing `dashboardTodoListId` preference, or the most recently created TODO list if none is set.

### Files Changed

- `src/app/(app)/home/page.tsx` — fetches `availableTodoLists` alongside dashboard data; passes to `HomeClient`
- `src/app/(app)/home/HomeClient.tsx` — tracks `currentTodoListId` as state; adds `handleTodoListChange` (saves preference + refetches); extracts `fetchDashboard` helper shared by scope and list changes; passes new props to `DashboardGrid`
- `src/components/dashboard/DashboardGrid.tsx` — accepts and threads `availableTodoLists`, `selectedTodoListId`, `onTodoListChange` props through to `WeeklySummaryCard` via `renderCard`
- `src/components/dashboard/WeeklySummaryCard.tsx` — accepts list picker props; To-Do section restructured so the list selector `<select>` sits in the section header while the count/tasks area remains a navigable `<Link href="/lists">`
