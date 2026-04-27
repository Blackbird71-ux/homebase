import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Coffee, Utensils, Pizza, Apple } from 'lucide-react'
import type { TodaysMeals, TodaysMeal } from '@/types'
import Link from 'next/link'

const MEAL_CONFIG = [
  { key: 'breakfast' as const, label: 'Breakfast', Icon: Coffee },
  { key: 'lunch'     as const, label: 'Lunch',     Icon: Utensils },
  { key: 'dinner'    as const, label: 'Dinner',    Icon: Pizza },
  { key: 'snacks'    as const, label: 'Snacks',    Icon: Apple },
]

function MealRow({ meal, label, Icon }: { meal: TodaysMeal | null; label: string; Icon: React.ElementType }) {
  const content = meal?.recipeName ?? meal?.note ?? null
  const href = meal?.recipeId ? `/recipes/${meal.recipeId}` : '/meal-plan'

  return (
    <div className="flex items-center gap-2 py-1.5 min-w-0">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="text-xs text-muted-foreground w-16 shrink-0">{label}</span>
      {content ? (
        <Link href={href} className="text-xs font-medium truncate hover:underline hover:text-primary transition-colors" onClick={(e) => e.stopPropagation()}>
          {content}
        </Link>
      ) : (
        <span className="text-xs text-muted-foreground/50 italic truncate">Not planned</span>
      )}
    </div>
  )
}

export function TodaysMealsCard({ meals }: { meals: TodaysMeals }) {
  const hasAny = MEAL_CONFIG.some(({ key }) => meals[key] !== null)

  return (
    <Link href="/meal-plan" className="block h-full">
      <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <Utensils className="h-4 w-4" /> Today's Meals
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
            <p className="text-sm text-muted-foreground text-center">Nothing planned for today</p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

// Keep old export for backward compat during transition
export { TodaysMealsCard as TonightsDinnerCard }
