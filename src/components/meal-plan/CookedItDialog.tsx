'use client'

import { useState, useEffect } from 'react'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface SuggestedItem {
  id: string
  name: string
  location: string
  status: string
}

const LOCATION_EMOJI: Record<string, string> = {
  pantry: '🥫',
  fridge: '🧊',
  freezer: '❄️',
}

export interface CookedItDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recipeIds: string[]
}

// Suggest-and-confirm pantry depletion after cooking a meal: fuzzy-matched
// pantry items from the recipes' ingredients, user taps Low/Out per item,
// applied via the existing PATCH /api/pantry/[id].
export function CookedItDialog({ open, onOpenChange, recipeIds }: CookedItDialogProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving'>('loading')
  const [items, setItems] = useState<SuggestedItem[]>([])
  const [selections, setSelections] = useState<Map<string, 'low' | 'out'>>(new Map())

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setStatus('loading')
    setItems([])
    setSelections(new Map())

    fetch('/api/pantry/cooked-suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipeIds }),
      signal: controller.signal,
    })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((data: { items: SuggestedItem[] }) => {
        setItems(data.items)
        setStatus('ready')
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        onOpenChange(false)
        toast.error('Failed to load pantry suggestions')
      })

    return () => controller.abort()
  }, [open, recipeIds]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleSelection(id: string, target: 'low' | 'out') {
    setSelections(prev => {
      const next = new Map(prev)
      if (next.get(id) === target) next.delete(id)
      else next.set(id, target)
      return next
    })
  }

  async function apply() {
    setStatus('saving')
    const updates = [...selections.entries()]
    const results = await Promise.all(
      updates.map(([id, newStatus]) =>
        fetch(`/api/pantry/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        }).then(r => r.ok).catch(() => false)
      )
    )
    const failed = results.filter(ok => !ok).length
    onOpenChange(false)
    if (failed > 0) {
      toast.error(`${failed} pantry item${failed !== 1 ? 's' : ''} could not be updated`)
    } else {
      toast.success(`Pantry updated — ${updates.length} item${updates.length !== 1 ? 's' : ''} marked low or out`)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="sm:max-w-[480px]" showCloseButton={true}>
        <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
          <DrawerTitle>Cooked it — update pantry</DrawerTitle>
          {status !== 'loading' && items.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              Tap what you used up. Untouched items stay as they are.
            </p>
          )}
        </DrawerHeader>

        {status === 'loading' ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            Checking the pantry…
          </div>
        ) : items.length === 0 ? (
          <div className="flex-1 px-4 py-8 text-center text-sm text-muted-foreground">
            No pantry items matched this meal&apos;s ingredients.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
            {items.map(item => {
              const selected = selections.get(item.id)
              return (
                <div key={item.id} className="flex items-center gap-2 py-1.5">
                  <span className="text-sm shrink-0">{LOCATION_EMOJI[item.location] ?? '🥫'}</span>
                  <span className="flex-1 text-sm min-w-0 truncate">{item.name}</span>
                  {item.status !== 'stocked' && !selected && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      already {item.status}
                    </span>
                  )}
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleSelection(item.id, 'low')}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                        selected === 'low'
                          ? 'bg-amber-400 border-amber-400 text-black'
                          : 'hb-pill-inactive'
                      )}
                    >
                      Low
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSelection(item.id, 'out')}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                        selected === 'out'
                          ? 'bg-red-500 border-red-500 text-white'
                          : 'hb-pill-inactive'
                      )}
                    >
                      Out
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <DrawerFooter className="border-t border-border">
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={status === 'saving'}>
              {items.length === 0 && status === 'ready' ? 'Close' : 'Cancel'}
            </Button>
            {items.length > 0 && (
              <Button onClick={apply} disabled={status !== 'ready' || selections.size === 0}>
                {status === 'saving' ? 'Updating…' : `Update pantry${selections.size > 0 ? ` (${selections.size})` : ''}`}
              </Button>
            )}
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
