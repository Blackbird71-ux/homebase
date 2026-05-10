# Homebase — Complete Accounting System Specification
## General Ledger · Double-Entry · Journals · Balance Sheet · Trial Balance
### AI Agent Implementation Guide — Replace GnuCash, Unify Everything

> **Stack:** Next.js App Router · SQLite via Prisma · Tailwind + shadcn/ui · `sonner` toasts
> **Working dir:** `C:\Appdev\HomeBase`
> **Migrations:** Create SQL file in `prisma/migrations/` + update `prisma/schema.prisma` +
>   run `npx prisma generate`. Docker `entrypoint.sh` runs `prisma migrate deploy` on NAS
>   automatically — no manual steps needed on production.
> **Do NOT commit to git** — user commits manually after review.

---

## 0. THE ACCOUNTANT'S DIAGNOSIS — Read Every Word

### What GnuCash Does That Homebase Currently Cannot

GnuCash is a full double-entry ledger. Every transaction posts to exactly two accounts —
one debit, one credit. The chart of accounts has balances. You can print a Trial Balance
that proves debits = credits. You can print a Balance Sheet showing net worth at any date.

Homebase currently has:
- `FinanceAccount` — bank/credit card accounts with derived cash balances ✅
- `FinanceCategory` — labeled "Chart of Accounts" in the UI but has NO balance ❌
- `FinanceTransaction` — single-sided cash entries (one account, one category label) ❌
- No journal entries ❌
- No Trial Balance ❌
- No Balance Sheet ❌

### The Fundamental Gap — Single-Sided vs Double-Sided

When you record "paid $500 electricity from ANZ Savings" in Homebase right now:
```
FinanceTransaction: type=expense, amount=500, accountId=ANZ, categoryId=Electricity
```

What actually happens in the database: ANZ balance goes down $500. Good.
What does NOT happen: The Electricity GL account goes up $500. The category has no balance.

In GnuCash the same transaction creates:
```
DEBIT  Expenses:Electricity   $500   (expense account increases)
CREDIT Assets:ANZ Savings     $500   (asset account decreases)
```

Both sides are in the ledger. You can ask "what is the total in Electricity this year?"
AND "what is my ANZ balance?" from the same source of truth.

### The Accounting Equation That Must Always Hold

  **Assets = Liabilities + Equity**

  And therefore:

  **Total Debits (all accounts) = Total Credits (all accounts)**

For a Balance Sheet to be possible, this equation must hold at every moment.
Right now Homebase cannot produce a Balance Sheet because only one side of each
transaction is recorded in the ledger.

### What We Are Building

We are adding a proper double-entry layer ON TOP of the existing system without
breaking anything currently working. The approach:

1. **`JournalEntry` + `JournalLine` models** — the proper GL backbone
2. **Every `FinanceTransaction` auto-generates a `JournalEntry`** with two lines
3. **`FinanceCategory` gets GL balance fields** — it IS the Chart of Accounts
4. **`FinanceAccount` (bank accounts) links to its GL category** — so bank movements
   post to the right GL account
5. **Opening balances post journal entries** — on the COA directly
6. **Journals page** — manual entries, adjustments, accruals, depreciation
7. **Trial Balance page** — proves the ledger is balanced
8. **Balance Sheet page** — Assets / Liabilities / Equity at any date
9. **P&L updated** to read from journal lines (the single source of truth)

### The Normal Balance Rule (Critical for Getting Signs Right)

Every account type has a "normal balance" side. Increases go to the normal side;
decreases go to the opposite side.

| Account Type | Normal Balance | Increased by | Decreased by |
|---|---|---|---|
| Asset | DEBIT | Debit | Credit |
| Expense | DEBIT | Debit | Credit |
| Liability | CREDIT | Credit | Debit |
| Equity | CREDIT | Credit | Debit |
| Income/Revenue | CREDIT | Credit | Debit |

A bank account (Asset) has a DEBIT normal balance.
When you receive income, you DEBIT the bank (it goes up) and CREDIT income (income goes up).
When you pay an expense, you CREDIT the bank (it goes down) and DEBIT expense (expense goes up).

The GL balance of an account = sum of all DEBIT lines - sum of all CREDIT lines.
For assets/expenses: positive result = debit balance = normal = healthy.
For liabilities/equity/income: negative result = credit balance = normal = healthy.

For **display purposes** we negate liability/equity/income balances so they show as
positive numbers to the user (e.g. a mortgage liability of -$400,000 net debit balance
displays as $400,000 owed).

---

## 1. Pre-Flight Checks

```bash
# Confirm working directory
pwd   # must be C:\Appdev\HomeBase

# Check last migration — new ones must sort after this
ls prisma/migrations/ | sort | tail -3
# Expected: 20260522000000_fix_opening_balance_sign

# Confirm the stale currentBalance mutations still exist in transactions/route.ts
grep -n "currentBalance" src/app/api/finance/transactions/route.ts
# Will show 3 blocks — these must all be removed in step 2

# Confirm no JournalEntry model yet
grep -c "JournalEntry" prisma/schema.prisma
# Must return 0

# Check FinanceCategory has no balance field yet
grep -n "openingBalance\|glBalance" prisma/schema.prisma | grep -i category
# Must return 0

# List finance nav tabs so we know where to add new pages
grep "href.*finance" src/app/\(app\)/finance/layout.tsx
```

---

## 2. IMMEDIATE BUG FIX — Remove Stale `currentBalance` Direct Mutations

**File:** `src/app/api/finance/transactions/route.ts`

This is a correctness bug introduced before the derive-from-transactions approach.
These three blocks write directly to `FinanceAccount.currentBalance` but balance
is now always derived from transactions. Remove all three blocks completely.

