'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { TagSelector } from '@/components/tags/TagSelector'
import { LinkIcon } from 'lucide-react'

interface RecipeFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (newRecipe: {
    id: string
    title: string
    description: string | null
    tags: string[]
    prepTime: number | null
    cookTime: number | null
    servings: number | null
    bookId: string | null
    createdAt: string
    image: string | null
  }) => void
  onUpdated?: (updatedRecipe: {
    id: string
    title: string
    description: string | null
    tags: string[]
    prepTime: number | null
    cookTime: number | null
    servings: number | null
    bookId: string | null
    createdAt: string
    image: string | null
  }) => void
  initialData?: {
    title?: string
    description?: string
    ingredients?: string[]
    instructions?: string[]
    tags?: string[]
    prepTime?: number | null
    cookTime?: number | null
    servings?: number | null
    sourceUrl?: string
    image?: string | null
  }
  books?: { id: string; name: string }[]
  initialBookId?: string | null
  editMode?: {
    recipeId: string
  }
}

export function RecipeForm({ open, onOpenChange, onCreated, onUpdated, initialData, books, initialBookId, editMode }: RecipeFormProps) {
  const [title, setTitle] = useState(initialData?.title ?? '')
  const [bookId, setBookId] = useState<string>(initialBookId ?? '')
  const [description, setDescription] = useState(initialData?.description ?? '')
  const [ingredients, setIngredients] = useState(
    initialData?.ingredients?.join('\n') ?? ''
  )
  const [instructions, setInstructions] = useState(
    initialData?.instructions?.join('\n') ?? ''
  )
  const [tags, setTags] = useState<string[]>(initialData?.tags ?? [])
  const [prepTime, setPrepTime] = useState(String(initialData?.prepTime ?? ''))
  const [cookTime, setCookTime] = useState(String(initialData?.cookTime ?? ''))
  const [servings, setServings] = useState(String(initialData?.servings ?? ''))
  const [sourceUrl, setSourceUrl] = useState(initialData?.sourceUrl ?? '')
  const [imageUrl, setImageUrl] = useState(initialData?.image ?? '')
  const [scrapeUrl, setScrapeUrl] = useState('')
  const [scraping, setScraping] = useState(false)
  const [scrapeError, setScrapeError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  async function handleScrape(e: React.FormEvent) {
    e.preventDefault()
    if (!scrapeUrl.trim()) return
    setScraping(true)
    setScrapeError('')
    try {
      const res = await fetch('/api/recipes/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: scrapeUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setScrapeError(data.error ?? 'Failed to scrape')
        return
      }
      setTitle(data.title ?? '')
      setDescription(data.description ?? '')
      setIngredients((data.ingredients ?? []).join('\n'))
      setInstructions((data.instructions ?? []).join('\n'))
      setTags(data.tags ?? [])
      setSourceUrl(scrapeUrl.trim())
    } finally {
      setScraping(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setSaveError('')
    try {
      const url = editMode ? `/api/recipes/${editMode.recipeId}` : '/api/recipes'
      const method = editMode ? 'PUT' : 'POST'
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          ingredients: ingredients.split('\n').map((s) => s.trim()).filter(Boolean),
          instructions: instructions.split('\n').map((s) => s.trim()).filter(Boolean),
          tags: tags,
          prepTime: prepTime ? parseInt(prepTime) : null,
          cookTime: cookTime ? parseInt(cookTime) : null,
          servings: servings ? parseInt(servings) : null,
          sourceUrl: sourceUrl.trim() || null,
          image: imageUrl.trim() || null,
          bookId: bookId || null,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        if (editMode && onUpdated) {
          onUpdated(data)
        } else if (!editMode) {
          onCreated(data)
        }
        onOpenChange(false)
      } else {
        setSaveError(data.error ?? 'Failed to save recipe')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editMode ? 'Edit recipe' : 'Add recipe'}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="manual">
          <TabsList>
            <TabsTrigger value="manual">Manual entry</TabsTrigger>
            <TabsTrigger value="url">Import from URL</TabsTrigger>
          </TabsList>

          <TabsContent value="url" className="mt-4">
            <form onSubmit={handleScrape} className="flex flex-col gap-2">
              <Label htmlFor="scrape-url">Recipe URL</Label>
              <div className="flex gap-2">
                <Input
                  id="scrape-url"
                  value={scrapeUrl}
                  onChange={(e) => setScrapeUrl(e.target.value)}
                  placeholder="https://example.com/recipe"
                  type="url"
                  className="flex-1"
                />
                <Button type="submit" variant="outline" disabled={scraping}>
                  <LinkIcon className="h-4 w-4 mr-1" />
                  {scraping ? 'Fetching...' : 'Import'}
                </Button>
              </div>
            </form>
            {scrapeError && (
              <p className="text-sm text-destructive mt-2">{scrapeError}</p>
            )}
            {title && (
              <p className="text-sm text-muted-foreground mt-2">
                Found: <strong>{title}</strong>. Switch to Manual entry tab to review and save.
              </p>
            )}
          </TabsContent>

          <TabsContent value="manual" className="mt-4">
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="recipe-title">Title *</Label>
                <Input id="recipe-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="recipe-desc">Description</Label>
                <Input id="recipe-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="recipe-ingredients">Ingredients (one per line) *</Label>
                <textarea
                  id="recipe-ingredients"
                  value={ingredients}
                  onChange={(e) => setIngredients(e.target.value)}
                  rows={6}
                  className="flex min-h-[80px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  placeholder="1 cup flour&#10;2 eggs&#10;1 cup milk"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="recipe-instructions">Instructions (one step per line) *</Label>
                <textarea
                  id="recipe-instructions"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={8}
                  className="flex min-h-[80px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  placeholder="Mix dry ingredients.&#10;Add eggs and milk.&#10;Cook until golden."
                />
              </div>

              <div className="flex gap-3">
                <div className="flex flex-col gap-1.5 flex-1">
                  <Label htmlFor="recipe-prep">Prep (min)</Label>
                  <Input id="recipe-prep" type="number" min="0" value={prepTime} onChange={(e) => setPrepTime(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                  <Label htmlFor="recipe-cook">Cook (min)</Label>
                  <Input id="recipe-cook" type="number" min="0" value={cookTime} onChange={(e) => setCookTime(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                  <Label htmlFor="recipe-servings">Servings</Label>
                  <Input id="recipe-servings" type="number" min="1" value={servings} onChange={(e) => setServings(e.target.value)} />
                </div>
              </div>

              <TagSelector
                value={tags}
                onChange={setTags}
                placeholder="Add tags like Italian, pasta, quick"
                disabled={saving}
              />

              {books && books.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="recipe-book">Book</Label>
                  <select
                    id="recipe-book"
                    value={bookId}
                    onChange={(e) => setBookId(e.target.value)}
                    className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="">No book</option>
                    {books.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="recipe-url">Source URL</Label>
                <Input id="recipe-url" type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="recipe-image">Image URL</Label>
                <Input id="recipe-image" type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
                {imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="Preview" className="rounded-md object-cover h-32 w-full mt-1" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                )}
              </div>

              {saveError && (
                <p className="text-sm text-destructive">{saveError}</p>
              )}
              <DialogFooter>
                <Button type="submit" disabled={saving || !title.trim()}>
                  {saving ? 'Saving...' : editMode ? 'Update recipe' : 'Save recipe'}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
