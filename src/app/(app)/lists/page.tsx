import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { ListsClient } from './ListsClient'

async function getLists(familyId: string) {
  return prisma.list.findMany({
    where: { familyId, isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { items: { where: { isCompleted: false } } } },
    },
  })
}

export default async function ListsPage() {
  const session = await requireSession()
  const [user, lists] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, uiPreferences: true },
    }),
    getLists(session.familyId),
  ])

  // Parse defaultListId from uiPreferences
  let defaultListId: string | null = null
  if (user?.uiPreferences) {
    try {
      const prefs = JSON.parse(user.uiPreferences)
      defaultListId = prefs.defaultListId ?? null
    } catch {
      // ignore parse errors
    }
  }

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

  return <ListsClient initialLists={serialized} defaultListId={defaultListId} currentUserId={session.id} />
}
