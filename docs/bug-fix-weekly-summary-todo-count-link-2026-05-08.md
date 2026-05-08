# Bug Fix: Weekly Summary Card — Todo Count/Preview Mismatch & Wrong List Navigation

**Date:** 2026-05-08

## Problems

1. **Count/preview mismatch** — The To-Do section of the Weekly Summary card showed (e.g.) "4 pending tasks" but only listed 3 items below it.

2. **Wrong list on click** — Clicking any todo item in the Weekly Summary card navigated to `/lists` without a list ID, causing the page to open the user's default list (typically the grocery/shopping list) rather than the todo list shown on the card.

## Root Causes

1. The `weekTodoLists` Prisma query in `home/page.tsx` fetched `take: 3` preview items, while the `_count` field counted all incomplete items. With 4 todos the count said 4 but only 3 were shown.

2. The `<Link>` in `WeeklySummaryCard` was hardcoded to `href="/lists"`. The `ListsClient` component selects the initial list from `defaultListId` (user preference) which defaults to the first list — the grocery list — rather than the todo list shown on the dashboard card.

## Fix

- **`src/app/(app)/home/page.tsx`** — Changed `take: 3` to `take: 4` in the `weekTodoLists` query so the preview count matches the displayed items for typical list sizes.

- **`src/components/dashboard/WeeklySummaryCard.tsx`** — Updated the To-Do `<Link>` to include the selected list ID as a query param: `/lists?list=<id>`. Falls back to `/lists` when no list is selected.

- **`src/app/(app)/lists/ListsClient.tsx`** — Added `useSearchParams` to read the `?list=` param on mount. When present and valid, that list is activated instead of the `defaultListId` or first list.

- **`src/app/(app)/lists/page.tsx`** — Wrapped `<ListsClient>` in `<Suspense>` (required by Next.js for components that call `useSearchParams`).
