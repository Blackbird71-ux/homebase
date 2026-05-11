# Finance Audit Fix Plan

**Source:** [`docs/homebase-finance-audit-report.md`](homebase-finance-audit-report.md)
**Codebase:** Next.js · Prisma · SQLite · Docker → Synology NAS (Australia/Sydney timezone)

---

## CRITICAL REQUIREMENTS

- **NO MISTAKES ALLOWED** — These fixes must work on first deployment
- **PHASED APPROACH** — Implement in the exact order below, stopping after each phase to verify
- **TEST EACH PHASE** — After completing each phase, run the corresponding verification commands
- **COMMIT AFTER EACH PHASE** — Git commit with the phase name before moving to next phase
- **NO REGRESSIONS** — Existing functionality must not break

---

## PHASE 1: Commit Uncommitted P&L Fixes (P0-1)

These fixes are already in the working tree but not committed.

**Actions:**
```bash
git add src/components/layout/QuickAdd.tsx
git add src/app/(app)/finance/profit-loss/page.tsx
git add docs/bug-fix-pnl-*.md
git commit -m "fix: P&L double-count, null-entity filter, QuickAdd isCleared"
```

**Verification:**
```bash
git status
# Should show "nothing to commit, working tree clean"
```

**STOP** — Do not proceed to Phase 2 until this commit is complete.

---

## PHASE 2: Australian Timezone — Add todayAU() Helper (P1-1 Prep)

**Action:** Create new helper function in [`src/lib/utils.ts`](../src/lib/utils.ts).

```typescript
/**
 * Returns today's date as a YYYY-MM-DD string in Australia/Sydney timezone.
 * Use INSTEAD OF new Date().toISOString().split('T')[0] for all date form defaults.
 */
export function todayAU(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
```

**Verification:**
```bash
# Create a quick test file to verify the function returns correct AU date
node -e "const {todayAU} = require('./src/lib/utils.ts'); console.log('Today AU:', todayAU());"
# Should show today's date in YYYY-MM-DD format based on Sydney time
```

**STOP** — Verify the function returns the correct AU date before proceeding.

---

## PHASE 3: Apply todayAU() to All Form Defaults (P1-1)

### File 1: [`src/app/(app)/finance/bills/page.tsx`](../src/app/(app)/finance/bills/page.tsx)

Add import at top:
```typescript
import { todayAU } from '@/lib/utils'
```

**emptyForm object** (line ~111):
```typescript
// BEFORE:
nextDueDate: new Date().toISOString().split('T')[0],

// AFTER:
nextDueDate: todayAU(),
```

**handleMarkPaid function** (line ~384-385):
```typescript
// BEFORE:
setPaidConfirmDate(new Date().toISOString().split('T')[0])

// AFTER:
setPaidConfirmDate(todayAU())
```

### File 2: [`src/app/(app)/finance/journals/page.tsx`](../src/app/(app)/finance/journals/page.tsx)

Add import:
```typescript
import { todayAU } from '@/lib/utils'
```

**emptyForm() function** (line ~125):
```typescript
// BEFORE:
date: new Date().toISOString().split('T')[0],

// AFTER:
date: todayAU(),
```

**openReversal() function** (line ~465):
```typescript
// BEFORE:
date: new Date().toISOString().split('T')[0],

// AFTER:
date: todayAU(),
```

**openVoid() function** (line ~433):
```typescript
// BEFORE:
setVoidDate(new Date().toISOString().split('T')[0])

// AFTER:
setVoidDate(todayAU())
```

### File 3: [`src/app/(app)/finance/transactions/page.tsx`](../src/app/(app)/finance/transactions/page.tsx)

Add import:
```typescript
import { todayAU } from '@/lib/utils'
```

**form useState default** (line ~49):
```typescript
// BEFORE:
date: new Date().toISOString().split('T')[0],

// AFTER:
date: todayAU(),
```

**openNew() function** (line ~106):
```typescript
// BEFORE:
date: new Date().toISOString().split('T')[0],

// AFTER:
date: todayAU(),
```

