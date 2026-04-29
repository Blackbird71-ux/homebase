'use client'

import { PlusIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getMealTypeColor } from '@/lib/meal-types'

interface MealSlotCellProps {
  date: string // ISO date string YYYY-MM-DD
  mealPlanId: string | null
  recipeName: string | null // For backward compatibility
  recipes?: Array<{
    id: string
    recipeId: string
    recipeName: string
    courseType?: string
    order: number
  }>
  note: string | null
  mealType?: string
  onClick: () => void
  onClear: () => void
  naturalHeight?: boolean // mobile: remove fixed h-16 and line-clamp
}

export function MealSlotCell({
  mealPlanId,
  recipeName,
  recipes,
  note,
  mealType = 'dinner',
  onClick,
  onClear,
  naturalHeight = false,
}: MealSlotCellProps) {
  // Use recipes if available, otherwise fall back to recipeName for backward compatibility
  const hasRecipes = recipes && recipes.length > 0
  const hasRecipeName = recipeName && recipeName.trim() !== ''
  const hasNote = note && note.trim() !== ''
  
  // Determine what to display
  let displayContent: React.ReactNode = null
  
  if (hasRecipes) {
    // Display multiple recipes
    displayContent = (
      <div className="space-y-0.5">
        {recipes
          .sort((a, b) => a.order - b.order)
          .map((recipe) => (
            <div key={recipe.id} className="flex items-start gap-1">
              {recipe.courseType && (
                <span className="text-[10px] font-medium text-muted-foreground shrink-0">
                  {recipe.courseType}:
                </span>
              )}
              <span className={`text-xs font-medium ${naturalHeight ? '' : 'line-clamp-1'}`}>
                {recipe.recipeName}
              </span>
            </div>
          ))}
        {hasNote && (
          <div className={`text-[10px] text-muted-foreground italic ${naturalHeight ? '' : 'line-clamp-1'}`}>
            {note}
          </div>
        )}
      </div>
    )
  } else if (hasRecipeName) {
    // Backward compatibility: single recipe
    displayContent = (
      <div className="space-y-0.5">
        <p className={`text-xs font-medium ${naturalHeight ? '' : 'line-clamp-2'}`}>{recipeName}</p>
        {hasNote && (
          <div className={`text-[10px] text-muted-foreground italic ${naturalHeight ? '' : 'line-clamp-1'}`}>
            {note}
          </div>
        )}
      </div>
    )
  } else if (hasNote) {
    // Just a note
    displayContent = (
      <p className={`text-xs font-medium italic ${naturalHeight ? '' : 'line-clamp-3'}`}>{note}</p>
    )
  }
  
  const mealColor = getMealTypeColor(mealType)
  const hasContent = hasRecipes || hasRecipeName || hasNote

  if (!hasContent) {
    return (
      <button
        onClick={onClick}
        className={`w-full h-16 flex items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors ${mealColor}`}
        aria-label="Add meal"
      >
        <PlusIcon className="h-4 w-4" />
      </button>
    )
  }

  return (
    <div
      className={`group relative w-full ${naturalHeight ? 'min-h-[2.5rem]' : 'h-16'} rounded-lg border border-border bg-card px-2 py-1.5 flex items-start justify-between gap-1 cursor-pointer hover:border-primary/50 transition-colors ${mealColor}`}
      onClick={onClick}
    >
      <div className="flex-1 overflow-hidden">
        {displayContent}
      </div>
      {mealPlanId && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation()
            onClear()
          }}
          aria-label="Clear meal"
        >
          <XIcon className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}
