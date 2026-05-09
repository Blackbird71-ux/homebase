'use client'

import { useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { ListSelector } from '@/components/lists/ListSelector'
import { ShoppingList } from '@/components/lists/ShoppingList'
import { TodoList } from '@/components/lists/TodoList'
import { NewListDialog } from '@/components/lists/NewListDialog'
import { EditListDialog } from '@/components/lists/EditListDialog'
import { TemplateDialog } from '@/components/lists/TemplateDialog'
import { ListPresence } from '@/components/lists/ListPresence'
import type { ListItemShape } from '@/lib/list-helpers'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

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
  createdBy: string | null
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

  // Master list — always the full family set; never replaced by a filtered fetch
  const [lists, setLists] = useState<SerializedList[]>(initialLists)
  const [defaultListId, setDefaultListId] = useState<string | null>(initialDefaultListId ?? null)
  const [listFilter, setListFilter] = useState<'all' | 'mine'>('mine')

  // Filtered view — pure client-side derivation, no extra network round-trip needed
  // "mine"   → lists owned by the current user OR unowned (createdBy '' / null)
  // "family" → lists owned by other family members only
  const visibleLists = listFilter === 'mine'
    ? lists.filter((l) => !l.createdBy || l.createdBy === currentUserId)
    : lists.filter((l) => l.createdBy && l.createdBy !== currentUserId)

  // Determine initial active list: prefer ?list= param, then defaultListId, fall back to first visible
  const initialActiveId = (() => {
    const urlListId = searchParams.get('list')
    if (urlListId && initialLists.some((l) => l.id === urlListId)) return urlListId
    if (initialDefaultListId && initialLists.some((l) => l.id === initialDefaultListId)) {
      return initialDefaultListId
    }
    return initialLists[0]?.id ?? null
  })()
  const [activeListId, setActiveListId] = useState<string | null>(initialActiveId)

  // Always resolve the active list from the full list, not the filtered view,
  // so the main panel doesn't blank out when you change filter while viewing a
  // list that happens to be hidden in the sidebar.
  const activeList = lists.find((l) => l.id === activeListId) ?? null

  const [dialogOpen, setDialogOpen] = useState(false)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [renamingListId, setRenamingListId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Edit list dialog state
  const [editListDialogOpen, setEditListDialogOpen] = useState(false)
  const [editingList, setEditingList] = useState<SerializedList | null>(null)

  function handleOpenEditList(id: string) {
    const list = lists.find((l) => l.id === id) ?? null
    setEditingList(list)
    setEditListDialogOpen(true)
  }

  function handleListUpdated(id: string, changes: { createdBy?: string; name?: string }) {
    setLists((prev) => prev.map((l) => (l.id === id ? { ...l, ...changes } : l)))
  }

  async function handleRenameSubmit(id: string) {
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === lists.find((l) => l.id === id)?.name) {
      setRenamingListId(null)
      return
    }
    const res = await fetch(`/api/lists/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    if (res.ok) {
      setLists((prev) => prev.map((l) => (l.id === id ? { ...l, name: trimmed } : l)))
    }
    setRenamingListId(null)
  }

  function startMobileRename(list: SerializedList) {
    setRenamingListId(list.id)
    setRenameValue(list.name)
    setTimeout(() => renameInputRef.current?.focus(), 50)
  }

  function handleCreated(list: { id: string; name: string; type: string }) {
    const familyId = initialLists[0]?.familyId ?? ''
    const maxSortOrder = lists.reduce((max, l) => Math.max(max, l.sortOrder), 0)
    const newList: SerializedList = {
      ...list,
      createdBy: currentUserId,
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

  async function handleConvert(id: string, newType: 'SHOPPING' | 'TODO') {
    const list = lists.find((l) => l.id === id)
    if (!list) return
    const res = await fetch(`/api/lists/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: newType }),
    })
    if (res.ok) {
      setLists((prev) => prev.map((l) => (l.id === id ? { ...l, type: newType } : l)))
      toast.success(`"${list.name}" converted to ${newType === 'SHOPPING' ? 'Shopping' : 'Todo'} list`)
    } else {
      toast.error('Failed to convert list')
    }
  }

  const handleReorder = useCallback(async (orderedIds: string[]) => {
    setLists((prev) => {
      const listMap = new Map(prev.map((l) => [l.id, l]))
      const reorderedIds = new Set(orderedIds)
      const updates = orderedIds.map((id, idx) => {
        const list = listMap.get(id)
        return list ? { ...list, sortOrder: idx } : list
      }).filter(Boolean) as SerializedList[]
      const remaining = prev.filter((l) => !reorderedIds.has(l.id))
      return [...updates, ...remaining]
    })

    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uiPreferences: { listOrder: orderedIds } }),
    })
    if (!res.ok) {
      toast.error('Failed to save list order')
    }
  }, [])

  const listsMeta = visibleLists.map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type as 'SHOPPING' | 'TODO',
    _count: l._count,
    createdBy: l.createdBy,
  }))

  function handleFilterChange(filter: 'all' | 'mine') {
    setListFilter(filter)
    // If the currently active list is hidden by the new filter, switch to the first visible list
    const newVisible = filter === 'mine'
      ? lists.filter((l) => !l.createdBy || l.createdBy === currentUserId)
      : lists.filter((l) => l.createdBy && l.createdBy !== currentUserId)
    if (activeListId && !newVisible.some((l) => l.id === activeListId)) {
      const firstVisible = newVisible[0]
      if (firstVisible) {
        setActiveListId(firstVisible.id)
      }
    }
  }

  const filterButtons = (
    <div className="flex gap-1">
      <button
        type="button"
        onClick={() => handleFilterChange('all')}
        className={`flex-1 text-xs font-medium py-1 px-2 rounded transition-colors ${
          listFilter === 'all'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted'
        }`}
      >
        Family
      </button>
      <button
        type="button"
        onClick={() => handleFilterChange('mine')}
        className={`flex-1 text-xs font-medium py-1 px-2 rounded transition-colors ${
          listFilter === 'mine'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted'
        }`}
      >
        Mine
      </button>
    </div>
  )

  return (
    <div className="flex h-full overflow-hidden flex-col md:flex-row">

      {/* ── Mobile: filter row ── */}
      <div className="md:hidden flex items-center gap-2 px-2 py-1 border-b border-border shrink-0">
        <div className="flex gap-1 w-full">
          <Button
            variant={listFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            className="flex-1 h-7 text-xs px-2"
            onClick={() => handleFilterChange('all')}
          >
            Family
          </Button>
          <Button
            variant={listFilter === 'mine' ? 'default' : 'outline'}
            size="sm"
            className="flex-1 h-7 text-xs px-2"
            onClick={() => handleFilterChange('mine')}
          >
            Mine
          </Button>
        </div>
      </div>

      {/* ── Mobile: horizontal chip bar ── */}
      <div className="md:hidden flex items-center gap-2 px-2 py-1.5 border-b border-border overflow-x-auto shrink-0 scroll-smooth">
        {listsMeta.map((list) => (
          renamingListId === list.id ? (
            <form
              key={list.id}
              onSubmit={(e) => { e.preventDefault(); handleRenameSubmit(list.id) }}
              className="flex items-center gap-1 shrink-0"
            >
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => handleRenameSubmit(list.id)}
                onKeyDown={(e) => { if (e.key === 'Escape') setRenamingListId(null) }}
                className="px-2 py-1 rounded-full text-sm border border-primary bg-background w-32 outline-none"
                maxLength={100}
              />
            </form>
          ) : (
            <button
              key={list.id}
              type="button"
              onClick={() => setActiveListId(list.id)}
              onTouchStart={() => {
                longPressTimer.current = setTimeout(() => startMobileRename(lists.find((l) => l.id === list.id)!), 600)
              }}
              onTouchEnd={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current) }}
              onTouchMove={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors shrink-0 ${
                activeListId === list.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
              title="Long-press to rename"
            >
              {list.name}
              <span className="text-xs opacity-70">({list._count.items})</span>
            </button>
          )
        ))}
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm whitespace-nowrap shrink-0 border border-dashed border-border text-muted-foreground hover:bg-muted transition-colors"
        >
          + New
        </button>
      </div>

      {/* ── Desktop: sidebar ── */}
      <aside className="hidden md:flex md:flex-col w-[200px] shrink-0 border-r border-border overflow-y-auto">
        <div className="px-2 pt-2 pb-1 border-b border-border">
          {filterButtons}
        </div>
        <div className="flex-1 overflow-y-auto">
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
            onConvert={handleConvert}
            onEditList={members.length > 1 ? handleOpenEditList : undefined}
          />
        </div>
      </aside>

      {/* ── Main content panel ── */}
      <main className="flex-1 overflow-y-auto p-2 sm:p-4 md:p-6">
        {activeList === null ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">No lists yet. Create one to get started.</p>
          </div>
        ) : activeList.type === 'SHOPPING' ? (
          <>
            <div className="flex items-center justify-between mb-1.5 sm:mb-4">
              <div className="flex items-center gap-3">
                {renamingListId === activeList.id ? (
                  <form onSubmit={(e) => { e.preventDefault(); handleRenameSubmit(activeList.id) }}>
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => handleRenameSubmit(activeList.id)}
                      onKeyDown={(e) => { if (e.key === 'Escape') setRenamingListId(null) }}
                      className="text-base sm:text-xl font-semibold border-b-2 border-primary bg-transparent outline-none"
                      maxLength={100}
                      autoFocus
                    />
                  </form>
                ) : (
                  <h1
                    className="text-base sm:text-xl font-semibold cursor-pointer"
                    onDoubleClick={() => { setRenamingListId(activeList.id); setRenameValue(activeList.name); setTimeout(() => renameInputRef.current?.focus(), 50) }}
                    title="Double-click to rename"
                  >{activeList.name}</h1>
                )}
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
              initialItems={(activeList.items ?? []).map(toListItemShape)}
              initialCategoryOrder={(() => {
                if (!activeList.categoryOrder) return null
                try { return JSON.parse(activeList.categoryOrder) } catch { return null }
              })()}
            />
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              {renamingListId === activeList.id ? (
                <form onSubmit={(e) => { e.preventDefault(); handleRenameSubmit(activeList.id) }}>
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRenameSubmit(activeList.id)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setRenamingListId(null) }}
                    className="text-xl font-semibold border-b-2 border-primary bg-transparent outline-none"
                    maxLength={100}
                    autoFocus
                  />
                </form>
              ) : (
                <h1
                  className="text-xl font-semibold cursor-pointer"
                  onDoubleClick={() => { setRenamingListId(activeList.id); setRenameValue(activeList.name); setTimeout(() => renameInputRef.current?.focus(), 50) }}
                  title="Double-click to rename"
                >{activeList.name}</h1>
              )}
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
              initialItems={(activeList.items ?? []).map(toListItemShape)}
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
        members={members}
        currentUserId={currentUserId}
      />

      <EditListDialog
        open={editListDialogOpen}
        onOpenChange={setEditListDialogOpen}
        list={editingList}
        members={members}
        currentUserId={currentUserId}
        onUpdated={handleListUpdated}
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
              body: JSON.stringify({ action: 'clone', templateId, listName }),
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
