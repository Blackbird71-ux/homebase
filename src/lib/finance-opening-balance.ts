// src/lib/finance-opening-balance.ts
// Opening balance helpers + account balance derivation (Workstream 3 + 4b)
import { prisma } from '@/lib/prisma'

/**
 * Ensure the family has a system "Opening Balances" equity category.
 * Creates it if it doesn't exist. Returns the category ID.
 */
export async function ensureOpeningBalancesCategory(familyId: string): Promise<string> {
  // Check if already stored on the family record
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: { openingBalancesCategoryId: true },
  })

  if (family?.openingBalancesCategoryId) {
    return family.openingBalancesCategoryId
  }

  // Check if a category named "Opening Balances" (equity, system) already exists
  const existing = await prisma.financeCategory.findFirst({
    where: { familyId, name: 'Opening Balances', type: 'equity', isSystem: true },
    select: { id: true },
  })

  const categoryId = existing?.id ?? (await prisma.financeCategory.create({
    data: {
      name: 'Opening Balances',
      type: 'equity',
      isSystem: true,
      level: 0,
      familyId,
    },
    select: { id: true },
  })).id

  // Store the ID on the family so we don't re-query every time
  await prisma.family.update({
    where: { id: familyId },
    data: { openingBalancesCategoryId: categoryId },
  })

  return categoryId
}

/**
 * Set or update the opening balance for an account.
 * - If amount is null or 0, delete any existing opening balance transaction.
 * - Otherwise, create or update the opening balance transaction.
 * - The transaction type is 'opening_balance'.
 * - Positive amount = asset/debit (e.g. bank account with funds).
 * - Negative amount = liability/credit (e.g. credit card debt).
 *
 * IMPORTANT: The signed amount is stored directly in the transaction record.
 * deriveAccountBalance() adds positive opening_balance amounts and subtracts
 * negative ones, so the sign is preserved through the full balance derivation.
 */
export async function setOpeningBalance(
  accountId: string,
  familyId: string,
  createdBy: string,
  amount: number | null,
  date: Date | null,
): Promise<void> {
  const account = await prisma.financeAccount.findFirst({
    where: { id: accountId, familyId },
    select: { id: true, openingBalanceTxId: true },
  })
  if (!account) throw new Error('Account not found')

  // Clear existing opening balance transaction if amount is null/zero
  if (amount == null || amount === 0) {
    if (account.openingBalanceTxId) {
      // Null out the FK on the account first to avoid FK constraint issues,
      // then delete the transaction.
      await prisma.financeAccount.update({
        where: { id: accountId },
        data: { openingBalance: null, openingBalanceDate: null, openingBalanceTxId: null },
      })
      await prisma.financeTransaction.delete({ where: { id: account.openingBalanceTxId } })
    } else {
      await prisma.financeAccount.update({
        where: { id: accountId },
        data: { openingBalance: null, openingBalanceDate: null, openingBalanceTxId: null },
      })
    }
    return
  }

  const categoryId = await ensureOpeningBalancesCategory(familyId)
  const txDate = date ?? new Date()
  // Store the signed amount directly — negative for liabilities, positive for assets.
  // deriveAccountBalance handles the sign when computing the running balance.
  const signedAmount = amount

  if (account.openingBalanceTxId) {
    // Update existing transaction and sync account fields in a single round-trip each.
    await prisma.financeTransaction.update({
      where: { id: account.openingBalanceTxId },
      data: { amount: signedAmount, date: txDate, categoryId },
    })
    await prisma.financeAccount.update({
      where: { id: accountId },
      data: { openingBalance: amount, openingBalanceDate: txDate },
    })
  } else {
    // Create new opening balance transaction.
    const tx = await prisma.financeTransaction.create({
      data: {
        accountId,
        categoryId,
        type: 'opening_balance',
        amount: signedAmount,
        date: txDate,
        description: 'Opening Balance',
        isCleared: true,
        isTransfer: false,
        createdBy,
        familyId,
      },
      select: { id: true },
    })
    // Link the transaction back to the account.
    await prisma.financeAccount.update({
      where: { id: accountId },
      data: { openingBalance: amount, openingBalanceDate: txDate, openingBalanceTxId: tx.id },
    })
  }
}

/**
 * Derive the current balance for a single account from its cleared transactions.
 * Call this anywhere you need an account balance in a server component or API route.
 *
 * Balance rules:
 *   income / positive opening_balance → adds to balance
 *   expense / negative opening_balance → subtracts from balance
 *   transfer → should appear as paired transactions that cancel out
 */
export async function deriveAccountBalance(accountId: string): Promise<number> {
  const txs = await prisma.financeTransaction.findMany({
    where: { accountId, isCleared: true },
    select: { type: true, amount: true },
  })
  let balance = 0
  for (const tx of txs) {
    if (tx.type === 'income') {
      balance += tx.amount
    } else if (tx.type === 'expense') {
      balance -= tx.amount
    } else if (tx.type === 'opening_balance') {
      // Opening balance transactions store the signed amount directly.
      // Positive = asset (adds to balance), negative = liability (subtracts).
      balance += tx.amount
    }
    // transfers: paired entries cancel out across two accounts
  }
  return balance
}

// ─── Accounts Payable / Receivable helpers ──────────────────────────────────
// The finance notes describe a proper AP/AR double-entry flow:
//  Bills:   invoiceReceived → DR expense / CR Accounts Payable
//           paid           → DR Accounts Payable / CR bank account
//  Income:  remittanceReceived → DR Accounts Receivable / CR income account
//           received           → DR bank account / CR Accounts Receivable

/**
 * Ensure the family has a system "Accounts Payable" liability category.
 * Returns the category ID.
 */
