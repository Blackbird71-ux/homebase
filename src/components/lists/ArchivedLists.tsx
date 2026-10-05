'use client'

import { ArchiveRestoreIcon, Trash2Icon } from 'lucide-react'

export interface ArchivedListMeta {
  id: string
  name: string
  type: string
  createdBy: string | null
}

interface ArchivedListsProps {
  lists: ArchivedListMeta[]
  loading: boolean
  onRestore: (id: string) => void
  onDelete: (id: string) => void
}

export function ArchivedLists({ lists, loading, onRestore, onDelete }: ArchivedListsProps) {
  if (loading) {
    return <p className="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  }
  if (lists.length === 0) {
    return <p className="px-3 py-4 text-sm text-muted-foreground">No archived lists.</p>
  }
  return (
    <ul className="flex flex-col gap-1 py-2">
      {lists.map((list) => (
        <li key={list.id} className="flex items-center gap-1 px-3 py-1.5 rounded-md hover:bg-muted/50">
          <div className="flex-1 min-w-0">
            <span className="truncate block text-sm">{list.name}</span>
            <span className="text-xs text-muted-foreground">
              {list.type === 'SHOPPING' ? 'Shopping' : 'Todo'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onRestore(list.id)}
            className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
            title="Restore list"
            aria-label={`Restore ${list.name}`}
          >
            <ArchiveRestoreIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(list.id)}
            className="p-1.5 rounded text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
            title="Delete permanently"
            aria-label={`Delete ${list.name} permanently`}
          >
            <Trash2Icon className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  )
}
