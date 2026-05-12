'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarPlus, ListPlus, ChefHat, StickyNote,
  Check, DollarSign, ListChecks, ShoppingCart,
  CheckSquare, Utensils, Bot, HelpCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EventForm }        from './quick-add/EventForm'
import { ChoreForm }        from './quick-add/ChoreForm'
import { ExpenseForm }      from './quick-add/ExpenseForm'
import { ListItemForm }     from './quick-add/ListItemForm'
import { ShoppingListForm } from './quick-add/ShoppingListForm'
import { TodoListForm }     from './quick-add/TodoListForm'
import { RecipeForm }       from './quick-add/RecipeForm'
import { MealForm }         from './quick-add/MealForm'
import { NoteForm }         from './quick-add/NoteForm'
import type { QuickAction, QuickAddFormProps } from './quick-add/types'

const FORM_REGISTRY: Partial<Record<QuickAction, React.ComponentType<QuickAddFormProps>>> = {
  'event':         EventForm,
  'chore':         ChoreForm,
  'expense':       ExpenseForm,
  'list-item':     ListItemForm,
  'shopping-list': ShoppingListForm,
  'todo-list':     TodoListForm,
  'recipe':        RecipeForm,
  'meal':          MealForm,
  'note':          NoteForm,
}

const actions: { id: QuickAction; label: string; icon: React.ReactNode }[] = [
  { id: 'event',         label: 'Event',         icon: <CalendarPlus className="h-5 w-5" /> },
  { id: 'chore',         label: 'Chore',         icon: <ListChecks className="h-5 w-5" /> },
  { id: 'expense',       label: 'Expense',       icon: <DollarSign className="h-5 w-5" /> },
  { id: 'list-item',     label: 'List Item',     icon: <ListPlus className="h-5 w-5" /> },
  { id: 'shopping-list', label: 'Shopping List', icon: <ShoppingCart className="h-5 w-5" /> },
  { id: 'todo-list',     label: 'To-Do List',    icon: <CheckSquare className="h-5 w-5" /> },
  { id: 'recipe',        label: 'Recipe',        icon: <ChefHat className="h-5 w-5" /> },
  { id: 'meal',          label: 'Meal',          icon: <Utensils className="h-5 w-5" /> },
  { id: 'note',          label: 'Note',          icon: <StickyNote className="h-5 w-5" /> },
  { id: 'ai',            label: 'AI Assistant',  icon: <Bot className="h-5 w-5" /> },
  { id: 'help',          label: 'Help',          icon: <HelpCircle className="h-5 w-5" /> },
]

export function QuickAdd() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<QuickAction | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape' && open) setOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  useEffect(() => {
    function handleSidebarOpen() { setOpen(true) }
    window.addEventListener('homebase:quickadd', handleSidebarOpen)
    return () => window.removeEventListener('homebase:quickadd', handleSidebarOpen)
  }, [])

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

  function handleOpenChange(newOpen: boolean) {
    setOpen(newOpen)
    if (!newOpen) { setMode(null); setSuccess(false) }
  }

  function selectMode(m: QuickAction) {
    if (m === 'ai' || m === 'help') {
      handleOpenChange(false)
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent(m === 'ai' ? 'homebase:open-ai' : 'homebase:open-help'))
      }, 200)
      return
    }
    setMode(m)
  }

  function onSuccess(message: string, navigate?: () => void) {
    setSuccess(true)
    toast.success(message)
    setTimeout(() => {
      handleOpenChange(false)
      if (navigate) navigate()
      else router.refresh()
    }, 800)
  }

  const modeLabel = mode
    ? `New ${mode.charAt(0).toUpperCase() + mode.slice(1).replace('-', ' ')}`
    : 'Quick Add'

  const FormComponent = mode ? FORM_REGISTRY[mode] : undefined

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{modeLabel}</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
              <Check className="h-6 w-6 text-green-500" />
            </div>
            <p className="text-sm font-medium">Created successfully!</p>
          </div>
        ) : !mode ? (
          <div className="grid grid-cols-3 gap-3 py-2">
            {actions.map(action => (
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
        ) : FormComponent ? (
          <FormComponent onSuccess={onSuccess} onBack={() => setMode(null)} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
