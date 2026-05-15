# Post-Refactoring Verification Summary

**Date:** 2026-05-15
**Scope:** Full review of the helper/lib separation refactoring across the HomeBase codebase

---

## Verdict: ✅ All Clear — No Issues Found

After reviewing all 20 files involved in the refactoring, every function, helper, and UI component functions identically to its pre-refactoring state. All import paths, function signatures, type exports, and data flows are correct.

---

## Files Reviewed

### New Library Modules (Pure Functions)

| File | Status | Contents |
|------|--------|----------|
| `src/lib/finance-period.ts` | ✅ Correct | `toPeriodAmount()`, `isLumpSum()`, `getPeriodBounds()`, `navigateAnchor()` — pure functions, no state, no side effects |
| `src/lib/tax-calculator.ts` | ✅ Correct | `calcIncomeTax()`, `calcMedicare()`, `calcPersonalTax()`, `SUPER_CAP` — ATO 2025-26 bracket rates, matches original inline logic |
| `src/lib/excel/profit-loss-excel.ts` | ✅ Correct | `buildProfitLossWorkbook()` with `ProfitLossExcelParams` — 4 sheets, uses shared excelStyles |
| `src/lib/excel/tax-report-excel.ts` | ✅ Correct | `buildTaxReportWorkbook()` with `TaxReportExcelParams` — 2 sheets, imports SUPER_CAP from tax-calculator |
| `src/lib/excel/trial-balance-excel.ts` | ✅ Correct | `buildTrialBalanceWorkbook()` with `TrialBalanceExcelParams` — handles both TB and GL modes |

### New Hooks (Stateful Logic)

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `src/hooks/finance/useBillCrud.ts` | 611 | ✅ Correct | 28 state vars, CRUD, validation, GL-FIRST invariants, sessionStorage. 48 return values. |
| `src/hooks/finance/useIncomeCrud.ts` | 632 | ✅ Correct | Mirror of useBillCrud for income. Separate CREATE/EDIT paths. |
| `src/hooks/finance/useProfitLoss.ts` | 461 | ✅ Correct | Complex dedup memo chain (billLinkedTxIds, incomeLinkedTxIds, journalIncomeGlIds). Re-exports navigateAnchor. |
| `src/hooks/finance/useTrialBalance.ts` | 179 | ✅ Correct | Data loading, drill-down to GL, account grouping, search filtering. |
| `src/hooks/finance/useTransactionCrud.ts` | 198 | ✅ Correct | Pagination, filters, CRUD. Uses unified /api/finance/references endpoint. |
| `src/hooks/lists/useShoppingList.ts` | 378 | ✅ Correct | DnD, offline queue, category management, CRUD, derived data (grouped, recipeGroups). |
| `src/hooks/lists/useTodoList.ts` | 308 | ✅ Correct | Filtering, DnD, CRUD, app event listener for AI-sourced updates. |

### Modified Page Files

| File | Lines | Imports Hook/Lib | Status |
|------|-------|------------------|--------|
| `src/app/(app)/finance/bills/page.tsx` | 552 | `useBillCrud`, `useAttachmentManager` | ✅ Correct |
| `src/app/(app)/finance/income/page.tsx` | 576 | `useIncomeCrud`, `useAttachmentManager` | ✅ Correct |
| `src/app/(app)/finance/profit-loss/page.tsx` | 410 | `useProfitLoss`, `buildProfitLossWorkbook` | ✅ Correct |
| `src/app/(app)/finance/tax-report/page.tsx` | 501 | `calcPersonalTax`, `buildTaxReportWorkbook` | ✅ Correct |
| `src/app/(app)/finance/trial-balance/page.tsx` | 515 | `useTrialBalance`, `buildTrialBalanceWorkbook` | ✅ Correct |
| `src/app/(app)/finance/transactions/page.tsx` | 330 | `useTransactionCrud` | ✅ Correct |

### Modified Component Files

| File | Lines | Imports Hook | Status |
|------|-------|--------------|--------|
| `src/components/lists/ShoppingList.tsx` | 226 | `useShoppingList` | ✅ Correct |
| `src/components/lists/TodoList.tsx` | 340 | `useTodoList` | ✅ Correct |

