'use client'

import { useState, useMemo } from 'react'
import { RecipeCard } from '@/components/recipes/RecipeCard'
import { RecipeForm } from '@/components/recipes/RecipeForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PlusIcon, SearchIcon } from 'lucide-react'

interface RecipeSummary {
  id: string
  title: string
  description: string | null
  tags: string[]
  prepTime: number | null
  cookTime: number | null
  servings: number | null
  createdAt: string
}

export function RecipesClient({ initialRecipes }: { initialRecipes: RecipeSummary[] }) {
  const [recipes, setRecipes] = useState(initialRecipes)
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    for (const r of recipes) r.tags.forEach((t) => tagSet.add(t))
    return Array.from(tagSet).sort()
  }, [recipes])

  const filtered = useMemo(() => {
    let result = recipes
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((r) => r.title.toLowerCase().includes(q))
    }
    if (activeTag) {
      result = result.filter((r) => r.tags.includes(activeTag))
    }
    return result
  }, [recipes, search, activeTag])

  function handleCreated(newRecipe: {
    id: string
    title: string
    description: string | null
    tags: string[]
    prepTime: number | null
    cookTime: number | null
    servings: number | null
    createdAt: string
  }) {
    setRecipes((prev) => [newRecipe, ...prev])
    setFormOpen(false)
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 h-full overflow-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Recipes</h1>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <PlusIcon className="h-4 w-4 mr-1" />
          Add recipe
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[180px]">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipes..."
            className="pl-8"
          />
        </div>
        {allTags.map((tag) => (
          <Button
            key={tag}
            variant={activeTag === tag ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTag(activeTag === tag ? null : tag)}
          >
            {tag}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
          <p className="text-sm">No recipes found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((r) => (
            <RecipeCard key={r.id} {...r} />
          ))}
        </div>
      )}

      <RecipeForm
        key={formOpen ? 'open' : 'closed'}
        open={formOpen}
        onOpenChange={setFormOpen}
        onCreated={handleCreated}
      />
    </div>
  )
}
