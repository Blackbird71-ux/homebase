import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { ListsClient } from './ListsClient'

async function getLists(familyId: string) {
  return prisma.list.findMany({
    where: { familyId, isActive: true },
    orderBy: { createdAt: 'asc' },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { items: { where: { isCompleted: false } } } },
    },
  })
}

export default async function ListsPage() {
  const user = await requireSession()
  const lists = await getLists(user.familyId)

  // Serialize dates for client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serialized = (lists as any[]).map((l: any) => ({
    ...l,
    createdAt: (l.createdAt as Date).toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: (l.items as any[]).map((i: any) => ({
      ...i,
      dueDate: i.dueDate ? (i.dueDate as Date).toISOString() : null,
      createdAt: (i.createdAt as Date).toISOString(),
    })),
  }))

  return <ListsClient initialLists={serialized} />
}
