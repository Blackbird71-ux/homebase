# HomeBase QA & Regression Prevention Guide

> **This document is a living checklist, not an audit trail.**
> Update it whenever you add a feature, change a flow, or discover a new regression pattern.
> The finance module has critical implications for real money — treat it accordingly.

---

## Table of Contents

1. [Developer Protocol — Before ANY Change](#1-developer-protocol--before-any-change)
2. [Finance Module — Accounting Invariants](#2-finance-module--accounting-invariants)
3. [Finance Module — Complete Data Model Reference](#3-finance-module--complete-data-model-reference)
4. [Finance Module — End-to-End Lifecycle Flows](#4-finance-module--end-to-end-lifecycle-flows)
5. [Finance Module — Regression Smoke Tests](#5-finance-module--regression-smoke-tests)
6. [Finance Module — Accountant Verification Checklist](#6-finance-module--accountant-verification-checklist)
7. [Finance Module — UI Component Inventory](#7-finance-module--ui-component-inventory)
8. [Finance Module — API Route Inventory](#8-finance-module--api-route-inventory)
9. [Finance Module — Shared Code Blast Radius](#9-finance-module--shared-code-blast-radius)
10. [Non-Finance Modules — Regression Smoke Tests](#10-non-finance-modules--regression-smoke-tests)
11. [Build & Deploy Checks](#11-build--deploy-checks)
12. [Known Bug Patterns & Anti-Patterns](#12-known-bug-patterns--anti-patterns)

---

## 1. Developer Protocol — Before ANY Change

### 1.1 Blast-Radius Assessment

Before touching any file, answer these questions:

| Question | If YES, do this |
|---|---|
| Is this file imported by a shared hook (`useIncomeCrud`, `useBillCrud`, `useTransactionCrud`, `useTemplateCrud`)? | Smoke-test **all** income, bill, draft, and template flows |
| Is this a shared UI component (`JournalLinesEditor`, `JournalEntryForm`, `AttachmentSection`, `MemberSelector`)? | Check every dialog that embeds it |
| Is this a lib function in `finance-posting.ts`, `finance-draft-spawn-service.ts`, or `finance-draft-approval-service.ts`? | Run the full draft lifecycle from spawn → approve → post |
| Is this a Prisma schema change? | Check every route that reads/writes the changed model; update TypeScript interfaces to match |
| Is this a route under `/api/finance/`? | Check every hook that calls it and verify the response shape hasn't changed |
| Is this a form or dialog component? | Follow AGENTS.md form field safety rules; enumerate all fields before and after |

### 1.2 Pre-Edit Checklist

```
[ ] Identified all files the change touches
[ ] Listed all callers of changed functions/components
[ ] For forms: enumerated ALL input fields before editing (see AGENTS.md)
[ ] For finance code: identified which lifecycle stage this affects
[ ] Decided: does this change touch shared hooks or lib functions?
```

### 1.3 Post-Edit Checklist

```
[ ] TypeScript: grep for type errors in src/ before committing
[ ] Run: npx tsc --noEmit (or check VS Code Problems panel — zero errors required)
[ ] For forms: verified all fields still present after editing (see AGENTS.md)
[ ] For finance: ran the smoke tests for all affected flows (see §5)
[ ] For GL-touching code: verified DR = CR in all created/modified journal entries
[ ] No "fix one instance, leave others broken" — if a pattern is wrong, fix all occurrences
```

### 1.4 Commit Message Rules

- Prefix: `fix:`, `feat:`, `ux:`, `refactor:`, `docs:`, `chore:`
- Finance commits: always note which lifecycle stage is affected
  - e.g. `fix: payslip data lost at draft spawn and mark-received stages`

---

## 2. Finance Module — Accounting Invariants

> **These rules are non-negotiable.** Any code that violates them is a bug, regardless of whether the UI looks correct.

### 2.1 Double-Entry Fundamentals

Every posted `FinanceJournalEntry` must satisfy:

```
SUM(lines WHERE side='debit') = SUM(lines WHERE side='credit')
```

This is called a **balanced journal entry**. If the trial balance shows any imbalance, something was posted incorrectly.

### 2.2 Normal Account Balances

| Account Type | Normal Balance | Increases With | Decreases With |
|---|---|---|---|
| Asset (cash, bank, AR, PAYG Withheld Receivable) | **DEBIT** | DR | CR |
| Liability (AP, loans, tax payable) | **CREDIT** | CR | DR |
| Equity | **CREDIT** | CR | DR |
| Revenue / Income | **CREDIT** | CR | DR |
| Expense / Cost | **DEBIT** | DR | CR |

**Common mistakes caught by this rule:**
- Salary income on DR side → WRONG. Income is always CR.
- PAYG withheld as a liability → WRONG if the family is the employee (they are owed a refund). PAYG Withheld is a current **asset** (reclaimed at tax return time) → DR side.
- Accounts Payable on DR side at bill creation → WRONG. AP is CR when the obligation is created.

### 2.3 Standard Journal Templates

#### Bill / Expense Accrual (invoice received)
```
DR  Expense Account          $gross
    CR  Accounts Payable         $gross
```

#### Bill Payment (cash out)
```
DR  Accounts Payable         $gross
    CR  Bank / Cash               $gross
```

#### Income Accrual (simple, no payslip)
```
DR  Accounts Receivable      $amount
    CR  Income Account            $amount
```

#### Income Receipt (cash in, simple)
```
DR  Bank / Cash              $amount
    CR  Accounts Receivable       $amount
```

#### Salary Payslip — Full Payslip Entry (posted at accrual + receipt combined)
```
DR  Bank / Cash              $netPay
DR  PAYG Withheld Receivable $paygWithheld
DR  SGC Superannuation       $sgcAmount   (if applicable)
    CR  Gross Wages / Income      $grossPay
```

> `netPay + paygWithheld + sgcAmount = grossPay` must hold.

#### Reversal (month-end accrual reversal)
```
Mirror the original entry with DR/CR swapped, dated first day of next period.
The system uses: isReversed=true on original + reversalOfId on the new entry.
```

### 2.4 GST Handling (Australian)

When `gstApplicable=true` on a `FinanceCategory`:
- The gross amount posted to the expense/income account is the **GST-inclusive** amount.
- The GST component (`amount * gstRate / (100 + gstRate)`) is split to a GST GL account.
- This split happens in the transaction layer, not the journal layer.
- Verify: GST account balance = sum of all GST components for the period.

### 2.5 Financial Year

- Default: 1 July → 30 June (Australian). Stored in `Family.financeYearStartMonth = 7`.
- P&L and budget period calculations use `finance-fy.ts` and `finance-period.ts`.
- Do not hardcode month offsets. Always use the FY helper functions.

---

## 3. Finance Module — Complete Data Model Reference

### 3.1 Core GL Models

| Model | Purpose | Key Fields |
|---|---|---|
| `FinanceCategory` | GL Chart of Accounts (assets, liabilities, equity, income, expense) | `type`, `subtype`, `isGlAccount`, `parentId`, `normalBalance`, `gstApplicable` |
| `FinanceJournalEntry` | Double-entry journal header | `date`, `isPosted`, `isReversed`, `reversalOfId`, `amendmentOfId`, `type` |
| `FinanceJournalLine` | Individual DR/CR line | `glAccountId`, `side` ('debit'|'credit'), `amount`, `description` |

### 3.2 Transaction / Ledger Models

| Model | Purpose | Key Fields |
|---|---|---|
| `FinanceTransaction` | Cash-basis ledger entry | `type`, `amount`, `accountId`, `categoryId`, `glAccountId`, `isCleared` |
| `FinanceAccount` | Bank/asset accounts (cash basis) | `name`, `balance`, `type`, `openingBalance` |

### 3.3 Bill / Expense Lifecycle Models

| Model | Purpose | Key Fields |
|---|---|---|
| `FinanceRecurringBill` | Bill occurrence (draft or standalone) | `status` (draft→awaiting_payment→paid), `journalEntryId`, `invoiceTxId`, `paymentTxId`, `templateId`, `spawnedSnapshotHash` |
| `FinanceBillPayment` | Payment event linking bill to transaction | `billId`, `amount`, `journalEntryId`, `transactionId` |

### 3.4 Income Lifecycle Models

| Model | Purpose | Key Fields |
|---|---|---|
| `FinanceIncomeEntry` | Income occurrence (draft or standalone) | `status` (draft→awaiting_receipt→received), `journalEntryId`, `receiptJournalEntryId`, `invoiceTxId`, `receiptTxId`, `templateId`, `spawnedSnapshotHash` |
| `FinancePayslip` | Payslip detail linked 1:1 to FinanceIncomeEntry | `grossPay`, `netPay`, `paygWithheld`, `paygGlAccountId`, `sgcAmount`, `sgcGlAccountId`, `grossIncomeGlAccountId`, `bankGlAccountId`, `components` (JSON), `deductions` (JSON) |

### 3.5 Template / Spawn Models

| Model | Purpose | Key Fields |
|---|---|---|
| `FinanceRecurringTemplate` | Template for recurring bills or income | `type` ('bill'|'income'), `payslipEnabled`, `frequency`, `lines` (via FinanceRecurringTemplateLine) |
| `FinanceRecurringTemplateLine` | Template journal line snapshot | `glAccountId`, `side`, `amount`, `description` |

### 3.6 Reporting / Reference Models

| Model | Purpose |
|---|---|
| `FinanceBudget` | Budget rules per GL account and period |
| `FinanceSavingsGoal` | Goal tracking linked to accounts |
| `FinanceSnapshot` | Saved monthly P&L/balance sheet report |
| `FinanceEntity` | Business/entity segmentation |
| `FinanceVendor` | Vendor/supplier master |
| `FinanceLocation` | Property/location tagging |

---

## 4. Finance Module — End-to-End Lifecycle Flows

### 4.1 Bill Lifecycle (Recurring Template → Paid)

```
Template
  │
  ├─ [Spawn Service] finance-draft-spawn-service.ts: spawnTemplateDrafts()
  │     Creates: FinanceRecurringBill (status='draft')
  │               + FinanceJournalEntry (isPosted=false) if ≥2 balanced lines
  │               Linked via: bill.journalEntryId
  │
  ├─ [Approval] finance-draft-approval-service.ts: approveBillDraft()
  │     Calls: postBillAccrualJournal() in finance-posting.ts
  │     Branch (a): bill.journalEntryId → balanced unposted → promotes as-is (isPosted=true)
  │     Branch (b)/(c): fallback → creates DR Expense / CR AP
  │     Status: draft → awaiting_payment
  │
  ├─ [Invoice Received] useBillCrud.ts: handleInvoiceReceived()
  │     Flags: invoiceReceived=true, invoiceReceivedDate=now
  │     Does NOT create a new journal (accrual already posted at approval)
  │
  └─ [Mark Paid] useBillCrud.ts: handleMarkPaid()
        Calls: POST /api/finance/bills/[id]/payments
        Creates: FinanceBillPayment + FinanceTransaction (DR AP / CR Bank)
        Calls: postBillPaymentJournal() in finance-posting.ts
        Status: awaiting_payment → paid
```

**Key invariants to check after any bill-related change:**
- Trial balance must remain zero (DR=CR)
- AP account balance = sum of all unpaid bills
- Expense category balance = sum of all accrued expenses

### 4.2 Income Lifecycle (Recurring Template → Received)

```
Template
  │
  ├─ [Spawn Service] finance-draft-spawn-service.ts: spawnTemplateDrafts()
  │     Creates: FinanceIncomeEntry (status='draft')
  │               + FinanceJournalEntry (isPosted=false) if ≥2 balanced non-payslip lines
  │               OR FinancePayslip if template.payslipEnabled=true
  │               Linked via: entry.journalEntryId
  │
  ├─ [Approval] finance-draft-approval-service.ts: approveIncomeDraft()
  │     PAYSLIP PATH: status → awaiting_receipt (no GL yet — deferred to receipt)
  │     SIMPLE PATH: calls postIncomeAccrualJournal() in finance-posting.ts
  │       Branch (a): entry.journalEntryId → balanced unposted → promotes as-is
  │       Branch (b)/(c): fallback → creates DR AR / CR Income
  │     Status: draft → awaiting_receipt
  │
  └─ [Mark Received] useIncomeCrud.ts: handleMarkReceived()
        Pre-populates payslip confirmation from entry.payslip (FIXED: was resetting to defaults)
        Calls: POST /api/finance/income/received
        PAYSLIP PATH: calls postPayslipReceiptJournal()
          Creates: DR Bank (net) + DR PAYG Withheld + DR SGC / CR Gross Income
        SIMPLE PATH: calls postIncomeReceiptJournal()
          Creates: DR Bank / CR AR (or CR Income if no prior accrual)
        Status: awaiting_receipt → received
```

**Key invariants to check after any income-related change:**
- Payslip: grossPay = netPay + paygWithheld + sgcAmount
- Payslip journal: SUM(DR lines) = grossPay; SUM(CR lines) = grossPay
- Income account balance reflects gross (not net) for payslip entries
- PAYG Withheld Receivable balance = sum of all withheld tax not yet returned

### 4.3 Manual Journal Entry Lifecycle

```
[User creates entry] JournalEntryForm.tsx
  │  Validates: DR total = CR total before allowing save
  │
  ├─ POST /api/finance/journals — creates FinanceJournalEntry (isPosted=false)
  │
  ├─ [Post] PATCH /api/finance/journals/[id] { isPosted: true }
  │     Validates balance before posting
  │
  └─ [Reverse] ReversalDialog.tsx → POST /api/finance/journals (reversalOfId set)
        New entry = mirror of original with DR/CR swapped
        Original: isReversed=true
```

### 4.4 Opening Balances

```
[Setup] POST /api/finance/categories/opening-balance
  Creates one FinanceJournalEntry per account
  Each line: DR asset OR CR liability/equity
  Total: must balance (net worth = assets - liabilities)
  
[Account opening balance] POST /api/finance/accounts/opening-balance
  Creates a FinanceTransaction of type 'opening_balance'
```

### 4.5 Bulk Draft Approval

```
finance-draft-approval-service.ts: bulkApproveUnchangedDrafts()
  Selects all drafts WHERE spawnedSnapshotHash = template.currentHash
  Approves each in series (not parallel — each approval may create journal entries)
  Only approves "unchanged" drafts — if the user edited a draft, it won't match the hash
```

### 4.6 Void / Amendment Flow

```
[Void] VoidDialog.tsx → PATCH /api/finance/bills/[id] OR /api/finance/income/[id]
  Sets: isVoided=true, voidedAt, voidNote
  Does NOT reverse the GL — if already posted, a manual reversal is required

[Amend] AmendmentDialog.tsx → creates new JournalEntry with amendmentOfId set
  Original entry: unchanged (audit trail)
  New entry: the correction
```

---

## 5. Finance Module — Regression Smoke Tests

> Run these after **any** change to finance hooks, lib functions, API routes, or components.
> "Passes" means: no console errors, GL remains balanced, UI shows correct values.

### 5.1 Bill Flow Tests

| Test | Steps | Expected Result |
|---|---|---|
| **B1** Create one-off bill | Finance → Bills → Add Bill (one-off) → Save | Bill appears in pending list; journal entry created with DR Expense / CR AP |
| **B2** Create recurring bill | Finance → Bills → Add Bill (recurring, monthly) → Save | Bill appears; next occurrence shows in drafts after spawn |
| **B3** Mark invoice received | Click "Invoice Received" on a bill | `invoiceReceived=true`; date recorded; no duplicate journal |
| **B4** Mark bill paid | Click "Mark Paid" → enter bank account → Save | Status=paid; payment journal: DR AP / CR Bank; AP balance decreases |
| **B5** Bill draft approve (single) | Drafts panel → Approve one draft | Status → awaiting_payment; GL posted; trial balance unchanged |
| **B6** Bulk draft approve | Drafts panel → Approve All Unchanged | All unchanged drafts approved; GL balanced for each |
| **B7** Edit draft before approve | Open draft → change amount → save → approve | Edited amount used in journal (not template default) |
| **B8** Void a bill | Overflow → Void → enter reason | `isVoided=true`; bill removed from active list; GL NOT automatically reversed |
| **B9** Bill with GST | Create bill under GST-applicable category | GST component split correctly; net amount posted to expense |
| **B10** Multi-leg bill template (e.g. GST split) | Create bill template with 3 lines (DR Expense / DR GST Receivable / CR AP) → spawn → open draft in edit dialog → approve | Draft editor shows all 3 lines from template (NOT the 2-line default); approval posts a 3-line journal; trial balance unchanged |

### 5.2 Income Flow Tests

| Test | Steps | Expected Result |
|---|---|---|
| **I1** Create one-off income | Finance → Income → Add Income → Save | Income entry created; journal DR AR / CR Income |
| **I2** Create recurring income | Add Income (recurring) → Save | Entry appears; spawns drafts on schedule |
| **I3** Mark income received (simple) | Click "Mark Received" → confirm amount → Save | `received=true`; receipt journal: DR Bank / CR AR; AR balance decreases |
| **I4** Mark income received (payslip) | Click "Mark Received" on payslip entry → confirm gross/net/PAYG | Journal: DR Bank (net) + DR PAYG Withheld + DR SGC / CR Gross Wages; grossPay = sum of DRs |
| **I5** Payslip pre-population | Open "Mark Received" on a draft with stored payslip | Form pre-populated from `entry.payslip`; not reset to gross=net defaults |
| **I6** Income draft approve | Drafts panel → Approve income draft | Status → awaiting_receipt; for payslip: no GL yet (deferred to receipt) |
| **I7** Template with payslip | Create template with payslipEnabled=true → spawn | Draft created with linked FinancePayslip; payslip fields preserved |
| **I8** Template with custom journal lines | Create template with ≥2 balanced lines → spawn | Draft created with linked unposted FinanceJournalEntry; approval promotes it |

### 5.3 Journal / GL Tests

| Test | Steps | Expected Result |
|---|---|---|
| **J1** Create manual journal | Finance → Journals → New → add balanced lines → Save | Journal saved as unposted; DR=CR shown |
| **J2** Post unbalanced journal | Try to post a journal where DR≠CR | System rejects; error message shown; no GL change |
| **J3** Post balanced journal | Post a balanced manual journal | `isPosted=true`; GL balances updated; trial balance remains balanced |
| **J4** Reverse a journal | Select posted journal → Reverse | New reversal entry created; original `isReversed=true`; net effect = zero |
| **J5** Trial balance check | Finance → Reports → Trial Balance | DR total = CR total for every account; grand total = 0 |
| **J6** P&L report | Finance → Reports → P&L | Revenue minus Expenses = Net Profit; no income accounts on DR side |
| **J7** Balance Sheet | Finance → Reports → Balance Sheet | Assets = Liabilities + Equity; balances as of selected date |

### 5.4 Template Flow Tests

| Test | Steps | Expected Result |
|---|---|---|
| **T1** Create income template | Templates → New → Income type → fill all fields → Save | Template saved; all fields preserved in DB |
| **T2** Create bill template | Templates → New → Bill type → fill fields → Save | Template saved |
| **T3** Edit template | Open template → change amount → Save | Updated amount used in next spawn |
| **T4** Spawn drafts | Trigger spawn (auto or manual) | Drafts created for due templates; snapshot hash recorded |
| **T5** Template with payslip | Create template → enable Payslip mode → fill payslip fields → Save | `payslipEnabled=true` in DB; payslip GL accounts stored in template lines |
| **T6** Delete template | Delete a template | No orphaned drafts; existing drafts keep their snapshot data |

### 5.5 Reporting Tests

| Test | Steps | Expected Result |
|---|---|---|
| **R1** Trial balance | Open Trial Balance | Zero imbalance; all posted journals represented |
| **R2** P&L current FY | Open P&L for current financial year | Income accounts in CR column; expense accounts in DR column |
| **R3** Balance sheet | Open Balance Sheet | Assets = Liabilities + Equity |
| **R4** Category ledger | Open a GL account ledger | Running balance correct; each entry has matching journal |
| **R5** AP aging | Open Accounts Payable | Only unpaid bills; total matches AP GL balance |
| **R6** AR aging | Open Accounts Receivable | Only unreceived income; total matches AR GL balance |
| **R7** Tax report | Finance → Tax Report | PAYG withheld total correct; deductions correct |
| **R8** Budget report | Finance → Budget | Actual vs budget by category; no negative periods for income |

---

## 6. Finance Module — Accountant Verification Checklist

> Use this checklist whenever you want to verify the GL is in a clean state (e.g. after a migration, after a major feature, before a release).

### 6.1 GL Integrity Checks (run via Trial Balance)

```
[ ] Trial balance: SUM(all DR lines) = SUM(all CR lines) across all posted journals
[ ] All posted journals have isPosted=true AND at least 2 lines
[ ] No unposted journals with isPosted=true (impossible by schema, but check)
[ ] No journal line with amount=0 or amount<0 (negative amounts are bugs — use DR/CR side)
[ ] Reversal pairs: every entry with isReversed=true has a corresponding reversal entry
```

### 6.2 Balance Sheet Sanity

```
[ ] Total Assets = Total Liabilities + Total Equity
[ ] Bank/cash account balances match actual statement reconciliation
[ ] AR balance = sum of AR journal line debits for open (unreceived) income entries
    (NOT entry.amount — these differ when a custom journal splits the gross into AR + tax/other lines)
[ ] AP balance = sum of unpaid bills
[ ] PAYG Withheld Receivable = total tax withheld - total tax returned to date
[ ] Opening balances journal exists and is posted
```

### 6.3 P&L Sanity

```
[ ] Income accounts have credit balances (positive = CR)
[ ] Expense accounts have debit balances (positive = DR)
[ ] No income entry posts to an expense category or vice versa
[ ] Net Profit matches: Total Revenue - Total Expenses
[ ] Payslip entries: gross pay (not net) appears as income; PAYG is on balance sheet, not P&L
```

### 6.4 Draft / Unposted Check

```
[ ] No drafts stuck in 'draft' status beyond expected spawn horizon
[ ] No income entries with status='awaiting_receipt' that are older than 90 days (investigate)
[ ] Unposted FinanceJournalEntries: pre-spawn draft journals (linked via bill.journalEntryId or
    entry.journalEntryId on a status='draft' record) are intentionally unposted — exclude these
    from the "older than 30 days" alert. Only flag unposted journals with no linked draft record.
[ ] Bulk approve does not silently skip entries (check spawnedSnapshotHash match)
```

### 6.5 Payslip-Specific Checks

```
[ ] For every FinancePayslip: grossPay = netPay + paygWithheld + sgcAmount (allow ±$0.01 rounding)
[ ] Every posted payslip journal: sum(DR lines) = grossPay; sum(CR lines) = grossPay
[ ] PAYG Withheld Receivable balance reflects running total of all unrecouped withheld tax
[ ] No payslip entry where netPay > grossPay (would imply negative PAYG — a data error)
```

---

## 7. Finance Module — UI Component Inventory

> This table is the reference for blast-radius assessment. Before changing any component, check which pages embed it.

### 7.1 Dialog Components (`src/components/finance/`)

| Component | Purpose | Embeds / Used By |
|---|---|---|
| `TemplateFormDialog.tsx` | Create/edit recurring templates (bill or income). Has payslip mode, journal lines editor, schedule fields. | Templates page |
| `JournalEntryForm.tsx` | Create/edit manual journal entries. Full DR/CR line editor. | Journals page, inline from bill/income edit |
| `JournalLinesEditor.tsx` | Shared sub-component for DR/CR line entry. Used inside JournalEntryForm and TemplateFormDialog. | JournalEntryForm, TemplateFormDialog |
| `AmendmentDialog.tsx` | Create an amendment (correcting) journal entry linked to an original | Journals page |
| `ReversalDialog.tsx` | Create a reversal of a posted journal entry | Journals page |
| `VoidDialog.tsx` | Void a bill or income entry with reason | Bill list, income list |
| `CategoryDialog.tsx` | Create/edit GL account (FinanceCategory) | Accounts/Categories page |
| `AttachmentSection.tsx` | Upload/view attachments (receipts, invoices) | Bill edit, income edit |

### 7.2 Row / List Components

| Component | Purpose | Key Actions |
|---|---|---|
| `BillRow.tsx` | Single row in bills list | Mark invoice received, mark paid, void, edit, view journal |
| `IncomeRow.tsx` | Single row in income list | Mark received, void, edit, view journal |
| `TemplateListRow.tsx` | Single row in templates list | Edit, delete, spawn now |
| `JournalEntryRow.tsx` | Single row in journal list | Post, reverse, amend, view lines |
| `CategoryRow.tsx` | Single GL account row in chart of accounts | Edit, view ledger |
| `CategorySpendView.tsx` | Spending breakdown by category | Budget vs actual |

### 7.3 Panel / Report Components

| Component | Purpose |
|---|---|
| `AccountLedgerPanel.tsx` | Ledger for a single GL account — all journal lines with running balance |
| `TaxReportComponents.tsx` | Tax report display (PAYG, deductions, income) |
| `EmailReportModal.tsx` | Send monthly report via email |
| `MemberSelector.tsx` | Member/entity picker shared across bill/income forms |

### 7.4 Hooks (`src/hooks/finance/`)

| Hook | Manages | Blast Radius if Changed |
|---|---|---|
| `useIncomeCrud.ts` | All income CRUD: create, edit, mark received, void, payslip confirmation | Income page, draft panel |
| `useBillCrud.ts` | All bill CRUD: create, edit, mark paid, mark invoice received, void | Bills page, draft panel |
| `useTemplateCrud.ts` | Template CRUD + spawn trigger | Templates page |
| `useTransactionCrud.ts` | Legacy transaction CRUD (cash-basis ledger) | Transactions page |
| `useTrialBalance.ts` | Trial balance data fetch + formatting | Reports page |
| `useProfitLoss.ts` | P&L data fetch + period calc | Reports page |
| `usePaidBills.ts` | Paid bills history | Bills page history tab |
| `usePaymentHistory.ts` | Payment history per bill | Bill detail |
| `useAttachmentManager.ts` | File upload/delete for attachments | Bill edit, income edit |

---

## 8. Finance Module — API Route Inventory

### 8.1 GL / Journal Routes

| Method | Route | Purpose |
|---|---|---|
| GET/POST | `/api/finance/journals` | List journals / create manual journal |
| GET/PATCH/DELETE | `/api/finance/journals/[id]` | Get, update (post/unpost), delete journal |
| GET | `/api/finance/trial-balance` | Trial balance report |
| GET | `/api/finance/balance-sheet` | Balance sheet report |
| GET | `/api/finance/pnl` | P&L report (single period) |
| GET | `/api/finance/pnl/batch` | P&L for multiple periods |
| GET | `/api/finance/categories/[id]/ledger` | Ledger for a single GL account |
| GET | `/api/finance/accounts-payable` | AP aging report |
| GET | `/api/finance/accounts-receivable` | AR aging report |

### 8.2 Bill Routes

| Method | Route | Purpose |
|---|---|---|
| GET/POST | `/api/finance/bills` | List bills / create bill |
| GET/PATCH/DELETE | `/api/finance/bills/[id]` | *(via recurring bill model)* |
| POST | `/api/finance/bills/[id]/payments` | Record a payment |
| DELETE | `/api/finance/bills/[id]/payments/[paymentId]` | Delete a payment |
| GET/POST | `/api/finance/bills/[id]/attachments` | Manage attachments |

### 8.3 Income Routes

| Method | Route | Purpose |
|---|---|---|
| GET/POST | `/api/finance/income` | List income / create income entry |
| POST | `/api/finance/income/received` | Mark income received (posts receipt journal) |
| GET/POST | `/api/finance/income/[id]/attachments` | Manage attachments |

### 8.4 Draft Routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/finance/drafts` | List all pending drafts (bills + income) |
| GET/PATCH/DELETE | `/api/finance/drafts/[id]` | Get / edit / cancel a draft |
| POST | `/api/finance/drafts/[id]/approve` | Approve a single draft |
| POST | `/api/finance/drafts/[id]/cancel` | Cancel a draft |
| POST | `/api/finance/drafts/bulk-approve` | Bulk approve unchanged drafts |

### 8.5 Template Routes

| Method | Route | Purpose |
|---|---|---|
| GET/POST | `/api/finance/templates` | List templates / create template |
| GET/PATCH/DELETE | `/api/finance/templates/[id]` | Get / update / delete template |

### 8.6 Reference / Setup Routes

| Method | Route | Purpose |
|---|---|---|
| GET/POST/PATCH/DELETE | `/api/finance/categories` | Chart of accounts CRUD |
| POST | `/api/finance/categories/opening-balance` | Post opening balance journal |
| GET/POST/PATCH/DELETE | `/api/finance/accounts` | Bank account CRUD |
| POST | `/api/finance/accounts/opening-balance` | Set account opening balance |
| GET/POST/PATCH/DELETE | `/api/finance/entities` | Entity CRUD |
| GET/POST/PATCH/DELETE | `/api/finance/locations` | Location CRUD |
| GET/POST/PATCH/DELETE | `/api/finance/goals` | Savings goal CRUD |
| GET/POST/PATCH/DELETE | `/api/finance/budget` | Budget rule CRUD |
| GET/POST | `/api/finance/snapshots` | Monthly snapshot CRUD |
| GET | `/api/finance/tax-report` | Tax classification report |
| GET | `/api/finance/references` | Journal reference lookup |
| GET/POST | `/api/finance/members` | Members list (for assignment) |
| GET | `/api/finance/income-streams` | Income stream summary |
| POST | `/api/finance/email/send` | Send report email |
| GET | `/api/finance/export/excel` | Export to Excel |
| GET | `/api/finance/export/print` | Print-ready export |

---

## 9. Finance Module — Shared Code Blast Radius

> These files are shared across multiple features. A change here affects EVERYTHING that imports them. Test all dependent flows.

### 9.1 `src/lib/finance-posting.ts`

**Contains:** `postBillAccrualJournal`, `postBillPaymentJournal`, `postIncomeAccrualJournal`, `postIncomeReceiptJournal`, `postPayslipReceiptJournal`

**If changed:** Run smoke tests B1–B9, I1–I8, J1–J7.

**Critical invariants:**
- Branch selection logic (a/b/c) in `postIncomeAccrualJournal` and `postBillAccrualJournal` must not be changed without checking all call sites.
- `postPayslipReceiptJournal` must always produce: `sum(DR) = grossPay = sum(CR)`.

### 9.2 `src/lib/finance-draft-spawn-service.ts`

**Contains:** `spawnTemplateDrafts()` — creates FinanceRecurringBill or FinanceIncomeEntry from templates.

**If changed:** Run T4–T8, I6–I8, B5–B7, B10.

**Critical invariants:**
- Must capture `draftBill.id` / `draftEntry.id` from create call using `select: { id: true }` — never re-query (§12.1 anti-pattern).
- **Bills:** Must create linked unposted FinanceJournalEntry when template has ≥2 balanced lines (balance tolerance ≤ $0.005). Linked via `bill.journalEntryId`. This is what approval branch (a) promotes.
- **Income (non-payslip):** Must create linked unposted FinanceJournalEntry when template has ≥2 balanced lines AND `payslipEnabled=false`. Linked via `entry.journalEntryId`.
- **Income (payslip):** Must create FinancePayslip when `payslipEnabled=true`. No pre-spawn journal — GL is deferred to receipt stage.
- `spawnedSnapshotHash` must be recorded on the draft for bulk-approve to work correctly.
- If any GL account referenced by template lines is missing, disable the template and skip the draft (GL-vanished Option B).

### 9.3 `src/lib/finance-draft-approval-service.ts`

**Contains:** `approveIncomeDraft`, `approveBillDraft`, `bulkApproveUnchangedDrafts`

**If changed:** Run B5–B7, I6, T4.

**Critical invariants:**
- Payslip income approval must NOT post GL (deferred to receipt stage).
- Simple income approval must call `postIncomeAccrualJournal`.
- Bulk approve must check hash match before approving.

### 9.4 `src/hooks/finance/useIncomeCrud.ts`

**Used by:** Income list page, Drafts panel.

**If changed:** Run I1–I8.

**Critical invariants:**
- `handleMarkReceived` must pre-populate payslip form from `entry.payslip` when present.
- `receivedConfirmActualAmount` must default to `netPay`, not `grossPay`, for payslip entries.
- Must not reset payslip to `enabled: false` if the income entry has a stored payslip.

### 9.5 `src/hooks/finance/useBillCrud.ts`

**Used by:** Bills list page, Drafts panel.

**If changed:** Run B1–B9.

### 9.6 `src/components/finance/JournalLinesEditor.tsx`

**Embedded in:** `JournalEntryForm.tsx`, `TemplateFormDialog.tsx`

**If changed:** Test both manual journal creation (J1–J3) and template creation with custom lines (T1, T5).

**Critical invariants:**
- Must validate DR=CR before allowing save.
- Must not silently drop lines on re-render.
- Adding a line must not reset existing line amounts.

---

## 10. Non-Finance Modules — Regression Smoke Tests

> Finance is the highest priority, but these should be checked after broad changes (routing, auth, shared components, DB changes).

### 10.1 Authentication

```
[ ] Login with valid credentials → redirected to dashboard
[ ] Login with invalid credentials → error shown, not redirected
[ ] Invite code flow → new user created and family linked with role=member
[ ] Admin invite code flow (isAdminInvite=true) → first registrant gets role=admin
[ ] First-ever registration → user gets isSystemAdmin=true and role=admin
[ ] Protected routes redirect unauthenticated users to login
```

### 10.2 Events / Calendar

```
[ ] Create event → appears on calendar
[ ] Edit event → changes saved
[ ] Recurring event → occurrences generated
[ ] Delete event → removed from calendar
[ ] Google Calendar sync → events appear in HomeBase and Google (if connected)
```

### 10.3 Recipes / Meal Plan

```
[ ] Add recipe → searchable and viewable
[ ] Add to meal plan → appears on correct day
[ ] Generate shopping list from meal plan → ingredients aggregated
[ ] Recipe book → recipes grouped correctly
```

### 10.4 Lists

```
[ ] Create list → visible to family
[ ] Add list items → items persist
[ ] Check off item → checked state saved
[ ] List templates → create list from template
```

### 10.5 Chores

```
[ ] Create chore → assigned to member
[ ] Mark complete → completion recorded
[ ] Recurring chore → next instance created after completion
```

### 10.6 Trips

```
[ ] Create trip → visible in trip list
[ ] Add itinerary items → appear in sidebar and map view
[ ] Drag to reorder items → order persists
[ ] Move item across days → date updates correctly
[ ] Reverse days → itinerary order inverted
```

### 10.7 Notes / Documents

```
[ ] Create note → saved and searchable
[ ] Upload document → stored and downloadable
[ ] Tag note/document → tag appears in tag manager
```

### 10.8 Tags (cross-module)

```
[ ] Tags scoped per module — recipe tags don't appear in trip tag picker (and vice versa)
[ ] Tag manager shows correct usage counts per module
[ ] Deleting a tag does not break items that used it
```

### 10.9 Finance Settings — Visibility & Module Toggle

Per-user Finance nav visibility (stored in `uiPreferences.financeNav`):

```
[ ] Settings → Finance → Finance menu visibility: hiding an item removes it from the Finance sidebar
[ ] Toggling a hidden item back to visible restores it in the sidebar
[ ] "Hide all" hides all items except Overview (always visible)
[ ] "Show all" restores all items
[ ] Per-user — one user's visibility settings do not affect another user's sidebar
```

Family-level Hide Finance Module (admin setting, stored on `Family.hideFinanceModule`):

```
[ ] Settings → Finance → "Hide Finance module" toggle is admin-only (non-admins see 403 if they PATCH directly)
[ ] When enabled: Finance section disappears from sidebar for ALL family members; Budget Planner link appears instead
[ ] When disabled: Finance section restored for all members
[ ] Budget Planner link navigates correctly to /finance/simple-budget-planner
```

### 10.10 System Admin — Family Management

System admin is the first-ever registered user (`User.isSystemAdmin=true`). Only they can access family management.

```
[ ] Admin page → Families tab: non-system-admins see "System admin access required" message
[ ] System admin sees list of all families with member count
[ ] Create Family: requires name; creates family + admin invite code (isAdminInvite=true, 7-day expiry)
[ ] Invite code displayed after create; copy button works
[ ] Copy recipes checkbox: when checked, all recipes and recipe books from the system admin's family are copied to the new family
[ ] Per-family "Invite" button generates a member invite code (isAdminInvite=false)
[ ] Expand family row → shows member list with name, email, role
[ ] Reset password: requires min 8 chars; updates password for the target user; success toast shown
[ ] Reset password cancel clears the input field
[ ] All family API routes (/api/admin/families/**) return 403 for non-system-admin users
```

---

## 11. Build & Deploy Checks

### 11.1 Before Every Commit

```sh
# Must pass with zero errors:
npx tsc --noEmit

# Grep for common patterns that cause silent bugs:
# 1. Missing await on Prisma calls
grep -rn "\.create(\|\.update(\|\.delete(\|\.upsert(" src/app/api --include="*.ts" | grep -v "await "

# 2. Any new finance posting function that doesn't return the journal id
grep -n "financeJournalEntry.create" src/lib/finance-posting.ts
```

### 11.2 Prisma Migration Safety

```
[ ] Run: npx prisma validate
[ ] Run: npx prisma generate (after schema changes)
[ ] New migration file created in prisma/migrations/
[ ] No migration_lock.toml inside a migration subdirectory (Deepseek anti-pattern — see memory)
[ ] Migration is additive (no column drops without explicit user approval)
[ ] All new non-nullable columns have a default OR the migration backfills existing rows
```

### 11.3 Docker Build (NAS Deploy)

```
[ ] docker build succeeds locally
[ ] Container start runs migrations (entry point runs: npx prisma migrate deploy)
[ ] No missing environment variables at startup
[ ] Finance routes respond at /api/finance/trial-balance (health check proxy)
```

---

## 12. Known Bug Patterns & Anti-Patterns

### 12.1 "Re-query after create" Anti-Pattern

**Wrong:**
```typescript
await tx.financeIncomeEntry.create({ data: { ... } })
const entry = await tx.financeIncomeEntry.findFirst({ where: { ... } }) // ← race condition
```

**Correct:**
```typescript
const entry = await tx.financeIncomeEntry.create({ data: { ... }, select: { id: true } })
```

### 12.2 "Reset to defaults on open" Bug

**Wrong:**
```typescript
function handleMarkReceived(entry) {
  setPayslipForm({ enabled: false, grossPay: entry.amount, netPay: entry.amount }) // ← ignores stored payslip
}
```

**Correct:**
```typescript
function handleMarkReceived(entry) {
  if (entry.payslip) {
    setPayslipForm({ enabled: true, ...fromStoredPayslip(entry.payslip) })
  } else {
    setPayslipForm({ enabled: false, grossPay: entry.amount, netPay: entry.amount })
  }
}
```

### 12.3 "Template lines not materialised" Bug

Template lines in `FinanceRecurringTemplateLine` must be read at spawn time and written into an unposted `FinanceJournalEntry`. If the spawn service only creates the income/bill entry without a linked journal, the approval service falls back to the 2-line DR AR / CR Income default — losing all custom splits and PAYG allocations.

### 12.4 "Income account on wrong side" Bug

Income accounts (type='income') always have a **credit** normal balance. If a template line shows an income account on the **debit** side, the P&L will be inverted for that account. Check: does the template line show `side='credit'` for all income GL accounts?

### 12.5 "AP used for income payslip" Bug

Accounts Payable is a liability account for bills owed **to others**. It must never appear on a payslip income journal. The correct counterpart for PAYG withheld is a **current asset** account (PAYG Tax Withheld Receivable), because the employee will reclaim it at tax return time.

### 12.6 "Silent field loss in forms" Pattern

Layout refactors (adding tabs, columns, scroll regions) are the highest-risk operation for dropping fields silently. Always enumerate all `<input>`, `<select>`, `<textarea>`, and checkbox elements before and after every form layout change. See AGENTS.md for the full checklist.

### 12.7 "Fix one instance, miss others" Pattern

When a bug is found in a shared function (e.g. `handleMarkReceived`), check all callers of that function for the same pattern. When a type error is found in one file, grep the entire `src/` directory for the same pattern.

### 12.8 Deleted Draft Cannot Be Recreated — Fixed 2026-05-18

**Problem:** When the spawn service creates a draft it advances the template's stored `nextDueDate` to the next occurrence. If the draft is subsequently deleted, `nextDueDate` is NOT rolled back. The spawn service reads `nextDueDate` exclusively — it ignores the template's `startDate` field entirely. This means:

- Deleting a draft permanently loses that scheduled occurrence; it will not be recreated.
- Changing the template's Start Date in the UI has no effect on when the next spawn fires.
- There is no UI path to recover a deleted draft without direct database access (Prisma Studio).

**Why this is an accounting issue:** A scheduled income or expense occurrence is a financial expectation. Accidental deletion should be recoverable. Any proper accounting system (Xero, MYOB) allows a cancelled recurring transaction to be reissued for the same date.

**Workaround (until fixed):** Use Prisma Studio to set `nextDueDate` on the `FinanceRecurringTemplate` record back to the desired occurrence date, then Run Spawn.

**Fix shipped:** `TemplateFormDialog.tsx` FrequencyTab (edit mode) now shows "Override next spawn date" — leave blank for normal schedule computation, or set a date to force the next spawn. Amber warning shown when a date is entered. See `finance-template-helpers.ts` (`nextSpawnDate` / `currentNextSpawnDate`) and `finance-recurring-template-service.ts` (`UpdateTemplateInput.nextOccurrenceDate`).

**Smoke test:** Delete a draft → open the template → set Override next spawn date to the deleted occurrence date → save → Run Spawn → draft recreated for correct date.

### 12.9 Bill Draft Journal Lines Ignored — Fixed 2026-05-18

**Problem:** Bill drafts spawned from templates with ≥2 lines (e.g. expense + GST + AP) always showed the wrong 2-line generic default in the draft edit dialog and posted the wrong 2-line journal at approval, regardless of what the template specified. This affected every bill template with a GST split line.

**Root cause (three co-operating bugs):**
1. The spawn service never pre-created a `FinanceJournalEntry` for bill drafts (unlike income). No pre-spawn journal meant no template lines were available to the edit dialog.
2. The GET `/api/finance/drafts` route did not include `journalEntry` on the bills query, so even if a journal had existed it would not have been returned.
3. The draft edit dialog `openEdit` fell back to a hardcoded 2-line bill default for all bills regardless of what was stored.
4. `handleEditSave` only sent `lines` in the PATCH body for `kind === 'income'`, silently discarding any line edits the user made to a bill draft.

**Fix shipped 2026-05-18:**
- Spawn service now creates an unposted `FinanceJournalEntry` for bill drafts with ≥2 balanced template lines, linked via `bill.journalEntryId` (same pattern as income).
- GET route now includes `journalEntry` on bills.
- PATCH route now updates (or creates) the linked journal for both bills and income — "create if not exists" handles old drafts spawned before the fix.
- `openEdit` loads from the linked journal for both kinds, falling back to per-kind defaults only when no linked journal exists.
- `handleEditSave` sends `lines` for both bills and income.

**Smoke test:** Create a bill template with 3 lines (DR Expense / DR GST Receivable / CR AP) → spawn → open draft in edit dialog → verify 3 lines shown with correct accounts → approve → verify posted journal has 3 lines → check trial balance unchanged. (See B10.)

---

### 12.10 "AR subledger uses entry.amount instead of AR journal line" Bug

**Problem:** The AR aging subledger used `entry.amount` (the income record's gross face value) as the outstanding amount per entry. For simple income entries this matches the AR debit. For entries with a custom journal split (e.g. salary with PAYG withheld: DR AR $971.56 / DR Tax $361 / CR Gross Wages $1,332.56), `entry.amount` = gross $1,332.56 but the actual AR debit is $971.56 — causing a subledger vs GL control reconciliation difference equal to the non-AR splits (here: $361).

**Root cause:** `accounts-receivable/route.ts` read `e.amount` in the subledger map instead of summing the AR GL account's debit lines from the accrual journal entry.

**Fix shipped 2026-05-19:** Route now fetches `journalEntry.lines` for each income entry and sums lines where `glAccountId = AR account ID` and `side = 'debit'`. Falls back to `e.amount` only when no such lines exist (simple entries with no custom journal).

**Smoke test:** Create an income entry with a custom journal split (e.g. DR AR + DR Tax / CR Gross). Mark it invoice-received. Open AR Aging → verify the subledger shows the AR line amount (not gross), and reconciliation difference = $0.

### 12.11 Admin Page Has No Server-Side Route Guard (Known Gap)

The `/admin` page is a `'use client'` component with no server-side auth check or `layout.tsx` enforcing `requireAdmin()`. The admin link in the sidebar is only shown to admins, but a non-admin who navigates to `/admin` directly will see the page. The API routes themselves are individually protected, so no data is exposed — but the UI is visible.

**Workaround:** Admin-only API routes return 401/403. The Families tab handles 403 with an in-page message. The pre-existing operations tab (spawn, logs) should also have auth checks added.

**Fixed 2026-05-19:** `src/app/(app)/admin/layout.tsx` added — calls `requireAdmin()` server-side, redirects non-admins to `/home`.

*Last updated: 2026-05-19. Maintained by the development team — update on every significant feature or bug fix.*
