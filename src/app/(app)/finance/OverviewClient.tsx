'use client'

import { Plus, TrendingUp, TrendingDown, Wallet, PiggyBank, AlertCircle, CalendarDays } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

interface SerializedAccount {
  id: string; name: string; type: string; institution: string | null
  currency: string; currentBalance: number; creditLimit: number | null
  isActive: boolean; color: string | null; icon: string | null
  sortOrder: number; familyId: string; createdAt: string; updatedAt: string
}

interface SerializedCategory { id: string; name: string; type: string; color: string | null; icon: string | null }
interface SerializedTransaction {
  id: string; accountId: string | null; categoryId: string | null
  type: string; amount: number; payee: string | null; description: string | null
  date: string; isRecurring: boolean; isCleared: boolean; isPrivate: boolean
  category: SerializedCategory | null; account: { id: string; name: string } | null
  createdAt: string; updatedAt: string
}
interface SerializedBudget {
  id: string; name: string; amount: number; period: string
  startDate: string; endDate: string; rollover: boolean; alertThreshold: number
  category: SerializedCategory | null
  createdAt: string; updatedAt: string
}
interface SerializedBill {
  id: string; name: string; amount: number; accountId: string | null; categoryId: string | null
  frequency: string; dayOfMonth: number | null; nextDueDate: string; isActive: boolean
  account: { id: string; name: string } | null; category: SerializedCategory | null
  createdAt: string; updatedAt: string
}
interface SerializedGoal {
  id: string; name: string; targetAmount: number; currentAmount: number
  targetDate: string | null; color: string | null; icon: string | null; isComplete: boolean
  account: { id: string; name: string } | null
  createdAt: string; updatedAt: string
}

interface Props {
  accounts: SerializedAccount[]
  monthlyIncome: number
  monthlyExpense: number
  totalBalance: number
  recentTransactions: SerializedTransaction[]
  budgets: SerializedBudget[]
  bills: SerializedBill[]
  savingsGoals: SerializedGoal[]
  timezone: string
}

function formatCurrency(amount: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amount)
}

export function OverviewClient({
  accounts, monthlyIncome, monthlyExpense, totalBalance,
  recentTransactions, budgets, bills, savingsGoals, timezone,
}: Props) {
  const router = useRouter()
  const now = new Date()
  const netSavings = monthlyIncome - monthlyExpense
  const upcomingBills = bills.filter((b) => new Date(b.nextDueDate) >= now)
    .slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={Wallet}
          label="Total Balance"
          value={formatCurrency(totalBalance)}
          color="text-blue-500"
          bgColor="bg-blue-500/10"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Monthly Income"
          value={formatCurrency(monthlyIncome)}
          color="text-green-500"
          bgColor="bg-green-500/10"
        />
        <SummaryCard
          icon={TrendingDown}
          label="Monthly Expenses"
          value={formatCurrency(monthlyExpense)}
          color="text-red-500"
          bgColor="bg-red-500/10"
        />
        <SummaryCard
          icon={PiggyBank}
          label="Net Savings"
          value={formatCurrency(netSavings)}
          color={netSavings >= 0 ? 'text-emerald-500' : 'text-red-500'}
          bgColor={netSavings >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}
        />
      </div>

      {/* Accounts Row */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Accounts</h2>
          <button
            onClick={() => router.push('/finance/accounts?add=1')}
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" /> Add Account
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-full">No accounts yet. Add your first account to start tracking.</p>
          )}
          {accounts.map((a) => (
            <div key={a.id} className="rounded-lg border border-border p-3 hover:bg-accent/50 transition-colors cursor-pointer"
              onClick={() => router.push(`/finance/accounts`)}>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: a.color ?? '#6B7280' }} />
                <span className="text-sm font-medium truncate">{a.name}</span>
                <span className="text-[10px] uppercase text-muted-foreground ml-auto">{a.type}</span>
              </div>
              <p className="text-lg font-bold">{formatCurrency(a.currentBalance, a.currency)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Two-column: Recent Transactions + Upcoming Bills */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Transactions */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Recent Transactions</h2>
            <button
              onClick={() => router.push('/finance/transactions')}
              className="text-sm text-primary hover:underline"
            >
              View All
            </button>
          </div>
          {recentTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions this month.</p>
          ) : (
            <div className="space-y-2">
              {recentTransactions.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
                      t.type === 'income' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                    )}
                  >
                    {t.type === 'income' ? '+' : '-'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.payee ?? t.description ?? 'Transaction'}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.category?.name ?? 'Uncategorized'} &middot; {format(new Date(t.date), 'd MMM')}
                    </p>
                  </div>
                  <p className={cn('text-sm font-semibold', t.type === 'income' ? 'text-green-500' : 'text-red-500')}>
                    {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Upcoming Bills */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Upcoming Bills</h2>
            <button
              onClick={() => router.push('/finance/bills')}
              className="text-sm text-primary hover:underline"
            >
              Manage Bills
            </button>
          </div>
          {upcomingBills.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming bills.</p>
          ) : (
            <div className="space-y-2">
              {upcomingBills.map((b) => {
                const dueDate = new Date(b.nextDueDate)
                const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                return (
                  <div key={b.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <CalendarDays className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{b.name}</p>
                      <p className="text-xs text-muted-foreground">Due {format(dueDate, 'd MMM')} ({daysUntilDue > 0 ? `${daysUntilDue}d` : 'today'})</p>
                    </div>
                    <p className="text-sm font-semibold">{formatCurrency(b.amount)}</p>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* Budget Overview */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Budget Overview</h2>
          <button
            onClick={() => router.push('/finance/budget')}
            className="text-sm text-primary hover:underline"
          >
            Manage Budgets
          </button>
        </div>
        {budgets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No budgets set for this month.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {budgets.map((b) => (
              <BudgetBar key={b.id} name={b.name} budget={b.amount} spent={0 /* TODO: compute actual */} color={b.category?.color ?? '#6366F1'} />
            ))}
          </div>
        )}
      </section>

      {/* Savings Goals */}
      {savingsGoals.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Savings Goals</h2>
            <button
              onClick={() => router.push('/finance/goals')}
              className="text-sm text-primary hover:underline"
            >
              View All
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {savingsGoals.slice(0, 3).map((g) => {
              const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100))
              return (
                <div key={g.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color ?? '#10B981' }} />
                    <span className="text-sm font-medium truncate">{g.name}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{formatCurrency(g.currentAmount)}</span>
                    <span className="text-muted-foreground">{formatCurrency(g.targetAmount)}</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: g.color ?? '#10B981' }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{pct}% complete</p>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, color, bgColor }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  color: string
  bgColor: string
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center gap-3">
        <div className={cn('p-2 rounded-full', bgColor)}>
          <Icon className={cn('h-5 w-5', color)} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </div>
    </div>
  )
}

function BudgetBar({ name, budget, spent, color }: { name: string; budget: number; spent: number; color: string }) {
  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0
  const isOverspent = spent > budget
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2 mb-1">
        {isOverspent && <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
        <span className="text-sm font-medium truncate">{name}</span>
        <span className="text-xs text-muted-foreground ml-auto">{pct}%</span>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>{formatCurrency(spent)}</span>
        <span>{formatCurrency(budget)}</span>
      </div>
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', isOverspent ? 'bg-red-500' : '')}
          style={{ width: `${pct}%`, backgroundColor: isOverspent ? undefined : color }}
        />
      </div>
    </div>
  )
}