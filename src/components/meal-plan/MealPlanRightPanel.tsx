'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { MEAL_TYPES, getMealTypeColor } from '@/lib/meal-types'
import {
  LayoutDashboardIcon,
  SearchIcon,
  GripVerticalIcon,
  ClockIcon,
  UsersIcon,
  FlameIcon,
  CalendarOffIcon,
  ExternalLinkIcon,
} from 'lucide-react'
import { type MealPlanEntry } from '@/hooks/meal-plan/types'

// ── Types ──────────────────────────────────────────────────────────────────

interface RecipeSearchResult {
  id: string
  title: string
  prepTime: number | null
  cookTime: number | null
  servings: number | null
  calories: number | null
  image: string | null
  tags: string[]
}

interface MealPlanRightPanelProps {
  entries: MealPlanEntry[]
  selectedDate: string | null   // YYYY-MM-DD
  days: Date[]                  // all days in the current scope
  today: string                 // YYYY-MM-DD
  onViewRecipe?: (recipeId: string) => void
}

type PanelTab = 'overview' | 'search'

// ── Dot colour per meal type ──────────────────────────────────────────────

const MEAL_DOT_CLASSES: Record<string, string> = {
  breakfast: 'bg-amber-400',
  lunch:     'bg-blue-400',
  dinner:    'bg-purple-400',
  snacks:    'bg-green-400',
}

// ── Draggable recipe row (Find & drag tab) ────────────────────────────────

function DraggableRecipeRow({ recipe }: { recipe: RecipeSearchResult }) {
  const totalTime = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0)

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `search-recipe-${recipe.id}`,
    data: {
      type: 'search-recipe',
      recipeId: recipe.id,
      recipeName: recipe.title,
    },
  })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing select-none transition-colors',
        isDragging ? 'opacity-40 bg-primary/5' : 'hover:bg-muted/60'
      )}
    >
      {/* Thumbnail */}
      {recipe.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={recipe.image}
          alt=""
          className="h-7 w-7 rounded object-cover shrink-0"
        />
      ) : (
        <div className="h-7 w-7 rounded bg-muted shrink-0 flex items-center justify-center">
          <span className="text-[9px] text-muted-foreground font-medium">
            {recipe.title.slice(0, 2).toUpperCase()}
          </span>
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{recipe.title}</p>
        <p className="text-[10px] text-muted-foreground">
          {totalTime > 0 ? `${totalTime} min` : null}
          {totalTime > 0 && recipe.servings ? ' · ' : null}
          {recipe.servings ? `${recipe.servings} srv` : null}
          {!totalTime && !recipe.servings ? 'No details' : null}
        </p>
      </div>

      {/* Drag handle */}
      <GripVerticalIcon className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
    </div>
  )
}

// ── Recipe spotlight card (Overview tab) ──────────────────────────────────

