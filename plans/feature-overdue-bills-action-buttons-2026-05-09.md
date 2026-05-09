# Feature: Action Buttons on Overdue Bills Panels

## Problem

The [`/finance/bills`](src/app/(app)/finance/bills/page.tsx) page has two overdue panels that display bills past due:

1. **Recurring overdue panel** (red, lines 452-466)
2. **One-off overdue panel** (orange, lines 468-483)

Currently these only show the bill name and amount — there are **no action buttons**, so users cannot mark bills as paid, edit, or delete them directly from these panels. They must scroll down to the main bill list to find the same bill and action it there.

## Solution

Add compact action buttons to each row within both overdue panels, reusing the same action handlers (`handleMarkPaid`, `openEdit`, `handleDelete`) already available in the parent [`BillsPage`](src/app/(app)/finance/bills/page.tsx:70) component.

### What will change

**Only [`src/app/(app)/finance/bills/page.tsx`](src/app/(app)/finance/bills/page.tsx) needs modification.** No API, database, or other page changes required.

#### 1. Overdue Recurring Panel (lines 457-463)

Replace the simple `<div>` per bill with a flex row that includes compact icon buttons:

```tsx
{overdue.map(b => (
  <div key={b.id} className="flex items-center justify-between gap-2 text-sm">
    <span className="truncate min-w-0 flex-1">{b.name}</span>
    <span className="font-medium shrink-0">{formatCurrency(b.amount)}</span>
    {/* Action buttons */}
    <div className="flex items-center gap-0.5 shrink-0">
      <button onClick={() => handleMarkPaid(b)} title="Mark as paid"
        className="p-1 hover:bg-red-500/10 rounded text-green-500">
        <CheckCircle2 className="h-3.5 w-3.5" />
      </button>
      <button onClick={() => openEdit(b)} title="Edit"
        className="p-1 hover:bg-red-500/10 rounded text-muted-foreground hover:text-foreground">
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button onClick={() => handleDelete(b.id)} title="Delete"
        className="p-1 hover:bg-red-500/10 rounded text-red-500">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
))}
```

#### 2. Overdue One-Off Panel (lines 474-480)

Same treatment, but keep the existing "Due [date]" subtitle:

```tsx
{overdueOneOff.map(b => (
  <div key={b.id} className="flex items-center justify-between gap-2 text-sm">
    <div className="min-w-0 flex-1">
      <span>{b.name}</span>
      <span className="text-xs text-muted-foreground ml-2">
        Due {format(new Date(b.nextDueDate), 'd MMM yyyy')}
      </span>
    </div>
    <span className="font-medium shrink-0">{formatCurrency(b.amount)}</span>
    {/* Action buttons (same as above) */}
    <div className="flex items-center gap-0.5 shrink-0">
      ...
    </div>
  </div>
))}
```

### Design decisions

| Decision | Choice | Rationale |
|---|---|---|
| Button set | **Mark paid**, **Edit**, **Delete** | Core actions needed for overdue bills; excludes invoice/attachment to keep the panel compact |
| Button style | Small icon buttons matching `BillRow` style | Consistent UX, minimal visual weight |
| Hover bg | Uses the panel's accent (`red-500/10`) | Visually anchors buttons to their overdue panel |
| Layout | Flex row with `gap-2`, `shrink-0` on buttons | Prevents button wrapping, keeps the row tight |
| No new component | Inline JSX within the map | Simple enough that extracting a component adds unnecessary indirection |

### Before/After

**Before (recurring overdue panel):**
```
┌─ 🔔 3 overdue recurring bills ─────────────────┐
│  Electricity          $180.00                   │
│  Internet             $89.99                    │
│  Water                $65.00                    │
└─────────────────────────────────────────────────┘
```

**After:**
```
┌─ 🔔 3 overdue recurring bills ─────────────────┐
│  Electricity          $180.00  [✓][✏][🗑]       │
│  Internet             $89.99   [✓][✏][🗑]       │
│  Water                $65.00   [✓][✏][🗑]       │
└─────────────────────────────────────────────────┘
```

### Files to modify

1. [`src/app/(app)/finance/bills/page.tsx`](src/app/(app)/finance/bills/page.tsx) — only file, two sections to update
   - Lines 458-463: recurring overdue rows
   - Lines 475-480: one-off overdue rows

### No new dependencies

Already imported in the file:
- `CheckCircle2`, `Pencil`, `Trash2` icons (line 4-8)
- `formatCurrency` (lines 360-362)
- All action handlers already exist in parent scope

## Implementation Steps

1. Replace the simple `<span>`-only rows in the **recurring overdue panel** (lines 458-463) with rows containing name, amount, and 3 action icon buttons
2. Replace the simple `<span>`-only rows in the **one-off overdue panel** (lines 474-480) with rows containing name+date, amount, and the same 3 action icon buttons
