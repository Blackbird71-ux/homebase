'use client'

import { useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { ListSelector } from '@/components/lists/ListSelector'
import { ShoppingList } from '@/components/lists/ShoppingList'
import { TodoList } from '@/components/lists/TodoList'
import { NewListDialog } from '@/components/lists/NewListDialog'
import { TemplateDialog } from '@/components/lists/TemplateDialog'
import { ListPresence } from '@/components/lists/ListPresence'
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
  assignedToUserId: string | null
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
  currentUserId: string
  members: { id: string; name: string }[]
}

export function ListsClient({ initialLists, defaultListId: initialDefaultListId, currentUserId, members }: ListsClientProps) {
  const searchParams = useSearchParams()
  const [lists, setLists] = useState<SerializedList[]>(initialLists)
  const [defaultListId, setDefaultListId] = useState<string | null>(initialDefaultListId ?? null)

  // Determine initial active list: prefer ?list= param, then defaultListId, fall back to first list
  const initialActiveId = (() => {
    const urlListId = searchParams.get('list')
    if (urlListId && initialLists.some((l) => l.id === urlListId)) return urlListId
    if (initialDefaultListId && initialLists.some((l) => l.id === initialDefaultListId)) {
      return initialDefaultListId
    }
    return initialLists[0]?.id ?? null
  })()
  const [activeListId, setActiveListId] = useState<string | null>(initialActiveId)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)

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
    const uiPrefs: Record<string, string | null> = { defaultListId: listId || null }
    // Only update the dashboard shopping list preference when favoriting/unfavoriting a SHOPPING list
    if (list?.type === 'SHOPPING') {
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

    <div className="flex h-full overflow-hidden flex-col md:flex-row">
      {/* Mobile: horizontal scroll chip bar — replaces the sidebar */}
      <div className="md:hidden flex items-center gap-2 px-2 py-1.5 border-b border-border overflow-x-auto shrink-0 scroll-smooth">
        {listsMeta.map((list) => (
          <button
            key={list.id}
            type="button"
            onClick={() => setActiveListId(list.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors shrink-0 ${
              activeListId === list.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {list.name}
            <span className="text-xs opacity-70">({list._count.items})</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm whitespace-nowrap shrink-0 border border-dashed border-border text-muted-foreground hover:bg-muted transition-colors"
        >
          + New
        </button>
      </div>

      {/* Desktop: sidebar list selector */}
      <aside className="hidden md:block w-[200px] shrink-0 border-r border-border overflow-y-auto">
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

      <main className="flex-1 overflow-y-auto p-2 sm:p-4 md:p-6">
        {activeList === null ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">No lists yet. Create one to get started.</p>
          </div>
        ) : activeList.type === 'SHOPPING' ? (
          <>
            <div className="flex items-center justify-between mb-1.5 sm:mb-4">
              <div className="flex items-center gap-3">
                <h1 className="text-base sm:text-xl font-semibold">{activeList.name}</h1>
                <ListPresence listId={activeList.id} currentUserId={currentUserId} />
              </div>
              <button
                onClick={() => setTemplateDialogOpen(true)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md border border-border hover:bg-muted"
              >
                Templates
              </button>
            </div>
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
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-xl font-semibold">{activeList.name}</h1>
              <button
                onClick={() => setTemplateDialogOpen(true)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md border border-border hover:bg-muted"
              >
                Templates
              </button>
            </div>
            <TodoList
              key={activeList.id}
              listId={activeList.id}
              initialItems={activeList.items.map(toListItemShape)}
              initialCategoryOrder={(() => {
                if (!activeList.categoryOrder) return null
                try { return JSON.parse(activeList.categoryOrder) } catch { return null }
              })()}
              members={members}
              currentUserId={currentUserId}
            />
          </>
        )}
      </main>

      <NewListDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleCreated}
      />

      {activeList && (
        <TemplateDialog
          open={templateDialogOpen}
          onOpenChange={setTemplateDialogOpen}
          listId={activeList.id}
          listName={activeList.name}
          listType={activeList.type as 'SHOPPING' | 'TODO'}
          onCloneToList={async (templateId, listName) => {
            const res = await fetch('/api/lists/templates', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'clone',
                templateId,
                listName,
              }),
            })
            if (!res.ok) {
              const err = await res.json()
              throw new Error(err.error || 'Failed to clone template')
            }
            const newList = await res.json()
            handleCreated({ id: newList.id, name: newList.name, type: newList.type })
          }}
        />
      )}
    </div>
  )
}
