// Server-only: the family's "Groceries" shopping list, found-or-created.
// Shared by meal-plan grocery export and pantry to-shopping. The create is
// raced-safe: a concurrent create loses the unique race and re-reads.

import { prisma } from '@/lib/prisma'
import type { List } from '@prisma/client'

export async function ensureGroceriesList(familyId: string): Promise<List> {
  let list = await prisma.list.findFirst({
    where: { familyId, name: 'Groceries', type: 'SHOPPING', isActive: true },
  })
  if (!list) {
    try {
      list = await prisma.list.create({
        data: { name: 'Groceries', type: 'SHOPPING', familyId },
      })
    } catch {
      list = await prisma.list.findFirst({
        where: { familyId, name: 'Groceries', type: 'SHOPPING', isActive: true },
      })
      if (!list) throw new Error('Failed to find or create Groceries list')
    }
  }
  return list
}
