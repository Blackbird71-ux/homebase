/** Client-safe. Palette for list categories and the "next unused colour" default. */

export const LIST_CATEGORY_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899',
]

/** First palette colour not already in use; cycles once all are taken. */
export function nextCategoryColor(used: (string | null | undefined)[]): string {
  const taken = new Set(used.filter(Boolean).map((c) => (c as string).toLowerCase()))
  return (
    LIST_CATEGORY_COLORS.find((c) => !taken.has(c)) ??
    LIST_CATEGORY_COLORS[taken.size % LIST_CATEGORY_COLORS.length]
  )
}
