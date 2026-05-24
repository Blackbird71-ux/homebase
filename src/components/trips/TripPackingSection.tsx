'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Package, Plus, X, Loader2, Check, CheckCircle2,
  Square, Pencil, ChevronDown, ChevronRight,
} from 'lucide-react'
import type { TripPackingEntryShape, TripPackingListItem } from '@/types'

interface TripPackingSectionProps {
  tripId: string
  entries: TripPackingEntryShape[]
  currentUserId: string
  onEntriesUpdated: (entries: TripPackingEntryShape[]) => void
}

export function TripPackingSection({
  tripId,
  entries,
  currentUserId,
  onEntriesUpdated,
}: TripPackingSectionProps) {
  const [creating, setCreating]       = useState(false)
  const [newListName, setNewListName] = useState('')
  const [newListLabel, setNewListLabel] = useState('')
  const [saving, setSaving]           = useState(false)

  async function handleCreateList(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch(`/api/trips/${tripId}/packing-lists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newListName.trim() || null,
          label: newListLabel.trim() || null,
        }),
      })
      if (res.ok) {
        const entry = await res.json()
        onEntriesUpdated([...entries, entry])
        setNewListName('')
        setNewListLabel('')
        setCreating(false)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveEntry(entryId: string) {
    if (!confirm('Remove this packing list from the trip?')) return
    const res = await fetch(`/api/trips/${tripId}/packing-lists/${entryId}?deleteList=false`, {
      method: 'DELETE',
    })
    if (res.ok) {
      onEntriesUpdated(entries.filter((e) => e.id !== entryId))
    }
  }

  function handleEntryUpdated(entryId: string, updatedEntry: TripPackingEntryShape) {
    onEntriesUpdated(entries.map((e) => (e.id === entryId ? updatedEntry : e)))
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Package className="h-4 w-4" />
          Packing Lists
        </h2>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add List
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="mb-4 p-3 rounded-lg border border-border bg-card space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Who is this for? (label)
              </label>
              <input
                value={newListLabel}
                onChange={(e) => setNewListLabel(e.target.value)}
                placeholder="e.g. Mark, Michelle, Shared…"
                className="w-full px-2 py-1.5 rounded border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                List name (optional)
              </label>
              <input
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="Defaults to destination name"
                className="w-full px-2 py-1.5 rounded border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setCreating(false)} className="px-3 py-1.5 rounded text-sm font-medium border border-input hover:bg-accent transition-colors">
              Cancel
            </button>
            <button
              onClick={handleCreateList}
              disabled={saving}
              className="px-3 py-1.5 rounded text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {entries.length === 0 && !creating && (
        <div className="p-8 text-center text-muted-foreground rounded-lg border border-dashed border-border">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">No packing lists yet</p>
          <p className="text-xs mt-1">Add separate lists for each traveller — Mark, Michelle, Shared…</p>
        </div>
      )}

      {/* Lists */}
      <div className="space-y-4">
        {entries.map((entry) => (
          <PackingListCard
            key={entry.id}
            entry={entry}
            tripId={tripId}
            currentUserId={currentUserId}
            onRemove={() => handleRemoveEntry(entry.id)}
            onUpdated={(updated) => handleEntryUpdated(entry.id, updated)}
          />
        ))}
      </div>
    </section>
  )
}

// ── Individual packing list card ──────────────────────────────────────────────

function PackingListCard({
  entry,
  tripId,
  currentUserId,
  onRemove,
  onUpdated,
}: {
  entry: TripPackingEntryShape
  tripId: string
  currentUserId: string
  onRemove: () => void
  onUpdated: (updated: TripPackingEntryShape) => void
}) {
  const [expanded, setExpanded]   = useState(true)
  const [newItem, setNewItem]     = useState('')
  const [adding, setAdding]       = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const pendingItems   = entry.list.items.filter((i) => !i.isCompleted)
  const completedItems = entry.list.items.filter((i) => i.isCompleted)

  function updateItems(items: TripPackingListItem[]) {
    onUpdated({ ...entry, list: { ...entry.list, items } })
  }

  async function handleToggle(item: TripPackingListItem) {
    // Optimistic
    updateItems(entry.list.items.map((i) =>
      i.id === item.id ? { ...i, isCompleted: !i.isCompleted } : i
    ))
    const res = await fetch(`/api/lists/${entry.listId}/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isCompleted: !item.isCompleted }),
    })
    if (!res.ok) {
      // Revert
      updateItems(entry.list.items)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newItem.trim()) return
    setAdding(true)
    try {
      const res = await fetch(`/api/lists/${entry.listId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newItem.trim(), createdBy: currentUserId }),
      })
      if (res.ok) {
        const item = await res.json()
        updateItems([...entry.list.items, {
          ...item,
          dueDate: item.dueDate ?? null,
          createdAt: item.createdAt ?? new Date().toISOString(),
        }])
        setNewItem('')
      }
    } finally {
      setAdding(false)
    }
  }

  async function handleSaveEdit(itemId: string) {
    if (!editValue.trim()) return
    const res = await fetch(`/api/lists/${entry.listId}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editValue.trim() }),
    })
    if (res.ok) {
      updateItems(entry.list.items.map((i) =>
        i.id === itemId ? { ...i, content: editValue.trim() } : i
      ))
      setEditingId(null)
    }
  }

  async function handleDelete(itemId: string) {
    const res = await fetch(`/api/lists/${entry.listId}/items/${itemId}`, { method: 'DELETE' })
    if (res.ok) {
      updateItems(entry.list.items.filter((i) => i.id !== itemId))
    }
  }

  const labelColor = entry.label === 'Shared'
    ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
    : 'bg-primary/10 text-primary'

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 hover:text-foreground text-sm font-medium"
        >
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          {entry.label && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${labelColor}`}>
              {entry.label}
            </span>
          )}
          <span>{entry.list.name}</span>
          <span className="text-xs text-muted-foreground font-normal">
            {pendingItems.length} remaining
          </span>
        </button>
        <div className="flex items-center gap-1">
          <Link
            href={`/lists?list=${entry.listId}`}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Open full list"
          >
            <Package className="h-3.5 w-3.5" />
          </Link>
          <button
            onClick={onRemove}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive"
            title="Remove list"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <>
          {/* Add item */}
          <form onSubmit={handleAdd} className="flex gap-2 p-3 border-b border-border">
            <input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Add item…"
              className="flex-1 px-2.5 py-1.5 rounded border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={adding || !newItem.trim()}
              className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          </form>

          {/* Pending items */}
          {pendingItems.length > 0 && (
            <div className="divide-y divide-border">
              {pendingItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  editingId={editingId}
                  editValue={editValue}
                  setEditValue={setEditValue}
                  onToggle={() => handleToggle(item)}
                  onStartEdit={() => { setEditingId(item.id); setEditValue(item.content) }}
                  onSaveEdit={() => handleSaveEdit(item.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onDelete={() => handleDelete(item.id)}
                />
              ))}
            </div>
          )}

          {/* Completed items */}
          {completedItems.length > 0 && (
            <details className="border-t border-border">
              <summary className="px-3 py-2 text-xs text-muted-foreground cursor-pointer hover:bg-accent/30">
                {completedItems.length} item{completedItems.length !== 1 ? 's' : ''} packed ✓
              </summary>
              <div className="divide-y divide-border">
                {completedItems.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    editingId={editingId}
                    editValue={editValue}
                    setEditValue={setEditValue}
                    onToggle={() => handleToggle(item)}
                    onStartEdit={() => { setEditingId(item.id); setEditValue(item.content) }}
                    onSaveEdit={() => handleSaveEdit(item.id)}
                    onCancelEdit={() => setEditingId(null)}
                    onDelete={() => handleDelete(item.id)}
                    completed
                  />
                ))}
              </div>
            </details>
          )}

          {entry.list.items.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Empty — add items above to start packing!
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ── Item row ──────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  editingId,
  editValue,
  setEditValue,
  onToggle,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  completed = false,
}: {
  item: TripPackingListItem
  editingId: string | null
  editValue: string
  setEditValue: (v: string) => void
  onToggle: () => void
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
  completed?: boolean
}) {
  const isEditing = editingId === item.id

  return (
    <div className={`flex items-center gap-2 px-3 py-2 hover:bg-accent/30 group ${completed ? 'opacity-60' : ''}`}>
      <button onClick={onToggle} className={`shrink-0 ${completed ? 'text-green-500' : 'text-muted-foreground hover:text-foreground'}`}>
        {completed ? <CheckCircle2 className="h-4 w-4" /> : <Square className="h-4 w-4" />}
      </button>

      {isEditing ? (
        <div className="flex-1 flex items-center gap-1.5">
          <input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); onSaveEdit() }
              if (e.key === 'Escape') { e.preventDefault(); onCancelEdit() }
            }}
            className="flex-1 px-2 py-1 rounded border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          />
          <button onClick={onSaveEdit} disabled={!editValue.trim()} className="p-1 rounded text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 disabled:opacity-50">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button onClick={onCancelEdit} className="p-1 rounded text-muted-foreground hover:bg-accent">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <>
          <span
            className={`flex-1 text-sm cursor-pointer ${completed ? 'line-through' : ''}`}
            onClick={onStartEdit}
          >
            {item.content}
          </span>
          {item.category && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{item.category}</span>
          )}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onStartEdit} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent">
              <Pencil className="h-3 w-3" />
            </button>
            <button onClick={onDelete} className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-accent">
              <X className="h-3 w-3" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
