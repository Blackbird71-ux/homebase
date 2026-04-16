import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { MealPlanGrid } from '@/components/meal-plan/MealPlanGrid'
import { todayStringInTz } from '@/lib/timezone'

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

export default async function MealPlanPage() {
  const user = await requireSession()
  const todayStr = todayStringInTz(user.timezone)
  const localToday = new Date(todayStr + 'T00:00:00')
  const weekStart = startOfWeek(localToday, user.weekStartsOn)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  const entries = await prisma.mealPlan.findMany({
    where: {
      familyId: user.familyId,
      date: { gte: weekStart, lte: weekEnd },
    },
    include: { recipe: { select: { id: true, title: true } } },
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
  }))

  return (
    <MealPlanGrid
      weekStartsOn={user.weekStartsOn}
      initialWeekStart={toYMD(weekStart)}
      initialEntries={serialized}
      timezone={user.timezone}
    />
  )
}
