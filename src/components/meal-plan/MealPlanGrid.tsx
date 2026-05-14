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
import { DEFAULT_MEAL_TYPE, type MealType } from '@/lib/meal-types'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { MealSlotCell } from './MealSlotCell'
import { useMealPlanData } from '@/hooks/meal-plan/useMealPlanData'
import { useMealPlanDragDrop } from '@/hooks/meal-plan/useMealPlanDragDrop'
import { type MealPlanEntry, type ScopeDays, getScopeDays, toYMD } from '@/hooks/meal-plan/types'

interface MealPlanGridProps {
  weekStartsOn: number
  initialWeekStart: string
  initialEntries: MealPlanEntry[]
  timezone: string
}

export function MealPlanGrid({ weekStartsOn: _weekStartsOn, initialWeekStart, initialEntries, timezone }: MealPlanGridProps) {
  const mealData = useMealPlanData(initialWeekStart, initialEntries, timezone)
  const { weekStart, entries, setEntries, loading, scope, setScope, navWeek, goToday, refresh, assign, remove, clearPeriod } = mealData

  const drag = useMealPlanDragDrop({ entries, setEntries, weekStart, scope })

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedMealType, setSelectedMealType] = useState(DEFAULT_MEAL_TYPE)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportMealPlanIds, setExportMealPlanIds] = useState<string[] | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedMealIds, setSelectedMealIds] = useState<Set<string>>(new Set())
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  )

  const days = getScopeDays(weekStart, scope)
  const today = todayStringInTz(timezone)

  function openModal(date: string, mealType: MealType = DEFAULT_MEAL_TYPE) {
    setSelectedDate(date)
    setSelectedMealType(mealType)
    setModalOpen(true)
  }

  function toggleSelectMode() {
    setSelectMode(v => !v)
    setSelectedMealIds(new Set())
  }

  function toggleMealSelection(entryId: string) {
    setSelectedMealIds(prev => {
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
    const ok = await clearPeriod()
    if (ok) setClearDialogOpen(false)
    setClearing(false)
  }

  return (
    <DndContext sensors={sensors} onDragStart={drag.handleDragStart} onDragEnd={drag.handleDragEnd}>
      <div className="flex flex-col gap-1 p-2 md:p-3 h-full overflow-hidden">
        <div className="flex items-center justify-between gap-1">
          <h1 className="text-xl font-semibold shrink-0">Meal Plan</h1>

          {/* ── Mobile header ── */}
          <div className="flex md:hidden items-center gap-1.5">
            <Button variant="ghost" size="icon-sm" onClick={() => navWeek(-1)} disabled={loading} aria-label="Previous week">
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
            <Button variant="ghost" size="icon-sm" onClick={() => navWeek(1)} disabled={loading} aria-label="Next week">
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setMoreMenuOpen(v => !v)} aria-label="More options">
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
                      <Trash2Icon className="h-3.5 w-3.5 shrink-0" /> Clear
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Desktop header ── */}
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
            <Button variant={selectMode ? 'default' : 'outline'} size="sm" onClick={toggleSelectMode}>
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
              <Trash2Icon className="h-4 w-4 mr-1" /> Clear
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => navWeek(-1)} disabled={loading} aria-label="Previous week">
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => navWeek(1)} disabled={loading} aria-label="Next week">
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Week label + scope selector */}
        <div className="flex items-center justify-between gap-2 -mt-1">
          <p className="text-sm text-muted-foreground">
            {weekStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </p>
          <div className="hidden sm:flex items-center gap-0.5 border border-border rounded-lg p-0.5 bg-muted/30">
            {([7, 14, 30] as ScopeDays[]).map(d => (
              <button key={d} type="button" onClick={() => setScope(d)}
                className={`px-2.5 py-0.5 text-xs font-medium rounded-md transition-colors ${
                  scope === d ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}>
                {d === 30 ? '30d' : d === 14 ? '14d' : 'Week'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex sm:hidden items-center gap-1">
          <div className="flex items-center gap-0.5 border border-border rounded-lg p-0.5 bg-muted/30">
            {([7, 14, 30] as ScopeDays[]).map(d => (
              <button key={d} type="button" onClick={() => setScope(d)}
                className={`px-2.5 py-0.5 text-xs font-medium rounded-md transition-colors ${
                  scope === d ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}>
                {d === 30 ? '30d' : d === 14 ? '14d' : 'Week'}
              </button>
            ))}
          </div>
        </div>

        {/* Day cards — responsive grid */}
        <div className="flex-1 overflow-y-auto pb-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5 md:gap-2">
            {days.map(day => {
              const ymd = toYMD(day)
              const dayEntries = entries.filter(e => e.date.slice(0, 10) === ymd)
              return (
                <div key={ymd} className={`rounded-xl border p-1.5 ${ymd === today ? 'border-primary/30 bg-primary/5' : 'border-border'}`}>
                <DailyMealColumn
                  date={ymd}
                  entries={dayEntries}
                  isToday={ymd === today}
                  onMealClick={openModal}
                  onMealClear={remove}
                  onMealAddToGroceries={(entryId) => { setExportMealPlanIds([entryId]); setExportOpen(true) }}
                  selectMode={selectMode}
                  selectedMealIds={selectedMealIds}
                  onToggleMealSelect={toggleMealSelection}
                  compact
                  newlyMovedEntryIds={drag.newlyMovedEntryIds}
                />
              </div>
            )
          })}
          </div>
        </div>

        {/* Select mode floating bar */}
        {selectMode && (
          <div className="md:hidden fixed bottom-20 left-4 right-4 z-30 flex items-center justify-between gap-2 bg-background border border-border rounded-xl px-4 py-3 shadow-lg">
            <span className="text-sm text-muted-foreground">{selectedMealIds.size} meal{selectedMealIds.size !== 1 ? 's' : ''} selected</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={toggleSelectMode}>Cancel</Button>
              <Button size="sm" disabled={selectedMealIds.size === 0} onClick={handleAddSelectedToGroceries}>
                <ShoppingCartIcon className="h-4 w-4 mr-1" />Add to Groceries
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
              const existingEntry = entries.find(e => e.date.slice(0, 10) === selectedDate && e.mealType === selectedMealType)
              return existingEntry?.recipes?.map(r => ({
                id: r.id, recipeId: r.recipeId, recipeName: r.recipe.title,
                order: r.order, courseType: r.courseType ?? undefined,
              })) || []
            })()}
            onAssign={data => assign(selectedDate, selectedMealType, data)}
          />
        )}

        <ExportGroceriesModal
          open={exportOpen}
          onOpenChange={open => { setExportOpen(open); if (!open) setExportMealPlanIds(null) }}
          weekFrom={toYMD(weekStart)}
          weekTo={toYMD(days[days.length - 1])}
          mealPlanIds={exportMealPlanIds ?? undefined}
        />

        <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-destructive">Clear This Period?</DialogTitle>
              <DialogDescription>
                This will remove all meal plans from{' '}
                {weekStart.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} through{' '}
                {days[days.length - 1].toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}.
                <br />
                <span className="font-semibold">This action cannot be undone.</span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setClearDialogOpen(false)} disabled={clearing}>Cancel</Button>
              <Button variant="destructive" onClick={handleClearWeek} disabled={clearing}>
                {clearing ? 'Clearing...' : `Clear ${scope} Days`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <SaveTemplateDialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen} weekStart={toYMD(weekStart)} />
        <ApplyTemplateDialog
          open={applyTemplateOpen}
          onOpenChange={setApplyTemplateOpen}
          weekStart={toYMD(weekStart)}
          onApplied={refresh}
        />
      </div>

      <DragOverlay>
        {drag.activeDragEntry ? (
          <div className="w-72">
            <MealSlotCell
              date={drag.activeDragEntry.date.slice(0, 10)}
              mealPlanId={drag.activeDragEntry.id}
              recipeName={drag.activeDragEntry.recipe?.title ?? null}
              recipes={drag.activeDragEntry.recipes?.map(r => ({
                id: r.id, recipeId: r.recipeId, recipeName: r.recipe.title,
                imageUrl: r.recipe.image, courseType: r.courseType ?? undefined, order: r.order,
              }))}
              note={drag.activeDragEntry.note}
              mealType={drag.activeDragEntry.mealType}
              onClick={() => {}}
              onClear={() => {}}
              isDragOverlay
            />
          </div>
        ) : drag.activeDragRecipe ? (
          <div className="w-64 rounded-lg border border-primary/50 bg-card px-3 py-2 shadow-xl rotate-2 scale-105">
            <div className="flex items-center gap-2">
              <GripVerticalIcon className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
              {drag.activeDragRecipe.courseType && (
                <span className="text-[10px] font-medium text-muted-foreground shrink-0">
                  {drag.activeDragRecipe.courseType}:
                </span>
              )}
              <span className="text-xs font-medium">{drag.activeDragRecipe.recipeName}</span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