### Block 1 — In POST handler, find and DELETE entirely:
```typescript
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

### Block 2 — In PUT handler, find and DELETE the reversal block:
```typescript
// Reverse old balance change if account changed or amount/type changed
if (existing.accountId && (existing.accountId !== accountId || existing.amount !== amount || existing.type !== type)) {
  const oldChange = existing.type === 'income' ? -existing.amount : existing.type === 'expense' ? existing.amount : 0
  if (oldChange !== 0) {
    await prisma.financeAccount.update({
      where: { id: existing.accountId },
      data: { currentBalance: { increment: oldChange } },
    })
  }
}
```

### Block 3 — In PUT handler, find and DELETE the new balance block:
```typescript
// Apply new balance change
if (transaction.accountId) {
  const newChange = transaction.type === 'income' ? transaction.amount : transaction.type === 'expense' ? -transaction.amount : 0
  if (newChange !== 0) {
    await prisma.financeAccount.update({
      where: { id: transaction.accountId },
      data: { currentBalance: { increment: newChange } },
    })
  }
}
```

### Block 4 — In DELETE handler, find and DELETE the reversal block:
```typescript
// Reverse balance
if (existing.accountId) {
  const change = existing.type === 'income' ? -existing.amount : existing.type === 'expense' ? existing.amount : 0
  if (change !== 0) {
    await prisma.financeAccount.update({
      where: { id: existing.accountId },
      data: { currentBalance: { increment: change } },
    })
  }
}
```

### Also fix POST type validation — add `opening_balance` and `journal`:
```typescript
// BEFORE:
if (!['income', 'expense', 'transfer'].includes(type)) {
// AFTER:
if (!['income', 'expense', 'transfer', 'opening_balance', 'journal'].includes(type)) {
```

---

## 3. Schema Changes

### 3.1 Add to `FinanceCategory` (Chart of Accounts GL fields)

```prisma
// GL Account fields — makes FinanceCategory a true GL account with balances
glCode              String?   // Account code, e.g. "1001", "2100", "4000" (optional)
openingBalance      Float?    // Starting balance as at openingBalanceDate
openingBalanceDate  DateTime? // As-at date for the opening balance
// Balance is derived from JournalLines — see gl-balances API.
// journalLines relation added below.
```

### 3.2 Add to `FinanceAccount` (link bank account to GL category)

```prisma
// Links this bank/credit account to its GL account in the Chart of Accounts.
// When a transaction hits this bank account, the journal entry will debit/credit
// this GL account on one side.
glAccountId     String?
glAccount       FinanceCategory? @relation("BankAccountGLLink",
                  fields: [glAccountId], references: [id], onDelete: SetNull)
```

### 3.3 New model — `JournalEntry`

```prisma
model JournalEntry {
  id                  String        @id @default(cuid())
  date                DateTime      // Effective date of the entry
  reference           String?       // Auto-generated: "JE-0001" or "OB-ANZ-2025"
  description         String        // Human-readable description
  type                String        @default("manual")
  // Valid types:
  // manual            — user-created journal entry
  // opening_balance   — opening balance entry (created by the system)
  // auto_transaction  — auto-generated from a FinanceTransaction
  // reversal          — reversal of a posted entry
  // adjustment        — correction/adjustment

  isPosted            Boolean       @default(false)
  // DRAFT (isPosted=false): does not affect GL balances. Fully editable.
  // POSTED (isPosted=true): affects GL balances. Cannot be edited.
  //   To correct a posted entry, create a Reversal (which auto-posts).

  isReversed          Boolean       @default(false)
  reversalOfId        String?       // The entry this one reverses
  reversalOf          JournalEntry? @relation("JEReversals",
                        fields: [reversalOfId], references: [id], onDelete: SetNull)
  reversals           JournalEntry[] @relation("JEReversals")

  // Source links — set when auto-generated from other records
  sourceTransactionId String?       @unique  // FK → FinanceTransaction
  sourceBillId        String?       // FK → FinanceRecurringBill (reference only)
  sourceIncomeId      String?       // FK → FinanceIncomeEntry (reference only)

  lines               JournalLine[]

  entityId            String?
  entity              FinanceEntity? @relation(fields: [entityId],
                        references: [id], onDelete: SetNull)
  createdBy           String
  familyId            String
  family              Family        @relation(fields: [familyId],
                        references: [id], onDelete: Cascade)
  createdAt           DateTime      @default(now())
  updatedAt           DateTime      @updatedAt

  @@index([familyId])
  @@index([familyId, date(sort: Desc)])
  @@index([familyId, type])
  @@index([familyId, isPosted])
  @@index([sourceTransactionId])
  @@index([entityId])
}
```

### 3.4 New model — `JournalLine`

```prisma
model JournalLine {
  id              String          @id @default(cuid())
  journalEntryId  String
  journalEntry    JournalEntry    @relation(fields: [journalEntryId],
                    references: [id], onDelete: Cascade)

  // The GL account this line posts to.
  // Uses FinanceCategory as the GL account.
  glAccountId     String
  glAccount       FinanceCategory @relation("GLAccountLines",
                    fields: [glAccountId], references: [id], onDelete: Restrict)

  side            String          // "debit" | "credit"
  amount          Float           // Always positive. The side field carries the sign meaning.

  description     String?         // Line-level note (optional)
  memberId        String?         // For tax attribution (which person this belongs to)

  familyId        String
  createdAt       DateTime        @default(now())

  @@index([journalEntryId])
  @@index([glAccountId])
  @@index([familyId])
  @@index([familyId, glAccountId])
}
```

### 3.5 Add relations to existing models

**In `Family` model, add:**
```prisma
journalEntries  JournalEntry[]
```

**In `FinanceEntity` model, add:**
```prisma
journalEntries  JournalEntry[]
```

**In `FinanceCategory` model, add:**
```prisma
journalLines    JournalLine[]    @relation("GLAccountLines")
bankAccounts    FinanceAccount[] @relation("BankAccountGLLink")
```

---

## 4. Migration File

**Create directory and file:**
`prisma/migrations/20260523000000_add_journal_double_entry/migration.sql`

```sql
-- ============================================================
-- Homebase: Add double-entry journal system
-- Migration: 20260523000000_add_journal_double_entry
-- ============================================================

-- ── 1. Add GL fields to FinanceCategory (Chart of Accounts) ──
ALTER TABLE "FinanceCategory" ADD COLUMN "glCode"             TEXT;
ALTER TABLE "FinanceCategory" ADD COLUMN "openingBalance"     REAL;
ALTER TABLE "FinanceCategory" ADD COLUMN "openingBalanceDate" DATETIME;

-- ── 2. Link FinanceAccount to its GL category ─────────────────
ALTER TABLE "FinanceAccount"  ADD COLUMN "glAccountId"        TEXT;

-- ── 3. Create JournalEntry ────────────────────────────────────
CREATE TABLE "JournalEntry" (
  "id"                  TEXT     NOT NULL PRIMARY KEY,
  "date"                DATETIME NOT NULL,
  "reference"           TEXT,
  "description"         TEXT     NOT NULL,
  "type"                TEXT     NOT NULL DEFAULT 'manual',
  "isPosted"            BOOLEAN  NOT NULL DEFAULT 0,
  "isReversed"          BOOLEAN  NOT NULL DEFAULT 0,
  "reversalOfId"        TEXT,
  "sourceTransactionId" TEXT     UNIQUE,
  "sourceBillId"        TEXT,
  "sourceIncomeId"      TEXT,
  "entityId"            TEXT,
  "createdBy"           TEXT     NOT NULL,
  "familyId"            TEXT     NOT NULL,
  "createdAt"           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("reversalOfId") REFERENCES "JournalEntry"("id")   ON DELETE SET NULL,
  FOREIGN KEY ("entityId")     REFERENCES "FinanceEntity"("id")  ON DELETE SET NULL,
  FOREIGN KEY ("familyId")     REFERENCES "Family"("id")         ON DELETE CASCADE
);

CREATE INDEX "JE_familyId_idx"         ON "JournalEntry"("familyId");
CREATE INDEX "JE_familyId_date_idx"    ON "JournalEntry"("familyId", "date" DESC);
CREATE INDEX "JE_familyId_type_idx"    ON "JournalEntry"("familyId", "type");
CREATE INDEX "JE_familyId_posted_idx"  ON "JournalEntry"("familyId", "isPosted");
CREATE INDEX "JE_entityId_idx"         ON "JournalEntry"("entityId");

-- ── 4. Create JournalLine ─────────────────────────────────────
CREATE TABLE "JournalLine" (
  "id"             TEXT     NOT NULL PRIMARY KEY,
  "journalEntryId" TEXT     NOT NULL,
  "glAccountId"    TEXT     NOT NULL,
  "side"           TEXT     NOT NULL,
  "amount"         REAL     NOT NULL,
  "description"    TEXT,
  "memberId"       TEXT,
  "familyId"       TEXT     NOT NULL,
  "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id")    ON DELETE CASCADE,
  FOREIGN KEY ("glAccountId")    REFERENCES "FinanceCategory"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("familyId")       REFERENCES "Family"("id")          ON DELETE CASCADE
);

CREATE INDEX "JL_journalEntryId_idx"       ON "JournalLine"("journalEntryId");
CREATE INDEX "JL_glAccountId_idx"          ON "JournalLine"("glAccountId");
CREATE INDEX "JL_familyId_idx"             ON "JournalLine"("familyId");
CREATE INDEX "JL_familyId_glAccountId_idx" ON "JournalLine"("familyId", "glAccountId");
```

After creating this file:
1. Update `prisma/schema.prisma` with all models and fields from Section 3
2. Run `npx prisma generate`
3. Run `npx prisma migrate deploy`

---

## 5. Shared Library — `src/lib/finance-journal.ts`

Create this file. It contains all the business logic for creating journal entries.
All API routes import from here — no business logic lives in the route files.

```typescript
// src/lib/finance-journal.ts
// Double-entry journal helpers — the accounting engine for Homebase.
// All journal creation, validation, and GL balance computation lives here.

import { prisma } from '@/lib/prisma'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface JournalLineInput {
  glAccountId: string
  side: 'debit' | 'credit'
  amount: number        // always positive
  description?: string
  memberId?: string | null
}

// Normal balance side by account type.
// Debits INCREASE asset/expense accounts.
// Credits INCREASE liability/equity/income accounts.
export function normalBalanceSide(accountType: string): 'debit' | 'credit' {
  return (accountType === 'asset' || accountType === 'expense') ? 'debit' : 'credit'
}

// ─── Reference generator ────────────────────────────────────────────────────

export async function nextJournalRef(familyId: string): Promise<string> {
  const count = await prisma.journalEntry.count({ where: { familyId } })
  return `JE-${String(count + 1).padStart(4, '0')}`
}

// ─── Validation ─────────────────────────────────────────────────────────────

export function validateJournalLines(lines: JournalLineInput[]): string | null {
  if (!lines || lines.length < 2) {
    return 'A journal entry requires at least 2 lines (one debit, one credit).'
  }
  const debitTotal  = lines.filter(l => l.side === 'debit').reduce((s, l) => s + l.amount, 0)
  const creditTotal = lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
  if (Math.abs(debitTotal - creditTotal) > 0.005) {
    return `Debits ($${debitTotal.toFixed(2)}) must equal credits ($${creditTotal.toFixed(2)}). ` +
           `Difference: $${Math.abs(debitTotal - creditTotal).toFixed(2)}`
  }
  return null   // valid
}

// ─── Ensure system accounts exist ───────────────────────────────────────────

export async function ensureSystemCategory(
  familyId: string,
  name: string,
  type: string,
): Promise<string> {
  const existing = await prisma.financeCategory.findFirst({
    where: { familyId, name, type, isSystem: true },
    select: { id: true },
  })
  if (existing) return existing.id
  const created = await prisma.financeCategory.create({
    data: { name, type, isSystem: true, level: 0, familyId },
    select: { id: true },
  })
  return created.id
}

// "Opening Balances" equity account — the credit side of every OB entry
export async function ensureOpeningBalancesAccount(familyId: string): Promise<string> {
  // Also cache on Family to avoid repeated lookups
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: { openingBalancesCategoryId: true },
  })
  if (family?.openingBalancesCategoryId) return family.openingBalancesCategoryId
  const id = await ensureSystemCategory(familyId, 'Opening Balances', 'equity')
  await prisma.family.update({ where: { id: familyId }, data: { openingBalancesCategoryId: id } })
  return id
}

// "Accounts Payable" — credit side when invoice received for a bill
export async function ensureAccountsPayable(familyId: string): Promise<string> {
  return ensureSystemCategory(familyId, 'Accounts Payable', 'liability')
}

// "Accounts Receivable" — debit side when remittance received for income
export async function ensureAccountsReceivable(familyId: string): Promise<string> {
  return ensureSystemCategory(familyId, 'Accounts Receivable', 'asset')
}

// ─── Core journal entry creator ──────────────────────────────────────────────

