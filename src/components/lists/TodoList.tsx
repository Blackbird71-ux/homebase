'use client'

import {
  DndContext,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ListItemRow } from './ListItemRow'
import { DoneSection } from './DoneSection'
import { EditItemDialog } from './EditItemDialog'
import type { ListItemShape, TodoFilter } from '@/lib/list-helpers'
import { GripVerticalIcon, PlusIcon, RotateCcwIcon, TagIcon, XIcon } from 'lucide-react'
import { CategoryColorSwatches } from './CategoryColorSwatches'
import { useTodoList } from '@/hooks/lists/useTodoList'

// ── Sortable wrapper for a single todo item ──────────────────────────────────

function SortableTodoItem({
  item,
  members,
  timezone,
  onToggle,
  onDelete,
  onToggleLock,
  onEdit,
  onAssign,
}: {
  item: ListItemShape
  members: { id: string; name: string }[]
  timezone: string
  onToggle: (id: string, isCompleted: boolean) => void
  onDelete: (id: string) => void
  onToggleLock: (id: string, isLocked: boolean) => void
  onEdit: (id: string) => void
  onAssign: (id: string, assignedToUserId: string | null) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, data: { type: 'item', category: item.category } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center">
      <button
        ref={setActivatorNodeRef}
        {...listeners}
        {...attributes}
        className="cursor-grab active:cursor-grabbing touch-none p-2.5 text-muted-foreground/50 hover:text-muted-foreground focus:outline-none shrink-0"
        aria-label="Drag to reorder"
        tabIndex={-1}
      >
        <GripVerticalIcon className="h-5 w-5" />
      </button>
      <div className="flex-1 min-w-0">
        <ListItemRow
          id={item.id}
          content={item.content}
          isCompleted={item.isCompleted}
          isLocked={item.isLocked}
          dueDate={item.dueDate?.toISOString() ?? null}
          timezone={timezone}
          assignedToUserId={item.assignedToUserId}
          members={members}
          onToggle={onToggle}
          onDelete={onDelete}
          onToggleLock={onToggleLock}
          onEdit={onEdit}
          onAssign={onAssign}
        />
      </div>
    </div>
  )
}

interface TodoListProps {
  listId: string
  initialItems: ListItemShape[]
  initialCategoryOrder: string[] | null
  members: { id: string; name: string }[]
  currentUserId: string
  timezone: string
}

