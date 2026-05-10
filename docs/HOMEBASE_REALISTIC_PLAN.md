# Homebase Finance — Honest Assessment & Revised Implementation Plan
## What Is Actually Doable, What Already Works, and What To Build Next

---

## PART 1 — HONEST ASSESSMENT

### Is it a mess? No. Is it doable? Yes. Here is the truth.

After reading every file in the finance module — all API routes, all page components,
the schema, the migration history, the P&L, the budget planner, the tax report, the
annual P&L — the system is NOT a complicated mess. It is a well-structured cash-book
application that is missing one layer: **a balance sheet**.

The previous spec was technically correct but overcomplicated for where the system
actually is. Here is the real picture.

---

### What Is Already Working Correctly

**These do not need to be touched:**

| Feature | Status | Notes |
|---|---|---|
| Bank account balances | ✅ Correct | Derived from transactions via `deriveAllAccountBalances` |
| Opening balances on bank accounts | ✅ Correct | `setOpeningBalance` posts signed OB transaction, `Set OB` button in Accounts page |
| P&L (month/quarter/year) | ✅ Working | Reads bills + income entries + transactions |
| Annual P&L (12-column table) | ✅ Working | Cash and Forecast modes |
| Tax report | ✅ Working | Per-person, per-entity, ATO brackets |
| Budget planner | ✅ Working | Income streams + expense rules by entity |
| Bills (AP flow) | ✅ Working | Invoice received → transaction created → paid → cleared |
| Income (AR flow) | ✅ Working | Remittance → transaction → received → cleared |
| Chart of Accounts | ✅ Working | All 6 types including asset/liability/equity |
| Entities | ✅ Working | Filter across all reports |
| Tax classification | ✅ Working | On bills, income, transactions, categories |
| Financial year settings | ✅ Working | Configurable FY start month |

---

### What Is Actually Missing (The Real Gap)

There are **three things** missing, not fifteen:

**1. Opening balance on Chart of Accounts entries (what the user asked about)**
   - `FinanceCategory` has NO `openingBalance` field
   - There is no "Set OB" button on the Chart of Accounts page
   - Asset/liability/equity categories have no way to store a starting balance
   - This is a 2-hour fix: add 2 columns to the schema, a new API route, and a dialog in the UI

**2. Balance Sheet page (what replaces GnuCash)**
   - There is no Balance Sheet page in the nav
   - The data to build one already exists: bank accounts have derived balances,
     and once COA entries have opening balances, asset/liability/equity are computable
   - This is a 3-4 hour build: one new API route + one new page

**3. Journal Entries page (for manual adjustments)**
   - There is no journal entry interface
   - Currently the only way to record something is via a transaction (cash book entry)
   - Depreciation, accruals, corrections cannot be recorded
   - This is a 4-6 hour build: new schema models + API + page

---

### What The Previous Spec Got Wrong

The previous spec proposed auto-generating a `JournalEntry` for EVERY `FinanceTransaction`.
This is the wrong approach for this system at this stage. Here is why:

**The system is correctly functioning as a cash-book with a category layer.**
P&L works. Budgets work. Tax works. Balances work. Adding auto-journal generation
to every transaction would:
- Require touching every transaction create/update/delete path
- Risk breaking the bill payment flow, the income receipt flow, and the balance derivation
- Create thousands of duplicate journal entries for historical data via the backfill script
- Not actually improve any of the currently-working reports
- Be very hard to test and very easy to get wrong

**The correct approach for this codebase is additive, not invasive:**
- Keep `FinanceTransaction` exactly as it is (cash book, works correctly)
- Add `JournalEntry` + `JournalLine` as a PARALLEL system for manual entries only
- Build Balance Sheet from bank account balances + COA opening balances (not journal lines)
- Let the user post journal entries for depreciation, accruals, adjustments manually
- Eventually, if they want full double-entry, they can link the two systems — but not now

---

### The Stale `currentBalance` Bug — Confirm First

Before building anything new, confirm whether the stale `currentBalance` mutations
in `src/app/api/finance/transactions/route.ts` are actually firing. Run this check:

```bash
grep -n "currentBalance.*increment" src/app/api/finance/transactions/route.ts
```

If it returns results, those 3 blocks must be removed before any new work.
If it returns nothing, someone already removed them — skip Section 2.

---

## PART 2 — THE ACTUAL PLAN

Build in this exact order. Do not skip ahead. Each step is self-contained.

---

## STEP 1 — Fix the stale currentBalance bug (30 minutes)

**File:** `src/app/api/finance/transactions/route.ts`

Find and delete these three blocks. They are clearly marked with comments.
After removing them, run a test: create a new cleared transaction, check that
`FinanceAccount.currentBalance` in the database has NOT changed (it should stay at 0
since it is derived, not stored).

### Block 1 — In POST, find the comment "Update account balance" and delete the block:
```
// Update account balance
if (accountId) {
  const balanceChange = type === 'income' ? amount : type === 'expense' ? -amount : 0
  if (balanceChange !== 0) {
    await prisma.financeAccount.update({
      where: { id: accountId },
      data: { currentBalance: { increment: balanceChange } },
    })
  }
}
```

### Block 2 — In PUT, find "Reverse old balance change" and delete the block:
```
// Reverse old balance change if account changed or amount/type changed
if (existing.accountId && (existing.accountId !== accountId || ...)) {
  ...
  await prisma.financeAccount.update({ ... data: { currentBalance: { increment: oldChange } } })
  ...
}
```

### Block 3 — In PUT, find "Apply new balance change" and delete the block:
```
// Apply new balance change
if (transaction.accountId) {
  ...
  await prisma.financeAccount.update({ ... data: { currentBalance: { increment: newChange } } })
  ...
}
```

