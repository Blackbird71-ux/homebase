'use client'

import { useState, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ColorPicker } from '@/components/ui/color-picker'
import { toast } from 'sonner'
import { SearchIcon, PlusIcon, EditIcon, TrashIcon, Loader2, GripVertical } from 'lucide-react'

interface Category {
  id: string
  name: string
  color: string | null
  isSystem: boolean
  sortOrder: number
  ingredientCount: number
  aisle?: string | null
}

const CATEGORY_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#78716c',
]

interface SortableRowProps {
  category: Category
  onEdit: (category: Category) => void
  onDelete: (category: Category) => void
}

function SortableRow({ category, onEdit, onDelete }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
    disabled: category.isSystem,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: isDragging ? 'relative' as const : undefined,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-12 gap-4 px-4 py-3 items-center border rounded-lg hover:bg-muted/50 bg-background"
    >
      <div className="col-span-1 flex items-center">
        <button
          {...(category.isSystem ? {} : { ...attributes, ...listeners })}
          className={`${category.isSystem ? 'cursor-not-allowed text-muted-foreground/30' : 'cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground'}`}
          aria-label="Drag to reorder"
          tabIndex={category.isSystem ? -1 : 0}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
      <div className="col-span-4 font-medium">
        <span className="inline-flex items-center gap-1.5">
          {category.color && (
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color }} />
          )}
          {category.name}
        </span>
        {category.isSystem && (
          <span className="ml-2 text-xs text-muted-foreground">(System)</span>
        )}
      </div>
      <div className="col-span-3">
        <span className={`text-sm px-2 py-1 rounded ${category.isSystem ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'}`}>
          {category.isSystem ? 'System' : 'Custom'}
        </span>
      </div>
      <div className="col-span-2 text-muted-foreground">
        {category.ingredientCount} ingredient{category.ingredientCount !== 1 ? 's' : ''}
      </div>
      <div className="col-span-2 text-right">
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(category)}
            disabled={category.isSystem}
            title={category.isSystem ? 'System categories cannot be edited' : 'Edit category'}
          >
            <EditIcon className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(category)}
            disabled={category.isSystem || category.ingredientCount > 0}
            title={category.isSystem ? 'System categories cannot be deleted' : category.ingredientCount > 0 ? 'Cannot delete category with ingredients' : 'Delete category'}
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export function CategoryManager() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('#6366f1')
  const [editCategoryName, setEditCategoryName] = useState('')
  const [editCategoryColor, setEditCategoryColor] = useState('#6366f1')
  const [editCategoryAisle, setEditCategoryAisle] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    fetchCategories()
  }, [])

  async function fetchCategories() {
    try {
      setLoading(true)
      const res = await fetch('/api/ingredient-categories')
      if (!res.ok) throw new Error('Failed to fetch categories')
      const data = await res.json()
      const mappedData = data.map((cat: any) => ({
        id: cat.id,
        name: cat.category,
        color: cat.color ?? null,
        isSystem: !cat.isCustom,
        sortOrder: cat.sortOrder,
        ingredientCount: 0,
        aisle: cat.aisle ?? null,
      }))
      setCategories(mappedData)
    } catch (error) {
      toast.error('Failed to load categories')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = categories.findIndex(c => c.id === active.id)
    const newIndex = categories.findIndex(c => c.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(categories, oldIndex, newIndex).map((cat, idx) => ({
      ...cat,
      sortOrder: idx,
    }))
    setCategories(reordered)

    try {
      const res = await fetch('/api/ingredient-categories/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: reordered.map(c => ({ id: c.id, sortOrder: c.sortOrder })) }),
      })
      if (!res.ok) throw new Error()
    } catch {
      toast.error('Failed to save order')
      fetchCategories()
    }
  }

  async function handleCreate() {
    if (!newCategoryName.trim()) {
      toast.error('Category name is required')
      return
    }

    setSubmitting(true)
    try {
      const trimmed = newCategoryName.trim()
      const key = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
      const res = await fetch('/api/ingredient-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, category: trimmed, color: newCategoryColor }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create category')
      }
      const apiResponse = await res.json()
      const newCategory: Category = {
        id: apiResponse.id,
        name: apiResponse.category,
        color: apiResponse.color ?? null,
        isSystem: !apiResponse.isCustom,
        sortOrder: apiResponse.sortOrder,
        ingredientCount: 0,
      }
      setCategories([...categories, newCategory])
      setNewCategoryName('')
      setNewCategoryColor('#6366f1')
      setCreateOpen(false)
      toast.success('Category created successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to create category')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdate() {
    if (!selectedCategory || !editCategoryName.trim()) {
      toast.error('Category name is required')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/ingredient-categories/${selectedCategory.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: editCategoryName.trim(),
          color: editCategoryColor,
          aisle: editCategoryAisle.trim() || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update category')
      }
      const apiResponse = await res.json()
      const updatedCategory: Category = {
        id: apiResponse.id,
        name: apiResponse.category,
        color: apiResponse.color ?? null,
        isSystem: !apiResponse.isCustom,
        sortOrder: apiResponse.sortOrder,
        ingredientCount: selectedCategory.ingredientCount,
        aisle: apiResponse.aisle ?? null,
      }

      setCategories(categories.map(cat => cat.id === selectedCategory.id ? updatedCategory : cat))
      setEditOpen(false)
      setSelectedCategory(null)
      toast.success('Category updated successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to update category')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!selectedCategory) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/ingredient-categories/${selectedCategory.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete category')
      }
      setCategories(categories.filter(cat => cat.id !== selectedCategory.id))
      setDeleteOpen(false)
      setSelectedCategory(null)
      toast.success('Category deleted successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete category')
    } finally {
      setSubmitting(false)
    }
  }

  function handleEditClick(category: Category) {
    setSelectedCategory(category)
    setEditCategoryName(category.name)
    setEditCategoryColor(category.color ?? '#6366f1')
    setEditCategoryAisle(category.aisle ?? '')
    setEditOpen(true)
  }

  function handleDeleteClick(category: Category) {
    setSelectedCategory(category)
    setDeleteOpen(true)
  }

  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(search.toLowerCase())
  )

  const isSearching = search.trim().length > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Ingredient Categories</h2>
          <p className="text-muted-foreground">Manage categories for organizing ingredients in shopping lists</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger>
            <Button>
              <PlusIcon className="h-4 w-4 mr-2" />
              New Category
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Category</DialogTitle>
              <DialogDescription>
                Categories help organize ingredients in shopping lists.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="category-name">Category Name</Label>
                <Input
                  id="category-name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g., Produce, Dairy, Pantry"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>Category Color</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {CATEGORY_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewCategoryColor(color)}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        newCategoryColor === color ? 'border-white scale-110 ring-2 ring-offset-1 ring-foreground' : 'border-transparent hover:scale-110'
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
                <ColorPicker
                  value={newCategoryColor}
                  onChange={setNewCategoryColor}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={submitting || !newCategoryName.trim()}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Category
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Categories</CardTitle>
          <CardDescription>
            System categories (like "Other") cannot be edited or deleted. Drag rows to reorder.
          </CardDescription>
          <div className="relative mt-4">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search categories..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {search ? 'No categories found matching your search' : 'No categories yet. Create your first category!'}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-4 px-4 py-2 text-sm font-medium text-muted-foreground border-b">
                <div className="col-span-1"></div>
                <div className="col-span-4">Name</div>
                <div className="col-span-3">Type</div>
                <div className="col-span-2">Ingredients</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>
              {isSearching ? (
                <div className="space-y-2">
                  {filteredCategories.map((category) => (
                    <SortableRow
                      key={category.id}
                      category={category}
                      onEdit={handleEditClick}
                      onDelete={handleDeleteClick}
                    />
                  ))}
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={categories.map(c => c.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {categories.map((category) => (
                        <SortableRow
                          key={category.id}
                          category={category}
                          onEdit={handleEditClick}
                          onDelete={handleDeleteClick}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
              {isSearching && (
                <p className="text-xs text-muted-foreground px-4 pt-1">
                  Clear search to drag and reorder categories.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
            <DialogDescription>
              Update the name, color, and aisle number for this category.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-category-name">Category Name</Label>
              <Input
                id="edit-category-name"
                value={editCategoryName}
                onChange={(e) => setEditCategoryName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Category Color</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {CATEGORY_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setEditCategoryColor(color)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                      editCategoryColor === color ? 'border-white scale-110 ring-2 ring-offset-1 ring-foreground' : 'border-transparent hover:scale-110'
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
              <ColorPicker
                value={editCategoryColor}
                onChange={setEditCategoryColor}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-category-aisle">Aisle Number (optional)</Label>
              <Input
                id="edit-category-aisle"
                value={editCategoryAisle}
                onChange={(e) => setEditCategoryAisle(e.target.value)}
                placeholder="e.g., 3, A5, 12b"
              />
              <p className="text-xs text-muted-foreground">
                Set the aisle number for this category to sort your shopping list by store layout.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={submitting || !editCategoryName.trim()}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Update Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the category "{selectedCategory?.name}"?
              {selectedCategory && selectedCategory.ingredientCount > 0 && (
                <span className="text-destructive block mt-1">
                  This category has {selectedCategory.ingredientCount} ingredient{selectedCategory.ingredientCount !== 1 ? 's' : ''}.
                  These ingredients will be moved to the "Other" category.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
