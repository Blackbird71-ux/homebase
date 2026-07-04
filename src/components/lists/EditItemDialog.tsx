'use client'

import { useState, useEffect } from 'react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/sheet'
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
  onSaved: (id: string, content: string, category: string | null, dueDate?: string | null, assignedToUserId?: string | null, unitPrice?: number | null, quantity?: number | null) => void
  /** When provided, saves made offline (or on a not-yet-synced tmp_ item) are
      queued for replay instead of failing. */
  queueOfflineEdit?: (id: string, body: Record<string, unknown>) => Promise<void>
  onCategoryAdded?: (name: string) => Promise<void>
  initialUnitPrice?: number | null
  initialQuantity?: number | null
  initialDueDate?: string | null
  initialAssignedToUserId?: string | null
  members?: { id: string; name: string }[]
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
  queueOfflineEdit,
  onCategoryAdded,
  initialUnitPrice,
  initialQuantity,
  initialDueDate,
  initialAssignedToUserId,
  members,
}: EditItemDialogProps) {
  const [content, setContent] = useState(initialContent)
  const [category, setCategory] = useState(initialCategory || 'Other')
  const [unitPrice, setUnitPrice] = useState(initialUnitPrice?.toString() ?? '')
  const [quantity, setQuantity] = useState(initialQuantity?.toString() ?? '')
  const [dueDate, setDueDate] = useState(initialDueDate ? initialDueDate.slice(0, 10) : '')
  const [assignedToUserId, setAssignedToUserId] = useState(initialAssignedToUserId ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [localCategories, setLocalCategories] = useState(availableCategories)
  const [showNewCatInput, setShowNewCatInput] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [isAddingCat, setIsAddingCat] = useState(false)

  useEffect(() => {
    if (open) {
      setContent(initialContent)
      setCategory(initialCategory || 'Other')
      setUnitPrice(initialUnitPrice?.toString() ?? '')
      setQuantity(initialQuantity?.toString() ?? '')
      setDueDate(initialDueDate ? initialDueDate.slice(0, 10) : '')
      setAssignedToUserId(initialAssignedToUserId ?? '')
      setLocalCategories(availableCategories)
      setShowNewCatInput(false)
      setNewCatName('')
    }
  }, [open, initialContent, initialCategory, availableCategories, initialUnitPrice, initialQuantity, initialDueDate, initialAssignedToUserId])

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
      const parsedUnitPrice = unitPrice.trim() ? parseFloat(unitPrice) : null
      const parsedQuantity = quantity.trim() ? parseFloat(quantity) : null
      const resolvedDueDate = members !== undefined ? (dueDate || null) : undefined
      const resolvedAssignee = members !== undefined ? (assignedToUserId || null) : undefined

      const payload = {
        content: content.trim(),
        category: category === 'Other' ? null : category,
        unitPrice: parsedUnitPrice,
        quantity: parsedQuantity,
        ...(resolvedDueDate !== undefined && { dueDate: resolvedDueDate }),
        ...(resolvedAssignee !== undefined && { assignedToUserId: resolvedAssignee }),
      }

      if (queueOfflineEdit && (!navigator.onLine || itemId.startsWith('tmp_'))) {
        await queueOfflineEdit(itemId, payload)
        onSaved(itemId, payload.content, payload.category, resolvedDueDate, resolvedAssignee, parsedUnitPrice, parsedQuantity)
        onOpenChange(false)
        toast.success('Saved — will sync when back online')
        return
      }

      const res = await fetch(`/api/lists/${listId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        const saved = await res.json()
        onSaved(itemId, content.trim(), category === 'Other' ? null : category, resolvedDueDate, resolvedAssignee, saved.unitPrice ?? null, saved.quantity ?? null)
        onOpenChange(false)
        toast.success('Item updated')
      } else {
        const data = await res.json().catch(() => null)
        toast.error(data?.error || 'Failed to update item')
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
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="sm:max-w-[560px]" showCloseButton={true}>
        <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
          <DrawerTitle>Edit Item</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col gap-4 px-4 py-4 flex-1 overflow-y-auto">
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
          {members !== undefined && (
            <div className="flex gap-4">
              <div className="flex flex-col gap-2 flex-1">
                <Label htmlFor="edit-item-due-date">Due Date</Label>
                <Input
                  id="edit-item-due-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={isSaving}
                />
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <Label htmlFor="edit-item-assignee">Assigned To</Label>
                <Select
                  value={assignedToUserId || '__none__'}
                  onValueChange={(v) => setAssignedToUserId(v === '__none__' || v === null ? '' : v)}
                  disabled={isSaving}
                >
                  <SelectTrigger className="w-full" id="edit-item-assignee">
                    <SelectValue placeholder="Unassigned">
                      {assignedToUserId
                        ? (members?.find(m => m.id === assignedToUserId)?.name ?? assignedToUserId)
                        : 'Unassigned'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {(initialUnitPrice !== undefined || initialQuantity !== undefined) && (
            <div className="flex gap-4">
              <div className="flex flex-col gap-2 flex-1">
                <Label htmlFor="edit-item-unit-price">Unit Price ($)</Label>
                <Input
                  id="edit-item-unit-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  placeholder="0.00"
                  disabled={isSaving}
                />
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <Label htmlFor="edit-item-quantity">Quantity</Label>
                <Input
                  id="edit-item-quantity"
                  type="number"
                  step="0.01"
                  min="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="1"
                  disabled={isSaving}
                />
              </div>
            </div>
          )}
        </div>
        <DrawerFooter className="px-4 py-3 border-t border-border shrink-0 flex-col sm:flex-row gap-2 sm:justify-end">
          <Button onClick={handleSave} disabled={isSaving || !content.trim()}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