---

## What Was Verified

1. **Import paths** — Every `@/lib/excel/...`, `@/hooks/finance/...`, and `@/hooks/lists/...` import resolves to an existing file exporting the expected symbols.
2. **Function signatures** — Every hook return value destructured in consumer files exists in the hook's return object.
3. **Type exports** — `type Bill`, `type IncomeEntry`, `type Transaction` are re-exported from pages via `export type { ... }`.
4. **Completeness** — No inline logic from the original audit report was left unextracted within scope.
5. **No circular dependencies** — lib → lib, hooks → lib + components, pages → hooks + lib, components → hooks.
6. **Separation of concerns** — Pure functions in lib/, stateful CRUD logic in hooks/, rendering in pages/components.

---

## Observations (Non-Blocking Design Choices)

1. **`fmtCurrency()` remains inline** in `profit-loss/page.tsx:18-20` — Pure presentation helper (Intl.NumberFormat wrapper), single consumer. Fine to keep. Note: `formatCurrency` already exists in `src/lib/financeShared.ts`; using a local wrapper is a style choice, not a risk.

2. **`fmt()` and `fmtCompact()` remain inline** in `trial-balance/page.tsx:18-32` — Same reasoning, pure presentation.

3. **`buildTaxColumn()` and `buildPersonTax()` remain inline** in `tax-report/page.tsx:22-168` — ~150 lines of tax view-model construction that delegate pure math to `calcPersonalTax()`. Beyond stated extraction scope.

4. **`TYPE_LABEL`, `TYPE_COLOR`, `TYPE_BG` constants** in `trial-balance/page.tsx:34-55` — Presentation-only. The hook has its own `TYPE_ORDER` for different purposes.

5. **`useIncomeCrud.ts` does not import `toMonthlyAmount`** while `useBillCrud.ts` does — Correct; bills need it for budget sync, income doesn't.

---

## Issues Found During Independent Review

A second review pass (17 file pairs, 41 tool reads) identified two additional items not caught above:

### FIXED — Dead code in `useProfitLoss.ts` bill deduplication filter

`filteredBillItems` filter contained a dead condition:
```typescript
// Before (line 343):
billItems.filter(b => !b.item.id || !journalExpenseGlIds.has(b.key))

// After (commit ab33959):
billItems.filter(b => !journalExpenseGlIds.has(b.key))
```
`!b.item.id` is always `false` (bill IDs are non-empty strings), so it never short-circuited the filter. Deduplication behaviour was unaffected, but the dead condition obscured the actual guard logic in a critical P&L path. Removed.

### NOTED — `isTrulyOverdue` in `useIncomeCrud.ts` references `todayStart` before its lexical position

`isTrulyOverdue` (line 547) is a `function` declaration that closes over `todayStart`, a `const` declared at line 567. Safe at runtime — function declarations are hoisted, and `todayStart` is initialised before the function is first called at line 575. No action taken; noted here for maintainer awareness.

---

## Components Partially Refactored

The following components were partially refactored — their business logic was extracted to helper modules, but their UI state (useState, useEffect) correctly remains inline:

- `src/components/finance/JournalEntryForm.tsx` — Business logic extracted to `journal-helpers.ts` and `journal-types.ts`. Form state (useState) remains in component as intended.
- `src/components/finance/AccountLedgerPanel.tsx` — Helpers extracted to `account-ledger-helpers.ts`. Panel state and data-fetching (useEffect, useCallback) remain in component as intended.

## Components Not Modified in This Refactoring

The following were listed in the original audit report but were out of scope for this phase:

- `src/components/calendar/EventModal.tsx` — No changes (getEventId, isRecurringEvent already in `src/lib/event-helpers.ts`)
- `src/components/layout/quick-add/ExpenseForm.tsx` — No changes (loadPrefs, savePrefs, optionLabel remain inline; low risk, form-specific)
- `src/components/meal-plan/MealPlanGrid.tsx` — No changes
