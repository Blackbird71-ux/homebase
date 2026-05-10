import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

// GET /api/finance/balance-sheet?asAt=2026-06-30&entityId=optional
//
// Returns the Balance Sheet as at a specific date.
// Assets section:   bank accounts (derived balance) + asset COA entries (opening balance)
// Liabilities:      liability COA entries (opening balance)
// Equity:           equity COA entries (opening balance)
// Net Worth:        Total Assets - Total Liabilities
//
// NOTE: This is an opening-balance-based balance sheet. It shows the position
// as at the date the opening balances were set. For a full dynamic balance sheet,
// journal entries would be needed — that is a future enhancement. For now this
// gives the net worth view needed.
export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const asAtParam = searchParams.get('asAt')
  const entityId  = searchParams.get('entityId') ?? undefined

  // Default to today
  const asAt = asAtParam ? new Date(asAtParam) : new Date()
  // Set to end of day so transactions on that date are included
  asAt.setHours(23, 59, 59, 999)

  const familyId = session.familyId

  // ── 1. Bank accounts with derived balances ──────────────────────────────
  // Derive each bank account's balance from cleared transactions up to asAt.
  const bankAccounts = await prisma.financeAccount.findMany({
    where: { familyId, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true, name: true, type: true, institution: true,
      currency: true, creditLimit: true, color: true, icon: true,
    },
  })

  // Fetch all cleared transactions up to asAt in a single query
  const txFilter: any = {
    familyId,
    isCleared: true,
    date: { lte: asAt },
  }
  if (entityId) txFilter.entityId = entityId

  const clearedTxs = await prisma.financeTransaction.findMany({
    where: txFilter,
    select: { accountId: true, type: true, amount: true },
  })

  // Build balance map: accountId → balance
  const bankBalanceMap = new Map<string, number>()
  for (const tx of clearedTxs) {
    if (!tx.accountId) continue
    const cur = bankBalanceMap.get(tx.accountId) ?? 0
    if (tx.type === 'income' || tx.type === 'opening_balance') {
      bankBalanceMap.set(tx.accountId, cur + tx.amount)
    } else if (tx.type === 'expense') {
      bankBalanceMap.set(tx.accountId, cur - tx.amount)
    }
    // transfers cancel out; skip
  }

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
  })).filter(a => a.balance !== 0)  // only show accounts with activity

  // ── 2. COA entries with opening balances ──────────────────────────────
  // Fetch all asset, liability, equity categories that have an opening balance set.
  // Only show entries where openingBalanceDate <= asAt (or no date set).
  const coaWhere: any = {
    familyId,
    type: { in: ['asset', 'liability', 'equity'] },
    openingBalance: { not: null },
  }

  const coaEntries = await prisma.financeCategory.findMany({
    where: coaWhere,
    include: { parent: { select: { id: true, name: true } } },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  })

  // Filter by date: if openingBalanceDate is set, only include if <= asAt
  const filteredCOA = coaEntries.filter(cat => {
    if (!cat.openingBalanceDate) return true  // no date = always include
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

  // ── 3. Separate into sections ────────────────────────────────────────────
  const assetBankRows      = bankAccountRows.filter(a => !['credit', 'loan'].includes(a.accountType))
  const liabilityBankRows  = bankAccountRows.filter(a => ['credit', 'loan'].includes(a.accountType))
  const assetCOARows       = coaRows.filter(c => c.type === 'asset')
  const liabilityCOARows   = coaRows.filter(c => c.type === 'liability')
  const equityCOARows      = coaRows.filter(c => c.type === 'equity')

  // ── 4. Calculate totals ──────────────────────────────────────────────────
  // For bank accounts: positive balance = asset, negative balance = liability (e.g. credit card in debt)
  const totalBankAssets       = assetBankRows.reduce((s, a) => s + Math.max(0, a.balance), 0)
  const totalBankLiabilities  = [
    ...liabilityBankRows.map(a => Math.abs(Math.min(0, a.balance))),   // liability accounts in debt
    ...assetBankRows.map(a => Math.abs(Math.min(0, a.balance))),       // asset accounts overdrawn
    ...liabilityBankRows.map(a => Math.max(0, a.balance)),             // credit card debt (positive balance = owed)
  ].reduce((s, v) => s + v, 0)

  // For credit/loan accounts: balance is how much is owed (positive = liability)
  const totalCreditCardDebt = liabilityBankRows.reduce((s, a) => s + Math.abs(a.balance), 0)

  const totalCOAAssets      = assetCOARows.reduce((s, c) => s + c.openingBalance, 0)
  const totalCOALiabilities = liabilityCOARows.reduce((s, c) => s + c.openingBalance, 0)
  const totalEquity         = equityCOARows.reduce((s, c) => s + c.openingBalance, 0)

  // Total assets = bank assets + COA assets
  const totalAssets      = Math.round((totalBankAssets + totalCOAAssets) * 100) / 100
  // Total liabilities = credit card debt + COA liabilities
  const totalLiabilities = Math.round((totalCreditCardDebt + totalCOALiabilities) * 100) / 100
  // Net worth = assets - liabilities (equity should equal this when balanced)
  const netWorth         = Math.round((totalAssets - totalLiabilities) * 100) / 100

  return NextResponse.json({
    asAt: asAt.toISOString().split('T')[0],
    assets: {
      bankAccounts:  assetBankRows,
      coaAccounts:   assetCOARows,
      totalBank:     Math.round(totalBankAssets * 100) / 100,
      totalCOA:      Math.round(totalCOAAssets * 100) / 100,
      total:         totalAssets,
    },
    liabilities: {
      bankAccounts:  liabilityBankRows,
      coaAccounts:   liabilityCOARows,
      totalBank:     Math.round(totalCreditCardDebt * 100) / 100,
      totalCOA:      Math.round(totalCOALiabilities * 100) / 100,
      total:         totalLiabilities,
    },
    equity: {
      coaAccounts: equityCOARows,
      total:       Math.round(totalEquity * 100) / 100,
    },
    netWorth,
    // Note: equity will not equal netWorth unless all transactions are journaled.
    // For now this is expected — the system is a hybrid cash-book + manual OB system.
    equityMatchesNetWorth: Math.abs(totalEquity - netWorth) < 0.01,
  })
}
