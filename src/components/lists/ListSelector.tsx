'use client'

import { Button } from '@/components/ui/button'
import { PlusIcon, Trash2Icon } from 'lucide-react'

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
  onDeleteList?: (id: string) => void
}

export function ListSelector({
  lists,
  activeListId,
  onSelect,
  onNewList,
  onDeleteList,
}: ListSelectorProps) {
  const shopping = lists.filter((l) => l.type === 'SHOPPING')
  const todo = lists.filter((l) => l.type === 'TODO')

  function renderList(list: ListMeta) {
    return (
      <div key={list.id} className="group flex items-center gap-1 px-1">
        <button
          onClick={() => onSelect(list.id)}
          className={`flex-1 text-left px-2 py-1.5 rounded-md text-sm transition-colors ${
            activeListId === list.id
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted'
          }`}
        >
          <span className="truncate block">{list.name}</span>
          <span className="text-xs opacity-70">{list._count.items} items</span>
        </button>
        {onDeleteList && (
          <button
            onClick={() => onDeleteList(list.id)}
            className="p-1 rounded text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
            title="Delete list"
          >
            <Trash2Icon className="h-3 w-3" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 py-2">
      {shopping.length > 0 && (
        <>
          <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Shopping
          </p>
          {shopping.map(renderList)}
        </>
      )}

      {todo.length > 0 && (
        <>
          <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-3 mb-1">
            Todo
          </p>
          {todo.map(renderList)}
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
