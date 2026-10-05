// Single source of truth for the main navigation entries shown in the Sidebar,
// the mobile + sheet (UniversalFAB), the CommandPalette and Settings → Menu.
// Home, Settings and Admin are not configurable and stay local to each surface.
// Client-safe: lucide icons only, no prisma/server imports.
import type { ComponentType } from 'react'
import {
  Calendar, CheckSquare, ChefHat, CalendarDays, StickyNote, ListChecks, BookUser,
  FileText, DollarSign, Plane, Gift, Wrench, PiggyBank, ShoppingBasket, MapPin, Sun, Target,
} from 'lucide-react'

export interface NavItemDef {
  href: string
  label: string
  /** Shorter label for tight spaces (mobile sheet grid); defaults to label. */
  shortLabel?: string
  group: 'Schedule' | 'Kitchen' | 'Household'
  icon: ComponentType<{ className?: string }>
  /** Sidebar category colour token */
  cat: string
}

export const NAV_ITEMS: NavItemDef[] = [
  { href: '/today',        label: 'Today',        group: 'Schedule',  icon: Sun,            cat: 'var(--cat-calendar)' },
  { href: '/habits',       label: 'Habits',       group: 'Schedule',  icon: Target,         cat: 'var(--cat-calendar)' },
  { href: '/calendar',     label: 'Calendar',     group: 'Schedule',  icon: Calendar,       cat: 'var(--cat-calendar)' },
  { href: '/chores',       label: 'Chores',       group: 'Schedule',  icon: ListChecks,     cat: 'var(--cat-chores)' },
  { href: '/lists',        label: 'Lists',        group: 'Schedule',  icon: CheckSquare,    cat: 'var(--cat-lists)' },
  { href: '/recipes',      label: 'Recipes',      group: 'Kitchen',   icon: ChefHat,        cat: 'var(--cat-recipes)' },
  { href: '/meal-plan',    label: 'Meal Plan',    shortLabel: 'Meals', group: 'Kitchen', icon: CalendarDays, cat: 'var(--cat-mealplan)' },
  { href: '/pantry',       label: 'Pantry',       group: 'Kitchen',   icon: ShoppingBasket, cat: 'var(--cat-pantry)' },
  { href: '/finance',      label: 'Finance',      group: 'Household', icon: DollarSign,     cat: 'var(--cat-finance)' },
  { href: '/contacts',     label: 'Contacts',     group: 'Household', icon: BookUser,       cat: 'var(--cat-contacts)' },
  { href: '/documents',    label: 'Documents',    group: 'Household', icon: FileText,       cat: 'var(--cat-documents)' },
  { href: '/trips',        label: 'Trips',        group: 'Household', icon: Plane,          cat: 'var(--cat-trips)' },
  { href: '/notes',        label: 'Notes',        group: 'Household', icon: StickyNote,     cat: 'var(--cat-notes)' },
  { href: '/wishlists',    label: 'Wishlist',     group: 'Household', icon: Gift,           cat: 'var(--cat-contacts)' },
  { href: '/pocket-money', label: 'Pocket Money', group: 'Household', icon: PiggyBank,      cat: 'var(--cat-chores)' },
  { href: '/maintenance',  label: 'Maintenance',  group: 'Household', icon: Wrench,         cat: 'var(--cat-maintenance)' },
  { href: '/location',     label: 'Locations',    group: 'Household', icon: MapPin,         cat: 'var(--cat-contacts)' },
]
