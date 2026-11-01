'use client'

import {
  DndContext,
  closestCenter,
  useDroppable,
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
import { CheckSquareIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ClipboardPasteIcon, GripVerticalIcon, LockIcon, PencilIcon, PlusIcon, RotateCcwIcon, TagIcon, XIcon } from 'lucide-react'
import { CategoryColorSwatches } from './CategoryColorSwatches'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useState } from 'react'
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
  selectMode,
  selected,
  onSelect,
}: {
  item: ListItemShape
  members: { id: string; name: string }[]
  timezone: string
  onToggle: (id: string, isCompleted: boolean) => void
  onDelete: (id: string) => void
  onToggleLock: (id: string, isLocked: boolean) => void
  onEdit: (id: string) => void
  onAssign: (id: string, assignedToUserId: string | null) => void
  selectMode: boolean
  selected: boolean
  onSelect: (id: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, data: { type: 'item', category: item.category }, disabled: selectMode })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  if (selectMode) {
    return (
      <label
        ref={setNodeRef as React.Ref<HTMLLabelElement>}
        style={style}
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50"
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(item.id)}
          className="h-4 w-4 shrink-0"
          aria-label={`Select ${item.content}`}
        />
        <span className="flex-1 min-w-0 truncate text-sm">{item.content}</span>
        {item.isLocked && <LockIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
      </label>
    )
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

// ── Category group: a drop target, collapsible, with a count ─────────────────

function CategoryGroup({
  name,
  count,
  dot,
  collapsed,
  onToggleCollapsed,
  header,
  children,
}: {
  name: string
  count: number
  dot: React.ReactNode
  collapsed: boolean
  onToggleCollapsed: () => void
  header?: React.ReactNode
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `group:${name}`, data: { group: name } })
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-1 rounded-lg ${isOver ? 'bg-muted/60 ring-1 ring-primary/40' : ''}`}
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {header}
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex items-center gap-1.5 uppercase tracking-wide"
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${name}`}
        >
          {collapsed ? <ChevronRightIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />}
          {dot}
          {name}
          <span className="font-normal normal-case">({count})</span>
        </button>
      </div>
      {!collapsed && (count > 0 ? children : (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          No items - drag one here
        </p>
      ))}
    </div>
  )
}

// ── Category chip: colour dot, count, reorder, rename, confirmed remove ──────

