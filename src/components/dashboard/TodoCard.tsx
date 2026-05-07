import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckSquare, User, Users } from 'lucide-react'
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
        <CardContent className="flex-1 space-y-1.5 min-h-0">
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
              {todo.firstItems.length > 0 && (
                <>
                  {todo.firstItems.map((item, i) => (
                    <p key={i} className="text-xs text-muted-foreground truncate">{item}</p>
                  ))}
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No tasks due today</p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