export async function createJournalEntry(params: {
  familyId:            string
  createdBy:           string
  date:                Date
  description:         string
  type:                string
  lines:               JournalLineInput[]
  entityId?:           string | null
  isPosted?:           boolean          // default true for system-generated; false for manual drafts
  sourceTransactionId?: string | null
  sourceBillId?:       string | null
  sourceIncomeId?:     string | null
  reference?:          string | null
}): Promise<string> {   // returns JournalEntry.id
  const error = validateJournalLines(params.lines)
  if (error) throw new Error(error)

  const ref = params.reference ?? await nextJournalRef(params.familyId)

  const entry = await prisma.journalEntry.create({
    data: {
      date:                params.date,
      reference:           ref,
      description:         params.description,
      type:                params.type,
      isPosted:            params.isPosted ?? true,
      entityId:            params.entityId ?? null,
      sourceTransactionId: params.sourceTransactionId ?? null,
      sourceBillId:        params.sourceBillId ?? null,
      sourceIncomeId:      params.sourceIncomeId ?? null,
      createdBy:           params.createdBy,
      familyId:            params.familyId,
      lines: {
        create: params.lines.map(l => ({
          glAccountId:  l.glAccountId,
          side:         l.side,
          amount:       Math.abs(l.amount),
          description:  l.description ?? null,
          memberId:     l.memberId ?? null,
          familyId:     params.familyId,
        })),
      },
    },
    select: { id: true },
  })
  return entry.id
}

// ─── Opening balance journal entry for a GL account (FinanceCategory) ────────
// Asset/Expense accounts (debit-normal):
//   Positive OB: DR this account / CR Opening Balances
//   Negative OB: DR Opening Balances / CR this account
// Liability/Equity/Income accounts (credit-normal):
//   Positive OB: DR Opening Balances / CR this account
//   Negative OB: DR this account / CR Opening Balances

export async function postGLOpeningBalance(params: {
  familyId:   string
  createdBy:  string
  categoryId: string
  amount:     number    // signed: positive = normal balance, negative = abnormal
  date:       Date
}): Promise<void> {
  const { familyId, createdBy, categoryId, amount, date } = params
  if (amount === 0 || amount == null) return

  const category = await prisma.financeCategory.findFirst({
    where: { id: categoryId, familyId },
    select: { id: true, name: true, type: true },
  })
  if (!category) throw new Error('GL account not found')

  const obAccountId = await ensureOpeningBalancesAccount(familyId)
  const isDebitNormal = normalBalanceSide(category.type) === 'debit'
  const absAmount = Math.abs(amount)
  const isPositive = amount > 0

  // Determine which account gets the debit and which gets the credit
  let debitAccountId: string
  let creditAccountId: string

  if (isDebitNormal && isPositive) {
    // Asset/expense with positive OB: DR this account (increases asset)
    debitAccountId  = categoryId
    creditAccountId = obAccountId
  } else if (isDebitNormal && !isPositive) {
    // Asset/expense with negative OB: unusual (e.g. overdraft), CR this account
    debitAccountId  = obAccountId
    creditAccountId = categoryId
  } else if (!isDebitNormal && isPositive) {
    // Liability/equity/income with positive OB: CR this account (increases liability)
    debitAccountId  = obAccountId
    creditAccountId = categoryId
  } else {
    // Liability/equity/income with negative OB: unusual, DR this account
    debitAccountId  = categoryId
    creditAccountId = obAccountId
  }

  await createJournalEntry({
    familyId,
    createdBy,
    date,
    description: `Opening balance: ${category.name}`,
    type: 'opening_balance',
    isPosted: true,
    lines: [
      { glAccountId: debitAccountId,  side: 'debit',  amount: absAmount, description: `Opening balance: ${category.name}` },
      { glAccountId: creditAccountId, side: 'credit', amount: absAmount, description: `Opening balance: ${category.name}` },
    ],
  })

  // Persist the amount and date on the category for fast display
  await prisma.financeCategory.update({
    where: { id: categoryId },
    data: { openingBalance: amount, openingBalanceDate: date },
  })
}

// ─── Auto-generate journal entry from a FinanceTransaction ───────────────────
// This is called whenever a FinanceTransaction is created or updated.
// It finds the GL accounts for both sides and creates the corresponding journal entry.
//
// The bank/cash account side uses financeAccount.glAccountId (if linked).
// If no GL account is linked to the bank account, we use a system "Unlinked Bank" asset account.
// The category side uses transaction.categoryId directly (it IS a GL account).

export async function syncTransactionJournal(params: {
  familyId:      string
  createdBy:     string
  transactionId: string
}): Promise<void> {
  const { familyId, createdBy, transactionId } = params

  const tx = await prisma.financeTransaction.findFirst({
    where: { id: transactionId, familyId },
    include: {
      account:  { select: { id: true, name: true, glAccountId: true } },
      category: { select: { id: true, name: true, type: true } },
    },
  })
  if (!tx) return
  if (tx.type === 'opening_balance') return  // handled separately
  if (!tx.isCleared) return                  // only post cleared transactions

  // Find or create the bank-side GL account
  let bankGlAccountId: string | null = tx.account?.glAccountId ?? null
  if (!bankGlAccountId && tx.accountId) {
    // Auto-create a matching asset GL account for this bank account if missing
    bankGlAccountId = await ensureSystemCategory(familyId, `Bank: ${tx.account?.name ?? 'Unknown'}`, 'asset')
  }

  // The category IS the GL account (expense/income side)
  const categoryGlId = tx.categoryId

  if (!bankGlAccountId && !categoryGlId) return   // can't post without at least one GL account

  // Determine debit/credit based on transaction type
  // Expense: DR expense account / CR bank account
  // Income:  DR bank account / CR income account
  // Transfer: DR destination bank account / CR source bank account (TODO: needs two accounts)

  let lines: JournalLineInput[] = []

  if (tx.type === 'expense') {
    lines = [
      { glAccountId: categoryGlId ?? bankGlAccountId!, side: 'debit',  amount: tx.amount, description: tx.description ?? undefined },
      { glAccountId: bankGlAccountId ?? categoryGlId!, side: 'credit', amount: tx.amount, description: tx.description ?? undefined },
    ]
  } else if (tx.type === 'income') {
    lines = [
      { glAccountId: bankGlAccountId ?? categoryGlId!, side: 'debit',  amount: tx.amount, description: tx.description ?? undefined, memberId: tx.memberId },
      { glAccountId: categoryGlId ?? bankGlAccountId!, side: 'credit', amount: tx.amount, description: tx.description ?? undefined, memberId: tx.memberId },
    ]
  } else {
    return  // transfers handled separately
  }

  // Check if a journal entry already exists for this transaction
  const existing = await prisma.journalEntry.findFirst({
    where: { sourceTransactionId: transactionId, familyId },
    select: { id: true, isPosted: true },
  })

  if (existing) {
    if (existing.isPosted) {
      // Already posted — create a reversal and a new entry (immutable ledger principle)
      await reverseJournalEntry({ familyId, createdBy, entryId: existing.id, date: tx.date, description: `Correction: ${tx.description ?? ''}` })
    } else {
      // Draft — just delete and recreate
      await prisma.journalEntry.delete({ where: { id: existing.id } })
    }
  }

  await createJournalEntry({
    familyId,
    createdBy,
    date: tx.date,
    description: tx.description ?? tx.payee ?? `${tx.type} transaction`,
    type: 'auto_transaction',
    isPosted: true,
    lines,
    entityId: tx.entityId,
    sourceTransactionId: transactionId,
  })
}

// ─── Reversal ────────────────────────────────────────────────────────────────

export async function reverseJournalEntry(params: {
  familyId:    string
  createdBy:   string
  entryId:     string
  date:        Date
  description: string
}): Promise<string> {
  const { familyId, createdBy, entryId, date, description } = params

  const entry = await prisma.journalEntry.findFirst({
    where: { id: entryId, familyId },
    include: { lines: true },
  })
  if (!entry) throw new Error('Journal entry not found')
  if (!entry.isPosted) throw new Error('Only posted entries can be reversed')
  if (entry.isReversed) throw new Error('Entry is already reversed')

  const reversalId = await createJournalEntry({
    familyId,
    createdBy,
    date,
    description,
    type: 'reversal',
    isPosted: true,
    lines: entry.lines.map(l => ({
      glAccountId: l.glAccountId,
      side: l.side === 'debit' ? 'credit' : 'debit',   // swap sides
      amount: l.amount,
      description: `Reversal: ${l.description ?? entry.description}`,
      memberId: l.memberId ?? undefined,
    })),
  })

  await prisma.journalEntry.update({ where: { id: entryId }, data: { isReversed: true, reversalOfId: reversalId } })
  return reversalId
}

// ─── GL Balance calculator ────────────────────────────────────────────────────
// Returns the net GL balance for all FinanceCategory accounts in a family.
// Balance = sum of debit lines - sum of credit lines (for all posted entries).
// Add openingBalance (stored on FinanceCategory) to include OB amounts not yet
// posted as journal entries (backwards compatibility).

