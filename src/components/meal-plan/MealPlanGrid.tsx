'use client'

import { useState } from 'react'
import { DailyMealColumn } from './DailyMealColumn'
import { AssignMealModal } from './AssignMealModal'
import { ExportGroceriesModal } from './ExportGroceriesModal'
import { Button } from '@/components/ui/button'
import { ChevronLeftIcon, ChevronRightIcon, ShoppingCartIcon, Trash2Icon } from 'lucide-react'
import { todayStringInTz } from '@/lib/timezone'
import { toast } from 'sonner'
import { DEFAULT_MEAL_TYPE, type MealType } from '@/lib/meal-types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface MealPlanEntry {
  id: string
  date: string // ISO string
  mealType: string
  recipeId: string | null
  recipe: { id: string; title: string } | null
  note: string | null
  familyId: string
  recipes: Array<{
    id: string
    recipeId: string
    order: number
    courseType: string | null
    recipe: { id: string; title: string }
  }>
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
  const [selectedMealType, setSelectedMealType] = useState(DEFAULT_MEAL_TYPE)
  const [loading, setLoading] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [clearing, setClearing] = useState(false)

  const days = getWeekDays(weekStart)

  function navWeek(direction: -1 | 1) {
    const next = new Date(weekStart)
    next.setDate(next.getDate() + direction * 7)
    setWeekStart(next)

    // Convert local dates to UTC for API query
    const fromLocal = new Date(next)
    fromLocal.setHours(0, 0, 0, 0)
    const fromUTC = new Date(Date.UTC(
      fromLocal.getFullYear(),
      fromLocal.getMonth(),
      fromLocal.getDate()
    ))
    const from = fromUTC.toISOString().slice(0, 10)

    const toDateLocal = new Date(next)
    toDateLocal.setDate(toDateLocal.getDate() + 6)
    toDateLocal.setHours(23, 59, 59, 999)
    const toUTC = new Date(Date.UTC(
      toDateLocal.getFullYear(),
      toDateLocal.getMonth(),
      toDateLocal.getDate(),
      23, 59, 59, 999
    ))
    const to = toUTC.toISOString().slice(0, 10)

    setLoading(true)
    fetch(`/api/meal-plan?from=${from}&to=${to}`)
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
    
    // Convert local dates to UTC for API query
    const fromLocal = new Date(todayWeekStart)
    fromLocal.setHours(0, 0, 0, 0)
    const fromUTC = new Date(Date.UTC(
      fromLocal.getFullYear(),
      fromLocal.getMonth(),
      fromLocal.getDate()
    ))
    const from = fromUTC.toISOString().slice(0, 10)
    
    const toDateLocal = new Date(todayWeekStart)
    toDateLocal.setDate(toDateLocal.getDate() + 6)
    toDateLocal.setHours(23, 59, 59, 999)
    const toUTC = new Date(Date.UTC(
      toDateLocal.getFullYear(),
      toDateLocal.getMonth(),
      toDateLocal.getDate(),
      23, 59, 59, 999
    ))
    const to = toUTC.toISOString().slice(0, 10)

    setLoading(true)
    fetch(`/api/meal-plan?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((data: MealPlanEntry[]) => setEntries(data))
      .catch(() => toast.error('Failed to load meal plan'))
      .finally(() => setLoading(false))
  }

  function openModal(date: string, mealType: MealType = DEFAULT_MEAL_TYPE) {
    setSelectedDate(date)
    setSelectedMealType(mealType)
    setModalOpen(true)
  }

  async function handleAssign(data: { recipeIds?: string[]; note?: string }): Promise<void> {
    if (!selectedDate) return
    try {
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
        const errorText = await res.text()
        console.error('Meal plan save failed:', res.status, errorText)
        toast.error(`Failed to save meal (${res.status}). Please try again.`)
      }
    } catch (error) {
      console.error('Meal plan save error:', error)
      toast.error('Network error saving meal. Please try again.')
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

  async function handleClearWeek() {
    setClearing(true)
    try {
      // Convert local dates to UTC for API query (same as navWeek)
      const fromLocal = new Date(weekStart)
      fromLocal.setHours(0, 0, 0, 0)
      const fromUTC = new Date(Date.UTC(
        fromLocal.getFullYear(),
        fromLocal.getMonth(),
        fromLocal.getDate()
      ))
      const from = fromUTC.toISOString().slice(0, 10)
      
      const toDateLocal = new Date(weekStart)
      toDateLocal.setDate(toDateLocal.getDate() + 6)
      toDateLocal.setHours(23, 59, 59, 999)
      const toUTC = new Date(Date.UTC(
        toDateLocal.getFullYear(),
        toDateLocal.getMonth(),
        toDateLocal.getDate(),
        23, 59, 59, 999
      ))
      const to = toUTC.toISOString().slice(0, 10)

      const res = await fetch(`/api/meal-plan/bulk?from=${from}&to=${to}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        const data = await res.json()
        // Clear all entries for the current week
        setEntries((prev) => prev.filter((e) => {
          const entryDateStr = e.date.slice(0, 10) // YYYY-MM-DD
          // Keep entries that are NOT in the cleared date range
          return entryDateStr < from || entryDateStr > to
        }))
        toast.success(`Cleared ${data.deletedCount || 0} meal plan entries`)
        setClearDialogOpen(false)
      } else {
        const error = await res.text()
        console.error('Failed to clear week:', res.status, error)
        toast.error('Failed to clear week. Please try again.')
      }
    } catch (error) {
      console.error('Error clearing week:', error)
      toast.error('Network error. Please try again.')
    } finally {
      setClearing(false)
    }
  }

  const today = todayStringInTz(timezone)

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 h-full overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 sm:justify-between">
        <h1 className="text-xl font-semibold">Meal Plan</h1>
        <div className="flex items-center gap-2 flex-wrap">
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
            variant="outline"
            size="sm"
            onClick={() => setClearDialogOpen(true)}
            disabled={clearing || loading}
            className="text-destructive border-destructive hover:bg-destructive/10"
          >
            <Trash2Icon className="h-4 w-4 mr-1" />
            Clear Week
          </Button>
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
        <div className="grid grid-cols-7 gap-4 min-w-[960px]">
          {days.map((day) => {
            const ymd = toYMD(day)
            const dayEntries = entries.filter((e) => e.date.slice(0, 10) === ymd)
            return (
              <DailyMealColumn
                key={ymd}
                date={ymd}
                entries={dayEntries}
                isToday={ymd === today}
                onMealClick={openModal}
                onMealClear={handleClear}
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
          existingRecipes={(() => {
            // Find existing entry for this date and meal type
            const existingEntry = entries.find(
              (e) => e.date.slice(0, 10) === selectedDate && e.mealType === selectedMealType
            )
            return existingEntry?.recipes?.map(r => ({
              id: r.id,
              recipeId: r.recipeId,
              recipeName: r.recipe.title,
              order: r.order,
              courseType: r.courseType ?? undefined,
            })) || []
          })()}
          onAssign={handleAssign}
        />
      )}
      <ExportGroceriesModal
        open={exportOpen}
        onOpenChange={setExportOpen}
        weekFrom={toYMD(weekStart)}
        weekTo={toYMD(days[days.length - 1])}
      />

      {/* Clear Week Confirmation Dialog */}
      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Clear This Week?</DialogTitle>
            <DialogDescription>
              This will remove all meal plans for the week of{' '}
              {weekStart.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} through{' '}
              {days[days.length - 1].toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}.
              <br />
              <span className="font-semibold">This action cannot be undone.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setClearDialogOpen(false)}
              disabled={clearing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearWeek}
              disabled={clearing}
            >
              {clearing ? 'Clearing...' : 'Clear Week'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
