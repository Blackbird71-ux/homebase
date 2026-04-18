'use client'

import { ListItemRow } from './ListItemRow'
import type { ListItemShape } from '@/lib/list-helpers'

interface DoneSectionProps {
  items: ListItemShape[]
  listId: string
  onToggle: (id: string, isCompleted: boolean) => void
  onDelete: (id: string) => void
}

export function DoneSection({ items, onToggle, onDelete }: DoneSectionProps) {
  if (items.length === 0) return null

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
        Done
      </p>
      <div className="divide-y divide-border/50">
        {items.map((item) => (
          <ListItemRow
            key={item.id}
            id={item.id}
            content={item.content}
            isCompleted={item.isCompleted}
            recipeName={item.recipeName}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}
