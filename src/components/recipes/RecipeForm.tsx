'use client'

import { useState } from 'react'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/sheet'
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
    isFavourite: boolean
    bookId: string | null
    createdAt: string
    image: string | null
    calories: string | null
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
    calories: string | null
  }) => void
  initialData?: {
    title?: string
    description?: string
    notes?: string
    ingredients?: string[]
    instructions?: string[]
    tags?: string[]
    prepTime?: number | null
    cookTime?: number | null
    servings?: number | null
    sourceUrl?: string
    image?: string | null
    calories?: string
    fatContent?: string
    proteinContent?: string
    carbContent?: string
    sodiumContent?: string
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
  const [notes, setNotes] = useState(initialData?.notes ?? '')
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
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(initialData?.image ?? null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [calories, setCalories] = useState(initialData?.calories ?? '')
  const [fatContent, setFatContent] = useState(initialData?.fatContent ?? '')
  const [proteinContent, setProteinContent] = useState(initialData?.proteinContent ?? '')
  const [carbContent, setCarbContent] = useState(initialData?.carbContent ?? '')
  const [sodiumContent, setSodiumContent] = useState(initialData?.sodiumContent ?? '')
  const [showNutrition, setShowNutrition] = useState(
    !!(initialData?.calories || initialData?.fatContent || initialData?.proteinContent || initialData?.carbContent || initialData?.sodiumContent)
  )
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
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) {
        setScrapeError(data?.error ?? 'Failed to scrape')
        return
      }
      setTitle(data.title ?? '')
      setDescription(data.description ?? '')
      setIngredients((data.ingredients ?? []).join('\n'))
      setInstructions((data.instructions ?? []).join('\n'))
      setTags(data.tags ?? [])
      setSourceUrl(scrapeUrl.trim())
      if (data.image) {
        setImageUrl(data.image)
        setImagePreview(data.image)
      }
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
      let finalImageUrl = imageUrl.trim() || null
      
      // Upload image file if present
      if (imageFile && editMode?.recipeId) {
        setUploadingImage(true)
        try {
          const formData = new FormData()
          formData.append('image', imageFile)
          formData.append('recipeId', editMode.recipeId)
          
          const uploadRes = await fetch('/api/recipes/upload', {
            method: 'POST',
            body: formData,
          })
          
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json()
            finalImageUrl = uploadData.imageUrl
          } else {
            const errorData = await uploadRes.json().catch(() => null)
            throw new Error(errorData?.error || 'Failed to upload image')
          }
        } finally {
          setUploadingImage(false)
        }
      }
      
      const url = editMode ? `/api/recipes/${editMode.recipeId}` : '/api/recipes'
      const method = editMode ? 'PUT' : 'POST'
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          notes: notes.trim() || null,
          ingredients: ingredients.split('\n').map((s) => s.trim()).filter(Boolean),
          instructions: instructions.split('\n').map((s) => s.trim()).filter(Boolean),
          tags: tags,
          prepTime: prepTime ? parseInt(prepTime) : null,
          cookTime: cookTime ? parseInt(cookTime) : null,
          servings: servings ? parseInt(servings) : null,
          sourceUrl: sourceUrl.trim() || null,
          image: finalImageUrl,
          bookId: bookId || null,
          calories: calories.trim() || null,
          fatContent: fatContent.trim() || null,
          proteinContent: proteinContent.trim() || null,
          carbContent: carbContent.trim() || null,
          sodiumContent: sodiumContent.trim() || null,
        }),
      })
      // Error responses may have an empty/non-JSON body — never let that surface as a raw parse error
      const data = await res.json().catch(() => null)
      if (res.ok && data) {
        // For new recipes, upload the image file now that we have the recipe ID
        if (!editMode && imageFile && data.id) {
          setUploadingImage(true)
          try {
            const formData = new FormData()
            formData.append('image', imageFile)
            formData.append('recipeId', data.id)
            const uploadRes = await fetch('/api/recipes/upload', {
              method: 'POST',
              body: formData,
            })
            if (uploadRes.ok) {
              const uploadData = await uploadRes.json()
              data.image = uploadData.imageUrl
            }
          } finally {
            setUploadingImage(false)
          }
        }

        if (editMode && onUpdated) {
          onUpdated(data)
        } else if (!editMode) {
          onCreated(data)
        }
        onOpenChange(false)
      } else {
        setSaveError(data?.error ?? 'Something went wrong saving the recipe. Please try again.')
      }
    } catch (error: any) {
      setSaveError(error.message || 'Failed to save recipe')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="sm:max-w-[800px]" showCloseButton={true}>
        <DrawerHeader className="px-6 pt-4 pb-2 shrink-0 border-b border-border">
          <DrawerTitle>{editMode ? 'Edit recipe' : 'Add recipe'}</DrawerTitle>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Tabs defaultValue="manual">
            <TabsList className="sticky top-0 bg-background z-10">
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
              <form id="recipe-form" onSubmit={handleSubmit} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="recipe-title">Title *</Label>
                  <Input id="recipe-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="recipe-desc">Description</Label>
                  <Input id="recipe-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="recipe-notes">Notes</Label>
                  <textarea
                    id="recipe-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="flex min-h-[80px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    placeholder="Substitutions, tips, variations, family tweaks..."
                  />
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
                  scope="recipe"
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
                  <Input id="recipe-url" type="text" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="recipe-image">Recipe Image</Label>
                  <div className="flex gap-2">
                    <Input
                      id="recipe-image"
                      type="text"
                      value={imageUrl}
                      onChange={(e) => {
                        setImageUrl(e.target.value)
                        setImagePreview(e.target.value)
                        setImageFile(null)
                      }}
                      placeholder="https://..."
                      className="flex-1"
                    />
                    <div className="relative">
                      <Input
                        id="image-upload"
                        type="file"
                        accept="image/*"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            setImageFile(file)
                            setImageUrl('')
                            setImagePreview(URL.createObjectURL(file))
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="pointer-events-none"
                      >
                        Upload
                      </Button>
                    </div>
                  </div>
                  
                  {(imagePreview || imageUrl) && (
                    <div className="mt-2">
                      <p className="text-sm text-muted-foreground mb-1">Preview:</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imagePreview || imageUrl}
                        alt="Preview"
                        className="rounded-md object-cover h-32 w-full"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    </div>
                  )}
                  
                  {imageFile && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Selected: {imageFile.name} ({(imageFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                </div>

                {/* Nutritional information (optional) */}
                <div className="border-t pt-3">
                  <button
                    type="button"
                    onClick={() => setShowNutrition(!showNutrition)}
                    className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span className={`transition-transform ${showNutrition ? 'rotate-90' : ''}`}>▶</span>
                    Nutritional information (optional)
                  </button>
                  {showNutrition && (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="recipe-calories">Calories</Label>
                        <Input id="recipe-calories" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="e.g. 320 kcal" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="recipe-fat">Fat</Label>
                        <Input id="recipe-fat" value={fatContent} onChange={(e) => setFatContent(e.target.value)} placeholder="e.g. 12g" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="recipe-protein">Protein</Label>
                        <Input id="recipe-protein" value={proteinContent} onChange={(e) => setProteinContent(e.target.value)} placeholder="e.g. 25g" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="recipe-carbs">Carbs</Label>
                        <Input id="recipe-carbs" value={carbContent} onChange={(e) => setCarbContent(e.target.value)} placeholder="e.g. 45g" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="recipe-sodium">Sodium</Label>
                        <Input id="recipe-sodium" value={sodiumContent} onChange={(e) => setSodiumContent(e.target.value)} placeholder="e.g. 400mg" />
                      </div>
                    </div>
                  )}
                </div>

                {saveError && (
                  <p className="text-sm text-destructive">{saveError}</p>
                )}
              </form>
            </TabsContent>
          </Tabs>
        </div>
        <DrawerFooter className="border-t border-border">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="recipe-form" disabled={saving || !title.trim()}>
            {saving ? 'Saving...' : editMode ? 'Update recipe' : 'Save recipe'}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
