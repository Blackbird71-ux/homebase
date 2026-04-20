'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, CheckIcon, AlertCircleIcon } from 'lucide-react'

interface Ingredient {
  id: string
  name: string
  categoryId: string | null
  categoryName: string | null
}

interface Category {
  id: string
  name: string
  isSystem: boolean
}

interface CategoryAssignmentProps {
  ingredients: Ingredient[]
  onAssignmentComplete?: () => void
}

export function CategoryAssignment({ ingredients, onAssignmentComplete }: CategoryAssignmentProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  useEffect(() => {
    fetchCategories()
  }, [])

  useEffect(() => {
    // Initialize assignments with current category IDs
    const initialAssignments: Record<string, string> = {}
    ingredients.forEach(ing => {
      if (ing.categoryId) {
        initialAssignments[ing.id] = ing.categoryId
      }
    })
    setAssignments(initialAssignments)
  }, [ingredients])

  async function fetchCategories() {
    try {
      setLoading(true)
      const res = await fetch('/api/ingredient-categories')
      if (!res.ok) throw new Error('Failed to fetch categories')
      const data = await res.json()
      setCategories(data)
    } catch (error) {
      toast.error('Failed to load categories')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  function handleAssignmentChange(ingredientId: string, categoryId: string | null) {
    if (categoryId === null) {
      const newAssignments = { ...assignments }
      delete newAssignments[ingredientId]
      setAssignments(newAssignments)
    } else {
      setAssignments(prev => ({
        ...prev,
        [ingredientId]: categoryId
      }))
    }
  }

  function handleBulkAssign() {
    if (!selectedCategory) {
      toast.error('Please select a category first')
      return
    }

    const newAssignments = { ...assignments }
    ingredients.forEach(ing => {
      newAssignments[ing.id] = selectedCategory
    })
    setAssignments(newAssignments)
    toast.success(`Assigned all ingredients to ${categories.find(c => c.id === selectedCategory)?.name}`)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const updates = Object.entries(assignments).map(([ingredientId, categoryId]) => ({
        ingredientId,
        categoryId: categoryId || null
      }))

      const res = await fetch('/api/ingredient-categories/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save assignments')
      }

      toast.success('Category assignments saved successfully')
      onAssignmentComplete?.()
    } catch (error: any) {
      toast.error(error.message || 'Failed to save assignments')
    } finally {
      setSaving(false)
    }
  }

  const uncategorizedIngredients = ingredients.filter(ing => !assignments[ing.id])
  const categorizedCount = Object.keys(assignments).length
  const totalCount = ingredients.length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Assign Ingredient Categories</h2>
        <p className="text-muted-foreground">
          Assign categories to ingredients for better organization in shopping lists.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bulk Assignment</CardTitle>
          <CardDescription>
            Assign all ingredients to a specific category at once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-center">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                    {category.isSystem && ' (System)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleBulkAssign} disabled={!selectedCategory}>
              Assign All
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Individual Assignment</CardTitle>
          <CardDescription>
            {categorizedCount} of {totalCount} ingredients categorized
          </CardDescription>
        </CardHeader>
        <CardContent>
          {uncategorizedIngredients.length > 0 && (
            <div className="mb-6 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
                <AlertCircleIcon className="h-4 w-4" />
                <span className="font-medium">{uncategorizedIngredients.length} uncategorized ingredients</span>
              </div>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                These ingredients will remain in "Other" category if not assigned.
              </p>
            </div>
          )}

          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
            {ingredients.map((ingredient) => {
              const currentCategoryId = assignments[ingredient.id]
              const currentCategory = categories.find(c => c.id === currentCategoryId)

              return (
                <div key={ingredient.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <span className="font-medium">{ingredient.name}</span>
                    {ingredient.categoryName && !currentCategoryId && (
                      <span className="text-sm text-muted-foreground ml-2">
                        (currently: {ingredient.categoryName})
                      </span>
                    )}
                  </div>
                  <Select
                    value={currentCategoryId || ''}
                    onValueChange={(value) => handleAssignmentChange(ingredient.id, value)}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Other (Uncategorized)</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                          {category.isSystem && ' (System)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          <CheckIcon className="h-4 w-4 inline mr-1" />
          {categorizedCount} ingredients categorized
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => onAssignmentComplete?.()}>
            Skip
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Assignments
          </Button>
        </div>
      </div>
    </div>
  )
}