'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Landmark,
  ArrowLeftRight,
  FileText,
  TrendingUp,
  BarChart2,
  BarChart3,
  Scale,
  Receipt,
  BookOpen,
  PieChart,
  Wallet,
  Target,
  Users,
  Building2,
  UserCircle,
  MapPin,
  BookMarked,
  ChevronDown,
  Menu,
} from 'lucide-react'

const groups = [
  {
    label: 'Day-to-day',
    items: [
      { href: '/finance',              label: 'Overview',           icon: LayoutDashboard, exact: true  },
      { href: '/finance/accounts',     label: 'Accounts',           icon: Landmark,        exact: false },
      { href: '/finance/transactions', label: 'Transactions',       icon: ArrowLeftRight,  exact: false },
      { href: '/finance/bills',        label: 'Bills',              icon: FileText,        exact: false },
      { href: '/finance/income',       label: 'Income',             icon: TrendingUp,      exact: false },
    ],
  },
  {
    label: 'Reporting',
    items: [
      { href: '/finance/profit-loss',  label: 'P&L',               icon: BarChart2,       exact: false },
      { href: '/finance/annual-pnl',   label: 'Annual P&L',        icon: BarChart3,       exact: false },
      { href: '/finance/balance-sheet',label: 'Balance Sheet',      icon: Scale,           exact: false },
      { href: '/finance/tax-report',   label: 'Tax Report',        icon: Receipt,         exact: false },
      { href: '/finance/journals',     label: 'Journals',           icon: BookOpen,        exact: false },
      { href: '/finance/reports',      label: 'Reports',            icon: PieChart,        exact: false },
    ],
  },
  {
    label: 'Planning',
    items: [
      { href: '/finance/budget',       label: 'Budget',             icon: Wallet,          exact: false },
      { href: '/finance/goals',        label: 'Goals',              icon: Target,          exact: false },
    ],
  },
  {
    label: 'Reference',
    items: [
      { href: '/finance/contacts',     label: 'Financial Contacts', icon: Users,           exact: false },
      { href: '/finance/entities',     label: 'Entities',           icon: Building2,       exact: false },
      { href: '/finance/members',      label: 'Members',            icon: UserCircle,      exact: false },
      { href: '/finance/locations',    label: 'Locations',          icon: MapPin,          exact: false },
      { href: '/finance/categories',   label: 'Chart of Accounts',  icon: BookMarked,      exact: false },
    ],
  },
]

const allItems = groups.flatMap((g) => g.items)

function useActiveItem(pathname: string) {
  return allItems.find((item) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href) && item.href !== '/finance'
  ) ?? allItems[0]
}

// ─── Mobile: dropdown sheet ───────────────────────────────────────────────────

function MobileNav({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false)
  const activeItem = useActiveItem(pathname)
  const ActiveIcon = activeItem.icon

  return (
    <div className="md:hidden shrink-0 border-b border-border bg-background">
      {/* Current page button */}
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center gap-3 px-4 py-3"
      >
        <ActiveIcon className="h-4 w-4 text-primary shrink-0" />
        <span className="flex-1 text-left text-sm font-medium">{activeItem.label}</span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-0 right-0 z-30 bg-background border-b border-border shadow-lg overflow-y-auto max-h-[70svh]">
            {groups.map((group) => (
              <div key={group.label} className="px-3 py-2">
                <p className="px-2 py-1 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/50">
                  {group.label}
                </p>
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive = item.exact
                    ? pathname === item.href
                    : pathname.startsWith(item.href) && item.href !== '/finance'
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground/60')} />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Desktop: sidebar ─────────────────────────────────────────────────────────

function DesktopSidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="hidden md:flex w-52 shrink-0 flex-col border-r border-border bg-muted/30 overflow-y-auto">
      <div className="px-4 pt-5 pb-3 shrink-0">
        <p className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground/60 select-none">
          Finance
        </p>
      </div>

      <nav className="flex-1 px-2 pb-4 space-y-5">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-2 mb-1 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/50 select-none">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href) && item.href !== '/finance'
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-all',
                        isActive
                          ? 'bg-background text-foreground font-medium shadow-sm border border-border/60'
                          : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
                      )}
                    >
                      <Icon className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground/70')} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex h-full overflow-hidden relative">
      <DesktopSidebar pathname={pathname} />

      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <MobileNav pathname={pathname} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
