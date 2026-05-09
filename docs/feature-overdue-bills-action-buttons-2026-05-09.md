# Feature: Action Buttons on Overdue Bills Panels

**Status: ✅ Implemented**

Adds **Mark Paid**, **Edit**, and **Delete** icon buttons to every bill row in both the recurring overdue and one-off overdue panels on [`/finance/bills`](src/app/(app)/finance/bills/page.tsx).

## Problem

The `/finance/bills` page has two overdue panels that display bills past due:

1. **Recurring overdue panel** (red) — showed name + amount only
2. **One-off overdue panel** (orange) — showed name + date + amount only

These had **no action buttons**, so users couldn't mark bills as paid, edit, or delete them directly from these panels. They had to scroll down to the main bill list to find the same bill and action it there.

## Solution

Added compact action buttons to each row within both overdue panels, reusing the same action handlers (`handleMarkPaid`, `openEdit`, `handleDelete`) already available in the parent [`BillsPage`](src/app/(app)/finance/bills/page.tsx:70) component.

**Only [`src/app/(app)/finance/bills/page.tsx`](src/app/(app)/finance/bills/page.tsx) was modified.** No API, database, or other page changes required.

### Changes

#### 1. Overdue Recurring Panel

Each row now renders:

```tsx
<div key={b.id} className="flex items-center justify-between gap-2 text-sm">
  <span className="truncate min-w-0 flex-1">{b.name}</span>
  <span className="font-medium shrink-0">{formatCurrency(b.amount)}</span>
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
```

#### 2. Overdue One-Off Panel

Same treatment, preserving the "Due [date]" subtitle with orange-tinted hover backgrounds:

```tsx
<div key={b.id} className="flex items-center justify-between gap-2 text-sm">
  <div className="min-w-0 flex-1">
    <span>{b.name}</span>
    <span className="text-xs text-muted-foreground ml-2">
      Due {format(new Date(b.nextDueDate), 'd MMM yyyy')}
    </span>
  </div>
  <span className="font-medium shrink-0">{formatCurrency(b.amount)}</span>
  <div className="flex items-center gap-0.5 shrink-0">
    <button onClick={() => handleMarkPaid(b)} title="Mark as paid"
      className="p-1 hover:bg-orange-500/10 rounded text-green-500">
      <CheckCircle2 className="h-3.5 w-3.5" />
    </button>
    <button onClick={() => openEdit(b)} title="Edit"
      className="p-1 hover:bg-orange-500/10 rounded text-muted-foreground hover:text-foreground">
      <Pencil className="h-3.5 w-3.5" />
    </button>
    <button onClick={() => handleDelete(b.id)} title="Delete"
      className="p-1 hover:bg-orange-500/10 rounded text-red-500">
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  </div>
</div>
```

### Design decisions

| Decision | Choice | Rationale |
|---|---|---|
| Button set | **Mark paid**, **Edit**, **Delete** | Core actions for overdue bills; excludes invoice/attachment to keep panels compact |
| Button style | Small icon buttons matching `BillRow` style | Consistent UX, minimal visual weight |
| Hover bg | Uses the panel's accent color (`red-500/10` or `orange-500/10`) | Visually anchors buttons to their overdue panel |
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

### Files modified

1. [`src/app/(app)/finance/bills/page.tsx`](src/app/(app)/finance/bills/page.tsx) — added action buttons to both overdue panels

### No new dependencies

Already imported in the file:
- `CheckCircle2`, `Pencil`, `Trash2` icon components
- `formatCurrency` helper
- `format` from `date-fns`
- All action handlers (`handleMarkPaid`, `openEdit`, `handleDelete`) already available in parent scope
