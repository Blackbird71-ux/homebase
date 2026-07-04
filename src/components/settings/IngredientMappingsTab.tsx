'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface IngredientMapping {
  id: string
  ingredient: string
  category: string
}

interface IngredientCategory {
  id: string
  key: string
  category: string
  sortOrder: number
  isCustom: boolean
}

export function IngredientMappingsTab() {
  const [mappings, setMappings] = useState<IngredientMapping[]>([])
  const [categories, setCategories] = useState<IngredientCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newMapping, setNewMapping] = useState({ ingredient: '', category: '' })

  useEffect(() => {
    Promise.all([loadMappings(), loadCategories()])
  }, [])

  async function loadCategories() {
    try {
      const res = await fetch('/api/ingredient-categories')
      if (res.ok) {
        const data: IngredientCategory[] = await res.json()
        setCategories(data)
        setNewMapping(prev => ({ ...prev, category: prev.category || data[0]?.category || '' }))
      }
    } catch {
      toast.error('Failed to load categories')
    }
  }

  async function loadMappings() {
    try {
      setLoading(true)
      const res = await fetch('/api/ingredient-mappings')
      if (res.ok) {
        const data = await res.json()
        setMappings(data)
      }
    } catch (error) {
      toast.error('Failed to load ingredient mappings')
    } finally {
      setLoading(false)
    }
  }

  async function addMapping() {
    if (!newMapping.ingredient.trim()) {
      toast.error('Please enter an ingredient')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/ingredient-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMapping),
      })

      if (res.ok) {
        const saved = await res.json()
        setMappings([...mappings, saved])
        setNewMapping({ ingredient: '', category: categories[0]?.category || '' })
        toast.success('Mapping added')
      } else {
        const error = await res.json().catch(() => null)
        toast.error(error?.error || 'Failed to add mapping')
      }
    } catch (error) {
      toast.error('Failed to add mapping')
    } finally {
      setSaving(false)
    }
  }

  async function deleteMapping(id: string) {
    try {
      const res = await fetch(`/api/ingredient-mappings/${id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setMappings(mappings.filter(m => m.id !== id))
        toast.success('Mapping deleted')
      } else {
        toast.error('Failed to delete mapping')
      }
    } catch (error) {
      toast.error('Failed to delete mapping')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Ingredient Category Mappings</CardTitle>
          <CardDescription>
            Customize how ingredients are automatically categorized in shopping lists.
            These mappings override the default keyword detection.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Add new mapping */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Add New Mapping</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 space-y-2">
                <Label htmlFor="ingredient">Ingredient</Label>
                <Input
                  id="ingredient"
                  placeholder="e.g., Bacon, Parmesan, Olive Oil"
                  value={newMapping.ingredient}
                  onChange={(e) => setNewMapping({ ...newMapping, ingredient: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && addMapping()}
                />
                <p className="text-xs text-muted-foreground">
                  Enter the ingredient name (without quantities)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={newMapping.category}
                  onValueChange={(value) => setNewMapping({ ...newMapping, category: value || 'Other' })}
                >
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue>{newMapping.category}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.category}>
                        {cat.category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={addMapping} disabled={saving || !newMapping.ingredient.trim()}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Add
                </Button>
              </div>
            </div>
          </div>

          {/* Existing mappings */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Current Mappings ({mappings.length})</h3>
            {mappings.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No custom mappings yet. Add your first mapping above.
              </p>
            ) : (
              <div className="border rounded-lg divide-y">
                {mappings.map((mapping) => (
                  <div key={mapping.id} className="flex items-center justify-between p-3">
                    <div className="flex-1">
                      <span className="font-medium">{mapping.ingredient}</span>
                      <span className="text-muted-foreground mx-2">→</span>
                      <span className="px-2 py-1 bg-secondary text-secondary-foreground rounded text-sm">
                        {mapping.category}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMapping(mapping.id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg bg-muted p-4">
            <h4 className="text-sm font-medium mb-2">How it works</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• When you add "Bacon" to a shopping list, it will be categorized as "Deli" (if mapped)</li>
              <li>• Mappings override the default keyword detection system</li>
              <li>• Enter ingredients without quantities (e.g., "Bacon" not "500g Bacon")</li>
              <li>• These mappings are specific to your family</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}