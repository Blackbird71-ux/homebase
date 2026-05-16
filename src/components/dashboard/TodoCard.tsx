'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckSquare, User, Users } from 'lucide-react'
import type { TodoSummary } from '@/types'
import Link from 'next/link'
import { CardQuickAdd } from './CardQuickAdd'

const ITEM_ROW_HEIGHT = 20  // px per item row (text-xs)
const CONTENT_OVERHEAD = 52 // px for "X due today" + my/family stats rows
const MIN_ITEMS = 1
const MAX_ITEMS = 10

export function TodoCard({ todo }: { todo: TodoSummary | null }) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [maxItems, setMaxItems] = useState(3)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    function calculateMaxItems() {
      const h = el!.clientHeight
      if (h <= 0) return
      const available = h - CONTENT_OVERHEAD
      setMaxItems(Math.max(MIN_ITEMS, Math.min(MAX_ITEMS, Math.floor(available / ITEM_ROW_HEIGHT))))
    }

    calculateMaxItems()
    const observer = new ResizeObserver(calculateMaxItems)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const items = todo?.firstItems.slice(0, maxItems) ?? []

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
          <Link href="/lists" className="flex items-center gap-2 hover:text-foreground transition-colors flex-1 min-w-0">
            <CheckSquare className="h-4 w-4 shrink-0" /> To-Do
          </Link>
          {todo?.listId && <CardQuickAdd type="todo-item" listId={todo.listId} />}
        </CardTitle>
      </CardHeader>
      <CardContent ref={contentRef} className="flex-1 space-y-1.5 min-h-0 overflow-hidden">
        {todo ? (
          <>
            <p className="text-sm font-medium">{todo.dueTodayCount} due today</p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <User className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{todo.myTasksCount} my tasks</span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{todo.familyTasksCount} family</span>
              </div>
            </div>
            {items.length > 0 && (
              <div className="pt-0.5">
                {items.map((item, i) => (
                  <p key={i} className="text-xs text-muted-foreground truncate leading-5">{item}</p>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No tasks due today</p>
        )}
      </CardContent>
    </Card>
  )
}