### Block 4 — In DELETE, find "Reverse balance" and delete the block:
```
// Reverse balance
if (existing.accountId) {
  ...
  await prisma.financeAccount.update({ ... data: { currentBalance: { increment: change } } })
  ...
}
```

**Verify:** `grep -c "currentBalance.*increment" src/app/api/finance/transactions/route.ts`
Must return `0`.

---

## STEP 2 — Add opening balance to Chart of Accounts (2 hours)

This is what the user was actually asking for. It is straightforward.

### 2.1 Migration file

**Create:** `prisma/migrations/20260523000000_add_coa_opening_balance/migration.sql`

```sql
-- Add opening balance fields to FinanceCategory (Chart of Accounts)
-- These allow asset, liability, and equity accounts to record a starting balance.
-- Income and expense accounts typically have zero opening balance (they reset each year).

ALTER TABLE "FinanceCategory" ADD COLUMN "glCode"             TEXT;
ALTER TABLE "FinanceCategory" ADD COLUMN "openingBalance"     REAL;
ALTER TABLE "FinanceCategory" ADD COLUMN "openingBalanceDate" DATETIME;
```

### 2.2 Update `prisma/schema.prisma`

In the `FinanceCategory` model, after `taxDisplayLabel`, add:

```prisma
glCode              String?   // Optional account code e.g. "1001", "2100" (for Chart of Accounts numbering)
openingBalance      Float?    // Starting balance as at openingBalanceDate (asset/liability/equity only)
openingBalanceDate  DateTime? // As-at date for the opening balance
```

Run: `npx prisma generate`
Run: `npx prisma migrate deploy`

### 2.3 Update categories API

**File:** `src/app/api/finance/categories/route.ts`

In the GET handler, `findMany` already returns all fields by default in Prisma when
no `select` is used — verify the existing GET does NOT use a narrow `select:` clause
that would exclude the new fields. If it does, add the new fields to the select.

In the POST handler, add to the destructured body:
```typescript
const { name, type, parentId, color, icon, isPersonal, isLocationBased, isExternal,
        isTaxDeduction, taxIncludeInReporting, taxDisplayLabel,
        glCode } = json
// Note: openingBalance is set via its own dedicated route (see 2.4 below)
```

Add to the `prisma.financeCategory.create` data:
```typescript
glCode: glCode ?? null,
```

In the PUT handler, add to the destructured body:
```typescript
const { id, name, ..., glCode } = json
```

Add to the `prisma.financeCategory.update` data:
```typescript
...(glCode !== undefined && { glCode: glCode ?? null }),
```

**Important:** Do NOT add `openingBalance` to the POST/PUT handlers.
Opening balance must go through its own route (2.4 below) because it needs to
create a corresponding transaction for the bank account side if one is linked.
Keeping them separate prevents accidents.

### 2.4 New route: `/api/finance/categories/opening-balance/route.ts`

**Create:** `src/app/api/finance/categories/opening-balance/route.ts`

This route sets or clears the opening balance on a Chart of Accounts entry.
It is simple: it stores the amount and date on the `FinanceCategory` record.
No journal entries, no complex accounting — just a stored field that the
Balance Sheet page will read.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

