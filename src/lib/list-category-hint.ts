import { prisma } from '@/lib/prisma'

/**
 * Suggests a category for a to-do list item from where the family has filed the
 * same item before (most recent wins), restricted to the categories this list
 * uses. The to-do-list counterpart of the shopping list's auto-categorise: any
 * manual override is "learned" for free because it is stored on the item.
 */
export async function suggestListCategory(
  familyId: string,
  content: string,
  allowed: string[],
): Promise<string | null> {
  const needle = content.trim().toLowerCase()
  if (!needle || allowed.length === 0) return null

  // SQLite LIKE is case-insensitive; narrow with it, then require an exact match.
  const rows = await prisma.listItem.findMany({
    where: {
      content: { contains: needle },
      category: { in: allowed },
      list: { familyId, type: { not: 'shopping' } },
    },
    orderBy: { createdAt: 'desc' },
    select: { content: true, category: true },
    take: 50,
  })
  return rows.find((r) => r.content.trim().toLowerCase() === needle)?.category ?? null
}
