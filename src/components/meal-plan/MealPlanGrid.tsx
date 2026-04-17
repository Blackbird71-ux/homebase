'use client'

import { useState } from 'react'
import { MealSlotCell } from './MealSlotCell'
import { AssignMealModal } from './AssignMealModal'
import { ExportGroceriesModal } from './ExportGroceriesModal'
import { Button } from '@/components/ui/button'
import { ChevronLeftIcon, ChevronRightIcon, ShoppingCartIcon } from 'lucide-react'
import { todayStringInTz } from '@/lib/timezone'
import { toast } from 'sonner'

interface MealPlanEntry {
  id: string
  date: string // ISO string
  mealType: string
  recipeId: string | null
  recipe: { id: string; title: string } | null
  note: string | null
  familyId: string
}

interface MealPlanGridProps {
  weekStartsOn: number // 0 = Sunday, 1 = Monday
  initialWeekStart: string // ISO date string of first day to show YYYY-MM-DD
  initialEntries: MealPlanEntry[]
  timezone: string
}

function getWeekDays(startDate: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    return d
  })
}

function toYMD(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function startOfWeek(date: Date, weekStartsOn: number): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day - weekStartsOn + 7) % 7
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function MealPlanGrid({
  weekStartsOn,
  initialWeekStart,
  initialEntries,
  timezone,
}: MealPlanGridProps) {
  const [weekStart, setWeekStart] = useState(() => new Date(initialWeekStart + 'T00:00:00'))
  const [entries, setEntries] = useState<MealPlanEntry[]>(initialEntries)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedMealType] = useState('dinner')
  const [loading, setLoading] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  const days = getWeekDays(weekStart)

  function navWeek(direction: -1 | 1) {
    const next = new Date(weekStart)
    next.setDate(next.getDate() + direction * 7)
    setWeekStart(next)

    const from = toYMD(next)
    const toDate = new Date(next)
    toDate.setDate(toDate.getDate() + 6)
    const to = toYMD(toDate)

    setLoading(true)
    fetch(`/api/meal-plan?from=${from}T00:00:00Z&to=${to}T23:59:59Z`)
      .then((r) => r.json())
      .then((data: MealPlanEntry[]) => setEntries(data))
      .catch(() => toast.error('Failed to load meal plan'))
      .finally(() => setLoading(false))
  }

  function goToday() {
    // Get today's local date string in the family's timezone
    const todayStr = todayStringInTz(timezone)
    const localToday = new Date(todayStr + 'T00:00:00')
    const todayWeekStart = startOfWeek(localToday, weekStartsOn)
    setWeekStart(todayWeekStart)
    const from = toYMD(todayWeekStart)
    const toDate = new Date(todayWeekStart)
    toDate.setDate(toDate.getDate() + 6)
    const to = toYMD(toDate)

    setLoading(true)
    fetch(`/api/meal-plan?from=${from}T00:00:00Z&to=${to}T23:59:59Z`)
      .then((r) => r.json())
      .then((data: MealPlanEntry[]) => setEntries(data))
      .catch(() => toast.error('Failed to load meal plan'))
      .finally(() => setLoading(false))
  }

  function openModal(date: string) {
    setSelectedDate(date)
    setModalOpen(true)
  }

  async function handleAssign(data: { recipeId?: string; note?: string }): Promise<void> {
    if (!selectedDate) return
    const res = await fetch('/api/meal-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: selectedDate + 'T00:00:00Z',
        mealType: selectedMealType,
        ...data,
      }),
    })
    if (res.ok) {
      const entry: MealPlanEntry = await res.json()
      setEntries((prev) => {
        const filtered = prev.filter(
          (e) => !(e.date.slice(0, 10) === selectedDate && e.mealType === selectedMealType)
        )
        return [...filtered, entry]
      })
    } else {
      toast.error('Failed to save meal. Please try again.')
    }
  }

  async function handleClear(entryId: string) {
    const res = await fetch(`/api/meal-plan/${entryId}`, { method: 'DELETE' })
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== entryId))
    } else {
      toast.error('Failed to clear meal. Please try again.')
    }
  }

  const today = todayStringInTz(timezone)

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 h-full overflow-hidden">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Meal Plan</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExportOpen(true)}
          >
            <ShoppingCartIcon className="h-4 w-4 mr-1" />
            Groceries
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navWeek(-1)}
            disabled={loading}
            aria-label="Previous week"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navWeek(1)}
            disabled={loading}
            aria-label="Next week"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Week label */}
      <p className="text-sm text-muted-foreground">
        {weekStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
      </p>

      {/* Grid — scrolls horizontally on mobile */}
      <div className="overflow-x-auto flex-1">
      <div className="grid grid-cols-7 gap-2 min-w-[640px]">
        {/* Day headers */}
        {days.map((day) => {
          const ymd = toYMD(day)
          return (
            <div key={ymd} className="flex flex-col items-center gap-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                {day.toLocaleDateString(undefined, { weekday: 'short' })}
              </p>
              <p
                className={`text-sm font-semibold h-7 w-7 flex items-center justify-center rounded-full ${
                  ymd === today ? 'bg-primary text-primary-foreground' : ''
                }`}
              >
                {day.getDate()}
              </p>
            </div>
          )
        })}

        {/* Meal cells */}
        {days.map((day) => {
          const ymd = toYMD(day)
          const entry = entries.find(
            (e) => e.date.slice(0, 10) === ymd && e.mealType === 'dinner'
          )
          return (
            <MealSlotCell
              key={ymd}
              date={ymd}
              mealPlanId={entry?.id ?? null}
              recipeName={entry?.recipe?.title ?? null}
              note={entry?.note ?? null}
              onClick={() => openModal(ymd)}
              onClear={() => entry && handleClear(entry.id)}
            />
          )
        })}
      </div>
      </div>

      {selectedDate && (
        <AssignMealModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          date={selectedDate}
          mealType={selectedMealType}
          onAssign={handleAssign}
        />
      )}
      <ExportGroceriesModal
        open={exportOpen}
        onOpenChange={setExportOpen}
        weekFrom={toYMD(weekStart)}
        weekTo={toYMD(days[days.length - 1])}
      />
    </div>
  )
}
