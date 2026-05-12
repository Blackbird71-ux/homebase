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
 * Ensure the family has system GST accounts:
 *   - "GST Input Tax Credits" (liability) — for expense GST (ITC we can claim)
 *   - "GST Collected" (liability) — for income GST (we owe to ATO)
 *
 * Returns { itcId, collectedId } — the category IDs of both accounts.
 * Both are system=true, level=0, type='liability'.
 */
export async function ensureGstAccounts(
  familyId: string,
): Promise<{ itcId: string; collectedId: string }> {
  // Fetch both in one query
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
    data: {
      name: 'GST Input Tax Credits',
      type: 'liability',
      isSystem: true,
      level: 0,
      familyId,
    },
    select: { id: true },
  })).id

  const collectedId = collectedRecord?.id ?? (await prisma.financeCategory.create({
    data: {
      name: 'GST Collected',
      type: 'liability',
      isSystem: true,
      level: 0,
      familyId,
    },
    select: { id: true },
  })).id

  return { itcId, collectedId }
}

/**
 * Calculate GST amounts from a GST-inclusive total.
 *
 * AU GST is 10% added on top, so a GST-inclusive price of $110 contains:
 *   ex-GST = 110 / 1.1 = $100.00
 *   GST    = 110 / 11  = $10.00   (= 110 - 100)
 *
 * All values rounded to 2dp. The rounding rule ensures ex + gst = total
 * by assigning any rounding remainder to the ex-GST amount.
 */
export function calcGst(
  inclusiveAmount: number,
  rate: number = 10,
): { exGst: number; gst: number } {
  // AU GST: gst = amount * rate / (100 + rate)
  // For 10%: gst = amount / 11, exGst = amount / 1.1 = amount * 10/11
  const gst   = Math.round(inclusiveAmount * rate / (100 + rate) * 100) / 100
  const exGst = Math.round((inclusiveAmount - gst) * 100) / 100
  return { exGst, gst }
}

/**
 * Create a posted GST split journal entry for a transaction.
 *
 * For an EXPENSE of $110 (GST-inclusive, 10% rate):
 *   DR  Expense category      $100.00  (ex-GST cost)
 *   DR  GST Input Tax Credits $ 10.00  (ITC — reduces GST payable to ATO)
 *   CR  GL/bank account       $110.00  (cash out)
 *
 * For INCOME of $110 (GST-inclusive, 10% rate):
 *   DR  GL/bank account       $110.00  (cash in)
 *   CR  Income category       $100.00  (ex-GST revenue)
 *   CR  GST Collected         $ 10.00  (liability — owed to ATO)
 *
 * The journal is immediately posted (isPosted=true) so it feeds the
 * Trial Balance and Balance Sheet without manual intervention.
 *
 * @param txType         'expense' | 'income'
 * @param totalAmount    GST-inclusive transaction amount
 * @param gstRate        GST rate (default 10)
 * @param expenseCatId   The expense/income category ID (from the transaction)
 * @param glAccountId    The GL asset account paid from/into (may be null)
 * @param accountId      Bank account ID (fallback if no glAccountId)
 * @param date           Transaction date
 * @param description    Transaction description for the journal
 * @param familyId       Family ID
 * @param entityId       Entity ID (optional)
 * @param createdBy      User ID
 * @returns The created journal entry ID, or null if creation failed
 */
export async function createGstJournalEntry(
  txType:        'expense' | 'income',
  totalAmount:   number,
  gstRate:       number,
  expenseCatId:  string,
  glAccountId:   string | null,
  accountId:     string | null,
  date:          Date,
  description:   string,
  familyId:      string,
  entityId:      string | null,
  createdBy:     string,
): Promise<string | null> {
  try {
    const { exGst, gst } = calcGst(totalAmount, gstRate)
    const { itcId, collectedId } = await ensureGstAccounts(familyId)

    // The payment/receipt GL account (asset side of the double-entry)
    // We use the glAccountId if present, otherwise look up the bank account
    // category, otherwise use Accounts Payable/Receivable as fallback.
    const cashGlId = glAccountId ?? accountId

    if (!cashGlId) {
      // Without a GL account we can't form a balanced entry — skip silently.
      // The transaction itself still records the full amount; only the GST
      // split journal is missing. The user can create it manually.
      console.warn('[gst] No glAccountId or accountId — skipping GST journal for', description)
      return null
    }

    // Validate all GL IDs belong to this family
    const ids = [expenseCatId, cashGlId, txType === 'expense' ? itcId : collectedId]
    const valid = await prisma.financeCategory.count({
      where: { id: { in: ids }, familyId },
    })
    if (valid < 3) {
      console.warn('[gst] One or more GL accounts not found for family', familyId)
      return null
    }

    // Generate a unique reference
    const count = await prisma.financeJournalEntry.count({ where: { familyId } })
    const reference = `JE-${String(count + 1).padStart(4, '0')}`

    let lines: { glAccountId: string; side: 'debit' | 'credit'; amount: number; description: string }[]

    if (txType === 'expense') {
      //  DR Expense cat   exGst   — the ex-GST cost
      //  DR GST ITC       gst     — the Input Tax Credit we can claim
      //  CR Cash/GL       total   — the full GST-inclusive payment
      lines = [
        { glAccountId: expenseCatId, side: 'debit',  amount: exGst,        description: `${description} (ex-GST)` },
        { glAccountId: itcId,        side: 'debit',  amount: gst,          description: `GST ITC — ${description}` },
        { glAccountId: cashGlId,     side: 'credit', amount: totalAmount,  description: description },
      ]
    } else {
      //  DR Cash/GL       total   — the full GST-inclusive receipt
      //  CR Income cat    exGst   — the ex-GST revenue
      //  CR GST Collected gst     — the GST we collected (owed to ATO)
      lines = [
        { glAccountId: cashGlId,      side: 'debit',  amount: totalAmount, description: description },
        { glAccountId: expenseCatId,  side: 'credit', amount: exGst,       description: `${description} (ex-GST)` },
        { glAccountId: collectedId,   side: 'credit', amount: gst,         description: `GST Collected — ${description}` },
      ]
    }

    // Verify balance (should always be true by construction)
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
        type:        'auto_transaction',
        isPosted:    true,   // Posted immediately — GST entries are factual, not provisional
        entityId:    entityId ?? null,
        familyId,
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
