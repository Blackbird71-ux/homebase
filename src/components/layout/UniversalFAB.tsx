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
  CheckSquare,
  ListChecks,
  Settings,
  LogOut,
  DollarSign,
  ShoppingCart,
  Utensils,
  Bot,
  HelpCircle,
  ShoppingBasket,
  PencilIcon,
  Target,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { isMainNavVisible } from '@/lib/mainNavKeys'
import { NAV_ITEMS } from '@/lib/nav-items'
import { pinHref, type Pin } from '@/lib/mobile-pins'
import { PinsDrawer, type PinnableList } from './PinsDrawer'
import { splitQuickAdds, type QuickAddId } from '@/lib/mobile-quick-adds'
import type { HabitView } from '@/lib/habit-helpers'
import { HabitList } from '@/components/habits/HabitList'
import { QuickAddDrawer } from './QuickAddDrawer'

// Actions that open a QuickAdd form; 'habits' is handled inline in the sheet.
type QuickAction = Exclude<QuickAddId, 'habits'>

const navItems = [
  { href: '/home', label: 'Home', icon: Home },
  ...NAV_ITEMS.map(({ href, label, shortLabel, icon }) => ({ href, label: shortLabel ?? label, icon })),
  { href: '/settings', label: 'Settings', icon: Settings },
]

const quickActions: { id: QuickAddId; label: string; icon: React.ReactNode; description: string }[] = [
  { id: 'event',         label: 'Event',         icon: <CalendarPlus className="h-5 w-5" />,  description: 'Add a calendar event' },
  { id: 'chore',         label: 'Chore',         icon: <ListChecks className="h-5 w-5" />,    description: 'Add a new chore' },
  { id: 'expense',       label: 'Expense',       icon: <DollarSign className="h-5 w-5" />,    description: 'Log a transaction' },
  { id: 'list-item',     label: 'List Item',     icon: <ListPlus className="h-5 w-5" />,      description: 'Add to a list' },
  { id: 'shopping-list', label: 'Shopping List', icon: <ShoppingCart className="h-5 w-5" />,   description: 'New shopping list' },
  { id: 'todo-list',     label: 'To-Do List',    icon: <CheckSquare className="h-5 w-5" />,   description: 'New to-do list' },
  { id: 'recipe',        label: 'Recipe',        icon: <ChefHat className="h-5 w-5" />,       description: 'Add a recipe' },
  { id: 'meal',          label: 'Meal',          icon: <Utensils className="h-5 w-5" />,      description: 'Plan a meal' },
  { id: 'note',          label: 'Note',          icon: <StickyNote className="h-5 w-5" />,    description: 'Write a note' },
  { id: 'pantry-item',   label: 'Pantry Item',   icon: <ShoppingBasket className="h-5 w-5" />, description: 'Add to the pantry' },
  { id: 'habits',        label: 'Tick a Habit',  icon: <Target className="h-5 w-5" />,       description: 'Check in on today' },
  { id: 'ai',            label: 'AI Assistant',  icon: <Bot className="h-5 w-5" />,           description: 'Voice or chat commands' },
  { id: 'help',          label: 'Help',           icon: <HelpCircle className="h-5 w-5" />,   description: 'How to use this page' },
]

interface UniversalFABProps {
  /** Called when the user picks a quick action on desktop (opens QuickAdd dialog) */
  onQuickAction?: (action: QuickAction) => void
  hideFinanceModule?: boolean
  mainNav?: Record<string, boolean>
  /** The user's pinned shortcuts (uiPreferences.mobilePins) */
  pins?: Pin[]
  /** The user's chosen Quick Add actions (uiPreferences.mobileQuickAdds); null = show all */
  quickAdds?: QuickAddId[] | null
}

