import { dateStringInTz, DEFAULT_TIMEZONE } from '@/lib/timezone'

export type ShoppingCategory = string

export const DEFAULT_SHOPPING_CATEGORIES: string[] = [
  'Produce',
  'Dairy',
  'Meat',
  'Bakery',
  'Frozen',
  'Household',
  'Other',
]

// For backward compatibility
export const SHOPPING_CATEGORIES = DEFAULT_SHOPPING_CATEGORIES

export interface ListItemShape {
  id: string
  content: string
  isCompleted: boolean
  isLocked: boolean
  category: string | null
  sortOrder: number
  dueDate: Date | null
  recipeId: string | null
  recipeName: string | null
  createdBy: string
  listId: string
  createdAt: Date
  unitPrice: number | null
  quantity: number | null
  assignedToUserId: string | null
}

export interface RecipeGroup {
  name: string
  items: ListItemShape[]
}

/**
 * Group incomplete shopping items by category, sorted by sortOrder within each group.
 * Completed items are excluded — callers handle them separately (DoneSection).
 * categoryOrder controls the order of buckets; defaults to DEFAULT_SHOPPING_CATEGORIES.
 */
export function groupByCategory(
  items: ListItemShape[],
  categoryOrder: string[] = DEFAULT_SHOPPING_CATEGORIES
): Record<string, ListItemShape[]> {
  // Initialize result with all categories from categoryOrder
  const result: Record<string, ListItemShape[]> = {}
  for (const cat of categoryOrder) {
    result[cat] = []
  }
  
  // Ensure 'Other' category exists
  if (!result['Other']) {
    result['Other'] = []
  }
  
  for (const item of items) {
    if (item.isCompleted) continue
    const cat = item.category ?? 'Other'
    const key = result[cat] !== undefined ? cat : 'Other'
    if (!result[key]) {
      result[key] = []
    }
    result[key].push(item)
  }
  
  // Sort items within each category
  for (const cat of Object.keys(result)) {
    result[cat].sort((a, b) => a.sortOrder - b.sortOrder)
  }
  
  return result
}

/**
 * Group incomplete shopping items by recipe name.
 * Items without a recipeName go in "Other". Recipe groups sorted alphabetically, Other last.
 */
export function groupByRecipe(items: ListItemShape[]): RecipeGroup[] {
  const map = new Map<string, ListItemShape[]>()
  for (const item of items) {
    if (item.isCompleted) continue
    const key = item.recipeName ?? 'Other'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  const groups: RecipeGroup[] = []
  const sortedKeys = Array.from(map.keys())
    .filter((k) => k !== 'Other')
    .sort((a, b) => a.localeCompare(b))
  for (const key of sortedKeys) {
    groups.push({ name: key, items: map.get(key)! })
  }
  if (map.has('Other')) {
    groups.push({ name: 'Other', items: map.get('Other')! })
  }
  return groups
}

export type TodoFilter = 'all' | 'mine' | 'today' | 'overdue'

/**
 * Filter and sort todo items.
 *
 * Due-date comparisons are timezone-aware. An item's due date is stored as UTC
 * midnight of its calendar date (the meal-plan / calendar-date convention), so the
 * stored calendar day is read in UTC, while "today" is read in the family's
 * `timezone`. This keeps "Due today" / "Overdue" correct regardless of the device's
 * own timezone (e.g. browser tz ≠ family tz, or a travelling user) — nothing ever
 * lands on the wrong day. String compare of YYYY-MM-DD is chronological order.
 */
export function filterTodoItems(
  items: ListItemShape[],
  filter: TodoFilter,
  now: Date = new Date(),
  currentUserId?: string,
  timezone: string = DEFAULT_TIMEZONE
): ListItemShape[] {
  const todayStr = dateStringInTz(now, timezone)

  let filtered = items
  if (filter === 'mine') {
    filtered = currentUserId
      ? items.filter(
          (i) =>
            !i.isCompleted &&
            (i.assignedToUserId === currentUserId || (!i.assignedToUserId && i.createdBy === currentUserId))
        )
      : items.filter((i) => !i.isCompleted)
  } else if (filter === 'today') {
    filtered = items.filter(
      (i) =>
        !i.isCompleted &&
        i.dueDate !== null &&
        dateStringInTz(i.dueDate, 'UTC') === todayStr
    )
  } else if (filter === 'overdue') {
    filtered = items.filter(
      (i) => !i.isCompleted && i.dueDate !== null && dateStringInTz(i.dueDate, 'UTC') < todayStr
    )
  }

  return filtered.slice().sort((a, b) => {
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1
    if (a.dueDate === null && b.dueDate === null) return a.sortOrder - b.sortOrder
    if (a.dueDate === null) return 1
    if (b.dueDate === null) return -1
    return a.dueDate.getTime() - b.dueDate.getTime()
  })
}