// POST /api/finance/categories/opening-balance
// Body: { categoryId: string, amount: number | null, date: string | null }
// Sets or clears the opening balance on a Chart of Accounts (FinanceCategory) entry.
// Only valid for type = 'asset' | 'liability' | 'equity'.
// amount = null or 0 clears the opening balance.
// amount > 0 = normal balance (asset with funds, liability with debt owed, equity in credit)
// amount < 0 = abnormal balance (rare; e.g. an asset that is overdrawn)
export async function POST(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { categoryId, amount, date } = json

  if (!categoryId) {
    return NextResponse.json({ error: 'categoryId is required' }, { status: 400 })
  }

  // Verify the category belongs to this family
  const category = await prisma.financeCategory.findFirst({
    where: { id: categoryId, familyId: session.familyId },
    select: { id: true, name: true, type: true },
  })
  if (!category) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  // Only asset, liability, equity accounts should have opening balances.
  // Income and expense accounts reset to zero each period by definition.
  if (!['asset', 'liability', 'equity'].includes(category.type)) {
    return NextResponse.json({
      error: `Opening balances are only valid for asset, liability, and equity accounts. This account is type "${category.type}".`,
    }, { status: 400 })
  }

  const parsedAmount = (amount != null && amount !== '' && amount !== 0)
    ? parseFloat(String(amount))
    : null
  const parsedDate = (parsedAmount != null && date)
    ? new Date(date)
    : null

  // Update the category record
  const updated = await prisma.financeCategory.update({
    where: { id: categoryId },
    data: {
      openingBalance:     parsedAmount,
      openingBalanceDate: parsedDate,
    },
    select: {
      id: true, name: true, type: true,
      openingBalance: true, openingBalanceDate: true,
    },
  })

  return NextResponse.json({
    success: true,
    category: {
      ...updated,
      openingBalanceDate: updated.openingBalanceDate?.toISOString() ?? null,
    },
    message: parsedAmount == null
      ? `Opening balance cleared for ${category.name}`
      : `Opening balance set to ${parsedAmount} for ${category.name}`,
  })
}
```

### 2.5 Update Chart of Accounts page UI

**File:** `src/app/(app)/finance/categories/page.tsx`

#### 2.5.1 Update Category interface — add three fields:
```typescript
interface Category {
  id: string; name: string; type: string; parentId: string | null
  color: string | null; icon: string | null; isSystem: boolean
  level: number; isPersonal: boolean; isLocationBased: boolean; isExternal: boolean
  isTaxDeduction: boolean
  taxIncludeInReporting: boolean
  taxDisplayLabel: string | null
  glCode: string | null              // NEW
  openingBalance: number | null      // NEW
  openingBalanceDate: string | null  // NEW
  parent?: { id: string; name: string } | null
  children?: Category[]
  _count?: { transactions: number; recurringBills: number; incomeEntries: number }
}
```

#### 2.5.2 Add state to CategoriesPage:
```typescript
// Opening balance edit dialog state
const [obEdit, setObEdit] = useState<{
  cat: Category
  amount: string
  date: string
} | null>(null)
const [obSaving, setObSaving] = useState(false)
```

#### 2.5.3 Add handleObSave function to CategoriesPage:
```typescript
async function handleObSave() {
  if (!obEdit) return
  const rawAmount = obEdit.amount.trim()
  const amount = rawAmount !== '' && rawAmount !== '0' ? parseFloat(rawAmount) : null
  setObSaving(true)
  try {
    const res = await fetch('/api/finance/categories/opening-balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryId: obEdit.cat.id,
        amount: amount ?? 0,
        date: obEdit.date || new Date().toISOString().split('T')[0],
      }),
    })
    if (res.ok) {
      const data = await res.json()
      toast.success(data.message)
      setObEdit(null)
      load()
    } else {
      const err = await res.json()
      toast.error(err.error ?? 'Failed to update opening balance')
    }
  } finally {
    setObSaving(false)
  }
}
```

#### 2.5.4 Add the Opening Balance dialog JSX to CategoriesPage return statement,
ABOVE the CategoryDialog component already there:

```tsx
{/* Opening Balance Dialog — for asset, liability, equity accounts only */}
<Dialog open={!!obEdit} onOpenChange={open => { if (!open) setObEdit(null) }}>
  <DialogContent className="sm:max-w-sm" showCloseButton>
    <DialogHeader>
      <DialogTitle>Opening Balance — {obEdit?.cat.name}</DialogTitle>
    </DialogHeader>
    {obEdit && (
      <div className="space-y-4">
        <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          {obEdit.cat.type === 'asset' && 'Enter the balance this asset account held as at the date below. Positive = funds/value held. Negative = unusual (e.g. overdrawn asset).'}
          {obEdit.cat.type === 'liability' && 'Enter the amount owed as at the date below. Positive = debt outstanding. Negative = unusual (creditor paid more than owed).'}
          {obEdit.cat.type === 'equity' && 'Enter the equity balance as at the date below. Positive = equity in your favour.'}
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Opening Balance ($)</label>
          <input
            type="number"
            step="0.01"
            value={obEdit.amount}
            onChange={e => setObEdit(p => p ? { ...p, amount: e.target.value } : p)}
            placeholder={
              obEdit.cat.type === 'liability' ? 'e.g. 350000 for a $350k mortgage' :
              obEdit.cat.type === 'asset'     ? 'e.g. 45000 for $45k in this account' :
              'e.g. 10000'
            }
            className="w-full mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            disabled={obSaving}
            autoFocus
          />
          <p className="text-xs text-muted-foreground/60 mt-0.5">
            Leave blank or 0 to clear the opening balance.
          </p>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">As at Date</label>
          <input
            type="date"
            value={obEdit.date}
            onChange={e => setObEdit(p => p ? { ...p, date: e.target.value } : p)}
            className="w-full mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            disabled={obSaving}
          />
          <p className="text-xs text-muted-foreground/60 mt-0.5">
            The date from which this balance applies (usually 1 July of the FY start).
          </p>
        </div>
      </div>
    )}
    <DialogFooter>
      <button
        onClick={() => setObEdit(null)}
        className="rounded-md border border-border px-4 py-1.5 text-sm"
        disabled={obSaving}
      >
        Cancel
      </button>
      <button
        onClick={handleObSave}
        disabled={obSaving}
        className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium disabled:opacity-50"
      >
        {obSaving ? 'Saving…' : 'Save Opening Balance'}
      </button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

#### 2.5.5 Update CategoryRow to show Set OB button

In the `CategoryRow` component, add `onSetOpeningBalance` to the props:

```typescript
function CategoryRow({
  cat, childrenMap, depth, onEdit, onDelete, getTypeBadge,
  isCollapsed, onToggleCollapse, showToggle,
  onSetOpeningBalance,  // NEW PROP
}: {
  cat: Category
  childrenMap: Map<string, Category[]>
  depth: number
  onEdit: (c: Category) => void
  onDelete: (id: string) => void
  getTypeBadge: (type: string) => React.ReactNode
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  showToggle?: boolean
  onSetOpeningBalance: (c: Category) => void  // NEW PROP
})
```

In the row's action buttons section, BEFORE the delete button and AFTER the edit button,
add the opening balance button. Show it only for asset, liability, equity types:

```tsx
{/* Set OB button — only for balance sheet account types */}
{(cat.type === 'asset' || cat.type === 'liability' || cat.type === 'equity') && !cat.isSystem && (
  <button
    onClick={() => onSetOpeningBalance(cat)}
    title="Set opening balance"
    className={cn(
      'px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors',
      cat.openingBalance != null
        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
        : 'text-muted-foreground border-border hover:border-primary hover:text-primary'
    )}
  >
    {cat.openingBalance != null
      ? `OB: ${new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(cat.openingBalance)}`
      : 'Set OB'}
  </button>
)}
```

#### 2.5.6 Update all CategoryRow usages in orderedRoots.map and children rendering

