'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { NoteCard } from '@/components/notes/NoteCard'
import { NoteEditor } from '@/components/notes/NoteEditor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogHeader, DialogTitle, WideDialogContent } from '@/components/ui/dialog'
import { PlusIcon, SearchIcon, FilterIcon, XIcon, LockIcon, UsersIcon, ShieldCheckIcon, ArchiveIcon, FolderIcon } from 'lucide-react'
import { toast } from 'sonner'
import { listenAppEvent, AppEvents } from '@/lib/app-events'

interface Note {
  id: string
  title: string
  content: string
  category: string | null
  tags: string[]
  isPrivate: boolean
  isArchived?: boolean
  isSecured?: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface NotesClientProps {
  initialNotes: Note[]
  initialCategories: string[]
  currentUserId: string
  tagColors?: Record<string, string>
}

type TabType = 'family' | 'private' | 'secure' | 'archived' | string

export function NotesClient({ initialNotes, initialCategories, currentUserId, tagColors }: NotesClientProps) {
  const [notes, setNotes] = useState(initialNotes)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>('all')
  const [tagFilter, setTagFilter] = useState<string | null>('')
  const [activeTab, setActiveTab] = useState<TabType>('family')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Listen for notes updates from AI assistant or other sources
  useEffect(() => {
    const cleanup = listenAppEvent(AppEvents.NOTES_UPDATED, () => {
      fetch('/api/notes?archived=all')
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data) {
            setNotes(data.map((note: Record<string, unknown>) => ({
              ...note,
              isPrivate: (note as { isPrivate?: boolean }).isPrivate ?? false,
              isArchived: (note as { isArchived?: boolean }).isArchived ?? false,
            })) as Note[])
          }
        })
        .catch(() => {})
    })
    return cleanup
  }, [])

  // Get all unique categories from non-archived notes for tabs
  const allCategories = useMemo(() => {
    const catSet = new Set<string>()
    notes.forEach(note => {
      if (note.category && !note.isArchived) catSet.add(note.category)
    })
    return Array.from(catSet).sort()
  }, [notes])

  // Get all unique tags from notes
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    notes.forEach(note => {
      note.tags.forEach(tag => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  }, [notes])

  // Determine if the active tab is a category tab
  const isCategoryTab = activeTab !== 'family' && activeTab !== 'private' && activeTab !== 'secure' && activeTab !== 'archived'

  // Filter notes based on active tab, search, category, and tag
  const filteredNotes = useMemo(() => {
    return notes.filter(note => {
      // Tab filter
      if (activeTab === 'archived') {
        if (!note.isArchived) return false
      } else {
        // Non-archived tabs: exclude archived notes
        if (note.isArchived) return false

        if (activeTab === 'family' && note.isPrivate) return false
        if (activeTab === 'private' && (!note.isPrivate || note.createdBy !== currentUserId)) return false
        if (activeTab === 'secure' && !note.isSecured) return false

        // Category tab filter
        if (isCategoryTab && note.category !== activeTab) return false
      }

      // Search filter (strip HTML from title/content before matching)
      if (search) {
        const searchLower = search.toLowerCase()
        const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '')
        const matchesSearch =
          stripHtml(note.title).toLowerCase().includes(searchLower) ||
          stripHtml(note.content).toLowerCase().includes(searchLower)
        if (!matchesSearch) return false
      }

      // Category filter (only when not on a category tab)
      if (!isCategoryTab && activeTab !== 'archived') {
        if (categoryFilter && categoryFilter !== 'all') {
          if (categoryFilter === 'uncategorized' && note.category) return false
          if (categoryFilter !== 'uncategorized' && note.category !== categoryFilter) return false
        }
      }

      // Tag filter
      if (tagFilter) {
        if (!note.tags.includes(tagFilter)) return false
      }

      return true
    })
  }, [notes, search, categoryFilter, tagFilter, activeTab, currentUserId, isCategoryTab])

  const handleCreateNote = async (data: {
    title: string
    content: string
    category?: string | null
    tags?: string[]
    newTagColors?: Record<string, string>
    isPrivate?: boolean
    pin?: string | null
  }) => {
    setIsLoading(true)
    try {
      const { newTagColors, ...rest } = data
      const body: Record<string, unknown> = { ...rest }
      if (newTagColors && Object.keys(newTagColors).length > 0) {
        body.newTagColors = newTagColors
      }
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        throw new Error('Failed to create note')
      }

      const newNote = await response.json()
      setNotes([{ ...newNote, isPrivate: newNote.isPrivate ?? false, isArchived: newNote.isArchived ?? false }, ...notes])
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
    newTagColors?: Record<string, string>
    isPrivate?: boolean
    pin?: string | null
  }) => {
    if (!editingNote) return

    setIsLoading(true)
    try {
      const { newTagColors, ...rest } = data
      const body: Record<string, unknown> = { ...rest }
      if (newTagColors && Object.keys(newTagColors).length > 0) {
        body.newTagColors = newTagColors
      }
      const response = await fetch(`/api/notes/${editingNote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        throw new Error('Failed to update note')
      }

      const updatedNote = await response.json()
      setNotes(notes.map(note => note.id === updatedNote.id ? { ...updatedNote, isPrivate: updatedNote.isPrivate ?? false, isArchived: updatedNote.isArchived ?? false } : note))
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

  const handleArchiveNote = async (id: string, isArchived: boolean) => {
    try {
      const response = await fetch(`/api/notes/${id}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived }),
      })

      if (!response.ok) {
        throw new Error('Failed to update archive status')
      }

      const updatedNote = await response.json()
      setNotes(notes.map(note => note.id === updatedNote.id ? { ...updatedNote, isPrivate: updatedNote.isPrivate ?? false, isArchived: updatedNote.isArchived ?? false } : note))
      toast.success(isArchived ? 'Note archived' : 'Note restored')
    } catch (error) {
      console.error('Error archiving note:', error)
      toast.error('Failed to update archive status')
    }
  }

  const handleEditorSubmit = (data: {
    title: string
    content: string
    category?: string | null
    tags?: string[]
    isPrivate?: boolean
    pin?: string | null
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

  const tabCounts = useMemo(() => ({
    family: notes.filter(n => !n.isPrivate && !n.isArchived).length,
    private: notes.filter(n => n.isPrivate && n.createdBy === currentUserId && !n.isArchived).length,
    secure: notes.filter(n => n.isSecured && !n.isArchived).length,
    archived: notes.filter(n => n.isArchived).length,
  }), [notes, currentUserId])

  return (
    <div className="flex flex-col h-full overflow-y-auto p-2 md:p-3 gap-2">
      {/* Header with tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
        <div>
          <h1 className="text-xl font-bold">Notes</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
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

      {/* Tab bar - horizontal scrollable */}
      <div className="flex border-b border-border shrink-0 overflow-x-auto scrollbar-thin">
        <button
          type="button"
          onClick={() => setActiveTab('family')}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'family'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
          }`}
        >
          <UsersIcon className="h-4 w-4" />
          Family
          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
            {tabCounts.family}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('private')}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'private'
              ? 'border-amber-500 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
          }`}
        >
          <LockIcon className="h-4 w-4" />
          Private
          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
            {tabCounts.private}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('secure')}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'secure'
              ? 'border-green-500 text-green-600 dark:text-green-400'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
          }`}
        >
          <ShieldCheckIcon className="h-4 w-4" />
          Secure
          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
            {tabCounts.secure}
          </span>
        </button>

        {/* Dynamic category tabs */}
        {allCategories.map(category => (
          <button
            key={category}
            type="button"
            onClick={() => setActiveTab(category)}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === category
                ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
            }`}
          >
            <FolderIcon className="h-4 w-4" />
            {category}
            <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
              {notes.filter(n => n.category === category && !n.isArchived).length}
            </span>
          </button>
        ))}

        {/* Archived tab */}
        <button
          type="button"
          onClick={() => setActiveTab('archived')}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'archived'
              ? 'border-gray-500 text-gray-600 dark:text-gray-400'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
          }`}
        >
          <ArchiveIcon className="h-4 w-4" />
          Archived
          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
            {tabCounts.archived}
          </span>
        </button>
      </div>

      {/* Filters */}
      <div className="space-y-2 shrink-0">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <div className="flex gap-1.5">
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
          <div className="flex flex-wrap gap-1.5">
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
        <div className="text-center py-6 border rounded-lg shrink-0">
          <p className="text-muted-foreground">
            {notes.length === 0 ? 'No notes yet. Create your first note!' : 'No notes match your filters.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 flex-1 content-start">
          {filteredNotes.map((note) => (
              <NoteCard
              key={note.id}
              {...note}
              tagColors={tagColors}
              onDelete={handleDeleteNote}
              onEdit={handleEditNote}
              onArchive={handleArchiveNote}
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
        <WideDialogContent className="flex flex-col overflow-hidden p-0">
          {/* Sticky header */}
          <DialogHeader className="px-4 pt-4 pb-3 shrink-0 border-b border-border">
            <DialogTitle>
              {editingNote ? 'Edit Note' : 'Create New Note'}
            </DialogTitle>
          </DialogHeader>
          {/* Scrollable body */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
            <NoteEditor
              initialTitle={editingNote?.title || ''}
              initialContent={editingNote?.content || ''}
              initialCategory={editingNote?.category || null}
              initialTags={editingNote?.tags || []}
              initialIsPrivate={editingNote?.isPrivate ?? false}
              initialIsArchived={editingNote?.isArchived ?? false}
              categories={initialCategories}
              tagColors={tagColors}
              onSubmit={handleEditorSubmit}
              onCancel={() => {
                setEditorOpen(false)
                setEditingNote(null)
              }}
              isLoading={isLoading}
            />
          </div>
        </WideDialogContent>
      </Dialog>
    </div>
  )
}
