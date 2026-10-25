import { prisma } from '@/lib/prisma'

/** Server-only. Family-wide todo/packing list categories — separate from shopping IngredientCategory. */

export async function createListCategory(familyId: string, name: string, color: string | null) {
  const last = await prisma.listCategory.findFirst({
    where: { familyId },
    orderBy: { sortOrder: 'desc' },
  })
  return prisma.listCategory.create({
    data: { name, color, sortOrder: (last?.sortOrder ?? 0) + 10, familyId },
  })
}
