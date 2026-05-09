'use client'

import { Plus, TrendingUp, TrendingDown, Wallet, PiggyBank, AlertCircle, CalendarDays, EyeOff, MapPin, ExternalLink, User } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

interface SerializedAccount {
  id: string; name: string; type: string; institution: string | null
  currency: string; currentBalance: number; creditLimit: number | null
  isActive: boolean; color: string | null; icon: string | null
  sortOrder: number; familyId: string; createdAt: string; updatedAt: string
  isBudget: boolean; isSavings: boolean; accountNumber: string | null; entityName: string | null; entityABN: string | null
}

interface SerializedCategory { id: string; name: string; type: string; color: string | null; icon: string | null; isPersonal: boolean; isLocationBased: boolean; isExternal: boolean; isTaxDeduction: boolean }
interface SerializedTransaction {
  id: string; accountId: string | null; categoryId: string | null
  type: string; amount: number; payee: string | null; description: string | null
  date: string; isRecurring: boolean; isCleared: boolean; isPrivate: boolean
  category: SerializedCategory | null; account: { id: string; name: string } | null
  member: { id: string; name: string } | null
  location: { id: string; name: string } | null
  createdAt: string; updatedAt: string
}
interface SerializedBudget {
  id: string; name: string; amount: number; period: string; spent: number
  startDate: string; endDate: string; rollover: boolean; alertThreshold: number
  category: SerializedCategory | null
  createdAt: string; updatedAt: string
}
interface SerializedBill {
  id: string; name: string; amount: number; accountId: string | null; categoryId: string | null
  frequency: string; dayOfMonth: number | null; nextDueDate: string; isActive: boolean
  account: { id: string; name: string } | null; category: SerializedCategory | null
  member: { id: string; name: string } | null
  location: { id: string; name: string } | null
  autoPay: boolean; emailReminder: boolean; reminderDays: number; notes: string | null
  endDate: string | null; monthOfYear: number | null
  paid: boolean; paidDate: string | null
  invoiceReceived: boolean; invoiceReceivedDate: string | null
  billType: string; recurrenceInterval: string | null
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
  personalTransTotal?: number
  locationTransTotal?: number
  externalTransTotal?: number
  members: { id: string; name: string }[]
  locations: { id: string; name: string }[]
  overdueCount: number
}

function formatCurrency(amount: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amount)
}

export function OverviewClient({
  accounts, monthlyIncome, monthlyExpense, totalBalance,
  recentTransactions, budgets, bills, savingsGoals, timezone,
  personalTransTotal = 0, locationTransTotal = 0, externalTransTotal = 0,
  members, locations, overdueCount,
}: Props) {
  const router = useRouter()
  const now = new Date()
  const netSavings = monthlyIncome - monthlyExpense
  const upcomingBills = bills.filter((b) => new Date(b.nextDueDate) >= now)
    .slice(0, 5)
  const totalBudgeted = budgets.reduce((s, b) => s + b.amount, 0)
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0)

  return (
    <div className="space-y-6">
      {/* Overdue Banner */}
      {overdueCount > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <span className="text-sm font-medium text-red-600 dark:text-red-400">
            {overdueCount} bill{overdueCount > 1 ? 's' : ''} past due — check your{' '}
            <button onClick={() => router.push('/finance/bills')} className="underline hover:no-underline">
              Bills
            </button>
          </span>
        </div>
      )}

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

      {/* Category Type Breakdowns */}
      {(personalTransTotal > 0 || locationTransTotal > 0 || externalTransTotal > 0) && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Category Breakdowns</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {personalTransTotal > 0 && (
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Personal Expenses</span>
                </div>
                <p className="text-lg font-bold">{formatCurrency(personalTransTotal)}</p>
              </div>
            )}
            {locationTransTotal > 0 && (
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Location-based Expenses</span>
                </div>
                <p className="text-lg font-bold">{formatCurrency(locationTransTotal)}</p>
              </div>
            )}
            {externalTransTotal > 0 && (
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">External Expenses</span>
                </div>
                <p className="text-lg font-bold">{formatCurrency(externalTransTotal)}</p>
              </div>
            )}
          </div>
        </section>
      )}

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
                      'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                      t.type === 'income' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                    )}
                  >
                    {t.type === 'income' ? '+' : '-'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.payee ?? t.description ?? 'Transaction'}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.category?.name ?? 'Uncategorized'} &middot; {format(new Date(t.date), 'd MMM')}
                      {t.member && <> &middot; {t.member.name}</>}
                      {t.location && <> &middot; {t.location.name}</>}
                    </p>
                  </div>
                  <p className={cn('text-sm font-semibold shrink-0', t.type === 'income' ? 'text-green-500' : 'text-red-500')}>
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
                      <p className="text-xs text-muted-foreground">
                        Due {format(dueDate, 'd MMM')} ({daysUntilDue > 0 ? `${daysUntilDue}d` : 'today'})
                        {b.member && <> &middot; {b.member.name}</>}
                        {b.location && <> &middot; {b.location.name}</>}
                      </p>
                    </div>
                    <p className="text-sm font-semibold shrink-0">{formatCurrency(b.amount)}</p>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* Budget Overview with spent values */}
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
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
              {budgets.slice(0, 6).map((b) => (
                <BudgetBar key={b.id} name={b.name} budget={b.amount} spent={b.spent} color={b.category?.color ?? '#6366F1'} />
              ))}
            </div>
            {budgets.length > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground border-t border-border pt-3">
                <span>Total Budgeted: <span className="font-semibold text-foreground">{formatCurrency(totalBudgeted)}</span></span>
                <span>Total Spent: <span className="font-semibold text-foreground">{formatCurrency(totalSpent)}</span></span>
                <span className={cn(totalSpent <= totalBudgeted ? 'text-green-500' : 'text-red-500')}>
                  {totalSpent <= totalBudgeted ? 'On track' : `Over by ${formatCurrency(totalSpent - totalBudgeted)}`}
                </span>
              </div>
            )}
          </>
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

      {/* Members & Locations summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {members.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              Members ({members.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium">
                  {m.name}
                </span>
              ))}
            </div>
          </section>
        )}
        {locations.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Locations ({locations.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              {locations.map((l) => (
                <span key={l.id} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium">
                  {l.name}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
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
        <span className="font-semibold text-foreground">{formatCurrency(spent)}</span>
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