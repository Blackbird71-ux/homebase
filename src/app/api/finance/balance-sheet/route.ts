import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { deriveJournalLineBalances } from '@/lib/finance-opening-balance'

// GET /api/finance/balance-sheet?asAt=2026-06-30&entityId=optional
//
// Balance Sheet as at a specific date.
//
// ASSETS
//   Bank & Cash accounts          derived from cleared income/expense/OB transactions + journal lines
//   Accounts Receivable           income entries where invoiceReceived=true AND received=false
//   COA asset accounts            opening balance +/- GL transaction flows +/- journal line flows
//
// LIABILITIES
//   Credit cards & loans          bank accounts with negative derived balance
//   Accounts Payable              bills where invoiceReceived=true AND paid=false
//   COA liability accounts        opening balance +/- GL flows +/- journal line flows
//
// EQUITY
//   COA equity accounts           opening balance +/- journal line flows
//   Current Period Net Income     cleared income − cleared expenses up to asAt (P0 fix #2)
//
// NET WORTH = Total Assets − Total Liabilities
// EQUITY (static + net income) should equal NET WORTH when fully set up.

/**
 * Convert a date-string (YYYY-MM-DD) to end-of-day UTC in the family's timezone.
 * P2 fix #2: "as at 31 May" should mean 23:59:59.999 AEST, not UTC midnight.
 */
function asAtEndOfDay(dateStr: string, tz: string): Date {
  // Parse the date components
  const [year, month1, day] = dateStr.split('-').map(Number)
  if (!year || !month1 || !day) return new Date() // fallback

  try {
    // Find midnight in the target timezone for this day
    const noonUtc = Date.UTC(year, month1 - 1, day, 12, 0, 0, 0)
    const fmt = new Intl.DateTimeFormat('en-AU', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    })
    const parts = fmt.formatToParts(new Date(noonUtc))
    const get = (type: string) => parseInt(parts.find(p => p.type === type)!.value)
    const tzY = get('year'), tzM = get('month'), tzD = get('day')
    const tzH = get('hour'), tzMin = get('minute'), tzS = get('second')
    const offsetMs = noonUtc - Date.UTC(tzY, tzM - 1, tzD, tzH, tzMin, tzS)
    // End of day = midnight + 24h - 1ms
    const midnightUtc = Date.UTC(year, month1 - 1, day, 0, 0, 0, 0) + offsetMs
    return new Date(midnightUtc + 24 * 60 * 60 * 1000 - 1)
  } catch {
    // Unknown timezone: fall back to end of UTC day
    const d = new Date(`${dateStr}T00:00:00.000Z`)
    d.setUTCHours(23, 59, 59, 999)
    return d
  }
}

