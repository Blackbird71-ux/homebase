# Bug Fix: AI Assistant Auto-Refresh for All Features

**Date:** 2026-05-07

## Problem

The AI assistant would say "Done" after performing an action (adding a meal, creating a note, adding a calendar event, etc.), but the corresponding page would not refresh to show the change. The data was correctly written to the database, but the UI components had no way of knowing they needed to re-fetch.

## Root Cause

The AI assistant (`AIAssistant.tsx`) was dispatching custom events via the event bus (`app-events.ts`) after successful mutations, but only `MealPlanGrid` was listening for those events. All other feature components loaded their data once on mount and had no mechanism to detect external changes.

## Solution

### 1. Cross-Component Event Bus (`src/lib/app-events.ts`)

Created a simple event bus using native `CustomEvent` dispatching:

- `dispatchAppEvent(eventName)` — Dispatches a custom event on `window`
- `listenAppEvent(eventName, callback)` — Subscribes to an event, returns a cleanup function

Events defined:
- `app:mealPlanUpdated`
- `app:shoppingListUpdated`
- `app:todoListUpdated`
- `app:notesUpdated`
- `app:choresUpdated`
- `app:calendarUpdated`

### 2. AI Assistant (`src/components/ai/AIAssistant.tsx`)

After receiving a successful response from the API, dispatches the appropriate event based on the `action` field returned by the server.

### 3. Component Listeners Added

| Component | Event | Refetch Endpoint |
|---|---|---|
| `MealPlanGrid` | `MEAL_PLAN_UPDATED` | `/api/meal-plan?from=...&to=...` |
| `CalendarView` | `CALENDAR_UPDATED` | `/api/events?from=...&to=...` |
| `ShoppingList` | `SHOPPING_LIST_UPDATED` | `/api/lists/{listId}/items` |
| `TodoList` | `TODO_LIST_UPDATED` | `/api/lists/{listId}/items` |
| `NotesClient` | `NOTES_UPDATED` | `/api/notes` |
| `ChoresClient` | `CHORES_UPDATED` | `/api/chores` |

### 4. AI System Prompt Enhancement

Updated the recipe matching rules in the AI system prompt so that when the user says something like "add ragu to Monday lunch" and there are multiple matching recipes, the AI will use the `unknown` function to ask the user which one they meant, rather than silently guessing.

## Files Changed

- `src/lib/app-events.ts` — **New file**: Event bus
- `src/components/ai/AIAssistant.tsx` — Added event dispatch after mutations
- `src/components/meal-plan/MealPlanGrid.tsx` — Added event listener
- `src/components/calendar/CalendarView.tsx` — Added event listener
- `src/components/lists/ShoppingList.tsx` — Added event listener
- `src/components/lists/TodoList.tsx` — Added event listener
- `src/app/(app)/notes/NotesClient.tsx` — Added event listener
- `src/app/(app)/chores/ChoresClient.tsx` — Added event listener
- `src/app/api/ai/command/route.ts` — Updated recipe matching rules in system prompt

## Verification

- TypeScript compilation: ✅ Zero errors
- All existing functionality preserved (no code was removed, only additive changes)
