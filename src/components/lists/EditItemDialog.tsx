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
}: EditItemDialogProps) {
  const [content, setContent] = useState(initialContent)
  const [category, setCategory] = useState(initialCategory || 'Other')
  const [isSaving, setIsSaving] = useState(false)

  // Reset form when dialog opens with new item
  useEffect(() => {
    if (open) {
      setContent(initialContent)
      setCategory(initialCategory || 'Other')
    }
  }, [open, initialContent, initialCategory])

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
          {availableCategories.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-item-category">Category</Label>
              <Select
                value={category}
                onValueChange={(value) => value && setCategory(value)}
                disabled={isSaving}
              >
                <SelectTrigger className="w-full" id="edit-item-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
