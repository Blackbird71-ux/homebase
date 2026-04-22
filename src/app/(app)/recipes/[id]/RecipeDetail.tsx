'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeftIcon, ClockIcon, UsersIcon, PrinterIcon, Trash2Icon, PencilIcon, ExternalLinkIcon, ShoppingCartIcon, CopyIcon, ChefHatIcon } from 'lucide-react'
import { AddToListDialog } from '@/components/lists/AddToListDialog'
import { RecipeForm } from '@/components/recipes/RecipeForm'
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

  const canEdit = isAdmin || recipe.createdBy === currentUserId
  const totalTime = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0)

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
                <ClockIcon className="h-4 w-4" /> Prep: {recipe.prepTime} min
              </span>
            )}
            {recipe.cookTime != null && (
              <span className="flex items-center gap-1">
                <ClockIcon className="h-4 w-4" /> Cook: {recipe.cookTime} min
              </span>
            )}
            {totalTime > 0 && (
              <span className="flex items-center gap-1">
                <ClockIcon className="h-4 w-4" /> Total: {totalTime} min
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
          <h2 className="text-lg font-semibold mb-3">Ingredients</h2>
          <ul className="space-y-1">
            {recipe.ingredients.map((ing, i) => (
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
            <div className="mt-4 p-3 bg-muted rounded-lg">
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
          )}
        </section>

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
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
          tags: recipe.tags,
          prepTime: recipe.prepTime,
          cookTime: recipe.cookTime,
          servings: recipe.servings,
          image: recipe.image || '',
          sourceUrl: recipe.sourceUrl || '',
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
