'use client'

import { useState } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, format,
  startOfDay, endOfDay, addMonths, subMonths,
} from 'date-fns'
import { ChevronLeft, ChevronRight, CheckIcon } from 'lucide-react'

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
  completions: ChoreCompletion[]
  _count: { completions: number }
  createdAt: string
  updatedAt: string
  isOverdue: boolean
}

interface ChoreCalendarViewProps {
  chores: Chore[]
  weekStartsOn: 0 | 1
  onEditChore: (chore: Chore) => void
  onComplete: (chore: Chore) => void
  completedIds: Set<string>
  completingIds: Set<string>
}

// ─── Calendar badge for a single chore (compact pill) ─────────────────────────

function ChoreCalendarBadge({
  chore,
  onClick,
  onComplete,
  isCompleted,
  isCompleting,
}: {
  chore: Chore
  onClick: () => void
  onComplete: () => void
  isCompleted: boolean
  isCompleting: boolean
}) {
  const isOverdue = chore.isOverdue && !isCompleted

  return (
    <div className="group relative">
      {/* The pill badge */}
      <button
        type="button"
        onClick={onClick}
        className={[
          'w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium leading-tight transition-all',
          isOverdue
            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25'
            : isCompleted
              ? 'bg-green-500/10 text-green-600 dark:text-green-400 line-through opacity-60'
              : 'bg-primary/10 text-primary hover:bg-primary/20',
        ].join(' ')}
        title={
          chore.currentAssignee
            ? `${chore.title} → ${chore.currentAssignee.name}`
            : chore.title
        }
      >
        <span className="truncate flex-1 min-w-0 text-left">{chore.title}</span>

        {/* Mini check button appears on hover */}
        <span
          onClick={(e) => {
            e.stopPropagation()
            onComplete()
          }}
          className={[
            'shrink-0 flex items-center justify-center h-3.5 w-3.5 rounded-sm border transition-all',
            isCompleting
              ? 'border-green-500 bg-green-500'
              : isCompleted
                ? 'border-green-500 bg-green-500/20'
                : 'border-border opacity-0 group-hover:opacity-100 hover:border-green-500 hover:bg-green-500/10',
          ].join(' ')}
        >
          <CheckIcon
            className={[
              'h-2 w-2',
              isCompleting
                ? 'text-white'
                : isCompleted
                  ? 'text-green-600'
                  : 'text-transparent',
            ].join(' ')}
          />
        </span>
      </button>
    </div>
  )
}

// ─── Main calendar view ────────────────────────────────────────────────────────

export function ChoreCalendarView({
  chores,
  weekStartsOn = 0,
  onEditChore,
  onComplete,
  completedIds,
  completingIds,
}: ChoreCalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date())

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart, { weekStartsOn })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const dayHeaders =
    weekStartsOn === 0
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const weeks = Math.ceil(days.length / 7)

  function navigate(dir: 'prev' | 'next') {
    setCurrentDate(
      dir === 'next' ? addMonths(currentDate, 1) : subMonths(currentDate, 1),
    )
  }

  function goToday() {
    setCurrentDate(new Date())
  }

  function getChoresForDay(day: Date): Chore[] {
    const dayStart = startOfDay(day)
    const dayEnd = endOfDay(day)
    return chores.filter((chore) => {
      if (!chore.nextDueDate) return false
      const dueDate = new Date(chore.nextDueDate)
      return dueDate >= dayStart && dueDate <= dayEnd
    })
  }

  const isThisMonth =
    format(currentDate, 'M-yyyy') === format(new Date(), 'M-yyyy')

  return (
    <div className="flex flex-col h-full">
      {/* ── Month navigation ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('prev')}
            className="h-7 w-7 flex items-center justify-center rounded-md border border-border/70 bg-background hover:bg-accent transition-colors shrink-0"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => navigate('next')}
            className="h-7 w-7 flex items-center justify-center rounded-md border border-border/70 bg-background hover:bg-accent transition-colors shrink-0"
            aria-label="Next month"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <span className="text-sm font-semibold">
            {format(currentDate, 'MMMM yyyy')}
          </span>
          <button
            type="button"
            onClick={goToday}
            className={[
              'px-2 py-0.5 text-xs font-semibold rounded-full border transition-colors shrink-0',
              isThisMonth
                ? 'border-primary/40 text-primary bg-primary/10 cursor-default'
                : 'border-border/70 text-muted-foreground bg-background hover:bg-accent hover:text-foreground',
            ].join(' ')}
          >
            Today
          </button>
        </div>
        <span className="text-xs text-muted-foreground">
          {chores.length} active chore{chores.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Day headers ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-7 border-b border-border/60 bg-muted/30 rounded-t-lg">
        {dayHeaders.map((d, i) => {
          const isWeekend =
            weekStartsOn === 0 ? i === 0 || i === 6 : i === 5 || i === 6
          return (
            <div
              key={d}
              className={[
                'py-1.5 text-center text-xs font-semibold uppercase tracking-wider',
                isWeekend ? 'text-muted-foreground/60' : 'text-muted-foreground',
              ].join(' ')}
            >
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{d.slice(0, 1)}</span>
            </div>
          )
        })}
      </div>

      {/* ── Day grid ──────────────────────────────────────────────────── */}
      <div
        className="flex-1 grid grid-cols-7 border-l border-border/60 border-r border-border/60 rounded-b-lg overflow-hidden"
        style={{
          gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))`,
        }}
      >
        {days.map((day, idx) => {
          const col = idx % 7
          const isWeekend =
            weekStartsOn === 0 ? col === 0 || col === 6 : col === 5 || col === 6
          const inMonth = isSameMonth(day, currentDate)
          const today = isToday(day)
          const dayChores = getChoresForDay(day)

          return (
            <div
              key={day.toISOString()}
              className={[
                'border-b border-r border-border/50 flex flex-col gap-0.5 p-1 transition-colors',
                !inMonth ? 'opacity-35' : '',
                isWeekend && inMonth ? 'bg-muted/20' : '',
                today ? 'bg-primary/[0.04]' : 'hover:bg-accent/10',
              ].join(' ')}
            >
              {/* Date number */}
              <div className="flex items-center justify-between mb-0.5">
                <span
                  className={[
                    'text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full shrink-0',
                    today
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-foreground',
                  ].join(' ')}
                >
                  {format(day, 'd')}
                </span>
                {dayChores.length > 3 && (
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {dayChores.length}
                  </span>
                )}
              </div>

              {/* Chore badges */}
              <div className="flex flex-col gap-0.5 overflow-hidden flex-1">
                {dayChores.slice(0, 3).map((chore) => (
                  <ChoreCalendarBadge
                    key={chore.id}
                    chore={chore}
                    onClick={() => onEditChore(chore)}
                    onComplete={() => onComplete(chore)}
                    isCompleted={completedIds.has(chore.id)}
                    isCompleting={completingIds.has(chore.id)}
                  />
                ))}
                {dayChores.length > 3 && (
                  <span className="text-[10px] text-muted-foreground/60 pl-0.5 mt-0.5">
                    +{dayChores.length - 3} more
                  </span>
                )}
                {dayChores.length === 0 && inMonth && (
                  <span className="text-[10px] text-muted-foreground/20 select-none flex-1 flex items-end pb-0.5">
                    —
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