export function TodoList({ listId, initialItems, initialCategoryOrder, members, currentUserId, timezone }: TodoListProps) {
  const {
    filter, setFilter,
    categories,
    newContent, setNewContent,
    newDueDate, setNewDueDate,
    newItemCategory, setNewItemCategory,
    newCategoryInput, setNewCategoryInput,
    showCategoryInput, setShowCategoryInput,
    editItemId, setEditItemId,
    editItemContent,
    editItemCategory,
    editItemDueDate,
    editItemAssignedToUserId,
    sensors,
    handleDragEnd,
    addItem,
    toggleItem,
    handleEditItem,
    handleItemSaved,
    queueItemEdit,
    deleteItem,
    toggleLock,
    assignItem,
    handleAddCategory,
    handleRemoveCategory,
    handleEditDialogCategoryAdded,
    uncheckAll,
    activeItems,
    completedItems,
    groupedItems,
    editDialogCategories,
    suggestedCategories,
    categoryColors,
    newCategoryColor,
    setPickedCategoryColor,
    nextColor,
  } = useTodoList(listId, initialItems, initialCategoryOrder, currentUserId, timezone)

  const dot = (name: string) =>
    categoryColors[name] ? (
      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: categoryColors[name] }} />
    ) : null

  const filters: { label: string; value: TodoFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'My Tasks', value: 'mine' },
    { label: 'Due today', value: 'today' },
    { label: 'Overdue', value: 'overdue' },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Add item form */}
      <form onSubmit={addItem} className="flex flex-col sm:flex-row gap-2">
        <Input
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Add task..."
          className="flex-1"
        />
        <div className="flex gap-2">
          {categories.length > 0 && (
            <select
              value={newItemCategory}
              onChange={(e) => setNewItemCategory(e.target.value)}
              className="flex-1 sm:flex-none h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
              aria-label="Category"
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              {suggestedCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          <input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            className="flex-1 sm:flex-none h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
            aria-label="Due date"
          />
          <Button type="submit" size="sm" className="shrink-0">
            <PlusIcon className="h-4 w-4" />
          </Button>
        </div>
      </form>

      {/* Filters */}
      <div className="flex gap-2">
        {filters.map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
        {completedItems.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto gap-1"
            onClick={() => {
              if (confirm('Uncheck all items so this list can be used again? Locked items are kept.')) void uncheckAll()
            }}
          >
            <RotateCcwIcon className="h-3.5 w-3.5" />
            Uncheck all
          </Button>
        )}
      </div>

      {/* Category management */}
      <div className="flex flex-wrap items-center gap-2">
        {categories.map((cat) => (
          <span
            key={cat}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground"
          >
            {dot(cat)}
            {cat}
            <button
              type="button"
              onClick={() => handleRemoveCategory(cat)}
              className="hover:text-destructive transition-colors"
              aria-label={`Remove ${cat} category`}
            >
              <XIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        {/* Suggestions stay hidden on lists that don't use categories until "Add category" is tapped */}
        {(categories.length > 0 || showCategoryInput) && suggestedCategories.map((name) => (
          <button
            key={name}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleEditDialogCategoryAdded(name)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label={`Add ${name} category to this list`}
          >
            <PlusIcon className="h-3 w-3" />
            {dot(name)}
            {name}
          </button>
        ))}
        {showCategoryInput ? (
          <form onSubmit={handleAddCategory} className="flex flex-wrap items-center gap-2">
            <span className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: newCategoryColor }} />
            <Input
              value={newCategoryInput}
              onChange={(e) => setNewCategoryInput(e.target.value)}
              placeholder="Category name"
              className="h-6 text-xs w-32"
              autoFocus
              onBlur={() => {
                if (!newCategoryInput.trim()) setShowCategoryInput(false)
              }}
            />
            <Button type="submit" size="icon-sm" className="h-6 w-6">
              <PlusIcon className="h-3 w-3" />
            </Button>
            <div className="basis-full">
              <CategoryColorSwatches value={newCategoryColor} onChange={setPickedCategoryColor} />
            </div>
          </form>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-muted-foreground gap-1"
            onClick={() => setShowCategoryInput(true)}
            type="button"
          >
            <TagIcon className="h-3 w-3" />
            Add category
          </Button>
        )}
      </div>

      {/* Items */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-col gap-4">
          {groupedItems ? (
            <>
              {activeItems.length === 0 && completedItems.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">No items</p>
              )}
              {activeItems.length === 0 && completedItems.length > 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">All done!</p>
              )}
              {Object.entries(groupedItems).map(([cat, catItems]) => {
                if (catItems.length === 0) return null
                return (
                  <div key={cat} className="flex flex-col gap-1">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {dot(cat)}
                      {cat}
                    </p>
                    <SortableContext
                      items={catItems.map((i) => i.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="divide-y divide-border/50">
                        {catItems.map((item) => (
                          <SortableTodoItem
                            key={item.id}
                            item={item}
                            members={members}
                            timezone={timezone}
                            onToggle={toggleItem}
                            onDelete={deleteItem}
                            onToggleLock={toggleLock}
                            onEdit={handleEditItem}
                            onAssign={assignItem}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </div>
                )
              })}
            </>
          ) : (
            <SortableContext
              items={activeItems.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="divide-y divide-border/50">
                {activeItems.length === 0 && completedItems.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">No items</p>
                )}
                {activeItems.length === 0 && completedItems.length > 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">All done!</p>
                )}
                {activeItems.map((item) => (
                  <SortableTodoItem
                    key={item.id}
                    item={item}
                    members={members}
                    timezone={timezone}
                    onToggle={toggleItem}
                    onDelete={deleteItem}
                    onToggleLock={toggleLock}
                    onEdit={handleEditItem}
                    onAssign={assignItem}
                  />
                ))}
              </div>
            </SortableContext>
          )}

          {completedItems.length > 0 && (
            <DoneSection
              items={completedItems}
              listId={listId}
              onToggle={toggleItem}
              onDelete={deleteItem}
              onToggleLock={toggleLock}
              onEdit={handleEditItem}
            />
          )}
        </div>
      </DndContext>

      <EditItemDialog
        open={editItemId !== null}
        onOpenChange={(open) => {
          if (!open) setEditItemId(null)
        }}
        itemId={editItemId ?? ''}
        initialContent={editItemContent}
        initialCategory={editItemCategory}
        availableCategories={editDialogCategories}
        listId={listId}
        onSaved={handleItemSaved}
        queueOfflineEdit={queueItemEdit}
        onCategoryAdded={editDialogCategories.length > 0 ? handleEditDialogCategoryAdded : undefined}
        showCategoryColor
        defaultCategoryColor={nextColor()}
        initialDueDate={editItemDueDate}
        initialAssignedToUserId={editItemAssignedToUserId}
        members={members}
      />
    </div>
  )
}