### Verification for Phase 3:
```bash
grep -n "toISOString().split('T')\[0\]" src/app/(app)/finance/bills/page.tsx src/app/(app)/finance/journals/page.tsx src/app/(app)/finance/transactions/page.tsx
# Should return no matches (or only commented out lines)
```

**STOP** — Verify no toISOString().split('T')[0] patterns remain in these three files.

---

## PHASE 4: Fix Balance Sheet asAt Fallback (P1-2)

**File:** [`src/app/api/finance/balance-sheet/route.ts`](../src/app/api/finance/balance-sheet/route.ts)

Find the asAt parameter handling (around line 77-79):

```typescript
// BEFORE (buggy):
const asAt = asAtParam
  ? asAtEndOfDay(asAtParam, tz)
  : (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d })()

// AFTER (correct):
const asAt = asAtParam
  ? asAtEndOfDay(asAtParam, tz)
  : asAtEndOfDay(
      new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()),
      tz
    )
```

**Note:** `tz` is already defined around line 74 from `family?.timezone`.

**Verification:**
```bash
curl "http://localhost:3000/api/finance/balance-sheet" -H "Cookie: next-auth.session-token=YOUR_TOKEN"
# Should return 200 with balance sheet data using current AU date as asAt
```

**STOP** — Verify API returns data with the correct asAt date.

---

## PHASE 5: Fix halfyearly in advanceNextDueDate (P1-4 & P2-1)

### File 1: [`src/app/api/finance/bills/route.ts`](../src/app/api/finance/bills/route.ts)

Find the advanceNextDueDate function (around line 287-293):

```typescript
// Add the halfyearly case BEFORE the fallback:
function advanceNextDueDate(date: Date, frequency: string): Date {
  if (frequency === 'monthly')     return addMonths(date, 1)
  if (frequency === 'fortnightly') return addWeeks(date, 2)
  if (frequency === 'weekly')      return addWeeks(date, 1)
  if (frequency === 'quarterly')   return addMonths(date, 3)
  if (frequency === 'halfyearly')  return addMonths(date, 6)  // ADD THIS LINE
  if (frequency === 'yearly')      return addMonths(date, 12)
  return addMonths(date, 1)   // fallback (now halfyearly won't hit this)
}
```

### File 2: [`src/app/api/finance/bills/[id]/payments/route.ts`](../src/app/api/finance/bills/[id]/payments/route.ts)

Find the SAME advanceNextDueDate function (around line 220-227) — apply identical fix:

```typescript
const advanceNextDueDate = (date: Date, frequency: string): Date => {
  if (frequency === 'monthly')     return addMonths(date, 1)
  if (frequency === 'fortnightly') return addWeeks(date, 2)
  if (frequency === 'weekly')      return addWeeks(date, 1)
  if (frequency === 'quarterly')   return addMonths(date, 3)
  if (frequency === 'halfyearly')  return addMonths(date, 6)  // ADD THIS LINE
  if (frequency === 'yearly')      return addMonths(date, 12)
  return addMonths(date, 1)   // fallback
}
```

### File 3: [`src/app/(app)/finance/bills/page.tsx`](../src/app/(app)/finance/bills/page.tsx)

Find the frequency select element (around line 649-654):

```html
<!-- Add this option after quarterly: -->
<option value="quarterly">Quarterly</option>
<option value="halfyearly">Half-Yearly</option>  <!-- ADD THIS LINE -->
<option value="yearly">Yearly</option>
```

### Verification for Phase 5:
```bash
node -e "
const {addMonths} = require('date-fns');
const date = new Date('2026-01-15');
const halfyearly = addMonths(date, 6);
console.log('Half-yearly from Jan 15:', halfyearly.toISOString().split('T')[0]);
// Should output: 2026-07-15
"
```

**STOP** — Verify the date calculation shows +6 months correctly.

---

## PHASE 6: Fix Balance Sheet Opening Balance Double-Add (P1-3)

**File:** [`src/app/api/finance/balance-sheet/route.ts`](../src/app/api/finance/balance-sheet/route.ts)

