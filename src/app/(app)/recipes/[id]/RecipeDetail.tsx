'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeftIcon, ClockIcon, UsersIcon, PrinterIcon, Trash2Icon, PencilIcon, ExternalLinkIcon } from 'lucide-react'
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
    sourceUrl: string | null
    createdBy: string
    createdAt: string
  }
  currentUserId: string
  isAdmin: boolean
}

export function RecipeDetail({ recipe, currentUserId, isAdmin }: RecipeDetailProps) {
  const router = useRouter()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const canEdit = isAdmin || recipe.createdBy === currentUserId
  const totalTime = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0)

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/recipes/${recipe.id}`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/recipes')
        router.refresh()
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <style>{`@media print { .no-print { display: none !important; } }`}</style>
      <div className="max-w-2xl mx-auto p-6 flex flex-col gap-6">
        {/* Back + Actions */}
        <div className="flex items-center justify-between no-print">
          <Link href="/recipes">
            <Button variant="ghost" size="sm">
              <ArrowLeftIcon className="h-4 w-4 mr-1" />
              Recipes
            </Button>
          </Link>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <PrinterIcon className="h-4 w-4 mr-1" />
              Print
            </Button>
            {canEdit && (
              <>
                <Link href={`/recipes/${recipe.id}/edit`}>
                  <Button variant="outline" size="sm">
                    <PencilIcon className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                </Link>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2Icon className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>

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
              <span className="font-medium text-foreground">Total: {totalTime} min</span>
            )}
            {recipe.servings != null && (
              <span className="flex items-center gap-1">
                <UsersIcon className="h-4 w-4" /> {recipe.servings} servings
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

        {/* Ingredients */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Ingredients</h2>
          <ul className="flex flex-col gap-1.5">
            {recipe.ingredients.map((ing, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                {ing}
              </li>
            ))}
          </ul>
        </section>

        {/* Instructions */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Instructions</h2>
          <ol className="flex flex-col gap-4">
            {recipe.instructions.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold shrink-0">
                  {i + 1}
                </span>
                <span className="mt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {recipe.sourceUrl && (
          <a
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground no-print"
          >
            <ExternalLinkIcon className="h-3 w-3" />
            Original source
          </a>
        )}
      </div>

      {/* Delete confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete recipe?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete &ldquo;{recipe.title}&rdquo;. This cannot be undone.
          </p>
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
    </>
  )
}
