'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  Home, Calendar, CheckSquare, ChefHat, CalendarDays,
  Settings, LogOut, StickyNote, ListChecks, BookUser,
  Plus, FileText, DollarSign, Search,
  Plane, ShieldAlert, Calculator, MoreHorizontal, Gift, Wrench, PiggyBank,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFamilyTimezone } from '@/hooks/useFamilyTimezone'
import { formatInTz } from '@/lib/timezone'

type Group = 'schedule' | 'kitchen' | 'household'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  group?: Group
  cat?: string
  count?: number
}

const navItems: NavItem[] = [
  { href: '/home',      label: 'Home',      icon: Home,         cat: 'var(--accent)' },
  // Schedule
  { href: '/calendar',  label: 'Calendar',  icon: Calendar,     group: 'schedule', cat: 'var(--cat-calendar)' },
  { href: '/chores',    label: 'Chores',    icon: ListChecks,   group: 'schedule', cat: 'var(--cat-chores)' },
  { href: '/lists',     label: 'Lists',     icon: CheckSquare,  group: 'schedule', cat: 'var(--cat-lists)' },
  // Kitchen
  { href: '/recipes',   label: 'Recipes',   icon: ChefHat,      group: 'kitchen',  cat: 'var(--cat-recipes)' },
  { href: '/meal-plan', label: 'Meal Plan', icon: CalendarDays, group: 'kitchen',  cat: 'var(--cat-mealplan)' },
  // Household
  { href: '/finance',   label: 'Finance',   icon: DollarSign,   group: 'household', cat: 'var(--cat-finance)' },
  { href: '/contacts',  label: 'Contacts',  icon: BookUser,     group: 'household', cat: 'var(--cat-contacts)' },
  { href: '/documents', label: 'Documents', icon: FileText,     group: 'household', cat: 'var(--cat-documents)' },
  { href: '/trips',     label: 'Trips',     icon: Plane,        group: 'household', cat: 'var(--cat-trips)' },
  { href: '/notes',      label: 'Notes',     icon: StickyNote,   group: 'household', cat: 'var(--cat-notes)' },
  { href: '/wishlists',    label: 'Wishlist',     icon: Gift,    group: 'household', cat: 'var(--cat-contacts)' },
  { href: '/pocket-money', label: 'Pocket Money', icon: PiggyBank, group: 'household', cat: 'var(--cat-chores)' },
  { href: '/maintenance',  label: 'Maintenance',  icon: Wrench,  group: 'household', cat: 'var(--cat-documents)' },
]

const GROUP_LABEL: Record<Group, string> = {
  schedule:  'Schedule',
  kitchen:   'Kitchen',
  household: 'Household',
}

interface SidebarProps {
  collapsed?: boolean
  isAdmin?: boolean
  hideFinanceModule?: boolean
  familyName?: string
  memberName?: string
  memberRole?: string
  counts?: Partial<Record<string, number>>
}

export function Sidebar({
  collapsed = false,
  isAdmin = false,
  hideFinanceModule = false,
  familyName = 'Family',
  memberName = '',
  memberRole = 'Member',
  counts = {},
}: SidebarProps) {
  const pathname = usePathname()
  const timezone = useFamilyTimezone()

  const today = new Date()
  const dateNum  = today.getDate()
  const dateMeta = formatInTz(today, timezone, { weekday: 'short', month: 'short' })
  const week     = `Week ${getISOWeek(today)} · ${today.getFullYear()}`

  const initials = memberName.split(' ').map((p: string) => p[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || 'HB'

  function openQuickAdd() {
    window.dispatchEvent(new CustomEvent('homebase:quickadd'))
  }

  function openSearch() {
    window.dispatchEvent(new CustomEvent('homebase:command-palette'))
  }

  const renderItem = ({ href, label, icon: Icon, cat, count: staticCount }: NavItem) => {
    const isActive = pathname === href || pathname.startsWith(href + '/')
    const count = counts[href] ?? staticCount
    return (
      <Link
        key={href}
        href={href}
        title={collapsed ? label : undefined}
        className={cn('hb-sidebar__nav-link', isActive && 'is-active')}
        style={{ '--cat': cat } as React.CSSProperties}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="hb-sidebar__label">{label}</span>}
        {!collapsed && count !== undefined && count > 0 && (
          <span className="hb-sidebar__count">{count}</span>
        )}
        {!collapsed && (count === undefined || count === 0) && (
          <span className="hb-sidebar__cat-dot" />
        )}
      </Link>
    )
  }

  const renderGroup = (group: Group) => {
    const items = navItems.filter(n =>
      n.group === group &&
      !(hideFinanceModule && n.href === '/finance')
    )
    if (items.length === 0) return null
    return (
      <React.Fragment key={group}>
        {!collapsed && (
          <div className="hb-sidebar__group-label">{GROUP_LABEL[group]}</div>
        )}
        {items.map(item => renderItem(item))}
      </React.Fragment>
    )
  }

  return (
    <aside
      className={cn(
        'hb-sidebar flex',
        collapsed && 'hb-sidebar--collapsed'
      )}
    >
      {/* Brand */}
      <div className="hb-sidebar__brand">
        <span className="hb-sidebar__logo" aria-hidden>H</span>
        {!collapsed && (
          <span className="hb-sidebar__brand-text">
            Homebase
            <small>{familyName}</small>
          </span>
        )}
      </div>

      {/* Today's date strip */}
      {!collapsed && (
        <div className="hb-sidebar__date">
          <span className="hb-sidebar__date-num">{dateNum}</span>
          <span className="hb-sidebar__date-meta">
            <strong>{dateMeta}</strong>
            <span>{week}</span>
          </span>
        </div>
      )}

      {/* Search (⌘K command palette) */}
      <button type="button" onClick={openSearch} className="hb-sidebar__quickadd">
        <Search className="h-4 w-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="hb-sidebar__quickadd-text">Search</span>
            <kbd className="hb-sidebar__quickadd-kbd">⌘K</kbd>
          </>
        )}
      </button>

      {/* Quick Add */}
      <button type="button" onClick={openQuickAdd} className="hb-sidebar__quickadd">
        <Plus className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="hb-sidebar__quickadd-text">Quick Add</span>}
      </button>

      {/* Nav */}
      <nav className="hb-sidebar__nav">
        {renderItem(navItems[0])}
        {renderGroup('schedule')}
        {renderGroup('kitchen')}
        {renderGroup('household')}
        {hideFinanceModule && renderItem({
          href:  '/finance/simple-budget-planner',
          label: 'Budget Planner',
          icon:  Calculator,
          cat:   'var(--cat-finance)',
        })}
      </nav>

      {/* Footer */}
      <div className="hb-sidebar__foot">
        {isAdmin && renderItem({ href: '/admin', label: 'Admin', icon: ShieldAlert })}
        {renderItem({ href: '/settings', label: 'Settings', icon: Settings })}
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="hb-sidebar__nav-link"
          title={collapsed ? 'Sign out' : undefined}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="hb-sidebar__label">Sign out</span>}
        </button>
      </div>

      {/* Profile chip */}
      {!collapsed && (
        <div className="hb-profile">
          <span className="hb-profile__avatar">{initials}</span>
          <span className="hb-profile__meta">
            <strong>{memberName || 'Member'}</strong>
            <span>{memberRole}</span>
          </span>
          <button className="hb-profile__menu-btn" title="More" type="button">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </aside>
  )
}

function getISOWeek(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}
