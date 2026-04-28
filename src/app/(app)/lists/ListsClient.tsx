'use client'

import { useState, useCallback } from 'react'
import { ListSelector } from '@/components/lists/ListSelector'
import { ShoppingList } from '@/components/lists/ShoppingList'
import { TodoList } from '@/components/lists/TodoList'
import { NewListDialog } from '@/components/lists/NewListDialog'
import type { ListItemShape } from '@/lib/list-helpers'
import { toast } from 'sonner'

interface SerializedItem {
  id: string
  content: string
  isCompleted: boolean
  isLocked: boolean
  category: string | null
  sortOrder: number
  dueDate: string | null
  recipeId: string | null
  recipeName: string | null
  createdBy: string
  listId: string
  createdAt: string
  unitPrice: number | null
  quantity: number | null
}

interface SerializedList {
  id: string
  name: string
  type: string
  isActive: boolean
  categoryOrder: string | null
  sortOrder: number
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
  defaultListId?: string | null
}

export function ListsClient({ initialLists, defaultListId: initialDefaultListId }: ListsClientProps) {
  const [lists, setLists] = useState<SerializedList[]>(initialLists)
  const [defaultListId, setDefaultListId] = useState<string | null>(initialDefaultListId ?? null)

  // Determine initial active list: prefer defaultListId, fall back to first list
  const initialActiveId = (() => {
    if (initialDefaultListId && initialLists.some((l) => l.id === initialDefaultListId)) {
      return initialDefaultListId
    }
    return initialLists[0]?.id ?? null
  })()
  const [activeListId, setActiveListId] = useState<string | null>(initialActiveId)

  const [dialogOpen, setDialogOpen] = useState(false)


  const activeList = lists.find((l) => l.id === activeListId) ?? null

  function handleCreated(list: { id: string; name: string; type: string }) {
    const familyId = initialLists[0]?.familyId ?? ''
    const maxSortOrder = lists.reduce((max, l) => Math.max(max, l.sortOrder), 0)
    const newList: SerializedList = {
      ...list,
      isActive: true,
      categoryOrder: null,
      sortOrder: maxSortOrder + 1,
      createdAt: new Date().toISOString(),
      familyId,
      items: [],
      _count: { items: 0 },
    }
    setLists((prev) => [...prev, newList])
    setActiveListId(list.id)
  }

  async function handleDeleteList(id: string) {
    const list = lists.find((l) => l.id === id)
    if (!list) return
    if (!confirm(`Delete "${list.name}"? This cannot be undone.`)) return
    const res = await fetch(`/api/lists/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setLists((prev) => prev.filter((l) => l.id !== id))
      if (activeListId === id) setActiveListId(lists.find((l) => l.id !== id)?.id ?? null)
    }
  }

  async function handleSetDefault(listId: string) {
    const list = listId ? lists.find((l) => l.id === listId) : null
    // For shopping lists, also update the home dashboard preference so the
    // starred list shows on the home page (per-user, not per-family)
    const uiPrefs: Record<string, string | null> = { defaultListId: listId || null }
    if (!listId || list?.type === 'SHOPPING') {
      uiPrefs.dashboardShoppingListId = listId || null
    }
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uiPreferences: uiPrefs }),
    })
    if (res.ok) {
      setDefaultListId(listId || null)
    }
  }

  const handleReorder = useCallback(async (orderedIds: string[]) => {
    // Update local state immediately
    setLists((prev) => {
      const listMap = new Map(prev.map((l) => [l.id, l]))
      const updates = orderedIds.map((id, idx) => {
        const list = listMap.get(id)
        return list ? { ...list, sortOrder: idx } : list
      }).filter(Boolean) as SerializedList[]
      
      // Merge with any lists not in the orderedIds (shouldn't happen, but be safe)
      const reorderedIds = new Set(orderedIds)
      const remaining = prev.filter((l) => !reorderedIds.has(l.id))
      return [...updates, ...remaining]
    })

    // Persist to server
    const items = orderedIds.map((id, idx) => ({ id, sortOrder: idx }))
    const res = await fetch('/api/lists/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    if (!res.ok) {
      toast.error('Failed to save list order')
    }
  }, [])

  const listsMeta = lists.map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type as 'SHOPPING' | 'TODO',
    _count: l._count,
  }))

  return (

    <div className="flex h-full overflow-hidden">
      <aside className="w-[200px] shrink-0 border-r border-border overflow-y-auto">
        <ListSelector
          lists={listsMeta}
          activeListId={activeListId}
          defaultListId={defaultListId}
          onSelect={setActiveListId}
          onNewList={() => setDialogOpen(true)}
          onDeleteList={handleDeleteList}
          onSetDefault={handleSetDefault}
          onRename={(id, newName) => {
            setLists((prev) => prev.map((l) => (l.id === id ? { ...l, name: newName } : l)))
          }}
          onReorder={handleReorder}
        />

      </aside>

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
              initialCategoryOrder={(() => {
                if (!activeList.categoryOrder) return null
                try {
                  return JSON.parse(activeList.categoryOrder)
                } catch {
                  return null
                }
              })()}
            />
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold mb-4">{activeList.name}</h1>
            <TodoList
              key={activeList.id}
              listId={activeList.id}
              initialItems={activeList.items.map(toListItemShape)}
              initialCategoryOrder={(() => {
                if (!activeList.categoryOrder) return null
                try { return JSON.parse(activeList.categoryOrder) } catch { return null }
              })()}
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
