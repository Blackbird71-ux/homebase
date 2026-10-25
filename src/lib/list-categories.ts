import { prisma } from '@/lib/prisma'
import { nextCategoryColor } from '@/lib/category-colors'

/** Server-only. Family-wide todo/packing list categories — separate from shopping IngredientCategory. */

export async function createListCategory(familyId: string, name: string, color: string | null) {
  const existing = await prisma.listCategory.findMany({
    where: { familyId },
    select: { color: true, sortOrder: true },
  })
  const last = Math.max(0, ...existing.map((c) => c.sortOrder))
  // No colour chosen → give it the next unused one so every category is visually distinct
  return prisma.listCategory.create({
    data: {
      name,
      color: color ?? nextCategoryColor(existing.map((c) => c.color)),
      sortOrder: last + 10,
      familyId,
    },
  })
}
