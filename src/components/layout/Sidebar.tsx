'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  Home, Calendar, CheckSquare, ChefHat, CalendarDays,
  Settings, LogOut, StickyNote, ListChecks, BookUser,
  Plus, ChevronLeft, ChevronRight, FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/home',      label: 'Home',      icon: Home },
  { href: '/calendar',  label: 'Calendar',  icon: Calendar },
  { href: '/lists',     label: 'Lists',     icon: CheckSquare },
  { href: '/chores',    label: 'Chores',    icon: ListChecks },
  { href: '/contacts',  label: 'Contacts',  icon: BookUser },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/recipes',   label: 'Recipes',   icon: ChefHat },
  { href: '/meal-plan', label: 'Meal Plan', icon: CalendarDays },
  { href: '/notes',     label: 'Notes',     icon: StickyNote },
]

interface SidebarProps {
  collapsed?: boolean
  onToggle?: () => void
}

export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname()

  function openQuickAdd() {
    window.dispatchEvent(new CustomEvent('homebase:quickadd'))
  }

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col shrink-0 h-full border-r border-border transition-[width] duration-200 ease-in-out overflow-hidden',
        collapsed ? 'w-12' : 'w-52'
      )}
      style={{ backgroundColor: 'var(--sidebar)' }}
    >
      {/* Logo + collapse toggle */}
      <div
        className={cn(
          'flex items-center border-b border-border shrink-0',
          collapsed ? 'justify-center px-2 py-[18px]' : 'justify-between px-4 py-[18px]'
        )}
      >
        {!collapsed && (
          <span className="text-sm font-bold tracking-widest text-muted-foreground uppercase truncate mr-2">
            <span aria-hidden="true">🏠</span> Homebase
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <ChevronRight className="h-4 w-4" />
            : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Quick Add */}
      <div className={cn('px-2 py-2 border-b border-border shrink-0', collapsed && 'flex justify-center')}>
        <button
          type="button"
          onClick={openQuickAdd}
          title="Quick Add (⌘K)"
          className={cn(
            'flex items-center gap-2 rounded-md text-sm font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-accent',
            collapsed ? 'p-2' : 'w-full px-3 py-2'
          )}
        >
          <Plus className="h-4 w-4 shrink-0" />
          {!collapsed && (
            <>
              Quick Add
              <kbd className="ml-auto px-1 py-0.5 rounded bg-muted text-[10px] font-mono">⌘K</kbd>
            </>
          )}
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                'flex items-center rounded-md text-sm font-medium transition-colors',
                collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-[var(--sidebar-foreground)]/70 hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && label}
            </Link>
          )
        })}
      </nav>

      {/* Settings + Sign out */}
      <div className="px-2 py-4 border-t border-border space-y-1 shrink-0">
        <Link
          href="/settings"
          title={collapsed ? 'Settings' : undefined}
              className={cn(
                'flex items-center rounded-md text-sm font-medium transition-colors',
                collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2',
                pathname.startsWith('/settings')
                  ? 'bg-primary text-primary-foreground'
                  : 'text-[var(--sidebar-foreground)]/70 hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]'
              )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed && 'Settings'}
        </Link>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/login' })}
          title={collapsed ? 'Sign out' : undefined}
          className={cn(
            'flex w-full items-center rounded-md text-sm font-medium text-[var(--sidebar-foreground)]/70 hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)] transition-colors',
            collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2'
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  )
}
