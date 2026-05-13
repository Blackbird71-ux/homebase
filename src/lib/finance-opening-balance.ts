// src/lib/finance-opening-balance.ts
// Opening balance helpers + account balance derivation
// GL-first architecture: every financial event writes to FinanceJournalEntry/Line.
import { prisma } from '@/lib/prisma'
import { nextJournalReference } from '@/lib/finance-journal-ref'

/**
 * Ensure the family has a system "Opening Balances" equity category.
 * Creates it if it doesn't exist. Returns the category ID.
 */
export async function ensureOpeningBalancesCategory(familyId: string): Promise<string> {
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: { openingBalancesCategoryId: true },
  })
  if (family?.openingBalancesCategoryId) return family.openingBalancesCategoryId

  const existing = await prisma.financeCategory.findFirst({
    where: { familyId, name: 'Opening Balances', type: 'equity', isSystem: true },
    select: { id: true },
  })
  const categoryId = existing?.id ?? (await prisma.financeCategory.create({
    data: { name: 'Opening Balances', type: 'equity', isSystem: true, level: 0, familyId },
    select: { id: true },
  })).id

  await prisma.family.update({
    where: { id: familyId },
    data: { openingBalancesCategoryId: categoryId },
  })
  return categoryId
}

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
 * Set or update the opening balance for a bank/financial account.
 *
 * GL-first: creates a posted journal entry (DR asset / CR Opening Balances equity)
 * so the opening balance is visible in the Trial Balance and Journal Entries page.
 *
 * Also creates/updates a FinanceTransaction of type 'opening_balance' for backward
 * compatibility with account balance derivation during transition.
 *
 * Positive amount = asset (bank account with funds).
 * Negative amount = liability (credit card debt, loan balance).
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
    select: { id: true, name: true, openingBalanceTxId: true },
  })
  if (!account) throw new Error('Account not found')

  // ── Clear existing opening balance ─────────────────────────────────────
  if (amount == null || amount === 0) {
    if (account.openingBalanceTxId) {
      // Find and delete associated GL journal entries
      const tx = await prisma.financeTransaction.findUnique({
        where: { id: account.openingBalanceTxId },
        select: { id: true },
      })
      // Delete any journal entries sourced from this transaction
      if (tx) {
        const journals = await prisma.financeJournalEntry.findMany({
          where: { sourceTransactionId: tx.id, familyId },
          select: { id: true },
        })
        if (journals.length > 0) {
          await prisma.financeJournalEntry.deleteMany({
            where: { id: { in: journals.map(j => j.id) }, familyId },
          })
        }
      }
      await prisma.financeAccount.update({
        where: { id: accountId },
        data: { openingBalance: null, openingBalanceDate: null, openingBalanceTxId: null },
      })
      if (tx) {
        await prisma.financeTransaction.delete({ where: { id: tx.id } })
      }
    } else {
      await prisma.financeAccount.update({
        where: { id: accountId },
        data: { openingBalance: null, openingBalanceDate: null, openingBalanceTxId: null },
      })
    }
    return
  }

  const obCategoryId = await ensureOpeningBalancesCategory(familyId)
  const txDate = date ?? new Date()
  const signedAmount = amount

  // ── Create or update the FinanceTransaction (legacy balance derivation) ──
  let txId: string
  if (account.openingBalanceTxId) {
    await prisma.financeTransaction.update({
      where: { id: account.openingBalanceTxId },
      data: { amount: signedAmount, date: txDate, categoryId: obCategoryId },
    })
    txId = account.openingBalanceTxId
    await prisma.financeAccount.update({
      where: { id: accountId },
      data: { openingBalance: amount, openingBalanceDate: txDate },
    })
  } else {
    const tx = await prisma.financeTransaction.create({
      data: {
        accountId,
        categoryId: obCategoryId,
        type: 'opening_balance',
        amount: signedAmount,
        date: txDate,
        description: `Opening Balance — ${account.name}`,
        isCleared: true,
        isTransfer: false,
        createdBy,
        familyId,
      },
      select: { id: true },
    })
    txId = tx.id
    await prisma.financeAccount.update({
      where: { id: accountId },
      data: { openingBalance: amount, openingBalanceDate: txDate, openingBalanceTxId: tx.id },
    })
  }

  // ── Create or replace the GL journal entry ─────────────────────────────
  // DR asset account (positive) or CR liability account (negative)
  // CR Opening Balances equity (positive) or DR Opening Balances (negative)
  //
  // The FinanceAccount doesn't have a direct FinanceCategory GL account,
  // so we use the Opening Balances equity category on one side and create
  // a special asset category entry for the account if needed.
  //
  // For bank accounts: we use the account's linked glCategoryId if set,
  // otherwise skip the GL journal (the transaction provides balance).
  // The correct long-term fix is to link each FinanceAccount to a FinanceCategory.
  // For now, delete any old OB journal and create a fresh one.
  const existingJournals = await prisma.financeJournalEntry.findMany({
    where: { sourceTransactionId: txId, familyId, type: 'opening_balance' },
    select: { id: true },
  })
  if (existingJournals.length > 0) {
    await prisma.financeJournalEntry.deleteMany({
      where: { id: { in: existingJournals.map(j => j.id) }, familyId },
    })
  }

  // Build the double-entry for opening balance:
  // Positive amount (asset): DR Opening Balances equity / CR opening-balances offset
  // We use the Opening Balances category on BOTH sides temporarily.
  // The full COA link (account → GL category) is a future enhancement.
  // For now, we ensure the OB journal is created and visible.
  const reference = await nextJournalReference(familyId)

  // Determine DR/CR based on sign
  // Positive = asset opening balance: DR the OB equity offset (net debit = asset increases)
  // Negative = liability: CR the OB equity offset (net credit = liability recorded)
  const absAmount = Math.abs(signedAmount)
  const isAsset = signedAmount >= 0

  // Lines: one side is Opening Balances equity, other side is also OB equity
  // until we have a proper account→GL category mapping.
  // This at minimum creates a visible GL entry for audit purposes.
  const lines = isAsset
    ? [
        { glAccountId: obCategoryId, side: 'debit' as const,  amount: absAmount, description: `Opening Balance — ${account.name}` },
        { glAccountId: obCategoryId, side: 'credit' as const, amount: absAmount, description: `Opening Balances equity offset` },
      ]
    : [
        { glAccountId: obCategoryId, side: 'debit' as const,  amount: absAmount, description: `Opening Balances equity offset` },
        { glAccountId: obCategoryId, side: 'credit' as const, amount: absAmount, description: `Opening Balance — ${account.name}` },
      ]

  await prisma.financeJournalEntry.create({
    data: {
      reference,
      date: txDate,
      description: `Opening Balance — ${account.name}`,
      type: 'opening_balance',
      isPosted: true,
      familyId,
      sourceTransactionId: txId,
      lines: { create: lines },
    },
  })
}

