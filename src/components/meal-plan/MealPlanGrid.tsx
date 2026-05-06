'use client'

import { useState } from 'react'
import { DailyMealColumn } from './DailyMealColumn'

import { AssignMealModal } from './AssignMealModal'
import { ExportGroceriesModal } from './ExportGroceriesModal'
import { SaveTemplateDialog } from './SaveTemplateDialog'
import { ApplyTemplateDialog } from './ApplyTemplateDialog'
import { Button } from '@/components/ui/button'
import { ChevronLeftIcon, ChevronRightIcon, ShoppingCartIcon, Trash2Icon, SaveIcon, FileTextIcon, MoreHorizontalIcon, GripVerticalIcon } from 'lucide-react'
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
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { MealSlotCell } from './MealSlotCell'

interface MealPlanEntry {
  id: string
  date: string // ISO string
  mealType: string
  recipeId: string | null
  recipe: { id: string; title: string; image: string | null } | null
  note: string | null
  familyId: string
  recipes: Array<{
    id: string
    recipeId: string
    order: number
    courseType: string | null
    recipe: { id: string; title: string; image: string | null }
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

function weekDateRange(weekStart: Date): { from: string; to: string } {
  const fromLocal = new Date(weekStart)
  fromLocal.setHours(0, 0, 0, 0)
  const from = new Date(Date.UTC(
    fromLocal.getFullYear(),
    fromLocal.getMonth(),
    fromLocal.getDate()
  )).toISOString().slice(0, 10)

  const toDateLocal = new Date(weekStart)
  toDateLocal.setDate(toDateLocal.getDate() + 6)
  const to = new Date(Date.UTC(
    toDateLocal.getFullYear(),
    toDateLocal.getMonth(),
    toDateLocal.getDate(),
    23, 59, 59, 999
  )).toISOString().slice(0, 10)

  return { from, to }
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
  const [exportMealPlanIds, setExportMealPlanIds] = useState<string[] | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedMealIds, setSelectedMealIds] = useState<Set<string>>(new Set())
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)

  // Drag and drop state
  const [activeDragEntry, setActiveDragEntry] = useState<MealPlanEntry | null>(null)
  const [activeDragRecipe, setActiveDragRecipe] = useState<{
    recipeName: string
    courseType?: string
    imageUrl?: string | null
  } | null>(null)
  const [newlyMovedEntryIds, setNewlyMovedEntryIds] = useState<Set<string>>(new Set())

  const days = getWeekDays(weekStart)

