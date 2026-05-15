'use client'

import { GripVerticalIcon, DollarSignIcon } from 'lucide-react'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ListItemRow } from './ListItemRow'
import type { ListItemShape } from '@/lib/list-helpers'

interface SortableItemProps {
  item: ListItemShape
  showDragHandle: boolean
  showRecipePills?: boolean
  onToggle: (id: string, isCompleted: boolean) => void
  onDelete: (id: string) => void
  onToggleLock?: (id: string, isLocked: boolean) => void
  availableCategories?: string[]
  onCategoryChange?: (id: string, newCategory: string) => void
  onEdit?: (id: string) => void
}

function SortableItem({
  item,
  showDragHandle,
  showRecipePills,
  onToggle,
  onDelete,
  onToggleLock,
  availableCategories = [],
  onCategoryChange,
  onEdit,
}: SortableItemProps) {
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
      {showDragHandle && (
        <button
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground/30 hover:text-muted-foreground focus:outline-none shrink-0"
          aria-label="Drag to reorder"
          tabIndex={-1}
        >
          <GripVerticalIcon className="h-4 w-4" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <ListItemRow
          id={item.id}
          content={item.content}
          isCompleted={item.isCompleted}
          isLocked={item.isLocked}
          recipeName={item.recipeName}
          showRecipePills={showRecipePills}
          category={item.category || undefined}
          availableCategories={availableCategories}
          onToggle={onToggle}
          onDelete={onDelete}
          onToggleLock={onToggleLock}
          onCategoryChange={onCategoryChange}
          onEdit={onEdit}
        />
      </div>
    </div>
  )
}

interface CategoryGroupProps {
  category: string
  items: ListItemShape[]
  showDragHandle: boolean
  showRecipePills?: boolean
  aisle?: string | null
  onToggle: (id: string, isCompleted: boolean) => void
  onDelete: (id: string) => void
  onToggleLock?: (id: string, isLocked: boolean) => void
  availableCategories?: string[]
  onCategoryChange?: (id: string, newCategory: string) => void
  onEdit?: (id: string) => void
}

export function CategoryGroup({
  category,
  items,
  showDragHandle,
  showRecipePills,
  aisle,
  onToggle,
  onDelete,
  onToggleLock,
  availableCategories = [],
  onCategoryChange,
  onEdit,
}: CategoryGroupProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category, data: { type: 'category' } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // Calculate subtotals
  const itemCount = items.length
  const priceSubtotal = items.reduce((sum, item) => {
    if (item.unitPrice != null && item.quantity != null) {
      return sum + item.unitPrice * item.quantity
    }
    if (item.unitPrice != null) {
      return sum + item.unitPrice
    }
    return sum
  }, 0)

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-1 mb-1">
        {showDragHandle && (
          <button
            ref={setActivatorNodeRef}
            {...listeners}
            {...attributes}
            className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground focus:outline-none shrink-0"
            aria-label={`Drag ${category} category`}
            tabIndex={-1}
          >
            <GripVerticalIcon className="h-3.5 w-3.5" />
          </button>
        )}
        <p className="text-xs font-bold text-foreground uppercase tracking-wide">
          {category}
        </p>
        {aisle && (
          <span className="text-xs font-medium text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded ml-1">
            Aisle {aisle}
          </span>
        )}
        <span className="text-xs text-muted-foreground ml-1">
          ({itemCount} item{itemCount !== 1 ? 's' : ''})
        </span>
        {priceSubtotal > 0 && (
          <span className="text-xs text-muted-foreground ml-auto flex items-center gap-0.5">
            <DollarSignIcon className="h-2.5 w-2.5" />
            {priceSubtotal.toFixed(2)}
          </span>
        )}
      </div>
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="divide-y divide-border/50">
          {items.map((item) => (
            <SortableItem
              key={item.id}
              item={item}
              showDragHandle={showDragHandle}
              showRecipePills={showRecipePills}
              onToggle={onToggle}
              onDelete={onDelete}
              onToggleLock={onToggleLock}
              availableCategories={availableCategories}
              onCategoryChange={onCategoryChange}
              onEdit={onEdit}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}
