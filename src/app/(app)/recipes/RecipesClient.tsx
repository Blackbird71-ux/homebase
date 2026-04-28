'use client'

import { useState, useMemo } from 'react'
import { RecipeCard } from '@/components/recipes/RecipeCard'
import { RecipeForm } from '@/components/recipes/RecipeForm'
import { RecipeBookSidebar } from '@/components/recipes/RecipeBookSidebar'
import { ImportModal } from '@/components/recipes/ImportModal'
import { TagCloud } from '@/components/tags/TagCloud'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PlusIcon, SearchIcon, UploadIcon } from 'lucide-react'
import type { RecipeBook } from '@/components/recipes/RecipeBookSidebar'

interface RecipeSummary {
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
}

interface RecipesClientProps {
  initialRecipes: RecipeSummary[]
  initialBooks: RecipeBook[]
  initialFavoriteBookId?: string | null
}

export function RecipesClient({ initialRecipes, initialBooks, initialFavoriteBookId }: RecipesClientProps) {
  const [recipes, setRecipes] = useState(initialRecipes)
  const [books, setBooks] = useState(initialBooks)
  const [activeBookId, setActiveBookId] = useState<string | null>(initialFavoriteBookId ?? null)
  const [favoriteBookId, setFavoriteBookId] = useState<string | null>(initialFavoriteBookId ?? null)
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const visibleRecipes = useMemo(() => {
    let result = activeBookId
      ? recipes.filter((r) => r.bookId === activeBookId)
      : recipes
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((r) => r.title.toLowerCase().includes(q))
    }
    if (activeTag) {
      result = result.filter((r) => r.tags.includes(activeTag))
    }
    return result
  }, [recipes, activeBookId, search, activeTag])

  const allTags = useMemo(() => {
    const base = activeBookId ? recipes.filter((r) => r.bookId === activeBookId) : recipes
    const tagSet = new Set<string>()
    for (const r of base) r.tags.forEach((t) => tagSet.add(t))
    return Array.from(tagSet).sort()
  }, [recipes, activeBookId])

  function handleCreated(newRecipe: RecipeSummary) {
    setRecipes((prev) => [newRecipe, ...prev])
    if (newRecipe.bookId) {
      setBooks((prev) =>
        prev.map((b) => b.id === newRecipe.bookId ? { ...b, recipeCount: b.recipeCount + 1 } : b)
      )
    }
    setFormOpen(false)
  }

  function handleBookCreated(book: RecipeBook) {
    setBooks((prev) => [...prev, book].sort((a, b) => a.name.localeCompare(b.name)))
  }

  function handleBookDeleted(bookId: string) {
    setBooks((prev) => prev.filter((b) => b.id !== bookId))
    setRecipes((prev) => prev.map((r) => r.bookId === bookId ? { ...r, bookId: null } : r))
    if (activeBookId === bookId) setActiveBookId(null)
    if (favoriteBookId === bookId) handleSetFavorite(null)
  }

  async function handleSetFavorite(bookId: string | null) {
    setFavoriteBookId(bookId)
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uiPreferences: { favoriteRecipeBookId: bookId } }),
    })
  }

  async function handleDeleteRecipe(id: string) {
    const recipe = recipes.find((r) => r.id === id)
    if (!recipe) return
    if (!confirm(`Delete "${recipe.title}"? This cannot be undone.`)) return
    const res = await fetch(`/api/recipes/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setRecipes((prev) => prev.filter((r) => r.id !== id))
      if (recipe.bookId) {
        setBooks((prev) =>
          prev.map((b) => b.id === recipe.bookId ? { ...b, recipeCount: Math.max(0, b.recipeCount - 1) } : b)
        )
      }
    }
  }

  function handleImported() {
    window.location.reload()
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col w-48 border-r border-border p-3 shrink-0 overflow-y-auto">
        <RecipeBookSidebar
          books={books}
          activeBookId={activeBookId}
          onSelect={(id) => { setActiveBookId(id); setActiveTag(null) }}
          onBookCreated={handleBookCreated}
          onBookDeleted={handleBookDeleted}
          favoriteBookId={favoriteBookId}
          onSetFavorite={handleSetFavorite}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col gap-4 p-4 md:p-6 overflow-auto min-w-0">
        {/* Mobile book tabs */}
        <div className="md:hidden">
          <RecipeBookSidebar
            books={books}
            activeBookId={activeBookId}
            onSelect={(id) => { setActiveBookId(id); setActiveTag(null) }}
            onBookCreated={handleBookCreated}
            onBookDeleted={handleBookDeleted}
            favoriteBookId={favoriteBookId}
            onSetFavorite={handleSetFavorite}
            mobile
          />
        </div>

        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">
            {activeBookId ? books.find((b) => b.id === activeBookId)?.name ?? 'Recipes' : 'Recipes'}
          </h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <UploadIcon className="h-4 w-4 mr-1" />
              Import
            </Button>
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <PlusIcon className="h-4 w-4 mr-1" />
              Add recipe
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search recipes..."
                className="pl-8"
              />
            </div>
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">Filter by tags</h3>
              {activeTag && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTag(null)}
                  className="h-6 text-xs"
                >
                  Clear filter
                </Button>
              )}
            </div>
            <TagCloud
              selectedTag={activeTag}
              onTagClick={setActiveTag}
              maxTags={15}
              showCounts={true}
            />
          </div>
        </div>

        {visibleRecipes.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
            <p className="text-sm">No recipes found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleRecipes.map(({ bookId: _bookId, createdAt: _createdAt, ...cardProps }) => (
              <RecipeCard key={cardProps.id} {...cardProps} onDelete={handleDeleteRecipe} />
            ))}
          </div>
        )}
      </div>

      <RecipeForm
        key={formOpen ? 'open' : 'closed'}
        open={formOpen}
        onOpenChange={setFormOpen}
        onCreated={handleCreated}
        books={books}
        initialBookId={activeBookId}
      />

      <ImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={handleImported}
      />
    </div>
  )
}
