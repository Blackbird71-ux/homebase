'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

// The three P&L-style surfaces look similar but answer different questions.
// This bar sits under each PageHero so the user can tell them apart and jump
// between them. Keep the list here as the single source of truth.
const VIEWS = [
  { href: '/finance/profit-loss', label: 'P&L',            hint: 'Actual P&L from the General Ledger, one period' },
  { href: '/finance/annual-pnl',  label: 'Annual P&L',     hint: 'The same GL actuals, month-by-month across the year' },
  { href: '/finance/reports',     label: 'Spend forecast', hint: 'Spending projected from bills, by category or vendor (not GL)' },
] as const

export function PnlViewNav() {
  const pathname = usePathname()
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs" data-print-hide>
      <span className="text-muted-foreground mr-0.5">Related views:</span>
      {VIEWS.map(v => {
        const active = pathname === v.href || pathname.startsWith(v.href + '/')
        return (
          <Link
            key={v.href}
            href={v.href}
            title={v.hint}
            className={cn(
              'px-2.5 py-1 rounded-full border font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground border-primary pointer-events-none'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {v.label}
          </Link>
        )
      })}
    </div>
  )
}
