import { prisma } from '@/lib/prisma'
import type { BulkChange } from '@/lib/list-bulk-helpers'

/** Server-only. Applies one change to many items of a list. Returns how many changed and how many were skipped (locked, on delete). */
export async function bulkUpdateListItems(listId: string, ids: string[], change: BulkChange) {
  const where = { listId, id: { in: ids } }
  switch (change.type) {
    case 'category': {
      const r = await prisma.listItem.updateMany({ where, data: { category: change.category } })
      return { changed: r.count, skipped: 0 }
    }
    case 'lock':
    case 'unlock': {
      const r = await prisma.listItem.updateMany({ where, data: { isLocked: change.type === 'lock' } })
      return { changed: r.count, skipped: 0 }
    }
    case 'delete': {
      const r = await prisma.listItem.deleteMany({ where: { ...where, isLocked: false } })
      const lockedLeft = await prisma.listItem.count({ where })
      return { changed: r.count, skipped: lockedLeft }
    }
  }
}
