'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Home, Calendar, ListChecks, Utensils, ChefHat, CheckSquare, DollarSign,
  Users, FileText, Plane, StickyNote, Gift, Wrench, Settings, Shield,
  Search, CornerDownLeft, Plus, Loader2, ShoppingBasket, PiggyBank,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { SearchResult, SearchResultType } from '@/lib/global-search'

interface PageEntry {
  label: string
  url: string
  icon: React.ReactNode
}

interface QuickAction {
  id: string
  label: string
}

// Same actions as QuickAdd's grid — selecting one dispatches
// homebase:quickadd-action, which QuickAdd already listens for.
const quickActions: QuickAction[] = [
  { id: 'event',         label: 'Event' },
  { id: 'chore',         label: 'Chore' },
  { id: 'expense',       label: 'Expense' },
  { id: 'list-item',     label: 'List Item' },
  { id: 'shopping-list', label: 'Shopping List' },
  { id: 'todo-list',     label: 'To-Do List' },
  { id: 'recipe',        label: 'Recipe' },
  { id: 'meal',          label: 'Meal' },
  { id: 'note',          label: 'Note' },
  { id: 'ai',            label: 'AI Assistant' },
]

const RESULT_GROUPS: { type: SearchResultType; label: string; icon: React.ReactNode }[] = [
  { type: 'recipe',   label: 'Recipes',     icon: <ChefHat className="h-4 w-4" /> },
  { type: 'note',     label: 'Notes',       icon: <StickyNote className="h-4 w-4" /> },
  { type: 'contact',  label: 'Contacts',    icon: <Users className="h-4 w-4" /> },
  { type: 'document', label: 'Documents',   icon: <FileText className="h-4 w-4" /> },
  { type: 'event',    label: 'Events',      icon: <Calendar className="h-4 w-4" /> },
  { type: 'list',     label: 'Lists',       icon: <ListChecks className="h-4 w-4" /> },
  { type: 'trip',     label: 'Trips',       icon: <Plane className="h-4 w-4" /> },
  { type: 'asset',    label: 'Maintenance', icon: <Wrench className="h-4 w-4" /> },
]

type PaletteItem =
  | { kind: 'page'; page: PageEntry }
  | { kind: 'result'; result: SearchResult }
  | { kind: 'action'; action: QuickAction }

