'use client'

/* eslint-disable no-restricted-syntax -- Meal-plan is an internally-consistent browser-local-time stack: the useMealPlanData hook + meal-plan/types.ts utils build and read local-midnight Dates, and every display rebuilds local midnight. A display-only UTC switch would shift dates a day for off-tz viewers; the whole stack must migrate together. Deferred — see DATE-DISPLAY-AUDIT.md "TripActivity time / meal-plan deferred stacks". */

import { useState } from 'react'
import { MealSlotCell } from './MealSlotCell'
import { MEAL_TYPES, type MealType } from '@/lib/meal-types'
import { cn } from '@/lib/utils'
import { PlusIcon, CheckIcon } from 'lucide-react'
import { useDroppable, useDndContext } from '@dnd-kit/core'

interface MealPlanEntry {
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

interface DailyMealColumnProps {
  date: string
  entries: MealPlanEntry[]
  isToday: boolean
  onMealClick: (date: string, mealType: MealType) => void
  onMealClear: (entryId: string) => void
  onRemoveRecipe?: (mealPlanRecipeId: string, mealPlanId: string) => void
  onMealAddToGroceries: (entryId: string) => void
  onViewRecipe?: (recipeId: string) => void
  selectMode?: boolean
  selectedMealIds?: Set<string>
  onToggleMealSelect?: (entryId: string) => void
  compact?: boolean
  singleColumn?: boolean
  newlyMovedEntryIds?: Set<string>
}

// ── Droppable meal slot wrapper ──────────────────────────────────────────

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
  onRemoveRecipe,
  onMealAddToGroceries,
  onViewRecipe,
  compact,
  isDragActive,
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
  onRemoveRecipe?: (mealPlanRecipeId: string, mealPlanId: string) => void
  onMealAddToGroceries: (entryId: string) => void
  onViewRecipe?: (recipeId: string) => void
  compact: boolean
  isDragActive: boolean
}) {
  const droppableId = `${date}-${mealType.id}`
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: { date, mealType: mealType.id },
  })

  const Icon = mealType.icon
  const isEmpty = !entry || !entry.recipes || entry.recipes.length === 0

  // Ghost drop zone: visible only while a drag is active and the slot is empty
  if (compact && isEmpty) {
    return (
      <div
        ref={setNodeRef}
        onClick={() => onMealClick(date, mealType.id)}
        className={cn(
          'flex items-center gap-1 rounded-md px-1.5 transition-all duration-150 cursor-pointer select-none',
          // Expand the hit area during drag so it's easy to drop onto
          isDragActive
            ? 'py-1.5 border border-dashed opacity-100'
            : 'py-0 border border-transparent opacity-0 pointer-events-none h-0 overflow-hidden',
          isOver
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border/50 text-muted-foreground/60 hover:border-border hover:text-muted-foreground',
        )}
        style={isDragActive ? undefined : { marginTop: 0, marginBottom: 0 }}
      >
        <Icon className="h-2.5 w-2.5 shrink-0" />
        <span className="text-[10px]">
          {isOver ? `Drop to add — ${mealType.label}` : mealType.label}
        </span>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col gap-0.5 rounded-lg transition-colors',
        compact ? '' : 'p-0.5 -mx-0.5',
        !compact && isEmpty && 'p-0.5',
        isOver && !isEmpty && 'bg-primary/10 ring-2 ring-primary/40 ring-dashed',
        isOver && isEmpty && 'bg-primary/5',
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
        <Icon className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground">{mealType.label}</span>
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
          onRemoveRecipe={entry ? (mealPlanRecipeId) => onRemoveRecipe?.(mealPlanRecipeId, entry.id) : undefined}
          onAddToGroceries={entry ? () => onMealAddToGroceries(entry.id) : undefined}
          onViewRecipe={onViewRecipe}
          naturalHeight={compact}
          isNewlyMoved={isNewlyMoved}
        />
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export function DailyMealColumn({
  date,
  entries,
  isToday,
  onMealClick,
  onMealClear,
  onRemoveRecipe,
  onMealAddToGroceries,
  onViewRecipe,
  selectMode = false,
  selectedMealIds = new Set(),
  onToggleMealSelect,
  compact = false,
  singleColumn = false,
  newlyMovedEntryIds = new Set(),
}: DailyMealColumnProps) {
  const [addMenuOpen, setAddMenuOpen] = useState(false)

  // Know when a drag is in progress so we can reveal ghost drop zones
  const { active } = useDndContext()
  const isDragActive = !!active

  const getEntryForMealType = (mealType: string) =>
    entries.find((e) => e.mealType === mealType)

  const emptyMealTypes = MEAL_TYPES.filter((mt) => !getEntryForMealType(mt.id))
  const recipeFilledMealTypes = MEAL_TYPES.filter((mt) => {
    const entry = getEntryForMealType(mt.id)
    return entry && entry.recipes && entry.recipes.length > 0
  })

  if (compact) {
    const allEmpty = recipeFilledMealTypes.length === 0

    // ── Single-column expanded layout ──────────────────────────────────
    if (singleColumn) {
      const dayDate = new Date(date + 'T00:00:00')

      return (
        <div className="flex gap-3">
          {/* Day label */}
          <div className="flex flex-col items-center justify-start pt-0.5 shrink-0 w-16">
            <span className={cn(
              'text-xs font-semibold uppercase tracking-wide leading-none',
              isToday ? 'text-primary' : 'text-muted-foreground'
            )}>{dayDate.toLocaleDateString(undefined, { weekday: 'short' })}</span>
            <span className={cn(
              'text-xl font-bold leading-tight tabular-nums',
              isToday ? 'text-primary' : 'text-foreground'
            )}>{dayDate.getDate()}</span>
            <span className="text-[9px] text-muted-foreground/60 leading-none mt-0.5">
              {dayDate.toLocaleDateString(undefined, { month: 'short' })}
            </span>
            {isToday && <div className="mt-1 h-1 w-1 rounded-full bg-primary" aria-hidden />}
          </div>

          {/* Meals */}
          <div className="flex-1 flex flex-col gap-1 min-w-0">
            {/* Ghost drop zones for empty slots — only visible during drag */}
            {MEAL_TYPES.map((mealType) => {
              const entry = getEntryForMealType(mealType.id)
              const isNewlyMoved = entry ? newlyMovedEntryIds.has(entry.id) : false
              const isSelected = entry ? selectedMealIds.has(entry.id) : false
              const isFilled = entry && entry.recipes && entry.recipes.length > 0

              if (!isFilled && !isDragActive) return null

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
                  onRemoveRecipe={onRemoveRecipe}
                  onMealAddToGroceries={onMealAddToGroceries}
                  onViewRecipe={onViewRecipe}
                  compact
                  isDragActive={isDragActive}
                />
              )
            })}

            {/* Add meal button — hidden during drag to reduce clutter */}
            {!isDragActive && (
              <>
                {allEmpty ? (
                  addMenuOpen ? (
                    <MealTypePicker
                      mealTypes={MEAL_TYPES as unknown as typeof emptyMealTypes}
                      date={date}
                      onPick={(mt) => { setAddMenuOpen(false); onMealClick(date, mt) }}
                      onCancel={() => setAddMenuOpen(false)}
                    />
                  ) : (
                    <button onClick={() => setAddMenuOpen(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors pt-1">
                      <PlusIcon className="h-3 w-3" /> Add meals
                    </button>
                  )
                ) : emptyMealTypes.length > 0 ? (
                  addMenuOpen ? (
                    <MealTypePicker
                      mealTypes={emptyMealTypes}
                      date={date}
                      onPick={(mt) => { setAddMenuOpen(false); onMealClick(date, mt) }}
                      onCancel={() => setAddMenuOpen(false)}
                    />
                  ) : (
                    <button onClick={() => setAddMenuOpen(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                      <PlusIcon className="h-3 w-3" /> Add meal
                    </button>
                  )
                ) : null}
              </>
            )}
          </div>
        </div>
      )
    }

    // ── Multi-column compact layout ────────────────────────────────────
    return (
      <div className="flex flex-col gap-0.5">
        {/* Day header */}
        <div className="flex items-center gap-1.5">
          <div className={cn(
            'text-xs h-5 w-5 flex items-center justify-center rounded-full shrink-0',
            isToday ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground'
          )}>
            {new Date(date + 'T00:00:00').getDate()}
          </div>
          <p className={cn('text-xs font-medium', isToday && 'text-primary')}>
            {new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' })}
          </p>
        </div>

        {/* All meal slots: filled ones always visible; empty ones visible only during drag */}
        <div className="flex flex-col gap-0.5 pl-0.5">
          {MEAL_TYPES.map((mealType) => {
            const entry = getEntryForMealType(mealType.id)
            const isFilled = entry && entry.recipes && entry.recipes.length > 0
            const isNewlyMoved = entry ? newlyMovedEntryIds.has(entry.id) : false
            const isSelected = entry ? selectedMealIds.has(entry.id) : false

            if (!isFilled && !isDragActive) return null

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
                onRemoveRecipe={onRemoveRecipe}
                onMealAddToGroceries={onMealAddToGroceries}
                onViewRecipe={onViewRecipe}
                compact
                isDragActive={isDragActive}
              />
            )
          })}
        </div>

        {/* Add meal — hidden during drag */}
        {!isDragActive && (
          <div className="pl-0.5">
            {allEmpty ? (
              addMenuOpen ? (
                <MealTypePicker
                  mealTypes={MEAL_TYPES as unknown as typeof emptyMealTypes}
                  date={date}
                  onPick={(mt) => { setAddMenuOpen(false); onMealClick(date, mt) }}
                  onCancel={() => setAddMenuOpen(false)}
                />
              ) : (
                <button onClick={() => setAddMenuOpen(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                  <PlusIcon className="h-3 w-3" /> Add meals
                </button>
              )
            ) : emptyMealTypes.length > 0 ? (
              addMenuOpen ? (
                <MealTypePicker
                  mealTypes={emptyMealTypes}
                  date={date}
                  onPick={(mt) => { setAddMenuOpen(false); onMealClick(date, mt) }}
                  onCancel={() => setAddMenuOpen(false)}
                />
              ) : (
                <button onClick={() => setAddMenuOpen(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                  <PlusIcon className="h-3 w-3" /> Add meal
                </button>
              )
            ) : null}
          </div>
        )}
      </div>
    )
  }

  // ── Desktop (non-compact) layout — always shows all slots ────────────
  return (
    <div className="flex flex-col gap-1">
      <div className={cn('flex flex-col items-center gap-1 mb-2', isToday && 'font-semibold')}>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' })}
        </p>
        <p className={cn(
          'text-sm h-7 w-7 flex items-center justify-center rounded-full',
          isToday ? 'bg-primary text-primary-foreground' : ''
        )}>
          {new Date(date + 'T00:00:00').getDate()}
        </p>
      </div>
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
              onRemoveRecipe={onRemoveRecipe}
              onMealAddToGroceries={onMealAddToGroceries}
              onViewRecipe={onViewRecipe}
              compact={false}
              isDragActive={isDragActive}
            />
          )
        })}
      </div>
    </div>
  )
}

// ── Shared meal type picker ───────────────────────────────────────────────

function MealTypePicker({
  mealTypes,
  date,
  onPick,
  onCancel,
}: {
  mealTypes: typeof MEAL_TYPES[number][]
  date: string
  onPick: (mealType: MealType) => void
  onCancel: () => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {mealTypes.map((mt) => {
        const Icon = mt.icon
        return (
          <button
            key={mt.id}
            onClick={() => onPick(mt.id)}
            className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border transition-colors hb-pill-inactive"
          >
            <Icon className="h-2.5 w-2.5" />
            {mt.label}
          </button>
        )
      })}
      <button onClick={onCancel} className="text-xs px-1.5 py-0.5 text-muted-foreground hover:text-foreground">
        Cancel
      </button>
    </div>
  )
}
