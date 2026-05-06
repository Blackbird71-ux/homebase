'use client'

import { useState } from 'react'
import { PlusIcon, RotateCcwIcon, CheckIcon, Trash2Icon, InfoIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { ChoreDialog } from './ChoreDialog'
import { HoverCard } from '@/components/ui/hover-card'

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
  emailReminder: boolean
  emailReminderDays: number
  completions: ChoreCompletion[]
  _count: { completions: number }
  createdAt: string
  updatedAt: string
}

interface ChoresClientProps {
  initialChores: Chore[]
  members: Member[]
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

function isOverdue(nextDueDate: string | null): boolean {
  if (!nextDueDate) return false
  return new Date(nextDueDate) < new Date()
}

export function ChoresClient({ initialChores, members }: ChoresClientProps) {
  const [chores, setChores] = useState<Chore[]>(initialChores)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingChore, setEditingChore] = useState<Chore | null>(null)
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set())

  async function handleComplete(chore: Chore) {
    setCompletingIds((prev) => new Set(prev).add(chore.id))
    try {
      const res = await fetch(`/api/chores/${chore.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error('Failed to complete chore')
      const data = await res.json()
      const updatedChore = {
        ...chore,
        ...data.chore,
        completions: [data.completion, ...chore.completions],
        _count: { completions: chore._count.completions + 1 },
      }
      setChores((prev) => prev.map((c) => (c.id === chore.id ? updatedChore : c)))

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
    const overdue = isOverdue(chore.nextDueDate)
    const lastCompleted = chore.completions?.[0]

    return (
      <div className="bg-popover text-popover-foreground rounded-lg border shadow-xl p-3 min-w-[220px] max-w-[300px] text-xs space-y-1.5">
        {chore.description && (
          <p className="text-sm font-medium leading-snug">{chore.description}</p>
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
          <p className="text-[11px] text-muted-foreground/70 pt-1 border-t border-border/40 mt-1">
            Last done by {lastCompleted.completedBy.name} on{' '}
            {new Date(lastCompleted.completedAt).toLocaleDateString('en-AU', {
              weekday: 'short', day: 'numeric', month: 'short',
            })}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{chores.length} active chore{chores.length !== 1 ? 's' : ''}</p>
        <Button size="sm" onClick={() => { setEditingChore(null); setDialogOpen(true) }}>
          <PlusIcon className="h-4 w-4 mr-1" /> Add Chore
        </Button>
      </div>

      {chores.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground text-sm">
          No chores yet. Add your first household chore to get started.
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 divide-y divide-border/40">
          {chores.map((chore) => {
            const overdue = isOverdue(chore.nextDueDate)

            return (
              <div
                key={chore.id}
                className={`group flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-muted/30 ${overdue ? 'border-l-2 border-l-amber-500' : ''}`}
              >
                {/* Complete button (checkbox-style) */}
                <button
                  onClick={() => handleComplete(chore)}
                  className={`shrink-0 flex items-center justify-center h-5 w-5 rounded border transition-all duration-200
                    ${completingIds.has(chore.id)
                      ? 'border-green-500 bg-green-500 scale-110'
                      : 'border-border hover:border-green-500 hover:bg-green-500/10'
                    }`}
                  title="Mark complete"
                >
                  <CheckIcon className={`h-3 w-3 transition-colors duration-200 ${
                    completingIds.has(chore.id) ? 'text-white' : 'text-transparent group-hover:text-green-500'
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
                    className="text-sm font-medium cursor-default truncate block"
                    onClick={() => { setEditingChore(chore); setDialogOpen(true) }}
                  >
                    {chore.title}
                  </span>
                </HoverCard>

                {/* Overdue badge */}
                {overdue && (
                  <span className="shrink-0 text-[11px] font-medium text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
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
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        chore={editingChore}
        members={members}
        onSaved={handleSaved}
      />
    </div>
  )
}