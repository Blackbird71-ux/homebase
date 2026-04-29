'use client'

import { useState } from 'react'
import { MealSlotCell } from './MealSlotCell'
import { MEAL_TYPES, type MealType } from '@/lib/meal-types'
import { cn } from '@/lib/utils'
import { PlusIcon, CheckIcon } from 'lucide-react'

interface MealPlanEntry {
  id: string
  date: string // ISO string
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

interface DailyMealColumnProps {
  date: string // ISO date string YYYY-MM-DD
  entries: MealPlanEntry[]
  isToday: boolean
  onMealClick: (date: string, mealType: MealType) => void
  onMealClear: (entryId: string) => void
  onMealAddToGroceries: (entryId: string) => void
  selectMode?: boolean
  selectedMealIds?: Set<string>
  onToggleMealSelect?: (entryId: string) => void
  compact?: boolean // mobile: hide empty slots, natural height
}

export function DailyMealColumn({
  date,
  entries,
  isToday,
  onMealClick,
  onMealClear,
  onMealAddToGroceries,
  selectMode = false,
  selectedMealIds = new Set(),
  onToggleMealSelect,
  compact = false,
}: DailyMealColumnProps) {
  const [addMenuOpen, setAddMenuOpen] = useState(false)

  const getEntryForMealType = (mealType: string) => {
    return entries.find((e) => e.mealType === mealType)
  }

  const emptyMealTypes = MEAL_TYPES.filter((mt) => !getEntryForMealType(mt.id))
  const recipeFilledMealTypes = MEAL_TYPES.filter((mt) => {
    const entry = getEntryForMealType(mt.id)
    return entry && entry.recipes && entry.recipes.length > 0
  })

  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        {/* Day header — horizontal for compact */}
        <div className="flex items-center gap-2">
          <div className={cn(
            "text-sm h-7 w-7 flex items-center justify-center rounded-full shrink-0",
            isToday ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground"
          )}>
            {new Date(date + 'T00:00:00').getDate()}
          </div>
          <p className={cn(
            "text-sm font-medium",
            isToday && "text-primary"
          )}>
            {new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long' })}
          </p>
        </div>

        {/* Filled meal slots with natural height — only those with a recipe */}
        {recipeFilledMealTypes.length > 0 && (
          <div className="flex flex-col gap-2 pl-1">
            {recipeFilledMealTypes.map((mealType) => {
              const entry = getEntryForMealType(mealType.id)!
              const Icon = mealType.icon
              const isSelected = selectedMealIds.has(entry.id)
              return (
                <div key={mealType.id} className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    {selectMode && (
                      <button
                        type="button"
                        onClick={() => onToggleMealSelect?.(entry.id)}
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors mr-1',
                          isSelected
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-muted-foreground/50'
                        )}
                      >
                        {isSelected && <CheckIcon className="h-3 w-3" />}
                      </button>
                    )}
                    <Icon className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{mealType.label}</span>
                  </div>
                  <MealSlotCell
                    date={date}
                    mealPlanId={entry.id}
                    recipeName={entry.recipe?.title ?? null}
                    recipes={entry.recipes?.map(r => ({
                      id: r.id,
                      recipeId: r.recipeId,
                      recipeName: r.recipe.title,
                      imageUrl: r.recipe.image,
                      courseType: r.courseType ?? undefined,
                      order: r.order,
                    }))}
                    note={entry.note}
                    mealType={mealType.id}
                    onClick={() => !selectMode && onMealClick(date, mealType.id)}
                    onClear={() => !selectMode && onMealClear(entry.id)}
                    onAddToGroceries={() => !selectMode && onMealAddToGroceries(entry.id)}
                    naturalHeight
                  />
                </div>
              )
            })}
          </div>
        )}

        {/* No meals state + add button */}
        {recipeFilledMealTypes.length === 0 && (
          <p className="text-xs text-muted-foreground italic pl-1">No meals planned</p>
        )}

        {/* Add meal — shows meal type picker inline */}
        {emptyMealTypes.length > 0 && (
          <div className="pl-1 relative">
            {addMenuOpen ? (
              <div className="flex flex-wrap gap-1.5">
                {emptyMealTypes.map((mt) => {
                  const Icon = mt.icon
                  return (
                    <button
                      key={mt.id}
                      onClick={() => { setAddMenuOpen(false); onMealClick(date, mt.id) }}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                    >
                      <Icon className="h-3 w-3" />
                      {mt.label}
                    </button>
                  )
                })}
                <button
                  onClick={() => setAddMenuOpen(false)}
                  className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddMenuOpen(true)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Add meal
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // Desktop layout
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
                  imageUrl: r.recipe.image,
                  courseType: r.courseType ?? undefined,
                  order: r.order,
                }))}
                note={entry?.note ?? null}
                mealType={mealType.id}
                onClick={() => onMealClick(date, mealType.id)}
                onClear={() => entry && onMealClear(entry.id)}
                onAddToGroceries={entry ? () => onMealAddToGroceries(entry.id) : undefined}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
