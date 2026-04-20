import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { UtensilsCrossed } from 'lucide-react'
import type { TonightsDinner } from '@/types'
import Link from 'next/link'

export function TonightsDinnerCard({ dinner }: { dinner: TonightsDinner | null }) {
  const href = dinner?.recipeId ? `/recipes/${dinner.recipeId}` : '/meal-plan'
  
  return (
    <Link href={href} className="block h-full">
      <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <UtensilsCrossed className="h-4 w-4" /> Tonight's Dinner
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dinner ? (
            <div>
              <p className="text-sm font-medium">{dinner.recipeName ?? dinner.note ?? 'Meal planned'}</p>
              {dinner.recipeId && (
                <p className="text-xs text-muted-foreground mt-1">Click to view recipe</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing planned yet</p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
