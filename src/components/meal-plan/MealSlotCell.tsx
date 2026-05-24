'use client'

import { PlusIcon, XIcon, ShoppingCartIcon, GripVerticalIcon, EyeIcon, ChefHatIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getMealTypeColor } from '@/lib/meal-types'
import { useDraggable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

interface MealSlotCellProps {
  date: string // ISO date string YYYY-MM-DD
  mealPlanId: string | null
  recipeName: string | null // For backward compatibility
  recipes?: Array<{
    id: string
    recipeId: string
    recipeName: string
    imageUrl?: string | null
    courseType?: string
    order: number
  }>
  note: string | null
  mealType?: string
  onClick: () => void
  onClear: () => void
  onRemoveRecipe?: (mealPlanRecipeId: string) => void
  onAddToGroceries?: () => void
  onViewRecipe?: (recipeId: string) => void
  naturalHeight?: boolean // mobile: remove fixed h-16 and line-clamp
  isDragOverlay?: boolean // whether this is being rendered as a drag preview
  isNewlyMoved?: boolean // highlight recipes that were just moved in
}

export function MealSlotCell({
  date,
  mealPlanId,
  recipeName,
  recipes,
  note,
  mealType = 'dinner',
  onClick,
  onClear,
  onRemoveRecipe,
  onAddToGroceries,
  onViewRecipe,
  naturalHeight = false,
  isDragOverlay = false,
  isNewlyMoved = false,
}: MealSlotCellProps) {
  const router = useRouter()

  const hasRecipes = recipes && recipes.length > 0
  const hasRecipeName = recipeName && recipeName.trim() !== ''
  const hasNote = note && note.trim() !== ''

  const sortedRecipes = hasRecipes ? [...recipes].sort((a, b) => a.order - b.order) : []
  const firstImage = sortedRecipes.find(r => r.imageUrl)?.imageUrl ?? null

  // Draggable setup — only for filled slots with a single recipe (backward compat)
  const isDraggable = !!mealPlanId && !isDragOverlay && sortedRecipes.length <= 1
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: mealPlanId ?? '',
    data: {
      type: 'entry',
      date,
      mealType,
      mealPlanId,
      recipeName,
      recipes: sortedRecipes,
      note,
    },
    disabled: !isDraggable,
  })

  const style = transform && !isDragOverlay
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
      }
    : undefined

  let displayContent: React.ReactNode = null

  if (hasRecipes) {
    displayContent = (
      <div className="space-y-0">
        {sortedRecipes.map((recipe) => {
          // Each individual recipe is draggable when there are multiple recipes
          const isMultiRecipe = sortedRecipes.length > 1
          return isMultiRecipe ? (
            <DraggableRecipeItem
              key={recipe.id}
              recipe={recipe}
              date={date}
              mealType={mealType}
              mealPlanId={mealPlanId!}
              naturalHeight={naturalHeight}
              isNewlyMoved={isNewlyMoved}
              onViewRecipe={onViewRecipe}
              onRemove={onRemoveRecipe ? () => onRemoveRecipe(recipe.id) : undefined}
            />
          ) : (
            <div key={recipe.id} className="flex items-start gap-0.5">
              {recipe.courseType && (
                <span className="text-[9px] font-medium text-muted-foreground shrink-0">
                  {recipe.courseType}:
                </span>
              )}
              <span className={cn(
                'text-xs font-medium',
                naturalHeight ? '' : 'line-clamp-1',
                isNewlyMoved && 'text-primary'
              )}>
                {recipe.recipeName}
              </span>
            </div>
          )
        })}
        {hasNote && (
          <div className={cn(
            'text-[9px] text-muted-foreground italic',
            naturalHeight ? '' : 'line-clamp-1'
          )}>
            {note}
          </div>
        )}
      </div>
    )
  } else if (hasRecipeName) {
    displayContent = (
      <div className="space-y-0">
        <p className={cn(
          'text-xs font-medium',
          naturalHeight ? '' : 'line-clamp-2',
          isNewlyMoved && 'text-primary'
        )}>{recipeName}</p>
        {hasNote && (
          <div className={cn(
            'text-[9px] text-muted-foreground italic',
            naturalHeight ? '' : 'line-clamp-1'
          )}>
            {note}
          </div>
        )}
      </div>
    )
  } else if (hasNote) {
    displayContent = (
      <p className={cn(
        'text-xs font-medium italic',
        naturalHeight ? '' : 'line-clamp-3',
        isNewlyMoved && 'text-primary'
      )}>{note}</p>
    )
  }

  const mealColor = getMealTypeColor(mealType)
  const hasContent = hasRecipes || hasRecipeName || hasNote
  // On mobile (naturalHeight), action buttons are always visible; on desktop, hover-only
  const btnVisibility = naturalHeight
    ? 'shrink-0 text-muted-foreground'
    : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 shrink-0 text-muted-foreground'

  if (!hasContent) {
    return (
      <button
        onClick={onClick}
        className={cn(
          'w-full h-8 flex items-center justify-center rounded-lg border transition-colors hb-pill-inactive',
          mealColor
        )}
        aria-label="Add meal"
      >
        <PlusIcon className="h-3 w-3" />
      </button>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative w-full rounded-lg border bg-card px-1.5 py-0.5 flex items-start gap-1 cursor-pointer transition-colors',
        naturalHeight ? 'min-h-[1.75rem]' : 'h-12',
        isDragging ? 'opacity-30 border-primary/30' : 'hover:border-primary/50',
        isDragOverlay ? 'shadow-xl border-primary/50 bg-card rotate-2 scale-105' : 'border-border',
        isNewlyMoved && 'border-primary/40 bg-primary/5 ring-1 ring-primary/20',
        mealColor
      )}
      onClick={isDragging ? undefined : onClick}
      {...(isDraggable ? { ...listeners, ...attributes } : {})}
    >
      {/* Drag handle indicator — only for single-recipe entries */}
      {isDraggable && !isDragOverlay && (
        <div className="absolute -left-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVerticalIcon className="h-3 w-3 text-muted-foreground/50" />
        </div>
      )}

      {/* Newly moved badge */}
      {isNewlyMoved && (
        <div className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-primary border-2 border-background" title="Recently moved" />
      )}

      {/* Thumbnail — first recipe image */}
      {firstImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={firstImage}
          alt=""
          className="h-3.5 w-3.5 rounded object-cover shrink-0 mt-0"
        />
      )}

      {/* Recipe text */}
      <div className="flex-1 overflow-hidden min-w-0">
        {displayContent}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-0 shrink-0">
        {onViewRecipe && hasRecipes && sortedRecipes.length === 1 && (
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn(btnVisibility, 'hover:text-primary')}
            onClick={(e) => {
              e.stopPropagation()
              onViewRecipe(sortedRecipes[0].recipeId)
            }}
            aria-label="View recipe"
            title="View recipe"
          >
            <EyeIcon className="h-2.5 w-2.5" />
          </Button>
        )}
        {hasRecipes && sortedRecipes.length === 1 && (
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn(btnVisibility, 'hover:text-primary')}
            onClick={(e) => {
              e.stopPropagation()
              router.push(`/recipes/${sortedRecipes[0].recipeId}?cooking=true`)
            }}
            aria-label="Start cooking"
            title="Start cooking"
          >
            <ChefHatIcon className="h-2.5 w-2.5" />
          </Button>
        )}
        {onAddToGroceries && hasRecipes && (
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn(btnVisibility, 'hover:text-primary')}
            onClick={(e) => {
              e.stopPropagation()
              onAddToGroceries()
            }}
            aria-label="Add to groceries"
            title="Add to groceries"
          >
            <ShoppingCartIcon className="h-2.5 w-2.5" />
          </Button>
        )}
        {mealPlanId && (
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn(btnVisibility, 'hover:text-destructive')}
            onClick={(e) => {
              e.stopPropagation()
              onClear()
            }}
            aria-label="Clear meal"
          >
            <XIcon className="h-2.5 w-2.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Draggable individual recipe item (for multi-recipe slots) ──

function DraggableRecipeItem({
  recipe,
  date,
  mealType,
  mealPlanId,
  naturalHeight,
  isNewlyMoved,
  onViewRecipe,
  onRemove,
}: {
  recipe: { id: string; recipeId: string; recipeName: string; imageUrl?: string | null; courseType?: string; order: number }
  date: string
  mealType?: string
  mealPlanId: string
  naturalHeight: boolean
  isNewlyMoved: boolean
  onViewRecipe?: (recipeId: string) => void
  onRemove?: () => void
}) {
  const router = useRouter()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: recipe.id, // Use the MealPlanRecipe.id as the draggable ID
    data: {
      type: 'recipe',
      mealPlanRecipeId: recipe.id,
      recipeId: recipe.recipeId,
      recipeName: recipe.recipeName,
      courseType: recipe.courseType,
      order: recipe.order,
      sourceEntryId: mealPlanId,
      sourceDate: date,
      sourceMealType: mealType,
    },
  })

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
      }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-start gap-1 rounded px-0.5 -mx-0.5 cursor-grab active:cursor-grabbing transition-colors',
        isDragging && 'opacity-30 bg-primary/10'
      )}
      {...listeners}
      {...attributes}
    >
      {/* Drag handle */}
      <div className="shrink-0 mt-0 opacity-40 group-hover:opacity-100 transition-opacity">
        <GripVerticalIcon className="h-2.5 w-2.5 text-muted-foreground" />
      </div>
      {recipe.courseType && (
        <span className="text-[9px] font-medium text-muted-foreground shrink-0">
          {recipe.courseType}:
        </span>
      )}
      <span className={cn(
        'text-xs font-medium',
        naturalHeight ? '' : 'line-clamp-1',
        isNewlyMoved && 'text-primary'
      )}>
        {recipe.recipeName}
      </span>
      {onViewRecipe && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onViewRecipe(recipe.recipeId)
          }}
          className="shrink-0 text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          title="View recipe"
        >
          <EyeIcon className="h-2.5 w-2.5" />
        </button>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          router.push(`/recipes/${recipe.recipeId}?cooking=true`)
        }}
        className="shrink-0 text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        title="Start cooking"
      >
        <ChefHatIcon className="h-2.5 w-2.5" />
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onRemove()
          }}
          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          title="Remove from meal"
        >
          <XIcon className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  )
}
