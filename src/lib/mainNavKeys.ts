import { NAV_ITEMS } from './nav-items'

export interface MainNavKeyDef {
  href: string
  label: string
  group: 'Schedule' | 'Kitchen' | 'Household'
}

// Home and Settings are always visible and are not configurable.
// Finance is additionally subject to the family-level hideFinanceModule setting.
// Keyed by href — the shared identifier across Sidebar, UniversalFAB, and CommandPalette.
export const MAIN_NAV_KEYS: MainNavKeyDef[] = NAV_ITEMS.map(({ href, label, group }) => ({ href, label, group }))

export const MAIN_NAV_GROUPS = ['Schedule', 'Kitchen', 'Household'] as const
export type MainNavGroup = typeof MAIN_NAV_GROUPS[number]

/** Returns true if a main nav href should be visible given the stored mainNav prefs. Defaults to visible. */
export function isMainNavVisible(mainNav: Record<string, boolean>, href: string): boolean {
  return mainNav[href] !== false
}
