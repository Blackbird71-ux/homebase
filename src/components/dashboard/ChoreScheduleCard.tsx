'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ClipboardList, UserIcon, StickyNoteIcon } from 'lucide-react'
import type { ChoreScheduleDay } from '@/types'

type ScopeDays = 7 | 14 | 30

export function ChoreScheduleCard({ data, timezone }: { data: ChoreScheduleDay[] | null | undefined; timezone?: string }) {
  const [scope, setScope] = useState<ScopeDays>(7)

  if (!data || data.every((d) => d.chores.length === 0)) return null

  const displayDays = data.slice(0, scope)

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <ClipboardList className="h-4 w-4" /> Chore Schedule
          </CardTitle>
          <div className="flex items-center gap-0.5 border border-border rounded-lg p-0.5 bg-muted/30">
            {([7, 14, 30] as ScopeDays[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setScope(d)}
                className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-colors ${
                  scope === d ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {d === 30 ? '30d' : d === 14 ? '14d' : 'Week'}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-2">
          {displayDays.map((day) => {
            const dateStr = day.date.slice(0, 10)
            const dateObj = new Date(day.date)
            const dayNum = dateObj.getDate()
            const month = dateObj.toLocaleDateString(undefined, { month: 'short' })

            if (day.chores.length === 0) return null

            return (
              <div
                key={day.date}
                className="border border-border rounded-lg p-2 bg-muted/20"
              >
                <div className="text-xs font-semibold text-muted-foreground mb-1.5">
                  {day.day} {dayNum} {month}
                </div>
                <div className="flex flex-col gap-1">
                  {day.chores.map((c) => (
                    <div
                      key={c.id}
                      className={`flex flex-col gap-0.5 px-2 py-1 rounded text-xs ${
                        c.isOverdue
                          ? 'bg-destructive/10 border border-destructive/20'
                          : 'bg-background border border-border/50'
                      }`}
                    >
                      <span className={`font-medium truncate ${c.isOverdue ? 'text-destructive' : ''}`}>
                        {c.title}
                      </span>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        {c.currentAssignee && (
                          <span className="flex items-center gap-0.5">
                            <UserIcon className="h-2.5 w-2.5" />
                            {c.currentAssignee.name}
                          </span>
                        )}
                        {c.note && (
                          <span className="flex items-center gap-0.5 truncate">
                            <StickyNoteIcon className="h-2.5 w-2.5 shrink-0" />
                            {c.note}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
