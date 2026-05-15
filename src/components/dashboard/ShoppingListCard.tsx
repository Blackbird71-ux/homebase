'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShoppingCart, ChevronDown } from 'lucide-react'
import type { ShoppingListSummary } from '@/types'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface ShoppingListOption {
  id: string
  name: string
}

interface ShoppingListCardProps {
  list: ShoppingListSummary | null
  availableLists?: ShoppingListOption[]
  selectedListId?: string | null
  onListChange?: (listId: string) => void
}

const ITEM_ROW_HEIGHT = 20 // px per item row (text-xs line)
const HEADER_HEIGHT = 80   // px for card header + title area
const FOOTER_HEIGHT = 24   // px for "+N more" footer
const MIN_ITEMS = 1
const MAX_ITEMS = 10

export function ShoppingListCard({
  list,
  availableLists,
  selectedListId,
  onListChange,
}: ShoppingListCardProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [maxItems, setMaxItems] = useState(3)

  // Observe content area height to calculate how many items to show
  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    function calculateMaxItems() {
      const contentHeight = el!.clientHeight
      if (contentHeight <= 0) return
      const availableHeight = contentHeight - HEADER_HEIGHT - FOOTER_HEIGHT
      const items = Math.max(MIN_ITEMS, Math.min(MAX_ITEMS, Math.floor(availableHeight / ITEM_ROW_HEIGHT)))
      setMaxItems(items)
    }

    calculateMaxItems()

    const observer = new ResizeObserver(() => {
      calculateMaxItems()
    })

    if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const itemCount = list ? Math.min(maxItems, list.firstItems.length) : 0
  const remainingItems = list ? list.pendingItems - itemCount : 0
  const showRemaining = remainingItems > 0

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <ShoppingCart className="h-4 w-4" /> Shopping
          </CardTitle>
          {/* List selector dropdown */}
          {availableLists && availableLists.length > 0 && (
            <div className="ml-auto relative">
              <select
                value={selectedListId ?? ''}
                onChange={(e) => onListChange?.(e.target.value)}
                className="text-xs text-muted-foreground bg-transparent border border-border rounded px-1.5 py-0.5 cursor-pointer max-w-[110px] truncate appearance-none pr-5"
              >
                <option value="">Auto (recent)</option>
                {availableLists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent
        ref={contentRef}
        className="flex-1 space-y-1 min-h-0 overflow-hidden"
      >
        {list ? (
          <Link href="/lists" className="block h-full flex flex-col">
            <p className="text-sm font-medium hover:text-primary transition-colors truncate">{list.listName}</p>
            <p className="text-xs text-muted-foreground mb-1">{list.pendingItems} item{list.pendingItems !== 1 ? 's' : ''} remaining</p>
            <div className="flex-1 space-y-0.5">
              {list.firstItems.slice(0, itemCount).map((item, i) => (
                <p key={i} className="text-xs text-muted-foreground truncate leading-5">{item}</p>
              ))}
            </div>
            {showRemaining && (
              <p className="text-xs text-muted-foreground mt-auto">+{remainingItems} more</p>
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