Pass the new prop down. In `orderedRoots.map`:
```tsx
<CategoryRow
  key={cat.id}
  cat={cat}
  childrenMap={childMap}
  depth={0}
  onEdit={openEdit}
  onDelete={handleDelete}
  getTypeBadge={getTypeBadge}
  isCollapsed={collapsedRootIds.has(cat.id)}
  onToggleCollapse={() => toggleCollapse(cat.id)}
  showToggle={(childMap.get(cat.id) ?? []).length > 0}
  onSetOpeningBalance={cat => {
    setObEdit({
      cat,
      amount: cat.openingBalance?.toString() ?? '',
      date: cat.openingBalanceDate
        ? new Date(cat.openingBalanceDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
    })
  }}
/>
```

In the recursive children rendering inside `CategoryRow`, pass `onSetOpeningBalance` through:
```tsx
{hasChildren && !isCollapsed && children.map(child => (
  <CategoryRow
    key={child.id}
    cat={child}
    childrenMap={childrenMap}
    depth={depth + 1}
    onEdit={onEdit}
    onDelete={onDelete}
    getTypeBadge={getTypeBadge}
    onSetOpeningBalance={onSetOpeningBalance}
  />
))}
```

#### 2.5.7 Add GL Code field to CategoryDialog form

In `CategoryDialog`, add to form state:
```typescript
const [form, setForm] = useState({
  name: '',
  type: 'expense',
  parentId: '',
  color: '#6366F1',
  icon: '',
  isPersonal: false,
  isLocationBased: false,
  isExternal: false,
  isTaxDeduction: false,
  taxIncludeInReporting: false,
  taxDisplayLabel: '',
  glCode: '',  // NEW
})
```

In the editing useEffect, add:
```typescript
glCode: editing.glCode ?? '',
```

In the non-editing reset, add:
```typescript
glCode: '',
```

In handleSave payload, add:
```typescript
glCode: form.glCode || null,
```

In the form JSX, add AFTER the Name field and BEFORE the Type field:
```tsx
<div>
  <label className="text-xs text-muted-foreground">GL Code (optional)</label>
  <input
    value={form.glCode}
    onChange={e => setForm(p => ({ ...p, glCode: e.target.value }))}
    onKeyDown={handleKeyDown}
    placeholder="e.g. 1001, 2100, 4000"
    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
    disabled={saving}
  />
</div>
```

#### 2.5.8 Show GL Code in category row display

In `CategoryRow`, in the row's name/flags section, show the GL code if present:

```tsx
<div className="flex items-center gap-2 flex-wrap">
  {cat.glCode && (
    <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
      {cat.glCode}
    </span>
  )}
  <span className="text-sm font-medium">{cat.name}</span>
  {/* ...existing system badge and flags... */}
</div>
```

---

## STEP 3 — Balance Sheet API (2 hours)

**Create:** `src/app/api/finance/balance-sheet/route.ts`

The Balance Sheet is computed from two sources:
1. **Bank accounts (FinanceAccount):** balance derived from cleared transactions
2. **COA entries (FinanceCategory):** opening balance stored directly on the record

This is simple and correct for the current architecture. No journal lines needed.
The Balance Sheet shows what you OWN (assets) minus what you OWE (liabilities) = NET WORTH.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

