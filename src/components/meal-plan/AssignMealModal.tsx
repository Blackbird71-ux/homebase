'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  ResizableDialogContent,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  SearchIcon,
  PlusIcon,
  ExternalLinkIcon,
  Loader2Icon,
  GlobeIcon,
  ShoppingCartIcon,
  CheckIcon,
} from 'lucide-react'
import { isLikelyHeading } from '@/lib/ingredient-helpers'

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
  onExportToGroceries?: (items: Array<{ text: string; key: string; category: string; recipeName?: string }>) => void
}

// ── Helpers ──
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function guessIngredients(text: string): string[] {
  const lower = text.toLowerCase().trim()
  if (lower.split(/\s+/).length <= 3) {
    return [text.trim()]
  }
  return [text.trim()]
}

// ── Shared textarea styling to avoid needing @/components/ui/textarea ──
const textareaClass =
  'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

// ── Quick add form ──
function QuickAddForm({
  searchTerm,
  onAssign,
  onCancel,
}: {
  searchTerm: string
  onAssign: (data: { recipeIds?: string[]; note?: string }) => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState(searchTerm)
  const [saving, setSaving] = useState(false)
  const [addToShoppingList, setAddToShoppingList] = useState(false)
  const [shoppingItems, setShoppingItems] = useState<string[]>(guessIngredients(searchTerm))

  async function handleQuickAdd() {
    if (!label.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/recipes/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: label.trim(),
          description: `Quick add: ${label.trim()}`,
          servings: 1,
          ingredients: shoppingItems.length > 0
            ? shoppingItems.map(i => `${i.trim()},,,`)
            : [],
          instructions: [],
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        console.error('Quick add failed:', res.status, errText)
        toast.error('Failed to create quick item')
        return
      }

      const recipe = await res.json()

      if (addToShoppingList && shoppingItems.length > 0) {
        const exportItems = shoppingItems
          .filter(item => !isLikelyHeading(item.trim()))
          .map(item => ({
            text: item.trim(),
            key: slugify(item.trim()),
            category: 'Meal Plan',
            recipeName: label.trim(),
          }))
        ;(window as any).__quickAddGroceryItems = exportItems
      }

      await onAssign({ recipeIds: [recipe.id] })
      toast.success(`Added "${label.trim()}" to meal plan`)
    } catch (err) {
      console.error('Quick add error:', err)
      toast.error('Failed to add item')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Add <strong>&ldquo;{searchTerm}&rdquo;</strong> as a new item to the meal plan.
      </p>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium">Item name</label>
        <Input
          value={label}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLabel(e.target.value)}
          placeholder="Item name"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium">
          Ingredients
          <span className="text-xs text-muted-foreground ml-1">(one per line)</span>
        </label>
        <textarea
          value={shoppingItems.join('\n')}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            setShoppingItems(e.target.value.split('\n').filter(Boolean))
          }
          placeholder="e.g.&#10;Tim Tam Biscuits&#10;Milk"
          rows={3}
          className={textareaClass}
        />
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={addToShoppingList}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddToShoppingList(e.target.checked)}
          className="rounded"
        />
        <ShoppingCartIcon className="h-3.5 w-3.5" />
        Add ingredients to shopping list
      </label>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleQuickAdd} disabled={saving || !label.trim()}>
          {saving ? 'Adding...' : 'Add Single Item'}
        </Button>
      </div>
    </div>
  )
}

