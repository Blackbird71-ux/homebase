# Plan: Day-of-Week Selection for Recurring Weekly Events

## Overview

Allow users to pick specific days of the week for weekly-repeating calendar events (e.g. "Exercise" every Monday, Wednesday, Friday).

## Key Finding: Backend already supports this

The recurrence infrastructure already handles `BYDAY` correctly:

- **Prisma schema** stores `recurrenceRule` as a free-text RRULE string — no schema change needed
- **API routes** (`POST`, `PUT`) pass `recurrenceRule` straight through to DB — no API change needed
- **`parseRRule()`** in [`src/lib/recurrence.ts:52`](src/lib/recurrence.ts:52) already parses `BYDAY=MO,WE,FR` from RRULE strings
- **`generateRecurrenceInstances()`** in [`src/lib/recurrence.ts:95`](src/lib/recurrence.ts:95) already handles `WEEKLY` + `BYDAY` to produce instances on the correct days

**This is a pure frontend change** — only [`EventModal.tsx`](src/components/calendar/EventModal.tsx) needs modification.

---

## Changes Required

### 1. EventModal.tsx — Add day-of-week toggle row

When the user selects a weekly-frequency option from the "Repeat" dropdown (Weekly, Fortnightly), show a row of 7 day-toggle buttons below it.

**New state variable:**
```ts
const [weeklyRepeatDays, setWeeklyRepeatDays] = useState<string[]>([]) // e.g. ['MO', 'WE', 'FR']
```

**Day buttons** — a horizontal row of 7 toggles:

| Label | Value |
|-------|-------|
| Mon | `MO` |
| Tue | `TU` |
| Wed | `WE` |
| Thu | `TH` |
| Fri | `FR` |
| Sat | `SA` |
| Sun | `SU` |

Each button toggles its value in/out of the `weeklyRepeatDays` array. Multiple selections allowed. Styling: outlined by default, filled/pill-style when selected.

**Visibility logic:** Show the day picker only when the selected `recurrenceRule` contains `FREQ=WEEKLY` (i.e. matches Weekly or Fortnightly — both start with `FREQ=WEEKLY`).

### 2. Build BYDAY segment when saving

In the `handleSave()` function, **before** assigning `body.recurrenceRule`:

```ts
// If it's a weekly recurrence and days are selected, append BYDAY
let finalRecurrenceRule = recurrenceRule
if (recurrenceRule.startsWith('FREQ=WEEKLY') && weeklyRepeatDays.length > 0) {
  // Remove any existing BYDAY first (defensive; our UI won't produce one yet)
  finalRecurrenceRule = recurrenceRule.replace(/;BYDAY=[A-Z,]+/i, '')
  finalRecurrenceRule += `;BYDAY=${weeklyRepeatDays.join(',')}`
}
```

Then use `finalRecurrenceRule` instead of `recurrenceRule` in the body.

### 3. Parse existing BYDAY when editing

In the `useEffect` that populates form state from the event prop, add:

```ts
// Parse existing BYDAY days from recurrence rule
if (event.recurrenceRule) {
  const byDayMatch = event.recurrenceRule.match(/BYDAY=([A-Z,]+)/i)
  if (byDayMatch) {
    setWeeklyRepeatDays(byDayMatch[1].split(','))
  } else {
    setWeeklyRepeatDays([])
  }
} else {
  setWeeklyRepeatDays([])
}
```

### 4. What about "Just Weekly" (no days selected)?

If the user selects "Weekly" from the dropdown but doesn't toggle any day buttons, the behaviour should remain as current: the event repeats every 7 days from its start date (no `BYDAY` segment). This is intuitive — only toggle days when you want specific days.

---

## Visual Design

```
Repeat:    [ Weekly v ]
           +-----------------------------------+
           | Mon  Tue  Wed  Thu  Fri  Sat  Sun |  <- toggle pills
           |  o    o    *    o    *    o    o  |
           +-----------------------------------+
End repeat (optional): [ ___________________ ]
```

Each pill is outlined by default (`bg-background border-border`) and filled when selected (`bg-primary text-primary-foreground border-primary`). When no days are selected, a hint reads: *"No days selected — event repeats every 7 days from the start date"*

---

## Files to Modify

| File | Change |
|------|--------|
| [`src/components/calendar/EventModal.tsx`](src/components/calendar/EventModal.tsx) | Add day toggle UI, state, save/build logic, edit/parse logic |

No other files need changes.

---

## Test Scenarios

1. **Create weekly event with M/W/F selected** → RRULE = `FREQ=WEEKLY;BYDAY=MO,WE,FR` → instances appear on Mon, Wed, Fri
2. **Create weekly event with no days selected** → RRULE = `FREQ=WEEKLY` → existing behaviour (every 7 days from start)
3. **Create fortnightly event with T/Th selected** → RRULE = `FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH` → instances every other Tue/Thu
4. **Edit existing BYDAY event** → days pre-populated correctly
5. **Edit existing simple weekly event (no BYDAY)** → no days pre-populated, hint text shows
6. **Clear all day selections** → falls back to "every 7 days" behaviour