// GET /api/finance/balance-sheet?asAt=2026-06-30&entityId=optional
//
// Returns the Balance Sheet as at a specific date.
// Assets section:   bank accounts (derived balance) + asset COA entries (opening balance)
// Liabilities:      liability COA entries (opening balance)
// Equity:           equity COA entries (opening balance)
// Net Worth:        Total Assets - Total Liabilities
//
// NOTE: This is an opening-balance-based balance sheet. It shows the position
// as at the date the opening balances were set. For a full dynamic balance sheet,
// journal entries would be needed — that is a future enhancement. For now this
// gives Michelle the net worth view she needs.
export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const asAtParam = searchParams.get('asAt')
  const entityId  = searchParams.get('entityId') ?? undefined

  // Default to today
  const asAt = asAtParam ? new Date(asAtParam) : new Date()
  // Set to end of day so transactions on that date are included
  asAt.setHours(23, 59, 59, 999)

  const familyId = session.familyId

  // ── 1. Bank accounts with derived balances ──────────────────────────────
  // Derive each bank account's balance from cleared transactions up to asAt.
  const bankAccounts = await prisma.financeAccount.findMany({
    where: { familyId, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true, name: true, type: true, institution: true,
      currency: true, creditLimit: true, color: true, icon: true,
    },
  })

  // Fetch all cleared transactions up to asAt in a single query
  const txFilter: any = {
    familyId,
    isCleared: true,
    date: { lte: asAt },
  }
  if (entityId) txFilter.entityId = entityId

  const clearedTxs = await prisma.financeTransaction.findMany({
    where: txFilter,
    select: { accountId: true, type: true, amount: true },
  })

  // Build balance map: accountId → balance
  const bankBalanceMap = new Map<string, number>()
  for (const tx of clearedTxs) {
    if (!tx.accountId) continue
    const cur = bankBalanceMap.get(tx.accountId) ?? 0
    if (tx.type === 'income' || tx.type === 'opening_balance') {
      bankBalanceMap.set(tx.accountId, cur + tx.amount)
    } else if (tx.type === 'expense') {
      bankBalanceMap.set(tx.accountId, cur - tx.amount)
    }
    // transfers cancel out; skip
  }

  const bankAccountRows = bankAccounts.map(acct => ({
    id:          acct.id,
    name:        acct.name,
    accountType: acct.type,
    institution: acct.institution,
    currency:    acct.currency,
    creditLimit: acct.creditLimit,
    color:       acct.color,
    icon:        acct.icon,
    balance:     Math.round((bankBalanceMap.get(acct.id) ?? 0) * 100) / 100,
    source:      'bank_account' as const,
  })).filter(a => a.balance !== 0)  // only show accounts with activity

  // ── 2. COA entries with opening balances ──────────────────────────────
  // Fetch all asset, liability, equity categories that have an opening balance set.
  // Only show entries where openingBalanceDate <= asAt (or no date set).
  const coaWhere: any = {
    familyId,
    type: { in: ['asset', 'liability', 'equity'] },
    openingBalance: { not: null },
  }

  const coaEntries = await prisma.financeCategory.findMany({
    where: coaWhere,
    include: { parent: { select: { id: true, name: true } } },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  })

  // Filter by date: if openingBalanceDate is set, only include if <= asAt
  const filteredCOA = coaEntries.filter(cat => {
    if (!cat.openingBalanceDate) return true  // no date = always include
    return cat.openingBalanceDate <= asAt
  })

  const coaRows = filteredCOA.map(cat => ({
    id:                 cat.id,
    name:               cat.name,
    glCode:             cat.glCode,
    type:               cat.type,
    parentId:           cat.parentId,
    parentName:         cat.parent?.name ?? null,
    openingBalance:     cat.openingBalance!,
    openingBalanceDate: cat.openingBalanceDate?.toISOString().split('T')[0] ?? null,
    isSystem:           cat.isSystem,
    source:             'coa' as const,
  }))

  // ── 3. Separate into sections ────────────────────────────────────────────
  const assetBankRows      = bankAccountRows.filter(a => !['credit', 'loan'].includes(a.accountType))
  const liabilityBankRows  = bankAccountRows.filter(a => ['credit', 'loan'].includes(a.accountType))
  const assetCOARows       = coaRows.filter(c => c.type === 'asset')
  const liabilityCOARows   = coaRows.filter(c => c.type === 'liability')
  const equityCOARows      = coaRows.filter(c => c.type === 'equity')

  // ── 4. Calculate totals ──────────────────────────────────────────────────
  // For bank accounts: positive balance = asset, negative balance = liability (e.g. credit card in debt)
  const totalBankAssets       = assetBankRows.reduce((s, a) => s + Math.max(0, a.balance), 0)
  const totalBankLiabilities  = [
    ...liabilityBankRows.map(a => Math.abs(Math.min(0, a.balance))),   // liability accounts in debt
    ...assetBankRows.map(a => Math.abs(Math.min(0, a.balance))),       // asset accounts overdrawn
    ...liabilityBankRows.map(a => Math.max(0, a.balance)),             // credit card debt (positive balance = owed)
  ].reduce((s, v) => s + v, 0)

  // For credit/loan accounts: balance is how much is owed (positive = liability)
  const totalCreditCardDebt = liabilityBankRows.reduce((s, a) => s + Math.abs(a.balance), 0)

  const totalCOAAssets      = assetCOARows.reduce((s, c) => s + c.openingBalance, 0)
  const totalCOALiabilities = liabilityCOARows.reduce((s, c) => s + c.openingBalance, 0)
  const totalEquity         = equityCOARows.reduce((s, c) => s + c.openingBalance, 0)

  // Total assets = bank assets + COA assets
  const totalAssets      = Math.round((totalBankAssets + totalCOAAssets) * 100) / 100
  // Total liabilities = credit card debt + COA liabilities
  const totalLiabilities = Math.round((totalCreditCardDebt + totalCOALiabilities) * 100) / 100
  // Net worth = assets - liabilities (equity should equal this when balanced)
  const netWorth         = Math.round((totalAssets - totalLiabilities) * 100) / 100

  return NextResponse.json({
    asAt: asAt.toISOString().split('T')[0],
    assets: {
      bankAccounts:  assetBankRows,
      coaAccounts:   assetCOARows,
      totalBank:     Math.round(totalBankAssets * 100) / 100,
      totalCOA:      Math.round(totalCOAAssets * 100) / 100,
      total:         totalAssets,
    },
    liabilities: {
      bankAccounts:  liabilityBankRows,
      coaAccounts:   liabilityCOARows,
      totalBank:     Math.round(totalCreditCardDebt * 100) / 100,
      totalCOA:      Math.round(totalCOALiabilities * 100) / 100,
      total:         totalLiabilities,
    },
    equity: {
      coaAccounts: equityCOARows,
      total:       Math.round(totalEquity * 100) / 100,
    },
    netWorth,
    // Note: equity will not equal netWorth unless all transactions are journaled.
    // For now this is expected — the system is a hybrid cash-book + manual OB system.
    equityMatchesNetWorth: Math.abs(totalEquity - netWorth) < 0.01,
  })
}
```

---

## STEP 4 — Balance Sheet page (3 hours)

**Create:** `src/app/(app)/finance/balance-sheet/page.tsx`

This is a single client component. Fetch from `/api/finance/balance-sheet` when
`asAt` or `entityId` changes.

```
LAYOUT:

