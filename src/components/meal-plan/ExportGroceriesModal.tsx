'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { DEFAULT_SHOPPING_CATEGORIES } from '@/lib/list-helpers'
import type { ShoppingCategory } from '@/lib/list-helpers'
import { toast } from 'sonner'
import { ShoppingCartIcon, CheckIcon, PlusIcon, CheckCheckIcon, MinusIcon, TypeIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isLikelyHeading } from '@/lib/ingredient-helpers'

interface PreviewIngredient {
  text: string
  key: string
  category: ShoppingCategory
  source: 'learned' | 'custom' | 'guessed'
  alreadyInList?: boolean
}

interface PreviewRecipe {
  date: string
  title: string
  mealType: string
  ingredients: PreviewIngredient[]
}

interface GroceriesList {
  id: string
  itemCount: number
}

export interface ExportGroceriesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  weekFrom: string // YYYY-MM-DD
  weekTo: string   // YYYY-MM-DD
  mealPlanIds?: string[] // if set, only export these specific meal plan entries
}

type Status = 'loading' | 'ready' | 'confirming' | 'saving'

interface IngredientCategory {
  id: string
  category: string
  isCustom: boolean
}

function recipeKey(r: PreviewRecipe) {
  return `${r.title}||${r.date}||${r.mealType}`
}

/** Unique key for an ingredient within its recipe context */
function ingredientKey(recipe: PreviewRecipe, ing: PreviewIngredient, index: number) {
  return `${recipeKey(recipe)}||${ing.key}||${ing.text}||${index}`
}

