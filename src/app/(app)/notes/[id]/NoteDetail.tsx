'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NoteEditor } from '@/components/notes/NoteEditor'
import { CalendarIcon, FolderIcon, TagIcon, EditIcon, Trash2Icon, ArrowLeftIcon, LockIcon, UsersIcon, ShieldCheckIcon, UnlockIcon, ArchiveIcon, ArchiveRestoreIcon } from 'lucide-react'
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
    isArchived?: boolean
    isSecured?: boolean
    isLocked?: boolean
    pinHash?: string | null
    createdBy: string
    createdAt: string
    updatedAt: string
  }
  tagColors?: Record<string, string>
}

export function NoteDetail({ note, tagColors }: NoteDetailProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [unlockPin, setUnlockPin] = useState('')
  const [isUnlocking, setIsUnlocking] = useState(false)
  // Always start secured notes as locked on the client side.
  // The server-side cookie check (note.isLocked) is used for SSR content hiding,
  // but on page refresh the cookie-clearing sendBeacon may not complete in time,
  // so we always require explicit unlock for secured items.
  const [isLocked, setIsLocked] = useState(note.isSecured ? true : false)
  const [unlockError, setUnlockError] = useState('')

  // Lock the note by calling the lock API and updating local state
  const handleLock = useCallback(async () => {
    try {
      await fetch(`/api/notes/${note.id}/lock`, { method: 'POST' })
    } catch {
      // Silently fail — cookie will expire naturally
    }
    setIsLocked(true)
  }, [note.id])

  // Lock the note when the component unmounts (user navigates away) or page is refreshed/closed
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable delivery on page unload
      navigator.sendBeacon(`/api/notes/${note.id}/lock`, '')
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      // Fire-and-forget: lock the note on unmount
      fetch(`/api/notes/${note.id}/lock`, { method: 'POST' }).catch(() => {})
    }
  }, [note.id])

  const handleUnlock = async () => {
    if (!unlockPin) return
    setIsUnlocking(true)
    setUnlockError('')
    try {
      const response = await fetch(`/api/notes/${note.id}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: unlockPin }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Incorrect PIN')
      }

      setIsLocked(false)
      setUnlockPin('')
      toast.success('Note unlocked')
      router.refresh()
    } catch (error) {
      setUnlockError(error instanceof Error ? error.message : 'Failed to unlock')
    } finally {
      setIsUnlocking(false)
    }
  }


  const handleUpdate = async (data: {
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
      const response = await fetch(`/api/notes/${note.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        throw new Error('Failed to update note')
      }

      toast.success('Note updated successfully')
      setIsEditing(false)
      router.refresh()
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

  const handleArchive = async () => {
    const newArchived = !(note as any).isArchived
    setIsLoading(true)
    try {
      const response = await fetch(`/api/notes/${note.id}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: newArchived }),
      })

      if (!response.ok) {
        throw new Error('Failed to update archive status')
      }

      toast.success(newArchived ? 'Note archived' : 'Note restored')
      router.refresh()
    } catch (error) {
      console.error('Error archiving note:', error)
      toast.error('Failed to update archive status')
    } finally {
      setIsLoading(false)
    }
  }

  const formattedCreatedAt = format(new Date(note.createdAt), 'PPpp')
  const formattedUpdatedAt = format(new Date(note.updatedAt), 'PPpp')
  const isRecentlyUpdated = new Date(note.updatedAt).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000

  // If locked, show unlock screen
  if (isLocked) {
    return (
      <div className="flex flex-col h-full overflow-y-auto p-4 md:p-6 gap-6">
        <div className="flex items-center gap-4 shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push('/notes')}
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Secure Note</h1>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <ShieldCheckIcon className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <CardTitle>This note is PIN-protected</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Enter the PIN to view this note's content.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="unlock-pin">PIN Code</Label>
                <Input
                  id="unlock-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={unlockPin}
                  onChange={(e) => {
                    setUnlockPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                    setUnlockError('')
                  }}
                  placeholder="Enter PIN"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleUnlock()
                  }}
                  disabled={isUnlocking}
                  autoFocus
                />
                {unlockError && (
                  <p className="text-sm text-destructive">{unlockError}</p>
                )}
              </div>
              <Button
                className="w-full"
                onClick={handleUnlock}
                disabled={isUnlocking || !unlockPin}
              >
                {isUnlocking ? (
                  'Unlocking...'
                ) : (
                  <>
                    <UnlockIcon className="h-4 w-4 mr-2" />
                    Unlock
                  </>
                )}
                {(note as any).isArchived && (
                  <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-400 px-2 py-0.5 rounded-full">
                    <ArchiveIcon className="h-3 w-3" /> Archived
                  </span>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

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
              {note.isSecured && (
                <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 px-2 py-0.5 rounded-full">
                  <ShieldCheckIcon className="h-3 w-3" /> Secure
                </span>
              )}
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
          {note.isSecured && (
            <Button
              variant="outline"
              onClick={handleLock}
              disabled={isLoading || isDeleting}
            >
              <LockIcon className="h-4 w-4 mr-2" />
              Lock
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleArchive}
            disabled={isLoading || isDeleting}
          >
            {(note as any).isArchived ? (
              <><ArchiveRestoreIcon className="h-4 w-4 mr-2" /> Restore</>
            ) : (
              <><ArchiveIcon className="h-4 w-4 mr-2" /> Archive</>
            )}
          </Button>
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
            {note.tags.map((tag, index) => {
              const color = tagColors?.[tag]
              return (
                <div
                  key={index}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-md font-medium"
                  style={{
                    backgroundColor: color ? `${color}20` : undefined,
                    color: color || undefined,
                  }}
                >
                  {color && (
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  )}
                  <span>{tag}</span>
                </div>
              )
            })}
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
        <DialogContent className="w-full max-w-full sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Note</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            <NoteEditor
              initialTitle={note.title}
              initialContent={note.content}
              initialCategory={note.category}
              initialTags={note.tags}
              initialIsPrivate={note.isPrivate}
              initialPinHash={note.pinHash ?? null}
              categories={note.category ? [note.category] : []}
              tagColors={tagColors}
              onSubmit={handleUpdate}
              onCancel={() => setIsEditing(false)}
              isLoading={isLoading}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
