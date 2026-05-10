import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

// GET /api/finance/balance-sheet?asAt=2026-06-30&entityId=optional
//
// Balance Sheet as at a specific date.
//
// ASSETS
//   Bank & Cash accounts          derived from cleared income/expense/OB transactions
//   Accounts Receivable           sum of uncleared income transactions tagged AR:*
//   COA asset accounts            opening balance set in Chart of Accounts
//
// LIABILITIES
//   Credit cards & loans          bank accounts with negative derived balance
//   Accounts Payable              sum of uncleared expense transactions tagged AP:*
//   COA liability accounts        opening balance set in Chart of Accounts
//
// EQUITY
//   COA equity accounts           opening balance set in Chart of Accounts
//
// NET WORTH = Total Assets − Total Liabilities
//
// Design note: AP/AR are derived from uncleared bill/income transactions rather
// than a separate double-entry ledger. This gives correct balances without
// requiring a full journal system. When a bill is paid (transaction cleared),
// it drops off AP automatically. Same for income/AR.

export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const asAtParam = searchParams.get('asAt')
  const entityId  = searchParams.get('entityId') ?? undefined

  const asAt = asAtParam ? new Date(asAtParam) : new Date()
  asAt.setHours(23, 59, 59, 999)

  const familyId = session.familyId

  // ── 1. All cleared transactions up to asAt → bank account balances ────────
  const txFilter: any = {
    familyId,
    isCleared: true,
    date: { lte: asAt },
    type: { not: 'opening_balance' },  // OB handled separately via openingBalanceTx
  }
  if (entityId) txFilter.entityId = entityId

  const obFilter: any = {
    familyId,
    isCleared: true,
    date: { lte: asAt },
    type: 'opening_balance',
  }
  if (entityId) obFilter.entityId = entityId

  const [clearedTxs, obTxs] = await Promise.all([
    prisma.financeTransaction.findMany({
      where: txFilter,
      select: { accountId: true, type: true, amount: true },
    }),
    prisma.financeTransaction.findMany({
      where: obFilter,
      select: { accountId: true, type: true, amount: true },
    }),
  ])

  // Build balance map from cleared transactions (income adds, expense subtracts)
  const bankBalanceMap = new Map<string, number>()

  for (const tx of obTxs) {
    if (!tx.accountId) continue
    const cur = bankBalanceMap.get(tx.accountId) ?? 0
    // Opening balance transactions store signed amount directly
    bankBalanceMap.set(tx.accountId, cur + tx.amount)
  }

  for (const tx of clearedTxs) {
    if (!tx.accountId) continue
    const cur = bankBalanceMap.get(tx.accountId) ?? 0
    if (tx.type === 'income') {
      bankBalanceMap.set(tx.accountId, cur + tx.amount)
    } else if (tx.type === 'expense') {
      bankBalanceMap.set(tx.accountId, cur - tx.amount)
    }
    // transfers cancel across paired accounts — skip
  }

  // ── 2. Uncleared transactions → Accounts Payable / Receivable ─────────────
  // Bills tagged with reference "AP:<categoryId>" that are uncleared = money owed (AP)
  // Income tagged with reference "AR:<categoryId>" that are uncleared = money owed to us (AR)
  const unclearedFilter: any = {
    familyId,
    isCleared: false,
    date: { lte: asAt },
    isTransfer: false,
    type: { in: ['expense', 'income'] },
  }
  if (entityId) unclearedFilter.entityId = entityId

  const unclearedTxs = await prisma.financeTransaction.findMany({
    where: unclearedFilter,
    select: { type: true, amount: true, reference: true },
  })

  let accountsPayable = 0   // sum of uncleared expense txs tagged AP
  let accountsReceivable = 0  // sum of uncleared income txs tagged AR

  for (const tx of unclearedTxs) {
    if (tx.type === 'expense' && tx.reference?.startsWith('AP:')) {
      accountsPayable += tx.amount
    } else if (tx.type === 'income' && tx.reference?.startsWith('AR:')) {
      accountsReceivable += tx.amount
    }
  }

  accountsPayable    = Math.round(accountsPayable * 100) / 100
  accountsReceivable = Math.round(accountsReceivable * 100) / 100

  // ── 3. Fetch bank accounts ────────────────────────────────────────────────
  const bankAccounts = await prisma.financeAccount.findMany({
    where: { familyId, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true, name: true, type: true, institution: true,
      currency: true, creditLimit: true, color: true, icon: true,
    },
  })

  const bankAccountRows = bankAccounts.map(acct => ({
    id:          acct.id,
    name:        acct.name,
    accountType: acct.type,
    institution: acct.institution,
    currency:    acct.currency,
    creditLimit: acct.creditLimit,
    color:       acct.color,
    icon:        acct.icon,
    balance:     Math.round((bankBalanceMap.get(acct.id) ?? 0) * 100) / 100,
    source:      'bank_account' as const,
  })).filter(a => a.balance !== 0)

  // ── 4. COA entries with opening balances ──────────────────────────────────
  const coaEntries = await prisma.financeCategory.findMany({
    where: {
      familyId,
      type: { in: ['asset', 'liability', 'equity'] },
      openingBalance: { not: null },
    },
    include: { parent: { select: { id: true, name: true } } },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  })

  const filteredCOA = coaEntries.filter(cat => {
    if (!cat.openingBalanceDate) return true
    return cat.openingBalanceDate <= asAt
  })

  const coaRows = filteredCOA.map(cat => ({
    id:                 cat.id,
    name:               cat.name,
    glCode:             cat.glCode,
    type:               cat.type,
    parentId:           cat.parentId,
    parentName:         cat.parent?.name ?? null,
    openingBalance:     cat.openingBalance!,
    openingBalanceDate: cat.openingBalanceDate?.toISOString().split('T')[0] ?? null,
    isSystem:           cat.isSystem,
    source:             'coa' as const,
  }))

  // ── 5. Separate into sections ─────────────────────────────────────────────
  // Asset bank accounts: positive balance (checking, savings, cash, investment)
  // Liability bank accounts: credit/loan accounts (balance is always negative from
  //   the expense-subtracts rule, or zero if fully paid off)
  const assetBankRows     = bankAccountRows.filter(a =>
    !['credit', 'loan'].includes(a.accountType) && a.balance > 0,
  )
  const liabilityBankRows = bankAccountRows.filter(a =>
    ['credit', 'loan'].includes(a.accountType),
  )
  // Asset accounts that have gone negative (overdrawn) → show under liabilities
  const overdraftRows = bankAccountRows.filter(a =>
    !['credit', 'loan'].includes(a.accountType) && a.balance < 0,
  )

  const assetCOARows     = coaRows.filter(c => c.type === 'asset')
  const liabilityCOARows = coaRows.filter(c => c.type === 'liability')
  const equityCOARows    = coaRows.filter(c => c.type === 'equity')

  // ── 6. Totals ─────────────────────────────────────────────────────────────
  // Assets = positive bank balances + AR + COA assets
  const totalBankAssets  = assetBankRows.reduce((s, a) => s + a.balance, 0)
  const totalCOAAssets   = assetCOARows.reduce((s, c) => s + c.openingBalance, 0)
  const totalAssets      = Math.round((totalBankAssets + accountsReceivable + totalCOAAssets) * 100) / 100

  // Liabilities = credit/loan balances (absolute value) + overdrafts + AP + COA liabilities
  // For credit/loan accounts: a negative balance means the card has credit (asset-like);
  // a positive balance means money is owed. We show the absolute value of the owed amount.
  const totalCreditLiability = liabilityBankRows.reduce((s, a) => {
    // credit card: positive balance = owed (liability); negative = in credit (not a liability)
    return s + Math.max(0, a.balance)
  }, 0)
  const totalOverdraft    = overdraftRows.reduce((s, a) => s + Math.abs(a.balance), 0)
  const totalCOALiab      = liabilityCOARows.reduce((s, c) => s + c.openingBalance, 0)
  const totalLiabilities  = Math.round((totalCreditLiability + totalOverdraft + accountsPayable + totalCOALiab) * 100) / 100

  const totalEquity = equityCOARows.reduce((s, c) => s + c.openingBalance, 0)
  const netWorth    = Math.round((totalAssets - totalLiabilities) * 100) / 100

  return NextResponse.json({
    asAt: asAt.toISOString().split('T')[0],

    assets: {
      bankAccounts:       assetBankRows,
      accountsReceivable,
      coaAccounts:        assetCOARows,
      totalBank:          Math.round(totalBankAssets * 100) / 100,
      totalAR:            accountsReceivable,
      totalCOA:           Math.round(totalCOAAssets * 100) / 100,
      total:              totalAssets,
    },

    liabilities: {
      bankAccounts:       liabilityBankRows,
      overdraftAccounts:  overdraftRows,
      accountsPayable,
      coaAccounts:        liabilityCOARows,
      totalBank:          Math.round(totalCreditLiability * 100) / 100,
      totalOverdraft:     Math.round(totalOverdraft * 100) / 100,
      totalAP:            accountsPayable,
      totalCOA:           Math.round(totalCOALiab * 100) / 100,
      total:              totalLiabilities,
    },

    equity: {
      coaAccounts: equityCOARows,
      total:       Math.round(totalEquity * 100) / 100,
    },

    netWorth,
    equityMatchesNetWorth: Math.abs(totalEquity - netWorth) < 0.01,
  })
}
