# Feature: Account Ledger Drill-Down

**Implemented:** 2026-05-12
**Status:** Complete — no migration required
**Docker impact:** None — read-only queries on existing tables, no new dependencies, no schema changes

---

## What It Does

On the Chart of Accounts page (`/finance/categories`), every account row now has a **Ledger** button. Clicking it opens a right-side slide-over panel showing the full account ledger for that category — every transaction and journal entry that has moved money through it, with a running balance. Designed for accountant diagnostic use.

### Ledger features
- **Both data sources merged:** `FinanceTransaction` records (categoryId and glAccountId routes) + `FinanceJournalLine` records (posted journal entries posting to this GL account)
- **Running balance column:** calculated server-side using the account's normal balance convention (debit-normal for assets/expenses, credit-normal for income/liabilities/equity)
- **Opening balance:** sum of all pre-period cleared activity + the category's static `openingBalance` field
- **Source badges:** TX (blue) vs JNL (purple) so accountant can see provenance of each line
- **Pending indicator:** uncleared transactions shown at reduced opacity with a "PENDING" badge
- **Date range presets:** Current FY, Previous FY, Current CY, Previous CY, All time, Custom
- **Custom date picker:** manual from/to with Apply/Cancel
- **CSV export:** one-click export with opening balance row, all ledger rows, and closing balance totals row
- **Closing balance footer:** `<tfoot>` row showing total debits, total credits, and closing balance
- Escape key + backdrop click to dismiss

---

## Files

### Created
| File | Purpose |
|---|---|
| `src/app/api/finance/categories/[id]/ledger/route.ts` | GET endpoint — fetches, merges, sorts both sources; returns ledger rows with running balance |
| `src/components/finance/AccountLedgerPanel.tsx` | Slide-over sheet UI component |
| `docs/feature-account-ledger-2026-05-12.md` | This file |

### Modified
| File | Change |
|---|---|
| `src/app/(app)/finance/categories/page.tsx` | Added `BookOpen` import, `onOpenLedger` prop to `CategoryRow`, `ledgerCategory` state, `<AccountLedgerPanel>` render, and Ledger button on each row |

---

## API

### `GET /api/finance/categories/[id]/ledger`

**Auth:** `requireSession()` — family-scoped, will 404 if category doesn't belong to this family.

**Query params:**
| Param | Description |
|---|---|
| `from` | YYYY-MM-DD start date (optional — defaults to current AU FY start) |
| `to` | YYYY-MM-DD end date (optional — defaults to current AU FY end) |

**Response shape:**
```typescript
{
  category: {
    id: string
    name: string
    glCode: string | null
    type: string                          // 'expense', 'income', 'asset', 'liability', etc.
    normalBalance: 'debit' | 'credit'
  }
  dateFrom: string                        // YYYY-MM-DD
  dateTo: string                          // YYYY-MM-DD
  openingBalance: number                  // balance as at start of period (computed)
  rows: Array<{
    id: string
    date: string                          // ISO date string from DB
    description: string
    reference: string | null              // e.g. "JE-0003" for journal entries
    source: 'transaction' | 'journal'
    sourceId: string                      // FinanceTransaction.id or FinanceJournalEntry.id
    debit: number                         // always positive; 0 when row is a credit movement
    credit: number                        // always positive; 0 when row is a debit movement
    balance: number                       // running balance after this row
    vendor: string | null
    isCleared: boolean
  }>
  totals: {
    totalDebits: number
    totalCredits: number
    closingBalance: number
  }
}
```

---

## Accounting Logic

### Normal balance convention
- **Debit-normal** (`asset`, `expense`, `cost_of_sales`, `other_expense`): balance increases with debits
- **Credit-normal** (`income`, `liability`, `equity`, `transfer`): balance increases with credits

### Transaction sign mapping
| TX type | Debit-normal effect | Credit-normal effect |
|---|---|---|
| `income` / `receipt` | − decreases | + increases |
| `expense` / `payment` | + increases | − decreases |
| `opening_balance` | + increases | − decreases |
| `transfer` | + increases | − decreases |

### Journal line mapping
| Journal side | Debit-normal effect | Credit-normal effect |
|---|---|---|
| `debit`  | + increases | − decreases |
| `credit` | − decreases | + increases |

### Sort order
Rows sorted by date ascending. On the same date, transactions appear before journal lines.

---

## Testing checklist

- [ ] Click Ledger on an expense category — verify debits show in debit column, running balance increases on each expense
- [ ] Click Ledger on an income category — verify income transactions appear in credit column
- [ ] Click Ledger on a category that has both transactions AND journal lines — verify both appear, running balance is continuous
- [ ] Change date range to "All time" — verify opening balance equals static `openingBalance` only (no pre-period activity), all rows visible
- [ ] Change to "Previous FY" — verify different rows load
- [ ] Custom date range — verify from > to shows an error, valid range loads correctly
- [ ] Export CSV — open in Excel, verify all rows present, closing balance matches panel
- [ ] Category with no activity in period — verify empty state shown (not an error)
- [ ] Pending transactions — verify shown at reduced opacity with PENDING badge
- [ ] Escape key closes panel
- [ ] Clicking backdrop closes panel
- [ ] Panel renders correctly on mobile (full width, scrollable)

---

## Rollback

No schema changes. To revert completely:

```
1. Delete src/app/api/finance/categories/[id]/ledger/route.ts
2. Delete src/components/finance/AccountLedgerPanel.tsx
3. In src/app/(app)/finance/categories/page.tsx, revert:
   - Remove `AccountLedgerPanel` import
   - Remove `BookOpen` from lucide-react imports
   - Remove `ledgerCategory` useState and `onOpenLedger` prop/handler
   - Remove <AccountLedgerPanel> JSX block
   - Remove `onOpenLedger` prop from all CategoryRow usages and its type definition
   - Remove Ledger button from CategoryRow render
```

No Docker rebuild required — no dependency changes.