export async function computeGLBalances(params: {
  familyId: string
  asAt?:    Date
  entityId?: string
}): Promise<Map<string, {
  debitTotal:     number
  creditTotal:    number
  netBalance:     number
  displayBalance: number
  normalSide:     'debit' | 'credit'
}>> {
  const { familyId, asAt, entityId } = params

  // All posted journal lines for this family
  const lines = await prisma.journalLine.findMany({
    where: {
      familyId,
      journalEntry: {
        isPosted:  true,
        familyId,
        ...(asAt    ? { date: { lte: asAt } } : {}),
        ...(entityId ? { entityId }           : {}),
      },
    },
    select: { glAccountId: true, side: true, amount: true },
  })

  // Build raw totals from journal lines
  const raw = new Map<string, { debitTotal: number; creditTotal: number }>()
  for (const line of lines) {
    const entry = raw.get(line.glAccountId) ?? { debitTotal: 0, creditTotal: 0 }
    if (line.side === 'debit') entry.debitTotal  += line.amount
    else                       entry.creditTotal += line.amount
    raw.set(line.glAccountId, entry)
  }

  // Fetch all categories to get types and openingBalance fallbacks
  const categories = await prisma.financeCategory.findMany({
    where: { familyId },
    select: { id: true, type: true, openingBalance: true, openingBalanceDate: true },
  })

  const result = new Map<string, {
    debitTotal: number; creditTotal: number;
    netBalance: number; displayBalance: number; normalSide: 'debit' | 'credit'
  }>()

  for (const cat of categories) {
    const totals = raw.get(cat.id) ?? { debitTotal: 0, creditTotal: 0 }
    const normalSide = normalBalanceSide(cat.type)
    const netBalance = totals.debitTotal - totals.creditTotal
    // displayBalance: positive = normal, negative = abnormal
    const displayBalance = normalSide === 'debit' ? netBalance : -netBalance

    result.set(cat.id, {
      debitTotal:    Math.round(totals.debitTotal * 100) / 100,
      creditTotal:   Math.round(totals.creditTotal * 100) / 100,
      netBalance:    Math.round(netBalance * 100) / 100,
      displayBalance: Math.round(displayBalance * 100) / 100,
      normalSide,
    })
  }

  return result
}
```

---

## 6. Update Existing Categories API

**File:** `src/app/api/finance/categories/route.ts`

### 6.1 Add `glCode`, `openingBalance`, `openingBalanceDate` to GET response

In the `findMany` call, ensure `glCode`, `openingBalance`, `openingBalanceDate` are included.
They are already in the schema after the migration so Prisma will include them by default.
Explicitly select them if using a `select:` clause.

### 6.2 Add to POST and PUT handlers

Destructure from request body:
```typescript
const { name, type, parentId, color, icon, isPersonal, isLocationBased, isExternal,
        isTaxDeduction, taxIncludeInReporting, taxDisplayLabel,
        glCode,  // NEW
        // Note: openingBalance and openingBalanceDate are set via separate
        // /api/finance/categories/opening-balance route, not here.
      } = json
```

In the prisma `create` / `update` data:
```typescript
glCode: glCode ?? null,
```

---

## 7. New API Routes

### 7.1 `src/app/api/finance/categories/opening-balance/route.ts`

**This is the route the user needs — setting opening balance on a COA entry.**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { postGLOpeningBalance, reverseJournalEntry } from '@/lib/finance-journal'

// POST /api/finance/categories/opening-balance
// Sets or clears the opening balance for a Chart of Accounts (GL) entry.
// - Creates a posted journal entry: DR/CR the account vs Opening Balances (equity).
// - If an existing OB journal entry exists, reverses it first.
// - If amount = 0 or null, just clears the stored OB and creates no new entry.
export async function POST(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { categoryId, amount, date } = json

  if (!categoryId) {
    return NextResponse.json({ error: 'categoryId is required' }, { status: 400 })
  }

  const category = await prisma.financeCategory.findFirst({
    where: { id: categoryId, familyId: session.familyId },
    select: { id: true, name: true, type: true, openingBalance: true },
  })
  if (!category) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  const parsedAmount = amount != null && amount !== '' ? parseFloat(String(amount)) : null
  const obDate = date ? new Date(date) : new Date()

  // Reverse any existing posted OB journal entry for this account
  const existingOBEntry = await prisma.journalEntry.findFirst({
    where: {
      familyId: session.familyId,
      type: 'opening_balance',
      isPosted: true,
      isReversed: false,
      lines: { some: { glAccountId: categoryId } },
    },
    select: { id: true },
  })
  if (existingOBEntry) {
    await reverseJournalEntry({
      familyId:    session.familyId,
      createdBy:   session.id,
      entryId:     existingOBEntry.id,
      date:        obDate,
      description: `Reversal of opening balance: ${category.name}`,
    })
  }

  // Clear stored OB
  await prisma.financeCategory.update({
    where: { id: categoryId },
    data: { openingBalance: parsedAmount ?? null, openingBalanceDate: parsedAmount ? obDate : null },
  })

  if (parsedAmount == null || parsedAmount === 0) {
    return NextResponse.json({ success: true, message: 'Opening balance cleared' })
  }

  // Post the new OB journal entry
  await postGLOpeningBalance({
    familyId:   session.familyId,
    createdBy:  session.id,
    categoryId,
    amount:     parsedAmount,
    date:       obDate,
  })

  const updated = await prisma.financeCategory.findUnique({
    where: { id: categoryId },
    select: { id: true, name: true, openingBalance: true, openingBalanceDate: true },
  })
  return NextResponse.json({ success: true, category: updated })
}
```

### 7.2 `src/app/api/finance/journals/route.ts`

Full CRUD for journal entries. GET returns paginated list. POST creates a draft.
PUT edits a draft. PATCH either posts a draft or creates a reversal. DELETE removes a draft.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import {
  createJournalEntry, reverseJournalEntry,
  validateJournalLines, nextJournalRef,
  type JournalLineInput
} from '@/lib/finance-journal'

const JOURNAL_INCLUDE = {
  lines: {
    include: {
      glAccount: { select: { id: true, name: true, type: true, glCode: true } },
    },
    orderBy: { side: 'asc' as const },  // debits first
  },
  entity: { select: { id: true, name: true, color: true } },
}

export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const page     = parseInt(searchParams.get('page') ?? '1')
  const limit    = parseInt(searchParams.get('limit') ?? '50')
  const type     = searchParams.get('type') ?? undefined
  const isPostedParam = searchParams.get('isPosted')
  const isPosted = isPostedParam != null ? isPostedParam === 'true' : undefined

  const where: any = { familyId: session.familyId }
  if (type != null)     where.type = type
  if (isPosted != null) where.isPosted = isPosted

  const [entries, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      include: JOURNAL_INCLUDE,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.journalEntry.count({ where }),
  ])
  return NextResponse.json({ entries, total, page, limit })
}