// ── URL scrape form ──
function ScrapeRecipeForm({
  onAssign,
  onCancel,
}: {
  onAssign: (data: { recipeIds?: string[]; note?: string }) => void
  onCancel: () => void
}) {
  const [url, setUrl] = useState('')
  const [scraping, setScraping] = useState(false)
  const [scrapedData, setScrapedData] = useState<{
    title: string
    description: string
    ingredients: string[]
    instructions: string[]
    sourceUrl: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [addToShoppingList, setAddToShoppingList] = useState(false)
  const [editableTitle, setEditableTitle] = useState('')
  const [editableIngredients, setEditableIngredients] = useState<string[]>([])

  async function handleScrape() {
    if (!url.trim()) return
    setScraping(true)
    try {
      const res = await fetch('/api/recipes/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Failed to scrape recipe')
        return
      }

      const data = await res.json()
      setScrapedData(data)
      setEditableTitle(data.title || '')
      setEditableIngredients(data.ingredients || [])
    } catch (err) {
      console.error('Scrape error:', err)
      toast.error('Failed to scrape recipe. Check the URL and try again.')
    } finally {
      setScraping(false)
    }
  }

  async function handleSaveScraped() {
    if (!editableTitle.trim()) {
      toast.error('Please enter a recipe title')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/recipes/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editableTitle.trim(),
          description: scrapedData?.description || '',
          servings: 1,
          ingredients: editableIngredients.length > 0
            ? editableIngredients.map(i => `${i.trim()},,,`)
            : [],
          instructions: scrapedData?.instructions || [],
          sourceUrl: scrapedData?.sourceUrl || url.trim(),
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        console.error('Save scraped recipe failed:', res.status, errText)
        toast.error('Failed to save recipe')
        return
      }

      const recipe = await res.json()

      if (addToShoppingList && editableIngredients.length > 0) {
        const exportItems = editableIngredients
          .filter(item => !isLikelyHeading(item.trim().split(',')[0]))
          .map(item => ({
            text: item.trim().split(',')[0],
            key: slugify(item.trim().split(',')[0]),
            category: 'Meal Plan',
            recipeName: editableTitle.trim(),
          }))
        ;(window as any).__quickAddGroceryItems = exportItems
      }

      await onAssign({ recipeIds: [recipe.id] })
      toast.success(`Added "${editableTitle.trim()}" to meal plan`)
    } catch (err) {
      console.error('Save scraped error:', err)
      toast.error('Failed to save recipe')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Paste a URL from a recipe website to import it.
      </p>

      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
          placeholder="https://www.recipe-site.com/..."
          className="flex-1"
        />
        <Button onClick={handleScrape} disabled={scraping || !url.trim()}>
          {scraping ? (
            <><Loader2Icon className="h-4 w-4 mr-1 animate-spin" /> Scraping</>
          ) : (
            <><GlobeIcon className="h-4 w-4 mr-1" /> Fetch</>
          )}
        </Button>
      </div>

      {scraping && (
        <div className="text-sm text-muted-foreground text-center py-4">
          <Loader2Icon className="h-5 w-5 animate-spin mx-auto mb-2" />
          Fetching recipe from URL...
        </div>
      )}

      {scrapedData && !scraping && (
        <div className="flex flex-col gap-3 border rounded-lg p-3 bg-muted/30">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium">Recipe title</label>
            <Input
              value={editableTitle}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditableTitle(e.target.value)}
              placeholder="Recipe title"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium">
              Ingredients
              <span className="text-xs text-muted-foreground ml-1">(one per line)</span>
            </label>
            <textarea
              value={editableIngredients.join('\n')}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setEditableIngredients(e.target.value.split('\n').filter(Boolean))
              }
              rows={4}
              className={textareaClass}
            />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={addToShoppingList}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddToShoppingList(e.target.checked)}
              className="rounded"
            />
            <ShoppingCartIcon className="h-3.5 w-3.5" />
            Add ingredients to shopping list
          </label>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveScraped} disabled={saving || !editableTitle.trim()}>
              {saving ? (
                <><Loader2Icon className="h-4 w-4 mr-1 animate-spin" /> Saving</>
              ) : (
                <><CheckIcon className="h-4 w-4 mr-1" /> Save & Add to Meal Plan</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ──
export function AssignMealModal({
  open,
  onOpenChange,
  date,
  mealType,
  existingRecipes = [],
  onAssign,
  onExportToGroceries,
}: AssignMealModalProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [search, setSearch] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([])

  // "No results" action state
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [showScrape, setShowScrape] = useState(false)

  // Initialize selected recipes from existingRecipes
  useEffect(() => {
    if (open && existingRecipes.length > 0) {
      setSelectedRecipeIds(existingRecipes.map(r => r.recipeId))
    } else if (open) {
      setSelectedRecipeIds([])
    }
  }, [open, existingRecipes])

  // Reset action states when modal opens/closes
  useEffect(() => {
    if (!open) {
      setShowQuickAdd(false)
      setShowScrape(false)
    }
  }, [open])

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
      await onAssign({ note: note.trim(), recipeIds: [] })
      onOpenChange(false)
      setNote('')
      setSelectedRecipeIds([])
    } finally {
      setSaving(false)
    }
  }

  // Handle export to groceries for any pending quick-add items
  useEffect(() => {
    if (!open && (window as any).__quickAddGroceryItems && onExportToGroceries) {
      const items = (window as any).__quickAddGroceryItems as Array<{ text: string; key: string; category: string; recipeName?: string }>
      if (items.length > 0) {
        onExportToGroceries(items)
      }
      ;(window as any).__quickAddGroceryItems = null
    }
  }, [open, onExportToGroceries])

  const displayDate = new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  const hasExisting = existingRecipes.length > 0
  const noResults = search.trim().length > 0 && filtered.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ResizableDialogContent fitViewport storageKey="dialog-size:assign-meal">
        <DialogHeader>
          <DialogTitle>
            {displayDate} — {mealType}
          </DialogTitle>
          {hasExisting && (
            <DialogDescription>
              Currently has {existingRecipes.length} recipe{existingRecipes.length !== 1 ? 's' : ''}.
              Select more to add, or use the options below.
            </DialogDescription>
          )}
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setSearch(e.target.value)
                  if (showQuickAdd || showScrape) {
                    setShowQuickAdd(false)
                    setShowScrape(false)
                  }
                }}
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

            {/* ── Recipe list or "no results" actions ── */}
            {noResults && !showQuickAdd && !showScrape ? (
              <div className="flex flex-col gap-3 py-2">
                <p className="text-sm text-muted-foreground text-center">
                  No recipes found for &ldquo;{search}&rdquo;
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setShowQuickAdd(true)}
                  >
                    <PlusIcon className="h-4 w-4 mr-2" />
                    Add &ldquo;{search}&rdquo; as Single Item
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setShowScrape(true)}
                  >
                    <ExternalLinkIcon className="h-4 w-4 mr-2" />
                    Search for Recipe Online (Paste URL)
                  </Button>
                </div>
              </div>
            ) : showQuickAdd ? (
              <QuickAddForm
                searchTerm={search}
                onAssign={async (data) => {
                  await onAssign(data)
                  onOpenChange(false)
                  setSearch('')
                  setSelectedRecipeIds([])
                  setShowQuickAdd(false)
                }}
                onCancel={() => setShowQuickAdd(false)}
              />
            ) : showScrape ? (
              <ScrapeRecipeForm
                onAssign={async (data) => {
                  await onAssign(data)
                  onOpenChange(false)
                  setSearch('')
                  setSelectedRecipeIds([])
                  setShowScrape(false)
                }}
                onCancel={() => setShowScrape(false)}
              />
            ) : (
              /* Normal recipe list */
              <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                {filtered.length === 0 && search.trim() === '' && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Type to search recipes
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
            )}

            {/* Save button (only show when not in quick-add/scrape mode) */}
            {!showQuickAdd && !showScrape && (
              <Button
                onClick={saveRecipes}
                disabled={saving}
                className="mt-2"
              >
                {saving ? 'Saving...' : `Save ${selectedRecipeIds.length > 0 ? `(${selectedRecipeIds.length} recipes)` : 'meal'}`}
              </Button>
            )}
          </TabsContent>

          <TabsContent value="note" className="mt-3">
            <form onSubmit={assignNote} className="flex flex-col gap-3">
              <Input
                value={note}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNote(e.target.value)}
                placeholder="e.g. Takeaway, Leftovers, BBQ"
                autoFocus
              />
              <Button type="submit" disabled={saving || !note.trim()}>
                {saving ? 'Saving...' : 'Save note'}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </ResizableDialogContent>
    </Dialog>
  )
}