export function CommandPalette({ isAdmin = false, hideFinanceModule = false }: { isAdmin?: boolean; hideFinanceModule?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // base-ui keeps the popup mounted across open/close, so autoFocus only fires
  // on first mount — focus explicitly on every open instead
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [open])

  const pages: PageEntry[] = [
    { label: 'Home',           url: '/home',           icon: <Home className="h-4 w-4" /> },
    { label: 'Calendar',       url: '/calendar',       icon: <Calendar className="h-4 w-4" /> },
    { label: 'Lists',          url: '/lists',          icon: <ListChecks className="h-4 w-4" /> },
    { label: 'Meal Plan',      url: '/meal-plan',      icon: <Utensils className="h-4 w-4" /> },
    { label: 'Recipes',        url: '/recipes',        icon: <ChefHat className="h-4 w-4" /> },
    { label: 'Pantry',         url: '/pantry',         icon: <ShoppingBasket className="h-4 w-4" /> },
    { label: 'Chores',         url: '/chores',         icon: <CheckSquare className="h-4 w-4" /> },
    ...(!hideFinanceModule ? [{ label: 'Finance', url: '/finance', icon: <DollarSign className="h-4 w-4" /> }] : []),
    { label: 'Contacts',       url: '/contacts',       icon: <Users className="h-4 w-4" /> },
    { label: 'Documents',      url: '/documents',      icon: <FileText className="h-4 w-4" /> },
    { label: 'Trips',          url: '/trips',          icon: <Plane className="h-4 w-4" /> },
    { label: 'Notes',          url: '/notes',          icon: <StickyNote className="h-4 w-4" /> },
    { label: 'Wishlist',       url: '/wishlists',      icon: <Gift className="h-4 w-4" /> },
    { label: 'Pocket Money',   url: '/pocket-money',   icon: <PiggyBank className="h-4 w-4" /> },
    { label: 'Maintenance',    url: '/maintenance',    icon: <Wrench className="h-4 w-4" /> },
    { label: 'Settings',       url: '/settings',       icon: <Settings className="h-4 w-4" /> },
    ...(isAdmin ? [{ label: 'Admin', url: '/admin', icon: <Shield className="h-4 w-4" /> }] : []),
  ]

  const createMode = query.startsWith('>')
  const term = (createMode ? query.slice(1) : query).trim()

  // ⌘K / Ctrl+K toggles the palette (sole owner of this shortcut)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Sidebar Search button
  useEffect(() => {
    function handleOpen() { setOpen(true) }
    window.addEventListener('homebase:command-palette', handleOpen)
    return () => window.removeEventListener('homebase:command-palette', handleOpen)
  }, [])

  // Debounced server search
  useEffect(() => {
    if (createMode || term.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        if (res.ok) {
          const data = await res.json()
          setResults(data.results ?? [])
        }
        setLoading(false)
      } catch {
        // aborted or network error — keep previous results
      }
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [term, createMode])

  // Build the flat, keyboard-navigable item list
  const items: PaletteItem[] = []
  if (createMode) {
    const filtered = term
      ? quickActions.filter(a => a.label.toLowerCase().includes(term.toLowerCase()))
      : quickActions
    items.push(...filtered.map((action): PaletteItem => ({ kind: 'action', action })))
  } else {
    const matchedPages = term
      ? pages.filter(p => p.label.toLowerCase().includes(term.toLowerCase()))
      : pages
    items.push(...matchedPages.map((page): PaletteItem => ({ kind: 'page', page })))
    // Order results to match the grouped render order so keyboard selection
    // (flat index) and the rendered rows always line up
    const orderedResults = RESULT_GROUPS.flatMap(g => results.filter(r => r.type === g.type))
    items.push(...orderedResults.map((result): PaletteItem => ({ kind: 'result', result })))
  }

  // Clamp/reset selection when the list changes
  useEffect(() => { setSelected(0) }, [query, results.length])

  function handleOpenChange(newOpen: boolean) {
    setOpen(newOpen)
    if (!newOpen) {
      setQuery('')
      setResults([])
      setSelected(0)
    }
  }

  function execute(item: PaletteItem) {
    handleOpenChange(false)
    if (item.kind === 'page') {
      router.push(item.page.url)
    } else if (item.kind === 'result') {
      router.push(item.result.url)
    } else {
      // Hand off to QuickAdd after the close animation
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('homebase:quickadd-action', { detail: { action: item.action.id } }))
      }, 200)
    }
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected(prev => Math.min(prev + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && items[selected]) {
      e.preventDefault()
      execute(items[selected])
    }
  }

  // Keep the selected row visible
  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  // Render helpers — rows carry their flat index for selection state
  let flatIndex = -1
  function row(item: PaletteItem, icon: React.ReactNode, title: string, subtitle?: string) {
    flatIndex += 1
    const idx = flatIndex
    return (
      <button
        key={`${item.kind}-${idx}`}
        type="button"
        data-selected={idx === selected}
        onClick={() => execute(item)}
        onMouseMove={() => setSelected(idx)}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left text-sm transition-colors ${
          idx === selected ? 'bg-accent text-accent-foreground' : ''
        }`}
      >
        <span className="text-muted-foreground shrink-0">{icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block truncate font-medium">{title}</span>
          {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
        </span>
        {idx === selected && <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
      </button>
    )
  }

  const pageItems = items.filter(i => i.kind === 'page')
  const actionItems = items.filter(i => i.kind === 'action')

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 top-[20%] translate-y-0" showCloseButton={false}>
        <DialogTitle className="sr-only">Search and commands</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-3">
          {loading
            ? <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />
            : <Search className="h-4 w-4 text-muted-foreground shrink-0" />}
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search, or type > to create…"
            className="flex-1 h-12 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {createMode ? (
            <>
              <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground">Create new</p>
              {actionItems.map(item =>
                item.kind === 'action' ? row(item, <Plus className="h-4 w-4" />, item.action.label) : null
              )}
              {actionItems.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matching actions</p>
              )}
            </>
          ) : (
            <>
              {pageItems.length > 0 && (
                <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground">Go to</p>
              )}
              {pageItems.map(item =>
                item.kind === 'page' ? row(item, item.page.icon, item.page.label) : null
              )}
              {RESULT_GROUPS.map(group => {
                const groupItems = items.filter(
                  (i): i is Extract<PaletteItem, { kind: 'result' }> =>
                    i.kind === 'result' && i.result.type === group.type
                )
                if (groupItems.length === 0) return null
                return (
                  <div key={group.type}>
                    <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground">{group.label}</p>
                    {groupItems.map(item => row(item, group.icon, item.result.title, item.result.subtitle))}
                  </div>
                )
              })}
              {term.length >= 2 && !loading && results.length === 0 && pageItems.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">No results for “{term}”</p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
