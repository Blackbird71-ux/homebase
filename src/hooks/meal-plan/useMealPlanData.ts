'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { todayStringInTz } from '@/lib/timezone'
import { listenAppEvent, AppEvents } from '@/lib/app-events'
import { OFFLINE_QUEUE_FLUSHED } from '@/lib/offline-queue'
import {
  MEAL_PLAN_SCOPE,
  isTempEntryId,
  queueMealPlanSlotState,
  queueMealPlanSlotDelete,
} from '@/lib/meal-plan-offline'
import { type MealPlanEntry, type ScopeDays, scopeDateRange } from './types'

export function useMealPlanData(
  initialWeekStart: string,
  initialEntries: MealPlanEntry[],
  timezone: string
) {
  const [weekStart, setWeekStart] = useState(() => new Date(initialWeekStart + 'T00:00:00'))
  const [entries, setEntries] = useState<MealPlanEntry[]>(initialEntries)
  const [loading, setLoading] = useState(false)
  const [scope, setScope] = useState<ScopeDays>(7)

  async function fetchRange(start: Date, sc: ScopeDays) {
    const { from, to } = scopeDateRange(start, sc)
    setLoading(true)
    try {
      const data: MealPlanEntry[] = await fetch(`/api/meal-plan?from=${from}&to=${to}`).then(r => r.json())
      setEntries(data)
    } catch {
      toast.error('Failed to load meal plan')
    } finally {
      setLoading(false)
    }
  }

  function refresh() {
    return fetchRange(weekStart, scope)
  }

  useEffect(() => {
    return listenAppEvent(AppEvents.MEAL_PLAN_UPDATED, refresh)
  }, [weekStart, scope]) // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch after the global flusher (useGlobalOfflineFlush) synced queued
  // meal-plan mutations, so temp- entries get their real server state.
  useEffect(() => {
    function handleFlushed(event: Event) {
      const listIds = (event as CustomEvent<{ listIds: string[] }>).detail?.listIds
      if (listIds?.includes(MEAL_PLAN_SCOPE)) refresh()
    }
    window.addEventListener(OFFLINE_QUEUE_FLUSHED, handleFlushed)
    return () => window.removeEventListener(OFFLINE_QUEUE_FLUSHED, handleFlushed)
  }, [weekStart, scope]) // eslint-disable-line react-hooks/exhaustive-deps

  function navWeek(direction: -1 | 1) {
    const next = new Date(weekStart)
    next.setDate(next.getDate() + direction * 7)
    setWeekStart(next)
    void fetchRange(next, scope)
  }

  function goToday() {
    const localToday = new Date(todayStringInTz(timezone) + 'T00:00:00')
    setWeekStart(localToday)
    void fetchRange(localToday, scope)
  }

  async function assign(date: string, mealType: string, data: { recipeIds?: string[]; note?: string }) {
    const existing = entries.find(e => e.date.slice(0, 10) === date && e.mealType === mealType)
    const hasExistingRecipes = existing && existing.recipes?.length > 0
    if (!navigator.onLine) {
      // Mirror the server: append merges into the existing slot, otherwise the
      // slot is replaced with exactly data.recipeIds (and note ?? null).
      const merged = hasExistingRecipes && data.recipeIds && data.recipeIds.length > 0
        ? [
            ...existing.recipes.map(r => r.recipeId),
            ...data.recipeIds.filter(id => !existing.recipes.some(r => r.recipeId === id)),
          ]
        : data.recipeIds ?? []
      // Titles/images for optimistic display from the SW-cached recipe list
      let metaById = new Map<string, { title: string; image: string | null }>()
      try {
        const all: { id: string; title: string; image: string | null }[] =
          await fetch('/api/recipes').then(r => r.ok ? r.json() : [])
        metaById = new Map(all.map(r => [r.id, { title: r.title, image: r.image ?? null }]))
      } catch { /* cache miss — placeholder titles below */ }
      const optimistic: MealPlanEntry = {
        id: existing?.id ?? `temp-${Date.now()}`,
        date: date + 'T00:00:00.000Z',
        mealType,
        recipeId: null,
        recipe: null,
        note: data.note ?? null,
        familyId: existing?.familyId ?? entries[0]?.familyId ?? '',
        recipes: merged.map((rid, i) => {
          const kept = existing?.recipes.find(r => r.recipeId === rid)
          if (kept) return { ...kept, order: i }
          const meta = metaById.get(rid)
          return {
            id: rid, recipeId: rid, order: i, courseType: null,
            recipe: { id: rid, title: meta?.title ?? 'Recipe', image: meta?.image ?? null },
          }
        }),
      }
      setEntries(prev => {
        const filtered = prev.filter(e => !(e.date.slice(0, 10) === date && e.mealType === mealType))
        return [...filtered, optimistic]
      })
      try {
        await queueMealPlanSlotState(date, mealType, merged, data.note ?? null)
        toast.success('Saved offline — will sync when you reconnect')
      } catch {
        toast.error('Failed to save offline — storage unavailable.')
      }
      return
    }
    try {
      const res = await fetch('/api/meal-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: date + 'T00:00:00Z',
          mealType,
          ...data,
          append: hasExistingRecipes && data.recipeIds && data.recipeIds.length > 0 ? true : undefined,
        }),
      })
      if (res.ok) {
        const entry: MealPlanEntry = await res.json()
        setEntries(prev => {
          const filtered = prev.filter(e => !(e.date.slice(0, 10) === date && e.mealType === mealType))
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

  async function remove(entryId: string) {
    // Offline, or an offline-created entry not yet on the server: update state
    // locally and queue the delete (temp- entries just cancel their queued POST).
    if (!navigator.onLine || isTempEntryId(entryId)) {
      const entry = entries.find(e => e.id === entryId)
      setEntries(prev => prev.filter(e => e.id !== entryId))
      if (entry) await queueMealPlanSlotDelete(entry.date.slice(0, 10), entry.mealType, entryId)
      return
    }
    const res = await fetch(`/api/meal-plan/${entryId}`, { method: 'DELETE' })
    if (res.ok) setEntries(prev => prev.filter(e => e.id !== entryId))
    else toast.error('Failed to clear meal. Please try again.')
  }

  async function removeRecipe(mealPlanRecipeId: string, mealPlanId: string) {
    // Offline (or unsynced entry): express the removal as whole-slot state —
    // MealPlanRecipe row ids are unstable across replay, so the id-based
    // DELETE route can't be queued. Removing the last recipe deletes the slot,
    // matching the online route's mealPlanDeleted behaviour.
    if (!navigator.onLine || isTempEntryId(mealPlanId)) {
      const entry = entries.find(e => e.id === mealPlanId)
      if (!entry) return
      const remaining = entry.recipes.filter(r => r.id !== mealPlanRecipeId)
      if (remaining.length === 0) {
        setEntries(prev => prev.filter(e => e.id !== mealPlanId))
        await queueMealPlanSlotDelete(entry.date.slice(0, 10), entry.mealType, mealPlanId)
      } else {
        setEntries(prev => prev.map(e => e.id !== mealPlanId ? e : { ...e, recipes: remaining }))
        await queueMealPlanSlotState(
          entry.date.slice(0, 10), entry.mealType,
          remaining.map(r => r.recipeId), entry.note,
        )
      }
      return
    }
    const res = await fetch(`/api/meal-plan/recipe/${mealPlanRecipeId}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to remove recipe. Please try again.'); return }
    const data = await res.json()
    if (data.mealPlanDeleted) {
      setEntries(prev => prev.filter(e => e.id !== mealPlanId))
    } else {
      setEntries(prev => prev.map(e =>
        e.id !== mealPlanId ? e : { ...e, recipes: e.recipes.filter(r => r.id !== mealPlanRecipeId) }
      ))
    }
  }

  async function clearPeriod(): Promise<boolean> {
    // Bulk destructive op — not queued offline by design.
    if (!navigator.onLine) {
      toast.error("You're offline — clearing the plan needs a connection.")
      return false
    }
    const { from, to } = scopeDateRange(weekStart, scope)
    try {
      const res = await fetch(`/api/meal-plan/bulk?from=${from}&to=${to}`, { method: 'DELETE' })
      if (res.ok) {
        const data = await res.json()
        setEntries(prev => prev.filter(e => { const d = e.date.slice(0, 10); return d < from || d > to }))
        toast.success(`Cleared ${data.deletedCount || 0} meal plan entries`)
        return true
      }
      const error = await res.text()
      console.error('Failed to clear week:', res.status, error)
      toast.error('Failed to clear week. Please try again.')
      return false
    } catch (error) {
      console.error('Error clearing week:', error)
      toast.error('Network error. Please try again.')
      return false
    }
  }

  return {
    weekStart, entries, setEntries, loading,
    scope, setScope,
    navWeek, goToday, refresh,
    assign, remove, removeRecipe, clearPeriod,
  }
}
