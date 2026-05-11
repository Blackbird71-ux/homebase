# Bug Fix: P&L — Personal Tab Excludes Unassigned (null-entity) Expenses

**Date:** 2026-05-11

## Symptoms

An expense transaction appears on the P&L page when viewing **"All"** entities tab, but **disappears** when switching to the **"Personal"** entity tab — even though the transaction is a personal expense with no business entity assigned.

## Root Cause

The P&L page has entity filter tabs ("All", "Personal", "Business"). When a specific entity tab was selected, the filtering logic had two problems:

### 1. Transactions API filter (loadTransactions)

[`loadTransactions`](src/app/(app)/finance/profit-loss/page.tsx:143) sent an exact-match `entityId` parameter to the transactions API endpoint:

```ts
if (entityId) params.set('entityId', entityId)
```

This excluded all transactions where `entityId = null` from the API response when a specific entity was selected.

### 2. Client-side strict equality filters

Bills and transactions were filtered on the client side using strict equality:

```ts
// Bills
if (selectedEntityId && b.entityId !== selectedEntityId) return false

// Transactions
.filter(t => t.type === 'expense' && (!selectedEntityId || t.entityId === selectedEntityId))
```

Both of these reject `null` when a specific entity ID is provided (`null !== 'personal-entity-id'` = `true` → excluded).

However, the [Prisma schema](prisma/schema.prisma:635) explicitly documents `entityId = null` as **"personal/default"**. Transactions created without an entity assignment (common via Quick Add or when a bill generates an expense transaction) would show only on "All" but never on any entity-specific tab.

## Fix

Three changes were made to [`src/app/(app)/finance/profit-loss/page.tsx`](src/app/(app)/finance/profit-loss/page.tsx):

### 1. Removed entityId from transactions API call

`loadTransactions` now loads ALL transactions for the period without entity filtering — consistent with how bills and income entries are already loaded. Filtering happens entirely on the client side.

```diff
- async function loadTransactions(from: Date, to: Date, entityId: string) {
+ async function loadTransactions(from: Date, to: Date) {
     ...
-    if (entityId) params.set('entityId', entityId)
     const res = await fetch(`/api/finance/transactions?${params}`)
```

### 2. Added `matchesEntity()` helper

A new helper function that implements the correct entity-filtering semantics:

```ts
/** True when the item's entity matches the current filter (or the item is unassigned
 *  and the default entity is selected). */
function matchesEntity(itemEntityId: string | null): boolean {
  if (!selectedEntityId) return true   // "All" tab — include everything
  if (!itemEntityId) return selectedEntityId === defaultEntityId   // unassigned → only on default entity tab
  return itemEntityId === selectedEntityId
}
```

- **"All" tab**: everything passes (`selectedEntityId` is empty)
- **Default entity tab** (Personal): items assigned to that entity **plus** unassigned items (`entityId = null`) are included
- **Non-default entity tab** (Business): only items explicitly assigned to that entity are included

### 3. Applied `matchesEntity()` consistently

Replaced all five entity filter locations:

| Location | Before | After |
|---|---|---|
| Income entries filter | `selectedEntityId && e.entityId !== selectedEntityId` | `!matchesEntity(e.entityId)` |
| Income transactions filter | `!selectedEntityId \|\| t.entityId === selectedEntityId` | `matchesEntity(t.entityId)` |
| Bill expenses filter | `selectedEntityId && b.entityId !== selectedEntityId` | `!matchesEntity(b.entityId)` |
| Expense transactions filter | `!selectedEntityId \|\| t.entityId === selectedEntityId` | `matchesEntity(t.entityId)` |
| Tax estimation filter | `selectedEntityId && e.entityId !== selectedEntityId` | `!matchesEntity(e.entityId)` |

## Files Changed

```
modified:   src/app/(app)/finance/profit-loss/page.tsx
```

## Testing Notes

- Create an expense transaction **without** selecting an entity → verify it shows on "All" tab AND on the default (Personal) entity tab
- Create an expense transaction **assigned to** the default (Personal) entity → verify it shows on both "All" and "Personal" tabs
- Create an expense transaction **assigned to** a Business entity → verify it shows on "All" and "Business" tabs but NOT on "Personal" tab
- Verify income entries follow the same rules
- Verify bills follow the same rules
- Verify "All" tab still shows everything regardless of entity assignment

## Lesson

When a data model uses `null` to represent a default value (as documented in the Prisma schema: `entityId = null` = "personal/default"), **all filtering logic must treat `null` as semantically matching that default entity**. Strict equality checks against entity IDs will silently exclude default/uncategorised items from entity-specific views.
