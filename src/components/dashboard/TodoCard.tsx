import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckSquare } from 'lucide-react'
import type { TodoSummary } from '@/types'
import Link from 'next/link'

export function TodoCard({ todo }: { todo: TodoSummary | null }) {
  return (
    <Link href="/lists" className="block h-full">
      <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <CheckSquare className="h-4 w-4" /> Todo
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 space-y-1 min-h-0">
          {todo ? (
            <>
              <p className="text-sm font-medium">{todo.dueTodayCount} due today</p>
              {todo.firstItems.map((item, i) => (
                <p key={i} className="text-xs text-muted-foreground truncate">{item}</p>
              ))}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No tasks due today</p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
