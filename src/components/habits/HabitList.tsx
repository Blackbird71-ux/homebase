'use client'

import { CheckIcon, PencilIcon } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { HabitView } from '@/lib/habit-helpers'

interface HabitListProps {
  habits: HabitView[]
  onHabitsChange: (habits: HabitView[]) => void
  /** Same flag the list was loaded with, so refreshes keep the same set. */
  includeInactive?: boolean
  /** When provided, each row shows an edit button. */
  onEdit?: (habit: HabitView) => void
}

function streakLabel(h: HabitView) {
  if (h.streak < 1) return null
  return h.streakUnit === 'day' ? `${h.streak}-day streak` : `${h.streak}-wk streak`
}

/**
 * One-tap habit checklist shared by /habits and the Today page. Ticks are
 * optimistic; the list is re-fetched afterwards so streaks come from the server.
 */
export function HabitList({ habits, onHabitsChange, includeInactive = false, onEdit }: HabitListProps) {
  async function toggle(h: HabitView) {
    const done = !h.doneToday
    onHabitsChange(
      habits.map((x) =>
        x.id === h.id ? { ...x, doneToday: done, weekCount: Math.max(0, x.weekCount + (done ? 1 : -1)) } : x
      )
    )
    try {
      const res = await fetch(`/api/habits/${h.id}/check-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done }),
      })
      if (!res.ok) throw new Error()
      const fresh = await fetch(`/api/habits${includeInactive ? '?includeInactive=true' : ''}`)
      if (fresh.ok) onHabitsChange(await fresh.json())
    } catch {
      toast.error('Could not save check-in')
      onHabitsChange(habits)
    }
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {habits.map((h) => {
        const streak = streakLabel(h)
        return (
          <li key={h.id} className={cn('flex items-center gap-3 text-sm', !h.isActive && 'opacity-60')}>
            <button
              type="button"
              role="checkbox"
              aria-checked={h.doneToday}
              aria-label={`${h.doneToday ? 'Untick' : 'Tick'} ${h.name} for today`}
              disabled={!h.isActive}
              onClick={() => toggle(h)}
              className={cn(
                'h-6 w-6 shrink-0 rounded-full border flex items-center justify-center',
                h.doneToday ? 'bg-primary border-primary text-primary-foreground' : 'border-border hover:bg-muted'
              )}
            >
              {h.doneToday && <CheckIcon className="h-4 w-4" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate">
                {h.name}
                {!h.isActive && <span className="text-xs text-muted-foreground"> · paused</span>}
              </div>
              <div className="text-xs text-muted-foreground">
                {h.weekCount}/{h.weekTarget} this week{streak && ` · ${streak}`}
              </div>
            </div>
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(h)}
                aria-label={`Edit ${h.name}`}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <PencilIcon className="h-4 w-4" />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
