'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeftIcon, ClockIcon, UsersIcon, PrinterIcon, Trash2Icon, PencilIcon, ExternalLinkIcon, ShoppingCartIcon, CopyIcon, ChefHatIcon, PlusIcon, MinusIcon } from 'lucide-react'
import { AddToListDialog } from '@/components/lists/AddToListDialog'
import { RecipeForm } from '@/components/recipes/RecipeForm'
import { NutritionPanel } from '@/components/recipes/NutritionPanel'
import { CookingTimerPanel } from '@/components/recipes/CookingTimer'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

interface RecipeDetailProps {
  recipe: {
    id: string
    title: string
    description: string | null
    notes: string | null
    ingredients: string[]
    instructions: string[]
    tags: string[]
    prepTime: number | null
    cookTime: number | null
    servings: number | null
    image: string | null
    sourceUrl: string | null
    createdBy: string
    createdAt: string
    bookId: string | null
    calories: string | null
    fatContent: string | null
    proteinContent: string | null
    carbContent: string | null
    sodiumContent: string | null
  }
  books: { id: string; name: string; recipeCount: number }[]
  currentUserId: string
  isAdmin: boolean
}

export function RecipeDetail({ recipe, books, currentUserId, isAdmin }: RecipeDetailProps) {
  const router = useRouter()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [addToListOpen, setAddToListOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [cookingMode, setCookingMode] = useState(false)
  const [completedSteps, setCompletedSteps] = useState<boolean[]>([])
  const [completedIngredients, setCompletedIngredients] = useState<boolean[]>([])
  const [wakeLock, setWakeLock] = useState<any>(null)

  const [scaleFactor, setScaleFactor] = useState(1)

  // Request wake lock when cooking mode is active (keeps screen on)
  useEffect(() => {
    if (!cookingMode) {
      if (wakeLock) {
        wakeLock.release().catch(() => {})
        setWakeLock(null)
      }
      return
    }

    async function requestWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          const wl = await (navigator as any).wakeLock.request('screen')
          setWakeLock(wl)
          wl.addEventListener('release', () => setWakeLock(null))
        }
      } catch {
        // Wake lock not supported or denied — silently continue
      }
    }

    requestWakeLock()

    // Re-acquire wake lock if page becomes visible again
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && cookingMode) {
        requestWakeLock()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [cookingMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const canEdit = isAdmin || recipe.createdBy === currentUserId
  const totalTime = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0)

  // Parse and scale ingredient quantities
  function scaleIngredient(ingredient: string, factor: number): string {
    if (factor === 1) return ingredient
    // Match patterns like "1 cup", "2 1/2 tbsp", "1/2 tsp", "3 cups", etc.
    return ingredient.replace(
      /(\d+)(?:\s*(\d+)\/(\d+))?|\d+\/\d+/g,
      (match, whole, num, den) => {
        let value: number
        if (whole !== undefined && num !== undefined && den !== undefined) {
          // Mixed number like "2 1/2"
          value = parseInt(whole) + parseInt(num) / parseInt(den)
        } else if (match.includes('/')) {
          // Simple fraction like "1/2"
          const [n, d] = match.split('/').map(Number)
          value = n / d
        } else {
          // Simple whole number
          value = parseInt(match)
        }
        const scaled = value * factor
        // Format the result nicely
        if (Number.isInteger(scaled)) return scaled.toString()
        // Check for common fractions
        const rounded = Math.round(scaled * 8) / 8
        if (rounded === Math.floor(rounded)) return rounded.toString()
        // Return as decimal with 1-2 decimal places
        return parseFloat(scaled.toFixed(2)).toString()
      }
    )
  }

  const scaledIngredients = useMemo(() => {
    return recipe.ingredients.map((ing) => scaleIngredient(ing, scaleFactor))
  }, [recipe.ingredients, scaleFactor])

  const scaleOptions = [0.5, 1, 1.5, 2, 3]

  function formatTime(minutes: number): string {
    if (minutes < 60) return `${minutes} min`
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m > 0 ? `${h} hr ${m} min` : `${h} hr`
  }

  async function handleDuplicate() {
    setDuplicating(true)
    try {
      const res = await fetch(`/api/recipes/${recipe.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        const newRecipe = await res.json()
        router.push(`/recipes/${newRecipe.id}`)
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.error ?? 'Failed to duplicate recipe')
      }
    } catch {
      alert('Network error')
    } finally {
      setDuplicating(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/recipes/${recipe.id}`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/recipes')
        router.refresh()
      } else {
        setDeleteError('Failed to delete recipe. Please try again.')
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <style>{`@media print { .no-print { display: none !important; } }`}</style>
      <div className="flex flex-col gap-6 overflow-y-auto h-full min-h-0 p-4 md:p-6">
        {/* Back + Actions - Sticky header */}
        <div className="flex items-center justify-between no-print sticky top-0 bg-background z-10 py-2 -mx-4 md:-mx-6 px-4 md:px-6 border-b border-border">
          <Link href="/recipes">
            <Button variant="ghost" size="sm">
              <ArrowLeftIcon className="h-4 w-4 mr-1" />
              Recipes
            </Button>
          </Link>
          <div className="flex gap-2 flex-wrap justify-end">
            <Button variant="outline" size="sm" onClick={() => setAddToListOpen(true)}>
              <ShoppingCartIcon className="h-4 w-4 mr-1" />
              Add to list
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <PrinterIcon className="h-4 w-4 mr-1" />
              Print
            </Button>
              <Button
                variant={cookingMode ? "secondary" : "outline"}
                size="sm"
                onClick={() => {
                  setCookingMode(!cookingMode)
                  if (!cookingMode) {
                    // Initialize completed steps and ingredients arrays
                    setCompletedSteps(new Array(recipe.instructions.length).fill(false))
                    setCompletedIngredients(new Array(recipe.ingredients.length).fill(false))
                  }
                }}
              >
                <ChefHatIcon className="h-4 w-4 mr-1" />
                {cookingMode ? 'Exit Cooking Mode' : 'Start Cooking'}
              </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDuplicate}
              disabled={duplicating}
            >
              <CopyIcon className="h-4 w-4 mr-1" />
              {duplicating ? 'Duplicating...' : 'Duplicate'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(true)}>
              <PencilIcon className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2Icon className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </div>
        </div>

        {/* Content area - max width for readability */}
        <div className="max-w-3xl mx-auto w-full flex flex-col gap-6">
          
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold mb-2">{recipe.title}</h1>
          {recipe.description && (
            <p className="text-muted-foreground text-sm">{recipe.description}</p>
          )}
          <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
            {recipe.prepTime != null && (
              <span className="flex items-center gap-1">
                <ClockIcon className="h-4 w-4" /> Prep: {formatTime(recipe.prepTime!)}
              </span>
            )}
            {recipe.cookTime != null && (
              <span className="flex items-center gap-1">
                <ClockIcon className="h-4 w-4" /> Cook: {formatTime(recipe.cookTime!)}
              </span>
            )}
            {totalTime > 0 && (
              <span className="flex items-center gap-1">
                <ClockIcon className="h-4 w-4" /> Total: {formatTime(totalTime)}
              </span>
            )}
            {recipe.servings != null && (
              <span className="flex items-center gap-1">
                <UsersIcon className="h-4 w-4" /> Serves: {recipe.servings}
              </span>
            )}
          </div>
          {recipe.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {recipe.tags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 bg-muted rounded text-xs text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Recipe image */}
        {recipe.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={recipe.image}
            alt={recipe.title}
            className="w-full rounded-lg object-cover max-h-72"
          />
        )}

        {/* Ingredients */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Ingredients</h2>
            <div className="flex items-center gap-1 no-print">
              <span className="text-xs text-muted-foreground mr-1">Scale:</span>
              {scaleOptions.map((factor) => (
                <Button
                  key={factor}
                  variant={scaleFactor === factor ? "secondary" : "ghost"}
                  size="icon-xs"
                  onClick={() => setScaleFactor(factor)}
                  className="h-7 w-7 text-xs"
                  aria-label={`Scale to ${factor}x`}
                >
                  {factor === 1 ? '1x' : factor === 0.5 ? '½' : factor === 1.5 ? '1½' : `${factor}x`}
                </Button>
              ))}
            </div>
          </div>
          <ul className="space-y-1">
            {scaledIngredients.map((ing, i) => (
              <li key={i} className="flex items-start gap-2">
                {cookingMode ? (
                  <button
                    onClick={() => {
                      const newCompleted = [...completedIngredients]
                      newCompleted[i] = !newCompleted[i]
                      setCompletedIngredients(newCompleted)
                    }}
                    className={`flex items-center justify-center h-5 w-5 rounded-full shrink-0 mt-0.5 ${
                      completedIngredients[i]
                        ? 'bg-green-500 text-white'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {completedIngredients[i] ? '✓' : '•'}
                  </button>
                ) : (
                  <span className="text-muted-foreground text-sm mt-0.5">•</span>
                )}
                <span className={cookingMode && completedIngredients[i] ? 'line-through text-muted-foreground' : ''}>
                  {ing}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Instructions */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Instructions</h2>
          <ol className="flex flex-col gap-4">
            {recipe.instructions.map((step, i) => (
              <li key={i} className="flex gap-3">
                {cookingMode ? (
                  <button
                    onClick={() => {
                      const newCompleted = [...completedSteps]
                      newCompleted[i] = !newCompleted[i]
                      setCompletedSteps(newCompleted)
                    }}
                    className={`flex items-center justify-center h-6 w-6 rounded-full shrink-0 ${
                      completedSteps[i]
                        ? 'bg-green-500 text-white'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {completedSteps[i] ? '✓' : i + 1}
                  </button>
                ) : (
                  <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-medium shrink-0">
                    {i + 1}
                  </span>
                )}
                <span className={cookingMode && completedSteps[i] ? 'line-through text-muted-foreground' : ''}>
                  {step}
                </span>
              </li>
            ))}
          </ol>
          {cookingMode && (
            <div className="mt-4 space-y-4">
              {/* Timer panel */}
              <div className="p-3 bg-muted rounded-lg">
                <CookingTimerPanel />
              </div>

              {/* Progress panel */}
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">Cooking Mode Active</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {completedIngredients.filter(Boolean).length} of {recipe.ingredients.length} ingredients prepared • {completedSteps.filter(Boolean).length} of {recipe.instructions.length} steps completed
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCompletedIngredients(new Array(recipe.ingredients.length).fill(false))}
                    >
                      Reset Ingredients
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCompletedIngredients(new Array(recipe.ingredients.length).fill(true))}
                    >
                      Mark All Ingredients Complete
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCompletedSteps(new Array(recipe.instructions.length).fill(false))}
                    >
                      Reset Steps
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCompletedSteps(new Array(recipe.instructions.length).fill(true))}
                    >
                      Mark All Steps Complete
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Notes */}
        {recipe.notes && (
          <section className="pt-4 border-t">
            <h2 className="text-lg font-semibold mb-2">Notes</h2>
            <div className="rounded-lg bg-muted/50 border border-border px-4 py-3">
              <p className="text-sm whitespace-pre-wrap text-foreground/80">{recipe.notes}</p>
            </div>
          </section>
        )}

        {/* Nutrition */}
        <NutritionPanel
          calories={recipe.calories}
          fatContent={recipe.fatContent}
          proteinContent={recipe.proteinContent}
          carbContent={recipe.carbContent}
          sodiumContent={recipe.sodiumContent}
          servings={recipe.servings}
        />

        {/* Source link */}
        {recipe.sourceUrl && (
          <div className="pt-4 border-t">
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ExternalLinkIcon className="h-3 w-3" />
              View original recipe
            </a>
          </div>
        )}
      </div>
      </div>

      <AddToListDialog
        open={addToListOpen}
        onOpenChange={setAddToListOpen}
        recipeId={recipe.id}
        recipeName={recipe.title}
        ingredients={recipe.ingredients}
      />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Recipe</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete "{recipe.title}"? This action cannot be undone.
          </p>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RecipeForm
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        editMode={{ recipeId: recipe.id }}
        initialData={{
          title: recipe.title,
          description: recipe.description || '',
          notes: recipe.notes || '',
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
          tags: recipe.tags,
          prepTime: recipe.prepTime,
          cookTime: recipe.cookTime,
          servings: recipe.servings,
          image: recipe.image || '',
          sourceUrl: recipe.sourceUrl || '',
          calories: recipe.calories || '',
          fatContent: recipe.fatContent || '',
          proteinContent: recipe.proteinContent || '',
          carbContent: recipe.carbContent || '',
          sodiumContent: recipe.sodiumContent || '',
        }}
        books={books.map(b => ({ id: b.id, name: b.name }))}
        initialBookId={recipe.bookId}
        onCreated={() => {
          // This won't be called when editing, but required by interface
        }}
        onUpdated={() => {
          setEditDialogOpen(false)
          router.refresh()
        }}
      />
    </>
  )
}
