import { prisma } from '@/lib/prisma'

/** Server-only. */

/**
 * Reset a list for re-use: every item becomes not-completed. Nothing is deleted and
 * locked flags are untouched, so locked packing items survive to the next trip.
 */
export async function uncheckAllListItems(listId: string) {
  const { count } = await prisma.listItem.updateMany({
    where: { listId, isCompleted: true },
    data: { isCompleted: false },
  })
  return count
}
