'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { PlusIcon, BarcodeIcon } from 'lucide-react'
import { toast } from 'sonner'
import { groupByCategory, groupByRecipe, DEFAULT_SHOPPING_CATEGORIES } from '@/lib/list-helpers'
import type { ListItemShape, ShoppingCategory } from '@/lib/list-helpers'
import { autoGuessCategory } from '@/lib/ingredient-helpers'
import { CategoryGroup } from './CategoryGroup'
import { DoneSection } from './DoneSection'
import { ListItemRow } from './ListItemRow'
import { EditItemDialog } from './EditItemDialog'
import { BarcodeScanner } from './BarcodeScanner'
import { useOfflineQueue } from '@/hooks/lists/useOfflineQueue'
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'

interface ShoppingListProps {
  listId: string
  initialItems: ListItemShape[]
  initialCategoryOrder: string[] | null
}

type ViewMode = 'aisle' | 'recipe'

export function ShoppingList({ listId, initialItems, initialCategoryOrder }: ShoppingListProps) {
  const [items, setItems] = useState<ListItemShape[]>(initialItems)
  const [viewMode, setViewMode] = useState<ViewMode>('aisle')
  const [showRecipePills, setShowRecipePills] = useState(false)
  const [categories, setCategories] = useState<string[]>(DEFAULT_SHOPPING_CATEGORIES)
  const [categoryOrder, setCategoryOrder] = useState<string[]>(
    initialCategoryOrder ?? [...DEFAULT_SHOPPING_CATEGORIES]
  )
  const [newContent, setNewContent] = useState('')
  const [newCategory, setNewCategory] = useState<ShoppingCategory>('Other')
  const [categoryManuallySet, setCategoryManuallySet] = useState(false)
  const [, startTransition] = useTransition()
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [availableCategories, setAvailableCategories] = useState<Array<{id: string; name: string; aisle?: string | null}>>([])
  const [aisleMap, setAisleMap] = useState<Record<string, string | null>>({})
  const [editItemId, setEditItemId] = useState<string | null>(null)
  const [editItemContent, setEditItemContent] = useState('')
  const [editItemCategory, setEditItemCategory] = useState<string | null>(null)
  const [addingCategoryInline, setAddingCategoryInline] = useState(false)
  const [inlineCatName, setInlineCatName] = useState('')
  const [isSavingCat, setIsSavingCat] = useState(false)
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  // ── Offline sync ────────────────────────────────────────────────────────────

  const { registerBackgroundSync, broadcastQueueCount, enqueueMutation } =
    useOfflineQueue(listId, setItems)

  // ── Debounced saves ─────────────────────────────────────────────────────────

  const debouncedSaveCategoryOrder = useDebouncedCallback(
    useCallback((order: string[]) => {
      fetch(`/api/lists/${listId}/category-order`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryOrder: order }),
      }).catch(() => toast.error('Failed to save category order.'))
    }, [listId]),
    500,
  )

  const debouncedSaveItemOrder = useDebouncedCallback(
    useCallback((updates: { id: string; sortOrder: number }[]) => {
      fetch(`/api/lists/${listId}/items/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: updates }),
      }).catch(() => toast.error('Failed to save item order.'))
    }, [listId]),
    500,
  )

  // ── Category auto-detect ────────────────────────────────────────────────────

  useEffect(() => {
    if (!categoryManuallySet && newContent.trim()) {
      const detected = autoGuessCategory(newContent.trim())
      if (detected && detected !== newCategory) setNewCategory(detected)
    }
  }, [newContent, categoryManuallySet])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch dynamic categories on mount ───────────────────────────────────────

  useEffect(() => {
    async function fetchCategories() {
      try {
        const response = await fetch('/api/ingredient-categories')
        if (response.ok) {
          const data = await response.json()
          const categoryNames = (data as Array<{ category: string }>).map(c => c.category)
          if (!categoryNames.includes('Other')) categoryNames.push('Other')
          setCategories(categoryNames)
          setAvailableCategories(data)

          const aisleMapping: Record<string, string | null> = {}
          for (const cat of data) {
            if (cat.aisle) aisleMapping[cat.category] = cat.aisle
          }
          setAisleMap(aisleMapping)

          setCategoryOrder(current => {
            const newCats = categoryNames.filter((c: string) => !current.includes(c))
            return newCats.length > 0 ? [...current, ...newCats] : current
          })
        }
      } catch {
        // Offline or network error — default categories already in state
      } finally {
        setLoadingCategories(false)
      }
    }
    fetchCategories()
  }, [])

  // ── Drag and drop ───────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeType = active.data.current?.type as string | undefined

    if (activeType === 'category') {
      const oldIndex = categoryOrder.indexOf(active.id as string)
      const newIndex = categoryOrder.indexOf(over.id as string)
      if (oldIndex === -1 || newIndex === -1) return
      const newOrder = arrayMove(categoryOrder, oldIndex, newIndex)
      setCategoryOrder(newOrder)
      debouncedSaveCategoryOrder(newOrder)
    } else if (activeType === 'item') {
      const activeCategory = active.data.current?.category as string | null | undefined
      const catItems = items.filter(i => !i.isCompleted && i.category === activeCategory)
      const oldIndex = catItems.findIndex(i => i.id === active.id)
      const newIndex = catItems.findIndex(i => i.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return
      const reordered = arrayMove(catItems, oldIndex, newIndex)
      const updates = reordered.map((item, idx) => ({ id: item.id, sortOrder: idx }))
      setItems(prev => prev.map(i => {
        const u = updates.find(x => x.id === i.id)
        return u ? { ...i, sortOrder: u.sortOrder } : i
      }))
      debouncedSaveItemOrder(updates)
    }
  }

  // ── Item actions ────────────────────────────────────────────────────────────

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newContent.trim()) return

    const body = { content: newContent.trim(), category: newCategory }

    if (!navigator.onLine) {
      const tempId = `tmp_${crypto.randomUUID()}`
      const optimisticItem: ListItemShape = {
        id: tempId,
        content: body.content,
        category: body.category,
        isCompleted: false,
        isLocked: false,
        sortOrder: 0,
        dueDate: null,
        recipeId: null,
        recipeName: null,
        createdBy: '',
        listId,
        createdAt: new Date(),
        unitPrice: null,
        quantity: null,
        assignedToUserId: null,
      }
      setItems(prev => [...prev, optimisticItem])
      setNewContent('')
      setNewCategory('Other')
      setCategoryManuallySet(false)
      await enqueueMutation({ id: crypto.randomUUID(), endpoint: `/api/lists/${listId}/items`, method: 'POST', body, tempId, listId, queuedAt: Date.now() })
      await registerBackgroundSync()
      await broadcastQueueCount()
      return
    }

    const res = await fetch(`/api/lists/${listId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const item = await res.json()
      setItems(prev => [...prev, {
        ...item,
        dueDate:    item.dueDate    ? new Date(item.dueDate)    : null,
        createdAt:  new Date(item.createdAt),
        recipeId:   item.recipeId   ?? null,
        recipeName: item.recipeName ?? null,
      }])
      setNewContent('')
      setNewCategory('Other')
      setCategoryManuallySet(false)
    } else {
      toast.error('Failed to save. Please try again.')
    }
  }

  async function toggleItem(id: string, isCompleted: boolean) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, isCompleted } : i))

    if (!navigator.onLine || id.startsWith('tmp_')) {
      if (!id.startsWith('tmp_')) {
        await enqueueMutation({ id: crypto.randomUUID(), endpoint: `/api/lists/${listId}/items/${id}`, method: 'PATCH', body: { isCompleted }, listId, queuedAt: Date.now() })
        await registerBackgroundSync()
        await broadcastQueueCount()
      }
      return
    }

    startTransition(async () => {
      const res = await fetch(`/api/lists/${listId}/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted }),
      })
      if (!res.ok) {
        setItems(prev => prev.map(i => i.id === id ? { ...i, isCompleted: !isCompleted } : i))
        toast.error('Failed to save. Please try again.')
      }
    })
  }

  async function deleteItem(id: string) {
    const res = await fetch(`/api/lists/${listId}/items/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setItems(prev => prev.filter(i => i.id !== id))
    } else {
      toast.error('Failed to save. Please try again.')
    }
  }

  async function toggleLock(id: string, isLocked: boolean) {
    const res = await fetch(`/api/lists/${listId}/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isLocked }),
    })
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, isLocked } : i))
    } else {
      toast.error('Failed to update item.')
    }
  }

  async function changeItemCategory(id: string, newCat: string) {
    const res = await fetch(`/api/lists/${listId}/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: newCat }),
    })
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, category: newCat } : i))
      toast.success('Category updated')
    } else {
      toast.error('Failed to update category')
      throw new Error('Failed to update category')
    }
  }

  function handleEditItem(id: string) {
    const item = items.find(i => i.id === id)
    if (item) { setEditItemId(id); setEditItemContent(item.content); setEditItemCategory(item.category || null) }
  }

  function handleItemSaved(id: string, content: string, category: string | null) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, content, category } : i))
  }

  async function handleAddShoppingCategory(name: string) {
    const key = `custom_${name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}_${Date.now()}`
    const res = await fetch('/api/ingredient-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, category: name }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Failed to create category')
    }
    const newCat = await res.json()
    setCategories(prev => [...prev, name])
    setAvailableCategories(prev => [...prev, { id: newCat.id, name }])
    setCategoryOrder(prev => [...prev, name])
  }

  async function handleCreateInlineCategory() {
    const trimmed = inlineCatName.trim()
    if (!trimmed || categories.includes(trimmed)) return
    setIsSavingCat(true)
    try {
      await handleAddShoppingCategory(trimmed)
      setNewCategory(trimmed as ShoppingCategory)
      setCategoryManuallySet(true)
      setInlineCatName('')
      setAddingCategoryInline(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create category')
    } finally {
      setIsSavingCat(false)
    }
  }

  async function clearCompleted() {
    const res = await fetch(`/api/lists/${listId}/clear-completed`, { method: 'POST' })
    if (res.ok) {
      setItems(prev => prev.filter(i => !(i.isCompleted && !i.isLocked)))
    } else {
      toast.error('Failed to save. Please try again.')
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const completedItems = items.filter(i => i.isCompleted)
  const grouped = groupByCategory(items, categoryOrder)
  const recipeGroups = groupByRecipe(items.filter(i => !i.isCompleted))
  const activeCategoryOrder = categoryOrder.filter(c => categories.includes(c))

  return (
    <div className="flex flex-col gap-2 sm:gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          <button onClick={() => setViewMode('aisle')}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${viewMode === 'aisle' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            By Aisle
          </button>
          <button onClick={() => setViewMode('recipe')}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${viewMode === 'recipe' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            By Recipe
          </button>
        </div>
        {viewMode === 'aisle' && (
          <button onClick={() => setShowRecipePills(v => !v)}
            className={`px-2 py-1 rounded-md text-xs font-medium transition-colors border ${showRecipePills ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-transparent border-border text-muted-foreground hover:text-foreground'}`}>
            {showRecipePills ? 'Hide Recipes' : 'Show Recipes'}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <form onSubmit={addItem} className="flex gap-2 items-center">
          <Input value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="Add item..." className="flex-1 min-w-0" />
          <select
            value={addingCategoryInline ? '__adding__' : newCategory}
            onChange={e => {
              if (e.target.value === '__new__') { setAddingCategoryInline(true); setInlineCatName('') }
              else { setNewCategory(e.target.value as ShoppingCategory); setCategoryManuallySet(true) }
            }}
            className="w-24 sm:w-auto shrink-0 h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
            disabled={loadingCategories || addingCategoryInline}
          >
            {loadingCategories ? (
              <option value="Other">Loading...</option>
            ) : addingCategoryInline ? (
              <option value="__adding__">New cat...</option>
            ) : (
              <>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="__new__">+ New...</option>
              </>
            )}
          </select>
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowBarcodeScanner(v => !v)} className="shrink-0" title="Scan barcode">
            <BarcodeIcon className="h-4 w-4" />
          </Button>
          <Button type="submit" size="sm" className="shrink-0">
            <PlusIcon className="h-4 w-4" />
          </Button>
        </form>
        {addingCategoryInline && (
          <div className="flex gap-2">
            <Input value={inlineCatName} onChange={e => setInlineCatName(e.target.value)} placeholder="Category name"
              className="flex-1 h-8 text-sm" autoFocus disabled={isSavingCat}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); handleCreateInlineCategory() }
                if (e.key === 'Escape') { setAddingCategoryInline(false); setInlineCatName('') }
              }}
            />
            <Button type="button" size="sm" onClick={handleCreateInlineCategory} disabled={isSavingCat || !inlineCatName.trim()}>
              {isSavingCat ? 'Adding...' : 'Add'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setAddingCategoryInline(false); setInlineCatName('') }} disabled={isSavingCat}>
              Cancel
            </Button>
          </div>
        )}
        {showBarcodeScanner && (
          <div className="p-3 bg-muted rounded-lg">
            <BarcodeScanner onDetected={code => { setNewContent(code); setShowBarcodeScanner(false) }} onClose={() => setShowBarcodeScanner(false)} />
          </div>
        )}
      </div>

      {completedItems.length > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setShowClearConfirm(true)} className="self-end text-muted-foreground">
          Clear {completedItems.length} completed
        </Button>
      )}

      {viewMode === 'aisle' ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={activeCategoryOrder} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2 sm:gap-4">
              {activeCategoryOrder.map(cat => {
                const catItems = grouped[cat] ?? []
                if (catItems.length === 0) return null
                return (
                  <CategoryGroup key={cat} category={cat} items={catItems} showDragHandle={true}
                    showRecipePills={showRecipePills} aisle={aisleMap[cat] ?? null}
                    onToggle={toggleItem} onDelete={deleteItem} onToggleLock={toggleLock}
                    availableCategories={categories} onCategoryChange={changeItemCategory} onEdit={handleEditItem}
                  />
                )
              })}
            </div>
          </SortableContext>
          <DoneSection items={completedItems} listId={listId} onToggle={toggleItem} onDelete={deleteItem}
            onToggleLock={toggleLock} availableCategories={categories} onCategoryChange={changeItemCategory} onEdit={handleEditItem} />
        </DndContext>
      ) : (
        <div className="flex flex-col gap-2 sm:gap-4">
          {recipeGroups.map(group => (
            <div key={group.name}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{group.name}</p>
              <div className="divide-y divide-border/50">
                {group.items.map(item => (
                  <ListItemRow key={item.id} id={item.id} content={item.content} isCompleted={item.isCompleted}
                    isLocked={item.isLocked} recipeName={item.recipeName} category={item.category || undefined}
                    availableCategories={categories} onToggle={toggleItem} onDelete={deleteItem}
                    onToggleLock={toggleLock} onCategoryChange={changeItemCategory} onEdit={handleEditItem}
                  />
                ))}
              </div>
            </div>
          ))}
          <DoneSection items={completedItems} listId={listId} onToggle={toggleItem} onDelete={deleteItem}
            onToggleLock={toggleLock} availableCategories={categories} onCategoryChange={changeItemCategory} onEdit={handleEditItem} />
        </div>
      )}

      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear completed items?</DialogTitle>
            <DialogDescription>
              Are you sure you want to clear all {completedItems.length} completed item{completedItems.length !== 1 ? 's' : ''}? Locked items will be kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearConfirm(false)}>Cancel</Button>
            <Button variant="default" onClick={() => { setShowClearConfirm(false); clearCompleted() }}>Clear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditItemDialog
        open={editItemId !== null}
        onOpenChange={open => { if (!open) setEditItemId(null) }}
        itemId={editItemId ?? ''}
        initialContent={editItemContent}
        initialCategory={editItemCategory}
        availableCategories={categories}
        listId={listId}
        onSaved={handleItemSaved}
        onCategoryAdded={handleAddShoppingCategory}
        initialUnitPrice={items.find(i => i.id === editItemId)?.unitPrice ?? null}
        initialQuantity={items.find(i => i.id === editItemId)?.quantity ?? null}
      />
    </div>
  )
}
