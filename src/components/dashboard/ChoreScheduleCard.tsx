'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ClipboardList, UserIcon, StickyNoteIcon, RefreshCw, CheckIcon, UsersIcon, Plus, ClockIcon } from 'lucide-react'
import type { ChoreScheduleDay } from '@/types'
import { toast } from 'sonner'
import { todayStringInTz } from '@/lib/timezone'
import { ChoreDialog } from '@/app/(app)/chores/ChoreDialog'

type ScopeDays = 7 | 14 | 30

export function ChoreScheduleCard({
  data: initialData,
  timezone,
  scope: parentScope,
  onScopeChange,
  showOnlyMine: externalShowOnlyMine,
  onShowOnlyMineChange,
}: {
  data: ChoreScheduleDay[] | null | undefined
  timezone?: string
  scope?: ScopeDays
  onScopeChange?: (scope: ScopeDays) => void
  showOnlyMine?: boolean
  onShowOnlyMineChange?: (onlyMine: boolean) => void
}) {
  const router = useRouter()
  const [internalScope, setInternalScope] = useState<ScopeDays>(7)
  const [data, setData] = useState<ChoreScheduleDay[] | null | undefined>(initialData)
  const [loading, setLoading] = useState(false)
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set())
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [internalShowOnlyMine, setInternalShowOnlyMine] = useState(false)
  // Use external prop if provided (controlled from parent for persistence), otherwise internal state
  const showOnlyMine = externalShowOnlyMine ?? internalShowOnlyMine
  const setShowOnlyMine = useCallback((value: boolean) => {
    if (onShowOnlyMineChange) {
      onShowOnlyMineChange(value)
    } else {
      setInternalShowOnlyMine(value)
    }
  }, [onShowOnlyMineChange])
  const [choreDialogOpen, setChoreDialogOpen] = useState(false)
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const [membersLoading, setMembersLoading] = useState(false)

  // Use parent scope if provided, otherwise fall back to internal state
  const scope = parentScope ?? internalScope

  const fetchSchedule = useCallback(async (s: ScopeDays, onlyMine: boolean) => {
    if (!timezone) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ scope: String(s) })
      if (onlyMine) {
        params.set('assignedToMe', 'true')
      }
      const res = await fetch(`/api/chores/schedule?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setData(json.schedule)
      }
    } catch {
      // ignore fetch errors
    } finally {
      setLoading(false)
    }
  }, [timezone])

  // Refetch whenever scope or filter changes
  useEffect(() => {
    fetchSchedule(scope, showOnlyMine)
  }, [scope, showOnlyMine, fetchSchedule])

  async function handleComplete(choreId: string) {
    if (completingIds.has(choreId)) return // prevent double-click

    setCompletingIds((prev) => new Set(prev).add(choreId))
    try {
      const res = await fetch(`/api/chores/${choreId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        // Surface the real server error (e.g. "not yet due") so users know why it failed
        let message = 'Failed to complete chore. Please try again.'
        try {
          const json = await res.json()
          if (json?.error) message = json.error
        } catch { /* ignore parse errors */ }
        toast.error(message)
        return
      }

      // Briefly show strikethrough, then re-fetch so the completed item disappears
      setCompletedIds((prev) => new Set(prev).add(choreId))
      setTimeout(() => {
        fetchSchedule(scope, showOnlyMine)
      }, 600)
    } catch {
      toast.error('Failed to complete chore. Please try again.')
    } finally {
      setTimeout(() => {
        setCompletingIds((prev) => {
          const next = new Set(prev)
          next.delete(choreId)
          return next
        })
      }, 700)
    }
  }

  async function handleOpenChoreDialog() {
    if (members.length === 0 && !membersLoading) {
      setMembersLoading(true)
      try {
        const res = await fetch('/api/members')
        if (res.ok) setMembers(await res.json())
      } catch { /* ignore */ } finally {
        setMembersLoading(false)
      }
    }
    setChoreDialogOpen(true)
  }

  // Compute today's YMD for highlighting
  const today = timezone ? todayStringInTz(timezone) : new Date().toISOString().slice(0, 10)

  const isEmpty = !data || data.every((d) => d.chores.length === 0)

  // If there's an overdue section (day === 'Overdue'), include it plus scope regular days
  const rawDays = data ?? []
  const hasOverdueSection = rawDays.length > 0 && rawDays[0].day === 'Overdue'
  const displayDays = hasOverdueSection
    ? rawDays.slice(0, scope + 1)  // Overdue section + scope days
    : rawDays.slice(0, scope)

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <ClipboardList className="h-4 w-4 shrink-0" /> Chore Schedule
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleOpenChoreDialog() }}
              disabled={membersLoading}
              className="flex items-center justify-center h-5 w-5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors shrink-0 disabled:opacity-50"
              title="Add Chore"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </CardTitle>
          <div className="flex items-center gap-1">
            {loading && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />}
            {/* Toggle: show only my chores vs all family chores */}
            <button
              type="button"
              onClick={() => setShowOnlyMine(!showOnlyMine)}
              title={showOnlyMine ? 'Show all family chores' : 'Show only my chores'}
              className={`flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-md transition-colors ${
                showOnlyMine
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              }`}
            >
              <UsersIcon className="h-3 w-3" />
              <span>{showOnlyMine ? 'Mine' : 'All'}</span>
            </button>
            <div className="flex items-center gap-0.5 border border-border rounded-lg p-0.5 bg-muted/30">
              {([7, 14, 30] as ScopeDays[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    if (onScopeChange) {
                      onScopeChange(d)
                    } else {
                      setInternalScope(d)
                    }
                  }}
                  className={`px-2 py-0.5 text-xs font-medium rounded-md transition-colors ${
                    scope === d ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {d === 30 ? '30d' : d === 14 ? '14d' : 'Week'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-2">
          {isEmpty ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CheckIcon className="h-8 w-8 text-green-500/60" />
              <p className="text-sm font-medium text-muted-foreground">You&apos;re all caught up!</p>
              <p className="text-xs text-muted-foreground/60">No outstanding chores in this period.</p>
            </div>
          ) : displayDays.map((day) => {
            // The "Overdue" section has day.day === 'Overdue' and day.date === '' —
            // guard against parsing an empty string as a date.
            const isOverdueSection = day.day === 'Overdue'
            const dateStr = isOverdueSection ? '' : day.date.slice(0, 10)
            const isToday = !isOverdueSection && dateStr === today

            // Only parse day/month numbers for non-overdue sections
            let dayNum: number | null = null
            let month: string | null = null
            if (!isOverdueSection && dateStr) {
              const [y, m, d] = dateStr.split('-').map(Number)
              dayNum = d
              month = new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short' })
            }

            if (day.chores.length === 0) return null

            return (
              <div
                key={isOverdueSection ? 'overdue' : day.date}
                className={`border rounded-lg p-2 ${
                  isOverdueSection
                    ? 'border-destructive/40 bg-destructive/5'
                    : isToday
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border bg-muted/20'
                }`}
              >
                <div className={`text-xs font-semibold mb-1.5 ${isOverdueSection ? 'text-destructive' : isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                  {isToday && <span className="mr-1">●</span>}
                  {isOverdueSection ? '⚠ Overdue' : `${day.day} ${dayNum} ${month}`}
                  {isToday && <span className="ml-1 text-primary font-bold">— Today</span>}
                </div>
                <div className="flex flex-col gap-1">
                  {day.chores.map((c) => {
                    const isCompleted = completedIds.has(c.id)

                    return (
                      <div
                        key={c.id}
                        className={`flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors ${
                          isCompleted
                            ? 'bg-muted/40 border border-border/30'
                            : c.isOverdue
                              ? 'bg-destructive/10 border border-destructive/20'
                              : 'bg-background border border-border/50'
                        }`}
                      >
                        {/* Complete checkbox button (only for completable chores) */}
                        {c.isCompletable ? (
                          <button
                            onClick={() => handleComplete(c.id)}
                            disabled={completingIds.has(c.id)}
                            className={`shrink-0 flex items-center justify-center h-4 w-4 rounded border transition-all duration-200 ${
                              completingIds.has(c.id)
                                ? 'border-green-500 bg-green-500 scale-110'
                                : isCompleted
                                  ? 'border-green-500 bg-green-500/20'
                                  : 'border-border hover:border-green-500 hover:bg-green-500/10'
                            }`}
                            title="Mark complete"
                          >
                            <CheckIcon className={`h-2.5 w-2.5 transition-colors duration-200 ${
                              completingIds.has(c.id) ? 'text-white' : isCompleted ? 'text-green-600' : 'text-transparent'
                            }`} />
                          </button>
                        ) : (
                          <div
                            className="shrink-0 flex items-center justify-center h-4 w-4 rounded border border-dashed border-muted-foreground/30 text-muted-foreground/40"
                            title="Scheduled — becomes available on its due date"
                          >
                            <ClockIcon className="h-2.5 w-2.5" />
                          </div>
                        )}

                        {/* Chore details */}
                        <div className="flex-1 min-w-0">
                          <span className={`font-medium truncate block ${
                            isCompleted
                              ? 'line-through text-muted-foreground'
                              : c.isOverdue
                                ? 'text-destructive'
                                : ''
                          }`}>
                            {c.title}
                          </span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>

      <ChoreDialog
        open={choreDialogOpen}
        onOpenChange={setChoreDialogOpen}
        chore={null}
        members={members}
        onSaved={() => {
          setChoreDialogOpen(false)
          fetchSchedule(scope, showOnlyMine)
          router.refresh()
        }}
      />
    </Card>
  )
}
