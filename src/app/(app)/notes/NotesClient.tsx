'use client'

import { useState, useMemo } from 'react'
import { NoteCard } from '@/components/notes/NoteCard'
import { NoteEditor } from '@/components/notes/NoteEditor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PlusIcon, SearchIcon, FilterIcon, XIcon, LockIcon, UsersIcon, NotepadTextIcon } from 'lucide-react'
import { toast } from 'sonner'

interface Note {
  id: string
  title: string
  content: string
  category: string | null
  tags: string[]
  isPrivate: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface NotesClientProps {
  initialNotes: Note[]
  initialCategories: string[]
  currentUserId: string
}

export function NotesClient({ initialNotes, initialCategories, currentUserId }: NotesClientProps) {
  const [notes, setNotes] = useState(initialNotes)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>('all')
  const [tagFilter, setTagFilter] = useState<string | null>('')
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'family' | 'private'>('all')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Get all unique tags from notes
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    notes.forEach(note => {
      note.tags.forEach(tag => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  }, [notes])

  // Filter notes based on search, category, tag and visibility
  const filteredNotes = useMemo(() => {
    return notes.filter(note => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase()
        const matchesSearch = 
          note.title.toLowerCase().includes(searchLower) ||
          note.content.toLowerCase().includes(searchLower)
        if (!matchesSearch) return false
      }

      // Category filter
      if (categoryFilter && categoryFilter !== 'all') {
        if (categoryFilter === 'uncategorized' && note.category) return false
        if (categoryFilter !== 'uncategorized' && note.category !== categoryFilter) return false
      }

      // Tag filter
      if (tagFilter) {
        if (!note.tags.includes(tagFilter)) return false
      }

      // Visibility filter
      if (visibilityFilter === 'private' && !note.isPrivate) return false
      if (visibilityFilter === 'family' && note.isPrivate) return false

      return true
    })
  }, [notes, search, categoryFilter, tagFilter, visibilityFilter])

