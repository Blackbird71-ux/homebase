'use client'

import { useState } from 'react'
import { PlusIcon, RotateCcwIcon, CheckIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { ChoreDialog } from './ChoreDialog'

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
  completions: ChoreCompletion[]
  _count: { completions: number }
  createdAt: string
  updatedAt: string
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

export function ChoresClient({ initialChores, members, currentUserId }: ChoresClientProps) {
  const [chores, setChores] = useState<Chore[]>(initialChores)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingChore, setEditingChore] = useState<Chore | null>(null)

  async function handleComplete(choreId: string) {
    try {
      const res = await fetch(`/api/chores/${choreId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error('Failed to complete chore')
      const completion = await res.json()
      setChores((prev) =>
        prev.map((c) =>
          c.id === choreId
            ? { ...c, completions: [completion, ...c.completions], _count: { completions: c._count.completions + 1 } }
            : c
        )
      )
      toast.success('Chore completed!')
    } catch {
      toast.error('Failed to complete chore')
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{chores.length} active chore{chores.length !== 1 ? 's' : ''}</p>
        <Button size="sm" onClick={() => { setEditingChore(null); setDialogOpen(true) }}>
          <PlusIcon className="h-4 w-4 mr-1" /> Add Chore
        </Button>
      </div>

      {chores.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No chores yet. Add your first household chore to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {chores.map((chore) => {
            const lastCompleted = chore.completions?.[0]
            const isOverdue = lastCompleted
              ? Date.now() - new Date(lastCompleted.completedAt).getTime() > 7 * 24 * 60 * 60 * 1000
              : true

            return (
              <Card key={chore.id} className={`flex flex-col ${isOverdue ? 'border-amber-500/30' : ''}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-semibold">{chore.title}</CardTitle>
                      {chore.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{chore.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(chore.id)}
                      className="text-muted-foreground/40 hover:text-destructive transition-colors ml-2 shrink-0"
                      aria-label="Delete chore"
                    >
                      <Trash2Icon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{getScheduleLabel(chore)}</span>
                    <span>{chore._count.completions} done</span>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-border/50">
                    <div className="flex items-center gap-2 min-w-0">
                      {chore.currentAssignee ? (
                        <span className="text-xs font-medium truncate">
                          👤 {chore.currentAssignee.name}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Unassigned</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleComplete(chore.id)}
                        title="Mark complete"
                      >
                        <CheckIcon className="h-3.5 w-3.5 text-green-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleRotate(chore.id)}
                        title="Rotate assignee"
                      >
                        <RotateCcwIcon className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {lastCompleted && (
                    <p className="text-[10px] text-muted-foreground/60">
                      Last done by {lastCompleted.completedBy.name} on{' '}
                      {new Date(lastCompleted.completedAt).toLocaleDateString('en-AU', {
                        weekday: 'short', day: 'numeric', month: 'short',
                      })}
                    </p>
                  )}
                </CardContent>
              </Card>
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
