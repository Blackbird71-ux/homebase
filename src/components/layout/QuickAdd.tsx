'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarPlus,
  ListPlus,
  ChefHat,
  StickyNote,
  Loader2,
  Check,
  DollarSign,
  ListChecks,
  ShoppingCart,
  CheckSquare,
  Utensils,
  Bot,
  HelpCircle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { sortedCategoryList } from '@/lib/finance-categories'

type QuickAction = 'event' | 'chore' | 'expense' | 'list-item' | 'shopping-list' | 'todo-list' | 'recipe' | 'meal' | 'note' | 'ai' | 'help'

interface ListMeta {
  id: string
  name: string
  type: 'SHOPPING' | 'TODO'
}

interface CategoryMeta {
  id: string
  name: string
  type: string
  parentId: string | null
}

const MEAL_TYPE_OPTIONS = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snacks', label: 'Snacks' },
]

const actions: { id: QuickAction; label: string; icon: React.ReactNode; description: string }[] = [
  { id: 'event',         label: 'Event',         icon: <CalendarPlus className="h-5 w-5" />,  description: 'Add a calendar event' },
  { id: 'chore',         label: 'Chore',         icon: <ListChecks className="h-5 w-5" />,    description: 'Add a new chore' },
  { id: 'expense',       label: 'Expense',       icon: <DollarSign className="h-5 w-5" />,    description: 'Log a transaction' },
  { id: 'list-item',     label: 'List Item',     icon: <ListPlus className="h-5 w-5" />,      description: 'Add to a list' },
  { id: 'shopping-list', label: 'Shopping List', icon: <ShoppingCart className="h-5 w-5" />,   description: 'New shopping list' },
  { id: 'todo-list',     label: 'To-Do List',    icon: <CheckSquare className="h-5 w-5" />,   description: 'New to-do list' },
  { id: 'recipe',        label: 'Recipe',        icon: <ChefHat className="h-5 w-5" />,       description: 'Add a recipe' },
  { id: 'meal',          label: 'Meal',          icon: <Utensils className="h-5 w-5" />,      description: 'Plan a meal' },
  { id: 'note',          label: 'Note',          icon: <StickyNote className="h-5 w-5" />,    description: 'Write a note' },
  { id: 'ai',            label: 'AI Assistant',  icon: <Bot className="h-5 w-5" />,           description: 'Voice or chat commands' },
  { id: 'help',          label: 'Help',           icon: <HelpCircle className="h-5 w-5" />,   description: 'How to use this page' },
]

