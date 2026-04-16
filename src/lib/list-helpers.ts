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
  createdBy: string
  listId: string
  createdAt: Date
}

/** Group shopping items by category. Completed items sorted last within each group. */
export function groupByCategory(
  items: ListItemShape[]
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
    const cat = (item.category as ShoppingCategory) ?? 'Other'
    const key: ShoppingCategory = result[cat] !== undefined ? cat : 'Other'
    result[key].push(item)
  }
  // Sort each bucket: incomplete first, then by sortOrder
  for (const cat of SHOPPING_CATEGORIES) {
    result[cat].sort((a, b) => {
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1
      return a.sortOrder - b.sortOrder
    })
  }
  return result
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
    // Completed last
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1
    // Null dueDate last
    if (a.dueDate === null && b.dueDate === null) return a.sortOrder - b.sortOrder
    if (a.dueDate === null) return 1
    if (b.dueDate === null) return -1
    return a.dueDate.getTime() - b.dueDate.getTime()
  })
}
