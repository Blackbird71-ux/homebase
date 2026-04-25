'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { PlusIcon, EditIcon, TrashIcon, Loader2 } from 'lucide-react'

interface EventCategory {
  id: string
  name: string
  color: string | null
  isSystem: boolean
  sortOrder: number
}

export function EventCategoryManager() {
  const [categories, setCategories] = useState<EventCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('#6366f1')
  const [editCategoryName, setEditCategoryName] = useState('')
  const [editCategoryColor, setEditCategoryColor] = useState('#6366f1')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchCategories()
  }, [])

  async function fetchCategories() {
    try {
      setLoading(true)
      const res = await fetch('/api/event-categories')
      if (!res.ok) throw new Error('Failed to fetch categories')
      const data = await res.json()
      setCategories(data)
    } catch (error) {
      toast.error('Failed to load event categories')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!newCategoryName.trim()) {
      toast.error('Category name is required')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/event-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName.trim(), color: newCategoryColor }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create category')
      }
      const created = await res.json()
      setCategories([...categories, created])
      setNewCategoryName('')
      setNewCategoryColor('#6366f1')
      setCreateOpen(false)
      toast.success('Event category created')
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
      const res = await fetch(`/api/event-categories/${selectedCategory.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editCategoryName.trim(), color: editCategoryColor }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update category')
      }
      const updated = await res.json()
      setCategories(categories.map(c => c.id === selectedCategory.id ? updated : c))
      setEditOpen(false)
      setSelectedCategory(null)
      toast.success('Event category updated')
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
      const res = await fetch(`/api/event-categories/${selectedCategory.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete category')
      }
      setCategories(categories.filter(c => c.id !== selectedCategory.id))
      setDeleteOpen(false)
      setSelectedCategory(null)
      toast.success('Event category deleted')
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete category')
    } finally {
      setSubmitting(false)
    }
  }

  function handleEditClick(category: EventCategory) {
    setSelectedCategory(category)
    setEditCategoryName(category.name)
    setEditCategoryColor(category.color ?? '#6366f1')
    setEditOpen(true)
  }

  function handleDeleteClick(category: EventCategory) {
    setSelectedCategory(category)
    setDeleteOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Event Categories</h2>
          <p className="text-muted-foreground">Manage categories for organizing calendar events</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button><PlusIcon className="h-4 w-4 mr-2" />New Category</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Event Category</DialogTitle>
              <DialogDescription>
                Categories help organize events on the calendar (e.g., Medical, School, Birthday).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cat-name">Category Name</Label>
                <Input
                  id="cat-name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g., Birthday, Holiday, Appointment"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cat-color">Color</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="cat-color"
                    type="color"
                    value={newCategoryColor}
                    onChange={(e) => setNewCategoryColor(e.target.value)}
                    className="w-12 h-10 p-1"
                  />
                  <Input
                    value={newCategoryColor}
                    onChange={(e) => setNewCategoryColor(e.target.value)}
                    placeholder="#hex color"
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={submitting || !newCategoryName.trim()}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Event Categories</CardTitle>
          <CardDescription>
            System categories are created by default. You can edit their names and colors, but they cannot be deleted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No categories yet. Create your first event category!
            </div>
          ) : (
            <div className="space-y-2">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between px-4 py-3 border rounded-lg hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: category.color ?? '#6366f1' }}
                    />
                    <span className="font-medium">{category.name}</span>
                    {category.isSystem && (
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        System
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditClick(category)}
                      title="Edit"
                    >
                      <EditIcon className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteClick(category)}
                      disabled={category.isSystem}
                      title={category.isSystem ? 'System categories cannot be deleted' : 'Delete'}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Event Category</DialogTitle>
            <DialogDescription>Update the name and color of this category.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-cat-name">Category Name</Label>
              <Input
                id="edit-cat-name"
                value={editCategoryName}
                onChange={(e) => setEditCategoryName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-cat-color">Color</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="edit-cat-color"
                  type="color"
                  value={editCategoryColor}
                  onChange={(e) => setEditCategoryColor(e.target.value)}
                  className="w-12 h-10 p-1"
                />
                <Input
                  value={editCategoryColor}
                  onChange={(e) => setEditCategoryColor(e.target.value)}
                  placeholder="#hex color"
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={submitting || !editCategoryName.trim()}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Event Category</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the category "{selectedCategory?.name}"?
              Existing events using this category will retain the category name but won't be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
