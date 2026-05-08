import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { seedFinanceCategories } from '@/lib/finance-seed'
import { OverviewClient } from './OverviewClient'
import { startOfMonth, endOfMonth } from 'date-fns'

export default async function FinanceOverviewPage() {
  const user = await requireSession()
  const familyId = user.familyId
  const timezone = user.timezone ?? 'UTC'

  // Ensure default categories exist
  await seedFinanceCategories(familyId)

  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)

  const [accounts, transactions, budgets, bills, savingsGoals] = await Promise.all([
    prisma.financeAccount.findMany({
      where: { familyId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.financeTransaction.findMany({
      where: { familyId, date: { gte: monthStart, lte: monthEnd } },
      include: { category: true, account: true },
      orderBy: { date: 'desc' },
    }),
    prisma.financeBudget.findMany({
      where: { familyId, startDate: { lte: now }, endDate: { gte: now } },
      include: { category: true },
      orderBy: { name: 'asc' },
    }),
    prisma.financeRecurringBill.findMany({
      where: { familyId, isActive: true },
      include: { account: true, category: true },
      orderBy: { nextDueDate: 'asc' },
    }),
    prisma.financeSavingsGoal.findMany({
      where: { familyId, isComplete: false },
      include: { account: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  // Compute monthly income/expense totals
  const monthlyIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)
  const monthlyExpense = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)

  // Compute total balance
  const totalBalance = accounts.reduce((sum, a) => sum + a.currentBalance, 0)

  return (
    <OverviewClient
      accounts={accounts.map((a) => ({ ...a, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() }))}
      monthlyIncome={monthlyIncome}
      monthlyExpense={monthlyExpense}
      totalBalance={totalBalance}
      recentTransactions={transactions.slice(0, 5).map((t) => ({
        ...t,
        date: t.date.toISOString(),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      }))}
      budgets={budgets.map((b) => ({
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
      }))}
      savingsGoals={savingsGoals.map((g) => ({
        ...g,
        targetDate: g.targetDate?.toISOString() ?? null,
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt.toISOString(),
      }))}
      timezone={timezone}
    />
  )
}