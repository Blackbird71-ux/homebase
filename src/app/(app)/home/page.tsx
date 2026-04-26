import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { getLocalImageUrl } from '@/lib/image-cache'
import type { DashboardData } from '@/types'

async function getDashboardData(familyId: string, timezone: string): Promise<DashboardData> {
  const now = new Date()
  // Compute today's date in the family's timezone
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date())
  const [year, month, day] = todayStr.split('-').map(Number)
  const todayStart = new Date(Date.UTC(year, month - 1, day))
  const todayEnd = new Date(Date.UTC(year, month - 1, day + 1))
  const weekEnd = new Date(Date.UTC(year, month - 1, day + 7))

  const [upcomingEvents, tonightsMeal, shoppingLists, todoLists] = await Promise.all([
    prisma.event.findMany({
      where: { familyId, start: { gte: now } },
      orderBy: { start: 'asc' },
      take: 5,
    }),
    prisma.mealPlan.findFirst({
      where: { familyId, date: { gte: todayStart, lt: todayEnd }, mealType: 'dinner' },
      include: { recipe: { select: { id: true, title: true, image: true } } },
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
      recipeId: tonightsMeal.recipe?.id ?? null,
      recipeName: tonightsMeal.recipe?.title ?? null,
      recipeImage: getLocalImageUrl(tonightsMeal.recipe?.image ?? null),
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
  const family = await prisma.family.findUnique({
    where: { id: user.familyId },
    select: { timezone: true },
  })
  const timezone = family?.timezone ?? 'UTC'
  const data = await getDashboardData(user.familyId, timezone)

  return (
    <div className="flex flex-col h-full p-6 overflow-hidden">
      <h1 className="text-xl font-semibold mb-4 shrink-0">Home</h1>
      <div className="flex-1 overflow-hidden">
        <DashboardGrid data={data} />
      </div>
    </div>
  )
}