export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const asAtParam = searchParams.get('asAt')
  const entityId  = searchParams.get('entityId') ?? undefined

  const familyId = session.familyId

  // Load family timezone (P2 fix #2) alongside other settings
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: { timezone: true },
  })
  const tz = family?.timezone ?? 'Australia/Sydney'

  // asAt: interpret the date string as end-of-day in the family's timezone
  const asAt = asAtParam
    ? asAtEndOfDay(asAtParam, tz)
    : asAtEndOfDay(
        new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()),
        tz
      )

  // ── 1. All cleared transactions up to asAt → bank account balances ────────
  const txFilter: any = {
    familyId,
    isCleared: true,
    date: { lte: asAt },
    type: { not: 'opening_balance' },
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
      select: { accountId: true, glAccountId: true, type: true, amount: true },
    }),
    prisma.financeTransaction.findMany({
      where: obFilter,
      select: { accountId: true, glAccountId: true, type: true, amount: true },
    }),
  ])

  // Build balance map from cleared transactions
  const bankBalanceMap = new Map<string, number>()

  for (const tx of obTxs) {
    const bucket = tx.glAccountId ?? tx.accountId
    if (!bucket) continue
    bankBalanceMap.set(bucket, (bankBalanceMap.get(bucket) ?? 0) + tx.amount)
  }

  for (const tx of clearedTxs) {
    const bucket = tx.glAccountId ?? tx.accountId
    if (!bucket) continue
    const cur = bankBalanceMap.get(bucket) ?? 0
    if (tx.type === 'income') {
      bankBalanceMap.set(bucket, cur + tx.amount)
    } else if (tx.type === 'expense') {
      bankBalanceMap.set(bucket, cur - tx.amount)
    }
    // transfers cancel across paired accounts
  }

  // ── 2. Posted journal lines → apply to GL account balances (P0 fix #3) ──
  const journalBalances = await deriveJournalLineBalances(familyId, null, asAt, entityId)
  for (const [glAccountId, data] of journalBalances) {
    bankBalanceMap.set(glAccountId, (bankBalanceMap.get(glAccountId) ?? 0) + data.netBalance)
  }

  // ── 3. Accounts Payable: bills with invoice received but not yet paid ──────
  const apFilter: any = { familyId, invoiceReceived: true, paid: false, isActive: true }
  if (entityId) apFilter.entityId = entityId
  const unpaidBills = await prisma.financeRecurringBill.findMany({
    where: apFilter, select: { amount: true },
  })
  const accountsPayable = Math.round(unpaidBills.reduce((s, b) => s + b.amount, 0) * 100) / 100

  // ── 4. Accounts Receivable: income with invoice received but not collected ──
  const arFilter: any = { familyId, invoiceReceived: true, received: false, isActive: true }
  if (entityId) arFilter.entityId = entityId
  const uncollectedIncome = await prisma.financeIncomeEntry.findMany({
    where: arFilter, select: { amount: true },
  })
  const accountsReceivable = Math.round(uncollectedIncome.reduce((s, e) => s + e.amount, 0) * 100) / 100

  // ── 5. Current Period Net Income (P0 fix #2) ──────────────────────────────
  const netIncomeFilter: any = {
    familyId,
    isCleared: true,
    isTransfer: false,
    date: { lte: asAt },
    type: { in: ['income', 'expense'] },
  }
  if (entityId) netIncomeFilter.entityId = entityId
  const netIncomeTxs = await prisma.financeTransaction.findMany({
    where: netIncomeFilter, select: { type: true, amount: true },
  })

  let netIncomeFromTx = 0
  for (const tx of netIncomeTxs) {
    if (tx.type === 'income')  netIncomeFromTx += tx.amount
    if (tx.type === 'expense') netIncomeFromTx -= tx.amount
  }

  let netIncomeFromJournals = 0
  for (const [, data] of journalBalances) {
    if (data.accountType === 'income')  netIncomeFromJournals += data.netBalance
    if (data.accountType === 'expense') netIncomeFromJournals -= data.netBalance
  }

  const currentPeriodNetIncome = Math.round((netIncomeFromTx + netIncomeFromJournals) * 100) / 100

  // ── 6. Fetch bank accounts ────────────────────────────────────────────────
  const bankAccounts = await prisma.financeAccount.findMany({
    where: { familyId, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true, name: true, type: true, institution: true,
      currency: true, creditLimit: true, color: true, icon: true,
    },
  })

  const bankAccountRows = bankAccounts.map(acct => ({
    id: acct.id, name: acct.name, accountType: acct.type,
    institution: acct.institution, currency: acct.currency,
    creditLimit: acct.creditLimit, color: acct.color, icon: acct.icon,
    balance: Math.round((bankBalanceMap.get(acct.id) ?? 0) * 100) / 100,
    source: 'bank_account' as const,
  })).filter(a => a.balance !== 0)

  // ── 7. COA entries ────────────────────────────────────────────────────────
  const glCategoryIds = new Set([...bankBalanceMap.keys()])
  const coaEntries = await prisma.financeCategory.findMany({
    where: {
      familyId,
      type: { in: ['asset', 'liability', 'equity'] },
      OR: [
        { openingBalance: { not: null } },
        { id: { in: [...glCategoryIds] } },
      ],
    },
    include: { parent: { select: { id: true, name: true } } },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  })

  const filteredCOA = coaEntries.filter(cat => {
    if (!cat.openingBalanceDate) return true
    return cat.openingBalanceDate <= asAt
  })

  const coaRows = filteredCOA.map(cat => ({
    id: cat.id, name: cat.name, glCode: cat.glCode, type: cat.type,
    parentId: cat.parentId, parentName: cat.parent?.name ?? null,
    openingBalance: bankBalanceMap.has(cat.id)
      ? bankBalanceMap.get(cat.id)!
      : (cat.openingBalance ?? 0),
    openingBalanceDate: cat.openingBalanceDate?.toISOString().split('T')[0] ?? null,
    isSystem: cat.isSystem,
    source: 'coa' as const,
  }))

  // ── 8. Separate into sections ─────────────────────────────────────────────
  const assetBankRows     = bankAccountRows.filter(a => !['credit', 'loan'].includes(a.accountType) && a.balance > 0)
  const liabilityBankRows = bankAccountRows.filter(a => ['credit', 'loan'].includes(a.accountType))
  const overdraftRows     = bankAccountRows.filter(a => !['credit', 'loan'].includes(a.accountType) && a.balance < 0)

  const assetCOARows     = coaRows.filter(c => c.type === 'asset')
  const liabilityCOARows = coaRows.filter(c => c.type === 'liability')
  const equityCOARows    = coaRows.filter(c => c.type === 'equity')

  // ── 9. Totals ─────────────────────────────────────────────────────────────
  const totalBankAssets  = assetBankRows.reduce((s, a) => s + a.balance, 0)
  const totalCOAAssets   = assetCOARows.reduce((s, c) => s + c.openingBalance, 0)
  const totalAssets      = Math.round((totalBankAssets + accountsReceivable + totalCOAAssets) * 100) / 100

  const totalCreditLiability = liabilityBankRows.reduce((s, a) => s + Math.max(0, a.balance), 0)
  const totalOverdraft    = overdraftRows.reduce((s, a) => s + Math.abs(a.balance), 0)
  const totalCOALiab      = liabilityCOARows.reduce((s, c) => s + c.openingBalance, 0)
  const totalLiabilities  = Math.round((totalCreditLiability + totalOverdraft + accountsPayable + totalCOALiab) * 100) / 100

  const staticEquity  = equityCOARows.reduce((s, c) => s + c.openingBalance, 0)
  const totalEquity   = Math.round((staticEquity + currentPeriodNetIncome) * 100) / 100
  const netWorth      = Math.round((totalAssets - totalLiabilities) * 100) / 100

  return NextResponse.json({
    asAt: asAtParam ?? new Date().toISOString().split('T')[0],

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
      coaAccounts:            equityCOARows,
      staticTotal:            Math.round(staticEquity * 100) / 100,
      currentPeriodNetIncome,
      total:                  totalEquity,
    },

    netWorth,
    equityMatchesNetWorth: Math.abs(totalEquity - netWorth) < 0.01,
  })
}
