'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { todayStringInTz } from '@/lib/timezone'
import { listenAppEvent, AppEvents } from '@/lib/app-events'
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
    const res = await fetch(`/api/meal-plan/${entryId}`, { method: 'DELETE' })
    if (res.ok) setEntries(prev => prev.filter(e => e.id !== entryId))
    else toast.error('Failed to clear meal. Please try again.')
  }

  async function removeRecipe(mealPlanRecipeId: string, mealPlanId: string) {
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
