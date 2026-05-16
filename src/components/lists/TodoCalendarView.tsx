'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, format,
  startOfDay, endOfDay, addMonths, subMonths,
} from 'date-fns'
import { ChevronLeft, ChevronRight, CheckIcon } from 'lucide-react'
import type { ListItemShape } from '@/lib/list-helpers'
import { EditItemDialog } from './EditItemDialog'
import { toast } from 'sonner'

// ─── Props ──────────────────────────────────────────────────────────────────────

interface TodoCalendarViewProps {
  items: ListItemShape[]
  members: { id: string; name: string }[]
  currentUserId: string
  listId: string
  weekStartsOn?: 0 | 1
}

// ─── Calendar badge for a single todo item (compact pill) ───────────────────────

function TodoCalendarBadge({
  item,
  onClick,
  onToggle,
  isCompleting,
}: {
  item: ListItemShape
  onClick: () => void
  onToggle: () => void
  isCompleting: boolean
}) {
  const isOverdue =
    !item.isCompleted && item.dueDate !== null && item.dueDate < startOfDay(new Date())

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        className={[
          'w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium leading-tight transition-all',
          isOverdue
            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25'
            : item.isCompleted
              ? 'bg-green-500/10 text-green-600 dark:text-green-400 line-through opacity-60'
              : 'bg-primary/10 text-primary hover:bg-primary/20',
        ].join(' ')}
        title={
          item.assignedToUserId
            ? `${item.content} → ${item.assignedToUserId}`
            : item.content
        }
      >
        <span className="truncate flex-1 min-w-0 text-left">{item.content}</span>

        {/* Mini check button appears on hover */}
        <span
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          className={[
            'shrink-0 flex items-center justify-center h-3.5 w-3.5 rounded-sm border transition-all',
            isCompleting
              ? 'border-green-500 bg-green-500'
              : item.isCompleted
                ? 'border-green-500 bg-green-500/20'
                : 'border-border opacity-0 group-hover:opacity-100 hover:border-green-500 hover:bg-green-500/10',
          ].join(' ')}
        >
          <CheckIcon
            className={[
              'h-2 w-2',
              isCompleting
                ? 'text-white'
                : item.isCompleted
                  ? 'text-green-600'
                  : 'text-transparent',
            ].join(' ')}
          />
        </span>
      </button>
    </div>
  )
}

// ─── Main calendar view ─────────────────────────────────────────────────────────

