'use client'

/**
 * PillNav — Homebase standard tab / filter nav component.
 *
 * USE THIS everywhere you need a row of selectable options:
 *   - Page-level tabs (Trips: Overview / Itinerary / Packing…)
 *   - Filter toggles (Finance: Month / Quarter / Year, Accrual / Forecast)
 *   - View switchers (List / Grid / Map)
 *
 * It matches the Finance pill style exactly:
 *   Active  → bg-primary text-primary-foreground border-primary
 *   Inactive → border-border text-muted-foreground hover:text-foreground
 *
 * Usage:
 *   <PillNav
 *     items={[
 *       { id: 'overview', label: 'Overview', icon: LayoutDashboard },
 *       { id: 'itinerary', label: 'Itinerary', icon: CalendarDays },
 *     ]}
 *     active="overview"
 *     onChange={(id) => setTab(id)}
 *   />
 *
 * For links instead of state, pass href on each item.
 */

import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export interface PillNavItem {
  id: string
  label: string
  icon?: LucideIcon
  href?: string
  /** Optional badge count — shown as a small number after the label */
  badge?: number
}

interface PillNavProps {
  items: PillNavItem[]
  active: string
  onChange?: (id: string) => void
  /** Extra className on the wrapping div */
  className?: string
  /** Compact mode — smaller text and padding, for dense toolbars */
  size?: 'sm' | 'md'
}

export function PillNav({ items, active, onChange, className, size = 'md' }: PillNavProps) {
  const base = cn(
    'inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors whitespace-nowrap',
    size === 'sm'
      ? 'px-2.5 py-1 text-xs'
      : 'px-3 py-1.5 text-sm',
  )
  const activeClass  = 'bg-primary text-primary-foreground border-primary shadow-sm'
  const inactiveClass = 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-background'

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {items.map(({ id, label, icon: Icon, href, badge }) => {
        const isActive = id === active
        const classes = cn(base, isActive ? activeClass : inactiveClass)
        const content = (
          <>
            {Icon && <Icon className={cn(size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4')} />}
            {label}
            {badge !== undefined && badge > 0 && (
              <span className={cn(
                'ml-0.5 rounded-full px-1.5 py-px font-semibold leading-none',
                size === 'sm' ? 'text-[9px]' : 'text-[10px]',
                isActive
                  ? 'bg-primary-foreground/20 text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              )}>
                {badge}
              </span>
            )}
          </>
        )

        if (href) {
          return (
            <Link key={id} href={href} className={classes}>
              {content}
            </Link>
          )
        }

        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange?.(id)}
            className={classes}
          >
            {content}
          </button>
        )
      })}
    </div>
  )
}
