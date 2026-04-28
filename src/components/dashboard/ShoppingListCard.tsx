import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShoppingCart } from 'lucide-react'
import type { ShoppingListSummary } from '@/types'
import Link from 'next/link'

export function ShoppingListCard({ list }: { list: ShoppingListSummary | null }) {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
          <ShoppingCart className="h-4 w-4" /> Shopping
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-1 min-h-0">
        {list ? (
          <Link href="/lists" className="block">
            <p className="text-sm font-medium hover:text-primary transition-colors">{list.listName}</p>
            <p className="text-xs text-muted-foreground mb-1">{list.pendingItems} item{list.pendingItems !== 1 ? 's' : ''} remaining</p>
            {list.firstItems.map((item, i) => (
              <p key={i} className="text-xs text-muted-foreground truncate">{item}</p>
            ))}
            {list.pendingItems > list.firstItems.length && (
              <p className="text-xs text-muted-foreground">+{list.pendingItems - list.firstItems.length} more</p>
            )}
          </Link>
        ) : (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">No list selected</p>
            <Link href="/settings" className="text-xs text-primary hover:underline">
              Choose a list in Settings
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
