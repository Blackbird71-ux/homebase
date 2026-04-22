'use client'

import { PlusIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getMealTypeColor } from '@/lib/meal-types'

interface MealSlotCellProps {
  date: string // ISO date string YYYY-MM-DD
  mealPlanId: string | null
  recipeName: string | null
  note: string | null
  mealType?: string
  onClick: () => void
  onClear: () => void
}

export function MealSlotCell({
  mealPlanId,
  recipeName,
  note,
  mealType = 'dinner',
  onClick,
  onClear,
}: MealSlotCellProps) {
  const content = recipeName ?? note
  const mealColor = getMealTypeColor(mealType)

  if (!content) {
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
      className={`group relative w-full h-16 rounded-lg border border-border bg-card px-2 py-1 flex items-start justify-between gap-1 cursor-pointer hover:border-primary/50 transition-colors ${mealColor}`}
      onClick={onClick}
    >
      <p className="text-xs font-medium line-clamp-3 flex-1">{content}</p>
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
