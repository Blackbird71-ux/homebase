'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NoteEditor } from '@/components/notes/NoteEditor'
import { CalendarIcon, FolderIcon, TagIcon, EditIcon, Trash2Icon, ArrowLeftIcon, LockIcon, UsersIcon } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface NoteDetailProps {
  note: {
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
}

export function NoteDetail({ note }: NoteDetailProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleUpdate = async (data: {
    title: string
    content: string
    category?: string | null
    tags?: string[]
  }) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error('Failed to update note')
      }

      toast.success('Note updated successfully')
      setIsEditing(false)
      router.refresh() // Refresh the page to get updated data
    } catch (error) {
      console.error('Error updating note:', error)
      toast.error('Failed to update note')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this note? This action cannot be undone.')) {
      return
    }

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete note')
      }

      toast.success('Note deleted successfully')
      router.push('/notes')
    } catch (error) {
      console.error('Error deleting note:', error)
      toast.error('Failed to delete note')
      setIsDeleting(false)
    }
  }

  const formattedCreatedAt = format(new Date(note.createdAt), 'PPpp')
  const formattedUpdatedAt = format(new Date(note.updatedAt), 'PPpp')
  const isRecentlyUpdated = new Date(note.updatedAt).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 md:p-6 gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4 flex-wrap">
        <Button
        variant="outline"
        size="icon"
        onClick={() => router.push('/notes')}
        >
        <ArrowLeftIcon className="h-4 w-4" />
        </Button>
        <div>
        <div className="flex items-center gap-2">
              <h1
                className="text-2xl font-bold"
                dangerouslySetInnerHTML={{ __html: note.title }}
              />
              {note.isPrivate ? (
                <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full">
                  <LockIcon className="h-3 w-3" /> Private
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded-full">
                  <UsersIcon className="h-3 w-3" /> Family
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
              <div className="flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" />
                <span>Created: {formattedCreatedAt}</span>
              </div>
              <div className="flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" />
                <span>Updated: {formattedUpdatedAt}</span>
                {isRecentlyUpdated && (
                  <span className="ml-1 text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-0.5 rounded-full">
                    Recent
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setIsEditing(true)}
            disabled={isLoading || isDeleting}
          >
            <EditIcon className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isLoading || isDeleting}
          >
            <Trash2Icon className="h-4 w-4 mr-2" />
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>

      {/* Metadata */}
      <div className="flex flex-wrap gap-4 shrink-0">
        {note.category && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary text-secondary-foreground rounded-md">
            <FolderIcon className="h-4 w-4" />
            <span className="font-medium">{note.category}</span>
          </div>
        )}
        
        {note.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {note.tags.map((tag, index) => (
              <div
                key={index}
                className="flex items-center gap-1 px-3 py-1.5 bg-secondary text-secondary-foreground rounded-md"
              >
                <TagIcon className="h-3 w-3" />
                <span>{tag}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <Card className="flex-1 min-h-0 overflow-y-auto">
        <CardHeader>
          <CardTitle>Content</CardTitle>
        </CardHeader>
        <CardContent>
          <div 
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: note.content }}
          />
        </CardContent>
      </Card>

      {/* Editor Dialog */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="w-full max-w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Note</DialogTitle>
          </DialogHeader>
          <NoteEditor
            initialTitle={note.title}
            initialContent={note.content}
            initialCategory={note.category}
            initialTags={note.tags}
            initialIsPrivate={note.isPrivate}
            categories={note.category ? [note.category] : []}
            onSubmit={handleUpdate}
            onCancel={() => setIsEditing(false)}
            isLoading={isLoading}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}