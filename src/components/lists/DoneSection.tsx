'use client'

import { ListItemRow } from './ListItemRow'
import type { ListItemShape } from '@/lib/list-helpers'

interface DoneSectionProps {
  items: ListItemShape[]
  listId: string
  doneItemColor?: string
  onToggle: (id: string, isCompleted: boolean) => void
  onDelete: (id: string) => void
  onToggleLock?: (id: string, isLocked: boolean) => void
  availableCategories?: string[]
  onCategoryChange?: (id: string, newCategory: string) => void
  onEdit?: (id: string) => void
  selectMode?: boolean
  selectedIds?: Set<string>
  onSelect?: (id: string) => void
}

export function DoneSection({
  items,
  doneItemColor,
  onToggle,
  onDelete,
  onToggleLock,
  availableCategories = [],
  onCategoryChange,
  onEdit,
  selectMode = false,
  selectedIds,
  onSelect,
}: DoneSectionProps) {
  if (items.length === 0) return null

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
        Done
      </p>
      <div className="divide-y divide-border/50">
        {items.map((item) => selectMode ? (
          <label key={item.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50">
            <input
              type="checkbox"
              checked={selectedIds?.has(item.id) ?? false}
              onChange={() => onSelect?.(item.id)}
              className="h-4 w-4 shrink-0"
              aria-label={`Select ${item.content}`}
            />
            <span className="flex-1 min-w-0 truncate text-sm line-through text-muted-foreground">{item.content}</span>
          </label>
        ) : (
          <ListItemRow
            key={item.id}
            id={item.id}
            content={item.content}
            isCompleted={item.isCompleted}
            isLocked={item.isLocked}
            recipeName={item.recipeName}
            doneItemColor={doneItemColor}
            category={item.category || undefined}
            availableCategories={availableCategories}
            onToggle={onToggle}
            onDelete={onDelete}
            onToggleLock={onToggleLock}
            onCategoryChange={onCategoryChange}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  )
}
