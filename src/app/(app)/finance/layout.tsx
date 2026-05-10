'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const groups = [
  {
    label: 'Day-to-day',
    tabs: [
      { href: '/finance',             label: 'Overview',          exact: true },
      { href: '/finance/accounts',    label: 'Accounts',          exact: false },
      { href: '/finance/transactions',label: 'Transactions',      exact: false },
      { href: '/finance/bills',       label: 'Bills',             exact: false },
      { href: '/finance/income',      label: 'Income',            exact: false },
    ],
  },
  {
    label: 'Reporting',
    tabs: [
      { href: '/finance/profit-loss',  label: 'P&L',               exact: false },
      { href: '/finance/annual-pnl',   label: 'Annual P&L',        exact: false },
      { href: '/finance/balance-sheet',label: 'Balance Sheet',      exact: false },
      { href: '/finance/tax-report',   label: 'Tax Report',        exact: false },
      { href: '/finance/journals',     label: 'Journals',           exact: false },
      { href: '/finance/reports',      label: 'Reports',            exact: false },
    ],
  },
  {
    label: 'Planning',
    tabs: [
      { href: '/finance/budget',       label: 'Budget',             exact: false },
      { href: '/finance/goals',        label: 'Goals',              exact: false },
    ],
  },
  {
    label: 'Reference',
    tabs: [
      { href: '/finance/contacts',     label: 'Financial Contacts', exact: false },
      { href: '/finance/entities',     label: 'Entities',           exact: false },
      { href: '/finance/members',      label: 'Members',            exact: false },
      { href: '/finance/locations',    label: 'Locations',          exact: false },
      { href: '/finance/categories',   label: 'Chart of Accounts',  exact: false },  // route path unchanged; label renamed per spec §3.3
    ],
  },
]

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-6 pb-0 shrink-0">
        <h1 className="text-2xl font-bold">Finance</h1>
        <p className="text-muted-foreground mt-1">Track income, expenses, budgets and savings.</p>
      </div>

      <div className="px-6 pt-4 pb-0 shrink-0 overflow-x-auto">
        <nav className="flex flex-col gap-0 border-b border-border min-w-max">
          {groups.map((group) => (
            <div key={group.label}>
              <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 pt-2 pb-1">
                {group.label}
              </span>
              <div className="flex gap-1 px-3 pb-1">
                {group.tabs.map((tab) => {
                  const isActive = tab.exact
                    ? pathname === tab.href
                    : pathname.startsWith(tab.href) && tab.href !== '/finance'
                  return (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      className={cn(
                        'px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                        isActive
                          ? 'border-primary text-primary'
                          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                      )}
                    >
                      {tab.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto p-6 pt-4">
        {children}
      </div>
    </div>
  )
}
