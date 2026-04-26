'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { PlusIcon, StarIcon, Trash2Icon, PencilIcon, CheckIcon, XIcon } from 'lucide-react'

interface ListMeta {
  id: string
  name: string
  type: 'SHOPPING' | 'TODO'
  _count: { items: number }
}

interface ListSelectorProps {
  lists: ListMeta[]
  activeListId: string | null
  defaultListId: string | null
  onSelect: (id: string) => void
  onNewList: () => void
  onDeleteList?: (id: string) => void
  onSetDefault?: (id: string) => void
}

function EditableListName({
  list,
  activeListId,
  onSelect,
  onNameChanged,
}: {
  list: ListMeta
  activeListId: string | null
  onSelect: (id: string) => void
  onNameChanged: (id: string, newName: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(list.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  // Keep local name in sync when list prop changes (e.g. after rename from another session)
  useEffect(() => {
    if (!editing) setName(list.name)
  }, [list.name, editing])

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === list.name) {
      setName(list.name)
      setEditing(false)
      return
    }
    const res = await fetch(`/api/lists/${list.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    if (res.ok) {
      onNameChanged(list.id, trimmed)
      setEditing(false)
    } else {
      setName(list.name)
      setEditing(false)
    }
  }

  function handleCancel() {
    setName(list.name)
    setEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 px-1 py-0.5 text-sm bg-background border border-input rounded"
          maxLength={100}
        />
        <button
          onClick={handleSave}
          className="p-0.5 rounded text-green-600 hover:bg-green-100 transition-colors shrink-0"
          title="Save"
        >
          <CheckIcon className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleCancel}
          className="p-0.5 rounded text-muted-foreground hover:bg-muted transition-colors shrink-0"
          title="Cancel"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center gap-1 group/name">
      <button
        onClick={() => onSelect(list.id)}
        onDoubleClick={() => setEditing(true)}
        className={`flex-1 text-left px-2 py-1.5 rounded-md text-sm transition-colors ${
          activeListId === list.id
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-muted'
        }`}
        title="Click to select, double-click to rename"
      >
        <span className="truncate block">{list.name}</span>
        <span className="text-xs opacity-70">{list._count.items} items</span>
      </button>
    </div>
  )
}

export function ListSelector({
  lists,
  activeListId,
  defaultListId,
  onSelect,
  onNewList,
  onDeleteList,
  onSetDefault,
}: ListSelectorProps) {
  const [localLists, setLocalLists] = useState(lists)
  const shopping = localLists.filter((l) => l.type === 'SHOPPING')
  const todo = localLists.filter((l) => l.type === 'TODO')

  // Sync local state when parent lists change
  useEffect(() => {
    setLocalLists(lists)
  }, [lists])

  function handleNameChanged(id: string, newName: string) {
    setLocalLists((prev) => prev.map((l) => (l.id === id ? { ...l, name: newName } : l)))
  }

  function renderList(list: ListMeta) {
    const isDefault = defaultListId === list.id
    return (
      <div key={list.id} className="group flex items-center gap-1 px-1">
        <EditableListName list={list} activeListId={activeListId} onSelect={onSelect} onNameChanged={handleNameChanged} />
        <div className="flex items-center gap-0.5">
          {onSetDefault && (
            <button
              onClick={() => onSetDefault(isDefault ? '' : list.id)}
              className={`p-1 rounded transition-colors shrink-0 ${
                isDefault
                  ? 'text-yellow-500 hover:text-yellow-600'
                  : 'text-muted-foreground/30 hover:text-muted-foreground/60'
              }`}
              title={isDefault ? 'Remove as default' : 'Set as default list'}
            >
              <StarIcon className={`h-3 w-3 ${isDefault ? 'fill-yellow-500' : ''}`} />
            </button>
          )}
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