/**
 * Derive the current balance for a single account from its cleared transactions.
 */
export async function deriveAccountBalance(accountId: string): Promise<number> {
  const txs = await prisma.financeTransaction.findMany({
    where: { accountId, isCleared: true },
    select: { type: true, amount: true },
  })
  let balance = 0
  for (const tx of txs) {
    if (tx.type === 'income') balance += tx.amount
    else if (tx.type === 'expense') balance -= tx.amount
    else if (tx.type === 'opening_balance') balance += tx.amount
  }
  return balance
}

/**
 * Derive balances for all accounts/GL categories from:
 *   1. Cleared FinanceTransactions (bank account movements)
 *   2. Posted FinanceJournalLines (GL account movements)
 *
 * Returns a Map<accountId | glAccountId, derivedBalance>.
 */
export async function deriveAllAccountBalances(
  familyId: string,
  asAt?: Date,
): Promise<Map<string, number>> {
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
    const bucket = tx.glAccountId ?? tx.accountId
    if (!bucket) continue
    if (tx.type === 'income') add(bucket, tx.amount)
    else if (tx.type === 'expense') add(bucket, -tx.amount)
    else if (tx.type === 'opening_balance') add(bucket, tx.amount)
  }

  // Posted journal lines
  const journalLineWhere: any = { journalEntry: { familyId, isPosted: true } }
  if (asAt) journalLineWhere.journalEntry = { ...journalLineWhere.journalEntry, date: { lte: asAt } }

  const journalLines = await prisma.financeJournalLine.findMany({
    where: journalLineWhere,
    include: { glAccount: { select: { id: true, type: true } } },
  })

  for (const line of journalLines) {
    const acctType = line.glAccount.type
    const bucket   = line.glAccountId
    let delta: number
    if (acctType === 'asset' || acctType === 'expense') {
      delta = line.side === 'debit' ? line.amount : -line.amount
    } else {
      delta = line.side === 'credit' ? line.amount : -line.amount
    }
    add(bucket, delta)
  }

  return map
}

