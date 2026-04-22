'us thee client'

import { GripVerticalIcon } from 'lucide-react'
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
  onToggle: (id: string, isCompleted: boolean) => void
  onDelete: (id: string) => void
  availableCategories?: string[]
  onCategoryChange?: (id: string, newCategory: string) => void
}

function SortableItem({ 
  item, 
  showDragHandle, 
  onToggle, 
  onDelete,
  availableCategories = [],
  onCategoryChange,
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
          recipeName={item.recipeName}
          category={item.category || undefined}
          availableCategories={availableCategories}
          onToggle={onToggle}
          onDelete={onDelete}
          onCategoryChange={onCategoryChange}
        />
      </div>
    </div>
  )
}

interface CategoryGroupProps {
  category: string
  items: ListItemShape[]
  showDragHandle: boolean
  onToggle: (id: string, isCompleted: boolean) => void
  onDelete: (id: string) => void
  availableCategories?: string[]
  onCategoryChange?: (id: string, newCategory: string) => void
}

export function CategoryGroup({
  category,
  items,
  showDragHandle,
  onToggle,
  onDelete,
  availableCategories = [],
  onCategoryChange,
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
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {category}
        </p>
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
              onToggle={onToggle}
              onDelete={onDelete}
              availableCategories={availableCategories}
              onCategoryChange={onCategoryChange}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}
