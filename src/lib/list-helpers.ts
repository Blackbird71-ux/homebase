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

/** Filter and sort todo items. */
export function filterTodoItems(
  items: ListItemShape[],
  filter: TodoFilter,
  now: Date = new Date()
): ListItemShape[] {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

  let filtered = items
  if (filter === 'mine') {
    // "mine" shows items assigned to the current user — filtering happens in TodoList
    // since we don't have currentUserId here; just return all items sorted
  } else if (filter === 'today') {
    filtered = items.filter(
      (i) =>
        !i.isCompleted &&
        i.dueDate !== null &&
        i.dueDate >= todayStart &&
        i.dueDate < todayEnd
    )
  } else if (filter === 'overdue') {
    filtered = items.filter(
      (i) => !i.isCompleted && i.dueDate !== null && i.dueDate < todayStart
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