  // Configure sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts (prevents accidental drags)
      },
    }),
    useSensor(KeyboardSensor)
  )

  function navWeek(direction: -1 | 1) {
    const next = new Date(weekStart)
    next.setDate(next.getDate() + direction * 7)
    setWeekStart(next)

    const { from, to } = weekDateRange(next)
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
    
    const { from, to } = weekDateRange(todayWeekStart)
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
    
    // Check if there's already an entry for this slot
    const existingEntry = entries.find(
      (e) => e.date.slice(0, 10) === selectedDate && e.mealType === selectedMealType
    )
    const hasExistingRecipes = existingEntry && existingEntry.recipes?.length > 0
    
    try {
      const res = await fetch('/api/meal-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate + 'T00:00:00Z',
          mealType: selectedMealType,
          ...data,
          // If there are existing recipes, append new ones instead of replacing
          append: hasExistingRecipes && data.recipeIds && data.recipeIds.length > 0 ? true : undefined,
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

  function handleAddMealToGroceries(entryId: string) {
    setExportMealPlanIds([entryId])
    setExportOpen(true)
  }

  function toggleSelectMode() {
    setSelectMode((v) => !v)
    setSelectedMealIds(new Set())
  }

  function toggleMealSelection(entryId: string) {
    setSelectedMealIds((prev) => {
      const next = new Set(prev)
      if (next.has(entryId)) next.delete(entryId)
      else next.add(entryId)
      return next
    })
  }

  function handleAddSelectedToGroceries() {
    if (selectedMealIds.size === 0) return
    setExportMealPlanIds([...selectedMealIds])
    setExportOpen(true)
    setSelectMode(false)
    setSelectedMealIds(new Set())
  }

  async function handleClearWeek() {
    setClearing(true)
    try {
      const { from, to } = weekDateRange(weekStart)
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

  // ── Drag and Drop handlers ──

  function handleDragStart(event: DragStartEvent) {
    const { active } = event
    const dragData = active.data.current as Record<string, unknown> | undefined

    if (dragData?.type === 'recipe') {
      // Dragging an individual recipe
      setActiveDragRecipe({
        recipeName: dragData.recipeName as string,
        courseType: dragData.courseType as string | undefined,
      })
      setActiveDragEntry(null)
    } else {
      // Dragging an entire entry
      const entryId = active.id as string
      const entry = entries.find((e) => e.id === entryId)
      if (entry) {
        setActiveDragEntry(entry)
      }
      setActiveDragRecipe(null)
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveDragEntry(null)
    setActiveDragRecipe(null)

    if (!over) return

    const dragData = active.data.current as Record<string, unknown> | undefined

    // Get target info from the droppable data
    const targetData = over.data.current as { date: string; mealType: string } | undefined
    if (!targetData) return

    const { date: targetDate, mealType: targetMealType } = targetData

    if (dragData?.type === 'recipe') {
      // ── Moving a single recipe ──
      await handleRecipeDragEnd(active.id as string, dragData, targetDate, targetMealType)
    } else {
      // ── Moving an entire entry ──
      await handleEntryDragEnd(active.id as string, targetDate, targetMealType)
    }
  }

  async function handleRecipeDragEnd(
    recipeId: string,
    dragData: Record<string, unknown>,
    targetDate: string,
    targetMealType: string
  ) {
    const sourceEntryId = dragData.sourceEntryId as string
    const sourceDate = dragData.sourceDate as string
    const sourceMealType = dragData.sourceMealType as string

    // Check if dropping on the same slot
    if (sourceDate === targetDate && sourceMealType === targetMealType) return

    // Find the source entry
    const sourceEntry = entries.find((e) => e.id === sourceEntryId)
    if (!sourceEntry) return

    // Find the recipe being moved
    const movingRecipe = sourceEntry.recipes?.find((r) => r.id === recipeId)
    if (!movingRecipe) return

    // Find existing target entry
    const existingTargetEntry = entries.find(
      (e) => e.date.slice(0, 10) === targetDate && e.mealType === targetMealType
    )

    // Optimistic UI update: remove recipe from source, add to target
    const updatedSourceRecipes = sourceEntry.recipes.filter((r) => r.id !== recipeId)

    const updatedTargetEntry: MealPlanEntry = existingTargetEntry
      ? {
          ...existingTargetEntry,
          recipes: [
            ...(existingTargetEntry.recipes || []),
            {
              id: movingRecipe.id,
              recipeId: movingRecipe.recipeId,
              order: (existingTargetEntry.recipes?.length || 0),
              courseType: movingRecipe.courseType,
              recipe: { ...movingRecipe.recipe },
            },
          ],
        }
      : {
          id: `temp-${Date.now()}`,
          date: targetDate + 'T00:00:00.000Z',
          mealType: targetMealType,
          recipeId: null,
          recipe: null,
          note: null,
          familyId: sourceEntry.familyId,
          recipes: [{
            id: movingRecipe.id,
            recipeId: movingRecipe.recipeId,
            order: 0,
            courseType: movingRecipe.courseType,
            recipe: { ...movingRecipe.recipe },
          }],
        }

    // Optimistic update
    setEntries((prev) => {
      // Update source entry (remove the moved recipe)
      const withUpdatedSource = prev.map((e) => {
        if (e.id === sourceEntryId) {
          if (updatedSourceRecipes.length === 0) {
            return null // will be filtered out
          }
          return { ...e, recipes: updatedSourceRecipes }
        }
        return e
      }).filter(Boolean) as MealPlanEntry[]

      // Remove existing target entry if it exists (we'll replace with updated)
      const withoutTarget = existingTargetEntry
        ? withUpdatedSource.filter((e) => e.id !== existingTargetEntry.id)
        : withUpdatedSource

      return [...withoutTarget, updatedTargetEntry]
    })

    // Mark as newly moved
    setNewlyMovedEntryIds((prev) => {
      const next = new Set(prev)
      next.add(updatedTargetEntry.id)
      return next
    })

    // Clear newly moved indicator after 10 seconds
    setTimeout(() => {
      setNewlyMovedEntryIds((prev) => {
        const next = new Set(prev)
        next.delete(updatedTargetEntry.id)
        return next
      })
    }, 10000)

    // API call
    try {
      const res = await fetch(`/api/meal-plan/recipe/${recipeId}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetDate,
          targetMealType,
        }),
      })

      if (!res.ok) {
        const errorText = await res.text()
        console.error('Recipe move failed:', res.status, errorText)
        toast.error('Failed to move recipe. Please try again.')
        // Refresh entries to revert optimistic update
        const { from, to } = weekDateRange(weekStart)
        const refreshRes = await fetch(`/api/meal-plan?from=${from}&to=${to}`)
        if (refreshRes.ok) {
          const data: MealPlanEntry[] = await refreshRes.json()
          setEntries(data)
        }
        return
      }

      const result = await res.json()

      // Update with server response to get correct IDs
      setEntries((prev) => {
        // Remove the optimistic entries
        let cleaned = prev.filter(
          (e) => e.id !== updatedTargetEntry.id && e.id !== sourceEntryId
        )
        // Remove the old target entry if it existed
        if (existingTargetEntry) {
          cleaned = cleaned.filter((e) => e.id !== existingTargetEntry.id)
        }

        const updated: MealPlanEntry[] = [result.target]

        // Add source entry if it still exists (has remaining recipes)
        if (result.source) {
          updated.push(result.source)
        }

        return [...cleaned, ...updated]
      })

      // Update newly moved to use the real ID from server
      setNewlyMovedEntryIds((prev) => {
        const next = new Set(prev)
        next.delete(updatedTargetEntry.id)
        next.add(result.target.id)
        return next
      })

      toast.success('Recipe moved successfully')
    } catch (error) {
      console.error('Recipe move error:', error)
      toast.error('Network error moving recipe. Please try again.')
      // Refresh entries
      const { from, to } = weekDateRange(weekStart)
      const refreshRes = await fetch(`/api/meal-plan?from=${from}&to=${to}`)
      if (refreshRes.ok) {
        const data: MealPlanEntry[] = await refreshRes.json()
        setEntries(data)
      }
    }
  }

  async function handleEntryDragEnd(
    sourceId: string,
    targetDate: string,
    targetMealType: string
  ) {
    const sourceEntry = entries.find((e) => e.id === sourceId)
    if (!sourceEntry) return

    // Check if dropping on the same slot
    const sourceDate = sourceEntry.date.slice(0, 10)
    if (sourceDate === targetDate && sourceEntry.mealType === targetMealType) return

    // Optimistic UI update: remove from source, add to target
    const sourceEntryRecipes = sourceEntry.recipes?.map(r => ({
      id: r.id,
      recipeId: r.recipeId,
      order: r.order,
      courseType: r.courseType,
      recipe: { id: r.recipe.id, title: r.recipe.title, image: r.recipe.image },
    })) || []

    // Find existing target entry
    const existingTargetEntry = entries.find(
      (e) => e.date.slice(0, 10) === targetDate && e.mealType === targetMealType
    )

    // Build the updated target entry
    const updatedTargetEntry: MealPlanEntry = existingTargetEntry
      ? {
          ...existingTargetEntry,
          recipes: [
            ...(existingTargetEntry.recipes || []),
            ...sourceEntryRecipes,
          ],
        }
      : {
          id: `temp-${Date.now()}`,
          date: targetDate + 'T00:00:00.000Z',
          mealType: targetMealType,
          recipeId: null,
          recipe: null,
          note: null,
          familyId: sourceEntry.familyId,
          recipes: sourceEntryRecipes,
        }

    // Optimistic update
    setEntries((prev) => {
      // Remove source entry
      const withoutSource = prev.filter((e) => e.id !== sourceId)
      // Remove existing target entry if it exists (we'll replace with updated)
      const withoutTarget = existingTargetEntry
        ? withoutSource.filter((e) => e.id !== existingTargetEntry.id)
        : withoutSource
      return [...withoutTarget, updatedTargetEntry]
    })

    // Mark as newly moved
    setNewlyMovedEntryIds((prev) => {
      const next = new Set(prev)
      next.add(updatedTargetEntry.id)
      return next
    })

    // Clear newly moved indicator after 10 seconds
    setTimeout(() => {
      setNewlyMovedEntryIds((prev) => {
        const next = new Set(prev)
        next.delete(updatedTargetEntry.id)
        return next
      })
    }, 10000)

    // API call
    try {
      const res = await fetch(`/api/meal-plan/${sourceId}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetDate,
          targetMealType,
        }),
      })

      if (!res.ok) {
        const errorText = await res.text()
        console.error('Move failed:', res.status, errorText)
        toast.error('Failed to move meal. Please try again.')
        // Refresh entries to revert optimistic update
        const { from, to } = weekDateRange(weekStart)
        const refreshRes = await fetch(`/api/meal-plan?from=${from}&to=${to}`)
        if (refreshRes.ok) {
          const data: MealPlanEntry[] = await refreshRes.json()
          setEntries(data)
        }
        return
      }

      const result = await res.json()
      // Update with server response to get correct IDs
      setEntries((prev) => {
        // Remove the optimistic target entry
        const withoutOptimistic = prev.filter(
          (e) => e.id !== updatedTargetEntry.id && e.id !== sourceId
        )
        // Remove the old target entry if it existed
        const cleaned = existingTargetEntry
          ? withoutOptimistic.filter((e) => e.id !== existingTargetEntry.id)
          : withoutOptimistic
        return [...cleaned, result.target]
      })

      // Update newly moved to use the real ID from server
      setNewlyMovedEntryIds((prev) => {
        const next = new Set(prev)
        next.delete(updatedTargetEntry.id)
        next.add(result.target.id)
        return next
      })

      toast.success('Meal moved successfully')
    } catch (error) {
      console.error('Move error:', error)
      toast.error('Network error moving meal. Please try again.')
      // Refresh entries
      const { from, to } = weekDateRange(weekStart)
      const refreshRes = await fetch(`/api/meal-plan?from=${from}&to=${to}`)
      if (refreshRes.ok) {
        const data: MealPlanEntry[] = await refreshRes.json()
        setEntries(data)
      }
    }
  }

  const today = todayStringInTz(timezone)

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-2 p-3 md:p-4 h-full overflow-hidden">
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
                      <ShoppingCartIcon className="h-3.5 w-3.5 shrink-0" /> Add All to Groceries
                    </button>
                    <button type="button" onClick={() => { toggleSelectMode(); setMoreMenuOpen(false) }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent text-left">
                      <ShoppingCartIcon className="h-3.5 w-3.5 shrink-0" /> {selectMode ? 'Cancel Select' : 'Select Meals…'}
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
              <ShoppingCartIcon className="h-4 w-4 mr-1" /> Add All to Groceries
            </Button>
            <Button
              variant={selectMode ? 'default' : 'outline'}
              size="sm"
              onClick={toggleSelectMode}
            >
              <ShoppingCartIcon className="h-4 w-4 mr-1" />
              {selectMode ? 'Cancel' : 'Select Meals…'}
            </Button>
            {selectMode && selectedMealIds.size > 0 && (
              <Button size="sm" onClick={handleAddSelectedToGroceries}>
                <ShoppingCartIcon className="h-4 w-4 mr-1" />
                Add {selectedMealIds.size} to Groceries
              </Button>
            )}
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

        {/* ── Stacked day cards (one per day, full width) ── */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-2 pb-2">
          {days.map((day) => {
            const ymd = toYMD(day)
            const dayEntries = entries.filter((e) => e.date.slice(0, 10) === ymd)
            return (
              <div
                key={ymd}
                className={`rounded-xl border p-2 ${ymd === today ? 'border-primary/40 bg-primary/5' : 'border-border'}`}
              >
                <DailyMealColumn
                  date={ymd}
                  entries={dayEntries}
                  isToday={ymd === today}
                  onMealClick={openModal}
                  onMealClear={handleClear}
                  onMealAddToGroceries={handleAddMealToGroceries}
                  selectMode={selectMode}
                  selectedMealIds={selectedMealIds}
                  onToggleMealSelect={toggleMealSelection}
                  compact
                  newlyMovedEntryIds={newlyMovedEntryIds}
                />
              </div>
            )
          })}
        </div>

        {/* Select mode floating bar (mobile) */}
        {selectMode && (
          <div className="md:hidden fixed bottom-20 left-4 right-4 z-30 flex items-center justify-between gap-2 bg-background border border-border rounded-xl px-4 py-3 shadow-lg">
            <span className="text-sm text-muted-foreground">{selectedMealIds.size} meal{selectedMealIds.size !== 1 ? 's' : ''} selected</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={toggleSelectMode}>Cancel</Button>
              <Button size="sm" disabled={selectedMealIds.size === 0} onClick={handleAddSelectedToGroceries}>
                <ShoppingCartIcon className="h-4 w-4 mr-1" />
                Add to Groceries
              </Button>
            </div>
          </div>
        )}

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
          onOpenChange={(open) => { setExportOpen(open); if (!open) setExportMealPlanIds(null) }}
          weekFrom={toYMD(weekStart)}
          weekTo={toYMD(days[days.length - 1])}
          mealPlanIds={exportMealPlanIds ?? undefined}
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
            const { from, to } = weekDateRange(weekStart)
            setLoading(true)
            fetch(`/api/meal-plan?from=${from}&to=${to}`)
              .then((r) => r.json())
              .then((data: MealPlanEntry[]) => setEntries(data))
              .catch(() => toast.error('Failed to load meal plan'))
              .finally(() => setLoading(false))
          }}
        />
      </div>

      {/* Drag overlay — shows a floating copy of the dragged item */}
      <DragOverlay>
        {activeDragEntry ? (
          <div className="w-72">
            <MealSlotCell
              date={activeDragEntry.date.slice(0, 10)}
              mealPlanId={activeDragEntry.id}
              recipeName={activeDragEntry.recipe?.title ?? null}
              recipes={activeDragEntry.recipes?.map(r => ({
                id: r.id,
                recipeId: r.recipeId,
                recipeName: r.recipe.title,
                imageUrl: r.recipe.image,
                courseType: r.courseType ?? undefined,
                order: r.order,
              }))}
              note={activeDragEntry.note}
              mealType={activeDragEntry.mealType}
              onClick={() => {}}
              onClear={() => {}}
              isDragOverlay
            />
          </div>
        ) : activeDragRecipe ? (
          <div className="w-64 rounded-lg border border-primary/50 bg-card px-3 py-2 shadow-xl rotate-2 scale-105">
            <div className="flex items-center gap-2">
              <GripVerticalIcon className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
              {activeDragRecipe.courseType && (
                <span className="text-[10px] font-medium text-muted-foreground shrink-0">
                  {activeDragRecipe.courseType}:
                </span>
              )}
              <span className="text-xs font-medium">
                {activeDragRecipe.recipeName}
              </span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
