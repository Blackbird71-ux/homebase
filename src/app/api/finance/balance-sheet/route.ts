import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { getFamilyTimezone } from '@/lib/family'
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
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const asAtParam = searchParams.get('asAt')
  const entityId  = searchParams.get('entityId') ?? undefined

  const familyId = user.familyId

  const tz = await getFamilyTimezone(familyId)

  // asAt: interpret the date string as end-of-day in the family's timezone
  const asAt = asAtParam
    ? asAtEndOfDay(asAtParam, tz)
    : asAtEndOfDay(
        new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()),
        tz
      )

  // ── 1. Posted journal lines → all GL account balances ────────────────────
  // Journal lines are the single source of truth. Every transaction (income,
  // expense, opening balance) auto-generates a posted journal entry on creation,
  // so the journal ledger reflects the full account history.
  const journalBalances = await deriveJournalLineBalances(familyId, null, asAt, entityId)
  const bankBalanceMap = new Map<string, number>()
  for (const [glAccountId, data] of journalBalances) {
    bankBalanceMap.set(glAccountId, data.netBalance)
  }

  // ── 3 & 4. Accounts Payable and Accounts Receivable — READ FROM GL ONLY ──
  //
  // AP and AR balances are derived from the GL (FinanceJournalLine) — the same
  // source as the Trial Balance. This guarantees the Balance Sheet and Trial
  // Balance always agree. There are NO reads from FinanceRecurringBill or
  // FinanceIncomeEntry tables for financial figures.
  //
  // When a bill is invoice-received, a posted journal posts: DR Expense / CR AP.
  // When paid: DR AP / CR Bank. The AP GL account balance is the net of these.
  //
  // When income is invoice-received, a posted journal posts: DR AR / CR Income.
  // When received: DR Bank / CR AR. The AR GL account balance is the net.
  //
  // Find the AP and AR GL category IDs for this family.
  // Use partial name match so leading chart-of-accounts codes (e.g. "2000 Accounts Payable") are found.
  const [apCandidates, arCandidates] = await Promise.all([
    prisma.financeCategory.findMany({
      where: { familyId, type: 'liability', isSystem: true, hideFromReports: false },
      select: { id: true, name: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.financeCategory.findMany({
      where: { familyId, type: 'asset', isSystem: true, hideFromReports: false },
      select: { id: true, name: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
  ])
  const apCategory = apCandidates.find(c => c.name.toLowerCase().includes('accounts payable'))
  const arCategory = arCandidates.find(c => c.name.toLowerCase().includes('accounts receivable'))

  // AP: balance of the Accounts Payable GL account.
  // deriveJournalLineBalances uses credit-positive convention for liabilities,
  // so a CR AP posting gives netBalance = +amount. No negation needed.
  const accountsPayable = apCategory
    ? Math.round(Math.max(0, journalBalances.get(apCategory.id)?.netBalance ?? 0) * 100) / 100
    : 0

  // AR: balance of the Accounts Receivable GL account (asset normal balance = debit)
  const accountsReceivable = arCategory
    ? Math.round(Math.max(0, journalBalances.get(arCategory.id)?.netBalance ?? 0) * 100) / 100
    : 0

  // ── 5. Current Period Net Income ──────────────────────────────────────────
  // Derived exclusively from posted journal lines (income/expense GL accounts).
  // Using FinanceTransaction here would double-count: every payment also posts a
  // journal entry, so summing both overstates expenses and understates net income.
  let currentPeriodNetIncome = 0
  for (const [, data] of journalBalances) {
    if (data.accountType === 'income')  currentPeriodNetIncome += data.netBalance
    if (data.accountType === 'expense') currentPeriodNetIncome -= data.netBalance
  }
  currentPeriodNetIncome = Math.round(currentPeriodNetIncome * 100) / 100

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
      hideFromReports: false,
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

  // Exclude the AP/AR system accounts from COA rows — they're already
  // represented by the explicit accountsPayable / accountsReceivable lines.
  // Including them here would double-count those balances.
  const assetCOARows     = coaRows.filter(c => c.type === 'asset'     && c.id !== arCategory?.id)
  const liabilityCOARows = coaRows.filter(c => c.type === 'liability' && c.id !== apCategory?.id)
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
