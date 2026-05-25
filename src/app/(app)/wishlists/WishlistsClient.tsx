'use client'

import { useState, useCallback } from 'react'
import { PlusIcon, GiftIcon, Trash2Icon, PencilIcon, CheckIcon, ExternalLinkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PillNav } from '@/components/shared/PillNav'
import { toast } from 'sonner'

interface WishlistItem {
  id: string
  title: string
  url: string | null
  notes: string | null
  estimatedPrice: number | null
  occasion: string | null
  isPurchased: boolean
  purchasedAt: string | null
  contactId: string | null
  contact: { id: string; name: string } | null
  suggestedBy: { id: string; name: string } | null
  purchasedBy: { id: string; name: string } | null
  createdAt: string
}

interface ContactOption { id: string; name: string }

interface Props {
  initialItems: WishlistItem[]
  contacts: ContactOption[]
  members: { id: string; name: string }[]
  currentUserId: string
}

const OCCASIONS = [
  { value: 'general', label: '🎁 General' },
  { value: 'birthday', label: '🎂 Birthday' },
  { value: 'christmas', label: '🎄 Christmas' },
  { value: 'anniversary', label: '💍 Anniversary' },
  { value: 'other', label: '✨ Other' },
]

const OCCASION_LABELS: Record<string, string> = {
  general: '🎁 General',
  birthday: '🎂 Birthday',
  christmas: '🎄 Christmas',
  anniversary: '💍 Anniversary',
  other: '✨ Other',
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'To buy' },
  { id: 'purchased', label: 'Purchased' },
]

const emptyForm = {
  title: '',
  url: '',
  notes: '',
  estimatedPrice: '',
  occasion: 'general',
  contactId: '',
}

