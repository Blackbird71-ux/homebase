'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RecipeForm } from '@/components/recipes/RecipeForm'
import {
  ClockIcon,
  UsersIcon,
  ExternalLinkIcon,
  ShoppingCartIcon,
  Loader2Icon,
  PencilIcon,
} from 'lucide-react'
import Link from 'next/link'
import { AddToListDialog } from '@/components/lists/AddToListDialog'
import { NutritionPanel } from '@/components/recipes/NutritionPanel'

interface RecipeDetail {
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
  calories: string | null
  fatContent: string | null
  proteinContent: string | null
  carbContent: string | null
  sodiumContent: string | null
  bookId: string | null
}

interface RecipeViewPopupProps {
  recipeId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  tagColors?: Record<string, string>
  books?: { id: string; name: string }[]
  onRecipeUpdated?: () => void
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`
}

export function RecipeViewPopup({
  recipeId,
  open,
  onOpenChange,
  tagColors,
  books = [],
  onRecipeUpdated,
}: RecipeViewPopupProps) {
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addToListOpen, setAddToListOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => {
    if (!open || !recipeId) {
      setRecipe(null)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/recipes/${recipeId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load recipe')
        return res.json()
      })
      .then((data) => {
        if (!cancelled) {
          setRecipe(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load recipe')
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [open, recipeId])

  function handleUpdated() {
    setEditOpen(false)
    onRecipeUpdated?.()
    if (!recipeId) return
    setLoading(true)
    fetch(`/api/recipes/${recipeId}`)
      .then((res) => res.json())
      .then((data) => {
        setRecipe(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  const totalTime = recipe ? (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0) : 0

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85dvh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          ) : recipe ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl pr-8">{recipe.title}</DialogTitle>
              </DialogHeader>

              <div className="flex flex-col gap-4">
                {recipe.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={recipe.image}
                    alt={recipe.title}
                    className="w-full rounded-lg object-cover max-h-56"
                  />
                )}

                {recipe.description && (
                  <p className="text-sm text-muted-foreground">{recipe.description}</p>
                )}

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {recipe.prepTime != null && (
                    <span className="flex items-center gap-1">
                      <ClockIcon className="h-3.5 w-3.5" /> Prep: {formatTime(recipe.prepTime)}
                    </span>
                  )}
                  {recipe.cookTime != null && (
                    <span className="flex items-center gap-1">
                      <ClockIcon className="h-3.5 w-3.5" /> Cook: {formatTime(recipe.cookTime)}
                    </span>
                  )}
                  {totalTime > 0 && (
                    <span className="flex items-center gap-1">
                      <ClockIcon className="h-3.5 w-3.5" /> Total: {formatTime(totalTime)}
                    </span>
                  )}
                  {recipe.servings != null && (
                    <span className="flex items-center gap-1">
                      <UsersIcon className="h-3.5 w-3.5" /> Serves: {recipe.servings}
                    </span>
                  )}
                </div>

                {recipe.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {recipe.tags.map((tag) => {
                      const color = tagColors?.[tag]
                      return (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded text-xs font-medium"
                          style={{
                            backgroundColor: color ? `${color}20` : undefined,
                            color: color || undefined,
                          }}
                        >
                          {tag}
                        </span>
                      )
                    })}
                  </div>
                )}

                {recipe.ingredients.length > 0 && (
                  <section>
                    <h3 className="text-sm font-semibold mb-2">Ingredients</h3>
                    <ul className="space-y-1">
                      {recipe.ingredients.map((ing, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-muted-foreground mt-1">•</span>
                          <span>{ing}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {recipe.instructions.length > 0 && (
                  <section>
                    <h3 className="text-sm font-semibold mb-2">Instructions</h3>
                    <ol className="flex flex-col gap-2">
                      {recipe.instructions.map((step, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs font-medium shrink-0">
                            {i + 1}
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}

                {recipe.notes && (
                  <section>
                    <h3 className="text-sm font-semibold mb-2">Notes</h3>
                    <div className="rounded-lg bg-muted/50 border border-border px-3 py-2">
                      <p className="text-sm whitespace-pre-wrap text-foreground/80">{recipe.notes}</p>
                    </div>
                  </section>
                )}

                <NutritionPanel
                  calories={recipe.calories}
                  fatContent={recipe.fatContent}
                  proteinContent={recipe.proteinContent}
                  carbContent={recipe.carbContent}
                  sodiumContent={recipe.sodiumContent}
                  servings={recipe.servings}
                />

                {recipe.sourceUrl && (
                  <a
                    href={recipe.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLinkIcon className="h-3 w-3" />
                    View original recipe
                  </a>
                )}

                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Button variant="outline" size="sm" onClick={() => setAddToListOpen(true)}>
                    <ShoppingCartIcon className="h-3.5 w-3.5 mr-1" />
                    Add to list
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                    <PencilIcon className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                  <Link href={`/recipes/${recipe.id}`} target="_blank">
                    <Button variant="outline" size="sm">
                      <ExternalLinkIcon className="h-3.5 w-3.5 mr-1" />
                      Open full recipe
                    </Button>
                  </Link>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {recipe && (
        <AddToListDialog
          open={addToListOpen}
          onOpenChange={setAddToListOpen}
          recipeId={recipe.id}
          recipeName={recipe.title}
          ingredients={recipe.ingredients}
        />
      )}

      {recipe && (
        <RecipeForm
          open={editOpen}
          onOpenChange={setEditOpen}
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
          books={books}
          initialBookId={recipe.bookId}
          onCreated={() => {}}
          onUpdated={handleUpdated}
        />
      )}
    </>
  )
}