┌──────────────────────────────────────────────────────────────┐
│  Balance Sheet              As at: [date input]              │
│  Entity: [All] [Personal] [Super] [Unitrak] [Hopevale]      │
│                                                              │
│  ── ASSETS ─────────────────────────────────────────────    │
│                                                              │
│  Bank & Cash Accounts                                        │
│    ANZ Savings                              $45,230          │
│    ING Orange Everyday                      $12,800          │
│    Cash on hand                              $1,200          │
│  Subtotal — Bank & Cash                     $59,230          │
│                                                              │
│  Other Assets                                                │
│    [1300] Investment Portfolio             $180,000          │
│    [1400] Property — 12 Oak St             $750,000          │
│    [1500] Vehicle                           $35,000          │
│  Subtotal — Other Assets                   $965,000          │
│                                                              │
│  TOTAL ASSETS                            $1,024,230  ══════ │
│                                                              │
│  ── LIABILITIES ────────────────────────────────────────    │
│                                                              │
│  Credit & Loan Accounts                                      │
│    Visa Credit Card                          $4,500          │
│  Subtotal — Loans                            $4,500          │
│                                                              │
│  Other Liabilities                                           │
│    [2300] Mortgage — 12 Oak St             $350,000          │
│    [2400] PAYG Payable                       $8,200          │
│  Subtotal — Other Liabilities              $358,200          │
│                                                              │
│  TOTAL LIABILITIES                         $362,700  ══════ │
│                                                              │
│  ── EQUITY ─────────────────────────────────────────────    │
│    [3100] Opening Balances                 $661,530          │
│  TOTAL EQUITY                              $661,530  ══════ │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  NET WORTH  (Assets − Liabilities)      $661,530     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ⚠ Note: Equity will match Net Worth once all assets and    │
│    liabilities have opening balances set in Chart of Accounts│
└──────────────────────────────────────────────────────────────┘
```

**Full implementation:**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { Building2, TrendingUp, TrendingDown, Wallet, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface BankRow {
  id: string; name: string; accountType: string; institution: string | null
  currency: string; creditLimit: number | null; color: string | null
  icon: string | null; balance: number; source: 'bank_account'
}

interface COARow {
  id: string; name: string; glCode: string | null; type: string
  parentId: string | null; parentName: string | null
  openingBalance: number; openingBalanceDate: string | null
  isSystem: boolean; source: 'coa'
}

interface BalanceSheetSection<T> {
  bankAccounts: BankRow[]
  coaAccounts: T[]
  totalBank: number
  totalCOA: number
  total: number
}

interface BalanceSheetResponse {
  asAt: string
  assets:      BalanceSheetSection<COARow>
  liabilities: BalanceSheetSection<COARow>
  equity: { coaAccounts: COARow[]; total: number }
  netWorth: number
  equityMatchesNetWorth: boolean
}

interface Entity { id: string; name: string; type: string; isDefault: boolean; color: string | null }

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, currency = 'AUD') {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)
}

function SectionRow({ label, amount, indent, bold, glCode }: {
  label: string; amount: number; indent?: boolean; bold?: boolean; glCode?: string | null
}) {
  return (
    <div className={cn(
      'flex items-center justify-between py-1 text-sm',
      indent && 'pl-4',
    )}>
      <span className={cn('flex items-center gap-2 text-muted-foreground', bold && 'font-semibold text-foreground')}>
        {glCode && (
          <span className="text-[10px] font-mono bg-muted px-1 rounded text-muted-foreground/70">
            {glCode}
          </span>
        )}
        {label}
      </span>
      <span className={cn('tabular-nums font-medium', bold && 'font-bold')}>
        {fmt(amount)}
      </span>
    </div>
  )
}

function Divider() { return <div className="border-t border-border my-1" /> }

function SectionHeader({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-2">
      {icon}
      <h2 className="text-base font-bold">{label}</h2>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BalanceSheetPage() {
  const [data, setData]         = useState<BalanceSheetResponse | null>(null)
  const [entities, setEntities] = useState<Entity[]>([])
  const [entityId, setEntityId] = useState('')
  const [asAt, setAsAt]         = useState(() => new Date().toISOString().split('T')[0])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    fetch('/api/finance/entities')
      .then(r => r.ok ? r.json() : [])
      .then(setEntities)
      .catch(() => {})
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const params = new URLSearchParams({ asAt })
        if (entityId) params.set('entityId', entityId)
        const res = await fetch(`/api/finance/balance-sheet?${params}`)
        if (res.ok) setData(await res.json())
      } finally { setLoading(false) }
    }
    load()
  }, [asAt, entityId])

  if (loading && !data) {
    return <div className="p-4 text-muted-foreground text-sm">Loading balance sheet…</div>
  }
  if (!data) return null

  const hasEquityEntries = data.equity.coaAccounts.length > 0
  const hasCOAAssets     = data.assets.coaAccounts.length > 0
  const hasCOALiabilities = data.liabilities.coaAccounts.length > 0
  const showSetupGuide   = !hasCOAAssets && !hasCOALiabilities && !hasEquityEntries

  return (
    <div className="space-y-6 pb-8">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Balance Sheet
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            What you own minus what you owe = your net worth.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <label className="text-xs text-muted-foreground mr-1">As at</label>
            <input
              type="date"
              value={asAt}
              onChange={e => setAsAt(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Entity filter */}
      {entities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setEntityId('')}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-full border transition-colors',
              !entityId
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            All
          </button>
          {entities.map(en => (
            <button
              key={en.id}
              onClick={() => setEntityId(entityId === en.id ? '' : en.id)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-full border transition-colors',
                entityId === en.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {en.name}
            </button>
          ))}
        </div>
      )}

      {/* Setup guide — shown when no COA opening balances set yet */}
      {showSetupGuide && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-5 space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Set up your Balance Sheet
          </h3>
          <p className="text-sm text-muted-foreground">
            Your bank account balances are shown below. To complete the Balance Sheet with
            property, investments, mortgages, and other assets/liabilities:
          </p>
          <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
            <li>
              Go to <strong className="text-foreground">Chart of Accounts</strong> and create
              accounts with type <strong className="text-foreground">Asset</strong>,{' '}
              <strong className="text-foreground">Liability</strong>, or{' '}
              <strong className="text-foreground">Equity</strong>.
            </li>
            <li>
              Click <strong className="text-foreground">Set OB</strong> on each account to enter
              its opening balance and as-at date.
            </li>
            <li>
              Return here and the Balance Sheet will populate automatically.
            </li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Examples: Property — 12 Oak St (Asset, $750,000) · Mortgage (Liability, $350,000) ·
            Investment Portfolio (Asset, $180,000)
          </p>
        </div>
      )}

      {/* ── ASSETS ────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border p-4 space-y-1">
        <SectionHeader
          label="ASSETS"
          icon={<TrendingUp className="h-4 w-4 text-green-500" />}
        />

        {/* Bank accounts (derived from transactions) */}
        {data.assets.bankAccounts.length > 0 && (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Bank &amp; Cash Accounts
            </p>
            {data.assets.bankAccounts.map(a => (
              <SectionRow
                key={a.id}
                label={a.institution ? `${a.name} (${a.institution})` : a.name}
                amount={a.balance}
                indent
              />
            ))}
            {data.assets.coaAccounts.length > 0 && (
              <SectionRow label="Subtotal — Bank &amp; Cash" amount={data.assets.totalBank} bold />
            )}
          </>
        )}

        {/* COA asset accounts (opening balance) */}
        {data.assets.coaAccounts.length > 0 && (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1">
              Other Assets
            </p>
            {data.assets.coaAccounts.map(c => (
              <SectionRow
                key={c.id}
                label={c.parentName ? `${c.parentName} — ${c.name}` : c.name}
                amount={c.openingBalance}
                glCode={c.glCode}
                indent
              />
            ))}
            {data.assets.bankAccounts.length > 0 && (
              <SectionRow label="Subtotal — Other Assets" amount={data.assets.totalCOA} bold />
            )}
          </>
        )}

        <Divider />
        <SectionRow label="TOTAL ASSETS" amount={data.assets.total} bold />
      </div>

      {/* ── LIABILITIES ───────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border p-4 space-y-1">
        <SectionHeader
          label="LIABILITIES"
          icon={<TrendingDown className="h-4 w-4 text-red-500" />}
        />

        {/* Credit card / loan accounts from bank accounts */}
        {data.liabilities.bankAccounts.length > 0 && (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Credit Cards &amp; Loans (from Accounts)
            </p>
            {data.liabilities.bankAccounts.map(a => (
              <SectionRow
                key={a.id}
                label={a.institution ? `${a.name} (${a.institution})` : a.name}
                amount={Math.abs(a.balance)}
                indent
              />
            ))}
            {data.liabilities.coaAccounts.length > 0 && (
              <SectionRow label="Subtotal — Credit &amp; Loans" amount={data.liabilities.totalBank} bold />
            )}
          </>
        )}

        {/* COA liability accounts */}
        {data.liabilities.coaAccounts.length > 0 && (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1">
              Other Liabilities
            </p>
            {data.liabilities.coaAccounts.map(c => (
              <SectionRow
                key={c.id}
                label={c.parentName ? `${c.parentName} — ${c.name}` : c.name}
                amount={c.openingBalance}
                glCode={c.glCode}
                indent
              />
            ))}
            {data.liabilities.bankAccounts.length > 0 && (
              <SectionRow label="Subtotal — Other Liabilities" amount={data.liabilities.totalCOA} bold />
            )}
          </>
        )}

        {data.assets.total === 0 && data.liabilities.total === 0 && (
          <p className="text-sm text-muted-foreground py-2">
            No liabilities recorded yet. Add liability accounts in Chart of Accounts.
          </p>
        )}

        <Divider />
        <SectionRow label="TOTAL LIABILITIES" amount={data.liabilities.total} bold />
      </div>

      {/* ── EQUITY ────────────────────────────────────────────────────────── */}
      {hasEquityEntries && (
        <div className="rounded-lg border border-border p-4 space-y-1">
          <SectionHeader label="EQUITY" icon={<Wallet className="h-4 w-4 text-purple-500" />} />
          {data.equity.coaAccounts.map(c => (
            <SectionRow
              key={c.id}
              label={c.name}
              amount={c.openingBalance}
              glCode={c.glCode}
              indent
            />
          ))}
          <Divider />
          <SectionRow label="TOTAL EQUITY" amount={data.equity.total} bold />
        </div>
      )}

      {/* ── NET WORTH ─────────────────────────────────────────────────────── */}
      <div className={cn(
        'rounded-lg border-2 p-5 flex items-center justify-between',
        data.netWorth >= 0
          ? 'border-green-500/40 bg-green-500/5'
          : 'border-red-500/40 bg-red-500/5',
      )}>
        <div>
          <p className={cn(
            'text-lg font-bold',
            data.netWorth >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
          )}>
            NET WORTH
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Total Assets ({fmt(data.assets.total)}) − Total Liabilities ({fmt(data.liabilities.total)})
          </p>
        </div>
        <p className={cn(
          'text-3xl font-bold tabular-nums',
          data.netWorth >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
        )}>
          {fmt(data.netWorth)}
        </p>
      </div>

      {/* Equity matching note */}
      {hasEquityEntries && !data.equityMatchesNetWorth && (
        <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Equity ({fmt(data.equity.total)}) does not equal Net Worth ({fmt(data.netWorth)}).
            This is expected until all assets, liabilities, and income/expense history are
            recorded with journal entries. Set opening balances on all COA accounts to
            bring these into alignment.
          </span>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Bank account balances are derived from cleared transactions recorded in Homebase.
        Property, investments, mortgages, and other items are based on the opening balances
        set in Chart of Accounts. Update these manually when values change.
      </p>
    </div>
  )
}
```

