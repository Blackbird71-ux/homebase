import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { UtensilsCrossed } from 'lucide-react'
import type { TonightsDinner } from '@/types'
import Link from 'next/link'

export function TonightsDinnerCard({ dinner }: { dinner: TonightsDinner | null }) {
  const href = dinner?.recipeId ? `/recipes/${dinner.recipeId}` : '/meal-plan'
  
  return (
    <Link href={href} className="block h-full">
      <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <UtensilsCrossed className="h-4 w-4" /> Tonight's Dinner
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          {dinner ? (
            <div className="flex-1 flex flex-col">
              {dinner.recipeImage ? (
                <div className="mb-3">
                  <div className="relative aspect-video rounded-md overflow-hidden bg-muted">
                    <img 
                      src={dinner.recipeImage} 
                      alt={dinner.recipeName || dinner.note || 'Meal planned'}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              ) : null}
              <p className="text-sm font-medium">{dinner.recipeName ?? dinner.note ?? 'Meal planned'}</p>
              {dinner.recipeId && (
                <p className="text-xs text-muted-foreground mt-1">Click to view recipe</p>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-center">
              <p className="text-sm text-muted-foreground text-center">Nothing planned yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
