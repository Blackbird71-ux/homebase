'use client'

import { useState, useEffect } from 'react'
import { PlusIcon, RotateCcwIcon, CheckIcon, Trash2Icon, InfoIcon, UserIcon, GlobeIcon, CalendarDays, ListIcon, ClockIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { ChoreDialog } from './ChoreDialog'
import { ChoreCalendarView } from './ChoreCalendarView'
import { HoverCard } from '@/components/ui/hover-card'
import { listenAppEvent, AppEvents } from '@/lib/app-events'
import { OFFLINE_QUEUE_FLUSHED } from '@/lib/offline-queue'
import { CHORES_SCOPE, queueChoreComplete } from '@/lib/chores-offline'
import { parseDaysOfWeek, choreIsCompletable } from '@/lib/chore-helpers'
import { todayBoundsInTz, formatInTz } from '@/lib/timezone'

interface Member {
  id: string
  name: string
}

interface ChoreCompletion {
  id: string
  completedById: string
  completedAt: string
  note: string | null
  completedBy: { id: string; name: string }
}

interface Chore {
  id: string
  title: string
  description: string | null
  note: string | null
  frequency: string
  dayOfWeek: number | null
  daysOfWeek: string | null
  dayOfMonth: number | null
  rotationInterval: number
  currentAssigneeId: string | null
  currentAssignee: { id: string; name: string } | null
  isActive: boolean
  startDate: string | null
  endDate: string | null
  nextDueDate: string | null
  triggerOnComplete: boolean
  autoRotateOnComplete: boolean
  allowEarlyStart: boolean
  emailReminder: boolean
  emailReminderDays: number
  emailReminderHours: number
  startTime: string | null
  rewardAmount: number | null
  completions: ChoreCompletion[]
  _count: { completions: number }
  createdAt: string
  updatedAt: string
  isOverdue: boolean
}

interface ChoresClientProps {
  initialChores: Chore[]
  members: Member[]
  currentUserId: string
  weekStartsOn: 0 | 1
  timezone: string
}

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  'one-off': 'One-off',
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Chore dates (nextDueDate/startDate/endDate) are stored as the UTC instant of
// local midnight, and completedAt is a real instant — both must be formatted in
// the family timezone, not the browser's, so the displayed calendar day matches
// what the family expects regardless of where the viewer's device is set.
function formatDate(dateStr: string, timezone: string): string {
  return formatInTz(new Date(dateStr), timezone, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

type ScopeDays = 7 | 30 | 90 | 365

export function ChoresClient({ initialChores, members, currentUserId, weekStartsOn, timezone }: ChoresClientProps) {
  const [chores, setChores] = useState<Chore[]>(initialChores)
  // End of today in the user's timezone — the boundary for whether a chore is
  // completable yet. choreIsCompletable also honours allowEarlyStart, so chores
  // flagged for early completion stay clickable before their due date.
  const { end: todayEnd } = todayBoundsInTz(timezone)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingChore, setEditingChore] = useState<Chore | null>(null)
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set())
  // Persistently tracks chore IDs that have been completed this session (for strikethrough)
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  // Incremented each time a new chore is added, forcing ChoreDialog to re-mount with clean state
  const [newChoreKey, setNewChoreKey] = useState(0)
  const [scope, setScope] = useState<ScopeDays>(30)
  const [publicView, setPublicView] = useState(false)
  const [view, setView] = useState<'list' | 'calendar'>('list')

  // Listen for chores updates from AI assistant or other sources
  useEffect(() => {
    const cleanup = listenAppEvent(AppEvents.CHORES_UPDATED, () => {
      fetch('/api/chores')
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data) setChores(data as Chore[])
        })
        .catch(() => {})
    })
    return cleanup
  }, [])

  // After the offline queue replays chore completions, refetch so the
  // server-advanced nextDueDate / rotated assignee replace the stale view.
  useEffect(() => {
    function handleFlushed(e: Event) {
      const listIds = (e as CustomEvent<{ listIds: string[] }>).detail?.listIds
      if (!listIds?.includes(CHORES_SCOPE)) return
      fetch('/api/chores')
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data) setChores(data as Chore[])
        })
        .catch(() => {})
    }
    window.addEventListener(OFFLINE_QUEUE_FLUSHED, handleFlushed)
    return () => window.removeEventListener(OFFLINE_QUEUE_FLUSHED, handleFlushed)
  }, [])

  async function handleComplete(chore: Chore) {
    setCompletingIds((prev) => new Set(prev).add(chore.id))

    // Offline: queue the completion for idempotent replay. The client can't
    // compute the advanced nextDueDate or rotation, so feedback is just the
    // strikethrough — the post-flush refetch realigns the real schedule.
    if (!navigator.onLine) {
      try {
        await queueChoreComplete(chore.id)
        setCompletedIds((prev) => new Set(prev).add(chore.id))
        toast.success('Saved offline — will sync when you reconnect')
      } catch {
        toast.error('Failed to save offline — storage unavailable.')
      } finally {
        setTimeout(() => {
          setCompletingIds((prev) => {
            const next = new Set(prev)
            next.delete(chore.id)
            return next
          })
        }, 700)
      }
      return
    }

    try {
      const res = await fetch(`/api/chores/${chore.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        if (res.status === 422) {
          const err = await res.json().catch(() => ({}))
          toast.error(err.error ?? 'Chore is not yet due')
        } else {
          throw new Error('Failed to complete chore')
        }
        return
      }
      const data = await res.json()
      const updatedChore = {
        ...chore,
        ...data.chore,
        completions: [data.completion, ...chore.completions],
        _count: { completions: chore._count.completions + 1 },
      }
      setChores((prev) => prev.map((c) => (c.id === chore.id ? updatedChore : c)))

      // Persistently track this chore as completed for strikethrough visual feedback
      setCompletedIds((prev) => new Set(prev).add(chore.id))
      const nextDate = data.chore.nextDueDate
      // Auto-rotate may have handed the chore to another member — surface that
      // so it doesn't silently vanish from the completer's "Mine" view.
      const rotatedTo =
        data.chore.currentAssigneeId !== chore.currentAssigneeId
          ? data.chore.currentAssignee?.name ?? null
          : null
      if (nextDate) {
        toast.success('Chore completed!', {
          description: `Next scheduled: ${formatDate(nextDate, timezone)}${rotatedTo ? ` · now assigned to ${rotatedTo}` : ''}`,
          action: {
            label: 'Edit',
            onClick: () => { setEditingChore(updatedChore); setDialogOpen(true) },
          },
          duration: 5000,
        })
      } else {
        toast.success('All done!', {
          description: 'No more occurrences — chore is now complete.',
          duration: 4000,
        })
      }
    } catch {
      toast.error('Failed to complete chore')
    } finally {
      setTimeout(() => {
        setCompletingIds((prev) => {
          const next = new Set(prev)
          next.delete(chore.id)
          return next
        })
      }, 700)
    }
  }

  async function handleRotate(choreId: string) {
    try {
      const res = await fetch(`/api/chores/${choreId}/rotate`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to rotate')
      const updated = await res.json()
      setChores((prev) => prev.map((c) => (c.id === choreId ? { ...c, currentAssignee: updated.currentAssignee, currentAssigneeId: updated.currentAssigneeId } : c)))
      toast.success('Assignee rotated')
    } catch {
      toast.error('Failed to rotate assignee')
    }
  }

  async function handleDelete(choreId: string) {
    try {
      const res = await fetch(`/api/chores/${choreId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      setChores((prev) => prev.filter((c) => c.id !== choreId))
      toast.success('Chore deleted')
    } catch {
      toast.error('Failed to delete chore')
    }
  }

  function handleSaved(chore: Chore) {
    if (editingChore) {
      setChores((prev) => prev.map((c) => (c.id === chore.id ? chore : c)))
    } else {
      setChores((prev) => [...prev, chore])
    }
    setEditingChore(null)
    setDialogOpen(false)
  }

  function getScheduleLabel(chore: Chore): string {
    const freq = FREQUENCY_LABELS[chore.frequency] ?? chore.frequency
    if (chore.frequency === 'one-off') {
      if (chore.nextDueDate) {
        return `${freq} — due ${formatDate(chore.nextDueDate, timezone)}`
      }
      return freq
    }
    const multi = parseDaysOfWeek(chore.daysOfWeek)
    if (multi.length > 1) return `${freq} on ${multi.map((d) => DAY_LABELS[d]).join(', ')}`
    if (chore.dayOfWeek !== null) return `${freq} on ${DAY_LABELS[chore.dayOfWeek]}`
    if (chore.dayOfMonth !== null) return `${freq} on day ${chore.dayOfMonth}`
    return freq
  }

  function HoverDetails({ chore }: { chore: Chore }) {
    const overdue = chore.isOverdue
    const lastCompleted = chore.completions?.[0]

    return (
      <div className="bg-popover text-popover-foreground rounded-lg border shadow-xl p-3 min-w-[220px] max-w-[300px] text-xs space-y-1.5">
        {chore.note && (
          <p className="text-sm font-medium leading-snug text-muted-foreground/80 whitespace-pre-wrap">
            {chore.note}
          </p>
        )}
        {chore.description && (
          <p className="text-sm leading-snug">{chore.description}</p>
        )}

        <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
          <span className="text-muted-foreground">Schedule:</span>
          <span>{getScheduleLabel(chore)}</span>

          {chore.nextDueDate && (
            <>
              <span className="text-muted-foreground">Next due:</span>
              <span className={overdue ? 'text-amber-500 font-medium' : ''}>
                {overdue ? '⚠ ' : ''}{formatDate(chore.nextDueDate, timezone)}
              </span>
            </>
          )}

          {chore.currentAssignee && (
            <>
              <span className="text-muted-foreground">Assignee:</span>
              <span>{chore.currentAssignee.name}</span>
            </>
          )}

          <span className="text-muted-foreground">Times done:</span>
          <span>{chore._count.completions}</span>

          {chore.endDate && (
            <>
              <span className="text-muted-foreground">Ends:</span>
              <span>{formatDate(chore.endDate, timezone)}</span>
            </>
          )}

          {chore.rotationInterval > 1 && (
            <>
              <span className="text-muted-foreground">Rotation:</span>
              <span>Every {chore.rotationInterval} completions</span>
            </>
          )}

          {chore.autoRotateOnComplete && (
            <>
              <span className="text-muted-foreground">Auto-rotate:</span>
              <span>Yes</span>
            </>
          )}

          {chore.emailReminder && (
            <>
              <span className="text-muted-foreground">Email reminder:</span>
              <span>
                {chore.startTime
                  ? `${chore.emailReminderHours} hour${chore.emailReminderHours > 1 ? 's' : ''} before`
                  : `${chore.emailReminderDays} day${chore.emailReminderDays > 1 ? 's' : ''} before`}
              </span>
            </>
          )}
        </div>

        {lastCompleted && (
          <p className="text-xs text-muted-foreground/70 pt-1 border-t border-border/40 mt-1">
            Last done by {lastCompleted.completedBy.name} on{' '}
            {formatDate(lastCompleted.completedAt, timezone)}
          </p>
        )}
      </div>
    )
  }

  // Filter chores based on scope and mine/all toggle (used in list view)
  const filteredChores = chores.filter((chore) => {
    if (!publicView && chore.currentAssigneeId !== currentUserId) return false
    if (scope === 365) return true
    if (!chore.nextDueDate) return true // null = due now, always show
    const dueDate = new Date(chore.nextDueDate)
    const cutoff = new Date(Date.now() + scope * 86400000)
    return dueDate <= cutoff
  })

  // For calendar view: filter by assignee only, show all chores regardless of scope
  const calendarChores = chores.filter((chore) => {
    if (!publicView && chore.currentAssigneeId !== currentUserId) return false
    return true
  })

  function openEditChore(chore: Chore) {
    setEditingChore(chore)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          {view === 'list' ? (
            <p className="text-sm text-muted-foreground">
              {filteredChores.length} of {publicView ? chores.length : chores.filter(c => c.currentAssigneeId === currentUserId).length} active chore{chores.length !== 1 ? 's' : ''}
              {scope !== 365 && <span className="text-muted-foreground/50"> due in {scope} days</span>}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {calendarChores.length} active chore{calendarChores.length !== 1 ? 's' : ''}
            </p>
          )}
          <button
            onClick={() => setPublicView(!publicView)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              publicView
                ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
                : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
            title={publicView ? 'Showing all family chores — click to show only yours' : 'Showing only your chores — click to show all'}
          >
            {publicView ? (
              <GlobeIcon className="h-3 w-3" />
            ) : (
              <UserIcon className="h-3 w-3" />
            )}
            {publicView ? 'All' : 'Mine'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle: list / calendar */}
          <div className="flex items-center gap-0.5 border border-border rounded-lg p-0.5 bg-muted/30">
            <button
              type="button"
              onClick={() => setView('list')}
              title="List view"
              className={`h-7 w-7 flex items-center justify-center rounded-md transition-all ${
                view === 'list'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ListIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setView('calendar')}
              title="Calendar view"
              className={`h-7 w-7 flex items-center justify-center rounded-md transition-all ${
                view === 'calendar'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Scope toggle (list view only) */}
          {view === 'list' && (
            <div className="flex items-center gap-0.5 border border-border rounded-lg p-0.5 bg-muted/30">
              {([7, 30, 90, 365] as ScopeDays[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setScope(d)}
                  className={`px-2 py-0.5 text-xs font-medium rounded-md transition-colors ${
                    scope === d ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {d === 365 ? 'All' : d === 90 ? '90d' : d === 30 ? '30d' : '7d'}
                </button>
              ))}
            </div>
          )}
          <Button size="sm" onClick={() => { setEditingChore(null); setNewChoreKey(k => k + 1); setDialogOpen(true) }}>
            <PlusIcon className="h-4 w-4 mr-1" /> Add Chore
          </Button>
        </div>
      </div>

      {/* ── List View ──────────────────────────────────────────────────── */}
      {view === 'list' ? (
        <>
          {filteredChores.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {chores.length === 0
                ? 'No chores yet. Add your first household chore to get started.'
                : !publicView && !chores.some(c => c.currentAssigneeId === currentUserId)
                  ? 'No chores assigned to you. Switch to All to see family chores.'
                  : scope === 365
                    ? 'No active chores.'
                    : `No chores due in the next ${scope} days. Try expanding the time window above.`}
            </div>
          ) : (
            <div className="rounded-lg border border-border/60 divide-y divide-border/40">
              {filteredChores.map((chore) => {
                const overdue = chore.isOverdue
                const isCompleted = completedIds.has(chore.id)
                const completable = choreIsCompletable(
                  chore.nextDueDate ? new Date(chore.nextDueDate) : null,
                  chore.allowEarlyStart,
                  todayEnd
                )

                return (
                  <div
                    key={chore.id}
                    className={`group flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-muted/30 ${overdue ? 'border-l-2 border-l-amber-500' : ''} ${isCompleted ? 'opacity-50' : ''}`}
                  >
                    {/* Complete button (checkbox-style) — chores not yet due (and not
                        flagged for early completion) show a clock instead, matching the
                        dashboard, so clicking can't trigger a "not yet due" error. */}
                    {completable || isCompleted ? (
                      <button
                        onClick={() => handleComplete(chore)}
                        className={`shrink-0 flex items-center justify-center h-5 w-5 rounded border transition-all duration-200
                          ${completingIds.has(chore.id)
                            ? 'border-green-500 bg-green-500 scale-110'
                            : isCompleted
                              ? 'border-green-500 bg-green-500/20'
                              : 'border-border hover:border-green-500 hover:bg-green-500/10'
                          }`}
                        title="Mark complete"
                      >
                        <CheckIcon className={`h-3 w-3 transition-colors duration-200 ${
                          completingIds.has(chore.id) ? 'text-white' : isCompleted ? 'text-green-600' : 'text-transparent group-hover:text-green-500'
                        }`} />
                      </button>
                    ) : (
                      <div
                        className="shrink-0 flex items-center justify-center h-5 w-5 rounded border border-dashed border-muted-foreground/30 text-muted-foreground/40"
                        title="Scheduled — becomes available on its due date"
                      >
                        <ClockIcon className="h-3 w-3" />
                      </div>
                    )}

                    {/* Title + hover info */}
                    <HoverCard
                      content={<HoverDetails chore={chore} />}
                      side="bottom"
                      className="flex-1 min-w-0"
                      contentClassName=""
                    >
                      <span
                        className={`text-sm font-medium truncate block ${isCompleted ? 'line-through text-muted-foreground cursor-default' : 'cursor-pointer'}`}
                        onDoubleClick={() => openEditChore(chore)}
                      >
                        {chore.title}
                      </span>
                    </HoverCard>

                    {/* Next occurrence date */}
                    {chore.nextDueDate && (
                      <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(chore.nextDueDate, timezone)}
                      </span>
                    )}

                    {/* Overdue badge */}
                    {overdue && !isCompleted && (
                      <span className="shrink-0 text-xs font-medium text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                        Overdue
                      </span>
                    )}

                    {/* Assignee */}
                    {chore.currentAssignee ? (
                      <span className="shrink-0 text-xs text-muted-foreground truncate max-w-[100px] hidden sm:inline">
                        👤 {chore.currentAssignee.name}
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground/50 italic hidden sm:inline">
                        Unassigned
                      </span>
                    )}

                    {/* Info dot for hover hint (mobile) */}
                    <HoverCard
                      content={<HoverDetails chore={chore} />}
                      side="left"
                      contentClassName="sm:hidden"
                    >
                      <button className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors sm:hidden">
                        <InfoIcon className="h-3.5 w-3.5" />
                      </button>
                    </HoverCard>

                    {/* Actions */}
                    <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleRotate(chore.id)}
                        title="Rotate assignee"
                      >
                        <RotateCcwIcon className="h-3.5 w-3.5" />
                      </Button>
                      <button
                        onClick={() => handleDelete(chore.id)}
                        className="h-7 w-7 flex items-center justify-center text-muted-foreground/40 hover:text-destructive transition-colors"
                        aria-label="Delete chore"
                      >
                        <Trash2Icon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : (
        /* ── Calendar View ───────────────────────────────────────────── */
        <div className="rounded-lg border border-border/60 bg-background p-3">
          <ChoreCalendarView
            chores={calendarChores}
            weekStartsOn={weekStartsOn}
            timezone={timezone}
            onEditChore={openEditChore}
            onComplete={handleComplete}
            completedIds={completedIds}
            completingIds={completingIds}
          />
        </div>
      )}

      <ChoreDialog
        key={editingChore?.id ?? `new-${newChoreKey}`}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        chore={editingChore}
        members={members}
        onSaved={handleSaved}
      />
    </div>
  )
}
