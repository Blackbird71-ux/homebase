'use client'

import { useState, useMemo } from 'react'
import { NoteCard } from '@/components/notes/NoteCard'
import { NoteEditor } from '@/components/notes/NoteEditor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PlusIcon, SearchIcon, FilterIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'

interface Note {
  id: string
  title: string
  content: string
  category: string | null
  tags: string[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface NotesClientProps {
  initialNotes: Note[]
  initialCategories: string[]
}

export function NotesClient({ initialNotes, initialCategories }: NotesClientProps) {
  const [notes, setNotes] = useState(initialNotes)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>('all')
  const [tagFilter, setTagFilter] = useState<string | null>('')
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

  // Filter notes based on search, category, and tag
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

      return true
    })
  }, [notes, search, categoryFilter, tagFilter])

  const handleCreateNote = async (data: {
    title: string
    content: string
    category?: string | null
    tags?: string[]
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
      setNotes([newNote, ...notes])
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
      setNotes(notes.map(note => note.id === updatedNote.id ? updatedNote : note))
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
  }

  const hasActiveFilters = search || (categoryFilter && categoryFilter !== 'all') || tagFilter

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 md:p-6 gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold">Notes</h1>
          <p className="text-muted-foreground">
            {filteredNotes.length} note{filteredNotes.length !== 1 ? 's' : ''}
            {hasActiveFilters && ' (filtered)'}
          </p>
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
              <SelectTrigger className="w-[180px]">
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
              <SelectTrigger className="w-[180px]">
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

            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>
                <XIcon className="h-4 w-4 mr-2" />
                Clear
              </Button>
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