'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import { type MealPlanEntry, type ScopeDays, scopeDateRange } from './types'

export function useMealPlanDragDrop({
  entries,
  setEntries,
  weekStart,
  scope,
}: {
  entries: MealPlanEntry[]
  setEntries: React.Dispatch<React.SetStateAction<MealPlanEntry[]>>
  weekStart: Date
  scope: ScopeDays
}) {
  const [activeDragEntry, setActiveDragEntry] = useState<MealPlanEntry | null>(null)
  const [activeDragRecipe, setActiveDragRecipe] = useState<{
    recipeName: string
    courseType?: string
    imageUrl?: string | null
  } | null>(null)
  const [newlyMovedEntryIds, setNewlyMovedEntryIds] = useState<Set<string>>(new Set())

  function markNewlyMoved(id: string) {
    setNewlyMovedEntryIds(prev => { const next = new Set(prev); next.add(id); return next })
    setTimeout(() => {
      setNewlyMovedEntryIds(prev => { const next = new Set(prev); next.delete(id); return next })
    }, 10000)
  }

  function replaceNewlyMoved(oldId: string, newId: string) {
    setNewlyMovedEntryIds(prev => {
      const next = new Set(prev); next.delete(oldId); next.add(newId); return next
    })
  }

  async function refreshEntries() {
    const { from, to } = scopeDateRange(weekStart, scope)
    const res = await fetch(`/api/meal-plan?from=${from}&to=${to}`)
    if (res.ok) setEntries(await res.json())
  }

  function handleDragStart(event: DragStartEvent) {
    const { active } = event
    const dragData = active.data.current as Record<string, unknown> | undefined
    if (dragData?.type === 'recipe') {
      setActiveDragRecipe({
        recipeName: dragData.recipeName as string,
        courseType: dragData.courseType as string | undefined,
      })
      setActiveDragEntry(null)
    } else if (dragData?.type === 'search-recipe') {
      // Dragging from the right panel recipe browser
      setActiveDragRecipe({
        recipeName: dragData.recipeName as string,
      })
      setActiveDragEntry(null)
    } else {
      setActiveDragEntry(entries.find(e => e.id === active.id) ?? null)
      setActiveDragRecipe(null)
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveDragEntry(null)
    setActiveDragRecipe(null)
    if (!over) return

    const dragData = active.data.current as Record<string, unknown> | undefined
    const targetData = over.data.current as { date: string; mealType: string } | undefined
    if (!targetData) return

    const { date: targetDate, mealType: targetMealType } = targetData

    if (dragData?.type === 'search-recipe') {
      // Drag from right panel — assign recipe to target slot
      await handleSearchRecipeDrop(
        dragData.recipeId as string,
        dragData.recipeName as string,
        targetDate,
        targetMealType,
      )
    } else if (dragData?.type === 'recipe') {
      await handleRecipeDragEnd(active.id as string, dragData, targetDate, targetMealType)
    } else {
      await handleEntryDragEnd(active.id as string, targetDate, targetMealType)
    }
  }

  // ── New: drop from the right panel search browser ────────────────────────

  async function handleSearchRecipeDrop(
    recipeId: string,
    recipeName: string,
    targetDate: string,
    targetMealType: string,
  ) {
    try {
      const res = await fetch('/api/meal-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: targetDate + 'T00:00:00Z',
          mealType: targetMealType,
          recipeIds: [recipeId],
          append: true,
        }),
      })
      if (res.ok) {
        const entry: MealPlanEntry = await res.json()
        setEntries(prev => {
          const filtered = prev.filter(e => !(e.date.slice(0, 10) === targetDate && e.mealType === targetMealType))
          return [...filtered, entry]
        })
        markNewlyMoved(entry.id)
        toast.success(`Added ${recipeName}`)
      } else {
        const errorText = await res.text()
        console.error('Search recipe drop failed:', res.status, errorText)
        toast.error('Failed to add recipe. Please try again.')
      }
    } catch (error) {
      console.error('Search recipe drop error:', error)
      toast.error('Network error adding recipe. Please try again.')
    }
  }

  // ── Existing handlers (unchanged) ────────────────────────────────────────

  async function handleRecipeDragEnd(
    recipeId: string,
    dragData: Record<string, unknown>,
    targetDate: string,
    targetMealType: string
  ) {
    const sourceEntryId = dragData.sourceEntryId as string
    const sourceDate = dragData.sourceDate as string
    const sourceMealType = dragData.sourceMealType as string
    if (sourceDate === targetDate && sourceMealType === targetMealType) return

    const sourceEntry = entries.find(e => e.id === sourceEntryId)
    if (!sourceEntry) return
    const movingRecipe = sourceEntry.recipes?.find(r => r.id === recipeId)
    if (!movingRecipe) return

    const existingTarget = entries.find(e => e.date.slice(0, 10) === targetDate && e.mealType === targetMealType)
    const updatedSourceRecipes = sourceEntry.recipes.filter(r => r.id !== recipeId)

    const optimisticTarget: MealPlanEntry = existingTarget
      ? {
          ...existingTarget,
          recipes: [
            ...(existingTarget.recipes || []),
            { id: movingRecipe.id, recipeId: movingRecipe.recipeId, order: existingTarget.recipes?.length || 0, courseType: movingRecipe.courseType, recipe: { ...movingRecipe.recipe } },
          ],
        }
      : {
          id: `temp-${Date.now()}`,
          date: targetDate + 'T00:00:00.000Z',
          mealType: targetMealType,
          recipeId: null, recipe: null, note: null,
          familyId: sourceEntry.familyId,
          recipes: [{ id: movingRecipe.id, recipeId: movingRecipe.recipeId, order: 0, courseType: movingRecipe.courseType, recipe: { ...movingRecipe.recipe } }],
        }

    setEntries(prev => {
      const withUpdatedSource = prev.map(e => {
        if (e.id !== sourceEntryId) return e
        return updatedSourceRecipes.length === 0 ? null : { ...e, recipes: updatedSourceRecipes }
      }).filter(Boolean) as MealPlanEntry[]
      const withoutTarget = existingTarget ? withUpdatedSource.filter(e => e.id !== existingTarget.id) : withUpdatedSource
      return [...withoutTarget, optimisticTarget]
    })

    markNewlyMoved(optimisticTarget.id)

    try {
      const res = await fetch(`/api/meal-plan/recipe/${recipeId}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDate, targetMealType }),
      })
      if (!res.ok) {
        console.error('Recipe move failed:', res.status, await res.text())
        toast.error('Failed to move recipe. Please try again.')
        await refreshEntries()
        return
      }
      const result = await res.json()
      setEntries(prev => {
        let cleaned = prev.filter(e => e.id !== optimisticTarget.id && e.id !== sourceEntryId)
        if (existingTarget) cleaned = cleaned.filter(e => e.id !== existingTarget.id)
        return [...cleaned, result.target, ...(result.source ? [result.source] : [])]
      })
      replaceNewlyMoved(optimisticTarget.id, result.target.id)
      toast.success('Recipe moved successfully')
    } catch (error) {
      console.error('Recipe move error:', error)
      toast.error('Network error moving recipe. Please try again.')
      await refreshEntries()
    }
  }

  async function handleEntryDragEnd(sourceId: string, targetDate: string, targetMealType: string) {
    const sourceEntry = entries.find(e => e.id === sourceId)
    if (!sourceEntry) return
    if (sourceEntry.date.slice(0, 10) === targetDate && sourceEntry.mealType === targetMealType) return

    const sourceRecipes = sourceEntry.recipes?.map(r => ({
      id: r.id, recipeId: r.recipeId, order: r.order, courseType: r.courseType,
      recipe: { id: r.recipe.id, title: r.recipe.title, image: r.recipe.image },
    })) || []

    const existingTarget = entries.find(e => e.date.slice(0, 10) === targetDate && e.mealType === targetMealType)

    const optimisticTarget: MealPlanEntry = existingTarget
      ? { ...existingTarget, recipes: [...(existingTarget.recipes || []), ...sourceRecipes] }
      : { id: `temp-${Date.now()}`, date: targetDate + 'T00:00:00.000Z', mealType: targetMealType, recipeId: null, recipe: null, note: null, familyId: sourceEntry.familyId, recipes: sourceRecipes }

    setEntries(prev => {
      const withoutSource = prev.filter(e => e.id !== sourceId)
      const withoutTarget = existingTarget ? withoutSource.filter(e => e.id !== existingTarget.id) : withoutSource
      return [...withoutTarget, optimisticTarget]
    })

    markNewlyMoved(optimisticTarget.id)

    try {
      const res = await fetch(`/api/meal-plan/${sourceId}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDate, targetMealType }),
      })
      if (!res.ok) {
        console.error('Move failed:', res.status, await res.text())
        toast.error('Failed to move meal. Please try again.')
        await refreshEntries()
        return
      }
      const result = await res.json()
      setEntries(prev => {
        const withoutOptimistic = prev.filter(e => e.id !== optimisticTarget.id && e.id !== sourceId)
        const cleaned = existingTarget ? withoutOptimistic.filter(e => e.id !== existingTarget.id) : withoutOptimistic
        return [...cleaned, result.target]
      })
      replaceNewlyMoved(optimisticTarget.id, result.target.id)
      toast.success('Meal moved successfully')
    } catch (error) {
      console.error('Move error:', error)
      toast.error('Network error moving meal. Please try again.')
      await refreshEntries()
    }
  }

  return { activeDragEntry, activeDragRecipe, newlyMovedEntryIds, handleDragStart, handleDragEnd }
}