---

## STEP 5 — Add Balance Sheet to navigation (5 minutes)

**File:** `src/app/(app)/finance/layout.tsx`

Find the `tabs` array and add after the `Annual P&L` entry:

```typescript
{ href: '/finance/balance-sheet', label: 'Balance Sheet', exact: false },
```

That is the complete change to this file.

---

## STEP 6 — Journal Entries (Build AFTER steps 1-5 are verified working)

**Do not build this until the Balance Sheet is working and confirmed correct.**
Journals are an enhancement, not a fix. The system works correctly without them.

The journal system requires:
- Two new Prisma models (`JournalEntry`, `JournalLine`)
- One new migration file
- One new API route (`/api/finance/journals`)
- One new page (`/finance/journals`)
- No changes to existing APIs (journals are additive, not invasive)

A separate detailed spec will be written for this step after the balance sheet is confirmed.

---

## STEP 7 — Verification Checklist

Work through every item before marking the implementation done.

### Step 1 — currentBalance mutations removed
- [ ] `grep -c "currentBalance.*increment" src/app/api/finance/transactions/route.ts` returns `0`
- [ ] Create a new cleared transaction in the UI, check the `FinanceAccount` record in the DB — `currentBalance` stored field should NOT have changed (it stays at 0 or whatever it was)
- [ ] Accounts page still shows correct derived balances after creating/deleting transactions

