import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { mergeDashboardCards, type DashboardCardConfig } from '@/lib/dashboard-cards'
import { getDashboardData } from '@/lib/dashboard-data'
import { HomeClient } from './HomeClient'

export default async function HomePage() {
  const user = await requireSession()
  const timezone = user.timezone

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { uiPreferences: true },
  })

  // Parse dashboardCards, dashboardShoppingListId, dashboardTodoListId and dashboardCardLayouts from uiPreferences
  let dashboardCards: DashboardCardConfig[] | null = null
  let dashboardShoppingListId: string | null = null
  let dashboardTodoListId: string | null = null
  let dashboardCardLayouts: Record<string, { x: number; y: number; width: number; height: number | 'auto' }> | null = null
  let listOrder: string[] | null = null
  let dashboardScope: 7 | 14 | 30 = 7
  let dashboardChoreShowOnlyMine: boolean = false
  if (fullUser?.uiPreferences) {
    try {
      const prefs = JSON.parse(fullUser.uiPreferences)
      dashboardCards = prefs.dashboardCards ?? null
      dashboardShoppingListId = prefs.dashboardShoppingListId ?? null
      dashboardTodoListId = prefs.dashboardTodoListId ?? null
      dashboardCardLayouts = prefs.dashboardCardLayouts ?? null
      listOrder = Array.isArray(prefs.listOrder) ? prefs.listOrder : null
      if (prefs.dashboardScope && [7, 14, 30].includes(prefs.dashboardScope)) {
        dashboardScope = prefs.dashboardScope as 7 | 14 | 30
      }
      if (typeof prefs.dashboardChoreShowOnlyMine === 'boolean') {
        dashboardChoreShowOnlyMine = prefs.dashboardChoreShowOnlyMine
      }
    } catch {
      // ignore parse errors
    }
  }

  const cards = mergeDashboardCards(dashboardCards)
  const [data, availableTodoLists, availableShoppingLists] = await Promise.all([
    getDashboardData({
      familyId: user.familyId,
      userId: user.id,
      timezone,
      scope: dashboardScope,
      dashboardShoppingListId,
      dashboardTodoListId,
      // First paint only needs data for the cards on screen
      visibleCardIds: new Set(cards.filter((c) => c.visible).map((c) => c.id)),
    }),
    prisma.list.findMany({
      where: { familyId: user.familyId, type: 'TODO', isActive: true },
      select: { id: true, name: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.list.findMany({
      where: { familyId: user.familyId, type: 'SHOPPING', isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  // Apply per-user list order to the todo list dropdown
  const orderedTodoLists = (listOrder
    ? [...availableTodoLists].sort((a, b) => {
        const ai = listOrder!.indexOf(a.id)
        const bi = listOrder!.indexOf(b.id)
        if (ai === -1 && bi === -1) return a.sortOrder - b.sortOrder
        if (ai === -1) return 1
        if (bi === -1) return -1
        return ai - bi
      })
    : availableTodoLists
  ).map(({ id, name }) => ({ id, name }))

  return (
    <HomeClient
      data={data}
      userName={user.name}
      timezone={timezone}
      initialCards={cards}
      initialLayouts={dashboardCardLayouts}
      dashboardShoppingListId={dashboardShoppingListId}
      availableShoppingLists={availableShoppingLists}
      dashboardTodoListId={dashboardTodoListId}
      availableTodoLists={orderedTodoLists}
      dashboardScope={dashboardScope}
      dashboardChoreShowOnlyMine={dashboardChoreShowOnlyMine}
    />
  )
}