export function WishlistsClient({ initialItems, contacts }: Props) {
  const [items, setItems] = useState<WishlistItem[]>(initialItems)
  const [filter, setFilter] = useState('all')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openNew = () => {
    setEditId(null)
    setForm(emptyForm)
    setDrawerOpen(true)
  }

  const openEdit = (item: WishlistItem) => {
    setEditId(item.id)
    setForm({
      title: item.title,
      url: item.url ?? '',
      notes: item.notes ?? '',
      estimatedPrice: item.estimatedPrice != null ? String(item.estimatedPrice) : '',
      occasion: item.occasion ?? 'general',
      contactId: item.contactId ?? '',
    })
    setDrawerOpen(true)
  }

  const handleSave = useCallback(async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        url: form.url.trim() || null,
        notes: form.notes.trim() || null,
        estimatedPrice: form.estimatedPrice ? parseFloat(form.estimatedPrice) : null,
        occasion: form.occasion || null,
        contactId: form.contactId || null,
      }

      if (editId) {
        const res = await fetch(`/api/wishlists/${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Failed to update')
        const updated: WishlistItem = await res.json()
        setItems(prev => prev.map(i => i.id === editId ? updated : i))
        toast.success('Item updated')
      } else {
        const res = await fetch('/api/wishlists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Failed to create')
        const created: WishlistItem = await res.json()
        setItems(prev => [created, ...prev])
        toast.success('Item added')
      }
      setDrawerOpen(false)
    } catch {
      toast.error('Something went wrong')
    } finally {
      setSaving(false)
    }
  }, [form, editId])

  const togglePurchased = useCallback(async (item: WishlistItem) => {
    try {
      const res = await fetch(`/api/wishlists/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPurchased: !item.isPurchased }),
      })
      if (!res.ok) throw new Error()
      const updated: WishlistItem = await res.json()
      setItems(prev => prev.map(i => i.id === item.id ? updated : i))
      toast.success(updated.isPurchased ? 'Marked as purchased' : 'Marked as to buy')
    } catch {
      toast.error('Failed to update')
    }
  }, [])

  const handleDelete = useCallback(async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/wishlists/${deleteId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setItems(prev => prev.filter(i => i.id !== deleteId))
      toast.success('Item deleted')
      setDeleteId(null)
    } catch {
      toast.error('Failed to delete')
    } finally {
      setDeleting(false)
    }
  }, [deleteId])

  const filtered = items.filter(i => {
    if (filter === 'pending') return !i.isPurchased
    if (filter === 'purchased') return i.isPurchased
    return true
  })

  // Group by contact
  const grouped = filtered.reduce<Record<string, WishlistItem[]>>((acc, item) => {
    const key = item.contactId ?? '__general__'
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})

  const contactMap = new Map(contacts.map(c => [c.id, c.name]))

  const groupKeys = Object.keys(grouped).sort((a, b) => {
    if (a === '__general__') return -1
    if (b === '__general__') return 1
    return (contactMap.get(a) ?? '').localeCompare(contactMap.get(b) ?? '')
  })

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <GiftIcon className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Wishlist</h1>
        </div>
        <Button size="sm" onClick={openNew}>
          <PlusIcon className="h-4 w-4 mr-1" /> Add item
        </Button>
      </div>

      <div className="px-4 pb-3 shrink-0">
        <PillNav items={FILTERS} active={filter} onChange={setFilter} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {groupKeys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <GiftIcon className="h-10 w-10 opacity-30" />
            <p className="text-sm">No wishlist items yet</p>
          </div>
        ) : (
          groupKeys.map(key => {
            const groupItems = grouped[key]
            const label = key === '__general__' ? 'General / Family' : (contactMap.get(key) ?? 'Unknown')
            return (
              <div key={key} className="mb-6">
                <h2 className="text-sm font-medium text-muted-foreground mb-2">{label}</h2>
                <div className="space-y-2">
                  {groupItems.map(item => (
                    <Card key={item.id} className={item.isPurchased ? 'opacity-60' : ''}>
                      <CardContent className="py-3 px-4">
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => togglePurchased(item)}
                            className={`mt-0.5 shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                              item.isPurchased
                                ? 'bg-green-500 border-green-500 text-white'
                                : 'border-muted-foreground hover:border-primary'
                            }`}
                          >
                            {item.isPurchased && <CheckIcon className="h-3 w-3" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-medium text-sm ${item.isPurchased ? 'line-through text-muted-foreground' : ''}`}>
                                {item.title}
                              </span>
                              {item.occasion && item.occasion !== 'general' && (
                                <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium">
                                  {OCCASION_LABELS[item.occasion] ?? item.occasion}
                                </span>
                              )}
                              {item.estimatedPrice != null && (
                                <span className="text-xs text-muted-foreground">${item.estimatedPrice.toFixed(2)}</span>
                              )}
                            </div>
                            {item.notes && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.notes}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              {item.suggestedBy && (
                                <span>Suggested by {item.suggestedBy.name}</span>
                              )}
                              {item.isPurchased && item.purchasedBy && (
                                <span className="text-green-600">Purchased by {item.purchasedBy.name}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {item.url && (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                              >
                                <ExternalLinkIcon className="h-3.5 w-3.5" />
                              </a>
                            )}
                            <button
                              onClick={() => openEdit(item)}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                            >
                              <PencilIcon className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteId(item.id)}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                            >
                              <Trash2Icon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Add / Edit drawer */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="sm:max-w-[480px]" showCloseButton={true}>
          <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
            <DrawerTitle>{editId ? 'Edit item' : 'Add wishlist item'}</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wl-title">Title *</Label>
              <Input
                id="wl-title"
                value={form.title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Kindle Paperwhite"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wl-contact">For (person)</Label>
              <Select
                value={form.contactId || '__none__'}
                onValueChange={(v: string | null) => setForm(f => ({ ...f, contactId: v && v !== '__none__' ? v : '' }))}
              >
                <SelectTrigger id="wl-contact">
                  <SelectValue placeholder="General / Family" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">General / Family</SelectItem>
                  {contacts.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wl-occasion">Occasion</Label>
              <Select
                value={form.occasion}
                onValueChange={(v: string | null) => setForm(f => ({ ...f, occasion: v ?? 'general' }))}
              >
                <SelectTrigger id="wl-occasion">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OCCASIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wl-price">Estimated price ($)</Label>
              <Input
                id="wl-price"
                type="number"
                min="0"
                step="0.01"
                value={form.estimatedPrice}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, estimatedPrice: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wl-url">Link / URL</Label>
              <Input
                id="wl-url"
                value={form.url}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wl-notes">Notes</Label>
              <textarea
                id="wl-notes"
                value={form.notes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Size, colour, any details…"
                rows={3}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>
          <DrawerFooter className="border-t border-border">
            <Button variant="outline" onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editId ? 'Save changes' : 'Add item'}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Delete confirm */}
      <Drawer open={!!deleteId} onOpenChange={(open: boolean) => { if (!open) setDeleteId(null) }}>
        <DrawerContent className="sm:max-w-[400px]" showCloseButton={true}>
          <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
            <DrawerTitle>Delete item?</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 py-3 text-sm text-muted-foreground">
            This will permanently remove the wishlist item.
          </div>
          <DrawerFooter className="border-t border-border">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
