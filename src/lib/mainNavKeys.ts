export interface MainNavKeyDef {
  href: string
  label: string
  group: 'Schedule' | 'Kitchen' | 'Household'
}

// Home and Settings are always visible and are not configurable.
// Finance is additionally subject to the family-level hideFinanceModule setting.
// Keyed by href — the shared identifier across Sidebar, UniversalFAB, and CommandPalette.
export const MAIN_NAV_KEYS: MainNavKeyDef[] = [
  { href: '/calendar',     label: 'Calendar',     group: 'Schedule'  },
  { href: '/chores',       label: 'Chores',       group: 'Schedule'  },
  { href: '/lists',        label: 'Lists',        group: 'Schedule'  },
  { href: '/recipes',      label: 'Recipes',      group: 'Kitchen'   },
  { href: '/meal-plan',    label: 'Meal Plan',    group: 'Kitchen'   },
  { href: '/pantry',       label: 'Pantry',       group: 'Kitchen'   },
  { href: '/finance',      label: 'Finance',      group: 'Household' },
  { href: '/contacts',     label: 'Contacts',     group: 'Household' },
  { href: '/documents',    label: 'Documents',    group: 'Household' },
  { href: '/trips',        label: 'Trips',        group: 'Household' },
  { href: '/notes',        label: 'Notes',        group: 'Household' },
  { href: '/wishlists',    label: 'Wishlist',     group: 'Household' },
  { href: '/pocket-money', label: 'Pocket Money', group: 'Household' },
  { href: '/maintenance',  label: 'Maintenance',  group: 'Household' },
  { href: '/location',     label: 'Locations',    group: 'Household' },
]

export const MAIN_NAV_GROUPS = ['Schedule', 'Kitchen', 'Household'] as const
export type MainNavGroup = typeof MAIN_NAV_GROUPS[number]

/** Returns true if a main nav href should be visible given the stored mainNav prefs. Defaults to visible. */
export function isMainNavVisible(mainNav: Record<string, boolean>, href: string): boolean {
  return mainNav[href] !== false
}
