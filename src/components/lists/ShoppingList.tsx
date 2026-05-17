'use client'

import {
  DndContext,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
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
import type { ListItemShape, ShoppingCategory } from '@/lib/list-helpers'
import { CategoryGroup } from './CategoryGroup'
import { DoneSection } from './DoneSection'
import { ListItemRow } from './ListItemRow'
import { EditItemDialog } from './EditItemDialog'
import { BarcodeScanner } from './BarcodeScanner'
import { useShoppingList } from '@/hooks/lists/useShoppingList'

interface ShoppingListProps {
  listId: string
  initialItems: ListItemShape[]
  initialCategoryOrder: string[] | null
}

export function ShoppingList({ listId, initialItems, initialCategoryOrder }: ShoppingListProps) {
  const {
    items,
    viewMode, setViewMode,
    showRecipePills, setShowRecipePills,
    categories,
    newContent, setNewContent,
    newCategory, setNewCategory,
    setCategoryManuallySet,
    loadingCategories,
    aisleMap,
    editItemId, setEditItemId,
    editItemContent,
    editItemCategory,
    addingCategoryInline, setAddingCategoryInline,
    inlineCatName, setInlineCatName,
    isSavingCat,
    showBarcodeScanner, setShowBarcodeScanner,
    showClearConfirm, setShowClearConfirm,
    sensors,
    handleDragEnd,
    addItem,
    toggleItem,
    deleteItem,
    toggleLock,
    changeItemCategory,
    handleEditItem,
    handleItemSaved,
    handleAddShoppingCategory,
    handleCreateInlineCategory,
    clearCompleted,
    completedItems,
    grouped,
    recipeGroups,
    activeCategoryOrder,
  } = useShoppingList(listId, initialItems, initialCategoryOrder)

  return (
    <div className="flex flex-col gap-2 sm:gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1.5">
          <button onClick={() => setViewMode('aisle')}
            className={`px-3 py-1 rounded-full border text-sm font-medium transition-colors ${viewMode === 'aisle' ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'hb-pill-inactive'}`}>
            By Aisle
          </button>
          <button onClick={() => setViewMode('recipe')}
            className={`px-3 py-1 rounded-full border text-sm font-medium transition-colors ${viewMode === 'recipe' ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'hb-pill-inactive'}`}>
            By Recipe
          </button>
        </div>
        {viewMode === 'aisle' && (
          <button onClick={() => setShowRecipePills(v => !v)}
            className={`px-2 py-1 rounded-full border text-xs font-medium transition-colors ${showRecipePills ? 'bg-primary text-primary-foreground border-primary' : 'hb-pill-inactive'}`}>
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
