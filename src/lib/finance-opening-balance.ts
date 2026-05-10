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
  if (!amount || amount === 0) {
    if (account.openingBalanceTxId) {
      await prisma.financeTransaction.delete({ where: { id: account.openingBalanceTxId } })
    }
    await prisma.financeAccount.update({
      where: { id: accountId },
      data: { openingBalance: null, openingBalanceDate: null, openingBalanceTxId: null },
    })
    return
  }

  const categoryId = await ensureOpeningBalancesCategory(familyId)
  const txDate = date ?? new Date()

  if (account.openingBalanceTxId) {
    // Update existing transaction
    await prisma.financeTransaction.update({
      where: { id: account.openingBalanceTxId },
      data: {
        amount: Math.abs(amount),
        date: txDate,
        categoryId,
      },
    })
  } else {
    // Create new transaction
    const tx = await prisma.financeTransaction.create({
      data: {
        accountId,
        categoryId,
        type: 'opening_balance',
        amount: Math.abs(amount),
        date: txDate,
        description: 'Opening Balance',
        isCleared: true,
        isTransfer: false,
        createdBy,
        familyId,
      },
      select: { id: true },
    })
    await prisma.financeAccount.update({
      where: { id: accountId },
      data: {
        openingBalance: amount,
        openingBalanceDate: txDate,
        openingBalanceTxId: tx.id,
      },
    })
    return
  }

  // Always keep FinanceAccount.openingBalance in sync
  await prisma.financeAccount.update({
    where: { id: accountId },
    data: { openingBalance: amount, openingBalanceDate: txDate },
  })
}

/**
 * Derive the current balance for a single account from its cleared transactions.
 * Call this anywhere you need an account balance in a server component or API route.
 */
export async function deriveAccountBalance(accountId: string): Promise<number> {
  const txs = await prisma.financeTransaction.findMany({
    where: { accountId, isCleared: true },
    select: { type: true, amount: true },
  })
  let balance = 0
  for (const tx of txs) {
    if (tx.type === 'income' || tx.type === 'opening_balance') balance += tx.amount
    else if (tx.type === 'expense') balance -= tx.amount
    // transfers: handled as paired transactions so they cancel out
  }
  return balance
}

/**
 * Derive balances for all accounts in a family in one efficient query.
 * Returns a Map<accountId, derivedBalance>.
 */
export async function deriveAllAccountBalances(familyId: string): Promise<Map<string, number>> {
  const txs = await prisma.financeTransaction.findMany({
    where: { familyId, isCleared: true },
    select: { accountId: true, type: true, amount: true },
  })
  const map = new Map<string, number>()
  for (const tx of txs) {
    if (!tx.accountId) continue
    const current = map.get(tx.accountId) ?? 0
    if (tx.type === 'income' || tx.type === 'opening_balance') map.set(tx.accountId, current + tx.amount)
    else if (tx.type === 'expense') map.set(tx.accountId, current - tx.amount)
  }
  return map
}