function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function QuickAdd() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<QuickAction | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  // Shared form state
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayLocal())

  // Event-specific
  const [eventTitle, setEventTitle] = useState('')
  const [eventDate, setEventDate] = useState(todayLocal())

  // Chore-specific
  const [choreFrequency, setChoreFrequency] = useState('weekly')

  // Expense-specific — simple: amount, description, GL account to debit, date
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseDescription, setExpenseDescription] = useState('')
  const [expenseCategoryId, setExpenseCategoryId] = useState('')
  const [expenseGlAccountId, setExpenseGlAccountId] = useState('')
  const [categories, setCategories] = useState<CategoryMeta[]>([])
  const [glAccounts, setGLAccounts] = useState<{id: string; name: string; type: string}[]>([])

  // List-specific
  const [listName, setListName] = useState('')
  const [listType, setListType] = useState<'SHOPPING' | 'TODO'>('SHOPPING')

  // List item-specific
  const [listItemContent, setListItemContent] = useState('')
  const [selectedListId, setSelectedListId] = useState('')
  const [lists, setLists] = useState<ListMeta[]>([])

  // Recipe-specific
  const [recipeTitle, setRecipeTitle] = useState('')

  // Meal-specific
  const [mealType, setMealType] = useState('dinner')
  const [mealNote, setMealNote] = useState('')

  // Note-specific
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)

  // Keyboard shortcut: Cmd+K / Ctrl+K opens the dialog
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
      if (e.key === 'Escape' && open) setOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  // Listen for sidebar or FAB "quickadd" event to open dialog
  useEffect(() => {
    function handleSidebarOpen() { setOpen(true) }
    window.addEventListener('homebase:quickadd', handleSidebarOpen)
    return () => window.removeEventListener('homebase:quickadd', handleSidebarOpen)
  }, [])

  // Listen for quickadd-action event (from UniversalFAB mobile sheet)
  useEffect(() => {
    function handleQuickAddAction(e: Event) {
      const detail = (e as CustomEvent).detail
      if (detail?.action) {
        setOpen(true)
        selectMode(detail.action as QuickAction)
      }
    }
    window.addEventListener('homebase:quickadd-action', handleQuickAddAction)
    return () => window.removeEventListener('homebase:quickadd-action', handleQuickAddAction)
  }, [])

  // Focus input when mode changes
  useEffect(() => {
    if (mode && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [mode])

  // Fetch categories when expense mode is entered
  useEffect(() => {
    if (mode === 'expense' && categories.length === 0) {
      fetch('/api/finance/categories')
        .then((r) => r.json())
        .then((data: (CategoryMeta & { type: string })[]) => {
          setCategories(data)
          setGLAccounts(data.filter(c => c.type !== 'transfer' && ['asset','liability','equity','income','expense'].includes(c.type)))
        })
        .catch(() => { /* silently fail */ })
    }
  }, [mode, categories.length])

  // Fetch lists when list-item mode is entered
  useEffect(() => {
    if (mode === 'list-item' && lists.length === 0) {
      fetch('/api/lists')
        .then((r) => r.json())
        .then((data: ListMeta[]) => {
          setLists(data)
          if (data.length > 0) setSelectedListId(data[0].id)
        })
        .catch(() => { /* silently fail */ })
    }
  }, [mode, lists.length])

  const resetForm = useCallback(() => {
    setMode(null)
    setTitle('')
    setDate(todayLocal())
    setEventTitle('')
    setEventDate(todayLocal())
    setChoreFrequency('weekly')
    setExpenseAmount('')
    setExpenseDescription('')
    setExpenseCategoryId('')
    setExpenseGlAccountId('')
    setListName('')
    setListType('SHOPPING')
    setListItemContent('')
    setSelectedListId('')
    setRecipeTitle('')
    setMealType('dinner')
    setMealNote('')
    setNoteTitle('')
    setNoteContent('')
    setSubmitting(false)
    setSuccess(false)
  }, [])

  function handleOpenChange(newOpen: boolean) {
    setOpen(newOpen)
    if (!newOpen) resetForm()
  }

  function selectMode(m: QuickAction) {
    // AI and Help open their own dialogs — close QuickAdd and dispatch events
    if (m === 'ai' || m === 'help') {
      const eventName = m === 'ai' ? 'homebase:open-ai' : 'homebase:open-help'
      handleOpenChange(false)
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent(eventName))
      }, 200)
      return
    }

    setMode(m)
    if (m === 'event') setEventDate(todayLocal())
    if (m === 'meal' || m === 'expense') setDate(todayLocal())
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    try {
      switch (mode) {
        // ── Event ──
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

        // ── Chore ──
        case 'chore': {
          if (!title.trim()) {
            toast.error('Chore name is required')
            setSubmitting(false)
            return
          }
          const res = await fetch('/api/chores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title.trim(), frequency: choreFrequency }),
          })
          if (!res.ok) throw new Error('Failed to create chore')
          setSuccess(true)
          toast.success('Chore created')
          setTimeout(() => { handleOpenChange(false); router.refresh() }, 800)
          break
        }

        // ── Expense ──
        case 'expense': {
          if (!expenseAmount.trim()) {
            toast.error('Amount is required')
            setSubmitting(false)
            return
          }
          const amount = parseFloat(expenseAmount)
          if (isNaN(amount) || amount <= 0) {
            toast.error('Enter a valid amount')
            setSubmitting(false)
            return
          }
          const res = await fetch('/api/finance/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'expense',
              amount,
              description: expenseDescription.trim() || null,
              categoryId: expenseCategoryId || null,
              glAccountId: expenseGlAccountId || null,
              date: date ? new Date(date).toISOString() : new Date().toISOString(),
              isCleared: true,
            }),
          })
          if (!res.ok) throw new Error('Failed to log expense')
          setSuccess(true)
          toast.success('Expense logged')
          setTimeout(() => { handleOpenChange(false); router.refresh() }, 800)
          break
        }

        // ── List Item ──
        case 'list-item': {
          if (!selectedListId) {
            toast.error('Select a list')
            setSubmitting(false)
            return
          }
          if (!listItemContent.trim()) {
            toast.error('Item content is required')
            setSubmitting(false)
            return
          }
          const res = await fetch(`/api/lists/${selectedListId}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: listItemContent.trim() }),
          })
          if (!res.ok) throw new Error('Failed to add item')
          setSuccess(true)
          toast.success('Item added to list')
          setTimeout(() => { handleOpenChange(false); router.refresh() }, 800)
          break
        }

        // ── Shopping List ──
        case 'shopping-list': {
          if (!listName.trim()) {
            toast.error('List name is required')
            setSubmitting(false)
            return
          }
          const res = await fetch('/api/lists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: listName.trim(), type: 'SHOPPING' }),
          })
          if (!res.ok) throw new Error('Failed to create list')
          setSuccess(true)
          toast.success('Shopping list created')
          setTimeout(() => { handleOpenChange(false); router.refresh() }, 800)
          break
        }

        // ── To-Do List ──
        case 'todo-list': {
          if (!listName.trim()) {
            toast.error('List name is required')
            setSubmitting(false)
            return
          }
          const res = await fetch('/api/lists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: listName.trim(), type: 'TODO' }),
          })
          if (!res.ok) throw new Error('Failed to create list')
          setSuccess(true)
          toast.success('To-do list created')
          setTimeout(() => { handleOpenChange(false); router.refresh() }, 800)
          break
        }

        // ── Recipe ──
        case 'recipe': {
          if (!recipeTitle.trim()) {
            toast.error('Recipe title is required')
            setSubmitting(false)
            return
          }
          const res = await fetch('/api/recipes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: recipeTitle.trim(), ingredients: [], instructions: [] }),
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

        // ── Meal ──
        case 'meal': {
          if (!date || !mealType) {
            toast.error('Date and meal type are required')
            setSubmitting(false)
            return
          }
          if (!mealNote.trim()) {
            toast.error('Enter what you\'re having')
            setSubmitting(false)
            return
          }
          const res = await fetch('/api/meal-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, mealType, note: mealNote.trim() }),
          })
          if (!res.ok) throw new Error('Failed to add meal')
          setSuccess(true)
          toast.success('Meal added')
          setTimeout(() => { handleOpenChange(false); router.refresh() }, 800)
          break
        }

        // ── Note ──
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      toast.error(message)
      setSubmitting(false)
    }
  }

  function renderForm() {
    if (!mode) return null

    if (success) {
      return (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
            <Check className="h-6 w-6 text-green-500" />
          </div>
          <p className="text-sm font-medium">Created successfully!</p>
        </div>
      )
    }

    return (
      <form onSubmit={handleSubmit} className="space-y-4 py-2">
        {/* Event form */}
        {mode === 'event' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="qa-event-title">Event Title</Label>
              <Input
                ref={inputRef as React.Ref<HTMLInputElement>}
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

        {/* Chore form */}
        {mode === 'chore' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="qa-chore-title">Chore Name</Label>
              <Input
                ref={inputRef as React.Ref<HTMLInputElement>}
                id="qa-chore-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Vacuum lounge"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qa-chore-freq">Frequency</Label>
              <Select value={choreFrequency} onValueChange={(v) => v && setChoreFrequency(v)}>
                <SelectTrigger id="qa-chore-freq">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Bi-weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {/* Expense form — simple: amount, description, GL account, date */}
        {mode === 'expense' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="qa-expense-amount">Amount ($)</Label>
              <Input
                ref={inputRef as React.Ref<HTMLInputElement>}
                id="qa-expense-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                placeholder="e.g., 29.99"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qa-expense-date">Date</Label>
              <Input
                id="qa-expense-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qa-expense-desc">Description</Label>
              <Input
                id="qa-expense-desc"
                value={expenseDescription}
                onChange={(e) => setExpenseDescription(e.target.value)}
                placeholder="e.g., Weekly groceries"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qa-expense-cat">Category <span className="text-destructive">*</span></Label>
              <select
                id="qa-expense-cat"
                value={expenseCategoryId}
                onChange={e => setExpenseCategoryId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              >
                <option value="">Select category…</option>
                {sortedCategoryList(categories.filter(c => c.type === 'expense')).map(c => (
                  <option key={c.id} value={c.id}>
                    {c.parentId ? `\u2014 ${c.name}` : c.name}
                  </option>
                ))}
              </select>
              {!expenseCategoryId && (
                <p className="text-[11px] text-amber-500">⚠ Without a category this will show as Uncategorised on P&L</p>
              )}
            </div>
          </>
        )}

        {/* List Item form */}
        {mode === 'list-item' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="qa-listitem-list">List</Label>
              {lists.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lists found. Create one first.</p>
              ) : (
                <Select value={selectedListId} onValueChange={(v) => v && setSelectedListId(v)}>
                  <SelectTrigger id="qa-listitem-list">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {lists.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name} ({l.type === 'SHOPPING' ? 'Shopping' : 'To-Do'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="qa-listitem-content">Item</Label>
              <Input
                ref={inputRef as React.Ref<HTMLInputElement>}
                id="qa-listitem-content"
                value={listItemContent}
                onChange={(e) => setListItemContent(e.target.value)}
                placeholder="e.g., Milk, eggs, bread"
                required
              />
            </div>
          </>
        )}

        {/* Shopping / To-Do List form */}
        {(mode === 'shopping-list' || mode === 'todo-list') && (
          <>
            <div className="space-y-2">
              <Label htmlFor="qa-list-name">List Name</Label>
              <Input
                ref={inputRef as React.Ref<HTMLInputElement>}
                id="qa-list-name"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder={mode === 'shopping-list' ? 'e.g., Weekly groceries' : 'e.g., Weekend tasks'}
                required
              />
            </div>
            {mode === 'shopping-list' && (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                Creating a shopping list
              </div>
            )}
            {mode === 'todo-list' && (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                Creating a to-do list
              </div>
            )}
          </>
        )}

        {/* Recipe form */}
        {mode === 'recipe' && (
          <div className="space-y-2">
            <Label htmlFor="qa-recipe-title">Recipe Title</Label>
            <Input
              ref={inputRef as React.Ref<HTMLInputElement>}
              id="qa-recipe-title"
              value={recipeTitle}
              onChange={(e) => setRecipeTitle(e.target.value)}
              placeholder="e.g., Spaghetti Bolognese"
              required
            />
          </div>
        )}

        {/* Meal form */}
        {mode === 'meal' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="qa-meal-date">Date</Label>
              <Input
                id="qa-meal-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Meal</Label>
              <div className="grid grid-cols-4 gap-1">
                {MEAL_TYPE_OPTIONS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMealType(m.value)}
                    className={`px-2 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      mealType === m.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="qa-meal-note">What's on the menu?</Label>
              <Input
                ref={inputRef as React.Ref<HTMLInputElement>}
                id="qa-meal-note"
                value={mealNote}
                onChange={(e) => setMealNote(e.target.value)}
                placeholder="e.g., Spaghetti Bolognese"
                required
              />
            </div>
          </>
        )}

        {/* Note form */}
        {mode === 'note' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="qa-note-title">Note Title</Label>
              <Input
                ref={inputRef as React.Ref<HTMLInputElement>}
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
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode ? `New ${mode.charAt(0).toUpperCase() + mode.slice(1).replace('-', ' ')}` : 'Quick Add'}
          </DialogTitle>
        </DialogHeader>

        {!mode ? (
          <div className="grid grid-cols-3 gap-3 py-2">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => selectMode(action.id)}
                className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border hover:bg-accent hover:border-primary/50 transition-colors text-center"
              >
                <span className="text-primary">{action.icon}</span>
                <span className="text-xs font-medium leading-tight">{action.label}</span>
              </button>
            ))}
          </div>
        ) : (
          renderForm()
        )}
      </DialogContent>
    </Dialog>
  )
}