### Step 2 — COA Opening Balances
- [ ] `npx prisma migrate status` shows `20260523000000_add_coa_opening_balance` as applied
- [ ] `npx prisma generate` succeeds with no TypeScript errors introduced
- [ ] Chart of Accounts page loads normally — existing categories unaffected
- [ ] GL Code field appears in Add Account / Edit Account dialog
- [ ] GL Code saves and displays as monospace badge on the category row
- [ ] "Set OB" button appears ONLY on asset, liability, equity type accounts
- [ ] "Set OB" button does NOT appear on expense, income, transfer accounts
- [ ] "Set OB" button does NOT appear on system accounts (isSystem = true)
- [ ] Click "Set OB" on an asset account → dialog opens with correct title and hint text
- [ ] Enter $100,000, select a date, save → success toast, button changes to "OB: $100,000"
- [ ] Click "Set OB" again → dialog opens pre-filled with existing amount and date
- [ ] Change amount → saves correctly, button updates
- [ ] Set amount to 0 → clears the OB, button returns to "Set OB"
- [ ] Click "Set OB" on a liability account → hint text says "amount owed"
- [ ] Attempting to set OB on expense account via direct API call returns 400 error
- [ ] `/api/finance/categories/opening-balance` POST with invalid categoryId returns 404
- [ ] `/api/finance/categories/opening-balance` POST with expense type categoryId returns 400

### Step 3 — Balance Sheet API
- [ ] `GET /api/finance/balance-sheet` returns 200 with correct structure
- [ ] Bank accounts with positive cleared transaction balances appear in `assets.bankAccounts`
- [ ] Credit card accounts (type=credit) appear in `liabilities.bankAccounts`
- [ ] COA asset account with OB $100,000 appears in `assets.coaAccounts`
- [ ] COA liability account with OB $350,000 appears in `liabilities.coaAccounts`
- [ ] `netWorth` = `assets.total` - `liabilities.total` (verify arithmetic manually)
- [ ] `asAt` filter works: COA entry with `openingBalanceDate` AFTER `asAt` is excluded
- [ ] `asAt` filter for bank accounts: only cleared transactions on or before `asAt` count

### Step 4 — Balance Sheet Page
- [ ] `/finance/balance-sheet` route loads without errors
- [ ] Page shows "Balance Sheet" heading with Building2 icon
- [ ] Date picker defaults to today
- [ ] Bank accounts appear in Assets section
- [ ] Credit card accounts appear in Liabilities section
- [ ] COA accounts with opening balances appear in correct sections
- [ ] NET WORTH displayed prominently at the bottom
- [ ] NET WORTH calculation matches manual calculation
- [ ] Changing the date updates balances (try a past date before any transactions)
- [ ] Entity filter tabs appear when entities exist
- [ ] Setup guide appears when no COA opening balances are set
- [ ] Setup guide disappears after setting at least one COA opening balance

### Step 5 — Navigation
- [ ] "Balance Sheet" tab appears in finance navigation
- [ ] Clicking the tab navigates to `/finance/balance-sheet`
- [ ] Tab highlights correctly when on the balance sheet page
- [ ] No existing tabs broken or shifted

---

## PART 3 — ANSWERS TO THE KEY QUESTIONS

### "Is this actually doable?"
Yes. The system is in good shape. The cash-book layer (P&L, tax, budget) works correctly.
We are adding two new things: opening balances on COA entries (a 2-field schema change) and
a Balance Sheet page that reads those balances. This is straightforward, safe, and reversible.

### "Did we go down the wrong path?"
No. The approach is correct for a household + small business finance app. GnuCash is
intimidating because it forces full double-entry from day one. This system starts with
cash-book (which most people understand) and can grow into double-entry over time.
The foundation is solid. We are just adding the balance sheet view.

### "What about journals?"
Build them after the balance sheet is confirmed working. They are additive — they
do not change anything currently working. The balance sheet does not need journals
to function correctly for the use case described (tracking net worth, assets, liabilities).

### "What was the real user question?"
The user wanted to see an opening balance on Chart of Accounts entries. That is Step 2.
Everything else flows from that: once COA entries have balances, the Balance Sheet
becomes possible. The journals are a future enhancement for depreciation and adjustments.

### "Is the previous complex spec wrong?"
The JournalEntry + JournalLine schema is architecturally correct and will eventually
be needed. But auto-generating journal entries from every transaction is premature
optimization that risks breaking working code. Build the simple version first (Steps 1-5),
confirm it works, then add journals (Step 6) as a clean additive layer.
