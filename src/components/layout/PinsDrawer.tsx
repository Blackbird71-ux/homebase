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
import { MAX_PINS, pinKey, type Pin } from '@/lib/mobile-pins'

export interface PinnablePage {
  href: string
  label: string
}

export interface PinnableList {
  id: string
  name: string
  type: string
}

interface PinsDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pins: Pin[]
  pages: PinnablePage[]
  lists: PinnableList[]
  onSaved: (pins: Pin[]) => void
}

export function PinsDrawer({ open, onOpenChange, pins, pages, lists, onSaved }: PinsDrawerProps) {
  const [draft, setDraft] = useState<Pin[]>(pins)
  const [saving, setSaving] = useState(false)

  // Re-seed whenever the drawer opens so cancelled edits don't linger
  useEffect(() => {
    if (open) setDraft(pins)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function labelFor(pin: Pin): string {
    if (pin.type === 'page') return pages.find((p) => p.href === pin.href)?.label ?? pin.href
    return lists.find((l) => l.id === pin.id)?.name ?? 'List (unavailable)'
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= draft.length) return
    const next = [...draft]
    ;[next[index], next[target]] = [next[target], next[index]]
    setDraft(next)
  }

  const pinned = new Set(draft.map(pinKey))
  const full = draft.length >= MAX_PINS

  function add(pin: Pin) {
    if (!full && !pinned.has(pinKey(pin))) setDraft([...draft, pin])
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uiPreferences: { mobilePins: draft } }),
      })
      if (res.ok) {
        onSaved(draft)
        toast.success('Pins saved')
        onOpenChange(false)
      } else {
        toast.error('Failed to save pins')
      }
    } finally {
      setSaving(false)
    }
  }

  const addButton = (key: string, label: string, pin: Pin, hint?: string) => (
    <button
      key={key}
      type="button"
      disabled={full || pinned.has(pinKey(pin))}
      onClick={() => add(pin)}
      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm text-left hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <PlusIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="truncate flex-1">{label}</span>
      {hint && <span className="text-xs text-muted-foreground shrink-0">{hint}</span>}
    </button>
  )

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="sm:max-w-[480px]" showCloseButton={true}>
        <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
          <DrawerTitle>Pinned shortcuts</DrawerTitle>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-5">
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Your pins ({draft.length}/{MAX_PINS})
            </p>
            {draft.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing pinned yet. Add lists or pages below.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {draft.map((pin, i) => (
                  <li key={pinKey(pin)} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-border">
                    <span className="flex-1 min-w-0 truncate text-sm">{labelFor(pin)}</span>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="p-1 rounded text-muted-foreground hover:bg-muted disabled:opacity-30">
                      <ArrowUpIcon className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === draft.length - 1} aria-label="Move down" className="p-1 rounded text-muted-foreground hover:bg-muted disabled:opacity-30">
                      <ArrowDownIcon className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setDraft(draft.filter((p) => pinKey(p) !== pinKey(pin)))} aria-label={`Unpin ${labelFor(pin)}`} className="p-1 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                      <XIcon className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {full && <p className="text-xs text-muted-foreground mt-2">Maximum of {MAX_PINS} pins — remove one to add another.</p>}
          </section>

          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Lists</p>
            {lists.length === 0 ? (
              <p className="text-sm text-muted-foreground">No lists available.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {lists.map((l) => addButton(`l-${l.id}`, l.name, { type: 'list', id: l.id }, l.type === 'SHOPPING' ? 'Shopping' : 'Todo'))}
              </div>
            )}
          </section>

          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pages</p>
            <div className="flex flex-col gap-1.5">
              {pages.map((p) => addButton(`p-${p.href}`, p.label, { type: 'page', href: p.href }))}
            </div>
          </section>
        </div>
        <DrawerFooter className="px-4 py-3 border-t border-border shrink-0 flex-col sm:flex-row gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