export async function ensureAccountsPayableCategory(familyId: string): Promise<string> {
  const existing = await prisma.financeCategory.findFirst({
    where: { familyId, name: 'Accounts Payable', type: 'liability', isSystem: true },
    select: { id: true },
  })
  if (existing) return existing.id
  const created = await prisma.financeCategory.create({
    data: { name: 'Accounts Payable', type: 'liability', isSystem: true, level: 0, familyId },
    select: { id: true },
  })
  return created.id
}

/**
 * Ensure the family has a system "Accounts Receivable" asset category.
 * Returns the category ID.
 */
export async function ensureAccountsReceivableCategory(familyId: string): Promise<string> {
  const existing = await prisma.financeCategory.findFirst({
    where: { familyId, name: 'Accounts Receivable', type: 'asset', isSystem: true },
    select: { id: true },
  })
  if (existing) return existing.id
  const created = await prisma.financeCategory.create({
    data: { name: 'Accounts Receivable', type: 'asset', isSystem: true, level: 0, familyId },
    select: { id: true },
  })
  return created.id
}

/**
 * Derive balances for all accounts in a family in one efficient query.
 * Returns a Map<accountId | glAccountId, derivedBalance>.
 *
 * Uses the same sign rules as deriveAccountBalance:
 *   income / positive opening_balance → adds
 *   expense / negative opening_balance → subtracts
 *
 * Also incorporates posted journal line balances per GL account (P0 fix #3).
 * Journal lines use standard normal-balance rules:
 *   Asset / Expense accounts:   DR increases, CR decreases
 *   Liability / Equity / Income: CR increases, DR decreases
 */
export async function deriveAllAccountBalances(
  familyId: string,
  asAt?: Date,
): Promise<Map<string, number>> {
  // ── 1. Cleared transactions ─────────────────────────────────────────────
  const txWhere: any = { familyId, isCleared: true }
  if (asAt) txWhere.date = { lte: asAt }

  const txs = await prisma.financeTransaction.findMany({
    where: txWhere,
    select: { accountId: true, glAccountId: true, type: true, amount: true },
  })

  const map = new Map<string, number>()

  function add(key: string, delta: number) {
    map.set(key, (map.get(key) ?? 0) + delta)
  }

  for (const tx of txs) {
    // glAccountId takes precedence over accountId for GL-routed payments/receipts
    const bucket = tx.glAccountId ?? tx.accountId
    if (!bucket) continue

    if (tx.type === 'income') {
      add(bucket, tx.amount)
    } else if (tx.type === 'expense') {
      add(bucket, -tx.amount)
    } else if (tx.type === 'opening_balance') {
      // Signed amount: positive for assets, negative for liabilities.
      add(bucket, tx.amount)
    }
    // transfers cancel out across paired accounts
  }

  // ── 2. Posted journal lines (P0 fix #3) ────────────────────────────────
  // Fetch all GL account types we need for normal-balance rules
  const journalLineWhere: any = {
    journalEntry: { familyId, isPosted: true },
  }
  if (asAt) journalLineWhere.journalEntry = { ...journalLineWhere.journalEntry, date: { lte: asAt } }

  const journalLines = await prisma.financeJournalLine.findMany({
    where: journalLineWhere,
    include: {
      glAccount: { select: { id: true, type: true } },
    },
  })

  for (const line of journalLines) {
    const acctType = line.glAccount.type
    const bucket   = line.glAccountId

    // Normal balance rules:
    //   Asset / Expense:             DR increases (+), CR decreases (-)
    //   Liability / Equity / Income: CR increases (+), DR decreases (-)
    let delta: number
    if (acctType === 'asset' || acctType === 'expense') {
      delta = line.side === 'debit' ? line.amount : -line.amount
    } else {
      // liability, equity, income
      delta = line.side === 'credit' ? line.amount : -line.amount
    }

    add(bucket, delta)
  }

  return map
}

/**
 * Derive journal line net balances per GL account for a specific period and family.
 * Used by the P&L and Balance Sheet APIs to incorporate posted journal entries.
 *
 * Returns a Map<glAccountId, { accountType, netBalance }> where netBalance follows
 * normal balance rules (positive = the account has increased by that amount).
 *
 * @param familyId  Family to query
 * @param start     Period start (inclusive). Null = no lower bound.
 * @param end       Period end (inclusive). Null = no upper bound.
 * @param entityId  Optional entity filter.
 */
export async function deriveJournalLineBalances(
  familyId: string,
  start: Date | null,
  end: Date | null,
  entityId?: string,
): Promise<Map<string, { accountType: string; accountName: string; netBalance: number }>> {
  const dateFilter: any = {}
  if (start) dateFilter.gte = start
  if (end)   dateFilter.lte = end

  const journalLines = await prisma.financeJournalLine.findMany({
    where: {
      journalEntry: {
        familyId,
        isPosted: true,
        ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
        ...(entityId ? { entityId } : {}),
      },
    },
    include: {
      glAccount: { select: { id: true, type: true, name: true } },
    },
  })

  const result = new Map<string, { accountType: string; accountName: string; netBalance: number }>()

  for (const line of journalLines) {
    const acctType = line.glAccount.type
    const bucket   = line.glAccountId

    // Normal balance rules
    let delta: number
    if (acctType === 'asset' || acctType === 'expense') {
      delta = line.side === 'debit' ? line.amount : -line.amount
    } else {
      delta = line.side === 'credit' ? line.amount : -line.amount
    }

    const existing = result.get(bucket)
    if (existing) {
      existing.netBalance += delta
    } else {
      result.set(bucket, {
        accountType: acctType,
        accountName: line.glAccount.name,
        netBalance: delta,
      })
    }
  }

  return result
}
