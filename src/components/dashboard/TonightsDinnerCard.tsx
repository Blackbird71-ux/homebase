'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Coffee, Utensils, Pizza, Apple, Plus } from 'lucide-react'
import type { TodaysMeals, TodaysMeal } from '@/types'
import Link from 'next/link'
import { AssignMealModal } from '@/components/meal-plan/AssignMealModal'
import { toast } from 'sonner'
import { OFFLINE_QUEUE_FLUSHED } from '@/lib/offline-queue'
import { MEAL_PLAN_SCOPE, queueMealPlanSlotState } from '@/lib/meal-plan-offline'

const MEAL_CONFIG = [
  { key: 'breakfast' as const, label: 'Breakfast', Icon: Coffee },
  { key: 'lunch'     as const, label: 'Lunch',     Icon: Utensils },
  { key: 'dinner'    as const, label: 'Dinner',    Icon: Pizza },
  { key: 'snacks'    as const, label: 'Snacks',    Icon: Apple },
]

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function MealRow({ meal, label, Icon }: { meal: TodaysMeal | null; label: string; Icon: React.ElementType }) {
  const content = meal?.recipeName ?? meal?.note ?? null
  const href = meal?.recipeId ? `/recipes/${meal.recipeId}` : '/meal-plan'
  const description = meal?.recipeDescription ?? null

  return (
    <div className="py-1.5 min-w-0">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs text-muted-foreground w-16 shrink-0">{label}</span>
        <div className="flex-1 min-w-0">
          {content ? (
            <Link href={href} className="text-xs font-medium truncate block hover:underline hover:text-primary transition-colors">
              {content}
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground/50 italic truncate block">Not planned</span>
          )}
          {content && description && (
            <p className="text-xs text-muted-foreground/60 truncate">{description}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export function TodaysMealsCard({ meals, title = "Today's Meals" }: { meals: TodaysMeals; title?: string }) {
  const hasAny = MEAL_CONFIG.some(({ key }) => meals[key] !== null)
  const router = useRouter()
  const [mealOpen, setMealOpen] = useState(false)
  const today = todayLocal()

  // Re-render server data once the offline queue replays meal-plan mutations.
  useEffect(() => {
    function handleFlushed(e: Event) {
      const listIds = (e as CustomEvent<{ listIds: string[] }>).detail?.listIds
      if (listIds?.includes(MEAL_PLAN_SCOPE)) router.refresh()
    }
    window.addEventListener(OFFLINE_QUEUE_FLUSHED, handleFlushed)
    return () => window.removeEventListener(OFFLINE_QUEUE_FLUSHED, handleFlushed)
  }, [router])

  async function handleAssign(data: { recipeIds?: string[]; note?: string }) {
    // Offline: queue the slot's desired state for idempotent replay (same
    // whole-slot replace the online POST performs).
    if (!navigator.onLine) {
      try {
        await queueMealPlanSlotState(today, 'dinner', data.recipeIds ?? [], data.note ?? null)
        toast.success('Saved offline — will sync when you reconnect')
        setMealOpen(false)
      } catch {
        toast.error('Failed to save offline — storage unavailable.')
      }
      return
    }

    try {
      const res = await fetch('/api/meal-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: today + 'T00:00:00Z',
          mealType: 'dinner',
          ...data,
        }),
      })
      if (!res.ok) throw new Error('Failed to save meal')
      toast.success('Meal added')
      setMealOpen(false)
      router.refresh()
    } catch {
      toast.error('Failed to save meal')
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
          <Link href="/meal-plan" className="flex items-center gap-2 hover:text-foreground transition-colors flex-1 min-w-0">
            <Utensils className="h-4 w-4 shrink-0" /> {title}
          </Link>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMealOpen(true) }}
            className="flex items-center justify-center h-5 w-5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Add Meal"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-center min-h-0">
        {hasAny ? (
          <div className="divide-y divide-border/50">
            {MEAL_CONFIG.map(({ key, label, Icon }) => (
              <MealRow key={key} meal={meals[key]} label={label} Icon={Icon} />
            ))}
          </div>
        ) : (
          <Link href="/meal-plan" className="text-sm text-muted-foreground text-center hover:text-foreground transition-colors">
            Nothing planned
          </Link>
        )}
      </CardContent>

      <AssignMealModal
        open={mealOpen}
        onOpenChange={setMealOpen}
        date={today}
        mealType="dinner"
        onAssign={handleAssign}
      />
    </Card>
  )
}

// Keep old export for backward compat
export { TodaysMealsCard as TonightsDinnerCard }