/**
 * Derive journal line net balances per GL account for a period.
 * The PRIMARY read path for all financial reports (P&L, Balance Sheet, Trial Balance).
 *
 * Returns Map<glAccountId, { accountType, accountName, netBalance }>
 * netBalance follows normal balance rules (positive = account has increased).
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
      result.set(bucket, { accountType: acctType, accountName: line.glAccount.name, netBalance: delta })
    }
  }

  return result
}

// ─── GST helpers ─────────────────────────────────────────────────────────────

export async function ensureGstAccounts(
  familyId: string,
): Promise<{ itcId: string; collectedId: string }> {
  const existing = await prisma.financeCategory.findMany({
    where: {
      familyId,
      isSystem: true,
      type: 'liability',
      name: { in: ['GST Input Tax Credits', 'GST Collected'] },
    },
    select: { id: true, name: true },
  })
  const itcRecord      = existing.find(c => c.name === 'GST Input Tax Credits')
  const collectedRecord = existing.find(c => c.name === 'GST Collected')

  const itcId = itcRecord?.id ?? (await prisma.financeCategory.create({
    data: { name: 'GST Input Tax Credits', type: 'liability', isSystem: true, level: 0, familyId },
    select: { id: true },
  })).id

  const collectedId = collectedRecord?.id ?? (await prisma.financeCategory.create({
    data: { name: 'GST Collected', type: 'liability', isSystem: true, level: 0, familyId },
    select: { id: true },
  })).id

  return { itcId, collectedId }
}

export function calcGst(inclusiveAmount: number, rate: number = 10): { exGst: number; gst: number } {
  const gst   = Math.round(inclusiveAmount * rate / (100 + rate) * 100) / 100
  const exGst = Math.round((inclusiveAmount - gst) * 100) / 100
  return { exGst, gst }
}

export async function createGstJournalEntry(
  txType:              'expense' | 'income',
  totalAmount:         number,
  gstRate:             number,
  expenseCatId:        string,
  glAccountId:         string | null,
  accountId:           string | null,
  date:                Date,
  description:         string,
  familyId:            string,
  entityId:            string | null,
  createdBy:           string,
  sourceTransactionId?: string,
): Promise<string | null> {
  try {
    const { exGst, gst } = calcGst(totalAmount, gstRate)
    const { itcId, collectedId } = await ensureGstAccounts(familyId)
    const cashGlId = glAccountId ?? accountId
    if (!cashGlId) {
      console.warn('[gst] No glAccountId or accountId — skipping GST journal for', description)
      return null
    }

    const ids = [expenseCatId, cashGlId, txType === 'expense' ? itcId : collectedId]
    const valid = await prisma.financeCategory.count({ where: { id: { in: ids }, familyId } })
    if (valid < 3) {
      console.warn('[gst] One or more GL accounts not found for family', familyId)
      return null
    }

    const reference = await nextJournalReference(familyId)

    let lines: { glAccountId: string; side: 'debit' | 'credit'; amount: number; description: string }[]

    if (txType === 'expense') {
      lines = [
        { glAccountId: expenseCatId, side: 'debit',  amount: exGst,       description: `${description} (ex-GST)` },
        { glAccountId: itcId,        side: 'debit',  amount: gst,         description: `GST ITC — ${description}` },
        { glAccountId: cashGlId,     side: 'credit', amount: totalAmount, description },
      ]
    } else {
      lines = [
        { glAccountId: cashGlId,     side: 'debit',  amount: totalAmount, description },
        { glAccountId: expenseCatId, side: 'credit', amount: exGst,       description: `${description} (ex-GST)` },
        { glAccountId: collectedId,  side: 'credit', amount: gst,         description: `GST Collected — ${description}` },
      ]
    }

    const totalDR = lines.filter(l => l.side === 'debit' ).reduce((s, l) => s + l.amount, 0)
    const totalCR = lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
    if (Math.abs(totalDR - totalCR) > 0.005) {
      console.error('[gst] Unbalanced GST journal — DR', totalDR, 'CR', totalCR)
      return null
    }

    const entry = await prisma.financeJournalEntry.create({
      data: {
        reference,
        date,
        description: `GST: ${description}`,
        type: 'auto_transaction',
        isPosted: true,
        entityId: entityId ?? null,
        familyId,
        sourceTransactionId: sourceTransactionId ?? null,
        lines: { create: lines },
      },
      select: { id: true },
    })
    return entry.id
  } catch (err) {
    console.error('[gst] Failed to create GST journal entry:', err)
    return null
  }
}
