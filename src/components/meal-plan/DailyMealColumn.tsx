'use client'

import { useState } from 'react'
import { MealSlotCell } from './MealSlotCell'
import { MEAL_TYPES, type MealType } from '@/lib/meal-types'
import { cn } from '@/lib/utils'
import { PlusIcon, CheckIcon } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'

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
  newlyMovedEntryIds?: Set<string> // entry IDs that were just moved in
}

// ── Droppable meal slot wrapper ──

function DroppableMealSlot({
  date,
  mealType,
  entry,
  isNewlyMoved,
  selectMode,
  isSelected,
  onToggleMealSelect,
  onMealClick,
  onMealClear,
  onMealAddToGroceries,
  compact,
}: {
  date: string
  mealType: { id: MealType; label: string; icon: React.ComponentType<{ className?: string }> }
  entry: MealPlanEntry | undefined
  isNewlyMoved: boolean
  selectMode: boolean
  isSelected: boolean
  onToggleMealSelect?: (entryId: string) => void
  onMealClick: (date: string, mealType: MealType) => void
  onMealClear: (entryId: string) => void
  onMealAddToGroceries: (entryId: string) => void
  compact: boolean
}) {

  const droppableId = `${date}-${mealType.id}`
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: { date, mealType: mealType.id },
  })

  const Icon = mealType.icon
  const isEmpty = !entry || !entry.recipes || entry.recipes.length === 0

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col gap-0.5 rounded-lg transition-colors',
        compact ? '' : 'p-0.5 -mx-0.5',
        // In compact mode, empty slots show as thin dashed drop zones
        compact && isEmpty && !isOver && 'border border-dashed border-border/50 rounded-md px-1.5 py-1',
        compact && isEmpty && isOver && 'border-2 border-primary/40 border-dashed rounded-md px-2 py-1.5 bg-primary/5',
        !compact && isEmpty && 'p-0.5',
        isOver && !isEmpty && 'bg-primary/10 ring-2 ring-primary/40 ring-dashed'
      )}
    >
      <div className="flex items-center gap-0.5">
        {selectMode && entry && (
          <button
            type="button"
            onClick={() => onToggleMealSelect?.(entry.id)}
            className={cn(
              'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors mr-0.5',
              isSelected
                ? 'bg-primary border-primary text-primary-foreground'
                : 'border-muted-foreground/50'
            )}
          >
            {isSelected && <CheckIcon className="h-2.5 w-2.5" />}
          </button>
        )}
        <Icon className={cn(
          'shrink-0',
          compact && isEmpty ? 'h-2.5 w-2.5 text-muted-foreground/50' : 'h-2.5 w-2.5 text-muted-foreground'
        )} />
        <span className={cn(
          'text-[10px]',
          compact && isEmpty ? 'text-muted-foreground/50' : 'text-muted-foreground'
        )}>{mealType.label}</span>
        {compact && isEmpty && !isOver && (
          <span className="text-[9px] text-muted-foreground/30 ml-0.5">— drop recipe here</span>
        )}
        {compact && isEmpty && isOver && (
          <span className="text-[9px] text-primary/60 ml-0.5">— drop to add</span>
        )}
      </div>
      {!isEmpty && (
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
          naturalHeight={compact}
          isNewlyMoved={isNewlyMoved}
        />
      )}
    </div>
  )

}

// ── Main component ──

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
  newlyMovedEntryIds = new Set(),
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
    const allEmpty = recipeFilledMealTypes.length === 0

    return (
      <div className="flex flex-col gap-0.5">
        {/* Day header — horizontal for compact */}
        <div className="flex items-center gap-1.5">
          <div className={cn(
            "text-xs h-5 w-5 flex items-center justify-center rounded-full shrink-0",
            isToday ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground"
          )}>
            {new Date(date + 'T00:00:00').getDate()}
          </div>
          <p className={cn(
            "text-xs font-medium",
            isToday && "text-primary"
          )}>
            {new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' })}
          </p>
        </div>

        {/* Collapsed empty-day state — single add button when no meals at all */}
        {allEmpty ? (
          <div className="pl-0.5">
            {addMenuOpen ? (
              <div className="flex flex-wrap gap-1">
                {MEAL_TYPES.map((mt) => {
                  const Icon = mt.icon
                  return (
                    <button
                      key={mt.id}
                      onClick={() => { setAddMenuOpen(false); onMealClick(date, mt.id) }}
                      className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                    >
                      <Icon className="h-2.5 w-2.5" />
                      {mt.label}
                    </button>
                  )
                })}
                <button
                  onClick={() => setAddMenuOpen(false)}
                  className="text-[10px] px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddMenuOpen(true)}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
              >
                <PlusIcon className="h-3 w-3" />
                Add meals
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Meal slots — only show filled slots; empty ones are collapsed */}
            <div className="flex flex-col gap-0.5 pl-0.5">
              {recipeFilledMealTypes.map((mealType) => {
                const entry = getEntryForMealType(mealType.id)
                const isFilled = entry && entry.recipes && entry.recipes.length > 0
                const isSelected = entry ? selectedMealIds.has(entry.id) : false
                const isNewlyMoved = entry ? newlyMovedEntryIds.has(entry.id) : false

                return (
                  <DroppableMealSlot
                    key={mealType.id}
                    date={date}
                    mealType={mealType}
                    entry={entry ?? undefined}
                    isNewlyMoved={isNewlyMoved}
                    selectMode={selectMode}
                    isSelected={isSelected}
                    onToggleMealSelect={onToggleMealSelect}
                    onMealClick={onMealClick}
                    onMealClear={onMealClear}
                    onMealAddToGroceries={onMealAddToGroceries}
                    compact
                  />
                )
              })}
            </div>

            {/* Add meal — shows meal type picker inline */}
            {emptyMealTypes.length > 0 && (
              <div className="pl-0.5 relative">
                {addMenuOpen ? (
                  <div className="flex flex-wrap gap-1">
                    {emptyMealTypes.map((mt) => {
                      const Icon = mt.icon
                      return (
                        <button
                          key={mt.id}
                          onClick={() => { setAddMenuOpen(false); onMealClick(date, mt.id) }}
                          className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                        >
                          <Icon className="h-2.5 w-2.5" />
                          {mt.label}
                        </button>
                      )
                    })}
                    <button
                      onClick={() => setAddMenuOpen(false)}
                      className="text-[10px] px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddMenuOpen(true)}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                  >
                    <PlusIcon className="h-3 w-3" />
                    Add meal
                  </button>
                )}
              </div>
            )}
          </>
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
          const isNewlyMoved = entry ? newlyMovedEntryIds.has(entry.id) : false

          return (
            <DroppableMealSlot
              key={mealType.id}
              date={date}
              mealType={mealType}
              entry={entry ?? undefined}
              isNewlyMoved={isNewlyMoved}
              selectMode={false}
              isSelected={false}
              onMealClick={onMealClick}
              onMealClear={onMealClear}
              onMealAddToGroceries={onMealAddToGroceries}
              compact={false}
            />
          )
        })}
      </div>
    </div>
  )
}