export function TodoCalendarView({
  items: initialItems,
  members,
  currentUserId,
  listId,
  weekStartsOn = 0,
}: TodoCalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [items, setItems] = useState<ListItemShape[]>(initialItems)
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set())

  // Sync items when initialItems change (e.g., list switches)
  useEffect(() => {
    setItems(initialItems)
  }, [initialItems])

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

  // Separate items with/without due dates
  const itemsWithDates = items.filter((i) => i.dueDate !== null)
  const itemsWithoutDates = items.filter((i) => i.dueDate === null && !i.isCompleted)

  function navigate(dir: 'prev' | 'next') {
    setCurrentDate(
      dir === 'next' ? addMonths(currentDate, 1) : subMonths(currentDate, 1),
    )
  }

  function goToday() {
    setCurrentDate(new Date())
  }

  function getItemsForDay(day: Date): ListItemShape[] {
    const dayStart = startOfDay(day)
    const dayEnd = endOfDay(day)
    return itemsWithDates.filter((item) => {
      if (!item.dueDate) return false
      return item.dueDate >= dayStart && item.dueDate <= dayEnd
    })
  }

  const isThisMonth =
    format(currentDate, 'M-yyyy') === format(new Date(), 'M-yyyy')

  // ─── Edit dialog state ─────────────────────────────────────────────────────

  const [editItemId, setEditItemId] = useState<string | null>(null)
  const [editItemContent, setEditItemContent] = useState('')
  const [editItemCategory, setEditItemCategory] = useState<string | null>(null)
  const [editItemDueDate, setEditItemDueDate] = useState<string | null>(null)
  const [editItemAssignedToUserId, setEditItemAssignedToUserId] = useState<string | null>(null)
  const [editDialogCategories, setEditDialogCategories] = useState<string[]>([])

  function handleEditItem(item: ListItemShape) {
    setEditItemId(item.id)
    setEditItemContent(item.content)
    setEditItemCategory(item.category || null)
    setEditItemDueDate(item.dueDate ? item.dueDate.toISOString() : null)
    setEditItemAssignedToUserId(item.assignedToUserId ?? null)
    // Extract unique categories from items
    const cats = [...new Set(items.map((i) => i.category).filter(Boolean) as string[])]
    setEditDialogCategories(cats)
  }

  function handleItemSaved(
    id: string,
    content: string,
    category: string | null,
    dueDate?: string | null,
    assignedToUserId?: string | null,
  ) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              content,
              category,
              ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
              ...(assignedToUserId !== undefined && { assignedToUserId }),
            }
          : i,
      ),
    )
  }

  // ─── Toggle completion ─────────────────────────────────────────────────────

  const handleToggle = useCallback(
    async (item: ListItemShape) => {
      const newCompleted = !item.isCompleted
      // Optimistic update
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, isCompleted: newCompleted } : i)),
      )
      setCompletingIds((prev) => new Set(prev).add(item.id))

      try {
        const res = await fetch(`/api/lists/${listId}/items/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isCompleted: newCompleted }),
        })
        if (!res.ok) {
          // Revert on failure
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id ? { ...i, isCompleted: !newCompleted } : i,
            ),
          )
          toast.error('Failed to update item')
        }
      } catch {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, isCompleted: !newCompleted } : i,
          ),
        )
        toast.error('Failed to update item')
      } finally {
        setCompletingIds((prev) => {
          const next = new Set(prev)
          next.delete(item.id)
          return next
        })
      }
    },
    [listId],
  )

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
          {itemsWithDates.length} item{itemsWithDates.length !== 1 ? 's' : ''} with dates
          {itemsWithoutDates.length > 0 && (
            <> &middot; {itemsWithoutDates.length} unassigned</>
          )}
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
          const dayItems = getItemsForDay(day)

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
                {dayItems.length > 3 && (
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {dayItems.length}
                  </span>
                )}
              </div>

              {/* Item badges */}
              <div className="flex flex-col gap-0.5 overflow-hidden flex-1">
                {dayItems.slice(0, 3).map((item) => (
                  <TodoCalendarBadge
                    key={item.id}
                    item={item}
                    onClick={() => handleEditItem(item)}
                    onToggle={() => handleToggle(item)}
                    isCompleting={completingIds.has(item.id)}
                  />
                ))}
                {dayItems.length > 3 && (
                  <span className="text-[10px] text-muted-foreground/60 pl-0.5 mt-0.5">
                    +{dayItems.length - 3} more
                  </span>
                )}
                {dayItems.length === 0 && inMonth && (
                  <span className="text-[10px] text-muted-foreground/20 select-none flex-1 flex items-end pb-0.5">
                    &mdash;
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Items without due dates ────────────────────────────────────── */}
      {itemsWithoutDates.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/60">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">
            No due date ({itemsWithoutDates.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {itemsWithoutDates.slice(0, 10).map((item) => (
              <span
                key={item.id}
                onClick={() => handleEditItem(item)}
                className={[
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium leading-tight cursor-pointer transition-colors',
                  item.isCompleted
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400 line-through opacity-60'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
                ].join(' ')}
                title={item.content}
              >
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    handleToggle(item)
                  }}
                  className="shrink-0 h-3 w-3 rounded-sm border border-border flex items-center justify-center hover:border-green-500 hover:bg-green-500/10 transition-colors"
                >
                  {item.isCompleted && (
                    <CheckIcon className="h-2 w-2 text-green-600" />
                  )}
                </span>
                <span className="truncate max-w-[120px]">{item.content}</span>
              </span>
            ))}
            {itemsWithoutDates.length > 10 && (
              <span className="text-[11px] text-muted-foreground/60 self-center">
                +{itemsWithoutDates.length - 10} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Edit Item Dialog ─────────────────────────────────────────── */}
      <EditItemDialog
        open={editItemId !== null}
        onOpenChange={(open) => {
          if (!open) setEditItemId(null)
        }}
        itemId={editItemId ?? ''}
        initialContent={editItemContent}
        initialCategory={editItemCategory}
        availableCategories={editDialogCategories}
        listId={listId}
        onSaved={handleItemSaved}
        initialDueDate={editItemDueDate}
        initialAssignedToUserId={editItemAssignedToUserId}
        members={members}
      />
    </div>
  )
}