  const handleCreateNote = async (data: {
    title: string
    content: string
    category?: string | null
    tags?: string[]
    isPrivate?: boolean
  }) => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error('Failed to create note')
      }

      const newNote = await response.json()
      setNotes([{ ...newNote, isPrivate: newNote.isPrivate ?? false }, ...notes])
      setEditorOpen(false)
      toast.success('Note created successfully')
    } catch (error) {
      console.error('Error creating note:', error)
      toast.error('Failed to create note')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateNote = async (data: {
    title: string
    content: string
    category?: string | null
    tags?: string[]
    isPrivate?: boolean
  }) => {
    if (!editingNote) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/notes/${editingNote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error('Failed to update note')
      }

      const updatedNote = await response.json()
      setNotes(notes.map(note => note.id === updatedNote.id ? { ...updatedNote, isPrivate: updatedNote.isPrivate ?? false } : note))
      setEditorOpen(false)
      setEditingNote(null)
      toast.success('Note updated successfully')
    } catch (error) {
      console.error('Error updating note:', error)
      toast.error('Failed to update note')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteNote = async (id: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return

    try {
      const response = await fetch(`/api/notes/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete note')
      }

      setNotes(notes.filter(note => note.id !== id))
      toast.success('Note deleted successfully')
    } catch (error) {
      console.error('Error deleting note:', error)
      toast.error('Failed to delete note')
    }
  }

  const handleEditNote = (id: string) => {
    const noteToEdit = notes.find(note => note.id === id)
    if (noteToEdit) {
      setEditingNote(noteToEdit)
      setEditorOpen(true)
    }
  }

  const handleEditorSubmit = (data: {
    title: string
    content: string
    category?: string | null
    tags?: string[]
  }) => {
    if (editingNote) {
      handleUpdateNote(data)
    } else {
      handleCreateNote(data)
    }
  }

  const clearFilters = () => {
    setSearch('')
    setCategoryFilter('all')
    setTagFilter('')
    setVisibilityFilter('all')
  }

  const hasActiveFilters = search || (categoryFilter && categoryFilter !== 'all') || tagFilter || visibilityFilter !== 'all'

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 md:p-6 gap-6">
      {/* Header with stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold">Notes</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-muted-foreground">
              {filteredNotes.length} note{filteredNotes.length !== 1 ? 's' : ''}
              {hasActiveFilters && ' (filtered)'}
            </p>
            <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
              <UsersIcon className="h-3 w-3" />
              {notes.filter(n => !n.isPrivate).length} family
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <LockIcon className="h-3 w-3" />
              {notes.filter(n => n.isPrivate && n.createdBy === currentUserId).length} private
            </span>
          </div>
        </div>
        <Button onClick={() => {
          setEditingNote(null)
          setEditorOpen(true)
        }}>
          <PlusIcon className="h-4 w-4 mr-2" />
          New Note
        </Button>
      </div>

      {/* Filters */}
      <div className="space-y-4 shrink-0">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <div className="flex gap-2">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px]">
                <FilterIcon className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="uncategorized">Uncategorized</SelectItem>
                {initialCategories.map(category => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={tagFilter || "Filter by tag"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All tags</SelectItem>
                {allTags.map(tag => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Visibility quick-filter buttons */}
            <div className="flex rounded-md border border-input overflow-hidden">
              <button
                type="button"
                onClick={() => setVisibilityFilter('all')}
                className={`px-3 py-1.5 text-xs flex items-center gap-1 transition-colors ${
                  visibilityFilter === 'all' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                <NotepadTextIcon className="h-3 w-3" /> All
              </button>
              <button
                type="button"
                onClick={() => setVisibilityFilter('family')}
                className={`px-3 py-1.5 text-xs flex items-center gap-1 border-l border-input transition-colors ${
                  visibilityFilter === 'family' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                <UsersIcon className="h-3 w-3" /> Family
              </button>
              <button
                type="button"
                onClick={() => setVisibilityFilter('private')}
                className={`px-3 py-1.5 text-xs flex items-center gap-1 border-l border-input transition-colors ${
                  visibilityFilter === 'private' ? 'bg-amber-500 text-white' : 'hover:bg-muted'
                }`}
              >
                <LockIcon className="h-3 w-3" /> Private
              </button>
            </div>

            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>
                <XIcon className="h-4 w-4 mr-2" />
                Clear
              </Button>
            )}
          {visibilityFilter !== 'all' && (
            <div className="inline-flex items-center gap-1 px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded-full">
              {visibilityFilter === 'private' ? <LockIcon className="h-3 w-3" /> : <UsersIcon className="h-3 w-3" />}
              {visibilityFilter === 'private' ? 'Private only' : 'Family only'}
              <button type="button" onClick={() => setVisibilityFilter('all')} className="ml-1 hover:text-destructive">
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          )}
          </div>
        </div>

        {/* Active filters display */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2">
            {search && (
              <div className="inline-flex items-center gap-1 px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded-full">
                Search: "{search}"
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="ml-1 hover:text-destructive"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            )}
            {categoryFilter && categoryFilter !== 'all' && (
              <div className="inline-flex items-center gap-1 px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded-full">
                Category: {categoryFilter === 'uncategorized' ? 'Uncategorized' : categoryFilter}
                <button
                  type="button"
                  onClick={() => setCategoryFilter('all')}
                  className="ml-1 hover:text-destructive"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            )}
            {tagFilter && (
              <div className="inline-flex items-center gap-1 px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded-full">
                Tag: {tagFilter}
                <button
                  type="button"
                  onClick={() => setTagFilter(null)}
                  className="ml-1 hover:text-destructive"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Notes Grid */}
      {filteredNotes.length === 0 ? (
        <div className="text-center py-12 border rounded-lg shrink-0">
          <p className="text-muted-foreground">
            {notes.length === 0 ? 'No notes yet. Create your first note!' : 'No notes match your filters.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 content-start">
          {filteredNotes.map((note) => (
              <NoteCard
              key={note.id}
              {...note}
              onDelete={handleDeleteNote}
              onEdit={handleEditNote}
            />
          ))}
        </div>
      )}

      {/* Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={(open) => {
        if (!open) {
          setEditingNote(null)
        }
        setEditorOpen(open)
      }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingNote ? 'Edit Note' : 'Create New Note'}
            </DialogTitle>
          </DialogHeader>
          <NoteEditor
            initialTitle={editingNote?.title || ''}
            initialContent={editingNote?.content || ''}
            initialCategory={editingNote?.category || null}
            initialTags={editingNote?.tags || []}
            initialIsPrivate={editingNote?.isPrivate ?? false}
            categories={initialCategories}
            onSubmit={handleEditorSubmit}
            onCancel={() => {
              setEditorOpen(false)
              setEditingNote(null)
            }}
            isLoading={isLoading}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}