export function ExportGroceriesModal({
  open,
  onOpenChange,
  weekFrom,
  weekTo,
  mealPlanIds,
}: ExportGroceriesModalProps) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>('loading')
  const [recipes, setRecipes] = useState<PreviewRecipe[]>([])
  const [groceriesList, setGroceriesList] = useState<GroceriesList | null>(null)
  const [overrides, setOverrides] = useState<Map<string, ShoppingCategory>>(new Map())
  const [selectedRecipeKeys, setSelectedRecipeKeys] = useState<Set<string>>(new Set())
  const [selectedIngredientKeys, setSelectedIngredientKeys] = useState<Set<string>>(new Set())
  const [allCategories, setAllCategories] = useState<string[]>(DEFAULT_SHOPPING_CATEGORIES)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setStatus('loading')
    setOverrides(new Map())

    // Load custom categories
    fetch('/api/ingredient-categories', { signal: controller.signal })
      .then((r) => r.json())
      .then((data: IngredientCategory[]) => {
        if (Array.isArray(data) && data.length > 0) {
          // Build ordered list: system defaults first, then custom ones not already in defaults
          const names = data.map((c) => c.category)
          const extras = names.filter((n) => !DEFAULT_SHOPPING_CATEGORIES.includes(n))
          setAllCategories([...DEFAULT_SHOPPING_CATEGORIES, ...extras])
        }
      })
      .catch(() => { /* keep defaults */ })

    const idsParam = mealPlanIds?.length ? `&mealPlanIds=${mealPlanIds.join(',')}` : ''
    fetch(
      `/api/meal-plan/export-preview?from=${weekFrom}T00:00:00Z&to=${weekTo}T23:59:59Z${idsParam}`,
      { signal: controller.signal }
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.recipes.length === 0) {
          onOpenChange(false)
          toast.info('No recipes found to add.')
          return
        }
        const fetchedRecipes: PreviewRecipe[] = data.recipes
        setRecipes(fetchedRecipes)
        setSelectedRecipeKeys(new Set(fetchedRecipes.map(recipeKey)))

        // Pre-select ingredients: everything EXCEPT ALL CAPS headings
        const initialIngredientKeys = new Set<string>()
        for (const recipe of fetchedRecipes) {
          recipe.ingredients.forEach((ing, idx) => {
            if (!isLikelyHeading(ing.text)) {
              initialIngredientKeys.add(ingredientKey(recipe, ing, idx))
            }
          })
        }
        setSelectedIngredientKeys(initialIngredientKeys)

        setGroceriesList(data.groceriesList)
        setStatus('ready')
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        onOpenChange(false)
        toast.error('Failed to load ingredients. Please try again.')
      })

    return () => controller.abort()
  }, [open, weekFrom, weekTo, mealPlanIds]) // eslint-disable-line react-hooks/exhaustive-deps

  function getCategory(ing: PreviewIngredient): ShoppingCategory {
    return (overrides.get(ing.key) ?? ing.category) as ShoppingCategory
  }

  function setCategory(key: string, cat: ShoppingCategory) {
    setOverrides((prev) => new Map(prev).set(key, cat))
  }

  function toggleRecipe(key: string) {
    setSelectedRecipeKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleIngredient(ingKey: string) {
    setSelectedIngredientKeys((prev) => {
      const next = new Set(prev)
      if (next.has(ingKey)) next.delete(ingKey)
      else next.add(ingKey)
      return next
    })
  }

  function buildItems() {
    return recipes
      .filter((r) => selectedRecipeKeys.has(recipeKey(r)))
      .flatMap((r) =>
        r.ingredients
          .filter((ing, idx) => selectedIngredientKeys.has(ingredientKey(r, ing, idx)))
          .map((ing) => ({
            text: ing.text,
            key: ing.key,
            category: getCategory(ing),
            recipeName: r.title,
          }))
      )
  }


  async function save(mode: 'replace' | 'append') {
    setStatus('saving')
    try {
      const res = await fetch('/api/meal-plan/export-groceries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: buildItems(), mode }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      onOpenChange(false)
      toast.success(`${data.itemCount} items added to Groceries`, {
        action: { label: 'View list', onClick: () => router.push('/lists') },
      })
    } catch {
      setStatus('ready')
      toast.error('Failed to save. Please try again.')
    }
  }

  function handleAddToGroceries() {
    if (groceriesList && groceriesList.itemCount > 0) {
      setStatus('confirming')
    } else {
      save('replace')
    }
  }

  const selectedRecipes = recipes.filter((r) => selectedRecipeKeys.has(recipeKey(r)))
  const checkedCount = useMemo(() => {
    let count = 0
    for (const r of selectedRecipes) {
      r.ingredients.forEach((ing, idx) => {
        if (selectedIngredientKeys.has(ingredientKey(r, ing, idx))) {
          count++
        }
      })
    }
    return count
  }, [selectedRecipes, selectedIngredientKeys])
  const totalItems = selectedRecipes.reduce((sum, r) => sum + r.ingredients.length, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle>Add to Groceries</DialogTitle>
          {status !== 'loading' && (
            <p className="text-sm text-muted-foreground mt-1">
              {checkedCount} of {totalItems} ingredient{totalItems !== 1 ? 's' : ''} selected from{' '}
              {selectedRecipes.length} of {recipes.length} recipe{recipes.length !== 1 ? 's' : ''}.
            </p>
          )}
        </DialogHeader>

        {status === 'loading' && (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            Loading ingredients…
          </div>
        )}

        {status !== 'loading' && (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5 min-h-0">
              {recipes.map((recipe) => {
                const rKey = recipeKey(recipe)
                const isSelected = selectedRecipeKeys.has(rKey)
                return (
                  <div key={rKey}>
                    {/* Recipe header — tap to toggle inclusion */}
                    <button
                      type="button"
                      onClick={() => toggleRecipe(rKey)}
                      className={cn(
                        'flex items-center gap-2 mb-2 w-full text-left rounded px-1 py-0.5 -mx-1 transition-opacity',
                        !isSelected && 'opacity-50'
                      )}
                    >
                      <span className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                        isSelected
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-muted-foreground/50'
                      )}>
                        {isSelected && <CheckIcon className="h-3 w-3" />}
                      </span>
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                        {recipe.title}
                      </p>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {recipe.mealType}
                      </span>
                    </button>

                    {/* Ingredients — only when recipe is selected */}
                    {isSelected && (
                      <div className="space-y-1">
                        {recipe.ingredients.map((ing, idx) => {
                          const ingKey = ingredientKey(recipe, ing, idx)
                          const isIngSelected = selectedIngredientKeys.has(ingKey)
                          const cat = getCategory(ing)
                          const isLearned =
                            !overrides.has(ing.key) && ing.source === 'learned'
                          const isCustom =
                            !overrides.has(ing.key) && ing.source === 'custom'
                          const isHeading = isLikelyHeading(ing.text)

                          return (
                            <div
                              key={ingKey}
                              className={cn(
                                'flex items-center gap-2 py-1',
                                ing.alreadyInList && 'opacity-60'
                              )}
                            >
                              {/* Per-ingredient checkbox */}
                              <button
                                type="button"
                                onClick={() => toggleIngredient(ingKey)}
                                className={cn(
                                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                                  isIngSelected
                                    ? 'bg-primary border-primary text-primary-foreground'
                                    : 'border-muted-foreground/50'
                                )}
                              >
                                {isIngSelected && <CheckIcon className="h-3 w-3" />}
                              </button>

                              <span className="flex-1 text-sm flex items-center gap-1.5">
                                {ing.alreadyInList ? (
                                  <CheckCheckIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                ) : (
                                  <PlusIcon className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                )}
                                <span className={cn(
                                  isHeading && 'text-muted-foreground italic text-xs font-medium',
                                  !isSelected && 'opacity-40'
                                )}>
                                  {ing.text}
                                </span>
                                {isHeading && (
                                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">
                                    heading
                                  </span>
                                )}
                              </span>
                              <select
                                aria-label={`Category for ${ing.text}`}
                                value={cat}
                                onChange={(e) =>
                                  setCategory(ing.key, e.target.value as ShoppingCategory)
                                }
                                className={cn(
                                  'h-6 rounded-full px-2 text-xs font-semibold border appearance-none cursor-pointer',
                                  isLearned
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                                    : isCustom
                                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
                                    : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                                )}
                              >
                                {allCategories.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {status === 'confirming' ? (
              <div className="px-6 py-4 border-t border-border space-y-3">
                <p className="text-sm text-muted-foreground">
                  Groceries already has {groceriesList?.itemCount ?? 0} item
                  {(groceriesList?.itemCount ?? 0) !== 1 ? 's' : ''}. What would you
                  like to do?
                </p>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStatus('ready')}
                  >
                    Back
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => save('append')}
                  >
                    Add to existing
                  </Button>
                  <Button size="sm" onClick={() => save('replace')}>
                    Replace
                  </Button>
                </div>
              </div>
            ) : (
              <DialogFooter className="px-6 py-4 border-t border-border flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-1">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500/70" />
                    Remembered
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500/70" />
                    Custom
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-500/70" />
                    Auto-guessed
                  </span>
                </div>
                <div className="flex gap-2 self-end sm:self-auto">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddToGroceries}
                    disabled={status === 'saving' || selectedRecipeKeys.size === 0 || checkedCount === 0}
                  >
                    <ShoppingCartIcon className="h-4 w-4 mr-1" />
                    {status === 'saving' ? 'Saving…' : 'Add to Groceries'}
                  </Button>
                </div>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}