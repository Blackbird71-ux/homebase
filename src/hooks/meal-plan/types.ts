export interface MealPlanEntry {
  id: string
  date: string
  mealType: string
  recipeId: string | null
  recipe: { id: string; title: string; image: string | null } | null
  note: string | null
  familyId: string
  recipes: Array<{
    id: string
    recipeId: string
    order: number
    courseType: string | null
    recipe: { id: string; title: string; image: string | null }
  }>
}

export type ScopeDays = 7 | 14 | 30

export function getScopeDays(startDate: Date, scope: ScopeDays): Date[] {
  return Array.from({ length: scope }, (_, i) => {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    return d
  })
}

export function toYMD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function scopeDateRange(startDate: Date, scope: ScopeDays): { from: string; to: string } {
  const fromLocal = new Date(startDate)
  fromLocal.setHours(0, 0, 0, 0)
  const from = new Date(Date.UTC(
    fromLocal.getFullYear(), fromLocal.getMonth(), fromLocal.getDate()
  )).toISOString().slice(0, 10)

  const toDateLocal = new Date(startDate)
  toDateLocal.setDate(toDateLocal.getDate() + scope - 1)
  const to = new Date(Date.UTC(
    toDateLocal.getFullYear(), toDateLocal.getMonth(), toDateLocal.getDate(),
    23, 59, 59, 999
  )).toISOString().slice(0, 10)

  return { from, to }
}
