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

  const candidates = await prisma.financeCategory.findMany({
    where: {
      familyId,
      type: 'equity',
      isSystem: true,
      hideFromReports: false,
    },
    select: { id: true, name: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const matches = candidates.filter(c =>
    c.name.toLowerCase().includes('opening balances'),
  )
  if (matches.length > 1) {
    console.warn(
      `[finance] Multiple Opening Balances categories found for family ${familyId} ` +
      `(${matches.map(m => `${m.id}=${m.name}`).join(', ')}). ` +
      `Using oldest (${matches[0].id}); please consolidate via Categories settings.`,
    )
  }

  const categoryId = matches[0]?.id ?? (await prisma.financeCategory.create({
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
 * Returns the category ID. Deterministic: always picks the oldest matching row.
 */
export async function ensureAccountsPayableCategory(familyId: string): Promise<string> {
  const candidates = await prisma.financeCategory.findMany({
    where: {
      familyId,
      type: 'liability',
      isSystem: true,
      hideFromReports: false,
    },
    select: { id: true, name: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const matches = candidates.filter(c =>
    c.name.toLowerCase().includes('accounts payable'),
  )
  if (matches.length > 1) {
    console.warn(
      `[finance] Multiple Accounts Payable categories found for family ${familyId} ` +
      `(${matches.map(m => `${m.id}=${m.name}`).join(', ')}). ` +
      `Using oldest (${matches[0].id}); please consolidate via Categories settings.`,
    )
  }
  if (matches[0]) return matches[0].id

  const created = await prisma.financeCategory.create({
    data: { name: 'Accounts Payable', type: 'liability', isSystem: true, level: 0, familyId },
    select: { id: true },
  })
  return created.id
}

/**
 * Ensure the family has a system "Accounts Receivable" asset category.
 * Returns the category ID. Deterministic: always picks the oldest matching row.
 */
export async function ensureAccountsReceivableCategory(familyId: string): Promise<string> {
  const candidates = await prisma.financeCategory.findMany({
    where: {
      familyId,
      type: 'asset',
      isSystem: true,
      hideFromReports: false,
    },
    select: { id: true, name: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const matches = candidates.filter(c =>
    c.name.toLowerCase().includes('accounts receivable'),
  )
  if (matches.length > 1) {
    console.warn(
      `[finance] Multiple Accounts Receivable categories found for family ${familyId} ` +
      `(${matches.map(m => `${m.id}=${m.name}`).join(', ')}). ` +
      `Using oldest (${matches[0].id}); please consolidate via Categories settings.`,
    )
  }
  if (matches[0]) return matches[0].id

  const created = await prisma.financeCategory.create({
    data: { name: 'Accounts Receivable', type: 'asset', isSystem: true, level: 0, familyId },
    select: { id: true },
  })
  return created.id
}

/**
 * Ensure the family has a system "Prepaid Expenses" current-asset category.
 *
 * This is the capitalisation account for material prepayments: at the tax point
 * the net (ex-GST) cost is debited here instead of the expense account, then
 * amortised to the expense account over the coverage period (see
 * src/lib/finance-prepayment.ts). GST semantics: asset type. Debit = cost paid
 * in advance and not yet consumed.
 * Returns the category ID. Deterministic: always picks the oldest matching row.
 */
export async function ensurePrepaidExpensesCategory(familyId: string): Promise<string> {
  const candidates = await prisma.financeCategory.findMany({
    where: {
      familyId,
      type: 'asset',
      isSystem: true,
      hideFromReports: false,
    },
    select: { id: true, name: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const matches = candidates.filter(c =>
    c.name.toLowerCase().includes('prepaid expenses'),
  )
  if (matches.length > 1) {
    console.warn(
      `[finance] Multiple Prepaid Expenses categories found for family ${familyId} ` +
      `(${matches.map(m => `${m.id}=${m.name}`).join(', ')}). ` +
      `Using oldest (${matches[0].id}); please consolidate via Categories settings.`,
    )
  }
  if (matches[0]) return matches[0].id

  const created = await prisma.financeCategory.create({
    data: { name: 'Prepaid Expenses', type: 'asset', isSystem: true, level: 0, familyId },
    select: { id: true },
  })
  return created.id
}

/**
 * Ensure the family has a system "Undeposited Funds" asset category.
 *
 * This is the suspense/clearing account used when a payment is recorded but no
 * specific bank GL account is provided. It keeps the GL balanced and gives the
 * accountant a visible line item to allocate to a bank account later — identical
 * to the "Undeposited Funds" clearing account in Xero and QuickBooks.
 *
 * GL semantics: asset type. Debit = funds received but unallocated.
 * Returns the category ID. Deterministic: always picks the oldest matching row.
 */
export async function ensureUndepositedFundsCategory(familyId: string): Promise<string> {
  const candidates = await prisma.financeCategory.findMany({
    where: {
      familyId,
      type: 'asset',
      isSystem: true,
      hideFromReports: false,
    },
    select: { id: true, name: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const matches = candidates.filter(c =>
    c.name.toLowerCase().includes('undeposited funds'),
  )
  if (matches.length > 1) {
    console.warn(
      `[finance] Multiple Undeposited Funds categories found for family ${familyId} ` +
      `(${matches.map(m => `${m.id}=${m.name}`).join(', ')}). ` +
      `Using oldest (${matches[0].id}); please consolidate via Categories settings.`,
    )
  }
  if (matches[0]) return matches[0].id

  const created = await prisma.financeCategory.create({
    data: {
      name: 'Undeposited Funds',
      type: 'asset',
      isSystem: true,
      level: 0,
      familyId,
    },
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
  //
  // Proper double-entry for opening balances:
  //
  //   Positive amount (asset, e.g. bank account with funds):
  //     DR  Bank GL Category     amount   (asset increases — debit normal side)
  //     CR  Opening Balances     amount   (equity increases — credit normal side)
  //
  //   Negative amount (liability, e.g. credit card debt):
  //     DR  Opening Balances     amount   (equity decreases — debit reversal)
  //     CR  Bank GL Category     amount   (liability increases — credit normal side)
  //
  // Each FinanceAccount gets a matching FinanceCategory of type 'asset' (or
  // 'liability') the first time an opening balance is set. This gives the
  // account a proper GL representation so the Trial Balance and Balance Sheet
  // can show the correct opening balance on the right side of the ledger.
  //
  // The GL category is named "Account: <account name>" and flagged isSystem=true
  // so it is not editable by the user. It is linked to the account via glCode
  // storing the accountId for back-reference.
  const existingJournals = await prisma.financeJournalEntry.findMany({
    where: { sourceTransactionId: txId, familyId, type: 'opening_balance' },
    select: { id: true },
  })
  if (existingJournals.length > 0) {
    await prisma.financeJournalEntry.deleteMany({
      where: { id: { in: existingJournals.map(j => j.id) }, familyId },
    })
  }

  // Ensure this account's bound 1:1 GL category exists (Xero model), realigning
  // its type to the current opening-balance sign — a flip asset↔liability must
  // reclassify it to the correct side of the Balance Sheet / Trial Balance.
  // Single source of truth: ensureAccountGlCategory (also called on account
  // create + the all-accounts backfill).
  const isLiability = signedAmount < 0
  const accountGlCategoryId = await ensureAccountGlCategory({
    accountId,
    familyId,
    name: account.name,
    type: isLiability ? 'liability' : 'asset',
    realignType: true,
  })

  const absAmount = Math.abs(signedAmount)
  const reference = await nextJournalReference(familyId)

  // Asset opening balance:  DR Account GL / CR Opening Balances
  // Liability opening balance: DR Opening Balances / CR Account GL
  const lines = isLiability
    ? [
        { glAccountId: obCategoryId,           side: 'debit'  as const, amount: absAmount, description: `Opening Balances equity offset` },
        { glAccountId: accountGlCategoryId,    side: 'credit' as const, amount: absAmount, description: `Opening Balance — ${account.name}` },
      ]
    : [
        { glAccountId: accountGlCategoryId,    side: 'debit'  as const, amount: absAmount, description: `Opening Balance — ${account.name}` },
        { glAccountId: obCategoryId,           side: 'credit' as const, amount: absAmount, description: `Opening Balances equity offset` },
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
 * Set or clear the opening balance for a Chart-of-Accounts entry (FinanceCategory).
 *
 * GL-first (WI-1 / P7-FC-01): an opening balance posts a real, balanced
 * `opening_balance` journal entry — DR/CR the category on its normal side and the
 * contra to the system "Opening Balances" equity account — so every balance
 * reader (Trial Balance, Balance Sheet, ledgers) agrees and BS=TB holds. The
 * previous behaviour wrote only the `openingBalance` field, which the JE-only
 * Trial Balance never saw (BS≠TB) and which posted no equity contra (Balance
 * Sheet equity ≠ net worth).
 *
 * The `openingBalance` / `openingBalanceDate` fields are retained ONLY as the
 * display/edit mirror for the Categories UI — the GL is the source of truth for
 * every balance read, and readers no longer seed opening balances from the field
 * (see trial-balance and category-ledger routes), so there is no double-count.
 *
 * Re-setting cleanly replaces: any prior opening JE for this category is deleted
 * (opening JEs are isolated — nothing links to them — and their lines cascade)
 * before the new one is posted. amount null/0 clears both the JE and the field.
 *
 * Positive amount = the account's normal balance (asset in funds, liability owed,
 * equity in credit); negative flips the sides (rare — e.g. an overdrawn asset).
 */
export async function setCategoryOpeningBalance(
  categoryId: string,
  familyId: string,
  amount: number | null,
  date: Date | null,
): Promise<void> {
  const category = await prisma.financeCategory.findFirst({
    where: { id: categoryId, familyId },
    select: { id: true, name: true, type: true },
  })
  if (!category) throw new Error('Category not found')
  if (!['asset', 'liability', 'equity'].includes(category.type)) {
    throw new Error(
      `Opening balances are only valid for asset, liability, and equity accounts. This account is type "${category.type}".`,
    )
  }

  const obCategoryId = await ensureOpeningBalancesCategory(familyId)
  if (categoryId === obCategoryId) {
    throw new Error('The Opening Balances equity account cannot itself carry an opening balance.')
  }

  // Find any prior opening-balance JE for THIS category (the opening_balance
  // entry with a line on this glAccount) so a re-set replaces rather than stacks.
  const priorJournals = await prisma.financeJournalEntry.findMany({
    where: { familyId, type: 'opening_balance', lines: { some: { glAccountId: categoryId } } },
    select: { id: true },
  })
  const priorIds = priorJournals.map(j => j.id)

  // Clear path: drop the prior JE and the mirror fields, atomically.
  if (amount == null || amount === 0) {
    await prisma.$transaction(async (tx) => {
      if (priorIds.length > 0) {
        await tx.financeJournalEntry.deleteMany({ where: { id: { in: priorIds }, familyId } })
      }
      await tx.financeCategory.update({
        where: { id: categoryId },
        data: { openingBalance: null, openingBalanceDate: null },
      })
    })
    return
  }

  const txDate = date ?? new Date()
  const absAmount = Math.abs(amount)
  // Reference generated OUTSIDE the transaction — uncommitted creates are
  // invisible to the max-ref read, so generating inside risks a P2002 collision.
  const reference = await nextJournalReference(familyId)

  // Normal balance: assets are debit-normal; liabilities and equity credit-normal.
  // A positive opening balance sits on the account's normal side; negative flips.
  // The Opening Balances equity account takes the contra so the JE self-balances.
  const normalDebit = category.type === 'asset'
  const categoryOnDebit = normalDebit ? amount > 0 : amount < 0
  const categorySide: 'debit' | 'credit' = categoryOnDebit ? 'debit' : 'credit'
  const obeSide: 'debit' | 'credit' = categoryOnDebit ? 'credit' : 'debit'

  await prisma.$transaction(async (tx) => {
    if (priorIds.length > 0) {
      await tx.financeJournalEntry.deleteMany({ where: { id: { in: priorIds }, familyId } })
    }
    await tx.financeJournalEntry.create({
      data: {
        reference,
        date: txDate,
        description: `Opening Balance — ${category.name}`,
        type: 'opening_balance',
        isPosted: true,
        familyId,
        lines: {
          create: [
            { glAccountId: categoryId,   side: categorySide, amount: absAmount, description: `Opening Balance — ${category.name}` },
            { glAccountId: obCategoryId, side: obeSide,      amount: absAmount, description: 'Opening Balances equity offset' },
          ],
        },
      },
    })
    // Mirror the value onto the category for the Categories UI prefill/badge only.
    await tx.financeCategory.update({
      where: { id: categoryId },
      data: { openingBalance: amount, openingBalanceDate: txDate },
    })
  })
}

/**
 * Keep the per-account opening-balance GL category's display name in sync with
 * the FinanceAccount it represents (F3).
 *
 * setOpeningBalance() creates a system FinanceCategory named "Account: <name>"
 * linked to the account by glCode (`acct:<accountId>`). The glCode is stable, so
 * the link itself never breaks on a rename — but the stored name would otherwise
 * stay frozen at creation and show stale ("Account: <old name>") on the Trial
 * Balance / Balance Sheet / General Ledger. Call this whenever the account name
 * changes.
 *
 * Best-effort: a (familyId, name) unique collision (another category already
 * holds the desired name) is swallowed — the link by glCode is intact and only
 * the cosmetic label stays stale. No GL amounts are affected.
 */
export async function syncAccountGlCategoryName(
  accountId: string,
  familyId: string,
  newName: string,
): Promise<void> {
  const glCategory = await prisma.financeCategory.findFirst({
    where: { familyId, glCode: `acct:${accountId}`, isSystem: true },
    select: { id: true, name: true },
  })
  if (!glCategory) return
  const desired = `Account: ${newName}`
  if (glCategory.name === desired) return
  try {
    await prisma.financeCategory.update({
      where: { id: glCategory.id },
      data: { name: desired },
    })
  } catch (err: any) {
    // (familyId, name) collision — keep the existing label; glCode link is intact.
    if (err?.code !== 'P2002') throw err
  }
}

/**
 * Map a FinanceAccount.type to the GL side its bound category posts to.
 * Credit cards and loans are liabilities; everything else (bank/cash/savings)
 * is an asset. (An overdrawn asset can still be reclassified to liability by a
 * negative opening balance — see ensureAccountGlCategory `realignType`.)
 */
export function accountTypeToGlType(accountType: string): 'asset' | 'liability' {
  return accountType === 'credit' || accountType === 'loan' ? 'liability' : 'asset'
}

/**
 * Ensure a FinanceAccount has its bound 1:1 GL category (Xero model: a bank
 * account IS a GL account). The category is system, named "Account: <name>",
 * linked by glCode `acct:<accountId>`. Returns its id.
 *
 * SINGLE source of truth for the account↔GL binding, called from three places:
 * account creation, the all-accounts backfill, and setOpeningBalance.
 * Idempotent — reuses the existing bound category by glCode.
 *
 * `realignType` (setOpeningBalance only) reclassifies an existing category when
 * the desired side changes (opening-balance sign flip asset↔liability). The
 * backfill and create paths pass it false so a page load never thrashes the
 * type a deliberate opening balance set.
 */
export async function ensureAccountGlCategory(params: {
  accountId: string
  familyId: string
  name: string
  type: 'asset' | 'liability'
  realignType?: boolean
}): Promise<string> {
  const { accountId, familyId, name, type, realignType = false } = params
  const glName = `Account: ${name}`

  const existing = await prisma.financeCategory.findFirst({
    where: { familyId, glCode: `acct:${accountId}`, isSystem: true },
    select: { id: true, type: true },
  })
  if (existing) {
    if (realignType && existing.type !== type) {
      await prisma.financeCategory.update({
        where: { id: existing.id },
        data: { type },
      })
    }
    return existing.id
  }

  try {
    const created = await prisma.financeCategory.create({
      data: { name: glName, type, isSystem: true, level: 0, glCode: `acct:${accountId}`, familyId },
      select: { id: true },
    })
    return created.id
  } catch (err: any) {
    // (familyId, name) unique collision — fall back to a suffixed label. The
    // glCode link is what matters; the name is cosmetic.
    if (err?.code === 'P2002') {
      const created = await prisma.financeCategory.create({
        data: { name: `${glName} (OB)`, type, isSystem: true, level: 0, glCode: `acct:${accountId}`, familyId },
        select: { id: true },
      })
      return created.id
    }
    throw err
  }
}

/**
 * Resolve a FinanceAccount to its bound 1:1 GL category id (Xero model),
 * creating the binding if missing. Family-scoped: returns null when the account
 * does not exist for this family, so callers can 422 rather than silently post
 * to the wrong place. This is how cash-movement routes (bill payment, income
 * receipt, manual transaction) turn a user-selected ACCOUNT into the GL category
 * the cash side posts to — users pick an account, never a raw GL category, so
 * cash can never be routed to a non-account category.
 */
export async function resolveAccountGlCategoryId(
  accountId: string,
  familyId: string,
): Promise<string | null> {
  const acct = await prisma.financeAccount.findFirst({
    where: { id: accountId, familyId },
    select: { id: true, name: true, type: true },
  })
  if (!acct) return null
  return ensureAccountGlCategory({
    accountId: acct.id,
    familyId,
    name: acct.name,
    type: accountTypeToGlType(acct.type),
  })
}

/**
 * Idempotently backfill the bound GL category for every account in the family.
 * Cheap to call on each finance load (mirrors seedFinanceCategories). Only
 * CREATES missing bindings — never realigns an existing category's type, so a
 * deliberate opening-balance reclassification is never undone by a page load.
 */
export async function ensureAllAccountGlCategories(familyId: string): Promise<void> {
  const accounts = await prisma.financeAccount.findMany({
    where: { familyId },
    select: { id: true, name: true, type: true },
  })
  for (const a of accounts) {
    await ensureAccountGlCategory({
      accountId: a.id,
      familyId,
      name: a.name,
      type: accountTypeToGlType(a.type),
    })
  }
}

/**
 * Derive each account's current balance from the GL (Xero 1:1 model), keyed by
 * FinanceAccount.id. Every account's cash movements post to its bound GL
 * category (glCode `acct:<id>`); reading the balance from there means the
 * dashboard total, the Accounts page, and the Balance Sheet reconcile BY
 * CONSTRUCTION — there is no second register to drift from the ledger.
 *
 * Asset-bound accounts return their debit-normal balance as-is (positive =
 * funds). Liability-bound accounts (credit cards, loans) NEGATE the credit-
 * normal balance so the register convention holds (a $500 card debt shows -500).
 *
 * `asAt` (optional) caps to journals posted on/before that date; omit for the
 * live cumulative balance.
 */
export async function deriveAccountBalancesFromGl(
  familyId: string,
  asAt?: Date,
): Promise<Map<string, number>> {
  const [accounts, boundCats, glBalances] = await Promise.all([
    prisma.financeAccount.findMany({ where: { familyId }, select: { id: true } }),
    prisma.financeCategory.findMany({
      where: { familyId, isSystem: true, glCode: { startsWith: 'acct:' } },
      select: { id: true, glCode: true },
    }),
    deriveJournalLineBalances(familyId, null, asAt ?? null),
  ])

  // accountId -> bound category id(s). Normally 1:1, but a historical P2002
  // name-collision fallback could leave two categories sharing one glCode; sum
  // them so no posted movement is dropped.
  const catsByAccount = new Map<string, string[]>()
  for (const c of boundCats) {
    if (!c.glCode) continue
    const accId = c.glCode.slice('acct:'.length)
    const arr = catsByAccount.get(accId) ?? []
    arr.push(c.id)
    catsByAccount.set(accId, arr)
  }

  const result = new Map<string, number>()
  for (const a of accounts) {
    let bal = 0
    for (const catId of catsByAccount.get(a.id) ?? []) {
      const gl = glBalances.get(catId)
      if (!gl) continue
      bal += gl.accountType === 'liability' ? -gl.netBalance : gl.netBalance
    }
    result.set(a.id, Math.round(bal * 100) / 100)
  }
  return result
}

/**
 * Derive the current balance for a single account from the GL (Xero 1:1 model).
 * Thin wrapper over deriveAccountBalancesFromGl so single-account callers
 * (savings goals) read the SAME number the dashboard and Accounts page show.
 */
export async function deriveAccountBalance(
  accountId: string,
  familyId: string,
  asAt?: Date,
): Promise<number> {
  const map = await deriveAccountBalancesFromGl(familyId, asAt)
  return map.get(accountId) ?? 0
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
    // Resolve the cash-side GL category: prefer the explicit GL account, else the
    // selected FinanceAccount's bound 1:1 GL category (Xero bank=GL model). Never
    // fall back to a raw FinanceAccount.id — a journal line must reference a
    // FinanceCategory, otherwise the GL silently skips the GST split (audit
    // 2026-06-19, finding #5).
    let cashGlId = glAccountId
    if (!cashGlId && accountId) {
      cashGlId = await resolveAccountGlCategoryId(accountId, familyId)
    }
    if (!cashGlId) {
      console.warn('[gst] No GL account could be resolved for the cash side — skipping GST journal for', description)
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
