'use client'

import { MealSlotCell } from './MealSlotCell'
import { MEAL_TYPES, type MealType } from '@/lib/meal-types'
import { cn } from '@/lib/utils'

interface MealPlanEntry {
  id: string
  date: string // ISO string
  mealType: string
  recipeId: string | null
  recipe: { id: string; title: string } | null
  note: string | null
  familyId: string
  recipes: Array<{
    id: string
    recipeId: string
    order: number
    courseType: string | null
    recipe: { id: string; title: string }
  }>
}

interface DailyMealColumnProps {
  date: string // ISO date string YYYY-MM-DD
  entries: MealPlanEntry[]
  isToday: boolean
  onMealClick: (date: string, mealType: MealType) => void
  onMealClear: (entryId: string) => void
}

export function DailyMealColumn({
  date,
  entries,
  isToday,
  onMealClick,
  onMealClear,
}: DailyMealColumnProps) {
  const getEntryForMealType = (mealType: string) => {
    return entries.find((e) => e.mealType === mealType)
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Day header */}
      <div className={cn(
        "flex flex-col items-center gap-1 mb-2",
        isToday && "font-semibold"
      )}>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' })}
        </p>
        <p className={cn(
          "text-sm h-7 w-7 flex items-center justify-center rounded-full",
          isToday ? "bg-primary text-primary-foreground" : ""
        )}>
          {new Date(date + 'T00:00:00').getDate()}
        </p>
      </div>

      {/* Meal slots for each meal type */}
      <div className="flex flex-col gap-2">
        {MEAL_TYPES.map((mealType) => {
          const entry = getEntryForMealType(mealType.id)
          const Icon = mealType.icon
          
          return (
            <div key={mealType.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <Icon className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{mealType.label}</span>
              </div>
              <MealSlotCell
                date={date}
                mealPlanId={entry?.id ?? null}
                recipeName={entry?.recipe?.title ?? null}
                recipes={entry?.recipes?.map(r => ({
                  id: r.id,
                  recipeId: r.recipeId,
                  recipeName: r.recipe.title,
                  courseType: r.courseType ?? undefined,
                  order: r.order,
                }))}
                note={entry?.note ?? null}
                onClick={() => onMealClick(date, mealType.id)}
                onClear={() => entry && onMealClear(entry.id)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}