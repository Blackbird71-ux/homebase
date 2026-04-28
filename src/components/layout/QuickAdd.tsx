'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarPlus,
  ListPlus,
  ChefHat,
  StickyNote,
  Plus,
  Loader2,
  Check,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

type QuickAction = 'event' | 'list' | 'recipe' | 'note'

interface QuickAddProps {
  /** Keyboard shortcut key — defaults to 'k' */
  shortcutKey?: string
}

export function QuickAdd({ shortcutKey = 'k' }: QuickAddProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<QuickAction | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  // Form state
  const [eventTitle, setEventTitle] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [listName, setListName] = useState('')
  const [listType, setListType] = useState<'SHOPPING' | 'TODO'>('SHOPPING')
  const [recipeTitle, setRecipeTitle] = useState('')
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)

  // Keyboard shortcut listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === shortcutKey) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
      // Escape to close
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, shortcutKey])

  // Focus input when mode changes
  useEffect(() => {
    if (mode && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [mode])

  const resetForm = useCallback(() => {
    setMode(null)
    setEventTitle('')
    setEventDate('')
    setListName('')
    setListType('SHOPPING')
    setRecipeTitle('')
    setNoteTitle('')
    setNoteContent('')
    setSubmitting(false)
    setSuccess(false)
  }, [])

  function handleOpenChange(newOpen: boolean) {
    setOpen(newOpen)
    if (!newOpen) {
      resetForm()
    }
  }

  function selectMode(m: QuickAction) {
    setMode(m)
    // Set default date for events
    if (m === 'event') {
      setEventDate(new Date().toISOString().slice(0, 10))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    try {
      switch (mode) {
        case 'event': {
          if (!eventTitle.trim() || !eventDate) {
            toast.error('Title and date are required')
            setSubmitting(false)
            return
          }
          const start = new Date(eventDate + 'T00:00:00')
          const end = new Date(eventDate + 'T23:59:00')
          const res = await fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: eventTitle.trim(),
              start: start.toISOString(),
              end: end.toISOString(),
              isAllDay: true,
            }),
          })
          if (!res.ok) throw new Error('Failed to create event')
          setSuccess(true)
          toast.success('Event created')
          setTimeout(() => { handleOpenChange(false); router.refresh() }, 800)
          break
        }
        case 'list': {
          if (!listName.trim()) {
            toast.error('List name is required')
            setSubmitting(false)
            return
          }
          const res = await fetch('/api/lists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: listName.trim(), type: listType }),
          })
          if (!res.ok) throw new Error('Failed to create list')
          setSuccess(true)
          toast.success(`${listType === 'SHOPPING' ? 'Shopping' : 'To-Do'} list created`)
          setTimeout(() => { handleOpenChange(false); router.refresh() }, 800)
          break
        }
        case 'recipe': {
          if (!recipeTitle.trim()) {
            toast.error('Recipe title is required')
            setSubmitting(false)
            return
          }
          const res = await fetch('/api/recipes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: recipeTitle.trim() }),
          })
          if (!res.ok) throw new Error('Failed to create recipe')
          const recipe = await res.json()
          setSuccess(true)
          toast.success('Recipe created')
          setTimeout(() => {
            handleOpenChange(false)
            router.push(`/recipes/${recipe.id}`)
          }, 800)
          break
        }
        case 'note': {
          if (!noteTitle.trim()) {
            toast.error('Note title is required')
            setSubmitting(false)
            return
          }
          const res = await fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: noteTitle.trim(),
              content: noteContent.trim(),
            }),
          })
          if (!res.ok) throw new Error('Failed to create note')
          setSuccess(true)
          toast.success('Note created')
          setTimeout(() => { handleOpenChange(false); router.refresh() }, 800)
          break
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong')
      setSubmitting(false)
    }
  }

  const actions: { id: QuickAction; label: string; icon: React.ReactNode; description: string }[] = [
    { id: 'event', label: 'Event', icon: <CalendarPlus className="h-5 w-5" />, description: 'Add a calendar event' },
    { id: 'list', label: 'List', icon: <ListPlus className="h-5 w-5" />, description: 'Create a shopping or to-do list' },
    { id: 'recipe', label: 'Recipe', icon: <ChefHat className="h-5 w-5" />, description: 'Add a new recipe' },
    { id: 'note', label: 'Note', icon: <StickyNote className="h-5 w-5" />, description: 'Write a quick note' },
  ]

  return (
    <>
      {/* Floating action button on mobile */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-50 md:hidden flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
        aria-label="Quick add"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Desktop quick-add button in the sidebar area */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:flex fixed bottom-4 left-3 z-50 items-center gap-2 px-3 py-2 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border border-border bg-background/80 backdrop-blur-sm"
        aria-label="Quick add"
      >
        <Plus className="h-3.5 w-3.5" />
        Quick Add
        <kbd className="ml-1 px-1 py-0.5 rounded bg-muted text-[10px] font-mono">
          ⌘K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {mode ? `New ${mode.charAt(0).toUpperCase() + mode.slice(1)}` : 'Quick Add'}
            </DialogTitle>
          </DialogHeader>

          {!mode ? (
            <div className="grid grid-cols-2 gap-3 py-2">
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => selectMode(action.id)}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:bg-accent hover:border-primary/50 transition-colors text-center"
                >
                  <span className="text-primary">{action.icon}</span>
                  <span className="text-sm font-medium">{action.label}</span>
                  <span className="text-xs text-muted-foreground">{action.description}</span>
                </button>
              ))}
            </div>
          ) : success ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                <Check className="h-6 w-6 text-green-500" />
              </div>
              <p className="text-sm font-medium">Created successfully!</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 py-2">
              {mode === 'event' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="qa-event-title">Event Title</Label>
                    <Input
                      ref={inputRef as any}
                      id="qa-event-title"
                      value={eventTitle}
                      onChange={(e) => setEventTitle(e.target.value)}
                      placeholder="e.g., Doctor's appointment"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="qa-event-date">Date</Label>
                    <Input
                      id="qa-event-date"
                      type="date"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}

              {mode === 'list' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="qa-list-name">List Name</Label>
                    <Input
                      ref={inputRef as any}
                      id="qa-list-name"
                      value={listName}
                      onChange={(e) => setListName(e.target.value)}
                      placeholder="e.g., Weekly groceries"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setListType('SHOPPING')}
                        className={`flex-1 px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                          listType === 'SHOPPING'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:bg-accent'
                        }`}
                      >
                        Shopping
                      </button>
                      <button
                        type="button"
                        onClick={() => setListType('TODO')}
                        className={`flex-1 px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                          listType === 'TODO'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:bg-accent'
                        }`}
                      >
                        To-Do
                      </button>
                    </div>
                  </div>
                </>
              )}

              {mode === 'recipe' && (
                <div className="space-y-2">
                  <Label htmlFor="qa-recipe-title">Recipe Title</Label>
                  <Input
                    ref={inputRef as any}
                    id="qa-recipe-title"
                    value={recipeTitle}
                    onChange={(e) => setRecipeTitle(e.target.value)}
                    placeholder="e.g., Spaghetti Bolognese"
                    required
                  />
                </div>
              )}

              {mode === 'note' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="qa-note-title">Note Title</Label>
                    <Input
                      ref={inputRef as any}
                      id="qa-note-title"
                      value={noteTitle}
                      onChange={(e) => setNoteTitle(e.target.value)}
                      placeholder="e.g., Shopping ideas"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="qa-note-content">Content (optional)</Label>
                    <textarea
                      id="qa-note-content"
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      placeholder="Write your note..."
                      rows={4}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  </div>
                </>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setMode(null)}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button type="submit" disabled={submitting} className="flex-1">
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
