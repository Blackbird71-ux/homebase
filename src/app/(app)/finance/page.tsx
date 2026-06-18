import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { seedFinanceCategories } from '@/lib/finance-seed'
import { deriveAccountBalancesFromGl, deriveJournalLineBalances, ensureAllAccountGlCategories } from '@/lib/finance-opening-balance'
import { OverviewClient } from './OverviewClient'
import { monthBoundsInTz } from '@/lib/timezone'
import { liveBillWhere } from '@/lib/finance-live-filter'
import type {
  FinanceAccount, FinanceTransaction, FinanceBudget,
  FinanceRecurringBill, FinanceSavingsGoal, FinanceCategory, FinanceLocation,
} from '@prisma/client'

export default async function FinanceOverviewPage() {
  const user = await requireSession()
  const familyId = user.familyId
  const timezone = user.timezone ?? 'UTC'

  // Ensure default categories exist
  await seedFinanceCategories(familyId)
  // Ensure every account is bound 1:1 to its GL category (Xero model) so the
  // balances below read from the ledger and reconcile with the Balance Sheet.
  await ensureAllAccountGlCategories(familyId)

  const now = new Date()
  const { start: monthStart, end: monthEnd } = monthBoundsInTz(timezone)

  const [
    accounts,
    transactions,
    budgets,
    bills,
    savingsGoals,
    categories,
    familyUsers,
    locations,
    balanceMap,
    glMonthlyBalances,
  ] = await Promise.all([
    prisma.financeAccount.findMany({
      where: { familyId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.financeTransaction.findMany({
      where: { familyId, date: { gte: monthStart, lte: monthEnd } },
      include: {
        category: true,
        account: true,
        location: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
    }) as Promise<(FinanceTransaction & { category: FinanceCategory | null; account: Pick<FinanceAccount, 'id' | 'name'> | null; location: { id: string; name: string } | null })[]>,
    prisma.financeBudget.findMany({
      where: { familyId, startDate: { lte: now }, endDate: { gte: now } },
      include: { category: true },
      orderBy: { name: 'asc' },
    }) as Promise<(FinanceBudget & { category: FinanceCategory | null })[]>,
    prisma.financeRecurringBill.findMany({
      // Exclude draft/cancelled/voided bills — they are not live obligations and
      // must not surface in the dashboard "Upcoming Bills" widget (mirrors the
      // canonical bills list in /api/finance/bills).
      where: { familyId, isActive: true, ...liveBillWhere },
      include: {
        account: true,
        category: true,
        location: { select: { id: true, name: true } },
      },
      orderBy: { nextDueDate: 'asc' },
    }) as Promise<(FinanceRecurringBill & { account: Pick<FinanceAccount, 'id' | 'name'> | null; category: FinanceCategory | null; location: { id: string; name: string } | null })[]>,
    prisma.financeSavingsGoal.findMany({
      where: { familyId, isComplete: false },
      include: { account: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    }) as Promise<(FinanceSavingsGoal & { account: Pick<FinanceAccount, 'id' | 'name'> | null })[]>,
    prisma.financeCategory.findMany({ where: { familyId } }),
    prisma.user.findMany({
      where: { familyId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.financeLocation.findMany({
      where: { familyId, isActive: true },
    }),
    deriveAccountBalancesFromGl(familyId),
    deriveJournalLineBalances(familyId, monthStart, monthEnd),
  ])

  // Build member lookup from family users
  const memberById: Record<string, { id: string; name: string }> = {}
  for (const m of familyUsers) {
    memberById[m.id] = { id: m.id, name: m.name }
  }

  // Compute monthly income/expense totals from the GL (posted journal lines)
  // so they match the P&L report exactly. Using FinanceTransaction would produce
  // different figures because it is a UI cache, not the source of truth.
  let monthlyIncome = 0
  let monthlyExpense = 0
  for (const [, data] of glMonthlyBalances) {
    if (data.accountType === 'income')  monthlyIncome  += Math.max(0, data.netBalance)
    if (data.accountType === 'expense') monthlyExpense += Math.max(0, data.netBalance)
  }
  monthlyIncome  = Math.round(monthlyIncome  * 100) / 100
  monthlyExpense = Math.round(monthlyExpense * 100) / 100

  // Compute total balance from derived balances
  const totalBalance = accounts.reduce((sum, a) => sum + (balanceMap.get(a.id) ?? 0), 0)

  // Category type breakdowns
  const personalCategories = categories.filter((c) => c.isPersonal)
  const locationCategories = categories.filter((c) => c.isLocationBased)
  const externalCategories = categories.filter((c) => c.isExternal)
  const personalTransTotal = transactions
    .filter((t) => t.type === 'expense' && t.categoryId && personalCategories.some((c) => c.id === t.categoryId))
    .reduce((sum, t) => sum + t.amount, 0)
  const locationTransTotal = transactions
    .filter((t) => t.type === 'expense' && t.categoryId && locationCategories.some((c) => c.id === t.categoryId))
    .reduce((sum, t) => sum + t.amount, 0)
  const externalTransTotal = transactions
    .filter((t) => t.type === 'expense' && t.categoryId && externalCategories.some((c) => c.id === t.categoryId))
    .reduce((sum, t) => sum + t.amount, 0)

  // Compute budget spent values — each budget uses ITS OWN period (P2 fix #1).
  // Budgets can be monthly, quarterly, or annual; using the global monthStart/monthEnd
  // window under-reported spend for budgets whose period spans multiple months.
  //
  // Strategy: collect the union of all distinct budget date ranges, fetch transactions
  // for all of them in a single query, then match them back to each budget by category
  // and date range. This avoids N+1 queries.
  const uniquePeriods = new Map<string, { start: Date; end: Date }>()
  for (const b of budgets) {
    const key = `${b.startDate.toISOString()}|${b.endDate.toISOString()}`
    if (!uniquePeriods.has(key)) {
      uniquePeriods.set(key, { start: b.startDate, end: b.endDate })
    }
  }

  // Fetch all expense transactions within any budget period in a single query.
  // The OR across date ranges is safe because budgets are typically few (< 20).
  const budgetTxs = uniquePeriods.size > 0
    ? await prisma.financeTransaction.findMany({
        where: {
          familyId,
          type: 'expense',
          isCleared: true,
          categoryId: { not: null },
          OR: Array.from(uniquePeriods.values()).map(({ start, end }) => ({
            date: { gte: start, lte: end },
          })),
        },
        select: { categoryId: true, amount: true, date: true },
      })
    : []

  // Sum spend per budget: match transactions by categoryId AND falling within the budget's own period
  const budgetsWithSpent = budgets.map((b) => {
    if (!b.categoryId) {
      // Uncategorised budget: sum ALL expense transactions within this budget's period
      const spent = budgetTxs
        .filter((tx) => tx.date >= b.startDate && tx.date <= b.endDate)
        .reduce((sum, tx) => sum + tx.amount, 0)
      return { ...b, spent }
    }
    const spent = budgetTxs
      .filter((tx) => tx.categoryId === b.categoryId && tx.date >= b.startDate && tx.date <= b.endDate)
      .reduce((sum, tx) => sum + tx.amount, 0)
    return { ...b, spent }
  })

  // Count overdue bills (exclude already paid)
  const overdueBills = bills.filter((b) => !b.paid && new Date(b.nextDueDate) < now)

  return (
    <OverviewClient
      accounts={accounts.map((a) => ({
        id: a.id, name: a.name, type: a.type, institution: a.institution,
        currency: a.currency, currentBalance: balanceMap.get(a.id) ?? 0, creditLimit: a.creditLimit,
        isActive: a.isActive, color: a.color, icon: a.icon,
        sortOrder: a.sortOrder, familyId: a.familyId, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString(),
        isBudget: false, isSavings: false, accountNumber: null, entityName: null, entityABN: null,
      }))}
      monthlyIncome={monthlyIncome}
      monthlyExpense={monthlyExpense}
      totalBalance={totalBalance}
      recentTransactions={transactions.slice(0, 5).map((t) => ({
        ...t,
        date: t.date.toISOString(),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        member: t.memberId ? (memberById[t.memberId] ?? null) : null,
        location: t.location ?? null,
      }))}
      budgets={budgetsWithSpent.map((b) => ({
        ...b,
        startDate: b.startDate.toISOString(),
        endDate: b.endDate.toISOString(),
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
      }))}
      bills={bills.map((b) => ({
        ...b,
        nextDueDate: b.nextDueDate.toISOString(),
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
        paidDate: b.paidDate?.toISOString() ?? null,
        invoiceReceivedDate: b.invoiceReceivedDate?.toISOString() ?? null,
        member: b.memberId ? (memberById[b.memberId] ?? null) : null,
        location: b.location ?? null,
        autoPay: b.autoPay,
        emailReminder: b.emailReminder,
        reminderDays: b.reminderDays,
        notes: b.notes,
        endDate: b.endDate?.toISOString() ?? null,
        monthOfYear: b.monthOfYear,
        billType: b.billType ?? 'recurring',
        recurrenceInterval: b.recurrenceInterval ?? null,
      }))}
      savingsGoals={savingsGoals.map((g) => ({
        ...g,
        // Savings goal amount derivation (P2 #4 — documented approach):
        // - Goals WITH a linked account: currentAmount = derived account balance
        //   (balanceMap reflects cleared transactions). The stored currentAmount
        //   field is ignored for these goals.
        // - Goals WITHOUT a linked account: currentAmount = the stored field value,
        //   which the user updates manually via the goal editor (PUT /api/finance/goals).
        //   The UI should expose a "Current amount" input for unlinked goals.
        currentAmount: g.accountId ? (balanceMap.get(g.accountId) ?? g.currentAmount) : g.currentAmount,
        targetDate: g.targetDate?.toISOString() ?? null,
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt.toISOString(),
      }))}
      timezone={timezone}
      personalTransTotal={personalTransTotal}
      locationTransTotal={locationTransTotal}
      externalTransTotal={externalTransTotal}
      members={familyUsers.map((m) => ({ id: m.id, name: m.name }))}
      locations={locations.map((l) => ({ id: l.id, name: l.name }))}
      overdueCount={overdueBills.length}
    />
  )
}