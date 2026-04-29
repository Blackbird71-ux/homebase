'use client'

import { useState } from 'react'
import { DailyMealColumn } from './DailyMealColumn'
import { AssignMealModal } from './AssignMealModal'
import { ExportGroceriesModal } from './ExportGroceriesModal'
import { SaveTemplateDialog } from './SaveTemplateDialog'
import { ApplyTemplateDialog } from './ApplyTemplateDialog'
import { Button } from '@/components/ui/button'
import { ChevronLeftIcon, ChevronRightIcon, ShoppingCartIcon, Trash2Icon, SaveIcon, FileTextIcon, MoreHorizontalIcon } from 'lucide-react'
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
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)

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
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold shrink-0">Meal Plan</h1>

        {/* ── Mobile header: nav arrows + Today + overflow menu ── */}
        <div className="flex md:hidden items-center gap-1.5">
          <Button variant="ghost" size="icon-sm" onClick={() => navWeek(-1)} disabled={loading} aria-label="Previous week">
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
          <Button variant="ghost" size="icon-sm" onClick={() => navWeek(1)} disabled={loading} aria-label="Next week">
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
          <div className="relative">
            <Button variant="outline" size="sm" onClick={() => setMoreMenuOpen((v) => !v)} aria-label="More options">
              <MoreHorizontalIcon className="h-4 w-4" />
            </Button>
            {moreMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMoreMenuOpen(false)} aria-hidden="true" />
                <div className="absolute right-0 top-full mt-1 z-20 bg-background border border-border rounded-lg shadow-lg py-1 min-w-[168px]">
                  <button type="button" onClick={() => { setSaveTemplateOpen(true); setMoreMenuOpen(false) }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent text-left">
                    <SaveIcon className="h-3.5 w-3.5 shrink-0" /> Save Template
                  </button>
                  <button type="button" onClick={() => { setApplyTemplateOpen(true); setMoreMenuOpen(false) }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent text-left">
                    <FileTextIcon className="h-3.5 w-3.5 shrink-0" /> Apply Template
                  </button>
                  <button type="button" onClick={() => { setExportOpen(true); setMoreMenuOpen(false) }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent text-left">
                    <ShoppingCartIcon className="h-3.5 w-3.5 shrink-0" /> Groceries
                  </button>
                  <div className="border-t border-border my-1" />
                  <button type="button" onClick={() => { setClearDialogOpen(true); setMoreMenuOpen(false) }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 text-left" disabled={clearing || loading}>
                    <Trash2Icon className="h-3.5 w-3.5 shrink-0" /> Clear Week
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Desktop header: all buttons in a row ── */}
        <div className="hidden md:flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setSaveTemplateOpen(true)}>
            <SaveIcon className="h-4 w-4 mr-1" /> Save Template
          </Button>
          <Button variant="outline" size="sm" onClick={() => setApplyTemplateOpen(true)}>
            <FileTextIcon className="h-4 w-4 mr-1" /> Apply Template
          </Button>
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
            <ShoppingCartIcon className="h-4 w-4 mr-1" /> Groceries
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
          <Button variant="outline" size="sm" onClick={() => setClearDialogOpen(true)} disabled={clearing || loading} className="text-destructive border-destructive hover:bg-destructive/10">
            <Trash2Icon className="h-4 w-4 mr-1" /> Clear Week
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => navWeek(-1)} disabled={loading} aria-label="Previous week">
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => navWeek(1)} disabled={loading} aria-label="Next week">
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Week label */}
      <p className="text-sm text-muted-foreground -mt-2">
        {weekStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
      </p>

      {/* ── Mobile: stacked day cards (one per day, full width) ── */}
      <div className="md:hidden flex-1 overflow-y-auto flex flex-col gap-3 pb-2">
        {days.map((day) => {
          const ymd = toYMD(day)
          const dayEntries = entries.filter((e) => e.date.slice(0, 10) === ymd)
          return (
            <div
              key={ymd}
              className={`rounded-xl border p-3 ${ymd === today ? 'border-primary/40 bg-primary/5' : 'border-border'}`}
            >
              <DailyMealColumn
                date={ymd}
                entries={dayEntries}
                isToday={ymd === today}
                onMealClick={openModal}
                onMealClear={handleClear}
                compact
              />
            </div>
          )
        })}
      </div>

      {/* ── Desktop: 7-column weekly grid ── */}
      <div className="hidden md:block overflow-x-auto flex-1">
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

      <SaveTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        weekStart={toYMD(weekStart)}
      />
      <ApplyTemplateDialog
        open={applyTemplateOpen}
        onOpenChange={setApplyTemplateOpen}
        weekStart={toYMD(weekStart)}
        onApplied={() => {
          // Refresh the current week
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

          setLoading(true)
          fetch(`/api/meal-plan?from=${from}&to=${to}`)
            .then((r) => r.json())
            .then((data: MealPlanEntry[]) => setEntries(data))
            .catch(() => toast.error('Failed to load meal plan'))
            .finally(() => setLoading(false))
        }}
      />
    </div>
  )
}
