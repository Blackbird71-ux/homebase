'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { SearchIcon, PlusIcon, EditIcon, TrashIcon, Loader2 } from 'lucide-react'

interface Tag {
  id: string
  name: string
  createdAt: string
  recipeCount: number
}

export function TagManager() {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null)
  const [newTagName, setNewTagName] = useState('')
  const [editTagName, setEditTagName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchTags()
  }, [])

  async function fetchTags() {
    try {
      setLoading(true)
      const res = await fetch(`/api/tags?includeCounts=true${search ? `&search=${encodeURIComponent(search)}` : ''}`)
      if (!res.ok) throw new Error('Failed to fetch tags')
      const data = await res.json()
      setTags(data)
    } catch (error) {
      toast.error('Failed to load tags')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!newTagName.trim()) {
      toast.error('Tag name is required')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create tag')
      }
      const newTag = await res.json()
      setTags([newTag, ...tags])
      setNewTagName('')
      setCreateOpen(false)
      toast.success('Tag created successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to create tag')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdate() {
    if (!selectedTag || !editTagName.trim()) {
      toast.error('Tag name is required')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/tags/${selectedTag.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editTagName.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update tag')
      }
      const updatedTag = await res.json()
      setTags(tags.map(tag => tag.id === selectedTag.id ? { ...updatedTag, recipeCount: selectedTag.recipeCount } : tag))
      setEditOpen(false)
      setSelectedTag(null)
      toast.success('Tag updated successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to update tag')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!selectedTag) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/tags/${selectedTag.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete tag')
      }
      setTags(tags.filter(tag => tag.id !== selectedTag.id))
      setDeleteOpen(false)
      setSelectedTag(null)
      toast.success('Tag deleted successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete tag')
    } finally {
      setSubmitting(false)
    }
  }

  function handleEditClick(tag: Tag) {
    setSelectedTag(tag)
    setEditTagName(tag.name)
    setEditOpen(true)
  }

  function handleDeleteClick(tag: Tag) {
    setSelectedTag(tag)
    setDeleteOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Tag Management</h2>
          <p className="text-muted-foreground">Create, edit, and delete tags for organizing recipes</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger>
            <Button>
              <PlusIcon className="h-4 w-4 mr-2" />
              New Tag
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Tag</DialogTitle>
              <DialogDescription>
                Tags help organize recipes. Enter a name for your new tag.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tag-name">Tag Name</Label>
                <Input
                  id="tag-name"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="e.g., Italian, Quick, Vegetarian"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={submitting || !newTagName.trim()}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Tag
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Tags</CardTitle>
          <CardDescription>
            Tags are shared across your family. Deleting a tag will remove it from recipes.
          </CardDescription>
          <div className="relative mt-4">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tags..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchTags()}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tags.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {search ? 'No tags found matching your search' : 'No tags yet. Create your first tag!'}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-4 px-4 py-2 text-sm font-medium text-muted-foreground border-b">
                <div className="col-span-4">Name</div>
                <div className="col-span-3">Used In</div>
                <div className="col-span-3">Created</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>
              {tags.map((tag) => (
                <div key={tag.id} className="grid grid-cols-12 gap-4 px-4 py-3 items-center border rounded-lg hover:bg-muted/50">
                  <div className="col-span-4 font-medium">
                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold">
                      {tag.name}
                    </span>
                  </div>
                  <div className="col-span-3 text-muted-foreground">
                    {tag.recipeCount} recipe{tag.recipeCount !== 1 ? 's' : ''}
                  </div>
                  <div className="col-span-3">
                    {new Date(tag.createdAt).toLocaleDateString()}
                  </div>
                  <div className="col-span-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditClick(tag)}
                      >
                        <EditIcon className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteClick(tag)}
                        disabled={tag.recipeCount > 0}
                        title={tag.recipeCount > 0 ? 'Cannot delete tag that is in use' : 'Delete tag'}
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </Button>
                    </div>
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
            <DialogTitle>Edit Tag</DialogTitle>
            <DialogDescription>
              Update the name of this tag.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-tag-name">Tag Name</Label>
              <Input
                id="edit-tag-name"
                value={editTagName}
                onChange={(e) => setEditTagName(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={submitting || !editTagName.trim()}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Update Tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Tag</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the tag "{selectedTag?.name}"?
              {selectedTag && selectedTag.recipeCount > 0 && (
                <span className="text-destructive block mt-1">
                  This tag is used in {selectedTag.recipeCount} recipe{selectedTag.recipeCount !== 1 ? 's' : ''}.
                  Deleting it will remove it from all recipes.
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
              Delete Tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}