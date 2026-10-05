'use client'

import { useState, useEffect } from 'react'
import { ArrowUpIcon, ArrowDownIcon, XIcon, PlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import type { QuickAddId } from '@/lib/mobile-quick-adds'

export interface QuickAddOption {
  id: QuickAddId
  label: string
}

interface QuickAddDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Every available action, in default order */
  options: QuickAddOption[]
  /** Current choice; null = not customised (everything shown) */
  chosen: QuickAddId[] | null
  onSaved: (chosen: QuickAddId[] | null) => void
}

export function QuickAddDrawer({ open, onOpenChange, options, chosen, onSaved }: QuickAddDrawerProps) {
  const [draft, setDraft] = useState<QuickAddId[]>([])
  const [saving, setSaving] = useState(false)

  // Re-seed whenever the drawer opens so cancelled edits don't linger.
  // Not customised yet → start from the full default list.
  useEffect(() => {
    if (open) setDraft(chosen ?? options.map((o) => o.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const labelFor = (id: QuickAddId) => options.find((o) => o.id === id)?.label ?? id
  const hidden = options.filter((o) => !draft.includes(o.id))

  function move(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= draft.length) return
    const next = [...draft]
    ;[next[index], next[target]] = [next[target], next[index]]
    setDraft(next)
  }

  async function save(value: QuickAddId[] | null) {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uiPreferences: { mobileQuickAdds: value } }),
      })
      if (res.ok) {
        onSaved(value)
        toast.success(value === null ? 'Quick Add reset' : 'Quick Add saved')
        onOpenChange(false)
      } else {
        toast.error('Failed to save Quick Add')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="sm:max-w-[480px]" showCloseButton={true}>
        <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
          <DrawerTitle>Customise Quick Add</DrawerTitle>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-5">
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Shown first ({draft.length})
            </p>
            {draft.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing chosen — everything will sit under “More”.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {draft.map((id, i) => (
                  <li key={id} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-border">
                    <span className="flex-1 min-w-0 truncate text-sm">{labelFor(id)}</span>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="p-1 rounded text-muted-foreground hover:bg-muted disabled:opacity-30">
                      <ArrowUpIcon className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === draft.length - 1} aria-label="Move down" className="p-1 rounded text-muted-foreground hover:bg-muted disabled:opacity-30">
                      <ArrowDownIcon className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setDraft(draft.filter((d) => d !== id))} aria-label={`Move ${labelFor(id)} to More`} className="p-1 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                      <XIcon className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Under “More”</p>
            {hidden.length === 0 ? (
              <p className="text-sm text-muted-foreground">Every action is shown up-front.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {hidden.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setDraft([...draft, o.id])}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm text-left hover:bg-accent"
                  >
                    <PlusIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate flex-1">{o.label}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
        <DrawerFooter className="px-4 py-3 border-t border-border shrink-0 flex-col sm:flex-row gap-2">
          <Button type="button" variant="ghost" onClick={() => save(null)} disabled={saving || chosen === null}>Reset to default</Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={() => save(draft)} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
