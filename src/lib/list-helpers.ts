export type ShoppingCategory =
  | 'Produce'
  | 'Dairy'
  | 'Meat'
  | 'Bakery'
  | 'Frozen'
  | 'Household'
  | 'Other'

export const SHOPPING_CATEGORIES: ShoppingCategory[] = [
  'Produce',
  'Dairy',
  'Meat',
  'Bakery',
  'Frozen',
  'Household',
  'Other',
]

export interface ListItemShape {
  id: string
  content: string
  isCompleted: boolean
  category: string | null
  sortOrder: number
  dueDate: Date | null
  recipeId: string | null
  recipeName: string | null
  createdBy: string
  listId: string
  createdAt: Date
}

export interface RecipeGroup {
  name: string
  items: ListItemShape[]
}

/**
 * Group incomplete shopping items by category, sorted by sortOrder within each group.
 * Completed items are excluded — callers handle them separately (DoneSection).
 * categoryOrder controls the order of buckets; defaults to SHOPPING_CATEGORIES.
 */
export function groupByCategory(
  items: ListItemShape[],
  categoryOrder: string[] = SHOPPING_CATEGORIES
): Record<ShoppingCategory, ListItemShape[]> {
  const result: Record<ShoppingCategory, ListItemShape[]> = {
    Produce: [],
    Dairy: [],
    Meat: [],
    Bakery: [],
    Frozen: [],
    Household: [],
    Other: [],
  }
  for (const item of items) {
    if (item.isCompleted) continue
    const cat = (item.category as ShoppingCategory) ?? 'Other'
    const key: ShoppingCategory = result[cat] !== undefined ? cat : 'Other'
    result[key].push(item)
  }
  for (const cat of SHOPPING_CATEGORIES) {
    result[cat].sort((a, b) => a.sortOrder - b.sortOrder)
  }
  // categoryOrder param is used by ShoppingList to determine render order;
  // groupByCategory just populates buckets.
  void categoryOrder
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

export type TodoFilter = 'all' | 'today' | 'overdue'

/** Filter and sort todo items. */
export function filterTodoItems(
  items: ListItemShape[],
  filter: TodoFilter,
  now: Date = new Date()
): ListItemShape[] {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

  let filtered = items
  if (filter === 'today') {
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
