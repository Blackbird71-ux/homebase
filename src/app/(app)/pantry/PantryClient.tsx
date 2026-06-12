'use client'

import { useState } from 'react'
import { PlusIcon, BarcodeIcon, ShoppingBasketIcon, Trash2Icon, PencilIcon, ClipboardCheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { BarcodeScanner } from '@/components/lists/BarcodeScanner'
import {
  type PantryItemShape,
  type PantryStatus,
  type PantryLocation,
  PANTRY_LOCATIONS,
  nextPantryStatus,
} from '@/lib/pantry-helpers'

const LOCATION_LABELS: Record<PantryLocation, string> = {
  pantry: '🥫 Pantry',
  fridge: '🧊 Fridge',
  freezer: '❄️ Freezer',
}

const STATUS_META: Record<PantryStatus, { label: string; dot: string }> = {
  stocked: { label: 'Stocked', dot: 'bg-emerald-500' },
  low: { label: 'Running low', dot: 'bg-amber-400' },
  out: { label: 'Out', dot: 'bg-red-500' },
}

const emptyEditForm = {
  name: '', location: 'pantry' as PantryLocation, status: 'stocked' as PantryStatus,
  isStaple: true, expiryDate: '',
}

function fmtExpiry(iso: string | null): string {
  if (!iso) return ''
  // Expiry dates are stored as UTC midnight of the calendar date (via
  // <input type="date">), so display in UTC to render the exact day.
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

interface Props {
  initialItems: PantryItemShape[]
}

export function PantryClient({ initialItems }: Props) {
  const [items, setItems] = useState<PantryItemShape[]>(initialItems)
  const [stocktake, setStocktake] = useState(false)

  // Add form
  const [addName, setAddName] = useState('')
  const [addLocation, setAddLocation] = useState<PantryLocation>('pantry')
  const [adding, setAdding] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  // Scanned code with no known product — taught on next successful add
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null)
  const [resolvingBarcode, setResolvingBarcode] = useState(false)

  // Edit drawer
  const [editItem, setEditItem] = useState<PantryItemShape | null>(null)
  const [editForm, setEditForm] = useState(emptyEditForm)
  const [savingEdit, setSavingEdit] = useState(false)

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null)

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    const name = addName.trim()
    if (!name || adding) return
    setAdding(true)
    try {
      const res = await fetch('/api/pantry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, location: addLocation }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to add item')
        return
      }
      setItems(prev => [...prev, { ...data, expiryDate: data.expiryDate ?? null }])
      if (pendingBarcode) {
        await fetch(`/api/pantry/barcode/${pendingBarcode}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productName: name }),
        })
        toast.success(`Added — and I'll remember that barcode as "${name}"`)
        setPendingBarcode(null)
      }
      setAddName('')
    } catch { toast.error('Failed to add item') }
    finally { setAdding(false) }
  }

  async function onBarcodeDetected(code: string) {
    setShowScanner(false)
    setPendingBarcode(null)
    setResolvingBarcode(true)
    try {
      const res = await fetch(`/api/pantry/barcode/${code}`)
      if (res.ok) {
        const data = await res.json()
        setAddName(data.productName)
        toast.success(`Recognised: ${data.productName}`)
      } else {
        setPendingBarcode(code)
        toast.info('Unknown barcode — type the name once and it\'ll be remembered')
      }
    } catch { toast.error('Barcode lookup failed') }
    finally { setResolvingBarcode(false) }
  }

  async function patchItem(id: string, patch: Partial<PantryItemShape>): Promise<boolean> {
    try {
      const res = await fetch(`/api/pantry/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Failed to update')
        return false
      }
      return true
    } catch { toast.error('Failed to update'); return false }
  }

  // Optimistic status change; revert on failure
  async function setStatus(item: PantryItemShape, status: PantryStatus) {
    if (item.status === status) return
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status } : i))
    const ok = await patchItem(item.id, { status })
    if (!ok) setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: item.status } : i))
  }

  function openEdit(item: PantryItemShape) {
    setEditItem(item)
    setEditForm({
      name: item.name,
      location: item.location,
      status: item.status,
      isStaple: item.isStaple,
      expiryDate: item.expiryDate ? item.expiryDate.slice(0, 10) : '',
    })
  }

  async function saveEdit() {
    if (!editItem || savingEdit) return
    if (!editForm.name.trim()) { toast.error('Name is required'); return }
    setSavingEdit(true)
    try {
      const patch = {
        name: editForm.name.trim(),
        location: editForm.location,
        status: editForm.status,
        isStaple: editForm.isStaple,
        expiryDate: editForm.expiryDate || null,
      }
      const ok = await patchItem(editItem.id, patch as Partial<PantryItemShape>)
      if (ok) {
        setItems(prev => prev.map(i => i.id === editItem.id
          ? { ...i, ...patch, expiryDate: patch.expiryDate ? new Date(patch.expiryDate).toISOString() : null }
          : i))
        setEditItem(null)
      }
    } finally { setSavingEdit(false) }
  }

  async function deleteItem() {
    if (!deleteId) return
    try {
      const res = await fetch(`/api/pantry/${deleteId}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to delete'); return }
      setItems(prev => prev.filter(i => i.id !== deleteId))
    } catch { toast.error('Failed to delete') }
    finally { setDeleteId(null) }
  }

  const lowOrOut = items.filter(i => i.status !== 'stocked')

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ShoppingBasketIcon className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Pantry</h1>
          {lowOrOut.length > 0 && !stocktake && (
            <span className="text-xs text-muted-foreground">{lowOrOut.length} low or out</span>
          )}
        </div>
        <Button size="sm" variant={stocktake ? 'default' : 'outline'} onClick={() => setStocktake(v => !v)}>
          <ClipboardCheckIcon className="h-4 w-4 mr-1" /> {stocktake ? 'Done' : 'Stocktake'}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 flex flex-col gap-3">
        {!stocktake && (
          <div className="flex flex-col gap-2">
            <form onSubmit={addItem} className="flex gap-2 items-center">
              <Input
                value={addName}
                onChange={e => setAddName(e.target.value)}
                placeholder={resolvingBarcode ? 'Looking up barcode...' : pendingBarcode ? 'Name this product...' : 'Add item...'}
                className="flex-1 min-w-0"
              />
              <select
                value={addLocation}
                onChange={e => setAddLocation(e.target.value as PantryLocation)}
                className="w-28 shrink-0 h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
              >
                {PANTRY_LOCATIONS.map(loc => <option key={loc} value={loc}>{LOCATION_LABELS[loc]}</option>)}
              </select>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowScanner(v => !v)} className="shrink-0" title="Scan barcode">
                <BarcodeIcon className="h-4 w-4" />
              </Button>
              <Button type="submit" size="sm" className="shrink-0" disabled={adding}>
                <PlusIcon className="h-4 w-4" />
              </Button>
            </form>
            {showScanner && (
              <div className="p-3 bg-muted rounded-lg">
                <BarcodeScanner onDetected={onBarcodeDetected} onClose={() => setShowScanner(false)} />
              </div>
            )}
          </div>
        )}

        {stocktake && (
          <p className="text-sm text-muted-foreground">
            Walk the shelves and tap a status for anything that&apos;s changed.
          </p>
        )}

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <ShoppingBasketIcon className="h-10 w-10 opacity-30" />
            <p className="text-sm">Nothing in the pantry yet</p>
            <p className="text-xs text-center">Items appear automatically when you check off a shop —<br />or add your staples here to get started.</p>
          </div>
        ) : (
          PANTRY_LOCATIONS.map(loc => {
            const locItems = items
              .filter(i => i.location === loc)
              .sort((a, b) => a.name.localeCompare(b.name))
            if (locItems.length === 0) return null
            return (
              <div key={loc}>
                <h2 className="text-sm font-medium text-muted-foreground mb-1.5">{LOCATION_LABELS[loc]}</h2>
                <div className="divide-y divide-border/50 rounded-lg border border-border/60">
                  {locItems.map(item => (
                    <div key={item.id} className="flex items-center gap-2.5 px-3 py-2">
                      {stocktake ? (
                        <div className="flex gap-1 shrink-0">
                          {(['stocked', 'low', 'out'] as PantryStatus[]).map(s => (
                            <button
                              key={s}
                              onClick={() => setStatus(item, s)}
                              className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                                item.status === s
                                  ? `${STATUS_META[s].dot} text-white border-transparent`
                                  : 'hb-pill-inactive'
                              }`}
                            >
                              {STATUS_META[s].label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <button
                          onClick={() => setStatus(item, nextPantryStatus(item.status))}
                          className="shrink-0 p-1 -m-1"
                          title={`${STATUS_META[item.status].label} — tap to change`}
                        >
                          <span className={`block h-3.5 w-3.5 rounded-full ${STATUS_META[item.status].dot}`} />
                        </button>
                      )}
                      <span className={`flex-1 min-w-0 truncate text-sm ${item.status === 'out' ? 'text-muted-foreground' : ''}`}>
                        {item.name}
                      </span>
                      {item.expiryDate && (
                        <span className="shrink-0 text-xs text-muted-foreground" title="Expiry">
                          {fmtExpiry(item.expiryDate)}
                        </span>
                      )}
                      {!stocktake && (
                        <div className="flex gap-0.5 shrink-0">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(item)} title="Edit">
                            <PencilIcon className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => setDeleteId(item.id)} title="Delete">
                            <Trash2Icon className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>

      <Drawer open={editItem !== null} onOpenChange={open => { if (!open) setEditItem(null) }}>
        <DrawerContent className="sm:max-w-[480px]" showCloseButton={true}>
          <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
            <DrawerTitle>Edit pantry item</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pantry-name">Name</Label>
              <Input id="pantry-name" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pantry-location">Location</Label>
              <select
                id="pantry-location"
                value={editForm.location}
                onChange={e => setEditForm(f => ({ ...f, location: e.target.value as PantryLocation }))}
                className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
              >
                {PANTRY_LOCATIONS.map(loc => <option key={loc} value={loc}>{LOCATION_LABELS[loc]}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pantry-status">Status</Label>
              <select
                id="pantry-status"
                value={editForm.status}
                onChange={e => setEditForm(f => ({ ...f, status: e.target.value as PantryStatus }))}
                className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
              >
                {(['stocked', 'low', 'out'] as PantryStatus[]).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="pantry-staple"
                type="checkbox"
                checked={editForm.isStaple}
                onChange={e => setEditForm(f => ({ ...f, isStaple: e.target.checked }))}
                className="h-4 w-4"
              />
              <Label htmlFor="pantry-staple">Staple — keep suggesting when out</Label>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pantry-expiry">Expiry date (optional)</Label>
              <Input
                id="pantry-expiry"
                type="date"
                value={editForm.expiryDate}
                onChange={e => setEditForm(f => ({ ...f, expiryDate: e.target.value }))}
              />
            </div>
          </div>
          <DrawerFooter className="border-t border-border">
            <Button variant="outline" onClick={() => setEditItem(null)} disabled={savingEdit}>Cancel</Button>
            <Button onClick={saveEdit} disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save'}</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Dialog open={deleteId !== null} onOpenChange={open => { if (!open) setDeleteId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete pantry item?</DialogTitle>
            <DialogDescription>
              This removes &quot;{items.find(i => i.id === deleteId)?.name}&quot; from the pantry entirely. If you&apos;re just out of it, tap its status dot instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteItem}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
