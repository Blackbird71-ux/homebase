# Feature: Extended Chores Frequency Options

Added **bi-monthly**, **quarterly**, **half-year**, and **yearly** recurrence options to the chores system.

## Files Changed

### 1. `src/app/(app)/chores/ChoreDialog.tsx`
- Added 4 new `<option>` elements to the frequency `<select>` dropdown
- Updated the `showDayOfMonth` check to include `bi-monthly`, `quarterly`, `half-year`, `yearly` so the day-of-month picker appears for these frequencies

### 2. `prisma/schema.prisma`
- Updated the `frequency` field comment to document the valid values including the new ones

### 3. `src/app/api/chores/route.ts` — `calculateInitialDueDate()`
Added cases for:
- `bi-monthly` → `addMonths(date, 2)`
- `quarterly` → `addMonths(date, 3)`
- `half-year` → `addMonths(date, 6)`
- `yearly` → `addYears(date, 1)`

### 4. `src/app/api/chores/[id]/complete/route.ts` — `calculateNextDueDate()`
Added cases for:
- `bi-monthly` → `next.setMonth(next.getMonth() + 2)`
- `quarterly` → `next.setMonth(next.getMonth() + 3)`
- `half-year` → `next.setMonth(next.getMonth() + 6)`
- `yearly` → `next.setFullYear(next.getFullYear() + 1)`

All new frequency cases also clamp `dayOfMonth` to the last day of the target month when needed.

### 5. `src/app/api/ai/command/route.ts` — `calculateNextDueDateAI()`
Mirrors the same logic as the complete route for AI-assisted chore completions.