'use client'

/* eslint-disable no-restricted-syntax -- Meal-plan is an internally-consistent browser-local-time stack: the useMealPlanData hook + meal-plan/types.ts utils build and read local-midnight Dates, and every display rebuilds local midnight. A display-only UTC switch would shift dates a day for off-tz viewers; the whole stack must migrate together. Deferred — see DATE-DISPLAY-AUDIT.md "TripActivity time / meal-plan deferred stacks". */

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  DndContext, DragOverlay,
  useDraggable, useDroppable,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/sheet'
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
  GripVerticalIcon,
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
    image: string | null
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
        const err = await res.json().catch(() => null)
        toast.error(err?.error || 'Failed to scrape recipe')
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
          image: scrapedData?.image || null,
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

// ── Draggable recipe row ──
function DraggableRecipeRow({ recipe, onSelect }: { recipe: Recipe; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `recipe-${recipe.id}`,
    data: { recipeId: recipe.id, recipeName: recipe.title },
  })
  const initials = recipe.title.slice(0, 2).toUpperCase()
  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0.35 : 1 } : undefined}
      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/70 transition-colors group"
    >
      <span
        {...listeners}
        {...attributes}
        className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground shrink-0 touch-none transition-colors"
      >
        <GripVerticalIcon className="h-4 w-4" />
      </span>
      <div className="h-7 w-7 rounded bg-muted shrink-0 flex items-center justify-center">
        <span className="text-[9px] font-semibold text-muted-foreground">{initials}</span>
      </div>
      <button type="button" className="flex-1 text-left text-sm font-medium text-foreground truncate" onClick={onSelect}>
        {recipe.title}
      </button>
    </div>
  )
}

// ── Meal slot drop zone ──
function MealDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: 'meal-slot-drop' })
  return (
    <div
      ref={setNodeRef}
      className={[
        'flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed h-20 text-sm transition-colors select-none shrink-0',
        isOver
          ? 'border-primary bg-primary/10 text-primary font-medium'
          : 'border-border/60 bg-muted/30 text-muted-foreground hover:border-border hover:bg-muted/50',
      ].join(' ')}
    >
      {isOver ? (
        <span className="font-medium">Release to add to meal</span>
      ) : (
        <>
          <GripVerticalIcon className="h-4 w-4 opacity-40" />
          <span className="text-xs">Drag a recipe here — or click one below</span>
        </>
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
  const [draggingName, setDraggingName] = useState<string | null>(null)

  // "No results" action state
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [showScrape, setShowScrape] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setShowQuickAdd(false)
      setShowScrape(false)
      setSearch('')
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

  async function doAssign(recipeId: string) {
    await onAssign({ recipeIds: [recipeId] })
    onOpenChange(false)
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingName(null)
    const { active, over } = event
    if (over?.id === 'meal-slot-drop' && active.data.current) {
      const { recipeId } = active.data.current as { recipeId: string }
      doAssign(recipeId)
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
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="sm:max-w-[560px]" showCloseButton={true}>
        <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
          <DrawerTitle>
            {displayDate} — {mealType}
          </DrawerTitle>
          {hasExisting && (
            <p className="text-sm text-muted-foreground mt-1">
              Currently has {existingRecipes.length} recipe{existingRecipes.length !== 1 ? 's' : ''}.
            </p>
          )}
        </DrawerHeader>
        <div className="flex flex-col flex-1 overflow-hidden px-4 py-3">
          <Tabs defaultValue="recipe" className="flex-1 overflow-hidden">
            <TabsList>
              <TabsTrigger value="recipe">Recipe</TabsTrigger>
              <TabsTrigger value="note">Note</TabsTrigger>
            </TabsList>

            <TabsContent value="recipe" className="flex flex-col overflow-hidden mt-3 gap-3">
              <DndContext
                sensors={sensors}
                onDragStart={({ active }) => {
                  setDraggingName((active.data.current as any)?.recipeName ?? null)
                }}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setDraggingName(null)}
              >
                <div className="flex flex-col flex-1 overflow-hidden gap-3">
                  <MealDropZone />

                  <div className="relative shrink-0">
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
                    <div className="flex-1 overflow-y-auto">
                      <QuickAddForm
                        searchTerm={search}
                        onAssign={async (data) => {
                          await onAssign(data)
                          onOpenChange(false)
                          setSearch('')
                          setShowQuickAdd(false)
                        }}
                        onCancel={() => setShowQuickAdd(false)}
                      />
                    </div>
                  ) : showScrape ? (
                    <div className="flex-1 overflow-y-auto">
                      <ScrapeRecipeForm
                        onAssign={async (data) => {
                          await onAssign(data)
                          onOpenChange(false)
                          setSearch('')
                          setShowScrape(false)
                        }}
                        onCancel={() => setShowScrape(false)}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
                      {recipes.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Loading recipes...
                        </p>
                      )}
                      {filtered.map((r) => (
                        <DraggableRecipeRow
                          key={r.id}
                          recipe={r}
                          onSelect={() => doAssign(r.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <DragOverlay>
                  {draggingName ? (
                    <div className="px-3 py-2 rounded-md text-sm bg-background border border-border shadow-lg">
                      {draggingName}
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
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
        </div>
      </DrawerContent>
    </Drawer>
  )
}
