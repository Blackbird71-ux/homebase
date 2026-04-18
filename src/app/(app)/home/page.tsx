import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import type { DashboardData } from '@/types'

async function getDashboardData(familyId: string): Promise<DashboardData> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
  const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [upcomingEvents, tonightsMeal, shoppingLists, todoLists] = await Promise.all([
    prisma.event.findMany({
      where: { familyId, start: { gte: now } },
      orderBy: { start: 'asc' },
      take: 5,
    }),
    prisma.mealPlan.findFirst({
      where: { familyId, date: { gte: todayStart, lt: todayEnd }, mealType: 'dinner' },
      include: { recipe: { select: { title: true } } },
    }),
    prisma.list.findMany({
      where: { familyId, type: 'SHOPPING', isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        items: { where: { isCompleted: false }, orderBy: { sortOrder: 'asc' }, take: 3, select: { content: true } },
        _count: { select: { items: { where: { isCompleted: false } } } },
      },
      take: 1,
    }),
    prisma.list.findMany({
      where: { familyId, type: 'TODO', isActive: true },
      include: {
        items: { where: { isCompleted: false, dueDate: { gte: todayStart, lt: weekEnd } }, orderBy: { dueDate: 'asc' }, take: 3, select: { content: true } },
        _count: { select: { items: { where: { isCompleted: false, dueDate: { gte: todayStart, lt: todayEnd } } } } },
      },
      take: 1,
    }),
  ])

  return {
    upcomingEvents: upcomingEvents.map(e => ({
      id: e.id, title: e.title,
      start: e.start.toISOString(), end: e.end.toISOString(),
      isAllDay: e.isAllDay, category: e.category, color: e.color,
    })),
    tonightsDinner: tonightsMeal ? {
      mealPlanId: tonightsMeal.id,
      recipeName: tonightsMeal.recipe?.title ?? null,
      note: tonightsMeal.note,
    } : null,
    shoppingList: shoppingLists[0] ? {
      listId: shoppingLists[0].id, listName: shoppingLists[0].name,
      totalItems: shoppingLists[0]._count.items,
      pendingItems: shoppingLists[0]._count.items,
      firstItems: shoppingLists[0].items.map(i => i.content),
    } : null,
    todoSummary: todoLists[0] ? {
      listId: todoLists[0].id, listName: todoLists[0].name,
      dueTodayCount: todoLists[0]._count.items,
      firstItems: todoLists[0].items.map(i => i.content),
    } : null,
  }
}

export default async function HomePage() {
  const user = await requireSession()
  const data = await getDashboardData(user.familyId)

  return (
    <div className="flex flex-col h-full p-6 overflow-hidden">
      <h1 className="text-xl font-semibold mb-4 shrink-0">Home</h1>
      <div className="flex-1 overflow-hidden">
        <DashboardGrid data={data} />
      </div>
    </div>
  )
}
