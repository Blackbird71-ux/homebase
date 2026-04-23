'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SearchIcon } from 'lucide-react'

interface Recipe {
  id: string
  title: string
}

interface SelectedRecipe {
  id: string
  recipeId: string
  recipeName: string
  order: number
  courseType?: string
}

interface AssignMealModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  date: string // YYYY-MM-DD
  mealType: string
  existingRecipes?: SelectedRecipe[]
  onAssign: (data: { recipeIds?: string[]; note?: string }) => void
}

export function AssignMealModal({
  open,
  onOpenChange,
  date,
  mealType,
  existingRecipes = [],
  onAssign,
}: AssignMealModalProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [search, setSearch] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([])
  
  // Initialize selected recipes from existingRecipes
  useEffect(() => {
    if (open && existingRecipes.length > 0) {
      setSelectedRecipeIds(existingRecipes.map(r => r.recipeId))
    } else if (open) {
      setSelectedRecipeIds([])
    }
  }, [open, existingRecipes])

  useEffect(() => {
    if (!open) return
    fetch('/api/recipes')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load recipes')
        return r.json()
      })
      .then((data: Recipe[]) => setRecipes(data))
      .catch(() => toast.error('Failed to load recipes'))
  }, [open])

  const filtered = recipes.filter((r) =>
    r.title.toLowerCase().includes(search.toLowerCase())
  )

  function toggleRecipe(recipeId: string) {
    setSelectedRecipeIds(prev => {
      if (prev.includes(recipeId)) {
        return prev.filter(id => id !== recipeId)
      } else {
        return [...prev, recipeId]
      }
    })
  }

  async function saveRecipes() {
    setSaving(true)
    try {
      await onAssign({ recipeIds: selectedRecipeIds })
      onOpenChange(false)
      setSearch('')
      setSelectedRecipeIds([])
    } finally {
      setSaving(false)
    }
  }

  async function assignNote(e: React.FormEvent) {
    e.preventDefault()
    if (!note.trim()) return
    setSaving(true)
    try {
      // When saving a note, clear any selected recipes
      await onAssign({ note: note.trim(), recipeIds: [] })
      onOpenChange(false)
      setNote('')
      setSelectedRecipeIds([])
    } finally {
      setSaving(false)
    }
  }

  const displayDate = new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {displayDate} — {mealType}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="recipe">
          <TabsList>
            <TabsTrigger value="recipe">Recipe</TabsTrigger>
            <TabsTrigger value="note">Note</TabsTrigger>
          </TabsList>

          <TabsContent value="recipe" className="mt-3 flex flex-col gap-3">
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search recipes..."
                className="pl-8"
              />
            </div>
            
            {/* Selected recipes summary */}
            {selectedRecipeIds.length > 0 && (
              <div className="bg-muted/50 rounded-md p-2">
                <p className="text-xs font-medium mb-1">Selected recipes ({selectedRecipeIds.length}):</p>
                <div className="flex flex-wrap gap-1">
                  {selectedRecipeIds.map(recipeId => {
                    const recipe = recipes.find(r => r.id === recipeId)
                    return recipe ? (
                      <span 
                        key={recipeId}
                        className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-1 rounded"
                      >
                        {recipe.title}
                        <button
                          type="button"
                          onClick={() => toggleRecipe(recipeId)}
                          className="text-primary/70 hover:text-primary"
                        >
                          ×
                        </button>
                      </span>
                    ) : null
                  })}
                </div>
              </div>
            )}
            
            <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No recipes found
                </p>
              )}
              {filtered.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggleRecipe(r.id)}
                  disabled={saving}
                  className={`text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedRecipeIds.includes(r.id)
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  {r.title}
                </button>
              ))}
            </div>
            
            <Button 
              onClick={saveRecipes} 
              disabled={saving}
              className="mt-2"
            >
              {saving ? 'Saving...' : `Save ${selectedRecipeIds.length > 0 ? `(${selectedRecipeIds.length} recipes)` : 'meal'}`}
            </Button>
          </TabsContent>

          <TabsContent value="note" className="mt-3">
            <form onSubmit={assignNote} className="flex flex-col gap-3">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Takeaway, Leftovers, BBQ"
                autoFocus
              />
              <Button type="submit" disabled={saving || !note.trim()}>
                {saving ? 'Saving...' : 'Save note'}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
