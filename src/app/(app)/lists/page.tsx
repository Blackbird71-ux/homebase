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
  type RawList = Awaited<ReturnType<typeof getLists>>[number]
  type RawItem = RawList['items'][number]

  const serialized = lists.map((l: RawList) => ({
    ...l,
    createdAt: l.createdAt.toISOString(),
    items: l.items.map((i: RawItem) => ({
      ...i,
      dueDate: i.dueDate ? i.dueDate.toISOString() : null,
      createdAt: i.createdAt.toISOString(),
    })),
  }))

  return <ListsClient initialLists={serialized} />
}
