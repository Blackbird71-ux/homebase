'use client'

import { useState } from 'react'
import { ListSelector } from '@/components/lists/ListSelector'
import { ShoppingList } from '@/components/lists/ShoppingList'
import { TodoList } from '@/components/lists/TodoList'
import { NewListDialog } from '@/components/lists/NewListDialog'
import type { ListItemShape } from '@/lib/list-helpers'

interface SerializedItem {
  id: string
  content: string
  isCompleted: boolean
  category: string | null
  sortOrder: number
  dueDate: string | null
  createdBy: string
  listId: string
  createdAt: string
}

interface SerializedList {
  id: string
  name: string
  type: string
  isActive: boolean
  createdAt: string
  familyId: string
  items: SerializedItem[]
  _count: { items: number }
}

function toListItemShape(item: SerializedItem): ListItemShape {
  return {
    ...item,
    dueDate: item.dueDate ? new Date(item.dueDate) : null,
    createdAt: new Date(item.createdAt),
  }
}

interface ListsClientProps {
  initialLists: SerializedList[]
}

export function ListsClient({ initialLists }: ListsClientProps) {
  const [lists, setLists] = useState<SerializedList[]>(initialLists)
  const [activeListId, setActiveListId] = useState<string | null>(
    initialLists[0]?.id ?? null
  )
  const [dialogOpen, setDialogOpen] = useState(false)

  const activeList = lists.find((l) => l.id === activeListId) ?? null

  function handleCreated(list: { id: string; name: string; type: string }) {
    const familyId = initialLists[0]?.familyId ?? ''
    const newList: SerializedList = {
      ...list,
      isActive: true,
      createdAt: new Date().toISOString(),
      familyId,
      items: [],
      _count: { items: 0 },
    }
    setLists((prev) => [...prev, newList])
    setActiveListId(list.id)
  }

  const listsMeta = lists.map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type as 'SHOPPING' | 'TODO',
    _count: l._count,
  }))

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[200px] shrink-0 border-r border-border overflow-y-auto">
        <ListSelector
          lists={listsMeta}
          activeListId={activeListId}
          onSelect={setActiveListId}
          onNewList={() => setDialogOpen(true)}
        />
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        {activeList === null ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">No lists yet. Create one to get started.</p>
          </div>
        ) : activeList.type === 'SHOPPING' ? (
          <>
            <h1 className="text-xl font-semibold mb-4">{activeList.name}</h1>
            <ShoppingList
              key={activeList.id}
              listId={activeList.id}
              initialItems={activeList.items.map(toListItemShape)}
            />
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold mb-4">{activeList.name}</h1>
            <TodoList
              key={activeList.id}
              listId={activeList.id}
              initialItems={activeList.items.map(toListItemShape)}
            />
          </>
        )}
      </main>

      <NewListDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleCreated}
      />
    </div>
  )
}
