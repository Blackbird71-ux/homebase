import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { getLocalImageUrl } from '@/lib/image-cache'
import { todayBoundsInTz } from '@/lib/timezone'
import type { DashboardData, TodaysMeal } from '@/types'

/**
 * Normalize a date string to midnight UTC for meal plan queries.
 * This matches the normalization used in the meal plan API (POST /api/meal-plan).
 * Meal plans are stored at midnight UTC of the date they were created for.
 */
function normalizeToUtcMidnight(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00Z')
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

async function getDashboardData(familyId: string, timezone: string, preferredListId?: string | null): Promise<DashboardData> {
  // Get today's boundaries in the family's timezone
  const { start: todayStart, end: todayEnd } = todayBoundsInTz(timezone)
  const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000)

  // For meal plan queries, we need to match the storage normalization used by the meal plan API.
  // Meal plans are stored at midnight UTC of the date they were created for.
  // So we compute what "today" is in the family's timezone, then normalize to midnight UTC.
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date())
  const mealPlanTodayStart = normalizeToUtcMidnight(todayStr)
  const mealPlanTodayEnd = new Date(mealPlanTodayStart.getTime() + 24 * 60 * 60 * 1000)

  const [upcomingEvents, todayMealPlans, shoppingLists, todoLists] = await Promise.all([
    prisma.event.findMany({
      where: { familyId, start: { gte: todayStart } },
      orderBy: { start: 'asc' },
      take: 5,
    }),
    prisma.mealPlan.findMany({
      where: { familyId, date: { gte: mealPlanTodayStart, lt: mealPlanTodayEnd } },
      include: {
        recipe: { select: { id: true, title: true, image: true } },
        recipes: {
          include: { recipe: { select: { id: true, title: true, image: true } } },
          orderBy: { order: 'asc' },
        },
      },
    }),
    // Fetch up to 5 active shopping lists so we can fall back if the preferred one is gone
    prisma.list.findMany({
      where: { familyId, type: 'SHOPPING', isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        items: { where: { isCompleted: false }, orderBy: { sortOrder: 'asc' }, take: 3, select: { content: true } },
        _count: { select: { items: { where: { isCompleted: false } } } },
      },
      take: 5,
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

  // Map each meal type from today's meal plans.
  // Prefer the MealPlanRecipe junction table (recipes[]) which is the current storage;
  // fall back to the legacy recipeId/recipe field for older records.
  const mealByType = (type: string): TodaysMeal | null => {
    const m = todayMealPlans.find(p => p.mealType === type)
    if (!m) return null

    // Resolve recipe from junction table first, then legacy field
    const primaryRecipe = m.recipes?.[0]?.recipe ?? m.recipe ?? null
    const primaryRecipeImage = m.recipes?.[0]?.recipe?.image ?? m.recipe?.image ?? null

    // Build a display name: join multiple recipes with ' & ', or fall back to note
    const recipeNames = (m.recipes && m.recipes.length > 0)
      ? m.recipes.map(r => r.recipe?.title).filter(Boolean).join(' & ')
      : (m.recipe?.title ?? null)

    return {
      mealPlanId: m.id,
      mealType: m.mealType,
      recipeId: primaryRecipe?.id ?? null,
      recipeName: recipeNames || m.note || null,
      recipeImage: getLocalImageUrl(primaryRecipeImage ?? null),
      note: m.note,
    }
  }

  const dinnerMeal = mealByType('dinner')

  return {
    upcomingEvents: upcomingEvents.map(e => ({
      id: e.id, title: e.title,
      start: e.start.toISOString(), end: e.end.toISOString(),
      isAllDay: e.isAllDay, category: e.category, color: e.color,
    })),
    tonightsDinner: dinnerMeal,
    todaysMeals: {
      breakfast: mealByType('breakfast'),
      lunch: mealByType('lunch'),
      dinner: dinnerMeal,
      snacks: mealByType('snacks'),
    },
    shoppingList: (() => {
      const chosen = preferredListId
        ? (shoppingLists.find(l => l.id === preferredListId) ?? shoppingLists[0])
        : shoppingLists[0]
      return chosen ? {
        listId: chosen.id, listName: chosen.name,
        totalItems: chosen._count.items,
        pendingItems: chosen._count.items,
        firstItems: chosen.items.map(i => i.content),
      } : null
    })(),
    todoSummary: todoLists[0] ? {
      listId: todoLists[0].id, listName: todoLists[0].name,
      dueTodayCount: todoLists[0]._count.items,
      firstItems: todoLists[0].items.map(i => i.content),
    } : null,
  }
}

export default async function HomePage() {
  const user = await requireSession()
  const timezone = user.timezone

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { uiPreferences: true },
  })

  // Parse preferred dashboard shopping list from uiPreferences
  let preferredListId: string | null = null
  if (fullUser?.uiPreferences) {
    try {
      const prefs = JSON.parse(fullUser.uiPreferences)
      preferredListId = prefs.dashboardShoppingListId ?? null
    } catch {
      // ignore parse errors
    }
  }

  const data = await getDashboardData(user.familyId, timezone, preferredListId)

  return (
    <div className="flex flex-col h-full p-6 overflow-hidden">
      <h1 className="text-xl font-semibold mb-4 shrink-0">Home</h1>
      <div className="flex-1 overflow-hidden">
        <DashboardGrid data={data} timezone={timezone} />
      </div>
    </div>
  )
}
