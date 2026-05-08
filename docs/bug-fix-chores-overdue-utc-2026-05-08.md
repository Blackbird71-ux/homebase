# Bug Fix: Chores Overdue Using UTC Instead of Local Timezone

**Date:** 2026-05-08

## Problem

Chores created before 10:00 AM for today would immediately display as overdue, while chores created after 10:00 AM would not. This was caused by the client-side `isOverdue()` function comparing `nextDueDate` (stored as UTC midnight) against `new Date()` (current UTC time) without timezone awareness.

For users in Australia/Sydney (UTC+10), 10:00 AM AEST = 00:00 UTC. When the UTC clock struck midnight, today's chores appeared "overdue" in UTC even though it was still the same local day.

## Root Cause

`src/app/(app)/chores/ChoresClient.tsx` had a client-side function:

```typescript
function isOverdue(nextDueDate: string | null): boolean {
  if (!nextDueDate) return false
  return new Date(nextDueDate) < new Date()
}
```

This compared `nextDueDate` (which is stored as a UTC Date in the database) against the current UTC time. The comparison is:

- `nextDueDate` = midnight UTC of the chore's due date (e.g., `2026-05-08T00:00:00.000Z`)
- `new Date()` = current UTC time (e.g., `2026-05-08T00:30:00.000Z` at 10:30 AM AEST)

At 10:00 AM AEST, UTC time crosses midnight, making the comparison `midnightUTC < currentUTC` evaluate to `true` for chores due today — incorrectly marking them as overdue.

## Solution

The fix moves `isOverdue` computation to the server side using the existing `todayBoundsInTz(timezone)` utility, which computes local-timezone midnight boundaries as UTC Date objects. This follows the same pattern already used in 3 other locations.

### Files Changed

#### 1. `src/app/api/chores/route.ts` — GET endpoint

Added `todayBoundsInTz` import and modified the GET handler to compute `isOverdue` per chore:

```typescript
import { todayBoundsInTz } from '@/lib/timezone'

export async function GET() {
  const user = await requireSession()
  const timezone = user.timezone ?? 'UTC'
  const { start: todayStart } = todayBoundsInTz(timezone)

  const chores = await prisma.chore.findMany({ ... })

  const choresWithOverdue = chores.map((c) => ({
    ...c,
    isOverdue: c.nextDueDate ? c.nextDueDate < todayStart : false,
  }))

  return NextResponse.json(choresWithOverdue)
}
```

#### 2. `src/app/(app)/chores/page.tsx` — SSR route

Added `todayBoundsInTz` import and includes `isOverdue` in initial data with the same timezone-aware comparison:

```typescript
import { todayBoundsInTz } from '@/lib/timezone'

const { start: todayStart } = todayBoundsInTz(timezone)

// In the map:
isOverdue: c.nextDueDate ? c.nextDueDate < todayStart : false,
```

#### 3. `src/app/(app)/chores/ChoresClient.tsx` — Client component

- Removed the buggy `isOverdue()` function entirely
- Both usages (`HoverDetails` and filtered list) now reference `chore.isOverdue` (computed server-side)

#### 4. `src/app/(app)/chores/ChoreDialog.tsx` — Dialog component

- Added `isOverdue: boolean` to the `Chore` interface to match the API response type

### How `todayBoundsInTz` Works

The utility in `src/lib/timezone.ts` uses the native `Intl.DateTimeFormat` API to find what UTC time corresponds to midnight in the user's local timezone:

1. Gets today's date string (YYYY-MM-DD) in the local timezone
2. Calculates the UTC offset for that date using `Intl.DateTimeFormat.formatToParts()`
3. Returns a Date object representing local midnight in UTC
4. `start.getTime() + 24h` gives the end of today in UTC

Example for Australia/Sydney (UTC+10) on 2026-05-08:
- `todayBoundsInTz('Australia/Sydney').start` → `2026-05-07T14:00:00.000Z` (local midnight = 2026-05-08 00:00 AEST)
- Chore due 2026-05-08 → `nextDueDate` = `2026-05-08T00:00:00.000Z`
- At 10:30 AM AEST (2026-05-07T00:30:00Z UTC): `2026-05-08T00:00:00.000Z < 2026-05-07T14:00:00.000Z`? → **false** ✅ Not overdue

## Other Locations Using Same Pattern

This fix follows the existing pattern already implemented in:
- `src/app/api/chores/schedule/route.ts`
- `src/app/api/dashboard/route.ts`
- `src/app/(app)/home/page.tsx`

## Prevention

When adding new overdue/comparison logic for chores (or any date-based features), always use `todayBoundsInTz(user.timezone)` for timezone-aware date boundaries rather than comparing raw Date objects in client-side code. The existing utility at `src/lib/timezone.ts` handles all timezone edge cases including DST transitions.