export async function POST(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { date, description, type, lines, entityId, postImmediately } = json

  if (!description) return NextResponse.json({ error: 'Description is required' }, { status: 400 })
  if (!date)        return NextResponse.json({ error: 'Date is required' }, { status: 400 })

  const error = validateJournalLines(lines)
  if (error) return NextResponse.json({ error }, { status: 400 })

  // Verify all GL accounts belong to this family
  const glIds    = [...new Set((lines as JournalLineInput[]).map(l => l.glAccountId))]
  const validCats = await prisma.financeCategory.count({
    where: { id: { in: glIds }, familyId: session.familyId },
  })
  if (validCats < glIds.length) {
    return NextResponse.json({ error: 'One or more GL accounts are invalid' }, { status: 400 })
  }

  const ref = await nextJournalRef(session.familyId)
  const id = await createJournalEntry({
    familyId:   session.familyId,
    createdBy:  session.id,
    date:       new Date(date),
    description,
    type:       type ?? 'manual',
    lines,
    entityId:   entityId ?? null,
    isPosted:   postImmediately === true,  // false by default — creates as draft
    reference:  ref,
  })

  const entry = await prisma.journalEntry.findUnique({ where: { id }, include: JOURNAL_INCLUDE })
  return NextResponse.json(entry, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { id, date, description, type, lines, entityId } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const existing = await prisma.journalEntry.findFirst({ where: { id, familyId: session.familyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.isPosted) {
    return NextResponse.json({
      error: 'Posted entries cannot be edited. Create a reversal instead.',
    }, { status: 400 })
  }

  if (lines) {
    const error = validateJournalLines(lines)
    if (error) return NextResponse.json({ error }, { status: 400 })
    // Delete and recreate lines (simplest correct approach)
    await prisma.journalLine.deleteMany({ where: { journalEntryId: id } })
  }

  const updated = await prisma.journalEntry.update({
    where: { id },
    data: {
      ...(date        !== undefined && { date: new Date(date) }),
      ...(description !== undefined && { description }),
      ...(type        !== undefined && { type }),
      ...(entityId    !== undefined && { entityId: entityId ?? null }),
      ...(lines && {
        lines: {
          create: (lines as JournalLineInput[]).map(l => ({
            glAccountId: l.glAccountId,
            side:        l.side,
            amount:      Math.abs(l.amount),
            description: l.description ?? null,
            memberId:    l.memberId ?? null,
            familyId:    session.familyId,
          })),
        },
      }),
    },
    include: JOURNAL_INCLUDE,
  })
  return NextResponse.json(updated)
}

// PATCH: action = "post" | "reverse"
export async function PATCH(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { id, action, reversalDate, reversalDescription } = json

  if (!id || !action) return NextResponse.json({ error: 'id and action are required' }, { status: 400 })
  const existing = await prisma.journalEntry.findFirst({
    where: { id, familyId: session.familyId },
    include: { lines: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'post') {
    if (existing.isPosted) return NextResponse.json({ error: 'Already posted' }, { status: 400 })
    const updated = await prisma.journalEntry.update({ where: { id }, data: { isPosted: true }, include: JOURNAL_INCLUDE })
    return NextResponse.json(updated)
  }

  if (action === 'reverse') {
    const reversalId = await reverseJournalEntry({
      familyId:    session.familyId,
      createdBy:   session.id,
      entryId:     id,
      date:        reversalDate ? new Date(reversalDate) : new Date(),
      description: reversalDescription ?? `Reversal of ${existing.reference ?? id}: ${existing.description}`,
    })
    const reversal = await prisma.journalEntry.findUnique({ where: { id: reversalId }, include: JOURNAL_INCLUDE })
    return NextResponse.json(reversal)
  }

  return NextResponse.json({ error: 'Invalid action. Use "post" or "reverse".' }, { status: 400 })
}

export async function DELETE(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const existing = await prisma.journalEntry.findFirst({ where: { id, familyId: session.familyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.isPosted) {
    return NextResponse.json({ error: 'Posted entries cannot be deleted. Create a reversal.' }, { status: 400 })
  }
  await prisma.journalEntry.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
```

### 7.3 `src/app/api/finance/trial-balance/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { computeGLBalances, normalBalanceSide } from '@/lib/finance-journal'

// GET /api/finance/trial-balance?asAt=2026-06-30&entityId=optional
export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const asAt     = searchParams.get('asAt')     ? new Date(searchParams.get('asAt')!)     : undefined
  const entityId = searchParams.get('entityId') ?? undefined

  const balanceMap = await computeGLBalances({
    familyId: session.familyId,
    asAt,
    entityId,
  })

  // Return every account, grouped by type
  const categories = await prisma.financeCategory.findMany({
    where: { familyId: session.familyId },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  })

  const typeOrder = ['asset', 'liability', 'equity', 'income', 'expense', 'transfer']

  const rows = categories
    .map(cat => {
      const bal = balanceMap.get(cat.id) ?? {
        debitTotal: 0, creditTotal: 0, netBalance: 0, displayBalance: 0,
        normalSide: normalBalanceSide(cat.type) as 'debit' | 'credit',
      }
      return {
        id: cat.id, name: cat.name, type: cat.type, glCode: cat.glCode,
        parentId: cat.parentId, isSystem: cat.isSystem,
        debitTotal:    bal.debitTotal,
        creditTotal:   bal.creditTotal,
        netBalance:    bal.netBalance,
        displayBalance: bal.displayBalance,
        normalSide:    bal.normalSide,
      }
    })
    .filter(r => r.debitTotal !== 0 || r.creditTotal !== 0)
    .sort((a, b) => {
      const ai = typeOrder.indexOf(a.type)
      const bi = typeOrder.indexOf(b.type)
      return ai !== bi ? ai - bi : a.name.localeCompare(b.name)
    })

  const totalDebits  = rows.reduce((s, r) => s + r.debitTotal, 0)
  const totalCredits = rows.reduce((s, r) => s + r.creditTotal, 0)

  return NextResponse.json({
    asAt:          asAt?.toISOString().split('T')[0] ?? 'all time',
    rows,
    totalDebits:   Math.round(totalDebits * 100) / 100,
    totalCredits:  Math.round(totalCredits * 100) / 100,
    isBalanced:    Math.abs(totalDebits - totalCredits) < 0.01,
    variance:      Math.round((totalDebits - totalCredits) * 100) / 100,
  })
}
```

### 7.4 `src/app/api/finance/balance-sheet/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { computeGLBalances } from '@/lib/finance-journal'

// GET /api/finance/balance-sheet?asAt=2026-06-30&entityId=optional
// Returns the Balance Sheet: Assets = Liabilities + Equity
// Net Worth = Total Assets - Total Liabilities
export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const asAt     = searchParams.get('asAt')     ? new Date(searchParams.get('asAt')!)     : new Date()
  const entityId = searchParams.get('entityId') ?? undefined

  const balanceMap = await computeGLBalances({
    familyId: session.familyId,
    asAt,
    entityId,
  })

  const categories = await prisma.financeCategory.findMany({
    where: { familyId: session.familyId },
    include: { parent: { select: { id: true, name: true } } },
    orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  })

  // Build balance sheet sections from GL balances
  function buildSection(types: string[]) {
    return categories
      .filter(cat => types.includes(cat.type))
      .map(cat => {
        const bal = balanceMap.get(cat.id)
        return {
          id:             cat.id,
          name:           cat.name,
          type:           cat.type,
          glCode:         cat.glCode,
          parentId:       cat.parentId,
          parentName:     cat.parent?.name ?? null,
          level:          cat.level,
          displayBalance: bal?.displayBalance ?? 0,
          isSystem:       cat.isSystem,
        }
      })
      .filter(r => r.displayBalance !== 0)
  }

  const assets      = buildSection(['asset'])
  const liabilities = buildSection(['liability'])
  const equity      = buildSection(['equity'])

  // Also include bank account balances as assets (from FinanceAccount, derived from transactions)
  // These appear even if the bank account has no linked GL category yet.
  const bankAccounts = await prisma.financeAccount.findMany({
    where: { familyId: session.familyId, isActive: true },
    orderBy: { sortOrder: 'asc' },
  })

  // For each bank account, derive balance from cleared transactions up to asAt
  const bankBalances = await Promise.all(bankAccounts.map(async (acct) => {
    const txs = await prisma.financeTransaction.findMany({
      where: {
        accountId: acct.id,
        isCleared: true,
        date: { lte: asAt },
      },
      select: { type: true, amount: true },
    })
    let balance = 0
    for (const tx of txs) {
      if (tx.type === 'income' || tx.type === 'opening_balance') balance += tx.amount
      else if (tx.type === 'expense')                            balance -= tx.amount
    }
    return {
      id:             acct.id,
      name:           acct.name,
      accountType:    acct.type,
      glAccountId:    acct.glAccountId,
      displayBalance: Math.round(balance * 100) / 100,
      currency:       acct.currency,
    }
  }))

  const totalAssets      = assets.reduce((s, a) => s + a.displayBalance, 0)
    + bankBalances.filter(b => !b.glAccountId && b.displayBalance !== 0)
        .reduce((s, b) => s + b.displayBalance, 0)
  const totalLiabilities = liabilities.reduce((s, a) => s + a.displayBalance, 0)
  const totalEquity      = equity.reduce((s, a) => s + a.displayBalance, 0)
  const netWorth         = totalAssets - totalLiabilities
  const isBalanced       = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01

  return NextResponse.json({
    asAt: asAt.toISOString().split('T')[0],
    assets,
    liabilities,
    equity,
    bankAccounts: bankBalances,
    totalAssets:      Math.round(totalAssets * 100) / 100,
    totalLiabilities: Math.round(totalLiabilities * 100) / 100,
    totalEquity:      Math.round(totalEquity * 100) / 100,
    netWorth:         Math.round(netWorth * 100) / 100,
    isBalanced,
    // The equation: Assets = Liabilities + Equity
    // If not balanced, there are unposted or missing journal entries.
    equationVariance: Math.round((totalAssets - totalLiabilities - totalEquity) * 100) / 100,
  })
}
```

---

## 8. Update Chart of Accounts UI for Opening Balance

**File:** `src/app/(app)/finance/categories/page.tsx`

### 8.1 Update `Category` interface

Add:
```typescript
interface Category {
  // ... all existing fields ...
  glCode:             string | null
  openingBalance:     number | null
  openingBalanceDate: string | null
}
```

### 8.2 Add Opening Balance button to each category row

In `CategoryRow`, in the actions section alongside the edit/delete buttons, add:

```tsx
{/* Only show OB button for asset, liability, equity accounts */}
{(cat.type === 'asset' || cat.type === 'liability' || cat.type === 'equity') && !cat.isSystem && (
  <button
    onClick={() => onSetOpeningBalance(cat)}
    title="Set opening balance"
    className={`p-1 hover:bg-accent rounded text-xs font-medium px-2 py-0.5 rounded-full ${
      cat.openingBalance != null
        ? 'text-amber-600 bg-amber-500/10'
        : 'text-muted-foreground'
    }`}
  >
    {cat.openingBalance != null
      ? `OB: ${new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cat.openingBalance)}`
      : 'Set OB'}
  </button>
)}
```

Pass `onSetOpeningBalance: (c: Category) => void` as a prop to `CategoryRow`.

### 8.3 Add GL Code field to CategoryDialog

In the form grid, add:
```tsx
<div>
  <label className="text-xs text-muted-foreground">GL Code (optional)</label>
  <input
    value={form.glCode}
    onChange={e => setForm(p => ({ ...p, glCode: e.target.value }))}
    placeholder="e.g. 1001, 2100, 4000"
    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
    disabled={saving}
  />
  <p className="text-xs text-muted-foreground/60 mt-0.5">
    Account number for your chart of accounts (e.g. 1xxx=Assets, 2xxx=Liabilities)
  </p>
</div>
```

Add `glCode: ''` to form state initial values and populate from `editing.glCode` in useEffect.
Include `glCode: form.glCode || null` in the `handleSave` payload.

### 8.4 Add Opening Balance Dialog

Add state and dialog to `CategoriesPage`:

```typescript
const [obEdit, setObEdit] = useState<{ cat: Category; amount: string; date: string } | null>(null)
const [obSaving, setObSaving] = useState(false)

async function handleObSave() {
  if (!obEdit) return
  const amount = obEdit.amount !== '' ? parseFloat(obEdit.amount) : null
  setObSaving(true)
  try {
    const res = await fetch('/api/finance/categories/opening-balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryId: obEdit.cat.id,
        amount,
        date: obEdit.date || null,
      }),
    })
    if (res.ok) {
      toast.success(
        amount == null || amount === 0
          ? 'Opening balance cleared'
          : `Opening balance set to ${new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount)}`
      )
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

The dialog JSX:
```tsx
<Dialog open={!!obEdit} onOpenChange={open => { if (!open) setObEdit(null) }}>
  <DialogContent className="sm:max-w-sm" showCloseButton>
    <DialogHeader>
      <DialogTitle>Opening Balance — {obEdit?.cat.name}</DialogTitle>
    </DialogHeader>
    {obEdit && (
      <div className="space-y-4">
        <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          Sets the starting balance for this GL account. Posts a double-entry journal:
          {obEdit.cat.type === 'asset' || obEdit.cat.type === 'expense'
            ? ' DR this account / CR Opening Balances.'
            : ' DR Opening Balances / CR this account.'}
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Opening Balance ($)</label>
          <input
            type="number" step="0.01"
            value={obEdit.amount}
            onChange={e => setObEdit(p => p ? { ...p, amount: e.target.value } : p)}
            placeholder="e.g. 10000.00 or -500.00"
            className="w-full mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            disabled={obSaving}
          />
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            {obEdit.cat.type === 'asset' && 'Positive = funds held. Negative = overdrawn/unusual.'}
            {obEdit.cat.type === 'liability' && 'Positive = amount owed. Negative = unusual (paid more than owed).'}
            {obEdit.cat.type === 'equity' && 'Positive = equity in your favour. Negative = net deficit.'}
            Leave 0 or blank to clear.
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
        </div>
      </div>
    )}
    <DialogFooter>
      <button onClick={() => setObEdit(null)} className="rounded-md border border-border px-4 py-1.5 text-sm" disabled={obSaving}>
        Cancel
      </button>
      <button onClick={handleObSave} disabled={obSaving}
        className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium disabled:opacity-50">
        {obSaving ? 'Saving…' : 'Save Opening Balance'}
      </button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## 9. New Pages

### 9.1 Journals Page — `src/app/(app)/finance/journals/page.tsx`

The journals page replaces the GnuCash manual journal entry screen.

**Layout:**
```
┌──────────────────────────────────────────────────────────────────┐
│  Journal Entries        [DRAFT] [POSTED] [ALL]    [+ New Entry]  │
│                                                                  │
│  JE-0012 · 15 May 2026 · Depreciation — Office Equipment        │
│  POSTED                                                          │
│    DR  Depreciation Expense (6100)     $3,500                    │
│    CR  Accumulated Depreciation (1500) $3,500                    │
│                                                                  │
│  JE-0011 · 1 Jul 2025 · Opening balance: ANZ Savings [DRAFT]    │
│    DR  ANZ Savings (1001)              $45,230                   │
│    CR  Opening Balances (3000)         $45,230                   │
│  [Post] [Edit] [Delete]                                          │
└──────────────────────────────────────────────────────────────────┘
```

**New Entry form — the core UI:**
```
Date:         [date picker]
Description:  [text input]
Type:         [manual / adjustment / accrual / depreciation]
Entity:       [entity selector, optional]

Journal Lines:
  [+] Add Line

  Line 1:  Account [GL account selector] | Debit  $[amount] | [note]
  Line 2:  Account [GL account selector] | Credit $[amount] | [note]
  ...

  Debit total:  $X,XXX    Credit total:  $X,XXX
  [green ✓ Balanced] or [red ✗ Difference: $XX.XX]

[Save as Draft]  [Save and Post]
```

**Implementation notes:**
- GL account selector: fetch all `FinanceCategory` records, display as
  `[glCode] Name (type)` e.g. `[1001] ANZ Savings (asset)`, grouped by type
- Debit/Credit total display updates live as the user types
- "Save as Draft" calls POST with `postImmediately: false`
- "Save and Post" calls POST with `postImmediately: true`
- Posted entries: show [Reverse] button instead of [Edit]/[Delete]
- Reversal creates a new posted entry with swapped debits/credits

**Full component structure — implement as a single file with these state variables:**
```typescript
const [entries, setEntries]     = useState<JournalEntry[]>([])
const [categories, setCategories] = useState<GLAccount[]>([])
const [entities, setEntities]   = useState<Entity[]>([])
const [showForm, setShowForm]   = useState(false)
const [editing, setEditing]     = useState<JournalEntry | null>(null)
const [filter, setFilter]       = useState<'all' | 'draft' | 'posted'>('all')
const [page, setPage]           = useState(1)
const [total, setTotal]         = useState(0)
const [form, setForm]           = useState({
  date:        new Date().toISOString().split('T')[0],
  description: '',
  type:        'manual',
  entityId:    '',
  lines:       [
    { glAccountId: '', side: 'debit',  amount: '', description: '' },
    { glAccountId: '', side: 'credit', amount: '', description: '' },
  ] as FormLine[],
})
```

**FormLine type:**
```typescript
interface FormLine {
  glAccountId:  string
  side:         'debit' | 'credit'
  amount:       string   // string for input handling; parse to float on save
  description:  string
}
```

**Validation before save:**
- All lines must have a GL account selected
- All lines must have amount > 0
- Total debits must equal total credits (show live difference)
- Description must not be empty

**Reversal flow:**
When user clicks [Reverse] on a posted entry:
1. Show a confirmation dialog asking for reversal date (defaults to today)
2. Call PATCH with `{ id, action: 'reverse', reversalDate, reversalDescription }`
3. Reload the list

### 9.2 Trial Balance Page — `src/app/(app)/finance/trial-balance/page.tsx`

```
┌──────────────────────────────────────────────────────────────────┐
│  Trial Balance                        As at: [date picker]       │
│                                                                  │
│  Account                    Type       Debit      Credit         │
│  ─────────────────────────────────────────────────────────────  │
│  ASSETS                                                          │
│  ANZ Savings (1001)         asset    $45,230          —          │
│  Accounts Receivable (1200) asset     $8,500          —          │
│  ─────────────────────────────────────────────────────────────  │
│  LIABILITIES                                                     │
│  Accounts Payable (2100)    liability    —          $3,200       │
│  Mortgage (2300)            liability    —        $350,000       │
│  ─────────────────────────────────────────────────────────────  │
│  EQUITY                                                          │
│  Opening Balances (3000)    equity       —        $120,000       │
│  ─────────────────────────────────────────────────────────────  │
│  INCOME                                                          │
│  Salary (4100)              income       —         $85,000       │
│  ─────────────────────────────────────────────────────────────  │
│  EXPENSES                                                        │
│  Electricity (5200)         expense   $2,400          —          │
│  ─────────────────────────────────────────────────────────────  │
│  TOTALS                              $558,430     $558,200       │
│                                                                  │
│  ✅ Balanced (Debits = Credits)                                  │
│  — or —                                                          │
│  ❌ Out of balance by $230.00 — check for missing journal lines  │
└──────────────────────────────────────────────────────────────────┘
```

**Implementation:**
```typescript
export default function TrialBalancePage() {
  const [data, setData]   = useState<TrialBalanceResponse | null>(null)
  const [asAt, setAsAt]   = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const res = await fetch(`/api/finance/trial-balance?asAt=${asAt}`)
      if (res.ok) setData(await res.json())
      setLoading(false)
    }
    load()
  }, [asAt])

  // Group rows by type for display
  const typeOrder = ['asset', 'liability', 'equity', 'income', 'expense']
  const grouped = typeOrder.map(type => ({
    type,
    rows: data?.rows.filter(r => r.type === type) ?? [],
  }))

  // Render grouped table with section headers and subtotals
  // Show ✅ or ❌ balanced indicator at the bottom
}
```

### 9.3 Balance Sheet Page — `src/app/(app)/finance/balance-sheet/page.tsx`

This is the GnuCash replacement for Michelle. It shows net worth at any point in time.

```
┌──────────────────────────────────────────────────────────────────┐
│  Balance Sheet                        As at: [date picker]       │
│  ─────────────────────────────────────────────────────────────  │
│  ASSETS                                                          │
│                                                                  │
│  Bank Accounts (from Accounts)                                   │
│    ANZ Savings                                       $45,230     │
│    ING Orange                                        $12,800     │
│    ─────────────────────────────────────────────────────────    │
│    Total Bank Accounts                               $58,030     │
│                                                                  │
│  Other Assets (from Chart of Accounts)                           │
│    Investment Portfolio (1300)                      $180,000     │
│    Property — 12 Oak St (1400)                      $750,000     │
│    ─────────────────────────────────────────────────────────    │
│    Total Other Assets                               $930,000     │
│                                                                  │
│  TOTAL ASSETS                                       $988,030     │
│  ═════════════════════════════════════════════════════════════  │
│  LIABILITIES                                                     │
│    Mortgage — Oak St (2300)                         $350,000     │
│    Credit Card — Visa (2200)                          $4,500     │
│    ─────────────────────────────────────────────────────────    │
│  TOTAL LIABILITIES                                  $354,500     │
│  ═════════════════════════════════════════════════════════════  │
│  EQUITY                                                          │
│    Opening Balances                                  $95,000     │
│    Retained Surplus (current year net)               $12,000     │  ← from P&L
│    ─────────────────────────────────────────────────────────    │
│  TOTAL EQUITY                                       $107,000     │  (should = Assets - Liabilities when balanced)
│  ═════════════════════════════════════════════════════════════  │
│  NET WORTH (Assets − Liabilities)                   $633,530     │
│                                                                  │
│  ✅ Balanced: Assets ($988,030) = Liabilities ($354,500)        │
│              + Equity ($633,530)                                 │
└──────────────────────────────────────────────────────────────────┘
```

**Key implementation details:**

1. **Bank accounts section:** derived from `FinanceAccount` table via transaction-based balance
   (already implemented and correct). These show REGARDLESS of whether a GL category is linked.

2. **Other assets / liabilities / equity:** from `FinanceCategory` via journal line balances.
   Only show accounts with non-zero balances.

3. **Net worth at the bottom** — this is the number Michelle wants to track.
   It equals Total Assets − Total Liabilities.

4. **Equity section includes current year net profit:**
   Fetch the P&L net result for the current FY and show it as "Current Year Surplus/(Deficit)".
   This closes the loop between the P&L and Balance Sheet — the current year net flows into equity.

5. **Entity filter tabs** — show balance sheet per entity (Personal, Super, Unitrak, Hopevale)
   or consolidated (All).

6. **Date picker** — show balance sheet as at any historical date. Default = today.

7. **Export** — [Export Excel] button that downloads the Balance Sheet as an .xlsx file.
   Reuse the existing report Excel generation patterns.

**Component structure:**
```typescript
export default function BalanceSheetPage() {
  const [data, setData]       = useState<BalanceSheetResponse | null>(null)
  const [asAt, setAsAt]       = useState(new Date().toISOString().split('T')[0])
  const [entityId, setEntityId] = useState('')
  const [loading, setLoading] = useState(true)
  const [entities, setEntities] = useState<Entity[]>([])

  // Load entities for filter tabs on mount
  // Load balance sheet data whenever asAt or entityId changes
  // Display in three sections: Assets, Liabilities, Equity
  // Show NET WORTH prominently at the bottom
  // Show balanced/unbalanced indicator
}
```

---

## 10. Navigation Updates

**File:** `src/app/(app)/finance/layout.tsx`

Add three new tabs in this order after "Annual P&L":

```typescript
{ href: '/finance/journals',       label: 'Journals',       exact: false },
{ href: '/finance/trial-balance',  label: 'Trial Balance',  exact: false },
{ href: '/finance/balance-sheet',  label: 'Balance Sheet',  exact: false },
```

---

## 11. Connect Bank Accounts to GL Accounts

**File:** `src/app/(app)/finance/accounts/page.tsx`

Add a "GL Account" selector to the account form. When a user links their ANZ Savings
`FinanceAccount` to the "ANZ Savings" `FinanceCategory` (GL account), transactions
on that bank account will automatically post to the correct GL account.

Add to `Account` interface:
```typescript
glAccountId: string | null
```

Add to the form dialog:
```tsx
<div className="sm:col-span-2">
  <label className="text-xs text-muted-foreground">GL Account (Chart of Accounts link)</label>
  <select
    value={form.glAccountId}
    onChange={e => setForm(p => ({ ...p, glAccountId: e.target.value }))}
    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
    disabled={saving}
  >
    <option value="">Not linked</option>
    {glCategories
      .filter(c => c.type === 'asset' || c.type === 'liability')
      .map(c => (
        <option key={c.id} value={c.id}>
          {c.glCode ? `[${c.glCode}] ` : ''}{c.name} ({c.type})
        </option>
      ))}
  </select>
  <p className="text-xs text-muted-foreground/60 mt-0.5">
    Links this bank account to its GL account for double-entry journal posting.
  </p>
</div>
```

Load `glCategories` with a fetch to `/api/finance/categories` on mount.
Include `glAccountId: form.glAccountId || null` in the PUT payload.

Also update `src/app/api/finance/accounts/route.ts` PUT handler to persist `glAccountId`:
```typescript
const { id, name, type, institution, currency, creditLimit, color, icon, isActive, glAccountId } = json
// In update data:
...(glAccountId !== undefined && { glAccountId: glAccountId ?? null }),
```

---

## 12. Data Migration for Existing Transactions

Existing transactions in the database have NO corresponding journal entries.
We need to backfill them. This is a one-time operation that the agent runs
after schema migration and code deployment, NOT a SQL migration file.

**Create:** `src/scripts/backfill-journals.ts`

```typescript
// Run with: npx tsx src/scripts/backfill-journals.ts
// Backfills JournalEntry records for all existing cleared FinanceTransactions.
// Safe to run multiple times — skips transactions that already have a JournalEntry.

import { prisma } from '../lib/prisma'
import { syncTransactionJournal } from '../lib/finance-journal'

async function main() {
  console.log('Starting journal backfill...')

  const families = await prisma.family.findMany({ select: { id: true, name: true } })

  for (const family of families) {
    console.log(`Processing family: ${family.name}`)

    const transactions = await prisma.financeTransaction.findMany({
      where: {
        familyId: family.id,
        isCleared: true,
        type: { not: 'opening_balance' },
        // Skip any that already have a journal entry
        NOT: {
          id: {
            in: (await prisma.journalEntry.findMany({
              where: { familyId: family.id, sourceTransactionId: { not: null } },
              select: { sourceTransactionId: true },
            })).map(j => j.sourceTransactionId!),
          },
        },
      },
      select: { id: true, createdBy: true },
    })

    console.log(`  Found ${transactions.length} transactions to backfill`)

    let count = 0
    for (const tx of transactions) {
      try {
        await syncTransactionJournal({
          familyId:      family.id,
          createdBy:     tx.createdBy,
          transactionId: tx.id,
        })
        count++
        if (count % 50 === 0) console.log(`  Processed ${count}/${transactions.length}`)
      } catch (err) {
        console.error(`  Error on tx ${tx.id}:`, err)
      }
    }

    console.log(`  Done: ${count} journal entries created for ${family.name}`)
  }

  console.log('Backfill complete.')
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
```

**Run after deployment:**
```cmd
npx tsx src/scripts/backfill-journals.ts
```

---

## 13. Wire Transactions API to Auto-Post Journal Entries

**File:** `src/app/api/finance/transactions/route.ts`

After Section 2 (removing the stale currentBalance mutations), add journal posting.

Add import at the top:
```typescript
import { syncTransactionJournal } from '@/lib/finance-journal'
```

In the **POST handler**, after `prisma.financeTransaction.create`, add:
```typescript
// Auto-post a double-entry journal entry for this transaction
if (transaction.isCleared) {
  try {
    await syncTransactionJournal({
      familyId:      session.familyId,
      createdBy:     session.id,
      transactionId: transaction.id,
    })
  } catch (err) {
    // Best-effort — don't fail the transaction creation if journal posting fails
    console.error('Journal sync failed for new transaction:', err)
  }
}
```

In the **PUT handler**, after `prisma.financeTransaction.update`, add the same block.

In the **DELETE handler**, before `prisma.financeTransaction.delete`, add:
```typescript
// Reverse the journal entry if one exists and is posted
const journalEntry = await prisma.journalEntry.findFirst({
  where: { sourceTransactionId: id, familyId: session.familyId },
  select: { id: true, isPosted: true },
})
if (journalEntry?.isPosted) {
  const { reverseJournalEntry } = await import('@/lib/finance-journal')
  try {
    await reverseJournalEntry({
      familyId:    session.familyId,
      createdBy:   session.id,
      entryId:     journalEntry.id,
      date:        new Date(),
      description: `Reversal: deleted transaction ${existing.description ?? id}`,
    })
  } catch (err) {
    console.error('Journal reversal failed on transaction delete:', err)
  }
} else if (journalEntry) {
  // Draft — just delete it
  await prisma.journalEntry.delete({ where: { id: journalEntry.id } })
}
```

---

## 14. Testing Checklist

Work through every item in order before marking the implementation complete.

### Schema and Migration
- [ ] `npx prisma migrate status` shows `20260523000000_add_journal_double_entry` as applied
- [ ] `npx prisma generate` succeeds with no errors
- [ ] `npx tsc --noEmit` passes (or shows only pre-existing errors, none introduced by this work)
- [ ] SQLite DB has `JournalEntry` and `JournalLine` tables
- [ ] `FinanceCategory` has `glCode`, `openingBalance`, `openingBalanceDate` columns
- [ ] `FinanceAccount` has `glAccountId` column

### Bug Fix — Stale currentBalance mutations removed
- [ ] Create a new income transaction, verify `FinanceAccount.currentBalance` stored field
      is NOT updated (only the derived balance from transactions is correct)
- [ ] `grep -c "currentBalance" src/app/api/finance/transactions/route.ts` returns 0

### finance-journal.ts library
- [ ] `validateJournalLines` returns error when debits ≠ credits
- [ ] `validateJournalLines` returns null when balanced
- [ ] `normalBalanceSide('asset')` returns 'debit'
- [ ] `normalBalanceSide('liability')` returns 'credit'
- [ ] `ensureOpeningBalancesAccount` creates the equity category only once

### Chart of Accounts — Opening Balance
- [ ] Asset account (e.g. "Investment Portfolio"): Set OB $100,000 as at 1 Jul 2025
  - Journal entry created: DR Investment Portfolio $100,000 / CR Opening Balances $100,000
  - Both entries are POSTED
  - `FinanceCategory.openingBalance` = 100000
- [ ] Liability account (e.g. "Mortgage"): Set OB $400,000 as at 1 Jul 2025
  - Journal entry: DR Opening Balances $400,000 / CR Mortgage $400,000
  - `FinanceCategory.openingBalance` = 400000
- [ ] Equity account: Set OB $50,000
  - Journal entry: DR Opening Balances $50,000 / CR Equity $50,000
- [ ] Change an OB: old entry gets reversed, new entry created
- [ ] Clear an OB (set to 0): old entry reversed, no new entry, stored OB set to null
- [ ] The "Set OB" button only appears for asset, liability, equity types (not expense/income)

### Bank Account Link
- [ ] Edit a `FinanceAccount` (e.g. ANZ Savings), link it to an asset `FinanceCategory`
- [ ] `FinanceAccount.glAccountId` is saved correctly

### Journals Page
- [ ] New journal entry form loads with two blank lines (debit + credit)
- [ ] Adding a line works; removing a line works
- [ ] Live debit/credit totals update as user types amounts
- [ ] Attempting to save with debits ≠ credits shows error message, does NOT save
- [ ] Saving as draft: entry appears in list with DRAFT badge, no effect on GL balances
- [ ] Posting a draft: POSTED badge appears, GL balances update
- [ ] Editing a draft: all fields editable, lines replaceable
- [ ] Editing a posted entry: form does NOT open; error message shown
- [ ] Reversing a posted entry: new reversal entry created with swapped sides, both POSTED
      Original entry shows REVERSED badge. GL balances return to pre-entry state.
- [ ] Deleting a draft: entry removed, no GL impact
- [ ] Deleting a posted entry: error shown, entry not deleted

### Trial Balance Page
- [ ] Page loads and shows all GL accounts with non-zero balances
- [ ] Total debits column = total credits column (✅ Balanced) after correct setup
- [ ] Changing "As at" date filters journal lines to that date
- [ ] After an opening balance is set for an asset account, it appears in debit column
- [ ] After an opening balance is set for a liability account, it appears in credit column

### Balance Sheet Page
- [ ] Page loads and shows three sections: Assets, Liabilities, Equity
- [ ] Bank accounts appear in Assets even if no GL category linked
- [ ] GL account assets (investment, property) appear in Assets
- [ ] NET WORTH = Total Assets - Total Liabilities (verify arithmetic)
- [ ] Changing "As at" date changes all balances correctly
- [ ] Entity filter tabs work — Personal shows only personal entity items
- [ ] Balanced indicator shows ✅ when Assets = Liabilities + Equity

### Auto-Journal from Transactions
- [ ] Create a new cleared income transaction with a category linked:
  - Journal entry auto-created: DR bank GL / CR income category GL
  - Both lines posted
- [ ] Create a new cleared expense transaction:
  - Journal entry: DR expense category / CR bank GL
- [ ] Update a cleared transaction (change amount):
  - Old journal entry reversed
  - New journal entry created with updated amount
- [ ] Delete a cleared transaction:
  - Journal entry reversed
  - Balance sheet and trial balance revert to pre-transaction state

### Backfill Script
- [ ] `npx tsx src/scripts/backfill-journals.ts` runs without errors
- [ ] After backfill, Trial Balance shows all historical transactions
- [ ] Running backfill twice does NOT create duplicate journal entries

### Docker / NAS
- [ ] Migration SQL file is in `prisma/migrations/20260523000000_add_journal_double_entry/`
- [ ] `docker compose build && docker compose up` applies migration automatically
- [ ] No manual SQL needed on NAS

---

## 15. Implementation Order

Implement in exactly this order. Each step depends on the previous one.

1. **Bug fix** (Section 2) — remove stale `currentBalance` mutations from transactions/route.ts
2. **Migration SQL** (Section 4) — create the file
3. **Schema update** (Section 3) — update prisma/schema.prisma with all new fields and models
4. **`npx prisma generate`** — regenerate client
5. **`npx prisma migrate deploy`** — apply migration to local dev DB
6. **`src/lib/finance-journal.ts`** (Section 5) — the accounting engine; everything else depends on it
7. **Update categories API** (Section 6) — add glCode to POST/PUT
8. **`/api/finance/categories/opening-balance`** (Section 7.1) — COA opening balance route
9. **`/api/finance/journals`** (Section 7.2) — journal CRUD route
10. **`/api/finance/trial-balance`** (Section 7.3) — trial balance route
11. **`/api/finance/balance-sheet`** (Section 7.4) — balance sheet route
12. **Update transactions API** (Section 13) — add journal sync to POST/PUT/DELETE
13. **Update accounts API** (Section 11, PUT) — add glAccountId persistence
14. **Update categories page UI** (Section 8) — add OB button, GL code field
15. **Update accounts page UI** (Section 11) — add GL account selector
16. **Journals page** (Section 9.1) — new page
17. **Trial Balance page** (Section 9.2) — new page
18. **Balance Sheet page** (Section 9.3) — new page
19. **Navigation** (Section 10) — add three new tabs
20. **Backfill script** (Section 12) — create file then run it
21. **Test checklist** (Section 14) — verify every item

---

## 16. Suggested Chart of Accounts Structure

Provide this as default guidance (or seed data) so the user can set up their COA quickly.
These account codes follow the standard Australian numbering convention.

```
ASSETS (1xxx)
  1001  ANZ Savings                    (asset)  ← link to bank account
  1002  ING Orange Everyday            (asset)  ← link to bank account
  1100  Accounts Receivable            (asset)  ← system account
  1200  Investment Portfolio           (asset)
  1300  Property — 12 Oak St           (asset)
  1400  Vehicle                        (asset)
  1500  Accumulated Depreciation       (asset)  ← contra-asset (use negative OB)

LIABILITIES (2xxx)
  2100  Accounts Payable               (liability)  ← system account
  2200  Credit Card — Visa             (liability)  ← link to bank account
  2300  Mortgage — Oak St              (liability)
  2400  PAYG Payable                   (liability)

EQUITY (3xxx)
  3000  Opening Balances               (equity)  ← system account, auto-created
  3100  Retained Surplus               (equity)

INCOME (4xxx)
  4100  Salary — Mark                  (income)
  4200  Salary — Michelle              (income)
  4300  Bank Interest                  (income)
  4400  Rental Income                  (income)
  4500  Franking Credits               (income)

EXPENSES (5xxx)
  5100  Mortgage Repayments            (expense)
  5200  Utilities — Electricity        (expense)
  5300  Groceries                      (expense)
  5400  Insurance                      (expense)
  5500  Rates                          (expense)
  5600  Vehicle — Fuel/Registration    (expense)
  5700  Depreciation                   (expense)
  5800  Work Expenses                  (expense)
  5900  Voluntary Super Contributions  (expense)
  5950  Charitable Donations           (expense)

SUPER FUND — Unitrak / Hopevale (6xxx)
  6100  Super Fund Income              (income)
  6200  Super Fund Expenses            (expense)
```

---

## 17. Key Design Decisions Explained

**Why keep `FinanceAccount` AND `FinanceCategory`?**
`FinanceAccount` is the bank/cash account view — it shows balances, pending transactions,
credit limits. `FinanceCategory` is the GL account view — it aggregates by account type
for financial statements. In a mature accounting system they would be one table, but
unifying them now would break everything currently working. The `glAccountId` link on
`FinanceAccount` bridges them. Over time they can be merged.

**Why are journal lines ON `FinanceCategory`, not `FinanceAccount`?**
Because the GL (General Ledger) is the Chart of Accounts. Bank accounts don't appear
on the Trial Balance or P&L — their GL categories do. The `JournalLine.glAccountId`
references `FinanceCategory` because that is the ledger. Bank account movements
post journal lines to the linked GL category.

**Why `isPosted` flag instead of posting everything immediately?**
Accountants need to prepare journal entries, review them, and then post them.
A draft entry doesn't affect any balances — it's a work in progress.
Once posted, it is immutable (you can only reverse it). This is the correct
accounting workflow and how GnuCash, Xero, and MYOB work.

**Why reversal instead of editing a posted entry?**
The immutable ledger principle. Once a transaction is in the books,
you cannot change it — you can only correct it by creating an equal and
opposite entry. This gives a full audit trail and prevents data loss.
This is fundamental to accounting and is why GnuCash works the same way.

**Why `displayBalance` vs `netBalance`?**
`netBalance = debits - credits` for every account.
For assets/expenses this is positive when healthy (debit-normal accounts).
For liabilities/equity/income this is negative when healthy (credit-normal accounts).
`displayBalance` negates it for the latter types so the UI always shows positive
numbers to the user — a $400,000 mortgage displays as $400,000, not -$400,000.

**Why does the Balance Sheet show bank accounts separately?**
Because `FinanceAccount` balances are derived from `FinanceTransaction` rows
(the cash-book layer), while GL account balances come from `JournalLine` rows
(the double-entry layer). Until every bank account has a `glAccountId` linked
and every transaction generates a journal entry, there will be a transition period
where some balances live in one system and some in the other. Showing them both
separately makes this visible and honest. Once everything is linked and backfilled,
they will reconcile to the same numbers.
```