function SpotlightRecipeCard({
  entry,
  onViewRecipe,
}: {
  entry: MealPlanEntry
  onViewRecipe?: (recipeId: string) => void
}) {
  const mealConfig = MEAL_TYPES.find(m => m.id === entry.mealType)
  const mealLabel = mealConfig?.label ?? entry.mealType
  const mealColor = getMealTypeColor(entry.mealType)

  // Use the first recipe for display
  const firstRecipe = entry.recipes?.[0]?.recipe ?? entry.recipe
  const allRecipes = entry.recipes?.length > 0
    ? entry.recipes
    : entry.recipe
      ? [{ id: 'legacy', recipeId: entry.recipe.id, order: 0, courseType: null, recipe: entry.recipe }]
      : []

  if (allRecipes.length === 0 && !entry.note) return null

  return (
    <div className={cn(
      'rounded-xl border overflow-hidden',
      'border-border bg-card',
    )}>
      {/* Meal type badge */}
      <div className={cn('px-3 py-1.5 flex items-center gap-1.5 text-[10px] font-medium border-b border-border/50', mealColor)}>
        {mealConfig && <mealConfig.icon className="h-2.5 w-2.5" />}
        {mealLabel}
      </div>

      <div className="p-2.5 flex flex-col gap-1.5">
        {/* Recipe list */}
        {allRecipes.map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            {r.recipe.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.recipe.image}
                alt=""
                className="h-8 w-8 rounded-md object-cover shrink-0"
              />
            ) : (
              <div className="h-8 w-8 rounded-md bg-muted shrink-0 flex items-center justify-center">
                <span className="text-[9px] text-muted-foreground font-medium">
                  {r.recipe.title.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              {r.courseType && (
                <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wide">{r.courseType}</p>
              )}
              <p className="text-xs font-medium truncate">{r.recipe.title}</p>
            </div>
            {onViewRecipe && (
              <button
                type="button"
                onClick={() => onViewRecipe(r.recipeId)}
                className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                title="View recipe"
              >
                <ExternalLinkIcon className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}

        {/* Note */}
        {entry.note && (
          <p className="text-[10px] text-muted-foreground italic">{entry.note}</p>
        )}
      </div>
    </div>
  )
}

// ── Overview tab ──────────────────────────────────────────────────────────

function OverviewTab({
  entries,
  selectedDate,
  days,
  today,
  onViewRecipe,
}: {
  entries: MealPlanEntry[]
  selectedDate: string | null
  days: Date[]
  today: string
  onViewRecipe?: (recipeId: string) => void
}) {
  // ── Week stats ──
  const totalSlots   = days.length * MEAL_TYPES.length
  const filledSlots  = entries.filter(e => (e.recipes?.length > 0) || e.recipe || e.note).length
  const coveragePct  = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0

  const breakfastCount = entries.filter(e => e.mealType === 'breakfast' && (e.recipes?.length > 0 || e.recipe)).length
  const lunchCount     = entries.filter(e => e.mealType === 'lunch'     && (e.recipes?.length > 0 || e.recipe)).length
  const dinnerCount    = entries.filter(e => e.mealType === 'dinner'    && (e.recipes?.length > 0 || e.recipe)).length

  // Days with no meals at all
  const daysWithMeals = new Set(entries.filter(e => e.recipes?.length > 0 || e.recipe || e.note).map(e => e.date.slice(0, 10)))
  const emptyDays = days.filter(d => {
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return !daysWithMeals.has(ymd)
  })

  // ── Spotlight: entries for the selected day ──
  const spotlightDate = selectedDate ?? today
  const spotlightEntries = entries
    .filter(e => e.date.slice(0, 10) === spotlightDate && (e.recipes?.length > 0 || e.recipe || e.note))
    .sort((a, b) => {
      const order = ['breakfast', 'lunch', 'dinner', 'snacks']
      return order.indexOf(a.mealType) - order.indexOf(b.mealType)
    })

  const spotlightDayObj = new Date(spotlightDate + 'T00:00:00')
  const spotlightLabel = spotlightDate === today
    ? 'Today'
    : spotlightDayObj.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })

  // ── Upcoming meals (next 5 filled entries from today onward) ──
  const upcomingEntries = entries
    .filter(e => {
      const d = e.date.slice(0, 10)
      return d >= today && (e.recipes?.length > 0 || e.recipe)
    })
    .sort((a, b) => a.date.localeCompare(b.date) || (['breakfast','lunch','dinner','snacks'].indexOf(a.mealType) - ['breakfast','lunch','dinner','snacks'].indexOf(b.mealType)))
    .slice(0, 5)

  return (
    <div className="flex flex-col gap-3">
      {/* Week coverage */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {days.length}‑day coverage
          </p>
          <p className="text-[10px] font-medium text-foreground">{filledSlots} / {totalSlots} slots</p>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${coveragePct}%` }}
          />
        </div>
      </div>

      {/* Mini stats grid */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-lg border border-border bg-background p-2">
          <p className="text-base font-semibold text-foreground leading-none">{breakfastCount}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Breakfasts</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-2">
          <p className="text-base font-semibold text-foreground leading-none">{lunchCount}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Lunches</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-2">
          <p className="text-base font-semibold text-foreground leading-none">{dinnerCount}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Dinners</p>
        </div>
        <div className={cn(
          'rounded-lg border p-2',
          emptyDays.length > 0 ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-background'
        )}>
          <p className={cn(
            'text-base font-semibold leading-none',
            emptyDays.length > 0 ? 'text-destructive' : 'text-foreground'
          )}>{emptyDays.length}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Empty days</p>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Day spotlight */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-foreground">{spotlightLabel}</p>
          {spotlightEntries.length > 0 && (
            <p className="text-[10px] text-muted-foreground">
              {spotlightEntries.length} meal{spotlightEntries.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {spotlightEntries.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-4 text-center">
            <CalendarOffIcon className="h-5 w-5 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">No meals planned</p>
            <p className="text-[10px] text-muted-foreground/60">Use Find & drag to add some</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {spotlightEntries.map(entry => (
              <SpotlightRecipeCard
                key={entry.id}
                entry={entry}
                onViewRecipe={onViewRecipe}
              />
            ))}
          </div>
        )}
      </div>

      {/* Coming up — only show if spotlight is not today or there are upcoming meals */}
      {upcomingEntries.length > 0 && spotlightDate !== today && (
        <>
          <div className="border-t border-border" />
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-2">Coming up</p>
            <div className="flex flex-col gap-1">
              {upcomingEntries.map(entry => {
                const entryDate = entry.date.slice(0, 10)
                const dateObj = new Date(entryDate + 'T00:00:00')
                const dateLabel = entryDate === today
                  ? 'Today'
                  : dateObj.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
                const mealConfig = MEAL_TYPES.find(m => m.id === entry.mealType)
                const firstRecipe = entry.recipes?.[0]?.recipe ?? entry.recipe
                const dotClass = MEAL_DOT_CLASSES[entry.mealType] ?? 'bg-muted-foreground'

                return (
                  <div key={entry.id} className="flex items-center gap-2 py-1 border-b border-border/50 last:border-0">
                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', dotClass)} />
                    {firstRecipe?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={firstRecipe.image} alt="" className="h-6 w-6 rounded object-cover shrink-0" />
                    ) : (
                      <div className="h-6 w-6 rounded bg-muted shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium truncate">
                        {firstRecipe?.title ?? entry.note ?? 'Meal'}
                        {(entry.recipes?.length ?? 0) > 1 && (
                          <span className="text-muted-foreground font-normal"> +{entry.recipes.length - 1}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[9px] text-muted-foreground">{dateLabel}</span>
                      <span className="text-[9px] text-muted-foreground/50">·</span>
                      <span className="text-[9px] text-muted-foreground">{mealConfig?.label ?? entry.mealType}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Find & drag tab ───────────────────────────────────────────────────────

function FindDragTab({ onAssignFromSearch }: { onAssignFromSearch?: (recipeId: string, recipeName: string) => void }) {
  const [search, setSearch] = useState('')
  const [recipes, setRecipes] = useState<RecipeSearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const fetchRecipes = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const url = q.trim() ? `/api/recipes?search=${encodeURIComponent(q.trim())}` : '/api/recipes'
      const data = await fetch(url).then(r => r.json())
      setRecipes(data)
    } catch {
      // silently ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchRecipes('')
  }, [fetchRecipes])

  useEffect(() => {
    const t = setTimeout(() => void fetchRecipes(search), 250)
    return () => clearTimeout(t)
  }, [search, fetchRecipes])

  // Group: first 5 are "recently added" (API returns newest first), rest are "all"
  const recentRecipes = recipes.slice(0, 5)
  const otherRecipes  = recipes.slice(5)

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Search input */}
      <div className="relative shrink-0">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search recipes…"
          className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Recipe list */}
      <div className="flex-1 overflow-y-auto -mx-1 px-1">
        {loading && recipes.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">Loading…</div>
        ) : recipes.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">No recipes found</div>
        ) : search.trim() ? (
          // When searching, show flat list
          <div className="flex flex-col">
            {recipes.map(r => <DraggableRecipeRow key={r.id} recipe={r} />)}
          </div>
        ) : (
          // Default: grouped
          <>
            {recentRecipes.length > 0 && (
              <>
                <p className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground px-2 mb-1">Recent</p>
                {recentRecipes.map(r => <DraggableRecipeRow key={r.id} recipe={r} />)}
              </>
            )}
            {otherRecipes.length > 0 && (
              <>
                <p className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground px-2 mb-1 mt-2">All recipes</p>
                {otherRecipes.map(r => <DraggableRecipeRow key={r.id} recipe={r} />)}
              </>
            )}
          </>
        )}
      </div>

      {/* Drag hint */}
      <div className="shrink-0 text-center py-2 px-3 rounded-lg border border-dashed border-border text-[10px] text-muted-foreground">
        <GripVerticalIcon className="h-3 w-3 inline-block mr-1 opacity-50" aria-hidden />
        Drag any recipe onto a day slot to assign it
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────

export function MealPlanRightPanel({
  entries,
  selectedDate,
  days,
  today,
  onViewRecipe,
}: MealPlanRightPanelProps) {
  const [tab, setTab] = useState<PanelTab>('overview')

  return (
    <div className="flex flex-col h-full border-l border-border bg-background">
      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-border">
        <button
          type="button"
          onClick={() => setTab('overview')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-b-2',
            tab === 'overview'
              ? 'text-primary border-primary'
              : 'text-muted-foreground border-transparent hover:text-foreground'
          )}
        >
          <LayoutDashboardIcon className="h-3.5 w-3.5" />
          Overview
        </button>
        <button
          type="button"
          onClick={() => setTab('search')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-b-2',
            tab === 'search'
              ? 'text-primary border-primary'
              : 'text-muted-foreground border-transparent hover:text-foreground'
          )}
        >
          <SearchIcon className="h-3.5 w-3.5" />
          Find &amp; drag
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'overview' ? (
          <OverviewTab
            entries={entries}
            selectedDate={selectedDate}
            days={days}
            today={today}
            onViewRecipe={onViewRecipe}
          />
        ) : (
          <FindDragTab />
        )}
      </div>
    </div>
  )
}
