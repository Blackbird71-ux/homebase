'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface RecipeBook {
  id: string
  name: string
  recipeCount: number
}

interface RecipeBookSidebarProps {
  books: RecipeBook[]
  activeBookId: string | null
  onSelect: (bookId: string | null) => void
  onBookCreated: (book: RecipeBook) => void
  onBookDeleted: (bookId: string) => void
  mobile?: boolean
}

export function RecipeBookSidebar({
  books,
  activeBookId,
  onSelect,
  onBookCreated,
  onBookDeleted,
  mobile = false,
}: RecipeBookSidebarProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/recipe-books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (res.ok) {
        const book = await res.json() as { id: string; name: string }
        onBookCreated({ ...book, recipeCount: 0 })
        setNewName('')
        setCreating(false)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(book: RecipeBook) {
    if (!confirm(`Delete book "${book.name}"? Recipes will not be deleted.`)) return
    const res = await fetch(`/api/recipe-books/${book.id}`, { method: 'DELETE' })
    if (res.ok) onBookDeleted(book.id)
  }

  if (mobile) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1 shrink-0">
        <Button
          variant={activeBookId === null ? 'default' : 'outline'}
          size="sm"
          onClick={() => onSelect(null)}
          className="shrink-0"
        >
          All
        </Button>
        {books.map((book) => (
          <Button
            key={book.id}
            variant={activeBookId === book.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => onSelect(book.id)}
            className="shrink-0"
          >
            {book.name}
            <span className="ml-1 text-xs opacity-60">{book.recipeCount}</span>
          </Button>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 h-full">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-2 mb-1">Books</p>
      <button
        onClick={() => onSelect(null)}
        className={cn(
          'flex items-center justify-between w-full px-2 py-1.5 rounded-md text-sm text-left transition-colors',
          activeBookId === null
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-muted text-foreground'
        )}
      >
        All Recipes
      </button>
      {books.map((book) => (
        <div key={book.id} className="group flex items-center gap-1">
          <button
            onClick={() => onSelect(book.id)}
            className={cn(
              'flex items-center justify-between flex-1 px-2 py-1.5 rounded-md text-sm text-left transition-colors',
              activeBookId === book.id
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted text-foreground'
            )}
          >
            <span className="truncate">{book.name}</span>
            <span className={cn(
              'text-xs ml-1 shrink-0',
              activeBookId === book.id ? 'opacity-75' : 'text-muted-foreground'
            )}>
              {book.recipeCount}
            </span>
          </button>
          <button
            onClick={() => handleDelete(book)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
            title="Delete book"
          >
            <Trash2Icon className="h-3 w-3" />
          </button>
        </div>
      ))}

      <div className="mt-auto pt-2 border-t border-border">
        {creating ? (
          <form onSubmit={handleCreate} className="flex flex-col gap-1.5 px-1">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Book name"
              className="h-7 text-sm"
              autoFocus
            />
            <div className="flex gap-1">
              <Button type="submit" size="sm" className="flex-1 h-6 text-xs" disabled={saving || !newName.trim()}>
                {saving ? '...' : 'Add'}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 w-full px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <PlusIcon className="h-3 w-3" />
            New Book
          </button>
        )}
      </div>
    </div>
  )
}
