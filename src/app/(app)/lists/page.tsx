import { Suspense } from 'react'
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
    const [user, lists, members] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, uiPreferences: true },
    }),
    getLists(session.familyId),
    prisma.user.findMany({
      where: { familyId: session.familyId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  // Parse defaultListId and listOrder from uiPreferences
  let defaultListId: string | null = null
  let listOrder: string[] | null = null
  if (user?.uiPreferences) {
    try {
      const prefs = JSON.parse(user.uiPreferences)
      defaultListId = prefs.defaultListId ?? null
      listOrder = Array.isArray(prefs.listOrder) ? prefs.listOrder : null
    } catch {
      // ignore parse errors
    }
  }

  // Apply per-user list order if set
  const orderedLists = listOrder
    ? [...lists].sort((a, b) => {
        const ai = listOrder!.indexOf(a.id)
        const bi = listOrder!.indexOf(b.id)
        if (ai === -1 && bi === -1) return a.sortOrder - b.sortOrder
        if (ai === -1) return 1
        if (bi === -1) return -1
        return ai - bi
      })
    : lists

  // Serialize dates for client
  type RawList = Awaited<ReturnType<typeof getLists>>[number]
  type RawItem = RawList['items'][number]

  const serialized = orderedLists.map((l: RawList) => ({
    ...l,
    createdAt: l.createdAt.toISOString(),
    items: l.items.map((i: RawItem) => ({
      ...i,
      dueDate: i.dueDate ? i.dueDate.toISOString() : null,
      createdAt: i.createdAt.toISOString(),
      assignedToUserId: i.assignedToUserId ?? null,
    })),
  }))

  return (
    <Suspense>
      <ListsClient initialLists={serialized} defaultListId={defaultListId} currentUserId={session.id} members={members} />
    </Suspense>
  )
}
