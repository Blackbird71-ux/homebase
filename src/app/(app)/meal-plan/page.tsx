import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { MealPlanGrid } from '@/components/meal-plan/MealPlanGrid'
import { todayStringInTz } from '@/lib/timezone'
import { getLocalImageUrl } from '@/lib/image-cache'

function startOfWeek(date: Date, weekStartsOn: number): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day - weekStartsOn + 7) % 7
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function toYMD(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function toYMDLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default async function MealPlanPage() {
  const user = await requireSession()
  const todayStr = todayStringInTz(user.timezone)
  const localToday = new Date(todayStr + 'T00:00:00')
  const weekStart = startOfWeek(localToday, user.weekStartsOn)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
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

  return (
    <MealPlanGrid
      weekStartsOn={user.weekStartsOn}
      initialWeekStart={toYMDLocal(weekStart)}
      initialEntries={serialized}
      timezone={user.timezone}
    />
  )
}
