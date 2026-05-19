'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { RecipeCard } from '@/components/recipes/RecipeCard'
import { RecipeForm } from '@/components/recipes/RecipeForm'
import { RecipeBookSidebar } from '@/components/recipes/RecipeBookSidebar'
import { ImportModal } from '@/components/recipes/ImportModal'
import { TagCloud } from '@/components/tags/TagCloud'
import { PillNav } from '@/components/shared/PillNav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PlusIcon, SearchIcon, UploadIcon, ClockIcon, UsersIcon, Trash2Icon, LayoutGrid, Heart } from 'lucide-react'
import type { RecipeBook } from '@/components/recipes/RecipeBookSidebar'
import { cn } from '@/lib/utils'

interface RecipeSummary {
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
}

interface RecipesClientProps {
  initialRecipes: RecipeSummary[]
  initialBooks: RecipeBook[]
  initialFavoriteBookId?: string | null
  tagColors?: Record<string, string>
}

type Tab = 'overview' | 'all' | 'favourite' | 'quick' | 'family' | 'trip'

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`
}

function isFav(r: RecipeSummary)    { return r.isFavourite }
function isQuick(r: RecipeSummary)  { const t = (r.prepTime ?? 0) + (r.cookTime ?? 0); return t > 0 && t < 30 }
function isFamily(r: RecipeSummary) { return r.tags.some(t => t.toLowerCase() === 'family') }
function isTrip(r: RecipeSummary)   { return r.tags.some(t => t.toLowerCase() === 'trip') }

function HeroRecipeCard({
  recipe,
  onDelete,
  onToggleFavourite,
}: {
  recipe: RecipeSummary
  onDelete: (id: string) => void
  onToggleFavourite: (id: string) => void
}) {
  const totalTime = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0)
  return (
    <div className="relative group overflow-hidden rounded-xl border border-border bg-card">
      <Link href={`/recipes/${recipe.id}`} className="flex flex-col sm:flex-row">
        {recipe.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={recipe.image}
            alt={recipe.title}
            className="w-full sm:w-72 h-48 sm:h-56 object-cover shrink-0"
          />
        ) : (
          <div className="w-full sm:w-72 h-48 sm:h-56 bg-gradient-to-br from-primary/20 to-primary/5 shrink-0 flex items-center justify-center text-4xl">
            🍽️
          </div>
        )}
        <div className="flex flex-col p-5 gap-2 flex-1 min-w-0">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Featured Recipe</p>
          <h2 className="text-xl font-semibold leading-snug line-clamp-2">{recipe.title}</h2>
          {recipe.description && (
            <p className="text-sm text-muted-foreground line-clamp-3">{recipe.description}</p>
          )}
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto pt-2">
            {totalTime > 0 && (
              <span className="flex items-center gap-1">
                <ClockIcon className="h-3.5 w-3.5" /> {formatTime(totalTime)}
              </span>
            )}
            {recipe.servings != null && (
              <span className="flex items-center gap-1">
                <UsersIcon className="h-3.5 w-3.5" /> {recipe.servings}
              </span>
            )}
          </div>
        </div>
      </Link>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFavourite(recipe.id) }}
        className={cn(
          'absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center transition-colors',
          recipe.isFavourite
            ? 'bg-white/90 text-rose-500'
            : 'bg-black/20 text-white/70 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-white/90 hover:text-rose-500',
        )}
        title={recipe.isFavourite ? 'Remove from favourites' : 'Add to favourites'}
      >
        <Heart className={cn('h-3.5 w-3.5', recipe.isFavourite && 'fill-current')} />
      </button>
      <button
        type="button"
        onClick={() => onDelete(recipe.id)}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 text-muted-foreground/40 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-colors"
        title="Delete recipe"
      >
        <Trash2Icon className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function SectionGrid({
  title,
  sub,
  recipes,
  tagColors,
  onDelete,
  onToggleFavourite,
}: {
  title: string
  sub?: string
  recipes: RecipeSummary[]
  tagColors?: Record<string, string>
  onDelete: (id: string) => void
  onToggleFavourite: (id: string) => void
}) {
  if (recipes.length === 0) return null
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between pb-2 border-b border-border">
        <h2 className="text-base font-semibold">{title}</h2>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {recipes.map(({ bookId: _b, createdAt: _c, ...cardProps }) => (
          <RecipeCard key={cardProps.id} {...cardProps} tagColors={tagColors} onDelete={onDelete} onToggleFavourite={onToggleFavourite} />
        ))}
      </div>
    </div>
  )
}

export function RecipesClient({ initialRecipes, initialBooks, initialFavoriteBookId, tagColors }: RecipesClientProps) {
  const [recipes, setRecipes]       = useState(initialRecipes)
  const [books, setBooks]           = useState(initialBooks)
  const [activeBookId, setActiveBookId]   = useState<string | null>(initialFavoriteBookId ?? null)
  const [favoriteBookId, setFavoriteBookId] = useState<string | null>(initialFavoriteBookId ?? null)
  const [search, setSearch]         = useState('')
  const [activeTag, setActiveTag]   = useState<string | null>(null)
  const [activeTab, setActiveTab]   = useState<Tab>('overview')
  const [formOpen, setFormOpen]     = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  // Base list: book + search + tag filtered, sorted newest first
  const baseRecipes = useMemo(() => {
    let result = activeBookId
      ? recipes.filter(r => r.bookId === activeBookId)
      : recipes
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(r => r.title.toLowerCase().includes(q))
    }
    if (activeTag) {
      result = result.filter(r => r.tags.includes(activeTag))
    }
    return [...result].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [recipes, activeBookId, search, activeTag])

  // Tab-filtered list
  const tabRecipes = useMemo(() => {
    switch (activeTab) {
      case 'favourite': return baseRecipes.filter(isFav)
      case 'quick':     return baseRecipes.filter(isQuick)
      case 'family':    return baseRecipes.filter(isFamily)
      case 'trip':      return baseRecipes.filter(isTrip)
      default:          return baseRecipes
    }
  }, [baseRecipes, activeTab])

  const allTags = useMemo(() => {
    const base = activeBookId ? recipes.filter(r => r.bookId === activeBookId) : recipes
    const tagSet = new Set<string>()
    for (const r of base) r.tags.forEach(t => tagSet.add(t))
    return Array.from(tagSet).sort()
  }, [recipes, activeBookId])

  const counts = useMemo(() => ({
    all:       baseRecipes.length,
    favourite: baseRecipes.filter(isFav).length,
    quick:     baseRecipes.filter(isQuick).length,
    family:    baseRecipes.filter(isFamily).length,
    trip:      baseRecipes.filter(isTrip).length,
  }), [baseRecipes])

  const TAB_ITEMS = [
    { id: 'overview',  label: 'Overview',         icon: LayoutGrid },
    { id: 'all',       label: 'All',              badge: counts.all },
    { id: 'favourite', label: 'Favourites',       icon: Heart, badge: counts.favourite },
    { id: 'quick',     label: 'Quick (< 30 min)', badge: counts.quick },
    { id: 'family',    label: 'Family-tested',    badge: counts.family },
    { id: 'trip',      label: 'From the trip',    badge: counts.trip },
  ]

  const TAB_FILTER_TITLES: Record<Tab, string> = {
    overview:  '',
    all:       'All recipes',
    favourite: 'Favourites',
    quick:     'Quick — under 30 minutes',
    family:    'Family-tested',
    trip:      'From the trip',
  }

  function handleCreated(newRecipe: RecipeSummary) {
    setRecipes(prev => [newRecipe, ...prev])
    if (newRecipe.bookId) {
      setBooks(prev => prev.map(b => b.id === newRecipe.bookId ? { ...b, recipeCount: b.recipeCount + 1 } : b))
    }
    setFormOpen(false)
  }

  function handleBookCreated(book: RecipeBook) {
    setBooks(prev => [...prev, book].sort((a, b) => a.name.localeCompare(b.name)))
  }

  function handleBookDeleted(bookId: string) {
    setBooks(prev => prev.filter(b => b.id !== bookId))
    setRecipes(prev => prev.map(r => r.bookId === bookId ? { ...r, bookId: null } : r))
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
    const recipe = recipes.find(r => r.id === id)
    if (!recipe) return
    if (!confirm(`Delete "${recipe.title}"? This cannot be undone.`)) return
    const res = await fetch(`/api/recipes/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setRecipes(prev => prev.filter(r => r.id !== id))
      if (recipe.bookId) {
        setBooks(prev => prev.map(b => b.id === recipe.bookId ? { ...b, recipeCount: Math.max(0, b.recipeCount - 1) } : b))
      }
    }
  }

  async function handleToggleFavourite(id: string) {
    const recipe = recipes.find(r => r.id === id)
    if (!recipe) return
    const newVal = !recipe.isFavourite
    setRecipes(prev => prev.map(r => r.id === id ? { ...r, isFavourite: newVal } : r))
    const res = await fetch(`/api/recipes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFavourite: newVal }),
    })
    if (!res.ok) {
      setRecipes(prev => prev.map(r => r.id === id ? { ...r, isFavourite: !newVal } : r))
    }
  }

  function handleImported() {
    window.location.reload()
  }

  // Overview sections
  const featuredRecipe   = baseRecipes[0] ?? null
  const recentRecipes    = baseRecipes.slice(1, 7)
  const familyFavRecipes = baseRecipes.filter(isFamily).slice(0, 6)

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

        {/* Page header */}
        <div className="flex items-center justify-between">
          <h1 className="hb-page-head__title">
            {activeBookId ? (books.find(b => b.id === activeBookId)?.name ?? 'Recipes') : 'Recipes'}
          </h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <UploadIcon className="h-4 w-4 mr-1" /> Import
            </Button>
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <PlusIcon className="h-4 w-4 mr-1" /> Add recipe
            </Button>
          </div>
        </div>

        {/* Tab nav */}
        <PillNav
          items={TAB_ITEMS}
          active={activeTab}
          onChange={(id) => setActiveTab(id as Tab)}
          size="sm"
        />

        {/* Search + tag filter */}
        <div className="flex flex-col gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipes…"
              className="pl-8"
            />
          </div>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">Filter by tags</h3>
            {activeTag && (
              <Button variant="ghost" size="sm" onClick={() => setActiveTag(null)} className="h-6 text-xs">
                Clear filter
              </Button>
            )}
          </div>
          <TagCloud
            selectedTag={activeTag}
            onTagClick={setActiveTag}
            maxTags={15}
            showCounts={true}
            scope="recipe"
          />
        </div>

        {/* Tab content */}

        {/* Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {baseRecipes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <p className="text-sm">No recipes found.</p>
              </div>
            ) : (
              <>
                {featuredRecipe && (
                  <HeroRecipeCard recipe={featuredRecipe} onDelete={handleDeleteRecipe} onToggleFavourite={handleToggleFavourite} />
                )}
                <SectionGrid
                  title="Recently Added"
                  sub="Last added"
                  recipes={recentRecipes}
                  tagColors={tagColors}
                  onDelete={handleDeleteRecipe}
                  onToggleFavourite={handleToggleFavourite}
                />
                <SectionGrid
                  title="Family favourites"
                  sub="Tagged family"
                  recipes={familyFavRecipes}
                  tagColors={tagColors}
                  onDelete={handleDeleteRecipe}
                  onToggleFavourite={handleToggleFavourite}
                />
              </>
            )}
          </div>
        )}

        {/* Flat-grid tabs */}
        {activeTab !== 'overview' && (
          <div className="space-y-3">
            <div className="hb-filter-head">
              <h2 className="hb-filter-head__title">{TAB_FILTER_TITLES[activeTab]}</h2>
              <span className="hb-filter-head__sub">{tabRecipes.length} recipe{tabRecipes.length !== 1 ? 's' : ''}</span>
            </div>
            {tabRecipes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <p className="text-sm">No recipes in this filter.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {tabRecipes.map(({ bookId: _b, createdAt: _c, ...cardProps }) => (
                  <RecipeCard key={cardProps.id} {...cardProps} tagColors={tagColors} onDelete={handleDeleteRecipe} onToggleFavourite={handleToggleFavourite} />
                ))}
              </div>
            )}
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
