import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CalendarDays, Utensils, CheckSquare } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'

export interface WeeklySummaryData {
  weekLabel: string
  eventCount: number
  mealCount: number
  pendingTodoCount: number
  topEvents: { id: string; title: string; start: string; color: string | null }[]
  topMeals: { day: string; meal: string }[]
  topTodos: string[]
}

export function WeeklySummaryCard({ data }: { data: WeeklySummaryData | null }) {
  if (!data) return null

  return (
    <Card className="flex flex-col col-span-1 md:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
          <CalendarDays className="h-4 w-4" /> Next 7 Days — {data.weekLabel}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Events summary */}
          <Link href="/calendar" className="block p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground uppercase">Events</span>
            </div>
            <p className="text-lg font-bold">{data.eventCount}</p>
            <p className="text-xs text-muted-foreground">this week</p>
            {data.topEvents.length > 0 && (
              <div className="mt-2 space-y-1">
                {data.topEvents.map((e) => (
                  <div key={e.id} className="flex items-center gap-1.5 text-xs">
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: e.color ?? '#6366f1' }} />
                    <span className="truncate">{e.title}</span>
                  </div>
                ))}
              </div>
            )}
          </Link>

          {/* Meals summary */}
          <Link href="/meal-plan" className="block p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <Utensils className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground uppercase">Meals</span>
            </div>
            <p className="text-lg font-bold">{data.mealCount}</p>
            <p className="text-xs text-muted-foreground">planned meals</p>
            {data.topMeals.length > 0 && (
              <div className="mt-2 space-y-1">
                {data.topMeals.map((m, i) => (
                  <p key={i} className="text-xs truncate">
                    <span className="text-muted-foreground">{m.day}:</span> {m.meal}
                  </p>
                ))}
              </div>
            )}
          </Link>

          {/* To-dos summary */}
          <Link href="/lists" className="block p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <CheckSquare className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground uppercase">To-Do</span>
            </div>
            <p className="text-lg font-bold">{data.pendingTodoCount}</p>
            <p className="text-xs text-muted-foreground">pending tasks</p>
            {data.topTodos.length > 0 && (
              <div className="mt-2 space-y-1">
                {data.topTodos.map((t, i) => (
                  <p key={i} className="text-xs truncate">{t}</p>
                ))}
              </div>
            )}
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
