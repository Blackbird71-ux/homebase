'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { SHOPPING_CATEGORIES } from '@/lib/list-helpers'
import type { ShoppingCategory } from '@/lib/list-helpers'
import { toast } from 'sonner'
import { ShoppingCartIcon, CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PreviewIngredient {
  text: string
  key: string
  category: ShoppingCategory
  source: 'learned' | 'guessed'
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

function recipeKey(r: PreviewRecipe) {
  return `${r.title}||${r.date}||${r.mealType}`
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
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setStatus('loading')
    setOverrides(new Map())

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
        setRecipes(data.recipes)
        setSelectedKeys(new Set(data.recipes.map(recipeKey)))
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
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function buildItems() {
    return recipes
      .filter((r) => selectedKeys.has(recipeKey(r)))
      .flatMap((r) =>
        r.ingredients.map((ing) => ({
          text: ing.text,
          key: ing.key,
          category: getCategory(ing),
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

  const selectedRecipes = recipes.filter((r) => selectedKeys.has(recipeKey(r)))
  const totalItems = selectedRecipes.reduce((sum, r) => sum + r.ingredients.length, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle>Add to Groceries</DialogTitle>
          {status !== 'loading' && (
            <p className="text-sm text-muted-foreground mt-1">
              {totalItems} ingredient{totalItems !== 1 ? 's' : ''} from{' '}
              {selectedRecipes.length} of {recipes.length} recipe{recipes.length !== 1 ? 's' : ''}.
              {recipes.length > 1 && ' Tap a recipe to include or exclude it.'}
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
                const key = recipeKey(recipe)
                const isSelected = selectedKeys.has(key)
                return (
                  <div key={key}>
                    {/* Recipe header — tap to toggle inclusion */}
                    <button
                      type="button"
                      onClick={() => toggleRecipe(key)}
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

                    {/* Ingredients — only when selected */}
                    {isSelected && (
                      <div className="space-y-1">
                        {recipe.ingredients.map((ing) => {
                          const cat = getCategory(ing)
                          const isLearned =
                            !overrides.has(ing.key) && ing.source === 'learned'
                          return (
                            <div
                              key={ing.key + ing.text}
                              className="flex items-center gap-2 py-1"
                            >
                              <span className="flex-1 text-sm">{ing.text}</span>
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
                                    : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                                )}
                              >
                                {SHOPPING_CATEGORIES.map((c) => (
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
              <DialogFooter className="px-6 py-4 border-t border-border flex-row items-center">
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-1">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500/70" />
                    Remembered
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-500/70" />
                    Auto-guessed
                  </span>
                </div>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAddToGroceries}
                  disabled={status === 'saving' || selectedKeys.size === 0}
                >
                  <ShoppingCartIcon className="h-4 w-4 mr-1" />
                  {status === 'saving' ? 'Saving…' : 'Add to Groceries'}
                </Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