Find the COA row balance calculation (around line 220-222):

```typescript
// BEFORE (buggy):
openingBalance: (bankBalanceMap.get(cat.id) !== undefined)
  ? (bankBalanceMap.get(cat.id)! + (cat.openingBalance ?? 0))
  : (cat.openingBalance!),

// AFTER (correct):
openingBalance: bankBalanceMap.has(cat.id)
  ? bankBalanceMap.get(cat.id)!
  : (cat.openingBalance ?? 0),
```

**Verification:**
```bash
curl "http://localhost:3000/api/finance/balance-sheet" | jq '.totals'
# Should show assets = liabilities + equity (within rounding tolerance)
```

**STOP** — Verify balance sheet still balances correctly.

---

## PHASE 7: Add Journal Reference Unique Constraint (P1-5)

### Step 1: Update schema.prisma

**File:** [`prisma/schema.prisma`](../prisma/schema.prisma)

Find the `FinanceJournalEntry` model (around line 991) and add the unique constraint:

```prisma
model FinanceJournalEntry {
  // ... existing fields ...
  
  @@unique([familyId, reference])  // ADD THIS LINE
  @@index([familyId])
  @@index([familyId, isPosted])
}
```

### Step 2: Create and run migration

```bash
npx prisma migrate dev --name add_journal_ref_unique_constraint
```

### Step 3: Update nextReference() function

**File:** [`src/app/api/finance/journals/route.ts`](../src/app/api/finance/journals/route.ts)

Replace the existing nextReference function (around line 23-26):

```typescript
async function nextReference(familyId: string): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const count = await prisma.financeJournalEntry.count({ where: { familyId } })
    const ref = `JE-${String(count + 1 + i).padStart(4, '0')}`
    const exists = await prisma.financeJournalEntry.findFirst({
      where: { familyId, reference: ref },
      select: { id: true },
    })
    if (!exists) return ref
  }
  throw new Error('Could not generate unique journal reference after 10 attempts')
}
```

**File:** [`src/app/api/finance/transactions/route.ts`](../src/app/api/finance/transactions/route.ts)

Apply the same fix (around line 31-32) — replace the inline reference generation with the retry loop.

### Verification:
```bash
npx prisma migrate status
# Should show all migrations applied including the new one
```

**STOP** — Verify migration applied and no duplicate reference errors.

---

## PHASE 8: Add Error State to Transaction List (P2-5)

**File:** [`src/app/(app)/finance/transactions/page.tsx`](../src/app/(app)/finance/transactions/page.tsx)

Add error state:

```typescript
// Add to useState declarations (around line 40):
const [fetchError, setFetchError] = useState<string | null>(null)

// Update load() function (around line 65-83):
const load = useCallback(async () => {
  try {
    setLoading(true)
    const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() })
    if (filterType) params.set('type', filterType)
    if (filterMemberId) params.set('memberId', filterMemberId)
    if (filterLocationId) params.set('locationId', filterLocationId)
    if (filterEntityId) params.set('entityId', filterEntityId)
    const res = await fetch(`/api/finance/transactions?${params}`)
    if (res.ok) {
      const d = await res.json()
      setTransactions(d.transactions.map((t: any) => ({
        ...t,
        member: t.memberId ? (members.find((m: Member) => m.id === t.memberId) ?? null) : null,
      })))
      setTotal(d.total)
      setFetchError(null)
    } else {
      setFetchError('Failed to load transactions. Please try again.')
    }
  } catch (err) {
    setFetchError('Network error. Please check your connection.')
  } finally {
    setLoading(false)
  }
}, [])

// Update JSX — wrap the transaction list with error handling:
{fetchError ? (
  <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-500">
    {fetchError} <button onClick={load} className="underline ml-2">Retry</button>
  </div>
) : transactions.length === 0 && !loading ? (
  <p className="text-sm text-muted-foreground">No transactions found.</p>
) : (
  // ... existing transaction list JSX ...
)}
```