function CategoryChip({
  name,
  count,
  dot,
  first,
  last,
  onRename,
  onMove,
  onRemove,
}: {
  name: string
  count: number
  dot: React.ReactNode
  first: boolean
  last: boolean
  onRename: (newName: string) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  if (editing) {
    return (
      <form
        onSubmit={(e) => { e.preventDefault(); onRename(draft); setEditing(false) }}
        className="flex items-center gap-1"
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-6 text-xs w-32"
          autoFocus
          aria-label={`Rename ${name}`}
          onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false) }}
        />
        <Button type="submit" size="sm" className="h-6 px-2 text-xs">Save</Button>
        <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditing(false)}>Cancel</Button>
      </form>
    )
  }

  return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground">
      <button type="button" disabled={first} onClick={() => onMove(-1)} className="hover:text-foreground disabled:opacity-30" aria-label={`Move ${name} earlier`}>
        <ChevronLeftIcon className="h-3 w-3" />
      </button>
      {dot}
      {name}
      <span className="opacity-70">{count}</span>
      <button type="button" disabled={last} onClick={() => onMove(1)} className="hover:text-foreground disabled:opacity-30" aria-label={`Move ${name} later`}>
        <ChevronRightIcon className="h-3 w-3" />
      </button>
      <button type="button" onClick={() => { setDraft(name); setEditing(true) }} className="hover:text-foreground" aria-label={`Rename ${name}`}>
        <PencilIcon className="h-3 w-3" />
      </button>
      <button type="button" onClick={onRemove} className="hover:text-destructive transition-colors" aria-label={`Remove ${name} category`}>
        <XIcon className="h-3 w-3" />
      </button>
    </span>
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
    handleRenameCategory,
    handleMoveCategory,
    previewPaste,
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
    addMany,
    selectMode, selectedIds, toggleSelectMode, toggleSelected, toggleSelectMany, bulkApply,
  } = useTodoList(listId, initialItems, initialCategoryOrder, currentUserId, timezone)

  const dot = (name: string) =>
    categoryColors[name] ? (
      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: categoryColors[name] }} />
    ) : null

  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteCategory, setPasteCategory] = useState('')
  const paste = previewPaste(pasteText, pasteCategory || null)
  const pasteCount = paste.count
  const allItems = [...activeItems, ...completedItems]
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [dragging, setDragging] = useState(false)

  function toggleCollapsed(name: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  async function submitPaste() {
    if (await addMany(pasteText, pasteCategory || null)) {
      setPasteOpen(false)
      setPasteText('')
      setPasteCategory('')
    }
  }

  const [catPanelOpen, setCatPanelOpen] = useState(false)
  const [bulkNewCategory, setBulkNewCategory] = useState('')

  async function moveSelected(category: string | null) {
    await bulkApply({ type: 'category', category })
    setCatPanelOpen(false)
  }

  async function createAndMove() {
    const name = bulkNewCategory.trim()
    if (!name) return
    await bulkApply({ type: 'category', category: name }, newCategoryColor)
    setBulkNewCategory('')
    setPickedCategoryColor(null)
    setCatPanelOpen(false)
  }

  const selectProps = (item: ListItemShape) => ({
    selectMode,
    selected: selectedIds.has(item.id),
    onSelect: toggleSelected,
  })

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
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 gap-1"
            onClick={() => { setPasteCategory(newItemCategory); setPasteOpen(true) }}
          >
            <ClipboardPasteIcon className="h-4 w-4" />
            Paste list
          </Button>
        </div>
      </form>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paste several items</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">One item per line. Bullets, numbers and tick boxes are removed automatically. End a line with a colon (e.g. &quot;Dairy:&quot;) to file the lines under it into that category.</p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={8}
            autoFocus
            placeholder={'Milk\nBread\nEggs'}
            className="w-full rounded-lg border border-input bg-transparent p-2 text-sm"
            aria-label="Items to add, one per line"
          />
          <select
            value={pasteCategory}
            onChange={(e) => setPasteCategory(e.target.value)}
            className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
            aria-label="Category for pasted items without a heading"
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
            {suggestedCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasteOpen(false)}>Cancel</Button>
            <Button disabled={pasteCount === 0} onClick={() => void submitPaste()}>
              Add {pasteCount} item{pasteCount === 1 ? '' : 's'}{paste.categoryCount > 1 ? ` in ${paste.categoryCount} categories` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        <Button
          variant={selectMode ? 'default' : 'outline'}
          size="sm"
          className="ml-auto gap-1"
          onClick={toggleSelectMode}
        >
          <CheckSquareIcon className="h-3.5 w-3.5" />
          {selectMode ? 'Cancel' : 'Select'}
        </Button>
        {completedItems.length > 0 && !selectMode && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
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
        {categories.map((cat, idx) => (
          <CategoryChip
            key={cat}
            name={cat}
            count={allItems.filter((i) => i.category === cat).length}
            dot={dot(cat)}
            first={idx === 0}
            last={idx === categories.length - 1}
            onRename={(n) => void handleRenameCategory(cat, n)}
            onMove={(dir) => handleMoveCategory(cat, dir)}
            onRemove={() => {
              const n = allItems.filter((i) => i.category === cat).length
              const msg = n > 0
                ? `Remove "${cat}"? ${n} item${n === 1 ? '' : 's'} will move to Other.`
                : `Remove "${cat}"?`
              if (confirm(msg)) void handleRemoveCategory(cat)
            }}
          />
        ))}
        {suggestedCategories.map((name) => (
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
        onDragStart={() => setDragging(true)}
        onDragCancel={() => setDragging(false)}
        onDragEnd={(e) => { setDragging(false); handleDragEnd(e) }}
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
                // "Other" only shows when it has items, or while dragging (so items can be dropped back into it)
                if (cat === 'Other' && catItems.length === 0 && !dragging) return null
                return (
                  <CategoryGroup
                    key={cat}
                    name={cat}
                    count={catItems.length}
                    dot={dot(cat)}
                    collapsed={collapsedGroups.has(cat)}
                    onToggleCollapsed={() => toggleCollapsed(cat)}
                    header={selectMode && catItems.length > 0 ? (
                      <input
                        type="checkbox"
                        checked={catItems.every((i) => selectedIds.has(i.id))}
                        onChange={() => toggleSelectMany(catItems.map((i) => i.id))}
                        className="h-4 w-4"
                        aria-label={`Select all in ${cat}`}
                      />
                    ) : undefined}
                  >
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
                            {...selectProps(item)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </CategoryGroup>
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
                    {...selectProps(item)}
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
              selectMode={selectMode}
              selectedIds={selectedIds}
              onSelect={toggleSelected}
            />
          )}
        </div>
      </DndContext>

      {selectMode && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-2 shadow-md">
          {catPanelOpen && selectedIds.size > 0 && (
            <div className="basis-full flex flex-col gap-2 border-b border-border pb-2">
              <p className="text-xs text-muted-foreground">
                Move {selectedIds.size} item{selectedIds.size === 1 ? '' : 's'} to:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[...categories, ...suggestedCategories].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => void moveSelected(c)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-border text-xs hover:bg-muted"
                  >
                    {dot(c)}
                    {c}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => void moveSelected(null)}
                  className="px-2.5 py-1 rounded-full border border-dashed border-border text-xs text-muted-foreground hover:bg-muted"
                >
                  No category
                </button>
              </div>
              <form
                onSubmit={(e) => { e.preventDefault(); void createAndMove() }}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: newCategoryColor }} />
                <Input
                  value={bulkNewCategory}
                  onChange={(e) => setBulkNewCategory(e.target.value)}
                  placeholder="Or create a new category…"
                  className="h-8 text-sm w-56"
                />
                <Button type="submit" size="sm" disabled={!bulkNewCategory.trim()}>
                  Create &amp; move
                </Button>
                <div className="basis-full">
                  <CategoryColorSwatches value={newCategoryColor} onChange={setPickedCategoryColor} />
                </div>
              </form>
            </div>
          )}
          <span className="text-sm font-medium px-1">{selectedIds.size} selected</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toggleSelectMany(allItems.map((i) => i.id))}
          >
            {allItems.length > 0 && allItems.every((i) => selectedIds.has(i.id)) ? 'Clear' : 'Select all'}
          </Button>
          <Button
            variant={catPanelOpen ? 'default' : 'outline'}
            size="sm"
            className="gap-1"
            disabled={selectedIds.size === 0}
            onClick={() => setCatPanelOpen((o) => !o)}
          >
            <TagIcon className="h-3.5 w-3.5" />
            Category
          </Button>
          <Button variant="outline" size="sm" disabled={selectedIds.size === 0} onClick={() => void bulkApply({ type: 'lock' })}>
            Lock
          </Button>
          <Button variant="outline" size="sm" disabled={selectedIds.size === 0} onClick={() => void bulkApply({ type: 'unlock' })}>
            Unlock
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            disabled={selectedIds.size === 0}
            onClick={() => {
              if (confirm(`Delete ${selectedIds.size} selected item${selectedIds.size === 1 ? '' : 's'}? Locked items are kept.`)) void bulkApply({ type: 'delete' })
            }}
          >
            Delete
          </Button>
        </div>
      )}

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
        onCategoryAdded={handleEditDialogCategoryAdded}
        showCategoryColor
        defaultCategoryColor={nextColor()}
        initialDueDate={editItemDueDate}
        initialAssignedToUserId={editItemAssignedToUserId}
        members={members}
      />
    </div>
  )
}
