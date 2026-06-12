// Client-safe pantry helpers — pure logic only, no prisma/server imports
// (imported by both API routes and client components).

export type PantryStatus = 'stocked' | 'low' | 'out'
export type PantryLocation = 'pantry' | 'fridge' | 'freezer'

export const PANTRY_STATUSES: PantryStatus[] = ['stocked', 'low', 'out']
export const PANTRY_LOCATIONS: PantryLocation[] = ['pantry', 'fridge', 'freezer']

export interface PantryItemShape {
  id: string
  name: string
  location: PantryLocation
  status: PantryStatus
  isStaple: boolean
  expiryDate: string | null
}

// Tap-to-cycle a status dot: stocked → low → out → stocked
export function nextPantryStatus(status: PantryStatus): PantryStatus {
  if (status === 'stocked') return 'low'
  if (status === 'low') return 'out'
  return 'stocked'
}

// Single source of truth for name matching: pantry items, shopping checkoff
// names, and recipe ingredients all compare via this key. Case/whitespace
// insensitive so "Milk" and " milk " never become two pantry rows.
export function normalizePantryName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function matchPantryItem<T extends { name: string }>(items: T[], name: string): T | undefined {
  const key = normalizePantryName(name)
  return items.find(i => normalizePantryName(i.name) === key)
}
