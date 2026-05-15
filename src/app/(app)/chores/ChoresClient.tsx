'use client'

import { useState, useEffect } from 'react'
import { PlusIcon, RotateCcwIcon, CheckIcon, Trash2Icon, InfoIcon, UserIcon, GlobeIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { ChoreDialog } from './ChoreDialog'
import { HoverCard } from '@/components/ui/hover-card'
import { listenAppEvent, AppEvents } from '@/lib/app-events'

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
}

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

type ScopeDays = 7 | 30 | 90 | 365

export function ChoresClient({ initialChores, members, currentUserId }: ChoresClientProps) {
  const [chores, setChores] = useState<Chore[]>(initialChores)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingChore, setEditingChore] = useState<Chore | null>(null)
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set())
  // Persistently tracks chore IDs that have been completed this session (for strikethrough)
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  // Incremented each time a new chore is added, forcing ChoreDialog to re-mount with clean state
  const [newChoreKey, setNewChoreKey] = useState(0)
  const [scope, setScope] = useState<ScopeDays>(30)
  const [publicView, setPublicView] = useState(false)

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

  async function handleComplete(chore: Chore) {
    setCompletingIds((prev) => new Set(prev).add(chore.id))
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
      if (nextDate) {
        toast.success('Chore completed!', {
          description: `Next scheduled: ${formatDate(nextDate)}`,
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
                {overdue ? '⚠ ' : ''}{formatDate(chore.nextDueDate)}
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
              <span>{formatDate(chore.endDate)}</span>
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
              <span>{chore.emailReminderDays} day{chore.emailReminderDays > 1 ? 's' : ''} before</span>
            </>
          )}
        </div>

        {lastCompleted && (
          <p className="text-xs text-muted-foreground/70 pt-1 border-t border-border/40 mt-1">
            Last done by {lastCompleted.completedBy.name} on{' '}
            {new Date(lastCompleted.completedAt).toLocaleDateString('en-AU', {
              weekday: 'short', day: 'numeric', month: 'short',
            })}
          </p>
        )}
      </div>
    )
  }

  // Filter chores based on scope and mine/all toggle
  const filteredChores = chores.filter((chore) => {
    if (!publicView && chore.currentAssigneeId !== currentUserId) return false
    if (scope === 365) return true
    if (!chore.nextDueDate) return true // null = due now, always show
    const dueDate = new Date(chore.nextDueDate)
    const cutoff = new Date(Date.now() + scope * 86400000)
    return dueDate <= cutoff
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {filteredChores.length} of {publicView ? chores.length : chores.filter(c => c.currentAssigneeId === currentUserId).length} active chore{chores.length !== 1 ? 's' : ''}
            {scope !== 365 && <span className="text-muted-foreground/50"> due in {scope} days</span>}
          </p>
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
          {/* Scope toggle */}
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
          <Button size="sm" onClick={() => { setEditingChore(null); setNewChoreKey(k => k + 1); setDialogOpen(true) }}>
            <PlusIcon className="h-4 w-4 mr-1" /> Add Chore
          </Button>
        </div>
      </div>

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

            return (
              <div
                key={chore.id}
                className={`group flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-muted/30 ${overdue ? 'border-l-2 border-l-amber-500' : ''} ${isCompleted ? 'opacity-50' : ''}`}
              >
                {/* Complete button (checkbox-style) */}
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

                {/* Title + hover info */}
                <HoverCard
                  content={<HoverDetails chore={chore} />}
                  side="bottom"
                  className="flex-1 min-w-0"
                  contentClassName=""
                >
                  <span
                    className={`text-sm font-medium cursor-default truncate block ${isCompleted ? 'line-through text-muted-foreground' : ''}`}
                    onClick={() => { setEditingChore(chore); setDialogOpen(true) }}
                  >
                    {chore.title}
                  </span>
                </HoverCard>

                {/* Next occurrence date */}
                {chore.nextDueDate && (
                  <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(chore.nextDueDate)}
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