export function UniversalFAB({ onQuickAction, hideFinanceModule = false, mainNav = {}, pins: initialPins = [], quickAdds: initialQuickAdds = null }: UniversalFABProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [pins, setPins] = useState<Pin[]>(initialPins)
  const [pinsOpen, setPinsOpen] = useState(false)
  const [quickAdds, setQuickAdds] = useState<QuickAddId[] | null>(initialQuickAdds)
  const [quickAddsOpen, setQuickAddsOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [lists, setLists] = useState<PinnableList[]>([])
  const [habitsOpen, setHabitsOpen] = useState(false)
  const [habits, setHabits] = useState<HabitView[] | null>(null)

  // Active lists (id/name/type only) are fetched each time the sheet opens, so pinned
  // lists show current names and a pin to an archived/deleted list simply drops out.
  useEffect(() => {
    if (!open && !pinsOpen) return
    let cancelled = false
    fetch('/api/lists?meta=true')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: PinnableList[]) => { if (!cancelled) setLists(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open, pinsOpen])

  // Habits load only when the user opens the inline checklist in the sheet.
  useEffect(() => {
    if (!open || !habitsOpen) return
    let cancelled = false
    fetch('/api/habits')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: HabitView[]) => { if (!cancelled) setHabits(data) })
      .catch(() => { if (!cancelled) setHabits([]) })
    return () => { cancelled = true }
  }, [open, habitsOpen])

  const visibleNavItems = navItems.filter(({ href }) => !(hideFinanceModule && href === '/finance') && isMainNavVisible(mainNav, href))
  const shownPins = pins.flatMap((pin): { pin: Pin; label: string; icon: React.ComponentType<{ className?: string }> }[] => {
    if (pin.type === 'page') {
      const item = visibleNavItems.find((n) => n.href === pin.href)
      return item ? [{ pin, label: item.label, icon: item.icon }] : []
    }
    const list = lists.find((l) => l.id === pin.id)
    return list ? [{ pin, label: list.name, icon: list.type === 'SHOPPING' ? ShoppingCart : CheckSquare }] : []
  })

  const { shown: shownActions, more: moreActions } = splitQuickAdds(quickActions, quickAdds)

  // ⌘K is owned by CommandPalette; Escape still closes the mobile sheet
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
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

  function handleActionSelect(action: QuickAddId) {
    if (action === 'habits') {
      setHabitsOpen((prev) => !prev)
      return
    }
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

            {/* Pinned shortcuts */}
            <div className="px-4 pt-1 pb-3">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pinned</p>
                <button
                  type="button"
                  onClick={() => { setOpen(false); setPinsOpen(true) }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <PencilIcon className="h-3 w-3" />
                  Edit
                </button>
              </div>
              {shownPins.length === 0 ? (
                <p className="text-xs text-muted-foreground">Pin your most-used lists and pages for one-tap access.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {shownPins.map(({ pin, label, icon: Icon }) => (
                    <Link
                      key={pinHref(pin)}
                      href={pinHref(pin)}
                      onClick={() => setOpen(false)}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border hover:bg-accent active:scale-95 transition-all"
                    >
                      <Icon className="h-5 w-5 text-primary" />
                      <span className="text-xs font-medium text-center leading-tight line-clamp-2">{label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Add */}
            <div className="px-4 pt-3 pb-4 border-t border-border">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick Add</p>
                <button
                  type="button"
                  onClick={() => { setOpen(false); setQuickAddsOpen(true) }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <PencilIcon className="h-3 w-3" />
                  Edit
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[...shownActions, ...(moreOpen ? moreActions : [])].map((action) => (
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
              {habitsOpen && (
                <div className="mt-3 rounded-xl border border-border p-3">
                  {habits === null ? (
                    <p className="text-xs text-muted-foreground">Loading�</p>
                  ) : habits.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No habits yet. Add one on the Habits page.</p>
                  ) : (
                    <HabitList habits={habits} onHabitsChange={setHabits} />
                  )}
                </div>
              )}
              {moreActions.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMoreOpen((prev) => !prev)}
                  className="mt-2 w-full py-2 rounded-xl text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  {moreOpen ? 'Show less' : `More (${moreActions.length})`}
                </button>
              )}
            </div>

            {/* Navigate */}
            <div className="px-4 pt-3 pb-6 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Navigate
              </p>
              <div className="grid grid-cols-3 gap-2">
                {visibleNavItems.map(({ href, label, icon: Icon }) => {
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

      <PinsDrawer
        open={pinsOpen}
        onOpenChange={setPinsOpen}
        pins={pins}
        pages={visibleNavItems.map(({ href, label }) => ({ href, label }))}
        lists={lists}
        onSaved={setPins}
      />

      <QuickAddDrawer
        open={quickAddsOpen}
        onOpenChange={setQuickAddsOpen}
        options={quickActions.map(({ id, label }) => ({ id, label }))}
        chosen={quickAdds}
        onSaved={setQuickAdds}
      />
    </>
  )
}
