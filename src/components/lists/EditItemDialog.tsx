'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

interface EditItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemId: string
  initialContent: string
  initialCategory: string | null
  availableCategories: string[]
  listId: string
  onSaved: (id: string, content: string, category: string | null) => void
  onCategoryAdded?: (name: string) => Promise<void>
}

export function EditItemDialog({
  open,
  onOpenChange,
  itemId,
  initialContent,
  initialCategory,
  availableCategories,
  listId,
  onSaved,
  onCategoryAdded,
}: EditItemDialogProps) {
  const [content, setContent] = useState(initialContent)
  const [category, setCategory] = useState(initialCategory || 'Other')
  const [isSaving, setIsSaving] = useState(false)
  const [localCategories, setLocalCategories] = useState(availableCategories)
  const [showNewCatInput, setShowNewCatInput] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [isAddingCat, setIsAddingCat] = useState(false)

  useEffect(() => {
    if (open) {
      setContent(initialContent)
      setCategory(initialCategory || 'Other')
      setLocalCategories(availableCategories)
      setShowNewCatInput(false)
      setNewCatName('')
    }
  }, [open, initialContent, initialCategory, availableCategories])

  async function handleAddCategory() {
    const trimmed = newCatName.trim()
    if (!trimmed || localCategories.includes(trimmed)) return
    setIsAddingCat(true)
    try {
      if (onCategoryAdded) await onCategoryAdded(trimmed)
      setLocalCategories((prev) => [...prev, trimmed])
      setCategory(trimmed)
      setShowNewCatInput(false)
      setNewCatName('')
    } catch {
      toast.error('Failed to create category')
    } finally {
      setIsAddingCat(false)
    }
  }

  async function handleSave() {
    if (!content.trim()) {
      toast.error('Item name cannot be empty')
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch(`/api/lists/${listId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.trim(),
          category: category === 'Other' ? null : category,
        }),
      })

      if (res.ok) {
        onSaved(itemId, content.trim(), category === 'Other' ? null : category)
        onOpenChange(false)
        toast.success('Item updated')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to update item')
      }
    } catch (error) {
      toast.error('Failed to update item')
      console.error('Failed to update item:', error)
    } finally {
      setIsSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Edit Item</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-item-name">Name</Label>
            <Input
              id="edit-item-name"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Item name"
              autoFocus
              disabled={isSaving}
            />
          </div>
          {localCategories.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-item-category">Category</Label>
              <Select
                value={category}
                onValueChange={(value) => {
                  if (value === '__new_category__') {
                    setShowNewCatInput(true)
                    return
                  }
                  if (value) setCategory(value)
                }}
                disabled={isSaving}
              >
                <SelectTrigger className="w-full" id="edit-item-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {localCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                  {onCategoryAdded && (
                    <SelectItem value="__new_category__" className="text-muted-foreground italic">
                      + New category...
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {showNewCatInput && (
                <div className="flex gap-2">
                  <Input
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Category name"
                    className="flex-1"
                    autoFocus
                    disabled={isAddingCat}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleAddCategory() }
                      if (e.key === 'Escape') { setShowNewCatInput(false); setNewCatName('') }
                    }}
                  />
                  <Button type="button" size="sm" onClick={handleAddCategory} disabled={isAddingCat || !newCatName.trim()}>
                    Add
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setShowNewCatInput(false); setNewCatName('') }} disabled={isAddingCat}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter showCloseButton>
          <Button onClick={handleSave} disabled={isSaving || !content.trim()}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
