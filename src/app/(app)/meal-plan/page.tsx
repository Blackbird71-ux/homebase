import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { MealPlanGrid } from '@/components/meal-plan/MealPlanGrid'
import { todayStringInTz } from '@/lib/timezone'
import { getLocalImageUrl } from '@/lib/image-cache'

function toYMDLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default async function MealPlanPage() {
  const userSession = await requireSession()
  // Fetch full user record to read uiPreferences
  const user = await prisma.user.findUnique({
    where: { id: userSession.id },
    select: { weekStartsOn: true, familyId: true, uiPreferences: true, family: { select: { timezone: true } } },
  })
  if (!user) return null
  const todayStr = todayStringInTz(user.family.timezone)
  const localToday = new Date(todayStr + 'T00:00:00')

  // Use today as the start date — not the start of the week.
  // The MealPlanGrid component will show `scope` number of days starting from today,
  // so the current day always appears at the top.
  const weekStart = localToday
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 29) // Fetch 30 days for scope support
  weekEnd.setHours(23, 59, 59, 999)

  // Convert to UTC for database query (database stores dates normalized to UTC)
  const weekStartUTC = new Date(
    Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate())
  )
  const weekEndUTC = new Date(
    Date.UTC(weekEnd.getUTCFullYear(), weekEnd.getUTCMonth(), weekEnd.getUTCDate(), 23, 59, 59, 999)
  )

  const entries = await prisma.mealPlan.findMany({
    where: {
      familyId: user.familyId,
      date: { gte: weekStartUTC, lte: weekEndUTC },
    },
    include: {
      recipes: {
        include: {
          recipe: { select: { id: true, title: true, image: true } },
        },
        orderBy: { order: 'asc' },
      },
      // Keep recipe for backward compatibility during transition
      recipe: { select: { id: true, title: true, image: true } },
    },
    orderBy: { date: 'asc' },
  })

  const serialized = entries.map((e) => ({
    id: e.id,
    date: e.date.toISOString(),
    mealType: e.mealType,
    recipeId: e.recipeId,
    recipe: e.recipe,
    note: e.note,
    familyId: e.familyId,
    // For backward compatibility, if there are no recipes but there's a recipeId, include it
    recipes: e.recipes.length > 0
      ? e.recipes.map(r => ({
          id: r.id,
          recipeId: r.recipeId,
          order: r.order,
          courseType: r.courseType,
          recipe: { id: r.recipe.id, title: r.recipe.title, image: getLocalImageUrl(r.recipe.image) },
        }))
      : e.recipeId && e.recipe
        ? [{
            id: 'legacy',
            recipeId: e.recipeId,
            order: 0,
            courseType: null,
            recipe: { id: e.recipe.id, title: e.recipe.title, image: getLocalImageUrl(e.recipe.image) },
          }]
        : [],
  }))

  // Read mealPlanLayout from uiPreferences JSON column
  let mealPlanLayout: 'single' | 'multi' = 'multi'
  if (user.uiPreferences) {
    try {
      const prefs = JSON.parse(user.uiPreferences as string)
      if (prefs?.mealPlanLayout === 'single') mealPlanLayout = 'single'
    } catch { /* ignore */ }
  }

  return (
    <MealPlanGrid
      weekStartsOn={user.weekStartsOn}
      initialWeekStart={toYMDLocal(weekStart)}
      initialEntries={serialized}
      timezone={user.family.timezone}
      mealPlanLayout={mealPlanLayout}
    />
  )
}