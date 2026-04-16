'use client'

import { Button } from '@/components/ui/button'
import { PlusIcon } from 'lucide-react'

interface ListMeta {
  id: string
  name: string
  type: 'SHOPPING' | 'TODO'
  _count: { items: number }
}

interface ListSelectorProps {
  lists: ListMeta[]
  activeListId: string | null
  onSelect: (id: string) => void
  onNewList: () => void
}

export function ListSelector({
  lists,
  activeListId,
  onSelect,
  onNewList,
}: ListSelectorProps) {
  const shopping = lists.filter((l) => l.type === 'SHOPPING')
  const todo = lists.filter((l) => l.type === 'TODO')

  return (
    <div className="flex flex-col gap-1 py-2">
      {shopping.length > 0 && (
        <>
          <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Shopping
          </p>
          {shopping.map((list) => (
            <button
              key={list.id}
              onClick={() => onSelect(list.id)}
              className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                activeListId === list.id
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              <span className="truncate block">{list.name}</span>
              <span className="text-xs opacity-70">{list._count.items} items</span>
            </button>
          ))}
        </>
      )}

      {todo.length > 0 && (
        <>
          <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-3 mb-1">
            Todo
          </p>
          {todo.map((list) => (
            <button
              key={list.id}
              onClick={() => onSelect(list.id)}
              className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                activeListId === list.id
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              <span className="truncate block">{list.name}</span>
              <span className="text-xs opacity-70">{list._count.items} items</span>
            </button>
          ))}
        </>
      )}

      <div className="mt-4 px-2">
        <Button variant="ghost" size="sm" onClick={onNewList} className="w-full justify-start gap-2">
          <PlusIcon className="h-4 w-4" />
          New list
        </Button>
      </div>
    </div>
  )
}
