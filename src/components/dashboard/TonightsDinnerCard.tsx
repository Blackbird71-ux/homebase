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

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
          <Link href="/meal-plan" className="flex items-center gap-2 hover:text-foreground transition-colors w-full">
            <Utensils className="h-4 w-4" /> {title}
          </Link>
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
    </Card>
  )
}

// Keep old export for backward compat
export { TodaysMealsCard as TonightsDinnerCard }
