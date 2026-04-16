import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { UtensilsCrossed } from 'lucide-react'
import type { TonightsDinner } from '@/types'
import Link from 'next/link'

export function TonightsDinnerCard({ dinner }: { dinner: TonightsDinner | null }) {
  return (
    <Link href="/meal-plan" className="block h-full">
      <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <UtensilsCrossed className="h-4 w-4" /> Tonight&apos;s Dinner
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dinner ? (
            <p className="text-sm font-medium">{dinner.recipeName ?? dinner.note ?? 'Meal planned'}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing planned yet</p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
