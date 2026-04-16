import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShoppingCart } from 'lucide-react'
import type { ShoppingListSummary } from '@/types'
import Link from 'next/link'

export function ShoppingListCard({ list }: { list: ShoppingListSummary | null }) {
  return (
    <Link href="/lists" className="block h-full">
      <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <ShoppingCart className="h-4 w-4" /> Shopping
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {list ? (
            <>
              <p className="text-sm font-medium">{list.pendingItems} items</p>
              {list.firstItems.map((item, i) => (
                <p key={i} className="text-xs text-muted-foreground">{item}</p>
              ))}
              {list.pendingItems > list.firstItems.length && (
                <p className="text-xs text-muted-foreground">+{list.pendingItems - list.firstItems.length} more</p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No active shopping list</p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