**Verification:** Test by temporarily breaking the API endpoint — should show error message with retry button instead of empty list.

**STOP** — Verify error state displays correctly when API fails.

---

## FINAL VERIFICATION (Run After All Phases)

```bash
# 1. Type check
npx tsc --noEmit

# 2. Build the application (catches module resolution issues)
npm run build

# 3. Check git status for all changes
git status

# 4. Commit all phases together
git add .
git commit -m "fix: complete finance audit fixes - timezone, halfyearly, balance sheet, journal refs"

# 5. Push to main
git push origin main
```

### Deployment Verification (After Docker build)

1. **Test AU date at 11:30pm** — Access bills page, verify todayAU() shows correct current date
2. **Test halfyearly bill** — Create a bill with half-yearly frequency, mark paid, verify next due date is +6 months
3. **Test balance sheet** — Access balance sheet, verify assets = liabilities + equity
4. **Test partial payment** — Create partial payment on a bill, verify no overpayment allowed, history panel shows correctly
5. **Test transaction error state** — Temporarily stop API, refresh transactions, verify error message appears

### Rollback Plan

```bash
# Revert to last good commit
git reset --hard HEAD~1

# Or revert specific file
git checkout HEAD -- src/lib/utils.ts

# For database migration rollback (if unique constraint causes issues)
npx prisma migrate reset
```

### Success Criteria

All these must be TRUE after deployment:

1. Bills page at 11:30pm AEST shows today's date, not yesterday
2. Journal page date defaults to today's AU date
3. Transaction page date defaults to today's AU date
4. Balance sheet works with no asAt param (uses end of today in AU TZ)
5. Half-yearly bills advance by exactly 6 months when paid
6. Half-yearly option appears in bill frequency dropdown
7. Balance sheet asset totals = liability + equity totals
8. No duplicate journal references possible (even under concurrent saves)
9. Transaction list shows error UI on fetch failure
10. P&L shows no double-counting for bills and income
11. QuickAdd expenses appear in P&L immediately
12. Personal (null entity) transactions appear in default entity tab

---

## Files Modified Summary

| File | Phase | Change |
|------|-------|--------|
| [`src/components/layout/QuickAdd.tsx`](../src/components/layout/QuickAdd.tsx) | 1 | Add `isCleared: true` (already in working tree) |
| [`src/app/(app)/finance/profit-loss/page.tsx`](../src/app/(app)/finance/profit-loss/page.tsx) | 1 | Dedup sets + matchesEntity() (already in working tree) |
| [`src/lib/utils.ts`](../src/lib/utils.ts) | 2 | Add `todayAU()` helper |
| [`src/app/(app)/finance/bills/page.tsx`](../src/app/(app)/finance/bills/page.tsx) | 3, 5 | todayAU() + halfyearly option |
| [`src/app/(app)/finance/journals/page.tsx`](../src/app/(app)/finance/journals/page.tsx) | 3 | todayAU() for all form defaults |
| [`src/app/(app)/finance/transactions/page.tsx`](../src/app/(app)/finance/transactions/page.tsx) | 3, 8 | todayAU() + error state |
| [`src/app/api/finance/balance-sheet/route.ts`](../src/app/api/finance/balance-sheet/route.ts) | 4, 6 | asAt fallback + COA balance fix |
| [`src/app/api/finance/bills/route.ts`](../src/app/api/finance/bills/route.ts) | 5 | halfyearly in advanceNextDueDate |
| [`src/app/api/finance/bills/[id]/payments/route.ts`](../src/app/api/finance/bills/[id]/payments/route.ts) | 5 | halfyearly in advanceNextDueDate |
| [`prisma/schema.prisma`](../prisma/schema.prisma) | 7 | Add `@@unique([familyId, reference])` |
| [`src/app/api/finance/journals/route.ts`](../src/app/api/finance/journals/route.ts) | 7 | Retry loop in nextReference |
| [`src/app/api/finance/transactions/route.ts`](../src/app/api/finance/transactions/route.ts) | 7 | Retry loop in reference generation |
