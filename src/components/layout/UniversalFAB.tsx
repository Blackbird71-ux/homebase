'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import {
  CalendarPlus,
  ListPlus,
  ChefHat,
  StickyNote,
  Plus,
  Home,
  Calendar,
  CheckSquare,
  CalendarDays,
  BookUser,
  ListChecks,
  Settings,
  LogOut,
  DollarSign,
  ShoppingCart,
  Utensils,
  Bot,
  HelpCircle,
  Plane,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type QuickAction = 'event' | 'chore' | 'expense' | 'list-item' | 'shopping-list' | 'todo-list' | 'recipe' | 'meal' | 'note' | 'ai' | 'help'

const navItems = [
  { href: '/home',      label: 'Home',     icon: Home },
  { href: '/calendar',  label: 'Calendar', icon: Calendar },
  { href: '/lists',     label: 'Lists',    icon: CheckSquare },
  { href: '/chores',    label: 'Chores',   icon: ListChecks },
  { href: '/contacts',  label: 'Contacts', icon: BookUser },
  { href: '/finance',   label: 'Finance',  icon: DollarSign },
  { href: '/recipes',   label: 'Recipes',  icon: ChefHat },
  { href: '/meal-plan', label: 'Meals',    icon: CalendarDays },
  { href: '/trips',     label: 'Trips',    icon: Plane },
  { href: '/notes',     label: 'Notes',    icon: StickyNote },
  { href: '/settings',  label: 'Settings', icon: Settings },
]

const quickActions: { id: QuickAction; label: string; icon: React.ReactNode; description: string }[] = [
  { id: 'event',         label: 'Event',         icon: <CalendarPlus className="h-5 w-5" />,  description: 'Add a calendar event' },
  { id: 'chore',         label: 'Chore',         icon: <ListChecks className="h-5 w-5" />,    description: 'Add a new chore' },
  { id: 'expense',       label: 'Expense',       icon: <DollarSign className="h-5 w-5" />,    description: 'Log a transaction' },
  { id: 'list-item',     label: 'List Item',     icon: <ListPlus className="h-5 w-5" />,      description: 'Add to a list' },
  { id: 'shopping-list', label: 'Shopping List', icon: <ShoppingCart className="h-5 w-5" />,   description: 'New shopping list' },
  { id: 'todo-list',     label: 'To-Do List',    icon: <CheckSquare className="h-5 w-5" />,   description: 'New to-do list' },
  { id: 'recipe',        label: 'Recipe',        icon: <ChefHat className="h-5 w-5" />,       description: 'Add a recipe' },
  { id: 'meal',          label: 'Meal',          icon: <Utensils className="h-5 w-5" />,      description: 'Plan a meal' },
  { id: 'note',          label: 'Note',          icon: <StickyNote className="h-5 w-5" />,    description: 'Write a note' },
  { id: 'ai',            label: 'AI Assistant',  icon: <Bot className="h-5 w-5" />,           description: 'Voice or chat commands' },
  { id: 'help',          label: 'Help',           icon: <HelpCircle className="h-5 w-5" />,   description: 'How to use this page' },
]

interface UniversalFABProps {
  /** Called when the user picks a quick action on desktop (opens QuickAdd dialog) */
  onQuickAction?: (action: QuickAction) => void
}

export function UniversalFAB({ onQuickAction }: UniversalFABProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Keyboard shortcut: Cmd+K / Ctrl+K opens the dialog
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (window.innerWidth >= 768) {
          // Desktop — dispatch event to open QuickAdd dialog
          window.dispatchEvent(new CustomEvent('homebase:quickadd'))
        } else {
          setOpen((prev) => !prev)
        }
      }
      if (e.key === 'Escape' && open) setOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  // Listen for sidebar quick-add button to open the bottom sheet on mobile
  useEffect(() => {
    function handleSidebarOpen() {
      if (window.innerWidth < 768) {
        setOpen(true)
      }
    }
    window.addEventListener('homebase:quickadd', handleSidebarOpen)
    return () => window.removeEventListener('homebase:quickadd', handleSidebarOpen)
  }, [])

  function handleFABClick() {
    if (window.innerWidth >= 768) {
      // Desktop — dispatch event to open QuickAdd dialog
      window.dispatchEvent(new CustomEvent('homebase:quickadd'))
    } else {
      // Mobile — toggle bottom sheet
      setOpen((prev) => !prev)
    }
  }

  function handleActionSelect(action: QuickAction) {
    // AI and Help are modal/dialog-only actions — dispatch directly
    if (action === 'ai' || action === 'help') {
      setOpen(false)
      const eventName = action === 'ai' ? 'homebase:open-ai' : 'homebase:open-help'
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent(eventName))
      }, 200)
      return
    }

    if (window.innerWidth >= 768) {
      // Desktop — notify parent to open QuickAdd dialog with the selected action
      onQuickAction?.(action)
    } else {
      // Mobile — close sheet, then dispatch event with action
      setOpen(false)
      // Give sheet close animation time, then open QuickAdd dialog
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('homebase:quickadd-action', { detail: { action } })
        )
      }, 200)
    }
  }

  return (
    <>
      {/* ── Floating Action Button ─────────────────────────────────────────── */}
      <button
        type="button"
        onClick={handleFABClick}
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 active:scale-95 transition-all"
        aria-label={open ? 'Close menu' : 'Open menu'}
      >
        <Plus
          className={cn(
            'h-6 w-6 transition-transform duration-200',
            open && 'rotate-45'
          )}
        />
      </button>

      {/* ── Mobile bottom sheet ─────────────────────────────────────────────── */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Sheet panel — slides up from bottom */}
          <div
            className="fixed inset-x-0 bottom-0 z-50 bg-background rounded-t-2xl shadow-2xl md:hidden overflow-y-auto"
            style={{ maxHeight: '88svh' }}
            role="dialog"
            aria-modal="true"
            aria-label="Quick add and navigation"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            {/* Quick Add */}
            <div className="px-4 pt-1 pb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Quick Add
              </p>
              <div className="grid grid-cols-2 gap-2">
                {quickActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => handleActionSelect(action.id)}
                    className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-accent hover:border-primary/40 active:scale-95 transition-all text-left"
                  >
                    <span className="text-primary shrink-0">{action.icon}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{action.label}</div>
                      <div className="text-xs text-muted-foreground leading-tight">{action.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Navigate */}
            <div className="px-4 pt-3 pb-6 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Navigate
              </p>
              <div className="grid grid-cols-3 gap-2">
                {navItems.map(({ href, label, icon: Icon }) => {
                  const isActive = pathname === href || pathname.startsWith(href + '/')
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-colors active:scale-95',
                        isActive
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-transparent hover:bg-accent text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-xs font-medium">{label}</span>
                    </Link>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={() => { setOpen(false); signOut({ callbackUrl: '/login' }) }}
                className="mt-3 flex w-full items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
